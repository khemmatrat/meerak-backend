/**
 * Slack notifications for formal support cases (MRK-*).
 * Env (first match wins): SUPPORT_CASE_SLACK_WEBHOOK_URL, SUPPORT_SLACK_WEBHOOK_URL, SLACK_WEBHOOK_URL
 */

function resolveWebhookUrl() {
  const urls = [
    process.env.SUPPORT_CASE_SLACK_WEBHOOK_URL,
    process.env.SUPPORT_SLACK_WEBHOOK_URL,
    process.env.SLACK_WEBHOOK_URL,
  ];
  for (const raw of urls) {
    const url = String(raw || '').trim();
    if (url && !url.includes('xxxx')) return url;
  }
  return null;
}

function adminBase() {
  return String(process.env.ADMIN_APP_URL || process.env.ADMIN_URL || 'http://localhost:5173').replace(/\/$/, '');
}

export function buildSupportCaseAdminLinks(caseId, userId) {
  const base = adminBase();
  return {
    case_url: `${base}/?view=support-cases&caseId=${encodeURIComponent(caseId)}`,
    user_url: userId
      ? `${base}/?view=users&focusUserId=${encodeURIComponent(userId)}`
      : null,
  };
}

async function alreadyNotified(pool, caseId, kind) {
  try {
    const r = await pool.query(
      `SELECT 1 FROM user_support_case_events
       WHERE case_id = $1 AND event_type = 'slack_notified' AND detail->>'kind' = $2
       LIMIT 1`,
      [String(caseId), kind],
    );
    return (r.rows?.length || 0) > 0;
  } catch {
    return false;
  }
}

async function postSlack(text) {
  const url = resolveWebhookUrl();
  if (!url) return { sent: false, reason: 'no_webhook' };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 3900) }),
    });
    return { sent: res.ok, status: res.status };
  } catch (e) {
    return { sent: false, reason: e?.message || 'fetch_failed' };
  }
}

async function logSlackNotified(pool, caseId, actor, detail) {
  try {
    await pool.query(
      `INSERT INTO user_support_case_events (case_id, event_type, actor, detail)
       VALUES ($1, 'slack_notified', $2, $3::jsonb)`,
      [String(caseId), actor || null, JSON.stringify(detail || {})],
    );
  } catch {
    /* non-fatal */
  }
}

function priorityEmoji(priority) {
  if (priority === 'urgent') return '🆘';
  if (priority === 'high') return '⚠️';
  return '📋';
}

/**
 * @param {import('pg').Pool} pool
 * @param {{
 *   kind: 'opened' | 'assigned' | 'closed',
 *   caseRow: Record<string, unknown>,
 *   userEmail?: string | null,
 *   userName?: string | null,
 *   actor?: string | null,
 *   assignedTo?: string | null,
 *   resolution?: string | null,
 * }} opts
 */
export async function notifySupportCaseSlack(pool, opts) {
  const { kind, caseRow, userEmail, userName, actor, assignedTo, resolution } = opts;
  const caseId = caseRow?.case_id;
  if (!caseId) return { sent: false, reason: 'no_case' };

  if (kind === 'opened' && (await alreadyNotified(pool, caseId, 'opened'))) {
    return { sent: false, reason: 'deduped' };
  }

  const userId = String(caseRow.user_id || '');
  const links = buildSupportCaseAdminLinks(caseId, userId);
  const assignee = assignedTo || caseRow.assigned_to;
  const priority = caseRow.priority || 'normal';
  const subject = caseRow.subject || '(no subject)';

  let title;
  if (kind === 'opened') title = `${priorityEmoji(priority)} *Support Case Opened*`;
  else if (kind === 'assigned') title = '👤 *Support Case Assigned*';
  else title = '✅ *Support Case Closed*';

  const lines = [
    title,
    `Case: \`${caseId}\``,
    `Priority: *${priority}*`,
    `Subject: ${subject}`,
    userEmail
      ? `User: ${userName ? `${userName} — ` : ''}${userEmail}`
      : userId
        ? `User ID: \`${userId}\``
        : null,
    assignee
      ? `Assignee: *${assignee}*`
      : kind === 'opened'
        ? 'Assignee: _unassigned_'
        : null,
    actor ? `By: ${actor}` : null,
    resolution ? `Resolution: ${resolution}` : null,
    `Admin case: ${links.case_url}`,
    links.user_url ? `User admin: ${links.user_url}` : null,
  ].filter(Boolean);

  const result = await postSlack(lines.join('\n'));

  if (result.sent) {
    await logSlackNotified(pool, caseId, actor || 'system', {
      kind,
      assigned_to: assignee || null,
    });
  }

  return result;
}

/**
 * @param {import('pg').Pool} pool
 */
export async function loadUserBriefForCase(pool, userId) {
  const uid = String(userId || '').trim();
  if (!uid) return { email: null, full_name: null };
  const r = await pool.query(
    `SELECT email, full_name FROM users WHERE id = $1::uuid`,
    [uid],
  ).catch(() => ({ rows: [] }));
  return r.rows?.[0] || { email: null, full_name: null };
}

/**
 * Fire-and-forget wrapper used from supportCaseService.
 * @param {import('pg').Pool} pool
 */
export function fireSupportCaseSlack(pool, opts) {
  void (async () => {
    let userEmail = opts.userEmail;
    let userName = opts.userName;
    if (!userEmail && opts.caseRow?.user_id) {
      const u = await loadUserBriefForCase(pool, opts.caseRow.user_id);
      userEmail = u.email;
      userName = u.full_name;
    }
    await notifySupportCaseSlack(pool, { ...opts, userEmail, userName });
  })().catch((e) => {
    console.warn('[support-case slack]', e?.message);
  });
}
