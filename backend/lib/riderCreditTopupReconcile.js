/**
 * Auto-reconcile pending Rider OS PromptPay topup charges (PaySo poll).
 * Mirrors wallet_deposit schedulePaysoAutoReconcile in server.js.
 */
import { pollAndFulfillRiderCreditTopup } from './riderCreditTopupPayment.js';

const statusCheckCooldownMs = 8000;
const statusLastCheckedAt = new Map();
const autoReconcileTimers = new Map();

export function scheduleRiderCreditPaysoReconcile(
  pool,
  {
    chargeId,
    maxAttempts = 80,
    intervalMs = 8000,
  } = {},
) {
  const key = String(chargeId || '').trim();
  if (!key || autoReconcileTimers.has(key)) return;

  let attempts = 0;

  const stop = () => {
    const h = autoReconcileTimers.get(key);
    if (h) clearTimeout(h);
    autoReconcileTimers.delete(key);
  };

  const tick = async () => {
    attempts += 1;
    try {
      const row = await pool.query(
        `SELECT status FROM rider_credit_topup_charges WHERE charge_id = $1 LIMIT 1`,
        [key],
      ).catch(() => ({ rows: [] }));
      const statusNow = String(row.rows?.[0]?.status || '').toLowerCase();
      if (statusNow === 'success') {
        stop();
        return;
      }

      const now = Date.now();
      const last = Number(statusLastCheckedAt.get(key) || 0);
      if (now - last >= statusCheckCooldownMs) {
        statusLastCheckedAt.set(key, now);
        const rec = await pollAndFulfillRiderCreditTopup(pool, key);
        if (rec?.paid || rec?.status === 'success') {
          stop();
          return;
        }
      }
    } catch (_) {
      /* retry */
    }

    if (attempts >= maxAttempts) {
      stop();
      return;
    }
    const timer = setTimeout(tick, intervalMs);
    autoReconcileTimers.set(key, timer);
  };

  const timer = setTimeout(tick, 4000);
  autoReconcileTimers.set(key, timer);
}

export async function batchReconcileRiderCreditTopup(
  pool,
  { limit = 100, trigger = 'batch' } = {},
) {
  const lim = Math.min(Math.max(Math.floor(Number(limit) || 100), 1), 500);
  const rows = await pool.query(
    `SELECT charge_id, user_id, rider_id, amount, status
       FROM rider_credit_topup_charges
      WHERE LOWER(COALESCE(status, 'pending')) = 'pending'
        AND LOWER(COALESCE(payment_method, 'promptpay')) = 'promptpay'
      ORDER BY created_at ASC
      LIMIT $1`,
    [lim],
  ).catch(() => ({ rows: [] }));

  let successCount = 0;
  let stillPendingCount = 0;
  let errorCount = 0;
  const items = [];

  for (const rec of rows.rows || []) {
    try {
      const out = await pollAndFulfillRiderCreditTopup(pool, rec.charge_id);
      const fresh = await pool.query(
        `SELECT charge_id, status, completed_at FROM rider_credit_topup_charges WHERE charge_id = $1 LIMIT 1`,
        [rec.charge_id],
      ).catch(() => ({ rows: [] }));
      const finalStatus = String(fresh.rows?.[0]?.status || rec.status || '').toLowerCase();
      if (finalStatus === 'success') successCount += 1;
      else stillPendingCount += 1;
      if (out?.status === 'not_found') errorCount += 1;
      items.push({
        charge_id: rec.charge_id,
        status: finalStatus || 'pending',
        completed_at: fresh.rows?.[0]?.completed_at || null,
        trigger,
        reconcile: out,
      });
    } catch (e) {
      errorCount += 1;
      stillPendingCount += 1;
      items.push({
        charge_id: rec.charge_id,
        status: 'pending',
        error: e?.message || 'reconcile_error',
        trigger,
      });
    }
  }

  return {
    requested_limit: lim,
    total: (rows.rows || []).length,
    success_count: successCount,
    still_pending_count: stillPendingCount,
    error_count: errorCount,
    items,
  };
}

let cronStarted = false;

/** Hourly sweep for overnight pending PromptPay rider credit topups. */
export function startRiderCreditTopupReconcileCron(pool) {
  if (cronStarted) return;
  cronStarted = true;

  const enabled = String(process.env.RIDER_CREDIT_RECONCILE_CRON || '1') !== '0';
  if (!enabled) return;

  const intervalMs = Number(process.env.RIDER_CREDIT_RECONCILE_INTERVAL_MS || 3600000);
  const limit = Number(process.env.RIDER_CREDIT_RECONCILE_BATCH_LIMIT || 100);

  const run = () => {
    batchReconcileRiderCreditTopup(pool, { limit, trigger: 'cron' })
      .then((r) => {
        if (r.total > 0) {
          console.log('[rider-credit-reconcile] cron batch', {
            total: r.total,
            success: r.success_count,
            pending: r.still_pending_count,
          });
        }
      })
      .catch((e) => console.warn('[rider-credit-reconcile] cron failed:', e?.message));
  };

  setTimeout(run, 60000);
  setInterval(run, intervalMs);
}
