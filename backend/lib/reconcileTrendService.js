/**
 * Reconcile fail trend — repeat offenders for Security tab + case priority escalation.
 * Uses reconcile_alert_log (migration 229).
 */
import { logCaseEvent } from './supportCaseService.js';

function num(v, fallback = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} userId
 */
export async function buildReconcileTrend(pool, userId) {
  const uid = String(userId || '').trim();
  const windowDays = Math.min(Math.max(Number(process.env.RECONCILE_TREND_WINDOW_DAYS || 30), 7), 90);
  const minFails = Math.max(Number(process.env.RECONCILE_TREND_MIN_FAILS || 2), 2);

  const r = await pool.query(
    `SELECT
       COUNT(*)::int AS fail_count,
       COUNT(DISTINCT LEFT(alert_key, 10))::int AS distinct_days,
       MAX(created_at) AS last_fail_at,
       MIN(created_at) AS first_fail_at,
       COALESCE(MAX(ABS(variance)), 0)::numeric AS max_variance
     FROM reconcile_alert_log
     WHERE user_id = $1::uuid
       AND created_at >= NOW() - ($2::text || ' days')::interval`,
    [uid, String(windowDays)],
  ).catch(() => ({ rows: [{}] }));

  const row = r.rows?.[0] || {};
  const failCount = Number(row.fail_count || 0);
  const isRepeat = failCount >= minFails;

  return {
    window_days: windowDays,
    min_fails_threshold: minFails,
    fail_count: failCount,
    distinct_days: Number(row.distinct_days || 0),
    max_variance: num(row.max_variance),
    last_fail_at: row.last_fail_at || null,
    first_fail_at: row.first_fail_at || null,
    is_repeat_offender: isRepeat,
    escalate_recommended: isRepeat,
  };
}

/**
 * Bump open case to urgent when user is a reconcile repeat offender.
 * @param {import('pg').Pool} pool
 */
export async function escalateReconcileRepeatCase(pool, userId, trend, { actor = 'system_reconcile_trend' } = {}) {
  if (!trend?.is_repeat_offender) return { escalated: false, reason: 'not_repeat' };

  const uid = String(userId || '').trim();
  const r = await pool.query(
    `UPDATE user_support_cases
     SET priority = 'urgent',
         updated_at = NOW(),
         metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
     WHERE user_id = $1::uuid
       AND status IN ('open', 'pending')
       AND priority IS DISTINCT FROM 'urgent'
     RETURNING case_id, priority, subject, assigned_to`,
    [
      uid,
      JSON.stringify({
        reconcile_trend_escalated: true,
        fail_count: trend.fail_count,
        window_days: trend.window_days,
        escalated_at: new Date().toISOString(),
      }),
    ],
  ).catch(() => ({ rows: [] }));

  const row = r.rows?.[0];
  if (row) {
    await logCaseEvent(pool, row.case_id, 'priority_escalated', actor, {
      reason: 'reconcile_repeat_offender',
      fail_count: trend.fail_count,
      new_priority: 'urgent',
    });
  }
  return { escalated: !!row, case: row || null };
}

/**
 * Security badge payload for admin UI.
 */
export function reconcileTrendSecurityBadge(trend) {
  if (!trend?.is_repeat_offender) return null;
  return {
    code: 'RECONCILE_REPEAT_FAIL',
    label: `Reconcile fail ซ้ำ ${trend.fail_count}× / ${trend.window_days} วัน`,
    severity: trend.fail_count >= 5 ? 'high' : 'medium',
    count: trend.fail_count,
  };
}
