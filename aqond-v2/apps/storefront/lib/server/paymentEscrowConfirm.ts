import type { DatabaseSync } from 'node:sqlite';
import {
  MARKETPLACE_PAYMENT_ESCROW_REASON,
  countActiveHolds,
  getActiveHoldIdForOrder,
  getEscrowStorageBackend,
  holdEscrowForOrder,
  openEscrowDatabaseAt,
} from '@/lib/server/escrowStore';
import { getEscrowPgPool } from '@/lib/server/escrowPgStore';
import { markOrdersPaymentStatus, readOrdersByIds, type StoredOrder } from '@/lib/server/orderStore';

export type PaymentCaptureConfirmResult = {
  holds: Array<{ order_id: string; hold_id: string; duplicate: boolean }>;
  orders_updated: number;
  duplicate: boolean;
};

function escrowTargetOrders(orders: StoredOrder[]): StoredOrder[] {
  return orders.filter((o) => o.method !== 'cod');
}

function buildCaptureEventKey(order: StoredOrder, captureKey?: string): string | undefined {
  if (captureKey) return `${captureKey}:${order.order_id}`;
  if (order.payso_reference_id) return `payso:${order.payso_reference_id}:${order.order_id}`;
  if (order.payment_intent_id) return `intent:${order.payment_intent_id}:${order.order_id}`;
  return undefined;
}

/**
 * Hold escrow FIRST, then mark orders paid — never PAID without an active hold.
 * Idempotent for duplicate webhook / verify retries (unique active hold per order_id).
 */
export async function confirmPaymentCaptureForOrders(
  orderIds: string[],
  options?: { captureKey?: string; database?: DatabaseSync },
): Promise<PaymentCaptureConfirmResult> {
  const orders = await readOrdersByIds(orderIds);
  if (!orders.length) throw new Error('orders_not_found');

  const targets = escrowTargetOrders(orders);
  const database = options?.database;
  const holds: PaymentCaptureConfirmResult['holds'] = [];

  for (const order of targets) {
    const eventKey = buildCaptureEventKey(order, options?.captureKey);
    const held = await holdEscrowForOrder(
      {
        order_id: order.order_id,
        amount_micro: order.amount_micro,
        reason: MARKETPLACE_PAYMENT_ESCROW_REASON,
        event_key: eventKey,
        merchant_id: order.merchant_id,
      },
      database,
    );
    holds.push({ order_id: order.order_id, hold_id: held.hold_id, duplicate: held.duplicate });
  }

  for (const order of targets) {
    const activeHold = await getActiveHoldIdForOrder(order.order_id, database);
    if (!activeHold) {
      throw new Error(`escrow_hold_missing:${order.order_id}`);
    }
  }

  const unpaidIds = orders.filter((o) => o.payment_status !== 'paid').map((o) => o.order_id);
  const ordersUpdated = unpaidIds.length ? await markOrdersPaymentStatus(unpaidIds, 'paid') : 0;

  for (const order of targets) {
    if ((await countActiveHolds(order.order_id, database)) !== 1) {
      throw new Error(`escrow_hold_count_invalid:${order.order_id}`);
    }
  }

  const allWerePaid = orders.every((o) => o.payment_status === 'paid');
  const allHoldsDuplicate = holds.length > 0 && holds.every((h) => h.duplicate);

  return {
    holds,
    orders_updated: ordersUpdated,
    duplicate: allWerePaid && (holds.length === 0 || allHoldsDuplicate),
  };
}

/** Dev/CI — duplicate webhook deliveries must not double-hold or double-mark paid. */
export async function runPaymentEscrowDuplicateWebhookSelfTest(options?: {
  workers?: number;
  orderId?: string;
  buyerId?: string;
  amountMicro?: number;
}) {
  const workers = options?.workers ?? 24;
  const orderId = options?.orderId ?? `ord-paydup-${Date.now().toString(36)}`;
  const buyerId = options?.buyerId ?? `buyer-paydup-${Date.now().toString(36)}`;
  const amountMicro = options?.amountMicro ?? 23800;
  const captureKey = `webhook-${orderId}-txn-demo`;
  const usePostgres = getEscrowStorageBackend() === 'postgres';
  const tempDb = `${process.cwd()}/.data/escrow-paydup-${process.pid}.db`;

  const fs = await import('node:fs');
  if (!usePostgres) {
    try {
      if (fs.existsSync(tempDb)) fs.unlinkSync(tempDb);
    } catch {
      /* ignore */
    }
  }

  const { saveLocalOrder } = await import('@/lib/server/orderStore');
  await saveLocalOrder({
    order_id: orderId,
    buyer_id: buyerId,
    merchant_id: 'e2e-merchant',
    amount_micro: amountMicro,
    method: 'promptpay',
    payment_status: 'pending',
    payso_reference_id: `PP-${orderId.slice(-8).toUpperCase()}`,
    payment_intent_id: `lint-${orderId}`,
    payment_source: 'stub',
    items: [{ product_id: 'e2e-pdp-video-001', title: 'Dup test', qty: 1, unit_price_micro: amountMicro }],
  });

  const database = usePostgres ? undefined : openEscrowDatabaseAt(tempDb);
  const worker = () => confirmPaymentCaptureForOrders([orderId], { captureKey, database });

  const results = await Promise.all(Array.from({ length: workers }, () => worker()));

  let activeHoldCount = 0;
  let captureEventCount = 0;
  const holdIds = new Set(results.flatMap((r) => r.holds.map((h) => h.hold_id)));

  if (usePostgres) {
    const pool = getEscrowPgPool();
    const activeRes = await pool.query(
      `SELECT hold_id, amount_micro FROM escrow_holds WHERE order_id = $1 AND status = 'held'`,
      [orderId],
    );
    activeHoldCount = activeRes.rows.length;
    const eventRes = await pool.query(
      `SELECT COUNT(*)::int AS c FROM payment_capture_events WHERE event_key = $1`,
      [`${captureKey}:${orderId}`],
    );
    captureEventCount = Number(eventRes.rows[0]?.c ?? 0);
    await pool.query(`DELETE FROM platform_commission_ledger WHERE order_id = $1`, [orderId]);
    await pool.query(`DELETE FROM payment_capture_events WHERE order_id = $1`, [orderId]);
    await pool.query(`DELETE FROM escrow_holds WHERE order_id = $1`, [orderId]);
  } else {
    const activeRows = database!
      .prepare(`SELECT hold_id, amount_micro FROM escrow_holds WHERE order_id = ? AND status = 'held'`)
      .all(orderId) as { hold_id: string; amount_micro: number }[];
    const eventRows = database!
      .prepare(`SELECT COUNT(*) AS c FROM payment_capture_events WHERE event_key LIKE ?`)
      .get(`${captureKey}:${orderId}`) as { c: number };
    activeHoldCount = activeRows.length;
    captureEventCount = eventRows.c;
    database!.close();
    try {
      fs.unlinkSync(tempDb);
    } catch {
      /* ignore */
    }
  }

  const { getOrderById } = await import('@/lib/server/orderStore');
  const order = await getOrderById(orderId);

  const pass =
    activeHoldCount === 1 &&
    holdIds.size === 1 &&
    captureEventCount === 1 &&
    order?.payment_status === 'paid';

  return {
    pass,
    workers,
    order_id: orderId,
    capture_key: captureKey,
    active_hold_count: activeHoldCount,
    hold_ids: [...holdIds],
    capture_event_count: captureEventCount,
    payment_status: order?.payment_status ?? null,
    backend: getEscrowStorageBackend(),
  };
}
