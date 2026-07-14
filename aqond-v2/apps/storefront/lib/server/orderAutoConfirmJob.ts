import fs from 'node:fs/promises';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import {
  MARKETPLACE_PAYMENT_ESCROW_REASON,
  countAutoConfirmReleases,
  createEscrowDbAdapter,
  getEscrowStorageBackend,
  holdEscrowForOrder,
  openEscrowDatabaseAt,
  releaseEscrowForOrderAutoConfirm,
} from '@/lib/server/escrowStore';
import { getEscrowPgPool } from '@/lib/server/escrowPgStore';
import {
  listAllLocalOrders,
  setBuyerConfirmedAt,
  type StoredOrder,
} from '@/lib/server/orderStore';
import { listAllReturns } from '@/lib/server/returnStore';

const FULFILLMENT_FILE = path.join(process.cwd(), '.data', 'dev', 'merchant-fulfillment.json');

export type OrderAutoConfirmJobResult = {
  run_id: string;
  scanned: number;
  eligible: number;
  released: string[];
  duplicates: string[];
  skipped: string[];
  errors: Array<{ order_id: string; error: string }>;
  confirm_days: number;
};

type FulfillmentStore = Record<
  string,
  { fulfillment_status?: string; delivered_at?: string; updated_at?: string }
>;

export function getOrderAutoConfirmDays(): number {
  const raw = Number(process.env.ORDER_AUTO_CONFIRM_DAYS ?? 7);
  if (!Number.isFinite(raw)) return 7;
  return Math.min(7, Math.max(3, Math.round(raw)));
}

async function readFulfillmentOverlay(): Promise<FulfillmentStore> {
  try {
    return JSON.parse(await fs.readFile(FULFILLMENT_FILE, 'utf8')) as FulfillmentStore;
  } catch {
    return {};
  }
}

function resolveDeliveredAt(order: StoredOrder, overlay: FulfillmentStore): string | undefined {
  return overlay[order.order_id]?.delivered_at || order.delivered_at;
}

function resolveFulfillmentStatus(order: StoredOrder, overlay: FulfillmentStore): string | undefined {
  return overlay[order.order_id]?.fulfillment_status || order.fulfillment_status;
}

function daysSince(iso: string, nowMs: number): number {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return Number.POSITIVE_INFINITY;
  return (nowMs - ts) / (24 * 60 * 60 * 1000);
}

export function isOrderEligibleForAutoConfirm(
  order: StoredOrder,
  overlay: FulfillmentStore,
  options: { confirmDays: number; nowMs: number; hasActiveReturn: boolean },
): { eligible: boolean; reason?: string } {
  if (order.payment_status !== 'paid') return { eligible: false, reason: 'not_paid' };
  if (order.buyer_confirmed_at) return { eligible: false, reason: 'buyer_confirmed' };
  if (options.hasActiveReturn) return { eligible: false, reason: 'active_return' };

  const fulfillment = resolveFulfillmentStatus(order, overlay);
  if (fulfillment !== 'delivered' && order.status !== 'completed') {
    return { eligible: false, reason: 'not_delivered' };
  }

  const deliveredAt = resolveDeliveredAt(order, overlay);
  if (!deliveredAt) return { eligible: false, reason: 'missing_delivered_at' };

  if (daysSince(deliveredAt, options.nowMs) < options.confirmDays) {
    return { eligible: false, reason: 'within_confirm_window' };
  }

  return { eligible: true };
}

