/**
 * Partner API v1 — API key auth, rate limit, audit log.
 */
import crypto from 'crypto';
import { hashUserIdForPartner } from './userCommerceEvents.js';

const rateBuckets = new Map();

function hashApiKey(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

function clientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || ''
  );
}

async function auditPartnerRequest(pool, keyId, req, statusCode, meta = {}) {
  try {
    await pool.query(
      `INSERT INTO partner_api_audit_log (api_key_id, endpoint, method, status_code, ip_address, request_meta)
       VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb)`,
      [
        keyId,
        req.originalUrl || req.url,
        req.method,
        statusCode,
        clientIp(req),
        JSON.stringify(meta),
      ],
    );
  } catch {
    /* non-fatal */
  }
}

function checkRateLimit(keyId, limitPerMinute) {
  const now = Date.now();
  const windowMs = 60000;
  let bucket = rateBuckets.get(keyId);
  if (!bucket || now - bucket.start >= windowMs) {
    bucket = { start: now, count: 0 };
    rateBuckets.set(keyId, bucket);
  }
  bucket.count += 1;
  if (bucket.count > limitPerMinute) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.start + windowMs - now) / 1000) };
  }
  return { ok: true, remaining: limitPerMinute - bucket.count };
}

/** In-memory rate-limit windows for admin dashboard (current minute). */
export function getPartnerRateLimitSnapshots() {
  const now = Date.now();
  const windowMs = 60000;
  const out = [];
  for (const [apiKeyId, bucket] of rateBuckets.entries()) {
    if (now - bucket.start >= windowMs) continue;
    out.push({
      api_key_id: apiKeyId,
      requests_this_minute: bucket.count,
      window_started_at: new Date(bucket.start).toISOString(),
      seconds_remaining: Math.max(0, Math.ceil((bucket.start + windowMs - now) / 1000)),
    });
  }
  return out;
}

export function createPartnerApiMiddleware(pool) {
  return async function partnerApiAuth(req, res, next) {
    const raw = String(req.headers['x-api-key'] || req.headers.authorization?.replace(/^Bearer\s+/i, '') || '').trim();
    if (!raw) {
      return res.status(401).json({ error: 'Missing API key (X-API-Key or Authorization Bearer)' });
    }

    let keyRow;
    try {
      const r = await pool.query(
        `SELECT id, name, rate_limit_per_minute, weekly_quota_requests, is_active, scopes
         FROM partner_api_keys
         WHERE key_hash = $1 AND is_active = true`,
        [hashApiKey(raw)],
      );
      keyRow = r.rows?.[0];
    } catch (e) {
      if (String(e?.code) === '42703') {
        const r2 = await pool.query(
          `SELECT id, name, rate_limit_per_minute, is_active, scopes
           FROM partner_api_keys
           WHERE key_hash = $1 AND is_active = true`,
          [hashApiKey(raw)],
        ).catch(() => ({ rows: [] }));
        keyRow = r2.rows?.[0] ? { ...r2.rows[0], weekly_quota_requests: 0 } : null;
      } else if (String(e?.code) === '42P01') {
        return res.status(503).json({ error: 'Partner API not configured' });
      } else {
        return res.status(500).json({ error: 'Auth error' });
      }
    }

    if (!keyRow) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const weeklyQuota = Number(keyRow.weekly_quota_requests || 0);
    if (weeklyQuota > 0) {
      const wk = await pool.query(
        `SELECT COUNT(*)::int AS c FROM partner_api_audit_log
         WHERE api_key_id = $1::uuid AND created_at >= NOW() - INTERVAL '7 days'`,
        [keyRow.id],
      ).catch(() => ({ rows: [{ c: 0 }] }));
      const used = Number(wk.rows?.[0]?.c || 0);
      if (used >= weeklyQuota) {
        res.setHeader('Retry-After', '3600');
        const quotaMeta = {
          reason: 'weekly_quota',
          weekly_quota: weeklyQuota,
          weekly_used: used,
        };
        await auditPartnerRequest(pool, keyRow.id, req, 429, quotaMeta);
        void import('./partnerApiQuotaSuspend.js').then(({ maybeAutoSuspendPartnerKeyOnQuota }) =>
          maybeAutoSuspendPartnerKeyOnQuota(pool, keyRow, quotaMeta),
        ).catch(() => { });
        return res.status(429).json({
          error: 'Weekly quota exceeded',
          weekly_quota: weeklyQuota,
          weekly_used: used,
          retry_after_sec: 3600,
        });
      }
    }

    const rl = checkRateLimit(String(keyRow.id), Number(keyRow.rate_limit_per_minute || 60));
    if (!rl.ok) {
      res.setHeader('Retry-After', String(rl.retryAfterSec));
      await auditPartnerRequest(pool, keyRow.id, req, 429, { reason: 'rate_limit' });
      return res.status(429).json({ error: 'Rate limit exceeded', retry_after_sec: rl.retryAfterSec });
    }

    req.partnerKey = keyRow;
    res.on('finish', () => {
      void auditPartnerRequest(pool, keyRow.id, req, res.statusCode, {
        remaining: rl.remaining,
      });
      void pool.query(
        `UPDATE partner_api_keys SET last_used_at = NOW() WHERE id = $1::uuid`,
        [keyRow.id],
      ).catch(() => { });
    });
    next();
  };
}

