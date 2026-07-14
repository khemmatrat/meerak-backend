import type { EscrowAdapter } from '@aqond/return-core';
import type { EscrowHoldRecord } from '@aqond/return-core';
import pg from 'pg';
import type { Pool, PoolClient } from 'pg';
import {
  MARKETPLACE_PAYMENT_ESCROW_REASON,
  type OrderAutoConfirmReleaseResult,
} from '@/lib/server/escrowDbStore';
import {
  accruePlatformCommissionPg,
  releasePlatformCommissionPg,
  shouldAccrueMarketplaceCommission,
} from '@/lib/server/platformCommission';
import { creditWalletWithinPgTx } from '@/lib/server/merchantWalletTx';

export { MARKETPLACE_PAYMENT_ESCROW_REASON };
export type { OrderAutoConfirmReleaseResult };

let pool: Pool | null = null;
let adapter: EscrowAdapter | null = null;

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

function rowToRecord(row: HoldRow): EscrowHoldRecord {
  return {
    hold_id: row.hold_id,
    order_id: row.order_id,
    amount_micro: Number(row.amount_micro),
    reason: row.reason,
    status: row.status,
    to_merchant_id: row.to_merchant_id || undefined,
    to_buyer_id: row.to_buyer_id || undefined,
    refund_reference: row.refund_reference || undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function pgUrl(): string {
  const url =
    process.env.STOREFRONT_PG_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    '';
  if (!url) {
    throw new Error('STOREFRONT_PG_URL required when ESCROW_STORAGE_BACKEND=postgres');
  }
  return url;
}

export function getEscrowPgPool(): Pool {
  if (pool) return pool;
  pool = new pg.Pool({ connectionString: pgUrl(), max: 10 });
  return pool;
}

export async function closeEscrowPgPool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
  adapter = null;
}

export async function withPgTransaction<T>(fn: (client: PoolClient) => Promise<T>, client?: PoolClient): Promise<T> {
  if (client) return fn(client);
  const p = getEscrowPgPool();
  const conn = await p.connect();
  try {
    await conn.query('BEGIN');
    const result = await fn(conn);
    await conn.query('COMMIT');
    return result;
  } catch (error) {
    await conn.query('ROLLBACK');
    throw error;
  } finally {
    conn.release();
  }
}

function isPgUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === '23505';
}

async function lockOrderEscrow(tx: PoolClient, orderId: string) {
  await tx.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [orderId]);
}

async function duplicateAutoConfirmIfAudited(
  tx: PoolClient,
  orderId: string,
): Promise<OrderAutoConfirmReleaseResult | null> {
  const again = await tx.query(`SELECT hold_id FROM order_auto_confirm_releases WHERE order_id = $1`, [orderId]);
  if (!again.rows[0]?.hold_id) return null;
  return {
    released: true,
    duplicate: true,
    hold_id: again.rows[0].hold_id as string,
    order_id: orderId,
  };
}

function logAutoConfirmReleaseSkip(
  orderId: string,
  reason: OrderAutoConfirmReleaseResult['skip_reason'],
  extra?: Record<string, unknown>,
) {
  console.info('[order-auto-confirm] skip escrow release (defense in depth)', {
    order_id: orderId,
    skip_reason: reason,
    backend: 'postgres',
    ...extra,
  });
}

export async function listEscrowHoldRecordsPg(): Promise<EscrowHoldRecord[]> {
  const res = await getEscrowPgPool().query(`SELECT * FROM escrow_holds ORDER BY created_at ASC`);
  return res.rows.map((row) => rowToRecord(row as HoldRow));
}

export async function countActiveHoldsPg(orderId: string, client?: PoolClient): Promise<number> {
  const run = client
    ? (sql: string, params: unknown[]) => client.query(sql, params)
    : (sql: string, params: unknown[]) => getEscrowPgPool().query(sql, params);
  const res = await run(`SELECT COUNT(*)::int AS c FROM escrow_holds WHERE order_id = $1 AND status = 'held'`, [
    orderId,
  ]);
  return Number(res.rows[0]?.c ?? 0);
}