export async function runOrderAutoConfirmJob(options?: {
  confirmDays?: number;
  nowMs?: number;
  database?: DatabaseSync;
}): Promise<OrderAutoConfirmJobResult> {
  const confirmDays = options?.confirmDays ?? getOrderAutoConfirmDays();
  const nowMs = options?.nowMs ?? Date.now();
  const database = options?.database;
  const runId = `oac-${Date.now().toString(36)}`;

  const [orders, overlay, returns] = await Promise.all([
    listAllLocalOrders(),
    readFulfillmentOverlay(),
    listAllReturns(),
  ]);

  const released: string[] = [];
  const duplicates: string[] = [];
  const skipped: string[] = [];
  const errors: Array<{ order_id: string; error: string }> = [];
  let eligibleCount = 0;

  for (const order of orders) {
    let alreadyReleased = false;
    if (database) {
      alreadyReleased = Boolean(
        database
          .prepare(`SELECT order_id FROM order_auto_confirm_releases WHERE order_id = ?`)
          .get(order.order_id),
      );
    } else {
      alreadyReleased = (await countAutoConfirmReleases(order.order_id)) > 0;
    }
    if (alreadyReleased) {
      duplicates.push(order.order_id);
      continue;
    }

    const hasActiveReturn = returns.some(
      (r) => r.order_id === order.order_id && !['rejected', 'cancelled', 'refund_completed'].includes(r.state),
    );
    const gate = isOrderEligibleForAutoConfirm(order, overlay, {
      confirmDays,
      nowMs,
      hasActiveReturn,
    });
    if (!gate.eligible) {
      skipped.push(order.order_id);
      continue;
    }
    eligibleCount += 1;

    const result = await releaseEscrowForOrderAutoConfirm(
      {
        order_id: order.order_id,
        merchant_id: order.merchant_id,
        amount_micro: order.amount_micro,
        job_run_id: runId,
      },
      database,
    );

    if (result.skipped) {
      skipped.push(order.order_id);
      continue;
    }

    if (result.error && !result.released) {
      errors.push({ order_id: order.order_id, error: result.error });
      skipped.push(order.order_id);
      continue;
    }

    if (result.duplicate) {
      duplicates.push(order.order_id);
    } else if (result.released) {
      released.push(order.order_id);
      await setBuyerConfirmedAt(order.order_id, new Date(nowMs).toISOString());
    }
  }

  return {
    run_id: runId,
    scanned: orders.length,
    eligible: eligibleCount,
    released,
    duplicates,
    skipped,
    errors,
    confirm_days: confirmDays,
  };
}

/** Dev/CI — concurrent auto-confirm releases must not double-release escrow. */
export async function runOrderAutoConfirmConcurrentSelfTest(options?: {
  workers?: number;
  confirmDays?: number;
}) {
  const workers = options?.workers ?? 24;
  const confirmDays = options?.confirmDays ?? 0;
  const orderId = `ord-oac-${Date.now().toString(36)}`;
  const merchantId = 'e2e-merchant';
  const amountMicro = 23800;
  const deliveredAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const usePostgres = getEscrowStorageBackend() === 'postgres';
  const tempDb = `${process.cwd()}/.data/escrow-oac-${process.pid}.db`;

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
    buyer_id: `buyer-oac-${Date.now().toString(36)}`,
    merchant_id: merchantId,
    amount_micro: amountMicro,
    method: 'promptpay',
    payment_status: 'paid',
    fulfillment_status: 'delivered',
    delivered_at: deliveredAt,
    items: [{ product_id: 'e2e-pdp-video-001', title: 'OAC test', qty: 1, unit_price_micro: amountMicro }],
  });

  const database = usePostgres ? undefined : openEscrowDatabaseAt(tempDb);
  await holdEscrowForOrder(
    {
      order_id: orderId,
      amount_micro: amountMicro,
      reason: MARKETPLACE_PAYMENT_ESCROW_REASON,
      event_key: `pay:${orderId}`,
      merchant_id: merchantId,
    },
    database,
  );

  const worker = () =>
    releaseEscrowForOrderAutoConfirm(
      {
        order_id: orderId,
        merchant_id: merchantId,
        amount_micro: amountMicro,
        job_run_id: `oac-selftest-${Date.now()}`,
      },
      database,
    );

  const results = await Promise.all(Array.from({ length: workers }, () => worker()));

  let releaseAuditCount = 0;
  let escrowStatus: string | null = null;

  if (usePostgres) {
    const pool = getEscrowPgPool();
    const releaseRows = await pool.query(
      `SELECT hold_id FROM order_auto_confirm_releases WHERE order_id = $1`,
      [orderId],
    );
    const heldRows = await pool.query(`SELECT hold_id, status FROM escrow_holds WHERE order_id = $1`, [orderId]);
    releaseAuditCount = releaseRows.rows.length;
    escrowStatus = (heldRows.rows[0]?.status as string) ?? null;
    await pool.query(`DELETE FROM platform_commission_ledger WHERE order_id = $1`, [orderId]);
    await pool.query(`DELETE FROM order_auto_confirm_releases WHERE order_id = $1`, [orderId]);
    await pool.query(`DELETE FROM payment_capture_events WHERE order_id = $1`, [orderId]);
    await pool.query(`DELETE FROM escrow_holds WHERE order_id = $1`, [orderId]);
  } else {
    const releaseRows = database!
      .prepare(`SELECT hold_id FROM order_auto_confirm_releases WHERE order_id = ?`)
      .all(orderId) as { hold_id: string }[];
    const heldRows = database!
      .prepare(`SELECT hold_id, status FROM escrow_holds WHERE order_id = ?`)
      .all(orderId) as { hold_id: string; status: string }[];
    releaseAuditCount = releaseRows.length;
    escrowStatus = heldRows[0]?.status ?? null;
    database!.close();
    try {
      fs.unlinkSync(tempDb);
    } catch {
      /* ignore */
    }
  }

  await setBuyerConfirmedAt(orderId, new Date().toISOString());

  const { getOrderById } = await import('@/lib/server/orderStore');
  const order = await getOrderById(orderId);

  const releasedCount = results.filter((r) => r.released && !r.duplicate).length;
  const duplicateCount = results.filter((r) => r.duplicate).length;
  const holdIds = new Set(results.map((r) => r.hold_id).filter(Boolean));

  const pass =
    releaseAuditCount === 1 &&
    escrowStatus === 'released' &&
    holdIds.size === 1 &&
    releasedCount === 1 &&
    duplicateCount === workers - 1 &&
    Boolean(order?.buyer_confirmed_at);

  return {
    pass,
    workers,
    order_id: orderId,
    release_audit_count: releaseAuditCount,
    escrow_status: escrowStatus,
    buyer_confirmed_at: order?.buyer_confirmed_at ?? null,
    released_count: releasedCount,
    duplicate_count: duplicateCount,
    hold_ids: [...holdIds],
    backend: getEscrowStorageBackend(),
  };
}

