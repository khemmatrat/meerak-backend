/**
 * Admin users list — reconcile trend + ops attention (Tier 4.1 / 4.5).
 * Tier 5 — reconcile snapshot per page + ops queue CSV export.
 */
import {
  batchReconcileSnapshots,
  isListReconcileEnabled,
} from './batchReconcileListService.js';

export function getReconcileTrendMinFails() {
  return Math.max(Number(process.env.RECONCILE_TREND_MIN_FAILS || 2), 2);
}

export function getReconcileTrendWindowDays() {
  return Math.min(Math.max(Number(process.env.RECONCILE_TREND_WINDOW_DAYS || 30), 7), 90);
}

function mapKycLevelToStatus(kycLevel) {
  if (!kycLevel || kycLevel === '') return 'not_submitted';
  if (['pending', 'pending_review'].includes(String(kycLevel).toLowerCase())) return 'pending';
  if (['rejected', 'reject'].includes(String(kycLevel).toLowerCase())) return 'rejected';
  return 'approved';
}

function usersFromClause() {
  return `
    FROM users u
    LEFT JOIN (
      SELECT user_id, COUNT(*)::int AS fail_count
      FROM reconcile_alert_log
      WHERE created_at >= NOW() - ($1::text || ' days')::interval
      GROUP BY user_id
    ) rc ON rc.user_id = u.id
    LEFT JOIN LATERAL (
      SELECT case_id, priority, status, subject
      FROM user_support_cases
      WHERE user_id = u.id AND status IN ('open', 'pending')
      ORDER BY
        CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
        created_at DESC
      LIMIT 1
    ) sc ON true
  `;
}

/**
 * @param {import('pg').Pool} pool
 */