export async function getActiveHoldIdForOrderPg(
  orderId: string,
  client?: PoolClient,
): Promise<string | null> {
  const run = client
    ? (sql: string, params: unknown[]) => client.query(sql, params)
    : (sql: string, params: unknown[]) => getEscrowPgPool().query(sql, params);
  const res = await run(
    `SELECT hold_id FROM escrow_holds WHERE order_id = $1 AND status = 'held' LIMIT 1`,
    [orderId],
  );
  return res.rows[0]?.hold_id ?? null;
}

export async function holdEscrowForOrderPg(
  params: {
    order_id: string;
    amount_micro: number;
    reason: string;
    event_key?: string;
    merchant_id?: string;
  },
  client?: PoolClient,
): Promise<{ hold_id: string; duplicate: boolean }> {
  return withPgTransaction(async (tx) => {
    await lockOrderEscrow(tx, params.order_id);

    if (params.event_key) {
      const prior = await tx.query(`SELECT hold_id FROM payment_capture_events WHERE event_key = $1`, [
        params.event_key,
      ]);
      if (prior.rows[0]?.hold_id) {
        return { hold_id: prior.rows[0].hold_id as string, duplicate: true };
      }
    }

    const active = await tx.query(
      `SELECT hold_id FROM escrow_holds WHERE order_id = $1 AND status = 'held' FOR UPDATE`,
      [params.order_id],
    );
    if (active.rows[0]?.hold_id) {
      const holdId = active.rows[0].hold_id as string;
      if (params.event_key) {
        await tx.query(
          `INSERT INTO payment_capture_events (event_key, order_id, hold_id) VALUES ($1, $2, $3)
           ON CONFLICT (event_key) DO NOTHING`,
          [params.event_key, params.order_id, holdId],
        );
      }
      return { hold_id: holdId, duplicate: true };
    }

    const hold_id = `esc-${params.order_id.slice(-10)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    try {
      await tx.query(
        `INSERT INTO escrow_holds
          (hold_id, order_id, amount_micro, reason, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'held', NOW(), NOW())`,
        [hold_id, params.order_id, params.amount_micro, params.reason],
      );
    } catch (error: unknown) {
      if (isPgUniqueViolation(error)) {
        const again = await tx.query(
          `SELECT hold_id FROM escrow_holds WHERE order_id = $1 AND status = 'held' LIMIT 1`,
          [params.order_id],
        );
        const existingId = again.rows[0]?.hold_id as string | undefined;
        if (existingId) {
          if (params.event_key) {
            await tx.query(
              `INSERT INTO payment_capture_events (event_key, order_id, hold_id) VALUES ($1, $2, $3)
               ON CONFLICT (event_key) DO NOTHING`,
              [params.event_key, params.order_id, existingId],
            );
          }
          return { hold_id: existingId, duplicate: true };
        }
      }
      throw error;
    }

    if (params.event_key) {
      await tx.query(
        `INSERT INTO payment_capture_events (event_key, order_id, hold_id) VALUES ($1, $2, $3)`,
        [params.event_key, params.order_id, hold_id],
      );
    }

    if (params.merchant_id && shouldAccrueMarketplaceCommission(params.reason)) {
      await accruePlatformCommissionPg(tx, {
        order_id: params.order_id,
        hold_id,
        merchant_id: params.merchant_id,
        gross_amount_micro: params.amount_micro,
      });
    }

    return { hold_id, duplicate: false };
  }, client);
}

export async function releaseEscrowForOrderAutoConfirmPg(
  params: { order_id: string; merchant_id: string; amount_micro: number; job_run_id?: string },
  client?: PoolClient,
): Promise<OrderAutoConfirmReleaseResult> {
  return withPgTransaction(async (tx) => {
    await lockOrderEscrow(tx, params.order_id);

    const prior = await tx.query(`SELECT hold_id FROM order_auto_confirm_releases WHERE order_id = $1`, [
      params.order_id,
    ]);
    if (prior.rows[0]?.hold_id) {
      return {
        released: true,
        duplicate: true,
        hold_id: prior.rows[0].hold_id as string,
        order_id: params.order_id,
      };
    }

    const held = await tx.query(
      `SELECT hold_id, status, amount_micro FROM escrow_holds WHERE order_id = $1 AND status = 'held' FOR UPDATE`,
      [params.order_id],
    );
    const hold = held.rows[0] as { hold_id: string; status: string; amount_micro: number } | undefined;

    if (!hold) {
      const auditDup = await duplicateAutoConfirmIfAudited(tx, params.order_id);
      if (auditDup) return auditDup;

      const existingRes = await tx.query(
        `SELECT hold_id, status FROM escrow_holds WHERE order_id = $1 ORDER BY updated_at DESC LIMIT 1`,
        [params.order_id],
      );
      const existing = existingRes.rows[0] as { hold_id: string; status: string } | undefined;
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

    const updated = await tx.query(
      `UPDATE escrow_holds SET status = 'released', to_merchant_id = $1, updated_at = NOW()
       WHERE hold_id = $2 AND status = 'held'`,
      [params.merchant_id, hold.hold_id],
    );
    if ((updated.rowCount ?? 0) === 0) {
      const auditDup = await duplicateAutoConfirmIfAudited(tx, params.order_id);
      if (auditDup) return auditDup;

      const current = await tx.query(`SELECT hold_id, status FROM escrow_holds WHERE hold_id = $1`, [hold.hold_id]);
      const row = current.rows[0] as { hold_id: string; status: string } | undefined;
      logAutoConfirmReleaseSkip(params.order_id, 'update_race', {
        hold_id: hold.hold_id,
        hold_status: row?.status ?? 'unknown',
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

    const commissionRelease = await releasePlatformCommissionPg(tx, hold.hold_id);
    const releaseAmountMicro =
      commissionRelease.net_amount_micro ?? Number(hold.amount_micro ?? params.amount_micro);

    try {
      await tx.query(
        `INSERT INTO order_auto_confirm_releases (order_id, hold_id, merchant_id, amount_micro, released_at, job_run_id)
         VALUES ($1, $2, $3, $4, NOW(), $5)`,
        [
          params.order_id,
          hold.hold_id,
          params.merchant_id,
          releaseAmountMicro,
          params.job_run_id ?? null,
        ],
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('duplicate key') || msg.includes('unique constraint')) {
        const again = await tx.query(`SELECT hold_id FROM order_auto_confirm_releases WHERE order_id = $1`, [
          params.order_id,
        ]);
        return {
          released: true,
          duplicate: true,
          hold_id: (again.rows[0]?.hold_id as string) ?? hold.hold_id,
          order_id: params.order_id,
        };
      }
      throw error;
    }

    // Finding A: credit within the SAME transaction as the release — atomic, not fire-and-forget.
    await creditWalletWithinPgTx(tx, {
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
  }, client);
}

export function createEscrowPgAdapter(p?: Pool): EscrowAdapter {
  const usePool = p ?? getEscrowPgPool();
  return {
    async hold(params) {
      const result = await holdEscrowForOrderPg(params);
      return { hold_id: result.hold_id };
    },
    async release(params) {
      return withPgTransaction(async (tx) => {
        const hit = await tx.query(`SELECT hold_id, status FROM escrow_holds WHERE hold_id = $1 FOR UPDATE`, [
          params.hold_id,
        ]);
        const row = hit.rows[0] as { hold_id: string; status: string } | undefined;
        if (!row) throw new Error('escrow_hold_not_found');
        if (row.status !== 'held') return { status: row.status as 'released' | 'refunded' };
        await tx.query(
          `UPDATE escrow_holds SET status = 'released', to_merchant_id = $1, updated_at = NOW()
           WHERE hold_id = $2 AND status = 'held'`,
          [params.to_merchant_id, params.hold_id],
        );
        const commissionRelease = await releasePlatformCommissionPg(tx, params.hold_id);
        const meta = await tx.query(`SELECT order_id, amount_micro FROM escrow_holds WHERE hold_id = $1`, [
          params.hold_id,
        ]);
        const orderId = meta.rows[0]?.order_id as string;
        const gross = Number(meta.rows[0]?.amount_micro ?? 0);
        const netAmountMicro = commissionRelease.net_amount_micro ?? gross;
        // Finding A: credit within the SAME transaction as the release — atomic, not fire-and-forget.
        if (orderId) {
          await creditWalletWithinPgTx(tx, {
            merchantId: params.to_merchant_id,
            orderId,
            netAmountMicro,
          });
        }
        return { status: 'released' as const };
      });
    },
    async refund(params) {
      return withPgTransaction(async (tx) => {
        const hit = await tx.query(`SELECT hold_id, status FROM escrow_holds WHERE hold_id = $1 FOR UPDATE`, [
          params.hold_id,
        ]);
        const row = hit.rows[0] as { hold_id: string; status: string } | undefined;
        if (!row) throw new Error('escrow_hold_not_found');
        if (row.status === 'refunded') {
          const ref = await tx.query(`SELECT refund_reference FROM escrow_holds WHERE hold_id = $1`, [params.hold_id]);
          return {
            status: 'refunded' as const,
            reference: (ref.rows[0]?.refund_reference as string) || undefined,
          };
        }
        if (row.status !== 'held') throw new Error('escrow_hold_not_active');
        const reference = `RF-${Date.now().toString(36)}`;
        await tx.query(
          `UPDATE escrow_holds SET status = 'refunded', to_buyer_id = $1, refund_reference = $2, updated_at = NOW()
           WHERE hold_id = $3 AND status = 'held'`,
          [params.to_buyer_id, reference, params.hold_id],
        );
        return { status: 'refunded' as const, reference };
      });
    },
  };
}

export function getEscrowPgAdapter(): EscrowAdapter {
  if (!adapter) adapter = createEscrowPgAdapter();
  return adapter;
}

/** Dev/CI — parallel holds on one order against Postgres must not double-count escrow. */
export async function runEscrowConcurrentPgSelfTest(options?: { workers?: number; orderId?: string }) {
  const workers = options?.workers ?? 32;
  const orderId = options?.orderId ?? `ord-concurrent-pg-${Date.now().toString(36)}`;
  const amountMicro = 250000;

  const runWorker = (workerIndex: number) =>
    holdEscrowForOrderPg({
      order_id: orderId,
      amount_micro: amountMicro + workerIndex,
      reason: 'concurrent_self_test',
    });

  const results = await Promise.all(Array.from({ length: workers }, (_, i) => runWorker(i)));
  const activeRes = await getEscrowPgPool().query(
    `SELECT hold_id, amount_micro FROM escrow_holds WHERE order_id = $1 AND status = 'held'`,
    [orderId],
  );

  const uniqueHoldIds = new Set(results.map((r) => r.hold_id));
  const pass = activeRes.rows.length === 1 && uniqueHoldIds.size === 1;

  await getEscrowPgPool().query(`DELETE FROM payment_capture_events WHERE order_id = $1`, [orderId]);
  await getEscrowPgPool().query(`DELETE FROM order_auto_confirm_releases WHERE order_id = $1`, [orderId]);
  await getEscrowPgPool().query(`DELETE FROM escrow_holds WHERE order_id = $1`, [orderId]);

  return {
    pass,
    workers,
    order_id: orderId,
    hold_ids: [...uniqueHoldIds],
    active_hold_count: activeRes.rows.length,
    held_amount_micro: Number(activeRes.rows[0]?.amount_micro ?? 0),
    backend: 'postgres' as const,
  };
}
