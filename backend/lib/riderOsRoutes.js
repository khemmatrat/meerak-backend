/**
 * Native mobile Rider OS API — registration, jobs, map telemetry, repeat-hire.
 * Proxies dispatch-svc when DISPATCH_SVC_URL is set; falls back to commerce.* SQL when available.
 */

import {
  adminAdjustRiderCredit,
  getRiderCreditSummary,
  listRiderCreditLedger,
  resolveRiderIdForUser,
  writeRiderFinancialAudit,
  adminSetRiderCreditLimit,
  riderCreditTopup,
  openRiderCreditLine,
} from './riderCreditLedger.js';
import {
  topupRiderCreditFromWallet,
  createRiderCreditPromptPayCharge,
  pollAndFulfillRiderCreditTopup,
} from './riderCreditTopupPayment.js';
import {
  batchReconcileRiderCreditTopup,
  startRiderCreditTopupReconcileCron,
} from './riderCreditTopupReconcile.js';
import { isPaysoEnabledFromEnv } from './paysoEnvFlag.js';
import { getRiderKycStatus, submitRiderOsKyc, buildRiderKycPayloadFromBody } from './riderKycSubmit.js';
import { RIDER_KYC_MISSING_LABELS } from './riderKycDocs.js';
import { getRiderKycPortrait } from './riderKycPortrait.js';
import { isTrustedKycImageUrl } from './kycTrustedUrl.js';
import {
  verifyAndIssueRiderFaceSession,
  getRiderFaceSessionStatus,
  checkRiderFaceAction,
  listRiderFaceIncidents,
} from './riderFaceSession.js';

function dispatchBase() {
  return (process.env.DISPATCH_SVC_URL || process.env.DISPATCH_API_URL || '').replace(/\/$/, '');
}

function authHeader(req) {
  const raw = req.headers?.authorization || '';
  return raw.startsWith('Bearer ') ? raw : raw ? `Bearer ${raw}` : '';
}

async function dispatchFetch(path, { method = 'GET', body, token, userId } = {}) {
  const base = dispatchBase();
  if (!base) return { ok: false, reason: 'no_dispatch', status: 503, data: {} };
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = token;
  if (userId) headers['X-User-Id'] = String(userId);
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, reason: e?.message || 'dispatch_error', status: 502, data: {} };
  }
}

async function riderForUser(pool, userId, token) {
  const r = await dispatchFetch(`/v1/dispatch/riders/me?user_id=${encodeURIComponent(userId)}`, {
    token,
    userId,
  });
  if (r.ok && r.data?.rider_id) return r.data;

  try {
    const q = await pool.query(
      `SELECT id AS rider_id, display_name, phone, vehicle, plate, kyc_status, active, suspended,
              earnings_micro
         FROM commerce.dispatch_riders
        WHERE user_id = $1::text
        LIMIT 1`,
      [String(userId)],
    );
    if (q.rows?.[0]) return q.rows[0];
  } catch {
    /* schema optional */
  }
  return null;
}

async function kycRiderMeta(pool, userId) {
  try {
    const q = await pool.query(
      `SELECT id, status, vehicles_json, address, created_at, selfie_photo_url
         FROM kyc_submissions
        WHERE user_id = $1::uuid
          AND (
            address ILIKE '%AQOND แอปไรเดอร์%'
            OR vehicles_json::text ILIKE '%aqond_delivery%'
            OR vehicles_json::text ILIKE '%aqond_storefront%'
            OR vehicles_json::text ILIKE '%rider_os%'
          )
        ORDER BY created_at DESC
        LIMIT 1`,
      [userId],
    );
    return q.rows?.[0] || null;
  } catch {
    return null;
  }
}

async function repeatCustomers(pool, riderId) {
  try {
    const r = await pool.query(
      `SELECT buyer_id,
              MAX(recipient_name) AS recipient_name,
              MAX(customer_phone) AS customer_phone,
              MAX(address) AS address,
              MAX(merchant_id) AS merchant_id,
              MAX(merchant_name) AS merchant_name,
              MAX(updated_at) AS last_at,
              COUNT(*)::int AS trips,
              (array_agg(order_id ORDER BY updated_at DESC))[1] AS last_order_id,
              (array_agg(id ORDER BY updated_at DESC))[1] AS last_job_id
         FROM commerce.dispatch_jobs
        WHERE rider_id = $1
          AND phase IN ('rider_completed', 'handoff')
        GROUP BY buyer_id
        HAVING buyer_id IS NOT NULL AND buyer_id <> ''
        ORDER BY MAX(updated_at) DESC
        LIMIT 30`,
      [riderId],
    );
    return r.rows;
  } catch {
    return [];
  }
}

function riderDispatchMode() {
  const url = (process.env.DISPATCH_SVC_URL || process.env.DISPATCH_API_URL || '').trim();
  if (url) return 'dispatch-svc';
  return 'commerce-sql-fallback';
}

