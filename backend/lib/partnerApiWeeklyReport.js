/**
 * Partner API weekly trust/quota summary → Slack + email.
 * Env: PARTNER_API_SLACK_WEBHOOK_URL, PARTNER_API_WEEKLY_EMAIL_TO,
 *      PARTNER_API_WEEKLY_QUOTA_REQUESTS (optional soft cap alert)
 * Dedupe: partner_api_alert_log key weekly:YYYY-Www
 */
import { sendAlertEmail } from './alertNotifier.js';

function resolveSlackUrl() {
  const urls = [
    process.env.PARTNER_API_WEEKLY_SLACK_WEBHOOK_URL,
    process.env.PARTNER_API_SLACK_WEBHOOK_URL,
    process.env.SLACK_WEBHOOK_URL,
  ];
  for (const raw of urls) {
    const url = String(raw || '').trim();
    if (url && !url.includes('xxxx')) return url;
  }
  return null;
}

function resolveEmailTo() {
  return String(
    process.env.PARTNER_API_WEEKLY_EMAIL_TO
    || process.env.PARTNER_API_ALERT_EMAIL_TO
    || process.env.ALERT_EMAIL_TO
    || '',
  ).trim() || null;
}

function isoWeekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

async function ensureAlertTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS partner_api_alert_log (
      id BIGSERIAL PRIMARY KEY,
      alert_key TEXT NOT NULL UNIQUE,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      http_status INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => { });
}

export async function fetchPartnerApiWeeklyStats(pool) {
  const hours = 168;
  const [summaryRes, keyStatsRes, hashRes] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*)::int AS total_requests,
         COUNT(*) FILTER (WHERE status_code >= 400)::int AS error_count,
         COUNT(*) FILTER (WHERE status_code = 429)::int AS rate_limit_count,
         COUNT(*) FILTER (WHERE status_code >= 500)::int AS server_error_count,
         COUNT(*) FILTER (WHERE status_code >= 200 AND status_code < 300)::int AS success_count
       FROM partner_api_audit_log
       WHERE created_at >= NOW() - ($1::text || ' hours')::interval`,
      [String(hours)],
    ).catch(() => ({ rows: [{}] })),
    pool.query(
      `SELECT k.name, k.key_prefix, k.is_active,
              COUNT(a.id)::int AS requests_window,
              COUNT(a.id) FILTER (WHERE a.status_code >= 400)::int AS errors_window
       FROM partner_api_keys k
       LEFT JOIN partner_api_audit_log a
         ON a.api_key_id = k.id
        AND a.created_at >= NOW() - ('168 hours')::interval
       GROUP BY k.id, k.name, k.key_prefix, k.is_active
       ORDER BY requests_window DESC
       LIMIT 20`,
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE data_sharing_consent = true)::int AS consent_users,
         COUNT(*) FILTER (WHERE partner_hash IS NOT NULL)::int AS hashed_users
       FROM users`,
    ).catch(() => ({ rows: [{}] })),
  ]);

  const summary = summaryRes.rows?.[0] || {};
  const total = Number(summary.total_requests || 0);
  const errors = Number(summary.error_count || 0);

  return {
    window_hours: hours,
    week_key: isoWeekKey(),
    summary: {
      total_requests: total,
      success_count: Number(summary.success_count || 0),
      error_count: errors,
      rate_limit_count: Number(summary.rate_limit_count || 0),
      server_error_count: Number(summary.server_error_count || 0),
      error_rate_pct: total > 0 ? Math.round((errors / total) * 1000) / 10 : 0,
    },
    key_stats: keyStatsRes.rows || [],
    partner_hash: hashRes.rows?.[0] || {},
  };
}

