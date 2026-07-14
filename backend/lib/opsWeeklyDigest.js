/**
 * Weekly Ops Digest — Slack + email summary (Tier 4.3 / 5.3).
 * Env: OPS_WEEKLY_DIGEST_WEBHOOK_URL → SUPPORT_CASE_SLACK → SLACK_WEBHOOK_URL
 *      OPS_WEEKLY_DIGEST_EMAIL_TO → ALERT_EMAIL_TO
 */
import { buildSupportCaseSla } from './supportCaseSlaService.js';
import { getReconcileTrendMinFails, getReconcileTrendWindowDays } from './adminUsersListService.js';
import { fetchPartnerApiWeeklyStats } from './partnerApiWeeklyReport.js';
import { sendAlertEmail } from './alertNotifier.js';

function resolveDigestEmailTo() {
  const raw = process.env.OPS_WEEKLY_DIGEST_EMAIL_TO
    || process.env.OPS_ALERT_EMAIL_TO
    || process.env.ALERT_EMAIL_TO;
  const to = String(raw || '').trim();
  return to.includes('@') ? to : null;
}

function resolveWebhookUrl() {
  const urls = [
    process.env.OPS_WEEKLY_DIGEST_WEBHOOK_URL,
    process.env.SUPPORT_CASE_SLACK_WEBHOOK_URL,
    process.env.SLACK_WEBHOOK_URL,
  ];
  for (const raw of urls) {
    const url = String(raw || '').trim();
    if (url && !url.includes('xxxx')) return url;
  }
  return null;
}

function isoWeekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

async function ensureDigestTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ops_weekly_digest_log (
      id BIGSERIAL PRIMARY KEY,
      digest_key TEXT NOT NULL UNIQUE,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      http_status INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => { });
}

/**
 * @param {import('pg').Pool} pool
 */
async function fetchReconcileRepeatTop(pool, limit = 8) {
  const windowDays = getReconcileTrendWindowDays();
  const minFails = getReconcileTrendMinFails();
  const r = await pool.query(
    `SELECT u.id, u.email, u.full_name, COUNT(*)::int AS fail_count
     FROM reconcile_alert_log ral
     INNER JOIN users u ON u.id = ral.user_id
     WHERE ral.created_at >= NOW() - ($1::text || ' days')::interval
     GROUP BY u.id, u.email, u.full_name
     HAVING COUNT(*) >= $2
     ORDER BY fail_count DESC
     LIMIT $3`,
    [String(windowDays), minFails, limit],
  ).catch(() => ({ rows: [] }));
  return r.rows || [];
}

/**
 * @param {import('pg').Pool} pool
 */
async function fetchAutoAssignStats(pool) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS assigned_7d
     FROM user_support_case_events
     WHERE event_type = 'auto_assign'
       AND created_at >= NOW() - INTERVAL '7 days'`,
  ).catch(() => ({ rows: [{ assigned_7d: 0 }] }));
  return { auto_assigned_7d: Number(r.rows?.[0]?.assigned_7d || 0) };
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ force?: boolean }} opts
 */
export async function sendOpsWeeklyDigest(pool, opts = {}) {
  const hook = resolveWebhookUrl();
  const emailTo = resolveDigestEmailTo();
  if (!hook && !emailTo) return { sent: false, reason: 'no_webhook_or_email' };

  const digestKey = `ops-digest:${isoWeekKey()}`;
  await ensureDigestTable(pool);

  if (!opts.force) {
    const dup = await pool.query(
      `SELECT 1 FROM ops_weekly_digest_log WHERE digest_key = $1`,
      [digestKey],
    ).catch(() => ({ rows: [] }));
    if (dup.rows?.length) {
      return { sent: false, reason: 'deduped', digest_key: digestKey };
    }
  }

  const [sla, repeatUsers, autoStats, partnerStats] = await Promise.all([
    buildSupportCaseSla(pool),
    fetchReconcileRepeatTop(pool, 8),
    fetchAutoAssignStats(pool),
    fetchPartnerApiWeeklyStats(pool).catch(() => null),
  ]);

  const adminBase = String(process.env.ADMIN_APP_URL || '').replace(/\/$/, '');
  const lines = [
    '📋 *MEERAK Weekly Ops Digest*',
    `Week: ${isoWeekKey()}`,
    '',
    '*Support queue*',
    `Open: ${sla.counts?.open_total ?? 0} · Stale >24h: ${sla.counts?.open_stale_24h ?? 0} · Unassigned urgent/high: ${sla.counts?.unassigned_priority ?? 0}`,
    `Avg assign (30d): ${sla.averages_30d?.hours_to_assign ?? '—'}h · Avg close: ${sla.averages_30d?.hours_to_close ?? '—'}h`,
    `Auto-assign (7d): ${autoStats.auto_assigned_7d}`,
    '',
    '*Reconcile repeat offenders*',
    repeatUsers.length
      ? repeatUsers.map((u) => `  · ${u.full_name || u.email || u.id?.slice(0, 8)} — ${u.fail_count} fails`).join('\n')
      : '  · (none)',
  ];

  if (partnerStats?.summary) {
    const ps = partnerStats.summary;
    lines.push(
      '',
      '*Partner API (7d)*',
      `Requests: ${ps.total_requests} · Errors: ${ps.error_count} (${ps.error_rate_pct}%) · 429: ${ps.rate_limit_count}`,
    );
  }

  if (adminBase) {
    lines.push('', `Admin: ${adminBase}`);
  }
  lines.push(`Generated: ${new Date().toISOString()}`);

  const text = lines.join('\n');
  const plainText = text.replace(/\*/g, '');
  let httpStatus = 0;
  let slackSent = false;
  if (hook) {
    try {
      const res = await fetch(hook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 3900) }),
      });
      httpStatus = res.status;
      slackSent = res.ok;
    } catch (e) {
      if (!resolveDigestEmailTo() && !opts.force) {
        return { sent: false, reason: e?.message };
      }
    }
  }

  let emailSent = false;
  if ((!slackSent || opts.force) && emailTo) {
    const emailRes = await sendAlertEmail({
      to: emailTo,
      subject: `[MEERAK] Weekly Ops Digest — ${isoWeekKey()}`,
      text: plainText,
    }).catch(() => ({ ok: false }));
    emailSent = !!emailRes.ok;
  }

  const sent = slackSent || emailSent;
  if (sent) {
    await pool.query(
      `INSERT INTO ops_weekly_digest_log (digest_key, payload, http_status)
       VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (digest_key) DO UPDATE SET payload = EXCLUDED.payload, http_status = EXCLUDED.http_status, created_at = NOW()`,
      [
        digestKey,
        JSON.stringify({
          sla: sla.counts,
          repeat_users: repeatUsers.length,
          partner_requests: partnerStats?.summary?.total_requests ?? 0,
          slack_sent: slackSent,
          email_sent: emailSent,
        }),
        httpStatus || (emailSent ? 200 : 0),
      ],
    ).catch(() => { });
  }

  return {
    sent,
    slack_sent: slackSent,
    email_sent: emailSent,
    digest_key: digestKey,
    http_status: httpStatus,
  };
}
