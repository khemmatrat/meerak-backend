/**
 * Pure within-transaction merchant-wallet credit helpers (no imports from escrow stores, so
 * escrowDbStore/escrowPgStore can call these inside their own release transactions without a
 * circular import). All functions operate on a caller-provided db handle / tx client and do NOT
 * open or commit transactions themselves.
 *
 * Finding A fix: because the wallet tables live in the SAME database as escrow, credit is applied
 * inside the escrow-release transaction — atomic with the release, not fire-and-forget.
 */
import type { DatabaseSync } from 'node:sqlite';
import type { PoolClient } from 'pg';

export type WalletCreditParams = {
  merchantId: string;
  orderId: string;
  netAmountMicro: number;
};

export type WalletCreditResult = {
  credited: boolean;
  duplicate: boolean;
  available_micro: number;
};

// ---------------------------------------------------------------------------
// SQLite (synchronous — runs inside the caller's BEGIN IMMEDIATE transaction)
// ---------------------------------------------------------------------------

export function readAvailableSqlite(database: DatabaseSync, merchantId: string): number {
  const row = database
    .prepare('SELECT available_micro FROM merchant_wallet_balance WHERE merchant_id = ?')
    .get(merchantId) as { available_micro: number } | undefined;
  return Number(row?.available_micro ?? 0);
}

export function creditWalletWithinSqliteTx(
  database: DatabaseSync,
  params: WalletCreditParams,
  nowIso = new Date().toISOString(),
): WalletCreditResult {
  if (params.netAmountMicro <= 0) {
    return { credited: false, duplicate: false, available_micro: readAvailableSqlite(database, params.merchantId) };
  }
  const inserted = database
    .prepare(
      `INSERT OR IGNORE INTO merchant_wallet_escrow_credits (order_id, merchant_id, net_amount_micro, credited_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(params.orderId, params.merchantId, params.netAmountMicro, nowIso);

  if (inserted.changes === 0) {
    return { credited: false, duplicate: true, available_micro: readAvailableSqlite(database, params.merchantId) };
  }

  database
    .prepare(
      `INSERT INTO merchant_wallet_balance (merchant_id, available_micro, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(merchant_id) DO UPDATE SET
         available_micro = available_micro + excluded.available_micro,
         updated_at = excluded.updated_at`,
    )
    .run(params.merchantId, params.netAmountMicro, nowIso);

  return { credited: true, duplicate: false, available_micro: readAvailableSqlite(database, params.merchantId) };
}

export function addAvailableWithinSqliteTx(
  database: DatabaseSync,
  merchantId: string,
  deltaMicro: number,
  nowIso = new Date().toISOString(),
): number {
  database
    .prepare(
      `INSERT INTO merchant_wallet_balance (merchant_id, available_micro, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(merchant_id) DO UPDATE SET
         available_micro = available_micro + excluded.available_micro,
         updated_at = excluded.updated_at`,
    )
    .run(merchantId, deltaMicro, nowIso);
  return readAvailableSqlite(database, merchantId);
}

// ---------------------------------------------------------------------------
// Postgres (runs inside the caller's transaction client)
// ---------------------------------------------------------------------------

export async function readAvailablePg(tx: PoolClient, merchantId: string): Promise<number> {
  const res = await tx.query('SELECT available_micro FROM merchant_wallet_balance WHERE merchant_id = $1', [
    merchantId,
  ]);
  return Number(res.rows[0]?.available_micro ?? 0);
}

export async function creditWalletWithinPgTx(tx: PoolClient, params: WalletCreditParams): Promise<WalletCreditResult> {
  if (params.netAmountMicro <= 0) {
    return { credited: false, duplicate: false, available_micro: await readAvailablePg(tx, params.merchantId) };
  }
  const inserted = await tx.query(
    `INSERT INTO merchant_wallet_escrow_credits (order_id, merchant_id, net_amount_micro)
     VALUES ($1, $2, $3)
     ON CONFLICT (order_id) DO NOTHING`,
    [params.orderId, params.merchantId, params.netAmountMicro],
  );

  if ((inserted.rowCount ?? 0) === 0) {
    return { credited: false, duplicate: true, available_micro: await readAvailablePg(tx, params.merchantId) };
  }

  await tx.query(
    `INSERT INTO merchant_wallet_balance (merchant_id, available_micro, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (merchant_id) DO UPDATE SET
       available_micro = merchant_wallet_balance.available_micro + EXCLUDED.available_micro,
       updated_at = NOW()`,
    [params.merchantId, params.netAmountMicro],
  );

  return { credited: true, duplicate: false, available_micro: await readAvailablePg(tx, params.merchantId) };
}

export async function addAvailableWithinPgTx(tx: PoolClient, merchantId: string, deltaMicro: number): Promise<number> {
  await tx.query(
    `INSERT INTO merchant_wallet_balance (merchant_id, available_micro, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (merchant_id) DO UPDATE SET
       available_micro = merchant_wallet_balance.available_micro + EXCLUDED.available_micro,
       updated_at = NOW()`,
    [merchantId, deltaMicro],
  );
  return readAvailablePg(tx, merchantId);
}