export async function fetchAdminUsersList(pool, query = {}) {
  const limit = Math.min(parseInt(query.limit, 10) || 20, 100);
  const offset = parseInt(query.offset, 10) || 0;
  const windowDays = getReconcileTrendWindowDays();
  const minFails = getReconcileTrendMinFails();
  const search = String(query.search || '').trim();
  const roleFilter = String(query.roleFilter || query.role || '').trim().toUpperCase();
  const statusFilter = String(query.statusFilter || query.status || '').trim().toLowerCase();
  const kycFilter = String(query.kycFilter || query.kyc_status || '').trim().toLowerCase();
  const vipFilter = String(query.vipFilter || query.vip || '').trim().toLowerCase();
  const reconcileRepeat = ['1', 'true', 'yes'].includes(
    String(query.reconcileRepeat || query.reconcile_repeat || '').trim().toLowerCase(),
  );
  const opsAttention = ['1', 'true', 'yes'].includes(
    String(query.opsAttention || query.ops_attention || '').trim().toLowerCase(),
  );
  const sort = String(query.sort || '').trim().toLowerCase();

  const conditions = [];
  const params = [String(windowDays)];
  let idx = 2;

  if (search) {
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    conditions.push(
      `(u.email ILIKE $${idx} OR u.full_name ILIKE $${idx + 1} OR u.phone ILIKE $${idx + 2} OR u.id::text ILIKE $${idx + 3})`,
    );
    idx += 4;
  }
  if (roleFilter && ['USER', 'ADMIN', 'AUDITOR', 'PROVIDER', 'user', 'provider'].includes(roleFilter)) {
    params.push(roleFilter);
    conditions.push(`(u.role = $${idx} OR (u.role IS NULL AND $${idx} = 'USER'))`);
    idx += 1;
  }
  if (statusFilter && ['active', 'suspended', 'banned'].includes(statusFilter)) {
    params.push(statusFilter);
    conditions.push(`(COALESCE(u.account_status, 'active') = $${idx})`);
    idx += 1;
  }
  if (kycFilter && ['not_submitted', 'pending', 'approved', 'rejected'].includes(kycFilter)) {
    if (kycFilter === 'not_submitted') {
      conditions.push(`(u.kyc_level IS NULL OR u.kyc_level = '')`);
    } else {
      params.push(kycFilter);
      conditions.push(`(u.kyc_level = $${idx})`);
      idx += 1;
    }
  }
  if (vipFilter === '1' || vipFilter === 'true' || vipFilter === 'yes') {
    conditions.push('(u.is_vip = TRUE)');
  }

  const filterParams = [...params];
  const minFailsInWhere = reconcileRepeat || opsAttention;
  let minFailsParam = idx;

  if (minFailsInWhere) {
    filterParams.push(String(minFails));
    if (reconcileRepeat) {
      conditions.push(`COALESCE(rc.fail_count, 0) >= $${minFailsParam}`);
    }
    if (opsAttention) {
      conditions.push(`(sc.case_id IS NOT NULL OR COALESCE(rc.fail_count, 0) >= $${minFailsParam})`);
    }
    idx += 1;
  }

  const listParams = [...filterParams];
  if (!minFailsInWhere) {
    listParams.push(String(minFails));
    minFailsParam = listParams.length;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const fromClause = usersFromClause();
  const order = sort === 'reconcile_fails'
    ? 'ORDER BY COALESCE(rc.fail_count, 0) DESC, u.created_at DESC NULLS LAST'
    : 'ORDER BY u.created_at DESC NULLS LAST';

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total ${fromClause} ${where}`,
    filterParams,
  ).catch((e) => {
    if (String(e?.code) === '42P01') {
      return { rows: [{ total: 0 }] };
    }
    throw e;
  });
  const total = countResult.rows[0]?.total ?? 0;

  const limitParam = listParams.length + 1;
  const offsetParam = listParams.length + 2;
  listParams.push(limit, offset);
  const listResult = await pool.query(
    `SELECT u.id, u.email, u.phone, u.full_name, u.name, u.kyc_level, u.role,
            u.created_at, u.last_login, u.account_status, u.is_vip,
            COALESCE(rc.fail_count, 0)::int AS reconcile_fail_count,
            (COALESCE(rc.fail_count, 0) >= $${minFailsParam}) AS is_reconcile_repeat,
            sc.case_id AS open_support_case_id,
            sc.priority AS open_support_case_priority,
            sc.status AS open_support_case_status,
            (sc.case_id IS NOT NULL OR COALESCE(rc.fail_count, 0) >= $${minFailsParam}) AS needs_ops_attention
     ${fromClause}
     ${where}
     ${order}
     LIMIT $${limitParam} OFFSET $${offsetParam}`,
    listParams,
  ).catch((e) => {
    if (String(e?.code) === '42P01') {
      return { rows: [] };
    }
    throw e;
  });

  let users = (listResult.rows || []).map((r) => ({
    id: String(r.id),
    email: r.email || '',
    phone: r.phone || undefined,
    full_name: r.full_name || r.name || undefined,
    kyc_status: mapKycLevelToStatus(r.kyc_level),
    account_status: r.account_status || 'active',
    created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    last_login_at: r.last_login ? new Date(r.last_login).toISOString() : undefined,
    role: r.role || 'USER',
    is_vip: !!r.is_vip,
    reconcile_fail_count_30d: Number(r.reconcile_fail_count || 0),
    is_reconcile_repeat: !!r.is_reconcile_repeat,
    open_support_case_id: r.open_support_case_id || null,
    open_support_case_priority: r.open_support_case_priority || null,
    needs_ops_attention: !!r.needs_ops_attention,
  }));

  if (isListReconcileEnabled(query) && users.length) {
    const snap = await batchReconcileSnapshots(pool, users.map((u) => u.id)).catch(() => new Map());
    users = users.map((u) => ({
      ...u,
      ...(snap.get(u.id) || {}),
    }));
  }

  return {
    users,
    pagination: { limit, offset, total },
    filters_applied: {
      reconcile_repeat: reconcileRepeat,
      ops_attention: opsAttention,
      sort: sort || 'created_at',
      reconcile_window_days: windowDays,
      reconcile_min_fails: minFails,
      reconcile_snapshot: isListReconcileEnabled(query),
    },
  };
}

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ limit?: number }} [opts]
 */
export async function exportOpsQueueCsv(pool, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit || 500), 1), 2000);
  const windowDays = getReconcileTrendWindowDays();
  const minFails = getReconcileTrendMinFails();
  const params = [String(windowDays), minFails, limit];

  const rows = await pool.query(
    `SELECT u.id::text AS id, u.email, u.full_name, u.role, u.account_status,
            COALESCE(rc.fail_count, 0)::int AS reconcile_fail_count,
            sc.case_id AS open_support_case_id,
            sc.priority AS open_support_case_priority
     ${usersFromClause()}
     WHERE (sc.case_id IS NOT NULL OR COALESCE(rc.fail_count, 0) >= $2)
     ORDER BY COALESCE(rc.fail_count, 0) DESC, u.created_at DESC NULLS LAST
     LIMIT $3`,
    params,
  ).catch((e) => {
    if (String(e?.code) === '42P01') return { rows: [] };
    throw e;
  });

  const userIds = (rows.rows || []).map((r) => r.id);
  const snap = userIds.length
    ? await batchReconcileSnapshots(pool, userIds).catch(() => new Map())
    : new Map();

  const header = [
    'user_id',
    'email',
    'full_name',
    'role',
    'account_status',
    'reconcile_fail_count_30d',
    'open_support_case_id',
    'open_support_case_priority',
    'reconcile_status',
    'reconcile_verdict',
    'reconcile_variance',
  ].join(',');

  const lines = (rows.rows || []).map((r) => {
    const s = snap.get(r.id) || {};
    return [
      csvEscape(r.id),
      csvEscape(r.email),
      csvEscape(r.full_name),
      csvEscape(r.role),
      csvEscape(r.account_status),
      csvEscape(r.reconcile_fail_count),
      csvEscape(r.open_support_case_id),
      csvEscape(r.open_support_case_priority),
      csvEscape(s.reconcile_status || ''),
      csvEscape(s.reconcile_verdict || ''),
      csvEscape(s.reconcile_variance ?? ''),
    ].join(',');
  });

  return `${header}\n${lines.join('\n')}\n`;
}
