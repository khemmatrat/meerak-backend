/**
 * Per-case audit bundle: KYC approve, escrow release, wallet adjust, case history.
 */
import { buildSupportPack, getCaseHistory } from './supportCaseService.js';

const AUDIT_ACTIONS = [
  'KYC_APPROVED',
  'wallet_adjust',
  'admin_job_escrow_released',
  'approve_provider',
  'user_vip',
  'emergency_suspend',
];

function num(v, fallback = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} caseId
 */
export async function buildSupportCaseAuditBundle(pool, caseId) {
  const cid = String(caseId || '').trim();
  const caseRes = await pool.query(
    `SELECT c.*, u.email AS user_email, u.full_name AS user_name, u.phone AS user_phone
     FROM user_support_cases c
     LEFT JOIN users u ON u.id = c.user_id
     WHERE c.case_id = $1
     LIMIT 1`,
    [cid],
  );
  const caseRow = caseRes.rows?.[0];
  if (!caseRow) return null;

  const uid = String(caseRow.user_id);
  const since = caseRow.created_at;

  const [history, supportPack, auditLog, finAudit, ledger, kycRows] = await Promise.all([
    getCaseHistory(pool, cid),
    buildSupportPack(pool, uid, { caseId: cid }).catch(() => null),
    pool.query(
      `SELECT id, actor_id, actor_role, action, entity_name, entity_id, changes, status, ip_address, created_at
       FROM audit_log
       WHERE (entity_id = $1::text OR changes::text ILIKE '%' || $1 || '%')
         AND action = ANY($2::text[])
         AND created_at >= $3::timestamptz
       ORDER BY created_at DESC
       LIMIT 80`,
      [uid, AUDIT_ACTIONS, since],
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT id, actor_type, actor_id, action, entity_type, entity_id, reason, state_before, state_after, created_at
       FROM financial_audit_log
       WHERE entity_id = $1::text AND created_at >= $2::timestamptz
       ORDER BY created_at DESC
       LIMIT 80`,
      [uid, since],
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT id, event_type, job_id, amount, net_amount, status, created_at
       FROM payment_ledger_audit
       WHERE (user_id = $1::text OR provider_id = $1::text)
         AND created_at >= $2::timestamptz
         AND (
           event_type IN ('admin_credit', 'admin_debit', 'escrow_released', 'escrow_held', 'escrow_refunded')
           OR job_id IS NOT NULL
         )
       ORDER BY created_at DESC
       LIMIT 60`,
      [uid, since],
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT id, status, kyc_level, reviewed_at, reviewed_by, rejection_reason, submitted_at
       FROM kyc_submissions
       WHERE user_id = $1::uuid AND submitted_at >= $2::timestamptz
       ORDER BY submitted_at DESC
       LIMIT 20`,
      [uid, since],
    ).catch(() => ({ rows: [] })),
  ]);

  const audit_entries = [
    ...(auditLog.rows || []).map((r) => ({
      source: 'audit_log',
      action: r.action,
      actor: r.actor_id,
      actor_role: r.actor_role,
      entity: `${r.entity_name}:${r.entity_id}`,
      detail: r.changes,
      status: r.status,
      at: r.created_at,
    })),
    ...(finAudit.rows || []).map((r) => ({
      source: 'financial_audit_log',
      action: r.action,
      actor: r.actor_id,
      actor_role: r.actor_type,
      entity: `${r.entity_type}:${r.entity_id}`,
      detail: { reason: r.reason, state_before: r.state_before, state_after: r.state_after },
      status: null,
      at: r.created_at,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    case: {
      case_id: caseRow.case_id,
      status: caseRow.status,
      priority: caseRow.priority,
      subject: caseRow.subject,
      assigned_to: caseRow.assigned_to,
      opened_by: caseRow.opened_by,
      created_at: caseRow.created_at,
      closed_at: caseRow.closed_at,
    },
    user: {
      id: uid,
      email: caseRow.user_email,
      full_name: caseRow.user_name,
      phone: caseRow.user_phone,
    },
    window: { since },
    case_history: history,
    audit_entries,
    kyc_events: kycRows.rows || [],
    ledger_since_open: (ledger.rows || []).map((r) => ({
      id: r.id,
      event_type: r.event_type,
      job_id: r.job_id,
      amount: num(r.net_amount ?? r.amount),
      status: r.status,
      at: r.created_at,
    })),
    support_pack_snapshot: supportPack,
    summary: {
      audit_count: audit_entries.length,
      kyc_events: (kycRows.rows || []).length,
      ledger_rows: (ledger.rows || []).length,
      case_events: history.length,
    },
  };
}

export function auditBundleToCsv(bundle) {
  if (!bundle) return '';
  const rows = [
    ['section', 'field', 'value'],
    ['case', 'case_id', bundle.case?.case_id || ''],
    ['case', 'status', bundle.case?.status || ''],
    ['case', 'priority', bundle.case?.priority || ''],
    ['case', 'subject', bundle.case?.subject || ''],
    ['user', 'id', bundle.user?.id || ''],
    ['user', 'email', bundle.user?.email || ''],
    ['summary', 'audit_count', String(bundle.summary?.audit_count ?? 0)],
  ];
  for (const e of bundle.audit_entries || []) {
    rows.push([
      'audit',
      e.action,
      `${e.at}|${e.actor}|${JSON.stringify(e.detail || {}).slice(0, 200)}`,
    ]);
  }
  for (const h of bundle.case_history || []) {
    rows.push(['history', h.event_type, `${h.created_at}|${h.actor || ''}`]);
  }
  for (const l of bundle.ledger_since_open || []) {
    rows.push([
      'ledger',
      l.event_type,
      `${l.at}|${l.job_id || ''}|${l.amount}`,
    ]);
  }
  return rows.map((r) => r.map((c) => {
    const s = String(c ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
}