function requireScope(scope) {
  return (req, res, next) => {
    const scopes = req.partnerKey?.scopes || [];
    if (!scopes.includes(scope) && !scopes.includes('*')) {
      return res.status(403).json({ error: `Scope required: ${scope}` });
    }
    next();
  };
}

async function resolveUserHashToProfile(pool, userHash) {
  const hash = String(userHash || '').trim().slice(0, 64);
  if (!hash) return null;

  const indexed = await pool.query(
    `SELECT id, data_sharing_consent, role, kyc_status, created_at
     FROM users
     WHERE partner_hash = $1 AND data_sharing_consent = true
     LIMIT 1`,
    [hash],
  ).catch(() => ({ rows: [] }));

  if (indexed.rows?.length) return indexed.rows[0];

  // Legacy fallback until backfill completes
  const salt = process.env.PARTNER_API_HASH_SALT || 'meerak-partner-v1';
  const users = await pool.query(
    `SELECT id, data_sharing_consent, role, kyc_status, created_at
     FROM users
     WHERE data_sharing_consent = true AND partner_hash IS NULL
     ORDER BY created_at DESC
     LIMIT 500`,
  ).catch(() => ({ rows: [] }));

  for (const u of users.rows || []) {
    if (hashUserIdForPartner(String(u.id), salt) === hash) {
      void pool.query(
        `UPDATE users SET partner_hash = $2, updated_at = NOW() WHERE id = $1::uuid AND partner_hash IS NULL`,
        [u.id, hash],
      ).catch(() => { });
      return u;
    }
  }
  return null;
}

export function registerPartnerApiRoutes(app, pool) {
  const auth = createPartnerApiMiddleware(pool);

  app.get('/api/v1/partner/trust/:userHash', auth, requireScope('trust:read'), async (req, res) => {
    try {
      const userHash = String(req.params.userHash || '').trim().slice(0, 64);
      if (!userHash) return res.status(400).json({ error: 'userHash required' });

      const user = await resolveUserHashToProfile(pool, userHash);
      if (!user) {
        return res.status(404).json({ error: 'Profile not found or consent not granted' });
      }

      const daily = await pool.query(
        `SELECT SUM(spend_in)::numeric AS spend_in, SUM(spend_out)::numeric AS spend_out,
                SUM(jobs_posted)::int AS jobs_posted, SUM(jobs_completed)::int AS jobs_completed
         FROM user_commerce_daily
         WHERE user_id = $1::uuid AND day_date >= CURRENT_DATE - 90`,
        [user.id],
      ).catch(() => ({ rows: [{}] }));

      const risk = await pool.query(
        `SELECT COALESCE(SUM(risk_score), 0)::int AS score FROM security_anomalies
         WHERE user_id = $1::uuid AND resolved_at IS NULL`,
        [user.id],
      ).catch(() => ({ rows: [{ score: 0 }] }));

      const d = daily.rows?.[0] || {};
      res.json({
        schema_version: 1,
        user_hash: userHash,
        role: user.role,
        kyc_verified: String(user.kyc_status || '').toLowerCase() === 'approved',
        metrics_90d: {
          spend_in: parseFloat(d.spend_in) || 0,
          spend_out: parseFloat(d.spend_out) || 0,
          jobs_posted: Number(d.jobs_posted || 0),
          jobs_completed: Number(d.jobs_completed || 0),
        },
        risk_score: Number(risk.rows?.[0]?.score || 0),
      });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'Failed' });
    }
  });

  app.get('/api/v1/partner/health', auth, (req, res) => {
    res.json({ ok: true, partner: req.partnerKey?.name });
  });
}
