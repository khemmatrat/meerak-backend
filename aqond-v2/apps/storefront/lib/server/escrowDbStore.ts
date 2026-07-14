import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { EscrowAdapter } from '@aqond/return-core';
import type { EscrowHoldRecord } from '@aqond/return-core';
import {
  accruePlatformCommissionSqlite,
  releasePlatformCommissionSqlite,
  shouldAccrueMarketplaceCommission,
} from '@/lib/server/platformCommission';
import { creditWalletWithinSqliteTx } from '@/lib/server/merchantWalletTx';

const DB_FILE = path.join(process.cwd(), '.data', 'escrow.db');
const LEGACY_JSON = path.join(process.cwd(), '.data', 'escrow-holds.json');

export const ESCROW_STORAGE_BACKEND = 'sqlite' as const;

type HoldRow = {
  hold_id: string;
  order_id: string;
  amount_micro: number;
  reason: string;
  status: 'held' | 'released' | 'refunded';
  to_merchant_id: string | null;
  to_buyer_id: string | null;
  refund_reference: string | null;
  created_at: string;
  updated_at: string;
};

let db: DatabaseSync | null = null;
let adapter: EscrowAdapter | null = null;

function rowToRecord(row: HoldRow): EscrowHoldRecord {
  return {
    hold_id: row.hold_id,
    order_id: row.order_id,
    amount_micro: row.amount_micro,
    reason: row.reason,
    status: row.status,
    to_merchant_id: row.to_merchant_id || undefined,
    to_buyer_id: row.to_buyer_id || undefined,
    refund_reference: row.refund_reference || undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function initSchema(database: DatabaseSync) {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS escrow_holds (
      hold_id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      amount_micro INTEGER NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('held','released','refunded')),
      to_merchant_id TEXT,
      to_buyer_id TEXT,
      refund_reference TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_escrow_active_order
      ON escrow_holds(order_id) WHERE status = 'held';
    CREATE TABLE IF NOT EXISTS payment_capture_events (
      event_key TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      hold_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS order_auto_confirm_releases (
      order_id TEXT PRIMARY KEY,
      hold_id TEXT NOT NULL,
      merchant_id TEXT,
      amount_micro INTEGER NOT NULL,
      released_at TEXT NOT NULL,
      job_run_id TEXT
    );
    CREATE TABLE IF NOT EXISTS escrow_reconciliation_runs (
      run_id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      finished_at TEXT NOT NULL,
      held_count INTEGER NOT NULL,
      matched_count INTEGER NOT NULL,
      orphan_holds INTEGER NOT NULL,
      missing_holds INTEGER NOT NULL,
      amount_mismatches INTEGER NOT NULL,
      report_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS platform_commission_ledger (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      hold_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      gross_amount_micro INTEGER NOT NULL CHECK(gross_amount_micro >= 0),
      commission_rate REAL NOT NULL CHECK(commission_rate >= 0 AND commission_rate <= 1),
      commission_micro INTEGER NOT NULL CHECK(commission_micro >= 0),
      net_amount_micro INTEGER NOT NULL CHECK(net_amount_micro >= 0),
      status TEXT NOT NULL CHECK(status IN ('accrued','released')),
      created_at TEXT NOT NULL,
      released_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_commission_ledger_hold
      ON platform_commission_ledger(hold_id);
    CREATE INDEX IF NOT EXISTS idx_platform_commission_ledger_order
      ON platform_commission_ledger(order_id);
    CREATE INDEX IF NOT EXISTS idx_platform_commission_ledger_status
      ON platform_commission_ledger(status);
    CREATE TABLE IF NOT EXISTS merchant_wallet_balance (
      merchant_id TEXT PRIMARY KEY,
      available_micro INTEGER NOT NULL DEFAULT 0 CHECK(available_micro >= 0),
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS merchant_wallet_escrow_credits (
      order_id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      net_amount_micro INTEGER NOT NULL CHECK(net_amount_micro >= 0),
      credited_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_merchant_wallet_escrow_credits_merchant
      ON merchant_wallet_escrow_credits(merchant_id);
  `);
}

export function withImmediateTransaction<T>(database: DatabaseSync, fn: () => T): T;
export function withImmediateTransaction(database: DatabaseSync, fn: () => unknown) {
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function migrateLegacyJson(database: DatabaseSync) {
  const count = database.prepare('SELECT COUNT(*) AS c FROM escrow_holds').get() as { c: number };
  if (count.c > 0) return;
  if (!fs.existsSync(LEGACY_JSON)) return;
  try {
    const parsed = JSON.parse(fs.readFileSync(LEGACY_JSON, 'utf8')) as { holds?: EscrowHoldRecord[] };
    const insert = database.prepare(`
      INSERT OR IGNORE INTO escrow_holds
        (hold_id, order_id, amount_micro, reason, status, to_merchant_id, to_buyer_id, refund_reference, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    withImmediateTransaction(database, () => {
      for (const h of Array.isArray(parsed.holds) ? parsed.holds : []) {
        insert.run(
          h.hold_id,
          h.order_id,
          h.amount_micro,
          h.reason,
          h.status,
          h.to_merchant_id ?? null,
          h.to_buyer_id ?? null,
          h.refund_reference ?? null,
          h.created_at,
          h.updated_at,
        );
      }
    });
  } catch {
    /* ignore corrupt legacy file */
  }
}

export function getEscrowDatabase(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  db = new DatabaseSync(DB_FILE);
  initSchema(db);
  migrateLegacyJson(db);
  return db;
}

export function openEscrowDatabaseAt(filePath: string): DatabaseSync {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const database = new DatabaseSync(filePath);
  initSchema(database);
  return database;
}

export function closeEscrowDatabase() {
  if (db) {
    db.close();
    db = null;
  }
  adapter = null;
}

export function listEscrowHoldRecords(): EscrowHoldRecord[] {
  const rows = getEscrowDatabase()
    .prepare('SELECT * FROM escrow_holds ORDER BY created_at ASC')
    .all() as HoldRow[];
  return rows.map(rowToRecord);
}

export function sumActiveHeldMicro(orderId?: string): number {
  const database = getEscrowDatabase();
  if (orderId) {
    const row = database
      .prepare(`SELECT COALESCE(SUM(amount_micro), 0) AS total FROM escrow_holds WHERE order_id = ? AND status = 'held'`)
      .get(orderId) as { total: number };
    return row.total;
  }
  const row = database
    .prepare(`SELECT COALESCE(SUM(amount_micro), 0) AS total FROM escrow_holds WHERE status = 'held'`)
    .get() as { total: number };
  return row.total;
}

export function countActiveHolds(orderId: string, database: DatabaseSync = getEscrowDatabase()): number {
  const row = database
    .prepare(`SELECT COUNT(*) AS c FROM escrow_holds WHERE order_id = ? AND status = 'held'`)
    .get(orderId) as { c: number };
  return row.c;
}

export function getActiveHoldIdForOrder(database: DatabaseSync, orderId: string): string | null {
  const row = database
    .prepare(`SELECT hold_id FROM escrow_holds WHERE order_id = ? AND status = 'held'`)
    .get(orderId) as { hold_id: string } | undefined;
  return row?.hold_id ?? null;
}

export const MARKETPLACE_PAYMENT_ESCROW_REASON = 'marketplace_payment_s008';

export type OrderAutoConfirmReleaseResult = {
  released: boolean;
  duplicate: boolean;
  skipped?: boolean;
  skip_reason?: 'hold_not_held' | 'no_escrow_hold' | 'update_race';
  hold_id: string | null;
  order_id: string;
  error?: string;
};

function logAutoConfirmReleaseSkip(
  orderId: string,
  reason: OrderAutoConfirmReleaseResult['skip_reason'],
  extra?: Record<string, unknown>,
) {
  console.info('[order-auto-confirm] skip escrow release (defense in depth)', {
    order_id: orderId,
    skip_reason: reason,
    ...extra,
  });
}

export function releaseEscrowForOrderAutoConfirm(
  database: DatabaseSync,
  params: { order_id: string; merchant_id: string; amount_micro: number; job_run_id?: string },
): OrderAutoConfirmReleaseResult {
  return withImmediateTransaction(database, () => {
    const prior = database
      .prepare(`SELECT hold_id FROM order_auto_confirm_releases WHERE order_id = ?`)
      .get(params.order_id) as { hold_id: string } | undefined;
    if (prior) {
      return {
        released: true,
        duplicate: true,
        hold_id: prior.hold_id,
        order_id: params.order_id,
      };
    }

    const hold = database
      .prepare(`SELECT hold_id, status, amount_micro FROM escrow_holds WHERE order_id = ? AND status = 'held'`)
      .get(params.order_id) as { hold_id: string; status: string; amount_micro: number } | undefined;

    if (!hold) {
      const existing = database
        .prepare(
          `SELECT hold_id, status FROM escrow_holds WHERE order_id = ? ORDER BY updated_at DESC LIMIT 1`,
        )
        .get(params.order_id) as { hold_id: string; status: string } | undefined;
      if (existing && (existing.status === 'released' || existing.status === 'refunded')) {
        logAutoConfirmReleaseSkip(params.order_id, 'hold_not_held', {
          hold_id: existing.hold_id,
          hold_status: existing.status,
        });
        return {
          released: false,
          duplicate: false,
          skipped: true,
          skip_reason: 'hold_not_held',
          hold_id: existing.hold_id,
          order_id: params.order_id,
        };
      }
      logAutoConfirmReleaseSkip(params.order_id, 'no_escrow_hold');
      return {
        released: false,
        duplicate: false,
        skipped: true,
        skip_reason: 'no_escrow_hold',
        hold_id: null,
        order_id: params.order_id,
      };
    }

    const now = new Date().toISOString();
    const updateResult = database
      .prepare(
        `UPDATE escrow_holds SET status = 'released', to_merchant_id = ?, updated_at = ? WHERE hold_id = ? AND status = 'held'`,
      )
      .run(params.merchant_id, now, hold.hold_id);

    if (updateResult.changes === 0) {
      const current = database
        .prepare(`SELECT hold_id, status FROM escrow_holds WHERE hold_id = ?`)
        .get(hold.hold_id) as { hold_id: string; status: string } | undefined;
      logAutoConfirmReleaseSkip(params.order_id, 'update_race', {
        hold_id: hold.hold_id,
        hold_status: current?.status ?? 'unknown',
      });
      return {
        released: false,
        duplicate: false,
        skipped: true,
        skip_reason: 'update_race',
        hold_id: hold.hold_id,
        order_id: params.order_id,
      };
    }

    const commissionRelease = releasePlatformCommissionSqlite(database, hold.hold_id);
    const releaseAmountMicro =
      commissionRelease.net_amount_micro ?? hold.amount_micro ?? params.amount_micro;

    try {
      database
        .prepare(
          `INSERT INTO order_auto_confirm_releases (order_id, hold_id, merchant_id, amount_micro, released_at, job_run_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          params.order_id,
          hold.hold_id,
          params.merchant_id,
          releaseAmountMicro,
          now,
          params.job_run_id ?? null,
        );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('UNIQUE') || msg.includes('constraint')) {
        const again = database
          .prepare(`SELECT hold_id FROM order_auto_confirm_releases WHERE order_id = ?`)
          .get(params.order_id) as { hold_id: string } | undefined;
        return {
          released: true,
          duplicate: true,
          hold_id: again?.hold_id ?? hold.hold_id,
          order_id: params.order_id,
        };
      }
      throw error;
    }

    // Finding A: credit within the SAME transaction as the release — atomic, not fire-and-forget.
    creditWalletWithinSqliteTx(database, {
      merchantId: params.merchant_id,
      orderId: params.order_id,
      netAmountMicro: releaseAmountMicro,
    });

    return {
      released: true,
      duplicate: false,
      hold_id: hold.hold_id,
      order_id: params.order_id,
    };
  }) as OrderAutoConfirmReleaseResult;
}

export function countAutoConfirmReleases(orderId: string, database: DatabaseSync = getEscrowDatabase()): number {
  const row = database
    .prepare(`SELECT COUNT(*) AS c FROM order_auto_confirm_releases WHERE order_id = ?`)
    .get(orderId) as { c: number };
  return row.c;
}

export function holdEscrowForOrder(
  database: DatabaseSync,
  params: {
    order_id: string;
    amount_micro: number;
    reason: string;
    event_key?: string;
    merchant_id?: string;
  },
): { hold_id: string; duplicate: boolean } {
  return withImmediateTransaction(database, () => {
    if (params.event_key) {
      const prior = database
        .prepare(`SELECT hold_id FROM payment_capture_events WHERE event_key = ?`)
        .get(params.event_key) as { hold_id: string } | undefined;
      if (prior) return { hold_id: prior.hold_id, duplicate: true };
    }

    const active = database
      .prepare(`SELECT hold_id FROM escrow_holds WHERE order_id = ? AND status = 'held'`)
      .get(params.order_id) as { hold_id: string } | undefined;
    if (active) {
      if (params.event_key) {
        database
          .prepare(
            `INSERT OR IGNORE INTO payment_capture_events (event_key, order_id, hold_id, created_at) VALUES (?, ?, ?, ?)`,
          )
          .run(params.event_key, params.order_id, active.hold_id, new Date().toISOString());
      }
      return { hold_id: active.hold_id, duplicate: true };
    }

    const hold_id = `esc-${params.order_id.slice(-10)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    database
      .prepare(
        `INSERT INTO escrow_holds
          (hold_id, order_id, amount_micro, reason, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'held', ?, ?)`,
      )
      .run(hold_id, params.order_id, params.amount_micro, params.reason, now, now);

    if (params.event_key) {
      database
        .prepare(
          `INSERT INTO payment_capture_events (event_key, order_id, hold_id, created_at) VALUES (?, ?, ?, ?)`,
        )
        .run(params.event_key, params.order_id, hold_id, now);
    }

    if (
      params.merchant_id &&
      shouldAccrueMarketplaceCommission(params.reason)
    ) {
      accruePlatformCommissionSqlite(database, {
        order_id: params.order_id,
        hold_id,
        merchant_id: params.merchant_id,
        gross_amount_micro: params.amount_micro,
      });
    }

    return { hold_id, duplicate: false };
  }) as { hold_id: string; duplicate: boolean };
}

function holdInDatabase(database: DatabaseSync, params: { order_id: string; amount_micro: number; reason: string }) {
  const result = holdEscrowForOrder(database, params);
  return { hold_id: result.hold_id };
}

export function createEscrowDbAdapter(database: DatabaseSync = getEscrowDatabase()): EscrowAdapter {
  return {
    async hold(params) {
      return holdInDatabase(database, params);
    },
    async release(params) {
      return withImmediateTransaction(database, () => {
        const hit = database
          .prepare(`SELECT hold_id, status FROM escrow_holds WHERE hold_id = ?`)
          .get(params.hold_id) as { hold_id: string; status: string } | undefined;
        if (!hit) throw new Error('escrow_hold_not_found');
        if (hit.status !== 'held') return { status: hit.status as 'released' | 'refunded' };
        const now = new Date().toISOString();
        const updateResult = database
          .prepare(
            `UPDATE escrow_holds SET status = 'released', to_merchant_id = ?, updated_at = ? WHERE hold_id = ? AND status = 'held'`,
          )
          .run(params.to_merchant_id, now, params.hold_id);
        if (updateResult.changes === 0) {
          const current = database
            .prepare(`SELECT status FROM escrow_holds WHERE hold_id = ?`)
            .get(params.hold_id) as { status: string } | undefined;
          if (current?.status === 'released') return { status: 'released' as const };
          throw new Error('escrow_release_race');
        }
        const commissionRelease = releasePlatformCommissionSqlite(database, params.hold_id);
        const holdMeta = database
          .prepare(`SELECT order_id, amount_micro FROM escrow_holds WHERE hold_id = ?`)
          .get(params.hold_id) as { order_id: string; amount_micro: number };
        const netAmountMicro =
          commissionRelease.net_amount_micro ?? holdMeta?.amount_micro ?? 0;
        // Finding A: credit within the SAME transaction as the release — atomic, not fire-and-forget.
        if (holdMeta?.order_id) {
          creditWalletWithinSqliteTx(database, {
            merchantId: params.to_merchant_id,
            orderId: holdMeta.order_id,
            netAmountMicro,
          });
        }
        return { status: 'released' as const };
      });
    },
    async refund(params) {
      return withImmediateTransaction(database, () => {
        const hit = database
          .prepare(`SELECT hold_id, status FROM escrow_holds WHERE hold_id = ?`)
          .get(params.hold_id) as { hold_id: string; status: string } | undefined;
        if (!hit) throw new Error('escrow_hold_not_found');
        if (hit.status === 'refunded') {
          const ref = database
            .prepare(`SELECT refund_reference FROM escrow_holds WHERE hold_id = ?`)
            .get(params.hold_id) as { refund_reference: string | null };
          return { status: 'refunded' as const, reference: ref.refund_reference || undefined };
        }
        if (hit.status !== 'held') throw new Error('escrow_hold_not_active');
        const reference = `RF-${Date.now().toString(36)}`;
        const now = new Date().toISOString();
        database
          .prepare(
            `UPDATE escrow_holds SET status = 'refunded', to_buyer_id = ?, refund_reference = ?, updated_at = ? WHERE hold_id = ? AND status = 'held'`,
          )
          .run(params.to_buyer_id, reference, now, params.hold_id);
        return { status: 'refunded' as const, reference };
      });
    },
  };
}

export function getEscrowDbAdapter(): EscrowAdapter {
  if (!adapter) adapter = createEscrowDbAdapter();
  return adapter;
}

/** Dev/CI — parallel holds on one order must not double-count escrow. */
export async function runEscrowConcurrentSelfTest(options?: { workers?: number; orderId?: string }) {
  const workers = options?.workers ?? 32;
  const orderId = options?.orderId ?? `ord-concurrent-${Date.now().toString(36)}`;
  const amountMicro = 250000;
  const tempDb = path.join(process.cwd(), '.data', `escrow-selftest-${process.pid}.db`);
  try {
    if (fs.existsSync(tempDb)) fs.unlinkSync(tempDb);
  } catch {
    /* ignore */
  }

  const runWorker = async (workerIndex: number) => {
    const database = openEscrowDatabaseAt(tempDb);
    const escrow = createEscrowDbAdapter(database);
    try {
      return await escrow.hold({
        order_id: orderId,
        amount_micro: amountMicro + workerIndex,
        reason: 'concurrent_self_test',
      });
    } finally {
      database.close();
    }
  };

  const results = await Promise.all(Array.from({ length: workers }, (_, i) => runWorker(i)));
  const verifyDb = openEscrowDatabaseAt(tempDb);
  const activeRows = verifyDb
    .prepare(`SELECT hold_id, amount_micro FROM escrow_holds WHERE order_id = ? AND status = 'held'`)
    .all(orderId) as { hold_id: string; amount_micro: number }[];
  verifyDb.close();

  const uniqueHoldIds = new Set(results.map((r) => r.hold_id));
  const pass = activeRows.length === 1 && uniqueHoldIds.size === 1;

  try {
    fs.unlinkSync(tempDb);
  } catch {
    /* ignore */
  }

  return {
    pass,
    workers,
    order_id: orderId,
    hold_ids: [...uniqueHoldIds],
    active_hold_count: activeRows.length,
    held_amount_micro: activeRows[0]?.amount_micro ?? 0,
  };
}

export function resetEscrowDbForTests() {
  closeEscrowDatabase();
  for (const file of [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`]) {
    try {
      fs.unlinkSync(file);
    } catch {
      /* ignore */
    }
  }
}