export function registerRiderOsRoutes(app, pool, { authenticateToken, adminAuthMiddleware }) {
  startRiderCreditTopupReconcileCron(pool);

  /** Technical readiness — schema, PaySo, dispatch mode */
  app.get('/api/rider-os/ready', async (_req, res) => {
    const checks = {
      commerce_dispatch_riders: false,
      rider_credit_accounts: false,
      rider_credit_topup_charges: false,
      payso_configured: isPaysoEnabledFromEnv(),
      dispatch_mode: riderDispatchMode(),
    };
    try {
      await pool.query('SELECT 1 FROM commerce.dispatch_riders LIMIT 1');
      checks.commerce_dispatch_riders = true;
    } catch {
      /* optional */
    }
    try {
      await pool.query('SELECT 1 FROM commerce.rider_credit_accounts LIMIT 1');
      checks.rider_credit_accounts = true;
    } catch {
      /* optional */
    }
    try {
      await pool.query('SELECT 1 FROM rider_credit_topup_charges LIMIT 1');
      checks.rider_credit_topup_charges = true;
    } catch {
      /* optional */
    }
    const ready =
      checks.commerce_dispatch_riders &&
      checks.rider_credit_accounts &&
      checks.rider_credit_topup_charges;
    res.status(ready ? 200 : 503).json({
      ready,
      checks,
      hint: !checks.commerce_dispatch_riders
        ? 'Run migration 262_rider_os_commerce_bootstrap.sql'
        : undefined,
    });
  });

  /** Profile + KYC snapshot for native Rider OS shell */
  app.get('/api/rider-os/me', authenticateToken, async (req, res) => {
    try {
      const userId = String(req.user?.id || '').trim();
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const token = authHeader(req);
      const rider = await riderForUser(pool, userId, token);
      const kyc = await kycRiderMeta(pool, userId);

      let vehicles = [];
      try {
        vehicles = kyc?.vehicles_json
          ? typeof kyc.vehicles_json === 'string'
            ? JSON.parse(kyc.vehicles_json)
            : kyc.vehicles_json
          : [];
      } catch {
        vehicles = [];
      }

      res.json({
        registered: !!(rider?.rider_id || vehicles.length),
        rider: rider || null,
        portrait: await getRiderKycPortrait(pool, userId),
        kyc: kyc
          ? {
              submission_id: kyc.id,
              status: kyc.status,
              submitted_at: kyc.created_at,
              selfie_photo_url: kyc.selfie_photo_url || null,
              vehicles,
            }
          : null,
      });
    } catch (e) {
      console.error('GET /api/rider-os/me', e);
      res.status(500).json({ error: 'me_failed' });
    }
  });

  /** Verified selfie portrait for rider profile (from KYC — not manual upload) */
  app.get('/api/rider-os/kyc/portrait', authenticateToken, async (req, res) => {
    try {
      const userId = String(req.user?.id || '').trim();
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const portrait = await getRiderKycPortrait(pool, userId);
      res.json(portrait);
    } catch (e) {
      console.error('GET /api/rider-os/kyc/portrait', e);
      res.status(500).json({ error: 'portrait_failed' });
    }
  });

  /**
   * Reuses POST /api/partner/delivery/register for admin visibility.
   */
  app.post('/api/rider-os/register', authenticateToken, async (req, res) => {
    try {
      const userId = String(req.user?.id || '').trim();
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const body = req.body || {};
      const displayName = String(body.display_name || '').trim();
      const phone = String(body.phone || '').trim();
      const plate = String(body.plate || '').trim();
      const bankAccount = String(body.bank_account || '').trim();
      const vehicle = String(body.vehicle || 'motorcycle').trim();

      if (!displayName || !phone || !plate || !bankAccount) {
        return res.status(400).json({
          error: 'missing_fields',
          message: 'กรุณากรอกชื่อ เบอร์โทร ทะเบียนรถ และบัญชีรับเงิน',
        });
      }

      const token = authHeader(req);
      let dispatchRiderId = null;
      let dispatchData = {};

      const dr = await dispatchFetch('/v1/dispatch/riders', {
        method: 'POST',
        token,
        userId,
        body: {
          user_id: userId,
          display_name: displayName,
          phone,
          vehicle,
          plate,
          bank_account: bankAccount,
        },
      });
      dispatchData = dr.data || {};
      if (dr.ok || dr.status === 409) {
        dispatchRiderId = dispatchData.rider_id || null;
      }

      // Central KYC — forward to existing route handler via internal fetch
      const port = process.env.PORT || 3001;
      const host = process.env.BACKEND_INTERNAL_URL || `http://127.0.0.1:${port}`;
      const centralRes = await fetch(`${host.replace(/\/$/, '')}/api/partner/delivery/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token,
        },
        body: JSON.stringify({
          display_name: displayName,
          phone,
          plate,
          bank_account: bankAccount,
          vehicle,
          source: 'aqond_mobile_rider_os',
          dispatch_rider_id: dispatchRiderId,
        }),
        signal: AbortSignal.timeout(20000),
      });
      const central = await centralRes.json().catch(() => ({}));

      if (!centralRes.ok && centralRes.status !== 409) {
        return res.status(centralRes.status || 500).json({
          error: central.error || 'central_register_failed',
          message: central.message || 'บันทึกข้อมูลไม่สำเร็จ',
          dispatch: dispatchData,
        });
      }

      if (dispatchRiderId) {
        await openRiderCreditLine(pool, dispatchRiderId, userId).catch(() => null);
      }

      res.json({
        success: true,
        rider_id: dispatchRiderId,
        dispatch: dispatchData,
        central,
        message:
          central.message ||
          'สมัครไรเดอร์แล้ว — รอแอดมินอนุมัติ จากนั้นเปิดรับงานได้เลย',
      });
    } catch (e) {
      console.error('POST /api/rider-os/register', e);
      res.status(500).json({ error: e?.message || 'register_failed' });
    }
  });

  app.get('/api/rider-os/jobs', authenticateToken, async (req, res) => {
    try {
      const userId = String(req.user?.id || '').trim();
      const token = authHeader(req);
      const mode = String(req.query.mode || 'open');
      const rider = await riderForUser(pool, userId, token);
      const riderId = rider?.rider_id;
      if (!riderId) return res.status(404).json({ error: 'rider_not_registered' });

      const qs =
        mode === 'open'
          ? 'status=open'
          : `rider_id=${encodeURIComponent(riderId)}`;
      const r = await dispatchFetch(`/v1/dispatch/jobs?${qs}`, { token, userId });
      if (!r.ok && r.reason === 'no_dispatch') {
        return res.json({ jobs: [], source: 'offline' });
      }
      res.json({ jobs: r.data?.jobs || [], source: 'dispatch-svc' });
    } catch (e) {
      console.error('GET /api/rider-os/jobs', e);
      res.status(500).json({ error: 'jobs_failed' });
    }
  });

  app.post('/api/rider-os/jobs/:id/accept', authenticateToken, async (req, res) => {
    try {
      const userId = String(req.user?.id || '').trim();
      const token = authHeader(req);
      const rider = await riderForUser(pool, userId, token);
      const riderId = rider?.rider_id;
      if (!riderId) return res.status(404).json({ error: 'rider_not_registered' });

      const jobId = String(req.params.id || '').trim();

      // Face gate (ตอกบัตรเช้า / strict / passenger / COD สูง) — server enforced
      const faceGate = await checkRiderFaceAction(pool, {
        userId,
        riderId: String(riderId),
        action: 'accept_job',
        faceSessionToken: req.body?.face_session_token || req.body?.faceSessionToken,
        deviceFingerprint: req.body?.device_fingerprint || req.body?.deviceFingerprint,
        lat: req.body?.lat != null ? Number(req.body.lat) : undefined,
        lng: req.body?.lng != null ? Number(req.body.lng) : undefined,
        jobType: req.body?.job_type || req.body?.jobType,
        paymentMethod: req.body?.payment_method || req.body?.paymentMethod,
        amountMicro: req.body?.amount_micro ?? req.body?.amountMicro,
      });
      if (!faceGate.ok) {
        return res.status(403).json(faceGate);
      }

      const r = await dispatchFetch(`/v1/dispatch/jobs/${encodeURIComponent(jobId)}/accept`, {
        method: 'POST',
        token,
        userId,
        body: { rider_id: riderId },
      });
      if (!r.ok) {
        return res.status(r.status || 500).json({
          error: r.data?.error || r.reason || 'accept_failed',
          message: r.data?.message || 'รับงานไม่สำเร็จ',
        });
      }
      res.json({ success: true, job: r.data?.job || r.data });
    } catch (e) {
      console.error('POST /api/rider-os/jobs/:id/accept', e);
      res.status(500).json({ error: 'accept_failed' });
    }
  });

  app.post('/api/rider-os/status', authenticateToken, async (req, res) => {
    try {
      const userId = String(req.user?.id || '').trim();
      const token = authHeader(req);
      const rider = await riderForUser(pool, userId, token);
      const riderId = rider?.rider_id;
      if (!riderId) return res.status(404).json({ error: 'rider_not_registered' });

      const online = req.body?.online !== false;

      // Face gate — บังคับสแกนหน้า (ตอกบัตรเช้า / strict) ก่อนเปิดออนไลน์
      if (online) {
        const faceGate = await checkRiderFaceAction(pool, {
          userId,
          riderId: String(riderId),
          action: 'go_online',
          faceSessionToken: req.body?.face_session_token || req.body?.faceSessionToken,
          deviceFingerprint: req.body?.device_fingerprint || req.body?.deviceFingerprint,
          lat: req.body?.lat != null ? Number(req.body.lat) : undefined,
          lng: req.body?.lng != null ? Number(req.body.lng) : undefined,
        });
        if (!faceGate.ok) {
          return res.status(403).json(faceGate);
        }
      }

      try {
        await pool.query(
          `UPDATE commerce.dispatch_riders SET active = $2, updated_at = NOW() WHERE id = $1`,
          [riderId, online],
        );
      } catch {
        /* optional schema */
      }
      res.json({ ok: true, rider_id: riderId, online });
    } catch (e) {
      console.error('POST /api/rider-os/status', e);
      res.status(500).json({ error: 'status_failed' });
    }
  });

  app.post('/api/rider-os/telemetry', authenticateToken, async (req, res) => {
    try {
      const userId = String(req.user?.id || '').trim();
      const token = authHeader(req);
      const rider = await riderForUser(pool, userId, token);
      const riderId = rider?.rider_id;
      if (!riderId) return res.status(404).json({ error: 'rider_not_registered' });

      const lat = Number(req.body?.lat);
      const lng = Number(req.body?.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        try {
          await pool.query(
            `UPDATE commerce.dispatch_riders
                SET last_lat = $2, last_lng = $3, last_seen_at = NOW()
              WHERE id = $1`,
            [riderId, lat, lng],
          );
        } catch {
          /* columns may not exist in all envs */
        }
      }
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: 'telemetry_failed' });
    }
  });

  app.get('/api/rider-os/repeat-customers', authenticateToken, async (req, res) => {
    try {
      const userId = String(req.user?.id || '').trim();
      const token = authHeader(req);
      const rider = await riderForUser(pool, userId, token);
      const riderId = rider?.rider_id;
      if (!riderId) return res.status(404).json({ error: 'rider_not_registered' });

      const customers = await repeatCustomers(pool, riderId);
      res.json({ customers });
    } catch (e) {
      console.error('GET /api/rider-os/repeat-customers', e);
      res.status(500).json({ error: 'repeat_failed' });
    }
  });

  /** Create a repeat delivery job for a prior customer (rider-initiated re-hire). */
  app.post('/api/rider-os/repeat-hire', authenticateToken, async (req, res) => {
    try {
      const userId = String(req.user?.id || '').trim();
      const token = authHeader(req);
      const rider = await riderForUser(pool, userId, token);
      const riderId = rider?.rider_id;
      if (!riderId) return res.status(404).json({ error: 'rider_not_registered' });

      const lastJobId = String(req.body?.last_job_id || '').trim();
      if (!lastJobId) {
        return res.status(400).json({ error: 'last_job_id required' });
      }

      let prior = null;
      try {
        const q = await pool.query(
          `SELECT id, order_id, merchant_id, buyer_id, merchant_name, items_summary, address,
                  payment_method, amount_micro, job_type,
                  pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
                  customer_phone, recipient_name
             FROM commerce.dispatch_jobs
            WHERE id = $1 AND rider_id = $2
            LIMIT 1`,
          [lastJobId, riderId],
        );
        prior = q.rows?.[0] || null;
      } catch {
        prior = null;
      }
      if (!prior) {
        return res.status(404).json({ error: 'prior_job_not_found' });
      }

      const newOrderId = `rehire-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const create = await dispatchFetch('/v1/dispatch/jobs', {
        method: 'POST',
        token,
        userId,
        body: {
          order_id: newOrderId,
          merchant_id: prior.merchant_id,
          buyer_id: prior.buyer_id,
          merchant_name: prior.merchant_name,
          items_summary: prior.items_summary || 'จ้างซ้ำ — ส่งของ',
          address: prior.address,
          payment_method: prior.payment_method || 'cod',
          amount_micro: prior.amount_micro || 0,
          job_type: prior.job_type || 'parcel',
          pickup_lat: Number(prior.pickup_lat) || 13.724,
          pickup_lng: Number(prior.pickup_lng) || 100.534,
          dropoff_lat: Number(prior.dropoff_lat) || 13.728,
          dropoff_lng: Number(prior.dropoff_lng) || 100.52,
          customer_phone: prior.customer_phone,
          recipient_name: prior.recipient_name,
          handoff_note: `repeat_hire from ${prior.order_id}`,
          auto_match: false,
        },
      });

      if (!create.ok) {
        return res.status(create.status || 500).json({
          error: create.data?.error || 'create_failed',
          message: 'สร้างงานจ้างซ้ำไม่สำเร็จ',
        });
      }

      const jobId = create.data?.job?.id;
      let accepted = null;
      if (jobId) {
        const acc = await dispatchFetch(`/v1/dispatch/jobs/${encodeURIComponent(jobId)}/accept`, {
          method: 'POST',
          token,
          userId,
          body: { rider_id: riderId },
        });
        if (acc.ok) accepted = acc.data?.job || acc.data;
      }

      res.json({
        success: true,
        order_id: newOrderId,
        job: accepted || create.data?.job,
        message: 'สร้างงานจ้างซ้ำแล้ว — ไปรับงานบนแผนที่ได้เลย',
      });
    } catch (e) {
      console.error('POST /api/rider-os/repeat-hire', e);
      res.status(500).json({ error: 'repeat_hire_failed' });
    }
  });

  /** Admin — rider ops snapshot for User Management */
  app.get('/api/admin/rider-os/users/:userId', adminAuthMiddleware, async (req, res) => {
    try {
      const userId = String(req.params.userId || '').trim();
      if (!userId) return res.status(400).json({ error: 'userId required' });

      const rider = await riderForUser(pool, userId, '');
      const kyc = await kycRiderMeta(pool, userId);
      let vehicles = [];
      try {
        vehicles = kyc?.vehicles_json
          ? typeof kyc.vehicles_json === 'string'
            ? JSON.parse(kyc.vehicles_json)
            : kyc.vehicles_json
          : [];
      } catch {
        vehicles = [];
      }

      let stats = { completed_trips: 0, active_jobs: 0 };
      if (rider?.rider_id) {
        try {
          const s = await pool.query(
            `SELECT
               COUNT(*) FILTER (WHERE phase IN ('rider_completed','handoff'))::int AS completed_trips,
               COUNT(*) FILTER (WHERE status IN ('assigned','active'))::int AS active_jobs
             FROM commerce.dispatch_jobs
            WHERE rider_id = $1`,
            [rider.rider_id],
          );
          stats = s.rows?.[0] || stats;
        } catch {
          /* optional */
        }
      }

      res.json({
        user_id: userId,
        rider: rider
          ? {
              ...rider,
              ...(await getRiderCreditSummary(pool, rider.rider_id, userId).catch(() => null)),
            }
          : null,
        kyc_status: kyc?.status || null,
        kyc_submission_id: kyc?.id || null,
        vehicles,
        stats,
        channel: 'aqond_mobile_rider_os',
      });
    } catch (e) {
      console.error('GET /api/admin/rider-os/users/:userId', e);
      res.status(500).json({ error: 'admin_rider_failed' });
    }
  });

  /** Rider — own credit ledger (authenticated) */
  app.get('/api/rider-os/credits', authenticateToken, async (req, res) => {
    try {
      const userId = String(req.user?.id || '').trim();
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const rider = await resolveRiderIdForUser(pool, userId);
      if (!rider?.rider_id) {
        return res.json({ rider_id: null, summary: null, entries: [], total: 0 });
      }
      const limit = Math.min(Number(req.query.limit) || 40, 100);
      const ledger = await listRiderCreditLedger(pool, rider.rider_id, limit);
      res.json({ rider_id: rider.rider_id, user_id: userId, ...ledger });
    } catch (e) {
      console.error('GET /api/rider-os/credits', e);
      res.status(500).json({ error: 'rider_credits_failed' });
    }
  });

  /** Admin — Rider OS credit ledger + summary */
  app.get('/api/admin/rider-os/users/:userId/credits', adminAuthMiddleware, async (req, res) => {
    try {
      const userId = String(req.params.userId || '').trim();
      if (!userId) return res.status(400).json({ error: 'userId required' });
      const rider = await resolveRiderIdForUser(pool, userId);
      if (!rider?.rider_id) {
        return res.json({ rider: null, summary: null, entries: [], total: 0 });
      }
      const ledger = await listRiderCreditLedger(pool, rider.rider_id, Math.min(Number(req.query.limit) || 50, 100));
      res.json({
        rider,
        ...ledger,
      });
    } catch (e) {
      console.error('GET /api/admin/rider-os/users/:userId/credits', e);
      res.status(500).json({ error: 'admin_rider_credits_failed' });
    }
  });

  /** Admin — manual Rider OS credit/debit with audit */
  app.post('/api/admin/rider-os/users/:userId/credits/adjust', adminAuthMiddleware, async (req, res) => {
    try {
      const userId = String(req.params.userId || '').trim();
      const direction = String(req.body?.direction || '').toLowerCase();
      const amountMicro = Math.round(Number(req.body?.amount_micro || 0));
      const reason = String(req.body?.reason || '').trim();
      if (!userId) return res.status(400).json({ error: 'userId required' });
      if (!['credit', 'debit'].includes(direction)) {
        return res.status(400).json({ error: 'direction must be credit or debit' });
      }
      if (!Number.isFinite(amountMicro) || amountMicro <= 0) {
        return res.status(400).json({ error: 'amount_micro must be positive' });
      }
      if (!reason) return res.status(400).json({ error: 'reason required for audit' });

      const rider = await resolveRiderIdForUser(pool, userId);
      if (!rider?.rider_id) {
        return res.status(404).json({ error: 'rider_not_found', message: 'ผู้ใช้ไม่มี Rider OS profile' });
      }

      const summary = await adminAdjustRiderCredit(pool, {
        rider_id: rider.rider_id,
        user_id: userId,
        direction,
        amount_micro: amountMicro,
        reason,
        admin_id: String(req.adminUser?.id || req.adminUser?.email || 'admin'),
      });

      await writeRiderFinancialAudit(pool, {
        admin_id: String(req.adminUser?.id || ''),
        action: direction === 'credit' ? 'rider_admin_topup' : 'rider_admin_limit_reduce',
        rider_id: rider.rider_id,
        reason,
        correlation_id: rider.rider_id,
        state_after: {
          user_id: userId,
          rider_id: rider.rider_id,
          direction,
          amount_micro: amountMicro,
          ...summary,
        },
      });

      res.json({ ok: true, summary });
    } catch (e) {
      if (e?.code === 'insufficient_rider_balance' || e?.code === 'limit_below_used') {
        return res.status(400).json({ error: e.code });
      }
      console.error('POST /api/admin/rider-os/users/:userId/credits/adjust', e);
      res.status(500).json({ error: 'admin_rider_adjust_failed' });
    }
  });

  /** Admin — ตั้งวงเงินเครดิตให้ยืม */
  app.post('/api/admin/rider-os/users/:userId/credits/limit', adminAuthMiddleware, async (req, res) => {
    try {
      const userId = String(req.params.userId || '').trim();
      const creditLimitMicro = Math.round(Number(req.body?.credit_limit_micro || 0));
      const reason = String(req.body?.reason || '').trim();
      if (!userId) return res.status(400).json({ error: 'userId required' });
      if (!Number.isFinite(creditLimitMicro) || creditLimitMicro < 0) {
        return res.status(400).json({ error: 'credit_limit_micro invalid' });
      }
      if (!reason) return res.status(400).json({ error: 'reason required' });

      const rider = await resolveRiderIdForUser(pool, userId);
      if (!rider?.rider_id) {
        return res.status(404).json({ error: 'rider_not_found' });
      }

      const summary = await adminSetRiderCreditLimit(pool, {
        rider_id: rider.rider_id,
        user_id: userId,
        credit_limit_micro: creditLimitMicro,
        reason,
        admin_id: String(req.adminUser?.id || req.adminUser?.email || 'admin'),
      });

      res.json({ ok: true, summary });
    } catch (e) {
      if (e?.code === 'limit_below_used') {
        return res.status(400).json({ error: 'limit_below_used', message: 'วงเงินต่ำกว่ายอดค้าง' });
      }
      console.error('POST credits/limit', e);
      res.status(500).json({ error: 'admin_rider_limit_failed' });
    }
  });

  /** Admin — เติมเครดิตให้ rider (topup) */
  app.post('/api/admin/rider-os/users/:userId/credits/topup', adminAuthMiddleware, async (req, res) => {
    try {
      const userId = String(req.params.userId || '').trim();
      const amountMicro = Math.round(Number(req.body?.amount_micro || 0));
      const reason = String(req.body?.reason || '').trim();
      if (!userId || amountMicro <= 0 || !reason) {
        return res.status(400).json({ error: 'userId, amount_micro, reason required' });
      }
      const rider = await resolveRiderIdForUser(pool, userId);
      if (!rider?.rider_id) return res.status(404).json({ error: 'rider_not_found' });

      const summary = await riderCreditTopup(pool, {
        rider_id: rider.rider_id,
        user_id: userId,
        amount_micro: amountMicro,
        reason,
        actor_type: 'admin',
        actor_id: String(req.adminUser?.id || 'admin'),
      });
      res.json({ ok: true, summary });
    } catch (e) {
      console.error('POST credits/topup', e);
      res.status(500).json({ error: 'admin_rider_topup_failed' });
    }
  });

  /** Rider — เติมเครดิต (legacy free — blocked; use /wallet or /promptpay) */
  app.post('/api/rider-os/credits/topup', authenticateToken, async (req, res) => {
    return res.status(400).json({
      error: 'use_paid_topup',
      message: 'ใช้ POST /api/rider-os/credits/topup/wallet หรือ /promptpay',
    });
  });

  /** Rider — เติมเครดิตจากวอลเล็ตหลัก THB */
  app.post('/api/rider-os/credits/topup/wallet', authenticateToken, async (req, res) => {
    try {
      const userId = String(req.user?.id || '').trim();
      const amountMicro = Math.round(Number(req.body?.amount_micro || 0));
      const idempotencyKey = String(req.body?.idempotency_key || '').trim() || undefined;
      if (!userId || amountMicro <= 0) {
        return res.status(400).json({ error: 'amount_micro required' });
      }
      const rider = await resolveRiderIdForUser(pool, userId);
      if (!rider?.rider_id) return res.status(404).json({ error: 'rider_not_registered' });

      const result = await topupRiderCreditFromWallet(pool, {
        userId,
        riderId: rider.rider_id,
        amountMicro,
        idempotencyKey,
      });
      res.json(result);
    } catch (e) {
      if (e?.code === 'insufficient_wallet_balance') {
        return res.status(402).json({
          error: 'insufficient_wallet_balance',
          balance: e.balance,
          required: e.required,
        });
      }
      if (e?.code === 'wallet_frozen') {
        return res.status(403).json({ error: 'wallet_frozen' });
      }
      console.error('POST /api/rider-os/credits/topup/wallet', e);
      res.status(500).json({ error: e?.code || 'rider_topup_wallet_failed' });
    }
  });

  /** Rider — สร้าง QR PromptPay เติมเครดิต */
  app.post('/api/rider-os/credits/topup/promptpay', authenticateToken, async (req, res) => {
    try {
      const userId = String(req.user?.id || '').trim();
      const amountThb = Number(req.body?.amount ?? req.body?.amount_thb);
      if (!userId || !(amountThb >= 1)) {
        return res.status(400).json({ error: 'amount required (min 1 THB)' });
      }
      const rider = await resolveRiderIdForUser(pool, userId);
      if (!rider?.rider_id) return res.status(404).json({ error: 'rider_not_registered' });

      const charge = await createRiderCreditPromptPayCharge(pool, {
        userId,
        riderId: rider.rider_id,
        amountThb,
      });
      res.status(201).json(charge);
    } catch (e) {
      if (e?.code === 'payso_not_configured') {
        return res.status(503).json({ error: 'payso_not_configured' });
      }
      console.error('POST /api/rider-os/credits/topup/promptpay', e);
      res.status(500).json({ error: e?.code || 'rider_topup_promptpay_failed' });
    }
  });

  /** Rider — ตรวจสถานะ PromptPay + เติมเครดิตเมื่อชำระแล้ว */
  app.get('/api/rider-os/credits/topup/status/:chargeId', authenticateToken, async (req, res) => {
    try {
      const userId = String(req.user?.id || '').trim();
      const chargeId = String(req.params.chargeId || '').trim();
      if (!userId || !chargeId) return res.status(400).json({ error: 'chargeId required' });

      const row = await pool.query(
        `SELECT user_id, rider_id FROM rider_credit_topup_charges WHERE charge_id = $1 LIMIT 1`,
        [chargeId],
      ).catch(() => ({ rows: [] }));
      const rec = row.rows?.[0];
      if (rec) {
        const rider = await resolveRiderIdForUser(pool, userId);
        if (!rider?.rider_id || String(rec.rider_id) !== String(rider.rider_id)) {
          return res.status(403).json({ error: 'forbidden' });
        }
      }

      const status = await pollAndFulfillRiderCreditTopup(pool, chargeId);
      res.json(status);
    } catch (e) {
      console.error('GET /api/rider-os/credits/topup/status', e);
      res.status(500).json({ error: 'status_check_failed' });
    }
  });

  /** Rider — สถานะเอกสารยืนยันตัวตน */
  app.get('/api/rider-os/kyc/status', authenticateToken, async (req, res) => {
    try {
      const userId = String(req.user?.id || '').trim();
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const status = await getRiderKycStatus(pool, userId);
      res.json({
        ...status,
        missing_labels: (status.missing || []).map((k) => RIDER_KYC_MISSING_LABELS[k] || k),
      });
    } catch (e) {
      console.error('GET /api/rider-os/kyc/status', e);
      res.status(500).json({ error: 'kyc_status_failed' });
    }
  });

  /** Rider — ส่งเอกสารยืนยันตัวตนเต็มชุด */
  app.post('/api/rider-os/kyc/submit', authenticateToken, async (req, res) => {
    try {
      const userId = String(req.user?.id || '').trim();
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const body = req.body || {};
      const { extended, expiry, vehicles, uploadedFiles } = buildRiderKycPayloadFromBody(body);

      const rider = await resolveRiderIdForUser(pool, userId);
      if (!rider?.rider_id) {
        return res.status(404).json({
          error: 'rider_not_registered',
          message: 'สมัคร Rider OS ก่อน แล้วค่อยส่งเอกสารยืนยันตัวตน',
        });
      }

      const plate = String(body.plate || vehicles[0]?.license_plate || rider.plate || '').trim();
      const vehicleType = String(body.vehicle || vehicles[0]?.vehicle_type || 'motorcycle').trim();
      const bankAccount = String(body.bank_account || vehicles[0]?.bank_account || '').trim();

      const vehicleRow = {
        ...(vehicles[0] || {}),
        license_plate: plate || vehicles[0]?.license_plate,
        vehicle_type: vehicleType,
        bank_account: bankAccount || vehicles[0]?.bank_account,
        channel: 'aqond_delivery',
        source: 'rider_os_web',
        dispatch_rider_id: rider.rider_id,
      };
      const vehiclesFinal = [vehicleRow];

      const result = await submitRiderOsKyc(pool, {
        userId,
        fullName: body.fullName || body.full_name || rider.display_name,
        idCardNumber: body.idCardNumber || body.id_card_number,
        birthDate: body.birthDate || body.birth_date,
        addressText: body.address || `ช่องทาง: AQOND แอปไรเดอร์ | ทะเบียน ${plate}`,
        vehiclesJson: vehiclesFinal,
        uploadedFiles,
        extendedFields: extended,
        expiryFields: expiry,
        isTrustedUrl: isTrustedKycImageUrl,
      });

      res.json({
        ok: true,
        message: 'ส่งเอกสารแล้ว — แอดมินจะตรวจสอบใน Nexus Admin',
        ...result,
      });
    } catch (e) {
      if (e?.code === 'rider_kyc_incomplete') {
        return res.status(400).json({
          error: 'rider_kyc_incomplete',
          missing: e.missing,
          missing_labels: (e.missing || []).map((k) => RIDER_KYC_MISSING_LABELS[k] || k),
        });
      }
      if (e?.code === 'invalid_kyc_url') {
        return res.status(400).json({ error: 'invalid_kyc_url', message: 'ลิงก์รูปไม่ถูกต้อง — อัปโหลดใหม่จากแอป' });
      }
      console.error('POST /api/rider-os/kyc/submit', e);
      res.status(500).json({ error: e?.message || 'rider_kyc_submit_failed' });
    }
  });

  /** Face verify — liveness + match → rider_face_session JWT (TTL 8h / passenger 30m) */
  app.post('/api/rider-os/face/verify', authenticateToken, async (req, res) => {
    try {
      const userId = req.user?.id || req.user?.userId;
      if (!userId) return res.status(401).json({ error: 'unauthorized' });
      const rider = await riderForUser(pool, userId, authHeader(req));
      const riderId = rider?.rider_id || req.body?.rider_id;
      if (!riderId) return res.status(400).json({ error: 'rider_id_required' });

      const purpose = String(req.body?.purpose || 'daily').toLowerCase();
      const normalized = purpose === 'online' ? 'daily' : purpose === 'reverify' ? 'strict' : purpose;
      if (!['daily', 'strict', 'passenger', 'online', 'reverify'].includes(purpose)) {
        return res.status(400).json({ error: 'invalid_purpose' });
      }

      const out = await verifyAndIssueRiderFaceSession(pool, {
        userId,
        riderId: String(riderId),
        purpose,
        selfieBase64: req.body?.selfie_base64 || req.body?.selfieBase64,
        liveness: req.body?.liveness,
        deviceFingerprint: req.body?.device_fingerprint || req.body?.deviceFingerprint,
        lat: req.body?.lat != null ? Number(req.body.lat) : undefined,
        lng: req.body?.lng != null ? Number(req.body.lng) : undefined,
      });
      res.json(out);
    } catch (e) {
      if (e?.code === 'liveness_incomplete' || e?.code === 'liveness_invalid_timestamps' || e?.code === 'liveness_timing_invalid') {
        return res.status(400).json({ error: e.code, missing: e.missing });
      }
      if (e?.code === 'no_enrollment_portrait') {
        return res.status(400).json({ error: e.code, message: 'ส่ง KYC selfie ก่อนยืนยันใบหน้า' });
      }
      if (e?.code === 'face_match_failed') {
        return res.status(403).json({
          error: e.code,
          score: e.score,
          threshold: e.threshold,
          message: 'ใบหน้าไม่ตรงกับที่ลงทะเบียน',
        });
      }
      console.error('POST /api/rider-os/face/verify', e);
      res.status(500).json({ error: e?.message || 'face_verify_failed' });
    }
  });

  /** Face session status for Rider OS UI gates */
  app.get('/api/rider-os/face/session', authenticateToken, async (req, res) => {
    try {
      const userId = req.user?.id || req.user?.userId;
      if (!userId) return res.status(401).json({ error: 'unauthorized' });
      const rider = await riderForUser(pool, userId, authHeader(req));
      const riderId = rider?.rider_id || req.query?.rider_id;
      if (!riderId) return res.status(400).json({ error: 'rider_id_required' });
      const status = await getRiderFaceSessionStatus(pool, userId, String(riderId));
      res.json(status);
    } catch (e) {
      console.error('GET /api/rider-os/face/session', e);
      res.status(500).json({ error: 'face_session_status_failed' });
    }
  });

  /** Server gate — go_online / accept_job */
  app.post('/api/rider-os/face/check-action', authenticateToken, async (req, res) => {
    try {
      const userId = req.user?.id || req.user?.userId;
      if (!userId) return res.status(401).json({ error: 'unauthorized' });
      const rider = await riderForUser(pool, userId, authHeader(req));
      const riderId = rider?.rider_id || req.body?.rider_id;
      if (!riderId) return res.status(400).json({ error: 'rider_id_required' });

      const action = String(req.body?.action || '').toLowerCase();
      if (!['go_online', 'accept_job'].includes(action)) {
        return res.status(400).json({ error: 'invalid_action' });
      }

      const out = await checkRiderFaceAction(pool, {
        userId,
        riderId: String(riderId),
        action,
        faceSessionToken: req.body?.face_session_token || req.body?.faceSessionToken,
        deviceFingerprint: req.body?.device_fingerprint || req.body?.deviceFingerprint,
        lat: req.body?.lat != null ? Number(req.body.lat) : undefined,
        lng: req.body?.lng != null ? Number(req.body.lng) : undefined,
        jobType: req.body?.job_type || req.body?.jobType,
        paymentMethod: req.body?.payment_method || req.body?.paymentMethod,
        amountMicro: req.body?.amount_micro ?? req.body?.amountMicro,
      });
      res.status(out.ok ? 200 : 403).json(out);
    } catch (e) {
      console.error('POST /api/rider-os/face/check-action', e);
      res.status(500).json({ error: 'face_check_failed' });
    }
  });

  /** Admin — rider face security incidents */
  app.get('/api/admin/rider-os/face/incidents', adminAuthMiddleware, async (req, res) => {
    try {
      const limit = Number(req.query?.limit ?? 50);
      const riderId = req.query?.rider_id ? String(req.query.rider_id) : undefined;
      const out = await listRiderFaceIncidents(pool, { limit, riderId });
      res.json(out);
    } catch (e) {
      console.error('GET /api/admin/rider-os/face/incidents', e);
      res.status(500).json({ error: 'face_incidents_failed' });
    }
  });

  /** Admin — batch reconcile pending Rider OS PromptPay topups (overnight / ops) */
  app.post(
    '/api/admin/rider-os/credits/reconcile-payso-batch',
    adminAuthMiddleware,
    async (req, res) => {
      try {
        const limit = Number(req.body?.limit ?? req.query?.limit ?? 100);
        const out = await batchReconcileRiderCreditTopup(pool, { limit, trigger: 'admin' });
        res.json(out);
      } catch (e) {
        console.error('POST reconcile-payso-batch', e);
        res.status(500).json({ error: e?.message || 'reconcile_batch_failed' });
      }
    },
  );
}
