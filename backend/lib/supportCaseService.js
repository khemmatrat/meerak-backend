/**
 * Formal support case IDs + exportable support pack for ops.
 */
import crypto from 'crypto';
import { buildUserRiskProfile } from './userRiskScoreService.js';
import { fireSupportCaseSlack } from './supportCaseSlackNotify.js';

function num(v, fallback = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

export function generateCaseId() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `MRK-${day}-${suffix}`;
}

/**
 * @param {import('pg').Pool} pool
 */
export async function logCaseEvent(pool, caseId, eventType, actor, detail = {}) {
  try {
    await pool.query(
      `INSERT INTO user_support_case_events (case_id, event_type, actor, detail)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [String(caseId), eventType, actor || null, JSON.stringify(detail || {})],
    );
  } catch {
    /* non-fatal if migration 230 not applied */
  }
}

/**
 * Get open/pending case without creating.
 * @param {import('pg').Pool} pool
 */
export async function getOpenSupportCaseForUser(pool, userId) {
  const uid = String(userId || '').trim();
  const r = await pool.query(
    `SELECT case_id, id, status, priority, subject, opened_by, assigned_to, created_at, updated_at
     FROM user_support_cases
     WHERE user_id = $1::uuid AND status IN ('open', 'pending')
     ORDER BY created_at DESC
     LIMIT 1`,
    [uid],
  ).catch(() => ({ rows: [] }));
  return r.rows?.[0] || null;
}

/**
 * Auto-open high-priority case when wallet reconcile fails (dedupe per user/day/variance bucket).
 * @param {import('pg').Pool} pool
 * @param {string} userId
 * @param {{ expected_balance: number, actual_balance: number, variance: number, email?: string }} reconcile
 */
export async function maybeAutoCaseReconcileWarn(pool, userId, reconcile) {
  const uid = String(userId || '').trim();
  const variance = Math.abs(num(reconcile?.variance));
  if (variance < 0.01) return { case: null, created: false };

  const day = new Date().toISOString().slice(0, 10);
  const bucket = Math.floor(variance);
  const dedupeKey = `reconcile:${day}:v${bucket}`;

  const existing = await pool.query(
    `SELECT case_id, status, priority, subject, created_at, updated_at
     FROM user_support_cases
     WHERE user_id = $1::uuid
       AND status IN ('open', 'pending')
       AND (
         metadata->>'reconcile_dedupe_key' = $2
         OR subject ILIKE 'Reconcile FAIL%'
       )
     ORDER BY created_at DESC
     LIMIT 1`,
    [uid, dedupeKey],
  ).catch(() => ({ rows: [] }));

  if (existing.rows?.length) {
    const row = existing.rows[0];
    if (variance >= 100 && row.priority !== 'urgent') {
      await pool.query(
        `UPDATE user_support_cases SET priority = 'urgent', updated_at = NOW() WHERE case_id = $1`,
        [row.case_id],
      ).catch(() => { });
      row.priority = 'urgent';
    }
    await logCaseEvent(pool, row.case_id, 'status_change', 'system_reconcile', {
      reason: 'reconcile_warn_repeat',
      variance: reconcile.variance,
      dedupe_key: dedupeKey,
    });
    return { case: row, created: false };
  }

  const priority = variance >= 100 ? 'urgent' : variance >= 10 ? 'high' : 'normal';
  const subject = `Reconcile FAIL — variance ฿${Math.round(reconcile.variance * 100) / 100}`;
  const caseId = generateCaseId();
  const r = await pool.query(
    `INSERT INTO user_support_cases (case_id, user_id, status, priority, subject, opened_by, metadata)
     VALUES ($1, $2::uuid, 'open', $3, $4, 'system_reconcile', $5::jsonb)
     RETURNING case_id, status, priority, subject, created_at, updated_at`,
    [
      caseId,
      uid,
      priority,
      subject,
      JSON.stringify({
        reconcile_dedupe_key: dedupeKey,
        expected_balance: reconcile.expected_balance,
        actual_balance: reconcile.actual_balance,
        variance: reconcile.variance,
        email: reconcile.email || null,
        auto_opened: true,
      }),
    ],
  );
  await logCaseEvent(pool, caseId, 'opened', 'system_reconcile', {
    subject,
    variance: reconcile.variance,
    dedupe_key: dedupeKey,
  });
  const createdCase = { ...r.rows[0], user_id: uid };
  fireSupportCaseSlack(pool, {
    kind: 'opened',
    caseRow: createdCase,
    userEmail: reconcile.email,
    actor: 'system_reconcile',
  });
  try {
    const { maybeAutoAssignCase } = await import('./supportCaseAutoAssign.js');
    await maybeAutoAssignCase(pool, { ...r.rows[0], user_id: uid }, { actor: 'system_reconcile' });
  } catch {
    /* non-fatal */
  }
  return { case: r.rows[0], created: true };
}

/**
 * Get open case or create new one for user.
 * @param {import('pg').Pool} pool
 */
export async function getOrCreateSupportCase(pool, userId, { openedBy = 'admin', subject = null } = {}) {
  const uid = String(userId || '').trim();
  const existing = await pool.query(
    `SELECT case_id, id, status, priority, subject, created_at, updated_at
     FROM user_support_cases
     WHERE user_id = $1::uuid AND status IN ('open', 'pending')
     ORDER BY created_at DESC
     LIMIT 1`,
    [uid],
  ).catch(() => ({ rows: [] }));

  if (existing.rows?.length) return { case: existing.rows[0], created: false };

  const caseId = generateCaseId();
  const r = await pool.query(
    `INSERT INTO user_support_cases (case_id, user_id, status, priority, subject, opened_by)
     VALUES ($1, $2::uuid, 'open', 'normal', $3, $4)
     RETURNING case_id, id, status, priority, subject, created_at, updated_at`,
    [caseId, uid, subject || 'User support / financial review', openedBy],
  );
  await logCaseEvent(pool, caseId, 'opened', openedBy, { subject: subject || null });
  const createdCase = { ...r.rows[0], user_id: uid };
  fireSupportCaseSlack(pool, {
    kind: 'opened',
    caseRow: createdCase,
    actor: openedBy,
  });
  try {
    const { maybeAutoAssignCase } = await import('./supportCaseAutoAssign.js');
    await maybeAutoAssignCase(pool, { ...r.rows[0], user_id: uid }, { actor: openedBy });
  } catch {
    /* non-fatal */
  }
  return { case: r.rows[0], created: true };
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} userId
 * @param {{ caseId?: string }} opts
 */
export async function buildSupportPack(pool, userId, opts = {}) {
  const uid = String(userId || '').trim();
  let caseRow = null;
  if (opts.caseId) {
    const r = await pool.query(
      `SELECT case_id, status, priority, subject, created_at FROM user_support_cases WHERE case_id = $1 AND user_id = $2::uuid`,
      [opts.caseId, uid],
    );
    caseRow = r.rows?.[0] || null;
  }
  if (!caseRow) {
    const g = await getOrCreateSupportCase(pool, uid, { openedBy: opts.openedBy || 'system' });
    caseRow = g.case;
  }

  const [userRes, risk, pendingDep, pendingPay, recentLedger] = await Promise.all([
    pool.query(
      `SELECT id, email, full_name, phone, role, kyc_status, kyc_level, account_status,
              wallet_balance, wallet_balance_withdrawable, wallet_pending, wallet_frozen,
              created_at, last_login_at
       FROM users WHERE id = $1::uuid`,
      [uid],
    ),
    buildUserRiskProfile(pool, uid),
    pool.query(
      `SELECT COUNT(*)::int AS cnt, COALESCE(SUM(amount), 0)::numeric AS total
       FROM wallet_deposit_charges WHERE user_id = $1::uuid AND LOWER(COALESCE(status,'')) = 'pending'`,
      [uid],
    ).catch(() => ({ rows: [{ cnt: 0, total: 0 }] })),
    pool.query(
      `SELECT COUNT(*)::int AS cnt, COALESCE(SUM(amount), 0)::numeric AS total
       FROM payout_requests WHERE user_id = $1::uuid AND LOWER(COALESCE(status,'')) = 'pending'`,
      [uid],
    ).catch(() => ({ rows: [{ cnt: 0, total: 0 }] })),
    pool.query(
      `SELECT event_type, amount, net_amount, status, job_id, created_at
       FROM payment_ledger_audit
       WHERE user_id = $1::text OR provider_id = $1::text
       ORDER BY created_at DESC LIMIT 15`,
      [uid],
    ).catch(() => ({ rows: [] })),
  ]);

  const u = userRes.rows?.[0];
  if (!u) return null;

  const depNet = await pool.query(
    `SELECT COALESCE(SUM(COALESCE(net_amount, amount)), 0)::numeric AS v
     FROM payment_ledger_audit WHERE user_id = $1::text AND event_type = 'wallet_deposit'`,
    [uid],
  ).catch(() => ({ rows: [{ v: 0 }] }));
  const wdGross = await pool.query(
    `SELECT COALESCE(SUM(amount), 0)::numeric AS v
     FROM payment_ledger_audit
     WHERE (user_id = $1::text OR provider_id = $1::text) AND event_type = 'user_payout_withdrawal'`,
    [uid],
  ).catch(() => ({ rows: [{ v: 0 }] }));

  const walletBalance = num(u.wallet_balance);
  const expected = num(depNet.rows?.[0]?.v) - num(wdGross.rows?.[0]?.v);
  const variance = Math.round((walletBalance - expected) * 100) / 100;

  return {
    schema_version: 2,
    generated_at: new Date().toISOString(),
    case: {
      case_id: caseRow.case_id,
      status: caseRow.status,
      priority: caseRow.priority,
      subject: caseRow.subject,
      opened_at: caseRow.created_at,
    },
    user: {
      id: u.id,
      email: u.email,
      full_name: u.full_name,
      phone: u.phone,
      role: u.role,
      kyc_status: u.kyc_status,
      account_status: u.account_status,
      wallet_frozen: !!u.wallet_frozen,
      created_at: u.created_at,
      last_login_at: u.last_login_at,
    },
    wallet: {
      balance: walletBalance,
      withdrawable: num(u.wallet_balance_withdrawable, walletBalance),
      pending: num(u.wallet_pending),
      reconcile: {
        expected_balance: expected,
        actual_balance: walletBalance,
        variance,
        status: Math.abs(variance) < 0.01 ? 'pass' : 'warn',
      },
    },
    pending: {
      deposits_count: Number(pendingDep.rows?.[0]?.cnt || 0),
      deposits_thb: num(pendingDep.rows?.[0]?.total),
      withdrawals_count: Number(pendingPay.rows?.[0]?.cnt || 0),
      withdrawals_thb: num(pendingPay.rows?.[0]?.total),
    },
    risk: risk || null,
    recent_ledger: (recentLedger.rows || []).map((r) => ({
      event_type: r.event_type,
      amount: num(r.net_amount ?? r.amount),
      status: r.status,
      job_id: r.job_id,
      at: r.created_at,
    })),
  };
}

export function supportPackToCsv(pack) {
  if (!pack) return '';
  const rows = [
    ['field', 'value'],
    ['case_id', pack.case?.case_id || ''],
    ['user_id', pack.user?.id || ''],
    ['email', pack.user?.email || ''],
    ['full_name', pack.user?.full_name || ''],
    ['phone', pack.user?.phone || ''],
    ['kyc_status', pack.user?.kyc_status || ''],
    ['wallet_balance', String(pack.wallet?.balance ?? '')],
    ['wallet_pending', String(pack.wallet?.pending ?? '')],
    ['reconcile_status', pack.wallet?.reconcile?.status || ''],
    ['reconcile_variance', String(pack.wallet?.reconcile?.variance ?? '')],
    ['risk_composite_score', String(pack.risk?.composite_score ?? '')],
    ['risk_composite_tier', pack.risk?.composite_tier || ''],
    ['linked_accounts', String(pack.risk?.linked_account_count ?? 0)],
    ['pending_deposits', String(pack.pending?.deposits_count ?? 0)],
    ['pending_withdrawals', String(pack.pending?.withdrawals_count ?? 0)],
  ];
  for (const l of pack.risk?.linked_accounts || []) {
    rows.push(['linked_user', `${l.linked_user_id}|${l.link_type}|${l.linked_email || ''}`]);
  }
  for (const r of pack.recent_ledger || []) {
    rows.push(['ledger', `${r.at}|${r.event_type}|${r.amount}|${r.job_id || ''}`]);
  }
  return rows.map((r) => r.map((c) => {
    const s = String(c ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
}

/**
 * @param {import('pg').Pool} pool
 */
export async function assignSupportCase(pool, caseId, assignedTo, actor, eventDetail = {}) {
  const cid = String(caseId || '').trim();
  const r = await pool.query(
    `UPDATE user_support_cases
     SET assigned_to = $2,
         status = CASE WHEN status = 'open' THEN 'pending' ELSE status END,
         updated_at = NOW()
     WHERE case_id = $1
     RETURNING case_id, user_id, status, priority, subject, assigned_to, opened_by,
               created_at, updated_at, closed_at`,
    [cid, String(assignedTo || '').trim() || null],
  );
  const row = r.rows?.[0];
  if (row) {
    await logCaseEvent(pool, cid, 'assigned', actor, {
      assigned_to: row.assigned_to,
      ...eventDetail,
    });
    fireSupportCaseSlack(pool, {
      kind: 'assigned',
      caseRow: row,
      actor,
      assignedTo: row.assigned_to,
    });
  }
  return row || null;
}

/**
 * @param {import('pg').Pool} pool
 */
export async function closeSupportCase(pool, caseId, actor, { resolution = null, status = 'closed' } = {}) {
  const cid = String(caseId || '').trim();
  const finalStatus = status === 'resolved' ? 'resolved' : 'closed';
  const r = await pool.query(
    `UPDATE user_support_cases
     SET status = $2,
         closed_at = NOW(),
         updated_at = NOW(),
         metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb
     WHERE case_id = $1 AND status NOT IN ('closed', 'resolved')
     RETURNING case_id, user_id, status, priority, subject, assigned_to, opened_by,
               created_at, updated_at, closed_at, metadata`,
    [
      cid,
      finalStatus,
      JSON.stringify({ resolution: resolution || null, closed_by: actor || null }),
    ],
  );
  const row = r.rows?.[0];
  if (row) {
    await logCaseEvent(pool, cid, 'closed', actor, { resolution, status: finalStatus });
    fireSupportCaseSlack(pool, {
      kind: 'closed',
      caseRow: row,
      actor,
      assignedTo: row.assigned_to,
      resolution,
    });
  }
  return row || null;
}

/**
 * @param {import('pg').Pool} pool
 */
export async function getCaseHistory(pool, caseId) {
  const r = await pool.query(
    `SELECT id, case_id, event_type, actor, detail, created_at
     FROM user_support_case_events
     WHERE case_id = $1
     ORDER BY created_at ASC`,
    [String(caseId || '').trim()],
  ).catch(() => ({ rows: [] }));
  return r.rows || [];
}
