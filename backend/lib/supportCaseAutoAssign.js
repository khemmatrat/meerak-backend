/**
 * Auto-assign support cases: urgent → ops queue, high → round-robin.
 * Env: SUPPORT_CASE_AUTO_ASSIGN=1, SUPPORT_CASE_OPS_QUEUE, SUPPORT_CASE_ROUND_ROBIN
 */
import { assignSupportCase, logCaseEvent } from './supportCaseService.js';

export function isAutoAssignEnabled() {
  const v = String(process.env.SUPPORT_CASE_AUTO_ASSIGN || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function getAutoAssignConfig() {
  const opsQueue = String(
    process.env.SUPPORT_CASE_OPS_QUEUE
    || process.env.SUPPORT_ALERT_EMAIL_TO
    || '',
  ).trim();
  const roundRobin = String(process.env.SUPPORT_CASE_ROUND_ROBIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    enabled: isAutoAssignEnabled(),
    ops_queue: opsQueue || null,
    round_robin: roundRobin,
  };
}

async function pickRoundRobinAssignee(pool, list) {
  if (!list.length) return null;
  const r = await pool.query(
    `SELECT COUNT(*)::int AS c FROM user_support_case_events
     WHERE event_type = 'assigned'
       AND detail->>'auto_assign_rule' = 'round_robin'
       AND created_at >= NOW() - INTERVAL '30 days'`,
  ).catch(() => ({ rows: [{ c: 0 }] }));
  const idx = Number(r.rows?.[0]?.c || 0) % list.length;
  return list[idx];
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} priority
 */
export async function pickAutoAssignee(pool, priority) {
  const config = getAutoAssignConfig();
  const p = String(priority || 'normal').toLowerCase();

  if (p === 'urgent' && config.ops_queue) {
    return { assignee: config.ops_queue, rule: 'ops_queue', config };
  }
  if ((p === 'high' || p === 'urgent') && config.round_robin.length) {
    const assignee = await pickRoundRobinAssignee(pool, config.round_robin);
    return { assignee, rule: 'round_robin', config };
  }
  return { assignee: null, rule: null, config };
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ case_id: string, priority?: string, assigned_to?: string | null }} caseRow
 */
export async function maybeAutoAssignCase(pool, caseRow, { actor = 'system_auto_assign' } = {}) {
  const config = getAutoAssignConfig();
  if (!config.enabled) return { assigned: false, reason: 'disabled' };

  const cid = caseRow?.case_id;
  if (!cid) return { assigned: false, reason: 'no_case' };
  if (caseRow.assigned_to && String(caseRow.assigned_to).trim()) {
    return { assigned: false, reason: 'already_assigned' };
  }

  const priority = String(caseRow.priority || 'normal').toLowerCase();
  if (!['urgent', 'high'].includes(priority)) {
    return { assigned: false, reason: 'priority_skip' };
  }

  const { assignee, rule } = await pickAutoAssignee(pool, priority);
  if (!assignee) return { assigned: false, reason: 'no_assignee_config' };

  const row = await assignSupportCase(pool, cid, assignee, actor, {
    auto_assign: true,
    auto_assign_rule: rule,
    priority,
  });
  if (row) {
    await logCaseEvent(pool, cid, 'auto_assign', actor, {
      assigned_to: assignee,
      rule,
      priority,
    });
  }
  return { assigned: !!row, case: row, assigned_to: assignee, rule };
}

/**
 * @param {import('pg').Pool} pool
 */
export async function runBulkAutoAssign(pool, { actor = 'admin_bulk_auto_assign', limit = 50 } = {}) {
  const config = getAutoAssignConfig();
  if (!config.enabled) {
    return { assigned: 0, skipped: 0, results: [], config, error: 'disabled' };
  }

  const r = await pool.query(
    `SELECT case_id, user_id, status, priority, subject, assigned_to, opened_by, created_at
     FROM user_support_cases
     WHERE status IN ('open', 'pending')
       AND priority IN ('urgent', 'high')
       AND (assigned_to IS NULL OR TRIM(assigned_to) = '')
     ORDER BY
       CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
       created_at ASC
     LIMIT $1`,
    [Math.min(Math.max(limit, 1), 100)],
  );

  const results = [];
  for (const row of r.rows || []) {
    const res = await maybeAutoAssignCase(pool, row, { actor });
    results.push({ case_id: row.case_id, ...res });
  }
  const assigned = results.filter((x) => x.assigned).length;
  return {
    assigned,
    skipped: results.length - assigned,
    results,
    config,
  };
}