function buildReportText(stats, { quota, overQuota }) {
  const adminBase = String(process.env.ADMIN_APP_URL || '').replace(/\/$/, '');
  const lines = [
    '📊 *MEERAK Partner API — Weekly Trust Report*',
    `Week: ${stats.week_key} · Window: 7 days`,
    `Requests: ${stats.summary.total_requests.toLocaleString()} · Success: ${stats.summary.success_count.toLocaleString()}`,
    `Errors: ${stats.summary.error_count} (${stats.summary.error_rate_pct}%) · 429: ${stats.summary.rate_limit_count} · 5xx: ${stats.summary.server_error_count}`,
    `Partner hash: ${stats.partner_hash.hashed_users ?? 0} hashed / ${stats.partner_hash.consent_users ?? 0} consent`,
  ];

  if (quota > 0) {
    const pct = stats.summary.total_requests > 0
      ? Math.round((stats.summary.total_requests / quota) * 100)
      : 0;
    lines.push(`Weekly quota: ${stats.summary.total_requests.toLocaleString()} / ${quota.toLocaleString()} (${pct}%)${overQuota ? ' ⚠️ OVER' : ''}`);
  }

  const topKeys = (stats.key_stats || []).filter((k) => Number(k.requests_window) > 0).slice(0, 8);
  if (topKeys.length) {
    lines.push('Top keys:');
    for (const k of topKeys) {
      lines.push(`  · ${k.name || k.key_prefix}: ${k.requests_window} req, ${k.errors_window} err${k.is_active ? '' : ' (inactive)'}`);
    }
  }

  if (adminBase) lines.push(`Dashboard: ${adminBase}/?view=partner-api`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  return lines.join('\n');
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ force?: boolean }} opts
 */
export async function sendPartnerApiWeeklyReport(pool, opts = {}) {
  const slackUrl = resolveSlackUrl();
  const emailTo = resolveEmailTo();
  if (!slackUrl && !emailTo) {
    return { sent: false, reason: 'no_slack_or_email' };
  }

  const stats = await fetchPartnerApiWeeklyStats(pool);
  const quota = Number(process.env.PARTNER_API_WEEKLY_QUOTA_REQUESTS || 0);
  const overQuota = quota > 0 && stats.summary.total_requests > quota;
  const text = buildReportText(stats, { quota, overQuota });
  const plainText = text.replace(/\*/g, '');

  const alertKey = `weekly:${stats.week_key}`;
  await ensureAlertTable(pool);

  if (!opts.force) {
    const dup = await pool.query(
      `SELECT 1 FROM partner_api_alert_log WHERE alert_key = $1`,
      [alertKey],
    ).catch(() => ({ rows: [] }));
    if (dup.rows?.length) {
      return { sent: false, reason: 'deduped', alert_key: alertKey, stats };
    }
  }

  let slackStatus = 0;
  let slackSent = false;
  if (slackUrl) {
    try {
      const res = await fetch(slackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 3900) }),
      });
      slackStatus = res.status;
      slackSent = res.ok;
    } catch (e) {
      console.warn('[partner-weekly] slack:', e?.message);
    }
  }

  let emailSent = false;
  if ((!slackSent || opts.force) && emailTo) {
    const emailRes = await sendAlertEmail({
      to: emailTo,
      subject: `[MEERAK] Partner API Weekly — ${stats.week_key}`,
      text: plainText,
    });
    emailSent = !!emailRes.ok;
  }

  const sent = slackSent || emailSent;
  if (sent) {
    await pool.query(
      `INSERT INTO partner_api_alert_log (alert_key, payload, http_status)
       VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (alert_key) DO UPDATE SET
         payload = EXCLUDED.payload,
         http_status = EXCLUDED.http_status,
         created_at = NOW()`,
      [
        alertKey,
        JSON.stringify({ type: 'weekly_report', stats: stats.summary, over_quota: overQuota }),
        slackStatus || (emailSent ? 200 : 0),
      ],
    ).catch(() => { });
  }

  return {
    sent,
    alert_key: alertKey,
    slack_sent: slackSent,
    email_sent: emailSent,
    over_quota: overQuota,
    stats,
  };
}
