/**
 * Slack alert when Partner API error rate or 429 spikes.
 * Env: PARTNER_API_SLACK_WEBHOOK_URL → SLACK_WEBHOOK_URL
 * Dedupe: partner_api_alert_log (created on first use)
 */

function resolveWebhookUrl() {
  const urls = [
    process.env.PARTNER_API_SLACK_WEBHOOK_URL,
    process.env.SLACK_WEBHOOK_URL,
    process.env.SUPPORT_SLACK_WEBHOOK_URL,
  ];
  for (const raw of urls) {
    const url = String(raw || '').trim();
    if (url && !url.includes('xxxx')) return url;
  }
  return null;
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

export async function postSlack(text) {
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
    return { sent: false, reason: e?.message };
  }
}

/**
 * @param {import('pg').Pool} pool
 * @param {{
 *   window_hours: number,
 *   summary: { total_requests: number, error_count: number, rate_limit_count: number, error_rate_pct: number },
 *   key_stats?: Array<{ name: string, errors_window: number, rate_limits_window: number, near_rate_limit?: boolean }>,
 * }} dashboard
 */
export async function maybeAlertPartnerApiIssues(pool, dashboard) {
  const hook = resolveWebhookUrl();
  if (!hook) return { sent: false, reason: 'no_webhook' };

  const total = Number(dashboard?.summary?.total_requests || 0);
  if (total < 5) return { sent: false, reason: 'low_traffic' };

  const errorCount = Number(dashboard?.summary?.error_count || 0);
  const rateLimitCount = Number(dashboard?.summary?.rate_limit_count || 0);
  const errorRate = Number(dashboard?.summary?.error_rate_pct || 0);

  const errorRateThreshold = Number(process.env.PARTNER_API_ALERT_ERROR_RATE_PCT || 15);
  const rateLimitThreshold = Number(process.env.PARTNER_API_ALERT_429_MIN || 3);
  const minErrors = Number(process.env.PARTNER_API_ALERT_MIN_ERRORS || 2);

  const triggers = [];
  if (errorRate >= errorRateThreshold && errorCount >= minErrors) {
    triggers.push(`error_rate ${errorRate}% (${errorCount}/${total})`);
  }
  if (rateLimitCount >= rateLimitThreshold) {
    triggers.push(`429 rate-limit ×${rateLimitCount}`);
  }

  const hotKeys = (dashboard?.key_stats || []).filter(
    (k) => (k.errors_window || 0) >= minErrors || (k.rate_limits_window || 0) >= 2,
  );
  if (!triggers.length && !hotKeys.length) {
    return { sent: false, reason: 'below_threshold' };
  }

  const hours = dashboard?.window_hours || 24;
  const day = new Date().toISOString().slice(0, 10);
  const bucket = triggers.length
    ? `e${Math.floor(errorRate)}_429${rateLimitCount}`
    : `keys_${hotKeys.length}`;
  const alertKey = `${day}:h${hours}:${bucket}`;

  await ensureAlertTable(pool);
  const dup = await pool.query(
    `SELECT 1 FROM partner_api_alert_log WHERE alert_key = $1`,
    [alertKey],
  ).catch(() => ({ rows: [] }));
  if (dup.rows?.length) return { sent: false, reason: 'deduped', alert_key: alertKey };

  const adminBase = String(process.env.ADMIN_APP_URL || process.env.ADMIN_URL || '').replace(/\/$/, '');
  const lines = [
    '⚠️ *MEERAK Partner API Alert*',
    `Window: ${hours}h`,
    `Requests: ${total} · Errors: ${errorCount} (${errorRate}%) · 429: ${rateLimitCount}`,
    triggers.length ? `Triggers: ${triggers.join(', ')}` : null,
    hotKeys.length
      ? `Hot keys: ${hotKeys.slice(0, 5).map((k) => `${k.name} (err ${k.errors_window}, 429 ${k.rate_limits_window})`).join('; ')}`
      : null,
    adminBase ? `Dashboard: ${adminBase}/?view=partner-api` : null,
    `Time: ${new Date().toISOString()}`,
  ].filter(Boolean);

  const result = await postSlack(lines.join('\n'));
  if (result.sent) {
    await pool.query(
      `INSERT INTO partner_api_alert_log (alert_key, payload, http_status)
       VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (alert_key) DO NOTHING`,
      [
        alertKey,
        JSON.stringify({ triggers, errorRate, rateLimitCount, total }),
        result.status || 200,
      ],
    ).catch(() => { });
  }
  return { sent: !!result.sent, alert_key: alertKey, triggers };
}
