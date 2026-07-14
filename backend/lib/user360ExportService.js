/**
 * Unified User 360 export — wallet, job graph, risk, cases, KYC, commerce.
 */
import { buildSupportPack } from './supportCaseService.js';
import { buildUserRiskProfile } from './userRiskScoreService.js';
import { buildEnrichedJobGraphs } from './jobGraphService.js';

function num(v, fallback = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

async function fetchCommerceSummary(pool, userId, days = 90) {
  const dailyRes = await pool.query(
    `SELECT spend_in, spend_out, jobs_posted, jobs_completed, jobs_disputed,
            escrow_held, escrow_released
     FROM user_commerce_daily
     WHERE user_id = $1::uuid AND day_date >= (CURRENT_DATE - $2::int)`,
    [userId, days],
  ).catch(() => ({ rows: [] }));
  const totals = {
    spend_in: 0,
    spend_out: 0,
    jobs_posted: 0,
    jobs_completed: 0,
    jobs_disputed: 0,
    escrow_held: 0,
    escrow_released: 0,
  };
  for (const row of dailyRes.rows || []) {
    totals.spend_in += num(row.spend_in);
    totals.spend_out += num(row.spend_out);
    totals.jobs_posted += Number(row.jobs_posted || 0);
    totals.jobs_completed += Number(row.jobs_completed || 0);
    totals.jobs_disputed += Number(row.jobs_disputed || 0);
    totals.escrow_held += num(row.escrow_held);
    totals.escrow_released += num(row.escrow_released);
  }
  return { period_days: days, totals, daily_rows: dailyRes.rows?.length || 0 };
}

function parseJsonArray(raw) {
  if (Array.isArray(raw)) return raw.map((x) => String(x));
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p.map((x) => String(x));
    } catch { /* ignore */ }
  }
  return [];
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} userId
 * @param {{ caseId?: string }} [opts]
 */
export async function buildUser360Pack(pool, userId, opts = {}) {
  const uid = String(userId || '').trim();
  const [userRes, supportPack, risk, jobGraphs, commerce, casesRes, kycUser, supplements] = await Promise.all([
    pool.query(
      `SELECT id, email, full_name, phone, role, kyc_status, kyc_level, account_status,
              wallet_balance, wallet_balance_withdrawable, wallet_pending, wallet_frozen,
              data_sharing_consent, partner_hash, created_at
       FROM users WHERE id = $1::uuid`,
      [uid],
    ),
    buildSupportPack(pool, uid, { caseId: opts.caseId, openedBy: opts.openedBy || 'admin' }).catch(() => null),
    buildUserRiskProfile(pool, uid).catch(() => null),
    buildEnrichedJobGraphs(pool, uid, { limit: 12 }).catch(() => []),
    fetchCommerceSummary(pool, uid, 90).catch(() => null),
    pool.query(
      `SELECT case_id, status, priority, subject, opened_by, assigned_to, created_at, updated_at, closed_at
       FROM user_support_cases WHERE user_id = $1::uuid ORDER BY created_at DESC LIMIT 20`,
      [uid],
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT kyc_status, kyc_level, kyc_submitted_at, kyc_verified_at, kyc_next_reverify_at,
              kyc_rejection_reason, kyc_admin_instruction, kyc_resubmission_deadline,
              kyc_required_steps, kyc_resubmit_trigger
       FROM users WHERE id = $1::uuid`,
      [uid],
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT id, requested_docs, instruction, deadline, status, created_at
       FROM kyc_supplement_requests WHERE user_id = $1::uuid ORDER BY created_at DESC LIMIT 10`,
      [uid],
    ).catch(() => ({ rows: [] })),
  ]);

  const u = userRes.rows?.[0];
  if (!u) return null;

  const kyc = kycUser.rows?.[0] || {};
  const now = new Date();
  const nextReverify = kyc.kyc_next_reverify_at ? new Date(kyc.kyc_next_reverify_at) : null;
  const verifiedStatuses = new Set(['verified', 'approved']);
  const needsReverify = verifiedStatuses.has(String(kyc.kyc_status || '').toLowerCase())
    && nextReverify && nextReverify <= now;

  const stuckJobs = (jobGraphs || []).filter((g) => g.is_stuck);

  return {
    schema_version: 1,
    export_type: 'user_360',
    generated_at: new Date().toISOString(),
    user: {
      id: u.id,
      email: u.email,
      full_name: u.full_name,
      phone: u.phone,
      role: u.role,
      account_status: u.account_status,
      partner_hash: u.partner_hash || null,
      data_sharing_consent: !!u.data_sharing_consent,
      created_at: u.created_at,
      last_login_at: u.last_login_at || null,
    },
    wallet: supportPack?.wallet || {
      balance: num(u.wallet_balance),
      withdrawable: num(u.wallet_balance_withdrawable, num(u.wallet_balance)),
      pending: num(u.wallet_pending),
      reconcile: null,
    },
    pending: supportPack?.pending || { deposits_count: 0, withdrawals_count: 0 },
    risk: risk || supportPack?.risk || null,
    composite_risk: risk ? {
      composite_score: risk.composite_score,
      composite_tier: risk.composite_tier,
      linked_account_count: risk.linked_account_count,
    } : null,
    support_case: supportPack?.case || null,
    support_cases: casesRes.rows || [],
    kyc: {
      kyc_status: kyc.kyc_status,
      kyc_level: kyc.kyc_level,
      submitted_at: kyc.kyc_submitted_at,
      verified_at: kyc.kyc_verified_at,
      next_reverify_at: kyc.kyc_next_reverify_at,
      needs_reverify: !!needsReverify,
      rejection_reason: kyc.kyc_rejection_reason,
      admin_instruction: kyc.kyc_admin_instruction,
      resubmission_deadline: kyc.kyc_resubmission_deadline,
      required_steps: parseJsonArray(kyc.kyc_required_steps),
      resubmit_trigger: kyc.kyc_resubmit_trigger,
      supplement_requests: (supplements.rows || []).map((r) => ({
        id: r.id,
        requested_docs: parseJsonArray(r.requested_docs),
        instruction: r.instruction,
        deadline: r.deadline,
        status: r.status,
        created_at: r.created_at,
      })),
    },
    commerce: commerce ? {
      period_days: commerce.period_days,
      totals: commerce.totals,
      daily_rows: commerce.daily_rows,
    } : null,
    job_graphs: {
      total: jobGraphs?.length ?? 0,
      stuck_count: stuckJobs.length,
      stuck_jobs: stuckJobs.map((g) => ({
        job_id: g.job_id,
        title: g.title,
        job_status: g.job_status,
        stuck_step: g.stuck_step,
        edge_summary: g.edge_summary,
      })),
      graphs: jobGraphs || [],
    },
    recent_ledger: supportPack?.recent_ledger || [],
  };
}

