import fs from 'node:fs/promises';
import path from 'node:path';
import type { RefundRecord, ReturnRequestRecord } from '@aqond/return-core';

const DATA_FILE = path.join(process.cwd(), '.data', 'returns.json');

type ReturnDb = {
  returns: ReturnRequestRecord[];
  refunds: RefundRecord[];
};

async function readDb(): Promise<ReturnDb> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ReturnDb>;
    return {
      returns: Array.isArray(parsed.returns) ? parsed.returns : [],
      refunds: Array.isArray(parsed.refunds) ? parsed.refunds : [],
    };
  } catch {
    return { returns: [], refunds: [] };
  }
}

async function writeDb(db: ReturnDb) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(db, null, 2), 'utf8');
}

const TERMINAL_STATES = new Set(['rejected', 'cancelled', 'refund_completed']);

export function hasActiveReturnForOrder(orderId: string, returns?: ReturnRequestRecord[]): boolean {
  const list = returns;
  const rows = list ?? [];
  return rows.some((r) => r.order_id === orderId && !TERMINAL_STATES.has(r.state));
}

export async function orderHasActiveReturn(orderId: string): Promise<boolean> {
  const db = await readDb();
  return hasActiveReturnForOrder(orderId, db.returns);
}

export async function saveReturnRequest(record: ReturnRequestRecord): Promise<ReturnRequestRecord> {
  const db = await readDb();
  const active = db.returns.find(
    (r) => r.order_id === record.order_id && !TERMINAL_STATES.has(r.state),
  );
  if (active) {
    throw new Error('return_already_active');
  }
  db.returns.push(record);
  await writeDb(db);
  return record;
}

export async function updateReturnRequest(
  returnId: string,
  patch: Partial<ReturnRequestRecord>,
): Promise<ReturnRequestRecord | null> {
  const db = await readDb();
  const idx = db.returns.findIndex((r) => r.return_id === returnId);
  if (idx < 0) return null;
  db.returns[idx] = {
    ...db.returns[idx],
    ...patch,
    return_id: db.returns[idx].return_id,
    updated_at: new Date().toISOString(),
  };
  await writeDb(db);
  return db.returns[idx];
}

export async function saveRefundRecord(record: RefundRecord): Promise<RefundRecord> {
  const db = await readDb();
  const existing = db.refunds.find((r) => r.return_id === record.return_id);
  if (existing) {
    throw new Error('refund_already_exists');
  }
  db.refunds.push(record);
  await writeDb(db);
  return record;
}

export async function updateRefundRecord(
  refundId: string,
  patch: Partial<RefundRecord>,
): Promise<RefundRecord | null> {
  const db = await readDb();
  const idx = db.refunds.findIndex((r) => r.refund_id === refundId);
  if (idx < 0) return null;
  db.refunds[idx] = { ...db.refunds[idx], ...patch, refund_id: db.refunds[idx].refund_id };
  await writeDb(db);
  return db.refunds[idx];
}

export async function getReturnById(returnId: string): Promise<ReturnRequestRecord | null> {
  const db = await readDb();
  return db.returns.find((r) => r.return_id === returnId) || null;
}

export async function getRefundById(refundId: string): Promise<RefundRecord | null> {
  const db = await readDb();
  return db.refunds.find((r) => r.refund_id === refundId) || null;
}

export async function getRefundByReturnId(returnId: string): Promise<RefundRecord | null> {
  const db = await readDb();
  return db.refunds.find((r) => r.return_id === returnId) || null;
}

export async function listReturnsForOrder(
  orderId: string,
  buyerId?: string,
): Promise<ReturnRequestRecord[]> {
  const db = await readDb();
  return db.returns.filter(
    (r) => r.order_id === orderId && (!buyerId || r.buyer_id === buyerId),
  );
}

export async function listReturnsForBuyer(buyerId: string): Promise<ReturnRequestRecord[]> {
  const db = await readDb();
  return db.returns.filter((r) => r.buyer_id === buyerId);
}

export async function listRefundsForBuyer(buyerId: string): Promise<RefundRecord[]> {
  const db = await readDb();
  return db.refunds.filter((r) => r.buyer_id === buyerId);
}

export async function listReturnsForMerchant(merchantId: string): Promise<ReturnRequestRecord[]> {
  const db = await readDb();
  return db.returns.filter((r) => r.merchant_id === merchantId);
}

export async function listAllReturns(): Promise<ReturnRequestRecord[]> {
  const db = await readDb();
  return db.returns;
}

export async function listAllRefunds(): Promise<RefundRecord[]> {
  const db = await readDb();
  return db.refunds;
}
