/**
 * Transactional merchant-wallet store on the same backend as escrow (SQLite / Postgres).
 *
 * Finding D fix: `available_micro` is the authoritative accumulated balance in the DB, mutated
 * only via atomic `available_micro = available_micro + ?` under a row lock; credit idempotency is
 * enforced by a DB unique constraint on order_id (merchant_wallet_escrow_credits).
 *
 * Finding A fix: escrow release credits the wallet inside its own transaction (see
 * merchantWalletTx.ts), and reconcileMerchantWalletCredits() self-heals any historical drift
 * (e.g. from the old fire-and-forget era) by crediting released holds that were never credited.
 */
import type { DatabaseSync } from 'node:sqlite';
import type { PoolClient } from 'pg';
import { getEscrowStorageBackend } from '@/lib/server/escrowStore';
import { getEscrowDatabase as getSqliteEscrowDb, withImmediateTransaction } from '@/lib/server/escrowDbStore';
import { getEscrowPgPool, withPgTransaction } from '@/lib/server/escrowPgStore';
import {
  addAvailableWithinPgTx,
  addAvailableWithinSqliteTx,
  creditWalletWithinPgTx,
  creditWalletWithinSqliteTx,
  readAvailablePg,
  readAvailableSqlite,
  type WalletCreditParams,
  type WalletCreditResult,
} from '@/lib/server/merchantWalletTx';

export type { WalletCreditParams, WalletCreditResult } from '@/lib/server/merchantWalletTx';
export {
  creditWalletWithinPgTx,
  creditWalletWithinSqliteTx,
} from '@/lib/server/merchantWalletTx';

// ---------------------------------------------------------------------------
// Backend-dispatched public API (standalone transactions)
// ---------------------------------------------------------------------------

export async function getWalletAvailableMicro(merchantId: string, database?: DatabaseSync): Promise<number> {
  if (database) return readAvailableSqlite(database, merchantId);
  if (getEscrowStorageBackend() === 'postgres') {
    return withPgTransaction((tx) => readAvailablePg(tx, merchantId));
  }
  return readAvailableSqlite(getSqliteEscrowDb(), merchantId);
}

/** Idempotent credit of merchant available balance for an escrow release (own transaction). */
export async function creditWalletForEscrowRelease(
  params: WalletCreditParams,
  database?: DatabaseSync,
): Promise<WalletCreditResult> {
  if (params.netAmountMicro <= 0) {
    const available = await getWalletAvailableMicro(params.merchantId, database);
    return { credited: false, duplicate: false, available_micro: available };
  }
  if (database) {
    return withImmediateTransaction(database, () => creditWalletWithinSqliteTx(database, params));
  }
  if (getEscrowStorageBackend() === 'postgres') {
    return withPgTransaction((tx) => creditWalletWithinPgTx(tx, params));
  }
  const db = getSqliteEscrowDb();
  return withImmediateTransaction(db, () => creditWalletWithinSqliteTx(db, params));
}

/** Non-idempotent atomic add to available (admin settle / dispute release). */
export async function addWalletAvailableMicro(
  merchantId: string,
  deltaMicro: number,
  database?: DatabaseSync,
): Promise<number> {
  const delta = Math.max(0, Math.floor(deltaMicro));
  if (delta === 0) return getWalletAvailableMicro(merchantId, database);
  if (database) {
    return withImmediateTransaction(database, () => addAvailableWithinSqliteTx(database, merchantId, delta));
  }
  if (getEscrowStorageBackend() === 'postgres') {
    return withPgTransaction((tx) => addAvailableWithinPgTx(tx, merchantId, delta));
  }
  const db = getSqliteEscrowDb();
  return withImmediateTransaction(db, () => addAvailableWithinSqliteTx(db, merchantId, delta));
}

/**
 * Seed a merchant's available balance only if no row exists yet (idempotent). Used once to
 * carry forward the legacy JSON balance into the DB store without ever double-counting.
 */
