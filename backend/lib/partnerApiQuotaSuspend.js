/**
 * Tier 5.2 — auto-suspend Partner API key after repeated weekly-quota breaches.
 * Env: PARTNER_API_AUTO_SUSPEND_ON_QUOTA=1
 *      PARTNER_API_QUOTA_SUSPEND_MIN_DAYS=3 (distinct breach days in rolling 7d)
 */
import { postSlack as postPartnerSlack } from './partnerApiSlackAlert.js';

export function isPartnerQuotaAutoSuspendEnabled() {
  return String(process.env.PARTNER_API_AUTO_SUSPEND_ON_QUOTA || '').trim() === '1';
}

export function getPartnerQuotaSuspendMinDays() {
  return Math.min(Math.max(Number(process.env.PARTNER_API_QUOTA_SUSPEND_MIN_DAYS || 3), 1), 7);
}

async function countQuotaBreachDays(pool, keyId) {
  const r = await pool.query(
    `SELECT COUNT(DISTINCT date_trunc('day', created_at AT TIME ZONE 'UTC'))::int AS days
     FROM partner_api_audit_log
     WHERE api_key_id = $1::uuid
       AND status_code = 429
       AND COALESCE(request_meta->>'reason', '') = 'weekly_quota'
       AND created_at >= NOW() - INTERVAL '7 days'`,
    [keyId],
  ).catch(() => ({ rows: [{ days: 0 }] }));
  return Number(r.rows?.[0]?.days || 0);
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ id: string, name?: string }} keyRow
 * @param {{ weekly_quota: number, weekly_used: number }} meta
 */
export async function maybeAutoSuspendPartnerKeyOnQuota(pool, keyRow, meta = {}) {
  if (!isPartnerQuotaAutoSuspendEnabled()) {
    return { suspended: false, reason: 'disabled' };
  }
  if (!keyRow?.id) return { suspended: false, reason: 'no_key' };

  const breachDays = await countQuotaBreachDays(pool, keyRow.id);
  const minDays = getPartnerQuotaSuspendMinDays();
  if (breachDays < minDays) {
    return { suspended: false, reason: 'below_threshold', breach_days: breachDays, min_days: minDays };
  }

  const upd = await pool.query(
    `UPDATE partner_api_keys
     SET is_active = false
     WHERE id = $1::uuid AND is_active = true
     RETURNING id, name`,
    [keyRow.id],
  ).catch(() => ({ rows: [] }));

  if (!upd.rows?.length) {
    return { suspended: false, reason: 'already_inactive', breach_days: breachDays };
  }

  const name = upd.rows[0].name || keyRow.name || keyRow.id;
  const adminBase = String(process.env.ADMIN_APP_URL || '').replace(/\/$/, '');
  const text = [
    '🛑 *Partner API key auto-suspended (weekly quota)*',
    `Key: ${name} (\`${String(keyRow.id).slice(0, 8)}…\`)`,
    `Quota: ${meta.weekly_used ?? '?'}/${meta.weekly_quota ?? '?'} (7d)`,
    `Breach days (7d): ${breachDays} (threshold ${minDays})`,
    adminBase ? `Admin: ${adminBase}/partner-api` : '',
    `At: ${new Date().toISOString()}`,
  ].filter(Boolean).join('\n');

  const slack = await postPartnerSlack(text).catch(() => ({ sent: false }));

  await pool.query(
    `INSERT INTO partner_api_alert_log (alert_key, payload, http_status)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (alert_key) DO UPDATE SET payload = EXCLUDED.payload, created_at = NOW()`,
    [
      `quota_suspend:${keyRow.id}`,
      JSON.stringify({
        type: 'quota_auto_suspend',
        key_id: keyRow.id,
        name,
        breach_days: breachDays,
        weekly_quota: meta.weekly_quota,
        weekly_used: meta.weekly_used,
      }),
      slack.sent ? 200 : 0,
    ],
  ).catch(() => { });

  return {
    suspended: true,
    breach_days: breachDays,
    min_days: minDays,
    slack_sent: !!slack.sent,
  };
}
