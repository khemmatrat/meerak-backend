/**
 * Admin: commerce insights, unified timeline, anonymized bundle, consent, partner keys.
 */
import {
  buildAnonymizedBundle,
  hashUserIdForPartner,
  runCommerceSyncCycle,
} from './userCommerceEvents.js';
import { syncPartnerHashForUser } from './partnerHashService.js';
import { getPartnerRateLimitSnapshots } from './partnerApiRoutes.js';
import { maybeAlertPartnerApiIssues } from './partnerApiSlackAlert.js';
import { sendPartnerApiWeeklyReport } from './partnerApiWeeklyReport.js';
import { buildEnrichedJobGraphs, buildSingleJobGraphDetail } from './jobGraphService.js';

function num(v, fallback = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function riskTierFromScore(score) {
  if (score >= 80) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  if (score > 0) return 'low';
  return 'none';
}

async function buildCommerceProfile(pool, userId, { days = 90 } = {}) {
  const periodDays = Math.min(Math.max(Number(days) || 90, 7), 365);

  const userRes = await pool.query(
    `SELECT id, role, data_sharing_consent, consent_at, wallet_balance, wallet_pending,
            created_at, kyc_status, partner_hash
     FROM users WHERE id = $1::uuid`,
    [userId],
  );
  if (!userRes.rows?.length) return null;
  const user = userRes.rows[0];

  const dailyRes = await pool.query(
    `SELECT day_date, spend_in, spend_out, jobs_posted, jobs_completed, jobs_disputed,
            deposits_count, withdrawals_count, escrow_held, escrow_released, category_spend
     FROM user_commerce_daily
     WHERE user_id = $1::uuid AND day_date >= (CURRENT_DATE - $2::int)
     ORDER BY day_date DESC`,
    [userId, periodDays],
  ).catch(() => ({ rows: [] }));

  const totals = {
    spend_in: 0,
    spend_out: 0,
    jobs_posted: 0,
    jobs_completed: 0,
    jobs_disputed: 0,
    deposits_count: 0,
    withdrawals_count: 0,
    escrow_held: 0,
    escrow_released: 0,
  };
  const categoryMix = {};
  for (const row of dailyRes.rows || []) {
    totals.spend_in += num(row.spend_in);
    totals.spend_out += num(row.spend_out);
    totals.jobs_posted += Number(row.jobs_posted || 0);
    totals.jobs_completed += Number(row.jobs_completed || 0);
    totals.jobs_disputed += Number(row.jobs_disputed || 0);
    totals.deposits_count += Number(row.deposits_count || 0);
    totals.withdrawals_count += Number(row.withdrawals_count || 0);
    totals.escrow_held += num(row.escrow_held);
    totals.escrow_released += num(row.escrow_released);
    const cs = row.category_spend || {};
    for (const [k, v] of Object.entries(cs)) {
      categoryMix[k] = (categoryMix[k] || 0) + num(v);
    }
  }

  const funnelRes = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE event_type = 'job_posted')::int AS jobs_opened,
       COUNT(*) FILTER (WHERE event_type IN ('payment_created', 'escrow_held', 'job_bid_accepted', 'job_accepted'))::int AS jobs_paid,
       COUNT(*) FILTER (WHERE event_type = 'job_completed')::int AS jobs_done,
       COUNT(*) FILTER (WHERE event_type = 'job_review')::int AS reviews,
       COUNT(*) FILTER (WHERE event_type = 'wallet_deposit')::int AS deposits
     FROM user_commerce_events
     WHERE user_id = $1::uuid
       AND event_at >= NOW() - ($2::int || ' days')::interval`,
    [userId, periodDays],
  ).catch(() => ({ rows: [{}] }));

  const riskRes = await pool.query(
    `SELECT COALESCE(SUM(risk_score), 0)::int AS total_score, COUNT(*)::int AS flag_count
     FROM security_anomalies
     WHERE user_id = $1::uuid AND resolved_at IS NULL`,
    [userId],
  ).catch(() => ({ rows: [{ total_score: 0, flag_count: 0 }] }));

  const riskScore = Number(riskRes.rows?.[0]?.total_score || 0);
  const eventCountRes = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM user_commerce_events WHERE user_id = $1::uuid`,
    [userId],
  ).catch(() => ({ rows: [{ cnt: 0 }] }));

  return {
    user_id: userId,
    user_hash: user.partner_hash || hashUserIdForPartner(userId),
    role: user.role,
    kyc_status: user.kyc_status,
    wallet_balance: num(user.wallet_balance),
    wallet_pending: num(user.wallet_pending),
    data_sharing_consent: !!user.data_sharing_consent,
    consent_at: user.consent_at,
    period_days: periodDays,
    event_count: Number(eventCountRes.rows?.[0]?.cnt || 0),
    daily_rows: dailyRes.rows || [],
    metrics: totals,
    category_mix: categoryMix,
    funnel: funnelRes.rows?.[0] || {},
    risk_score: riskScore,
    risk_flag_count: Number(riskRes.rows?.[0]?.flag_count || 0),
    risk_tier: riskTierFromScore(riskScore),
  };
}