export async function seedWalletAvailableIfAbsent(
  merchantId: string,
  availableMicro: number,
  database?: DatabaseSync,
): Promise<void> {
  const amount = Math.max(0, Math.floor(availableMicro));
  if (amount === 0) return;
  const nowIso = new Date().toISOString();
  if (database) {
    database
      .prepare(
        `INSERT INTO merchant_wallet_balance (merchant_id, available_micro, updated_at)
         VALUES (?, ?, ?) ON CONFLICT(merchant_id) DO NOTHING`,
      )
      .run(merchantId, amount, nowIso);
    return;
  }
  if (getEscrowStorageBackend() === 'postgres') {
    await withPgTransaction((tx) =>
      tx.query(
        `INSERT INTO merchant_wallet_balance (merchant_id, available_micro)
         VALUES ($1, $2) ON CONFLICT (merchant_id) DO NOTHING`,
        [merchantId, amount],
      ),
    );
    return;
  }
  const db = getSqliteEscrowDb();
  db.prepare(
    `INSERT INTO merchant_wallet_balance (merchant_id, available_micro, updated_at)
     VALUES (?, ?, ?) ON CONFLICT(merchant_id) DO NOTHING`,
  ).run(merchantId, amount, nowIso);
}

// ---------------------------------------------------------------------------
// Reconciliation — self-heal missing credits (Finding A: no carry-forward drift)
// ---------------------------------------------------------------------------

type PendingCredit = { orderId: string; merchantId: string; netAmountMicro: number };

/**
 * Released holds assigned to a merchant that have no corresponding wallet credit yet. The net
 * amount matches the credit path exactly: platform-commission net when present, else the full
 * hold amount. Keyed by order_id, so reconciliation is idempotent w.r.t. the credits table.
 */
async function listUncreditedReleases(merchantId?: string, database?: DatabaseSync): Promise<PendingCredit[]> {
  if (database || getEscrowStorageBackend() !== 'postgres') {
    const db = database ?? getSqliteEscrowDb();
    const rows = db
      .prepare(
        `SELECT h.order_id AS order_id,
                h.to_merchant_id AS merchant_id,
                COALESCE(l.net_amount_micro, h.amount_micro) AS net_micro
           FROM escrow_holds h
           LEFT JOIN platform_commission_ledger l ON l.hold_id = h.hold_id
          WHERE h.status = 'released'
            AND h.to_merchant_id IS NOT NULL
            ${merchantId ? 'AND h.to_merchant_id = ?' : ''}
            AND h.order_id NOT IN (SELECT order_id FROM merchant_wallet_escrow_credits)`,
      )
      .all(...(merchantId ? [merchantId] : [])) as Array<{
      order_id: string;
      merchant_id: string;
      net_micro: number;
    }>;
    return rows.map((r) => ({
      orderId: r.order_id,
      merchantId: r.merchant_id,
      netAmountMicro: Number(r.net_micro ?? 0),
    }));
  }

  const res = await getEscrowPgPool().query(
    `SELECT h.order_id AS order_id,
            h.to_merchant_id AS merchant_id,
            COALESCE(l.net_amount_micro, h.amount_micro) AS net_micro
       FROM escrow_holds h
       LEFT JOIN platform_commission_ledger l ON l.hold_id = h.hold_id
      WHERE h.status = 'released'
        AND h.to_merchant_id IS NOT NULL
        ${merchantId ? 'AND h.to_merchant_id = $1' : ''}
        AND h.order_id NOT IN (SELECT order_id FROM merchant_wallet_escrow_credits)`,
    merchantId ? [merchantId] : [],
  );
  return res.rows.map((r: { order_id: string; merchant_id: string; net_micro: string | number }) => ({
    orderId: r.order_id,
    merchantId: r.merchant_id,
    netAmountMicro: Number(r.net_micro ?? 0),
  }));
}

export async function reconcileMerchantWalletCredits(
  merchantId?: string,
  database?: DatabaseSync,
): Promise<{ checked: number; healed: number; healed_amount_micro: number }> {
  const pending = await listUncreditedReleases(merchantId, database);
  let healed = 0;
  let healedAmount = 0;
  for (const p of pending) {
    if (p.netAmountMicro <= 0) continue;
    const result = await creditWalletForEscrowRelease(p, database);
    if (result.credited) {
      healed += 1;
      healedAmount += p.netAmountMicro;
    }
  }
  return { checked: pending.length, healed, healed_amount_micro: healedAmount };
}

// ---------------------------------------------------------------------------
// Concurrent self-test (no lost update / idempotency under concurrency)
// ---------------------------------------------------------------------------