export function user360ToCsv(pack) {
  if (!pack) return '';
  const rows = [
    ['section', 'field', 'value'],
    ['user', 'id', pack.user?.id || ''],
    ['user', 'email', pack.user?.email || ''],
    ['user', 'full_name', pack.user?.full_name || ''],
    ['user', 'role', pack.user?.role || ''],
    ['user', 'account_status', pack.user?.account_status || ''],
    ['wallet', 'balance', String(pack.wallet?.balance ?? '')],
    ['wallet', 'withdrawable', String(pack.wallet?.withdrawable ?? '')],
    ['wallet', 'pending', String(pack.wallet?.pending ?? '')],
    ['wallet', 'reconcile_status', pack.wallet?.reconcile?.status || ''],
    ['wallet', 'reconcile_variance', String(pack.wallet?.reconcile?.variance ?? '')],
    ['risk', 'composite_score', String(pack.composite_risk?.composite_score ?? pack.risk?.composite_score ?? '')],
    ['risk', 'composite_tier', pack.composite_risk?.composite_tier || pack.risk?.composite_tier || ''],
    ['risk', 'linked_accounts', String(pack.risk?.linked_account_count ?? 0)],
    ['kyc', 'status', pack.kyc?.kyc_status || ''],
    ['kyc', 'level', pack.kyc?.kyc_level || ''],
    ['kyc', 'needs_reverify', pack.kyc?.needs_reverify ? 'yes' : 'no'],
    ['case', 'primary_case_id', pack.support_case?.case_id || ''],
    ['cases', 'open_count', String((pack.support_cases || []).filter((c) => ['open', 'pending'].includes(c.status)).length)],
    ['jobs', 'graph_count', String(pack.job_graphs?.total ?? 0)],
    ['jobs', 'stuck_count', String(pack.job_graphs?.stuck_count ?? 0)],
    ['pending', 'deposits', String(pack.pending?.deposits_count ?? 0)],
    ['pending', 'withdrawals', String(pack.pending?.withdrawals_count ?? 0)],
  ];
  for (const c of pack.support_cases || []) {
    rows.push(['support_case', c.case_id, `${c.status}|${c.priority}|${c.subject || ''}`]);
  }
  for (const j of pack.job_graphs?.stuck_jobs || []) {
    rows.push(['stuck_job', j.job_id, `${j.stuck_step}|${j.job_status}|${j.title || ''}`]);
  }
  for (const l of pack.recent_ledger || []) {
    rows.push(['ledger', String(l.at || ''), `${l.event_type}|${l.amount}|${l.job_id || ''}`]);
  }
  return rows.map((r) => r.map((c) => {
    const s = String(c ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
}