async function buildUnifiedTimeline(pool, userId, { limit = 100 } = {}) {
  const cap = Math.min(Math.max(Number(limit) || 100, 20), 300);
  const items = [];

  const commerce = await pool.query(
    `SELECT id, event_type, category, amount, job_id, metadata, event_at AS ts, 'commerce' AS lane
     FROM user_commerce_events
     WHERE user_id = $1::uuid
     ORDER BY event_at DESC
     LIMIT $2`,
    [userId, cap],
  ).catch(() => ({ rows: [] }));

  for (const r of commerce.rows || []) {
    items.push({
      id: `ce-${r.id}`,
      lane: 'commerce',
      ts: r.ts,
      title: r.event_type,
      category: r.category,
      amount: r.amount != null ? num(r.amount) : null,
      job_id: r.job_id,
      detail: r.metadata,
    });
  }

  const anomalies = await pool.query(
    `SELECT id, anomaly_type, risk_level, risk_score, reason, created_at AS ts
     FROM security_anomalies
     WHERE user_id = $1::uuid
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, Math.floor(cap / 3)],
  ).catch(() => ({ rows: [] }));

  for (const r of anomalies.rows || []) {
    items.push({
      id: `sa-${r.id}`,
      lane: 'security',
      ts: r.ts,
      title: r.anomaly_type,
      category: r.risk_level,
      amount: null,
      detail: { reason: r.reason, risk_score: r.risk_score },
    });
  }

  const audit = await pool.query(
    `SELECT id, action, entity_name, entity_id, changes, created_at AS ts
     FROM audit_log
     WHERE entity_id = $1::text
        OR (changes IS NOT NULL AND changes::text LIKE '%' || $1::text || '%')
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, Math.floor(cap / 3)],
  ).catch(() => ({ rows: [] }));

  for (const r of audit.rows || []) {
    items.push({
      id: `al-${r.id}`,
      lane: 'audit',
      ts: r.ts,
      title: r.action,
      category: r.entity_name,
      amount: null,
      detail: r.changes,
      entity_id: r.entity_id,
    });
  }

  const ledger = await pool.query(
    `SELECT id, event_type, amount, net_amount, job_id, gateway, status, created_at AS ts
     FROM payment_ledger_audit
     WHERE user_id = $1::text OR provider_id = $1::text
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, Math.floor(cap / 2)],
  ).catch(() => ({ rows: [] }));

  for (const r of ledger.rows || []) {
    items.push({
      id: `pl-${r.id}`,
      lane: 'financial',
      ts: r.ts,
      title: r.event_type,
      category: r.gateway,
      amount: num(r.net_amount ?? r.amount),
      job_id: r.job_id,
      detail: { status: r.status },
    });
  }

  items.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  return items.slice(0, cap);
}

const ESCROW_STAGE_MAP = {
  payment_created: 'pay',
  escrow_held: 'hold',
  escrow_released: 'release',
  escrow_refunded: 'dispute',
};

function escrowStageFromRow(row) {
  const et = String(row.event_type || '');
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const leg = String(meta.leg || '');
  if (et === 'escrow_held' && leg === 'provider_net') return 'hold';
  if (et === 'escrow_held' && leg === 'user_debit') return 'pay';
  if (et === 'payment_created') return 'pay';
  return ESCROW_STAGE_MAP[et] || et;
}

async function buildEscrowTimeline(pool, userId, { limit = 25 } = {}) {
  const cap = Math.min(Math.max(Number(limit) || 25, 5), 80);
  const rows = await pool.query(
    `SELECT pla.job_id::text AS job_id, pla.event_type, pla.amount, pla.net_amount,
            pla.metadata, pla.created_at AS ts, pla.user_id, pla.provider_id,
            j.title, j.status AS job_status, j.category,
            j.payment_details->>'released_status' AS released_status,
            j.payment_details->>'escrow_held' AS escrow_held_flag
     FROM payment_ledger_audit pla
     LEFT JOIN jobs j ON j.id::text = pla.job_id::text
     WHERE pla.job_id IS NOT NULL
       AND (pla.user_id = $1::text OR pla.provider_id::text = $1::text
            OR j.created_by::text = $1::text OR j.accepted_by::text = $1::text)
       AND pla.event_type IN ('payment_created', 'escrow_held', 'escrow_released', 'escrow_refunded')
     ORDER BY pla.created_at DESC
     LIMIT 200`,
    [userId],
  ).catch(() => ({ rows: [] }));

  const byJob = new Map();
  for (const r of rows.rows || []) {
    const jid = String(r.job_id || '');
    if (!jid) continue;
    if (!byJob.has(jid)) {
      byJob.set(jid, {
        job_id: jid,
        title: r.title || null,
        job_status: r.job_status || null,
        category: r.category || null,
        released_status: r.released_status || null,
        escrow_held: r.escrow_held_flag === 'true' || r.escrow_held_flag === true,
        steps: [],
      });
    }
    const meta = r.metadata && typeof r.metadata === 'object' ? r.metadata : {};
    const stage = escrowStageFromRow({ event_type: r.event_type, metadata: meta });
    byJob.get(jid).steps.push({
      stage,
      event_type: r.event_type,
      amount: num(r.net_amount ?? r.amount),
      ts: r.ts,
      leg: meta.leg || null,
      actor: r.user_id ? 'client' : r.provider_id ? 'provider' : null,
    });
  }

  const commerceExtras = await pool.query(
    `SELECT job_id, event_type, event_at AS ts, amount, metadata
     FROM user_commerce_events
     WHERE user_id = $1::uuid
       AND job_id IS NOT NULL
       AND event_type IN ('escrow_released', 'job_disputed')
     ORDER BY event_at DESC
     LIMIT 100`,
    [userId],
  ).catch(() => ({ rows: [] }));

  for (const r of commerceExtras.rows || []) {
    const jid = String(r.job_id || '');
    if (!jid || !byJob.has(jid)) continue;
    const stage = r.event_type === 'escrow_released' ? 'release' : 'dispute';
    byJob.get(jid).steps.push({
      stage,
      event_type: r.event_type,
      amount: r.amount != null ? num(r.amount) : null,
      ts: r.ts,
      leg: null,
      actor: null,
      source: 'commerce_event',
    });
  }

  const jobs = [...byJob.values()].map((j) => {
    j.steps.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
    const stages = [...new Set(j.steps.map((s) => s.stage))];
    j.current_stage = stages.includes('dispute')
      ? 'dispute'
      : stages.includes('release')
        ? 'released'
        : stages.includes('hold')
          ? 'held'
          : stages.includes('pay')
            ? 'paid'
            : 'unknown';
    return j;
  });

  jobs.sort((a, b) => {
    const ta = a.steps.length ? new Date(a.steps[a.steps.length - 1].ts).getTime() : 0;
    const tb = b.steps.length ? new Date(b.steps[b.steps.length - 1].ts).getTime() : 0;
    return tb - ta;
  });

  return jobs.slice(0, cap);
}

export function registerUserCommerceAdminRoutes(app, pool, adminAuthMiddleware) {
  app.get('/api/admin/users/:id/commerce-insights', adminAuthMiddleware, async (req, res) => {
    try {
      const userId = String(req.params.id || '').trim();
      const days = Number(req.query.days) || 90;
      let profile = await buildCommerceProfile(pool, userId, { days });
      if (!profile) return res.status(404).json({ error: 'User not found' });

      if (profile.event_count === 0) {
        await runCommerceSyncCycle(pool).catch(() => { });
        profile = await buildCommerceProfile(pool, userId, { days });
      }

      res.json({ profile });
    } catch (e) {
      console.error('[commerce-insights]', e?.message);
      res.status(500).json({ error: e?.message || 'Failed to load commerce insights' });
    }
  });

  app.get('/api/admin/users/:id/unified-timeline', adminAuthMiddleware, async (req, res) => {
    try {
      const userId = String(req.params.id || '').trim();
      const limit = Number(req.query.limit) || 100;
      const items = await buildUnifiedTimeline(pool, userId, { limit });
      res.json({ items, total: items.length });
    } catch (e) {
      console.error('[unified-timeline]', e?.message);
      res.status(500).json({ error: e?.message || 'Failed to load timeline' });
    }
  });

  app.get('/api/admin/users/:id/escrow-timeline', adminAuthMiddleware, async (req, res) => {
    try {
      const userId = String(req.params.id || '').trim();
      const limit = Number(req.query.limit) || 25;
      const jobs = await buildEscrowTimeline(pool, userId, { limit });
      res.json({ jobs, total: jobs.length });
    } catch (e) {
      console.error('[escrow-timeline]', e?.message);
      res.status(500).json({ error: e?.message || 'Failed to load escrow timeline' });
    }
  });

  app.get('/api/admin/users/:id/job-graph', adminAuthMiddleware, async (req, res) => {
    try {
      const userId = String(req.params.id || '').trim();
      const limit = Number(req.query.limit) || 40;
      await runCommerceSyncCycle(pool).catch(() => { });
      const graphs = await buildEnrichedJobGraphs(pool, userId, { limit });
      res.json({ graphs, total: graphs.length, data_source: 'live' });
    } catch (e) {
      console.error('[job-graph]', e?.message);
      res.status(500).json({ error: e?.message || 'Failed to load job graph' });
    }
  });

  app.get('/api/admin/job-graph/:jobId', adminAuthMiddleware, async (req, res) => {
    try {
      const jobId = String(req.params.jobId || '').trim();
      await runCommerceSyncCycle(pool).catch(() => { });
      const graph = await buildSingleJobGraphDetail(pool, jobId);
      if (!graph) return res.status(404).json({ error: 'Job not found' });
      res.json({ graph });
    } catch (e) {
      console.error('[job-graph-detail]', e?.message);
      res.status(500).json({ error: e?.message || 'Failed' });
    }
  });

  app.get('/api/admin/users/:id/anonymized-bundle', adminAuthMiddleware, async (req, res) => {
    try {
      const userId = String(req.params.id || '').trim();
      const days = Number(req.query.days) || 90;
      const profile = await buildCommerceProfile(pool, userId, { days });
      if (!profile) return res.status(404).json({ error: 'User not found' });

      const bundle = buildAnonymizedBundle(userId, profile, {
        consent: profile.data_sharing_consent,
      });
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="trust-bundle-${profile.user_hash.slice(0, 8)}.json"`,
      );
      res.send(JSON.stringify(bundle, null, 2));
    } catch (e) {
      console.error('[anonymized-bundle]', e?.message);
      res.status(500).json({ error: e?.message || 'Export failed' });
    }
  });

  app.patch('/api/admin/users/:id/consent', adminAuthMiddleware, async (req, res) => {
    try {
      const userId = String(req.params.id || '').trim();
      const consent = !!req.body?.data_sharing_consent;
      const r = await pool.query(
        `UPDATE users
         SET data_sharing_consent = $2,
             consent_at = CASE WHEN $2 THEN NOW() ELSE consent_at END,
             updated_at = NOW()
         WHERE id = $1::uuid
         RETURNING id, data_sharing_consent, consent_at`,
        [userId, consent],
      );
      if (!r.rows?.length) return res.status(404).json({ error: 'User not found' });
      await syncPartnerHashForUser(pool, userId, consent).catch(() => { });
      res.json({ user: r.rows[0] });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'Update failed' });
    }
  });

  app.get('/api/admin/partner-api-keys', adminAuthMiddleware, async (req, res) => {
    try {
      const rows = await pool.query(
        `SELECT id, name, key_prefix, rate_limit_per_minute, weekly_quota_requests, is_active, scopes,
                created_by, created_at, last_used_at
         FROM partner_api_keys
         ORDER BY created_at DESC
         LIMIT 100`,
      );
      res.json({ keys: rows.rows || [] });
    } catch (e) {
      if (String(e?.code) === '42P01') return res.json({ keys: [] });
      res.status(500).json({ error: e?.message });
    }
  });

  app.post('/api/admin/partner-api-keys', adminAuthMiddleware, async (req, res) => {
    try {
      const crypto = await import('crypto');
      const name = String(req.body?.name || 'Partner').trim().slice(0, 120);
      const rateLimit = Math.min(Math.max(Number(req.body?.rate_limit_per_minute) || 60, 10), 600);
      const weeklyQuota = Math.max(0, Math.floor(Number(req.body?.weekly_quota_requests) || 0));
      const rawKey = `mpk_${crypto.randomBytes(24).toString('hex')}`;
      const prefix = rawKey.slice(0, 12);
      const hash = crypto.createHash('sha256').update(rawKey).digest('hex');
      const scopes = Array.isArray(req.body?.scopes) ? req.body.scopes : ['trust:read'];
      const adminEmail = req.adminUser?.email || req.adminUser?.id || 'admin';

      const r = await pool.query(
        `INSERT INTO partner_api_keys (name, key_prefix, key_hash, rate_limit_per_minute, weekly_quota_requests, scopes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6::text[], $7)
         RETURNING id, name, key_prefix, rate_limit_per_minute, weekly_quota_requests, is_active, scopes, created_at`,
        [name, prefix, hash, rateLimit, weeklyQuota, scopes, adminEmail],
      );
      res.status(201).json({
        key: r.rows[0],
        api_key: rawKey,
        warning: 'Store api_key now — it will not be shown again.',
      });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'Create failed' });
    }
  });

  app.patch('/api/admin/partner-api-keys/:id', adminAuthMiddleware, async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      const isActive = req.body?.is_active;
      const rateLimit = req.body?.rate_limit_per_minute;
      const weeklyQuota = req.body?.weekly_quota_requests;
      const sets = [];
      const params = [id];
      if (typeof isActive === 'boolean') {
        params.push(isActive);
        sets.push(`is_active = $${params.length}`);
      }
      if (rateLimit != null) {
        params.push(Math.min(Math.max(Number(rateLimit) || 60, 10), 600));
        sets.push(`rate_limit_per_minute = $${params.length}`);
      }
      if (weeklyQuota != null) {
        params.push(Math.max(0, Math.floor(Number(weeklyQuota) || 0)));
        sets.push(`weekly_quota_requests = $${params.length}`);
      }
      if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
      const r = await pool.query(
        `UPDATE partner_api_keys SET ${sets.join(', ')} WHERE id = $1::uuid RETURNING *`,
        params,
      );
      if (!r.rows?.length) return res.status(404).json({ error: 'Not found' });
      res.json({ key: r.rows[0] });
    } catch (e) {
      res.status(500).json({ error: e?.message });
    }
  });

  app.get('/api/admin/partner-api-audit', adminAuthMiddleware, async (req, res) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 10), 200);
      const keyId = req.query.api_key_id ? String(req.query.api_key_id).trim() : null;
      const params = [];
      let where = '';
      if (keyId) {
        params.push(keyId);
        where = 'WHERE a.api_key_id = $1::uuid';
      }
      params.push(limit);
      const limitIdx = params.length;
      const rows = await pool.query(
        `SELECT a.id, a.api_key_id, k.name AS key_name, a.endpoint, a.method,
                a.status_code, a.ip_address, a.request_meta, a.created_at
         FROM partner_api_audit_log a
         LEFT JOIN partner_api_keys k ON k.id = a.api_key_id
         ${where}
         ORDER BY a.created_at DESC
         LIMIT $${limitIdx}`,
        params,
      );
      res.json({ audit: rows.rows || [] });
    } catch (e) {
      if (String(e?.code) === '42P01') return res.json({ audit: [] });
      res.status(500).json({ error: e?.message });
    }
  });

  app.get('/api/admin/partner-api-dashboard', adminAuthMiddleware, async (req, res) => {
    try {
      const hours = Math.min(Math.max(Number(req.query.hours) || 24, 1), 168);

      const [summaryRes, keyStatsRes, hashRes, errorsRes, hourlyRes, keysRes] = await Promise.all([
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
          `SELECT
             k.id AS api_key_id,
             k.name,
             k.key_prefix,
             k.rate_limit_per_minute,
             k.weekly_quota_requests,
             k.is_active,
             k.last_used_at,
             COUNT(a.id)::int AS requests_window,
             COUNT(a.id) FILTER (WHERE a.created_at >= NOW() - INTERVAL '7 days')::int AS requests_7d,
             COUNT(a.id) FILTER (WHERE a.status_code >= 400)::int AS errors_window,
             COUNT(a.id) FILTER (WHERE a.status_code = 429)::int AS rate_limits_window,
             MAX(a.created_at) AS last_request_at
           FROM partner_api_keys k
           LEFT JOIN partner_api_audit_log a
             ON a.api_key_id = k.id
            AND a.created_at >= NOW() - ($1::text || ' hours')::interval
           GROUP BY k.id, k.name, k.key_prefix, k.rate_limit_per_minute, k.weekly_quota_requests, k.is_active, k.last_used_at
           ORDER BY requests_window DESC, k.name ASC`,
          [String(hours)],
        ).catch(() => ({ rows: [] })),
        pool.query(
          `SELECT
             COUNT(*) FILTER (WHERE data_sharing_consent = true)::int AS consent_users,
             COUNT(*) FILTER (WHERE partner_hash IS NOT NULL)::int AS hashed_users,
             COUNT(*) FILTER (WHERE data_sharing_consent = true AND (partner_hash IS NULL OR partner_hash = ''))::int AS pending_backfill
           FROM users`,
        ).catch(() => ({ rows: [{}] })),
        pool.query(
          `SELECT a.id, a.api_key_id, k.name AS key_name, a.endpoint, a.method,
                  a.status_code, a.ip_address, a.request_meta, a.created_at
           FROM partner_api_audit_log a
           LEFT JOIN partner_api_keys k ON k.id = a.api_key_id
           WHERE a.status_code >= 400
             AND a.created_at >= NOW() - ($1::text || ' hours')::interval
           ORDER BY a.created_at DESC
           LIMIT 30`,
          [String(hours)],
        ).catch(() => ({ rows: [] })),
        pool.query(
          `SELECT date_trunc('hour', created_at) AS hour_bucket,
                  COUNT(*)::int AS requests,
                  COUNT(*) FILTER (WHERE status_code >= 400)::int AS errors
           FROM partner_api_audit_log
           WHERE created_at >= NOW() - ($1::text || ' hours')::interval
           GROUP BY 1
           ORDER BY 1 ASC`,
          [String(hours)],
        ).catch(() => ({ rows: [] })),
        pool.query(
          `SELECT id, name, key_prefix, rate_limit_per_minute, is_active, last_used_at
           FROM partner_api_keys ORDER BY created_at DESC LIMIT 100`,
        ).catch(() => ({ rows: [] })),
      ]);

      const rateSnapshots = getPartnerRateLimitSnapshots();
      const rateByKey = new Map(rateSnapshots.map((s) => [s.api_key_id, s]));

      const keyStats = (keyStatsRes.rows || []).map((row) => {
        const live = rateByKey.get(String(row.api_key_id));
        const limit = Number(row.rate_limit_per_minute || 60);
        const liveCount = live?.requests_this_minute || 0;
        return {
          api_key_id: row.api_key_id,
          name: row.name,
          key_prefix: row.key_prefix,
          rate_limit_per_minute: limit,
          weekly_quota_requests: Number(row.weekly_quota_requests || 0),
          requests_7d: Number(row.requests_7d || 0),
          weekly_quota_pct: Number(row.weekly_quota_requests || 0) > 0
            ? Math.min(100, Math.round((Number(row.requests_7d || 0) / Number(row.weekly_quota_requests)) * 100))
            : null,
          is_active: !!row.is_active,
          last_used_at: row.last_used_at,
          requests_window: Number(row.requests_window || 0),
          errors_window: Number(row.errors_window || 0),
          rate_limits_window: Number(row.rate_limits_window || 0),
          last_request_at: row.last_request_at,
          requests_this_minute: liveCount,
          rate_usage_pct: limit > 0 ? Math.min(100, Math.round((liveCount / limit) * 100)) : 0,
          near_rate_limit: liveCount >= Math.max(1, limit - 5),
        };
      });

      const summary = summaryRes.rows?.[0] || {};
      const totalReq = Number(summary.total_requests || 0);
      const errorCount = Number(summary.error_count || 0);

      const payload = {
        window_hours: hours,
        generated_at: new Date().toISOString(),
        summary: {
          total_requests: totalReq,
          success_count: Number(summary.success_count || 0),
          error_count: errorCount,
          rate_limit_count: Number(summary.rate_limit_count || 0),
          server_error_count: Number(summary.server_error_count || 0),
          error_rate_pct: totalReq > 0 ? Math.round((errorCount / totalReq) * 1000) / 10 : 0,
          active_keys: (keysRes.rows || []).filter((k) => k.is_active).length,
          total_keys: (keysRes.rows || []).length,
        },
        partner_hash: hashRes.rows?.[0] || {
          consent_users: 0,
          hashed_users: 0,
          pending_backfill: 0,
        },
        key_stats: keyStats,
        recent_errors: errorsRes.rows || [],
        hourly: (hourlyRes.rows || []).map((r) => ({
          hour: r.hour_bucket,
          requests: Number(r.requests || 0),
          errors: Number(r.errors || 0),
        })),
        live_rate_limits: rateSnapshots,
      };

      void maybeAlertPartnerApiIssues(pool, payload).catch(() => { });

      res.json(payload);
    } catch (e) {
      if (String(e?.code) === '42P01') {
        return res.json({
          window_hours: 24,
          summary: { total_requests: 0, error_count: 0, rate_limit_count: 0 },
          key_stats: [],
          recent_errors: [],
          hourly: [],
          partner_hash: { consent_users: 0, hashed_users: 0, pending_backfill: 0 },
          live_rate_limits: [],
        });
      }
      console.error('[partner-api-dashboard]', e?.message);
      res.status(500).json({ error: e?.message || 'Failed' });
    }
  });

  app.post('/api/admin/partner-api-weekly-report/run', adminAuthMiddleware, async (req, res) => {
    try {
      const force = !!req.body?.force;
      const result = await sendPartnerApiWeeklyReport(pool, { force });
      res.json({ ok: true, ...result });
    } catch (e) {
      console.error('[partner-api-weekly-report]', e?.message);
      res.status(500).json({ error: e?.message || 'Failed' });
    }
  });
}
