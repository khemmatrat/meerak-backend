import type { DatabaseSync } from 'node:sqlite';
import type { EscrowAdapter } from '@aqond/return-core';
import type { EscrowHoldRecord } from '@aqond/return-core';
import * as sqlite from '@/lib/server/escrowDbStore';
import * as pg from '@/lib/server/escrowPgStore';

export type EscrowStorageBackend = 'sqlite' | 'postgres';

export function getEscrowStorageBackend(): EscrowStorageBackend {
  const v = String(process.env.ESCROW_STORAGE_BACKEND ?? 'sqlite')
    .trim()
    .toLowerCase();
  return v === 'postgres' ? 'postgres' : 'sqlite';
}

export const ESCROW_STORAGE_BACKEND = getEscrowStorageBackend();

export {
  MARKETPLACE_PAYMENT_ESCROW_REASON,
  type OrderAutoConfirmReleaseResult,
} from '@/lib/server/escrowDbStore';

export function getEscrowDatabase(): DatabaseSync {
  if (getEscrowStorageBackend() === 'postgres') {
    throw new Error('getEscrowDatabase() unavailable when ESCROW_STORAGE_BACKEND=postgres');
  }
  return sqlite.getEscrowDatabase();
}

export function openEscrowDatabaseAt(filePath: string): DatabaseSync {
  return sqlite.openEscrowDatabaseAt(filePath);
}

export function closeEscrowDatabase() {
  if (getEscrowStorageBackend() === 'postgres') {
    return pg.closeEscrowPgPool();
  }
  sqlite.closeEscrowDatabase();
}

export async function listEscrowHoldRecords(): Promise<EscrowHoldRecord[]> {
  if (getEscrowStorageBackend() === 'postgres') return pg.listEscrowHoldRecordsPg();
  return sqlite.listEscrowHoldRecords();
}

export async function countActiveHolds(orderId: string, database?: DatabaseSync): Promise<number> {
  if (database) return sqlite.countActiveHolds(orderId, database);
  if (getEscrowStorageBackend() === 'postgres') return pg.countActiveHoldsPg(orderId);
  return sqlite.countActiveHolds(orderId);
}

export async function getActiveHoldIdForOrder(orderId: string, database?: DatabaseSync): Promise<string | null> {
  if (database) return sqlite.getActiveHoldIdForOrder(database, orderId);
  if (getEscrowStorageBackend() === 'postgres') return pg.getActiveHoldIdForOrderPg(orderId);
  return sqlite.getActiveHoldIdForOrder(sqlite.getEscrowDatabase(), orderId);
}

export async function holdEscrowForOrder(
  params: {
    order_id: string;
    amount_micro: number;
    reason: string;
    event_key?: string;
    merchant_id?: string;
  },
  database?: DatabaseSync,
): Promise<{ hold_id: string; duplicate: boolean }> {
  if (database) return sqlite.holdEscrowForOrder(database, params);
  if (getEscrowStorageBackend() === 'postgres') return pg.holdEscrowForOrderPg(params);
  return sqlite.holdEscrowForOrder(sqlite.getEscrowDatabase(), params);
}

export async function releaseEscrowForOrderAutoConfirm(
  params: { order_id: string; merchant_id: string; amount_micro: number; job_run_id?: string },
  database?: DatabaseSync,
): Promise<sqlite.OrderAutoConfirmReleaseResult> {
  if (database) return sqlite.releaseEscrowForOrderAutoConfirm(database, params);
  if (getEscrowStorageBackend() === 'postgres') return pg.releaseEscrowForOrderAutoConfirmPg(params);
  return sqlite.releaseEscrowForOrderAutoConfirm(sqlite.getEscrowDatabase(), params);
}

export async function countAutoConfirmReleases(orderId: string, database?: DatabaseSync): Promise<number> {
  if (database) return sqlite.countAutoConfirmReleases(orderId, database);
  if (getEscrowStorageBackend() === 'postgres') {
    const res = await pg.getEscrowPgPool().query(
      `SELECT COUNT(*)::int AS c FROM order_auto_confirm_releases WHERE order_id = $1`,
      [orderId],
    );
    return Number(res.rows[0]?.c ?? 0);
  }
  return sqlite.countAutoConfirmReleases(orderId);
}

export function createEscrowDbAdapter(database?: DatabaseSync): EscrowAdapter {
  if (database) return sqlite.createEscrowDbAdapter(database);
  if (getEscrowStorageBackend() === 'postgres') return pg.createEscrowPgAdapter();
  return sqlite.createEscrowDbAdapter();
}

export function getEscrowDbAdapter(): EscrowAdapter {
  if (getEscrowStorageBackend() === 'postgres') return pg.getEscrowPgAdapter();
  return sqlite.getEscrowDbAdapter();
}

export async function runEscrowConcurrentSelfTest(options?: { workers?: number; orderId?: string }) {
  if (getEscrowStorageBackend() === 'postgres') return pg.runEscrowConcurrentPgSelfTest(options);
  return sqlite.runEscrowConcurrentSelfTest(options);
}

export function resetEscrowDbForTests() {
  if (getEscrowStorageBackend() === 'postgres') {
    return pg.closeEscrowPgPool();
  }
  sqlite.resetEscrowDbForTests();
}

/** Alias requested in migration plan */
export function getEscrowStore() {
  return {
    backend: getEscrowStorageBackend(),
    holdEscrowForOrder,
    releaseEscrowForOrderAutoConfirm,
    countActiveHolds,
    getActiveHoldIdForOrder,
    getEscrowDbAdapter,
    listEscrowHoldRecords,
  };
}
