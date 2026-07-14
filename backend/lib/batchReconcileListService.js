/**
 * Tier 5.1 — lightweight reconcile snapshot for users list (current page only).
 */
import { buildReconcileExplain } from './reconcileExplainService.js';

const FINANCIAL_EVENT_TYPES = [
  'wallet_deposit',
  'user_payout_withdrawal',
  'admin_credit',
  'admin_debit',
];

function num(v, fallback = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

export function isListReconcileEnabled(query = {}) {
  const envOff = String(process.env.ADMIN_USERS_LIST_RECONCILE || '1').trim() === '0';
  if (envOff) return false;
  const q = String(query.include_reconcile ?? query.reconcile_snapshot ?? '1').trim().toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(q);
}

/**
 * @param {import('pg').Pool} pool
 * @param {string[]} userIds
 * @returns {Promise<Map<string, object>>}
 */
export async function batchReconcileSnapshots(pool, userIds) {
  const ids = [...new Set((userIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const map = new Map();
  if (!ids.length) return map;

  const [walletRes, ledgerRes, jobRes, settleRes] = await Promise.all([
    pool.query(
      `SELECT id::text AS user_id, wallet_balance, wallet_balance_withdrawable, wallet_pending,
              wallet_frozen, account_status
       FROM users WHERE id = ANY($1::uuid[])`,
      [ids],
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT pla.user_id,
              pla.event_type,
              COALESCE(SUM(COALESCE(pla.net_amount, pla.amount, 0)), 0)::numeric AS total_net,
              COALESCE(SUM(COALESCE(pla.amount, 0)), 0)::numeric AS total_gross
       FROM payment_ledger_audit pla
       WHERE pla.user_id = ANY($1::text[])
         AND pla.event_type = ANY($2::text[])
         AND LOWER(COALESCE(pla.status, 'completed')) NOT IN ('failed', 'reversed', 'cancelled', 'rejected')
       GROUP BY pla.user_id, pla.event_type`,
      [ids, FINANCIAL_EVENT_TYPES],
    ).catch(() => ({ rows: [] })),
    pool.query(
      `WITH uids AS (SELECT unnest($1::text[]) AS user_id)
       SELECT u.user_id,
              COALESCE(SUM(COALESCE(pla.net_amount, pla.amount, 0)) FILTER (WHERE
                pla.provider_id = u.user_id AND (
                  pla.event_type IN ('escrow_released', 'marine_deposit_released', 'referral_bonus')
                  OR (pla.event_type = 'escrow_held'
                      AND COALESCE(pla.metadata->>'leg', '') = ANY(ARRAY['provider_net', 'coach_training_fee']))
                )
              ), 0)::numeric AS earnings_total,
              COALESCE(SUM(COALESCE(pla.net_amount, pla.amount, 0)) FILTER (WHERE
                pla.user_id = u.user_id
                AND pla.event_type IN ('payment_created', 'booking_fee', 'post_job_fee', 'penalty_debit')
                AND pla.job_id IS NOT NULL
              ), 0)::numeric AS expenses_total
       FROM uids u
       LEFT JOIN payment_ledger_audit pla ON (
         (pla.provider_id = u.user_id AND (
           pla.event_type IN ('escrow_released', 'marine_deposit_released', 'referral_bonus')
           OR (pla.event_type = 'escrow_held'
               AND COALESCE(pla.metadata->>'leg', '') = ANY(ARRAY['provider_net', 'coach_training_fee']))
         ))
         OR (pla.user_id = u.user_id
             AND pla.event_type IN ('payment_created', 'booking_fee', 'post_job_fee', 'penalty_debit')
             AND pla.job_id IS NOT NULL)
       )
       AND LOWER(COALESCE(pla.status, 'completed')) NOT IN ('failed', 'reversed', 'cancelled', 'rejected', 'expired')
       GROUP BY u.user_id`,
      [ids],
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT user_id::text AS user_id, COALESCE(SUM(net_amount_thb), 0)::numeric AS total
       FROM wallet_transactions
       WHERE user_id = ANY($1::uuid[]) AND settlement_status = 'PENDING_SETTLEMENT'
       GROUP BY user_id`,
      [ids],
    ).catch(() => ({ rows: [] })),
  ]);

  const walletByUser = new Map((walletRes.rows || []).map((r) => [String(r.user_id), r]));
  const ledgerByUser = new Map();
  for (const row of ledgerRes.rows || []) {
    const uid = String(row.user_id);
    if (!ledgerByUser.has(uid)) ledgerByUser.set(uid, {});
    ledgerByUser.get(uid)[row.event_type] = {
      total_net: num(row.total_net, 0),
      total_gross: num(row.total_gross, 0),
    };
  }
  const jobByUser = new Map((jobRes.rows || []).map((r) => [String(r.user_id), r]));
  const settleByUser = new Map((settleRes.rows || []).map((r) => [String(r.user_id), num(r.total, 0)]));

  for (const uid of ids) {
    const userRow = walletByUser.get(uid);
    if (!userRow) {
      map.set(uid, { reconcile_status: 'skip', reconcile_verdict: 'no_user' });
      continue;
    }

    const summary = ledgerByUser.get(uid) || {};
    const jobSum = jobByUser.get(uid) || {};
    const walletBalance = num(userRow.wallet_balance, 0);
    const walletWithdrawable = num(userRow.wallet_balance_withdrawable, walletBalance);
    const walletPending = num(userRow.wallet_pending, 0);
    const pendingSettlementThb = settleByUser.get(uid) || 0;
    const otherLockedThb = Math.max(
      0,
      Math.round((walletBalance - walletWithdrawable - pendingSettlementThb - walletPending) * 100) / 100,
    );

    const explain = buildReconcileExplain({
      walletBalance,
      depNet: num(summary.wallet_deposit?.total_net, 0),
      wdGross: num(summary.user_payout_withdrawal?.total_gross, 0),
      adminCr: num(summary.admin_credit?.total_net, 0),
      adminDb: num(summary.admin_debit?.total_gross, 0),
      jobEarnings: num(jobSum.earnings_total, 0),
      jobExpenses: num(jobSum.expenses_total, 0),
      walletPending,
      pendingSettlement: pendingSettlementThb,
      otherLocked: otherLockedThb,
    });

    const pass = explain.simple.status === 'pass' || explain.explained.status === 'pass';
    map.set(uid, {
      reconcile_status: pass ? 'pass' : 'warn',
      reconcile_verdict: explain.verdict,
      reconcile_verdict_th: explain.verdict_th,
      reconcile_variance: explain.primary_variance,
      reconcile_simple_pass: explain.simple.status === 'pass',
      reconcile_explained_pass: explain.explained.status === 'pass',
    });
  }

  return map;
}