/**
 * Dev/CI — order whose escrow was already released (e.g. return rejected → merchant paid)
 * must not double-release when auto-confirm job scans it again.
 */
export async function runOrderAutoConfirmPriorReleaseSelfTest(options?: { confirmDays?: number }) {
  const confirmDays = options?.confirmDays ?? 0;
  const orderId = `ord-oac-prior-${Date.now().toString(36)}`;
  const merchantId = 'e2e-merchant';
  const amountMicro = 31500;
  const deliveredAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const usePostgres = getEscrowStorageBackend() === 'postgres';
  const tempDb = `${process.cwd()}/.data/escrow-oac-prior-${process.pid}.db`;

  const fs = await import('node:fs');
  if (!usePostgres) {
    try {
      if (fs.existsSync(tempDb)) fs.unlinkSync(tempDb);
    } catch {
      /* ignore */
    }
  }

  const database = usePostgres ? undefined : openEscrowDatabaseAt(tempDb);
  const { hold_id: holdId } = await holdEscrowForOrder(
    {
      order_id: orderId,
      amount_micro: amountMicro,
      reason: MARKETPLACE_PAYMENT_ESCROW_REASON,
      event_key: `pay:${orderId}`,
      merchant_id: merchantId,
    },
    database,
  );

  const escrow = createEscrowDbAdapter(database);
  await escrow.release({ hold_id: holdId, to_merchant_id: merchantId });

  const direct = await releaseEscrowForOrderAutoConfirm(
    {
      order_id: orderId,
      merchant_id: merchantId,
      amount_micro: amountMicro,
      job_run_id: 'oac-prior-direct',
    },
    database,
  );

  const { saveLocalOrder, updateLocalOrderFulfillment } = await import('@/lib/server/orderStore');
  const { saveReturnRequest } = await import('@/lib/server/returnStore');
  await saveLocalOrder({
    order_id: orderId,
    buyer_id: `buyer-oac-prior-${Date.now().toString(36)}`,
    merchant_id: merchantId,
    amount_micro: amountMicro,
    method: 'promptpay',
    payment_status: 'paid',
    items: [{ product_id: 'e2e-pdp-video-001', title: 'OAC prior release', qty: 1, unit_price_micro: amountMicro }],
  });
  await updateLocalOrderFulfillment(orderId, 'delivered');

  const ordersFile = `${process.cwd()}/.data/orders.json`;
  const orderDb = JSON.parse(await (await import('node:fs/promises')).readFile(ordersFile, 'utf8'));
  const saved = (orderDb.orders || []).find((o: { order_id: string }) => o.order_id === orderId);
  if (saved) {
    saved.delivered_at = deliveredAt;
    saved.buyer_confirmed_at = undefined;
    await (await import('node:fs/promises')).writeFile(ordersFile, JSON.stringify(orderDb, null, 2));
  }

  await saveReturnRequest({
    return_id: `ret-${orderId}`,
    order_id: orderId,
    buyer_id: `buyer-oac-prior-${Date.now().toString(36)}`,
    merchant_id: merchantId,
    reason_code: 'damaged',
    return_method: 'pickup',
    detail: 'prior release self-test',
    state: 'rejected',
    created_at: deliveredAt,
    updated_at: new Date().toISOString(),
  });

  const { getOrderById } = await import('@/lib/server/orderStore');
  const { listAllReturns } = await import('@/lib/server/returnStore');
  const order = await getOrderById(orderId);
  if (!order) throw new Error('self_test_order_missing');

  const returns = await listAllReturns();
  const hasActiveReturn = returns.some(
    (r) => r.order_id === orderId && !['rejected', 'cancelled', 'refund_completed'].includes(r.state),
  );
  const gate = isOrderEligibleForAutoConfirm(order, {}, {
    confirmDays,
    nowMs: Date.now(),
    hasActiveReturn,
  });

  const jobAttempt = await releaseEscrowForOrderAutoConfirm(
    {
      order_id: orderId,
      merchant_id: merchantId,
      amount_micro: amountMicro,
      job_run_id: 'oac-prior-job-rescan',
    },
    database,
  );

  const releaseRows = usePostgres
    ? (
        await getEscrowPgPool().query(`SELECT hold_id FROM order_auto_confirm_releases WHERE order_id = $1`, [
          orderId,
        ])
      ).rows
    : (database!
        .prepare(`SELECT hold_id FROM order_auto_confirm_releases WHERE order_id = ?`)
        .all(orderId) as { hold_id: string }[]);
  const holdRows = usePostgres
    ? (
        await getEscrowPgPool().query(
          `SELECT hold_id, status, to_merchant_id FROM escrow_holds WHERE order_id = $1`,
          [orderId],
        )
      ).rows
    : (database!
        .prepare(`SELECT hold_id, status, to_merchant_id FROM escrow_holds WHERE order_id = ?`)
        .all(orderId) as { hold_id: string; status: string; to_merchant_id: string | null }[]);

  if (usePostgres) {
    const pool = getEscrowPgPool();
    await pool.query(`DELETE FROM platform_commission_ledger WHERE order_id = $1`, [orderId]);
    await pool.query(`DELETE FROM order_auto_confirm_releases WHERE order_id = $1`, [orderId]);
    await pool.query(`DELETE FROM payment_capture_events WHERE order_id = $1`, [orderId]);
    await pool.query(`DELETE FROM escrow_holds WHERE order_id = $1`, [orderId]);
  } else {
    database!.close();
    try {
      fs.unlinkSync(tempDb);
    } catch {
      /* ignore */
    }
  }

  const pass =
    direct.skipped === true &&
    direct.skip_reason === 'hold_not_held' &&
    direct.released === false &&
    gate.eligible === true &&
    jobAttempt.skipped === true &&
    jobAttempt.skip_reason === 'hold_not_held' &&
    jobAttempt.released === false &&
    releaseRows.length === 0 &&
    holdRows.length === 1 &&
    holdRows[0]?.status === 'released' &&
    holdRows[0]?.hold_id === holdId &&
    !order?.buyer_confirmed_at;

  return {
    pass,
    scenario: 'return_rejected_prior_release_rescan',
    order_id: orderId,
    hold_id: holdId,
    eligible_for_auto_confirm: gate.eligible,
    ineligible_reason: gate.reason ?? null,
    direct_skip_reason: direct.skip_reason ?? null,
    job_rescan_skip_reason: jobAttempt.skip_reason ?? null,
    release_audit_count: releaseRows.length,
    escrow_status: holdRows[0]?.status ?? null,
    buyer_confirmed_at: order?.buyer_confirmed_at ?? null,
    backend: getEscrowStorageBackend(),
  };
}
