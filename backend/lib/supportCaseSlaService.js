/**
 * Support case SLA metrics for admin ops panel.
 */

function num(v, fallback = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function hoursBetween(a, b) {
  if (!a || !b) return null;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round((ms / 3600000) * 10) / 10;
}

/**
 * @param {import('pg').Pool} pool
 */
export async function buildSupportCaseSla(pool) {
  const [openStale, unassignedUrgent, assignAvg, closeAvg, queueCounts] = await Promise.all([
    pool.query(
      `SELECT c.case_id, c.user_id, c.priority, c.subject, c.status, c.assigned_to,
              c.created_at, c.updated_at, u.email AS user_email, u.full_name AS user_name
       FROM user_support_cases c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.status IN ('open', 'pending')
         AND c.created_at < NOW() - INTERVAL '24 hours'
       ORDER BY
         CASE c.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
         c.created_at ASC
       LIMIT 30`,
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT c.case_id, c.user_id, c.priority, c.subject, c.status, c.created_at,
              u.email AS user_email, u.full_name AS user_name
       FROM user_support_cases c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.status IN ('open', 'pending')
         AND c.priority IN ('urgent', 'high')
         AND (c.assigned_to IS NULL OR TRIM(c.assigned_to) = '')
       ORDER BY c.created_at ASC
       LIMIT 30`,
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (e.created_at - c.created_at)) / 3600.0)::numeric AS avg_hours
       FROM user_support_cases c
       INNER JOIN LATERAL (
         SELECT created_at FROM user_support_case_events
         WHERE case_id = c.case_id AND event_type = 'assigned'
         ORDER BY created_at ASC LIMIT 1
       ) e ON true
       WHERE c.created_at >= NOW() - INTERVAL '30 days'`,
    ).catch(() => ({ rows: [{ avg_hours: null }] })),
    pool.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (c.closed_at - c.created_at)) / 3600.0)::numeric AS avg_hours
       FROM user_support_cases c
       WHERE c.closed_at IS NOT NULL
         AND c.created_at >= NOW() - INTERVAL '30 days'`,
    ).catch(() => ({ rows: [{ avg_hours: null }] })),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('open', 'pending'))::int AS open_total,
         COUNT(*) FILTER (WHERE status IN ('open', 'pending') AND priority = 'urgent')::int AS open_urgent,
         COUNT(*) FILTER (WHERE status IN ('open', 'pending') AND created_at < NOW() - INTERVAL '24 hours')::int AS open_stale_24h,
         COUNT(*) FILTER (WHERE status IN ('open', 'pending') AND priority IN ('urgent','high') AND (assigned_to IS NULL OR TRIM(assigned_to) = ''))::int AS unassigned_priority
       FROM user_support_cases`,
    ).catch(() => ({ rows: [{}] })),
  ]);

  const staleRows = (openStale.rows || []).map((r) => ({
    ...r,
    age_hours: hoursBetween(r.created_at, new Date()),
  }));

  return {
    generated_at: new Date().toISOString(),
    counts: {
      open_total: Number(queueCounts.rows?.[0]?.open_total || 0),
      open_urgent: Number(queueCounts.rows?.[0]?.open_urgent || 0),
      open_stale_24h: Number(queueCounts.rows?.[0]?.open_stale_24h || 0),
      unassigned_priority: Number(queueCounts.rows?.[0]?.unassigned_priority || 0),
    },
    averages_30d: {
      hours_to_assign: num(assignAvg.rows?.[0]?.avg_hours, null) || null,
      hours_to_close: num(closeAvg.rows?.[0]?.avg_hours, null) || null,
    },
    stale_open_cases: staleRows,
    unassigned_urgent_cases: unassignedUrgent.rows || [],
    sla_breaches: {
      stale_24h: staleRows.length,
      unassigned_urgent: (unassignedUrgent.rows || []).length,
    },
  };
}