export async function runWalletCreditConcurrentSelfTest(options?: {
  workers?: number;
  merchantId?: string;
  database?: DatabaseSync;
}) {
  const workers = Math.max(2, options?.workers ?? 20);
  const backend = getEscrowStorageBackend();
  const merchantId = options?.merchantId ?? `wallet-concurrent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const database = options?.database;
  const perCredit = 1000;

  const distinct = Array.from({ length: workers }, (_, i) => ({
    merchantId,
    orderId: `${merchantId}-o${i}`,
    netAmountMicro: perCredit,
  }));
  const phase1Results = await Promise.all(distinct.map((p) => creditWalletForEscrowRelease(p, database)));
  const phase1Available = await getWalletAvailableMicro(merchantId, database);
  const phase1Expected = workers * perCredit;
  const phase1Credited = phase1Results.filter((r) => r.credited).length;

  const dupOrder = `${merchantId}-dup`;
  const dupAmount = 5000;
  const phase2Results = await Promise.all(
    Array.from({ length: workers }, () =>
      creditWalletForEscrowRelease({ merchantId, orderId: dupOrder, netAmountMicro: dupAmount }, database),
    ),
  );
  const phase2Available = await getWalletAvailableMicro(merchantId, database);
  const phase2Expected = phase1Expected + dupAmount;
  const phase2Credited = phase2Results.filter((r) => r.credited).length;

  const pass =
    phase1Available === phase1Expected &&
    phase1Credited === workers &&
    phase2Available === phase2Expected &&
    phase2Credited === 1;

  return {
    pass,
    backend,
    workers,
    merchant_id: merchantId,
    phase1_distinct: { expected: phase1Expected, actual: phase1Available, credited: phase1Credited },
    phase2_idempotent: {
      expected: phase2Expected,
      actual: phase2Available,
      credited: phase2Credited,
      expected_credited: 1,
    },
  };
}

// ---------------------------------------------------------------------------
// Reconciliation self-test — a released hold whose credit was "lost" is healed
// ---------------------------------------------------------------------------

async function insertReleasedHoldWithoutCredit(params: {
  merchantId: string;
  orderId: string;
  amountMicro: number;
  database?: DatabaseSync;
}): Promise<void> {
  const holdId = `esc-recon-${params.orderId.slice(-8)}-${Math.random().toString(36).slice(2, 6)}`;
  const nowIso = new Date().toISOString();
  if (params.database || getEscrowStorageBackend() !== 'postgres') {
    const db = params.database ?? getSqliteEscrowDb();
    db.prepare(
      `INSERT INTO escrow_holds (hold_id, order_id, amount_micro, reason, status, to_merchant_id, created_at, updated_at)
       VALUES (?, ?, ?, 'marketplace_payment_hold', 'released', ?, ?, ?)`,
    ).run(holdId, params.orderId, params.amountMicro, params.merchantId, nowIso, nowIso);
    return;
  }
  await getEscrowPgPool().query(
    `INSERT INTO escrow_holds (hold_id, order_id, amount_micro, reason, status, to_merchant_id, created_at, updated_at)
     VALUES ($1, $2, $3, 'marketplace_payment_hold', 'released', $4, NOW(), NOW())`,
    [holdId, params.orderId, params.amountMicro, params.merchantId],
  );
}

/**
 * Simulate the pre-fix failure mode: an escrow hold is released (money left escrow) but the
 * merchant credit was lost (fire-and-forget rejection / crash). Reconciliation must credit the
 * missing amount exactly once and be idempotent on re-run.
 */
export async function runWalletReconcileSelfTest(options?: { database?: DatabaseSync }) {
  const backend = getEscrowStorageBackend();
  const database = options?.database;
  const merchantId = `wallet-recon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const orderId = `${merchantId}-ord`;
  const netMicro = 77_000;

  const availableBefore = await getWalletAvailableMicro(merchantId, database);
  await insertReleasedHoldWithoutCredit({ merchantId, orderId, amountMicro: netMicro, database });

  const firstRun = await reconcileMerchantWalletCredits(merchantId, database);
  const availableAfterFirst = await getWalletAvailableMicro(merchantId, database);

  const secondRun = await reconcileMerchantWalletCredits(merchantId, database);
  const availableAfterSecond = await getWalletAvailableMicro(merchantId, database);

  const pass =
    availableBefore === 0 &&
    firstRun.healed === 1 &&
    firstRun.healed_amount_micro === netMicro &&
    availableAfterFirst === netMicro &&
    secondRun.healed === 0 &&
    availableAfterSecond === netMicro;

  return {
    pass,
    backend,
    merchant_id: merchantId,
    order_id: orderId,
    net_micro: netMicro,
    available_before: availableBefore,
    first_run: firstRun,
    available_after_first: availableAfterFirst,
    second_run: secondRun,
    available_after_second: availableAfterSecond,
  };
}
