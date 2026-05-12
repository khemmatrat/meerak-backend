/**
 * Bridge: main backend ↔ AQOND Internal Gateway (future licensed PI).
 * - Double-entry ledger + state machine live in DB (migration 146).
 * - HMAC + nonce for signed calls; never log PAN/CVV (use masking helpers).
 */
import v8 from 'node:v8';
import {
  canTransition,
  sanitizeMetadata,
  maskMerchantReference,
  maskIpForDisplay,
  verifyHmacOnly,
  signBody,
  appendCaptureJournal,
  appendSettlementJournal,
  verifyLedgerIntegrity,
} from '../internal-gateway/index.js';
import { GATEWAY_TX_STATUS } from '../internal-gateway/constants.js';
import { calculateFraudScore } from './internalGatewayFraud.js';
import { enqueueGatewayWebhook } from './gatewayWebhookOutbox.js';

function getHmacSecret() {
  return (process.env.INTERNAL_GATEWAY_HMAC_SECRET || '').trim();
}

/** Align with server.js getMemoryPressurePct — heapUsed / V8 heap_size_limit */
function getHeapPressurePercent() {
  try {
    const mem = process.memoryUsage();
    const limit = v8.getHeapStatistics().heap_size_limit || 1;
    return Math.round((mem.heapUsed / limit) * 100);
  } catch {
    return 0;
  }
}

export function isInternalGatewayEnabled() {
  const v = (process.env.INTERNAL_GATEWAY_ENABLED || '0').toLowerCase().trim();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Stripe-style: reject creates without Idempotency-Key when enabled */
export function isIdempotencyKeyRequired() {
  const v = (process.env.INTERNAL_GATEWAY_IDEMPOTENCY_REQUIRED || '0').toLowerCase().trim();
  return v === '1' || v === 'true' || v === 'yes';
}

function idempotencyTtlHours() {
  return Math.min(168, Math.max(1, parseInt(process.env.INTERNAL_GATEWAY_IDEMPOTENCY_TTL_HOURS || '24', 10) || 24));
}

/**
 * @param {import('pg').Pool} pool
 * @param {string|null} idemKey
 * @returns {Promise<object|null>}
 */
async function findIdempotencyReplay(pool, idemKey) {
  if (!idemKey) return null;
  try {
    await pool.query(`DELETE FROM gateway_idempotency_keys WHERE idempotency_key = $1 AND expires_at <= NOW()`, [
      idemKey,
    ]);
    const r = await pool.query(
      `SELECT gt.* FROM gateway_idempotency_keys gtk
       INNER JOIN gateway_transactions gt ON gt.id = gtk.gateway_transaction_id
       WHERE gtk.idempotency_key = $1 AND gtk.expires_at > NOW()
       LIMIT 1`,
      [idemKey]
    );
    return r.rows?.[0] || null;
  } catch (e) {
    if (e && e.code === '42P01') {
      const h = idempotencyTtlHours();
      const r2 = await pool.query(
        `SELECT * FROM gateway_transactions
         WHERE idempotency_key = $1 AND created_at > NOW() - ($2::int * INTERVAL '1 hour')
         ORDER BY created_at DESC LIMIT 1`,
        [idemKey, h]
      );
      return r2.rows?.[0] || null;
    }
    throw e;
  }
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} idemKey
 * @param {string} transactionId
 */
async function recordIdempotencyMapping(pool, idemKey, transactionId) {
  if (!idemKey) return;
  try {
    await pool.query(
      `INSERT INTO gateway_idempotency_keys (idempotency_key, gateway_transaction_id, expires_at)
       VALUES ($1, $2::uuid, NOW() + ($3::int * INTERVAL '1 hour'))`,
      [idemKey, transactionId, idempotencyTtlHours()]
    );
  } catch (e) {
    if (e && e.code === '42P01') return;
    throw e;
  }
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} nonce
 * @param {number} [ttlSec]
 */
export async function consumeNonce(pool, nonce, ttlSec = 600) {
  const n = String(nonce || '').trim();
  if (n.length < 16) throw new Error('nonce_invalid');
  const exp = new Date(Date.now() + ttlSec * 1000);
  try {
    await pool.query(`INSERT INTO gateway_nonce_store (nonce, expires_at) VALUES ($1, $2)`, [n, exp]);
    return true;
  } catch (e) {
    if (e && String(e.code) === '23505') return false;
    throw e;
  }
}

/**
 * Verify HMAC and ensure nonce not reused.
 * @param {import('pg').Pool} pool
 * @param {{ rawBodyUtf8: string, signature: string, nonce: string, timestamp: string }} p
 */
export async function verifySignedGatewayRequest(pool, p) {
  const secret = getHmacSecret();
  if (!secret) return { ok: false, reason: 'gateway_secret_not_configured' };
  const v = verifyHmacOnly(secret, p.rawBodyUtf8, p.signature, p.nonce, p.timestamp);
  if (!v.ok) return v;
  const fresh = await consumeNonce(pool, p.nonce);
  if (!fresh) return { ok: false, reason: 'nonce_replay' };
  return { ok: true };
}

/**
 * @param {object} payload — object to send to gateway worker
 */
export function signOutboundGatewayPayload(payload) {
  const secret = getHmacSecret();
  if (!secret) throw new Error('INTERNAL_GATEWAY_HMAC_SECRET missing');
  const bodyUtf8 = JSON.stringify(payload);
  return { bodyUtf8, ...signBody(secret, bodyUtf8) };
}

/**
 * @param {import('pg').Pool} pool
 * @param {{
 *   externalRef?: string,
 *   amountMinor: number,
 *   currency?: string,
 *   merchantReference?: string,
 *   metadata?: object,
 *   idempotencyKey?: string,
 *   jobId?: string | null,
 *   ipAddress?: string | null,
 *   userAgent?: string | null,
 *   deviceId?: string | null,
 *   releaseRules?: object,
 *   idempotencyKey?: string | null,
 * }} input
 */
export async function createGatewayTransaction(pool, input) {
  const meta = sanitizeMetadata({
    ...(input.metadata || {}),
    ...(input.jobId ? { job_id: String(input.jobId) } : {}),
  });
  const idem = input.idempotencyKey ? String(input.idempotencyKey).trim() : null;
  if (isIdempotencyKeyRequired() && !idem) {
    const err = new Error('idempotency_key_required');
    err.code = 'IDEMPOTENCY_REQUIRED';
    throw err;
  }

  const replay = await findIdempotencyReplay(pool, idem);
  if (replay) {
    return {
      duplicate: true,
      idempotentReplay: true,
      transaction: {
        id: replay.id,
        status: replay.status,
        created_at: replay.created_at,
        amount_minor: replay.amount_minor,
        currency: replay.currency,
      },
      transactionFull: replay,
    };
  }

  const ext = input.externalRef ? String(input.externalRef).trim() : null;
  if (ext) {
    const ex2 = await pool.query(`SELECT id, status FROM gateway_transactions WHERE external_ref = $1 LIMIT 1`, [ext]);
    if (ex2.rows?.[0]) {
      return { duplicate: true, transaction: ex2.rows[0] };
    }
  }
  const amt = Math.max(0, Math.floor(Number(input.amountMinor) || 0));
  const cur = (input.currency || 'THB').toUpperCase().slice(0, 3);
  const jobId = input.jobId ? String(input.jobId).trim() : null;
  const ip = input.ipAddress ? String(input.ipAddress).trim() : null;
  const ua = input.userAgent ? String(input.userAgent).slice(0, 2000) : null;
  const dev = input.deviceId ? String(input.deviceId).slice(0, 256) : null;
  const rel = input.releaseRules && typeof input.releaseRules === 'object' ? input.releaseRules : {};

  const insertFull = async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const r = await client.query(
        `INSERT INTO gateway_transactions (
           external_ref, merchant_reference, amount_minor, currency, status, idempotency_key, metadata,
           job_id, ip_address, user_agent, device_id, release_rules, fraud_flags
         ) VALUES (
           $1, $2, $3, COALESCE($4, 'THB'), $5, $6, $7::jsonb,
           $8, $9, $10, $11, $12::jsonb, '{}'::jsonb
         )
         RETURNING id, status, created_at`,
        [
          ext,
          input.merchantReference ? String(input.merchantReference) : null,
          amt,
          cur,
          GATEWAY_TX_STATUS.PENDING,
          idem,
          JSON.stringify(meta),
          jobId,
          ip,
          ua,
          dev,
          JSON.stringify(rel),
        ]
      );
      const row = r.rows[0];
      const fraud = await calculateFraudScore(client, {
        amountMinor: amt,
        deviceId: dev,
        ipAddress: ip,
        excludeTransactionId: row.id,
        metadata: meta,
      });
      if (fraud.shouldVoid) {
        const failureReason = fraud.highRiskFrequency
          ? 'fraud_high_frequency_1h'
          : 'fraud_predictive_score';
        const flags = {
          fraud_score: fraud.score,
          high_risk_frequency: fraud.highRiskFrequency,
          void_reason: failureReason,
          ...fraud.breakdown,
        };
        await client.query(
          `UPDATE gateway_transactions
           SET status = $2,
               failure_reason = $3,
               fraud_flags = COALESCE(fraud_flags, '{}'::jsonb) || $4::jsonb,
               updated_at = NOW()
           WHERE id = $1::uuid`,
          [row.id, GATEWAY_TX_STATUS.VOIDED, failureReason, JSON.stringify(flags)]
        );
        row.status = GATEWAY_TX_STATUS.VOIDED;
      }
      await client.query('COMMIT');
      return row;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => { });
      throw e;
    } finally {
      client.release();
    }
  };

  try {
    const row = await insertFull();
    if (idem && row?.id) {
      await recordIdempotencyMapping(pool, idem, row.id);
    }
    return { duplicate: false, transaction: row };
  } catch (e) {
    if (e && (e.code === '42703' || e.code === '42P01')) {
      const r2 = await pool.query(
        `INSERT INTO gateway_transactions (
           external_ref, merchant_reference, amount_minor, currency, status, idempotency_key, metadata
         ) VALUES ($1, $2, $3, COALESCE($4, 'THB'), $5, $6, $7::jsonb)
         RETURNING id, status, created_at`,
        [ext, input.merchantReference ? String(input.merchantReference) : null, amt, cur, GATEWAY_TX_STATUS.PENDING, idem, JSON.stringify(meta)]
      );
      const tr = r2.rows[0];
      if (idem && tr?.id) {
        await recordIdempotencyMapping(pool, idem, tr.id);
      }
      return { duplicate: false, transaction: tr, legacyInsert: true };
    }
    throw e;
  }
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} transactionId
 * @param {string} newStatus
 * @param {{ processingTimeMs?: number, failureReason?: string, ledgerOnCapture?: boolean }} opt
 */
export async function transitionGatewayTransaction(pool, transactionId, newStatus, opt = {}) {
  const id = String(transactionId || '').trim();
  const to = String(newStatus || '').toUpperCase();
  const client = await pool.connect();
  const tStart = Date.now();
  try {
    await client.query('BEGIN');
    const cur = await client.query(
      `SELECT id, status, amount_minor, currency FROM gateway_transactions WHERE id = $1::uuid FOR UPDATE`,
      [id]
    );
    const row = cur.rows?.[0];
    if (!row) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'not_found' };
    }
    if (!canTransition(row.status, to)) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'invalid_transition', from: row.status, to };
    }
    const procMs =
      opt.processingTimeMs != null ? Math.floor(opt.processingTimeMs) : Math.max(0, Date.now() - tStart);

    if (to === GATEWAY_TX_STATUS.CAPTURED && opt.ledgerOnCapture !== false) {
      await appendCaptureJournal(client, {
        gatewayTransactionId: id,
        amountMinor: row.amount_minor,
        currency: row.currency,
      });
    }
    if (to === GATEWAY_TX_STATUS.SETTLED) {
      await appendSettlementJournal(client, {
        gatewayTransactionId: id,
        amountMinor: row.amount_minor,
        currency: row.currency,
      });
    }

    await client.query(
      `UPDATE gateway_transactions
       SET status = $2,
           updated_at = NOW(),
           processing_time_ms = COALESCE($3, processing_time_ms),
           failure_reason = CASE WHEN $2 IN ('FAILED', 'VOIDED') THEN COALESCE($4, failure_reason) ELSE failure_reason END,
           settled_at = CASE WHEN $2 = 'SETTLED' THEN NOW() ELSE settled_at END
       WHERE id = $1::uuid`,
      [id, to, procMs, opt.failureReason || null]
    );
    await client.query('COMMIT');
    const callbackUrl = (process.env.GATEWAY_WEBHOOK_CALLBACK_URL || '').trim();
    if (callbackUrl && (to === GATEWAY_TX_STATUS.CAPTURED || to === GATEWAY_TX_STATUS.SETTLED)) {
      setImmediate(() => {
        enqueueGatewayWebhook(pool, {
          eventType: `gateway.${to.toLowerCase()}`,
          targetUrl: callbackUrl,
          payload: { gateway_transaction_id: id, status: to },
          idempotencyKey: `${id}:${to}`,
          correlationId: id,
        }).catch(() => { });
      });
    }
    return { ok: true, status: to };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Admin API: mask row (no PII in logs)
 * @param {object} row
 */
export function toMaskedGatewayTransaction(row) {
  if (!row) return row;
  return {
    ...row,
    merchant_reference: row.merchant_reference
      ? maskMerchantReference(String(row.merchant_reference))
      : row.merchant_reference,
    ip_address: row.ip_address != null ? maskIpForDisplay(String(row.ip_address)) : row.ip_address,
    user_agent:
      row.user_agent != null && String(row.user_agent).length > 0
        ? `${String(row.user_agent).slice(0, 24)}…`
        : row.user_agent,
    metadata:
      typeof row.metadata === 'object' && row.metadata
        ? sanitizeMetadata(row.metadata)
        : row.metadata,
    request_signature_last: row.request_signature_last ? '[redacted]' : null,
    nonce_last: row.nonce_last ? '[redacted]' : null,
  };
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} limit
 */
export async function listGatewayTransactionsForAdmin(pool, limit = 50) {
  const lim = Math.min(200, Math.max(1, parseInt(String(limit), 10) || 50));
  try {
    const r = await pool.query(
      `SELECT id, created_at, updated_at, external_ref, merchant_reference, amount_minor, currency, status,
              idempotency_key, processing_time_ms, failure_reason, metadata,
              job_id, ip_address, user_agent, device_id, release_rules, fraud_flags, locked_for_recon, recon_alert_at
       FROM gateway_transactions
       ORDER BY created_at DESC
       LIMIT $1`,
      [lim]
    );
    return (r.rows || []).map((row) => toMaskedGatewayTransaction(row));
  } catch (e) {
    if (e && e.code === '42703') {
      const r = await pool.query(
        `SELECT id, created_at, updated_at, external_ref, merchant_reference, amount_minor, currency, status,
                idempotency_key, processing_time_ms, failure_reason, metadata
         FROM gateway_transactions
         ORDER BY created_at DESC
         LIMIT $1`,
        [lim]
      );
      return (r.rows || []).map((row) => toMaskedGatewayTransaction(row));
    }
    throw e;
  }
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} days
 */
export async function getInternalGatewayMetrics(pool, days = 30) {
  const d = Math.min(365, Math.max(1, parseInt(String(days), 10) || 30));
  const tx = await pool.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status IN ('SETTLED', 'CAPTURED'))::int AS success_completed,
       COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed,
       AVG(processing_time_ms)::float AS avg_processing_ms,
       PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY processing_time_ms)::float AS p50_ms,
       PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY processing_time_ms)::float AS p95_ms
     FROM gateway_transactions
     WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')`,
    [d]
  );
  let benchmark = { byGateway: [] };
  try {
    const b = await pool.query(
      `SELECT gateway::text AS gateway, COUNT(*)::int AS cnt
       FROM payment_transaction_logs
       WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')
       GROUP BY gateway
       ORDER BY cnt DESC`,
      [d]
    );
    benchmark = { byGateway: b.rows || [] };
  } catch {
    benchmark = { byGateway: [], note: 'payment_transaction_logs unavailable' };
  }
  const row = tx.rows?.[0] || {};
  const total = Number(row.total) || 0;
  const ok = Number(row.success_completed) || 0;
  const successRate = total > 0 ? ok / total : null;

  let daily = [];
  try {
    const dayRes = await pool.query(
      `SELECT
         (date_trunc('day', created_at AT TIME ZONE 'UTC'))::date AS day,
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status IN ('SETTLED', 'CAPTURED'))::int AS success_completed,
         AVG(processing_time_ms)::float AS avg_ms
       FROM gateway_transactions
       WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')
       GROUP BY 1
       ORDER BY 1 ASC`,
      [d]
    );
    daily = (dayRes.rows || []).map((r) => ({
      day: r.day,
      total: Number(r.total) || 0,
      successCompleted: Number(r.success_completed) || 0,
      successRate: Number(r.total) > 0 ? Number(r.success_completed) / Number(r.total) : null,
      avgProcessingMs: r.avg_ms != null ? Number(r.avg_ms) : null,
    }));
  } catch {
    daily = [];
  }

  return {
    windowDays: d,
    total,
    successCompleted: ok,
    failed: Number(row.failed) || 0,
    successRate,
    avgProcessingMs: row.avg_processing_ms != null ? Number(row.avg_processing_ms) : null,
    p50ProcessingMs: row.p50_ms != null ? Number(row.p50_ms) : null,
    p95ProcessingMs: row.p95_ms != null ? Number(row.p95_ms) : null,
    daily,
    externalVolumeBenchmark: benchmark,
    enabled: isInternalGatewayEnabled(),
  };
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} limit
 */
export async function listGatewaySettlementReports(pool, limit = 20) {
  const lim = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 20));
  const r = await pool.query(
    `SELECT id, created_at, report_period_start, report_period_end, currency, total_volume_minor,
            total_fee_minor, transaction_count, status, snapshot_hash_sha256
     FROM gateway_settlement_reports
     ORDER BY report_period_end DESC
     LIMIT $1`,
    [lim]
  );
  return r.rows || [];
}

/**
 * Health / transparency for Admin Gateway Pulse dashboard.
 * @param {import('pg').Pool} pool
 */
export async function getGatewayPulse(pool) {
  const { getGatewaySchedulerHeartbeat } = await import('./gatewayScheduler.js');
  const hb = getGatewaySchedulerHeartbeat();
  let webhookOutboxPending = 0;
  let webhookRetryAttemptsSum = 0;
  try {
    const p = await pool.query(
      `SELECT COUNT(*)::int AS c, COALESCE(SUM(attempt_count), 0)::int AS a
       FROM gateway_webhook_outbox WHERE status = 'pending'`
    );
    webhookOutboxPending = Number(p.rows?.[0]?.c) || 0;
    webhookRetryAttemptsSum = Number(p.rows?.[0]?.a) || 0;
  } catch {
    webhookOutboxPending = 0;
  }
  let lastReconciliationAt = null;
  try {
    const r = await pool.query(`SELECT MAX(run_at) AS t FROM gateway_reconciliation_runs`);
    lastReconciliationAt = r.rows?.[0]?.t || null;
  } catch {
    lastReconciliationAt = null;
  }
  let avgProcessingMs24h = null;
  try {
    const a = await pool.query(
      `SELECT AVG(processing_time_ms)::float AS x FROM gateway_transactions
       WHERE created_at > NOW() - INTERVAL '24 hours'`
    );
    avgProcessingMs24h = a.rows?.[0]?.x != null ? Number(a.rows[0].x) : null;
  } catch {
    avgProcessingMs24h = null;
  }
  let ledgerIntegrity = { ok: false };
  try {
    ledgerIntegrity = await verifyLedgerIntegrity(pool);
  } catch (e) {
    ledgerIntegrity = { ok: false, error: e?.message || String(e) };
  }

  const reasons = [];
  let systemHealthLevel = 'green';
  if (!hb.alive) {
    systemHealthLevel = 'red';
    reasons.push('scheduler_timers_not_running');
  }
  if (ledgerIntegrity.ok !== true) {
    systemHealthLevel = 'red';
    reasons.push('ledger_integrity_failed');
  }
  if (webhookOutboxPending > 500) {
    systemHealthLevel = 'red';
    reasons.push('webhook_outbox_backlog_critical');
  } else if (webhookOutboxPending > 80 && systemHealthLevel === 'green') {
    systemHealthLevel = 'yellow';
    reasons.push('webhook_outbox_backlog_elevated');
  }
  const lastWh = hb.lastWebhookProcessAt ? Date.parse(String(hb.lastWebhookProcessAt)) : 0;
  if (hb.alive && (!lastWh || Date.now() - lastWh > 6 * 60 * 1000)) {
    if (systemHealthLevel === 'green') systemHealthLevel = 'yellow';
    reasons.push('webhook_processor_stale');
  }
  const lastReconTick = hb.lastReconRunAt ? Date.parse(String(hb.lastReconRunAt)) : 0;
  if (hb.alive && (!lastReconTick || Date.now() - lastReconTick > 36 * 60 * 60 * 1000)) {
    if (systemHealthLevel === 'green') systemHealthLevel = 'yellow';
    reasons.push('reconciliation_tick_stale');
  }

  const hmacSecretConfigured = !!(process.env.INTERNAL_GATEWAY_HMAC_SECRET || '').trim();

  const mem = process.memoryUsage();
  const heapStats = v8.getHeapStatistics();
  const heapLimit = heapStats.heap_size_limit || 1;
  const heapPressurePct = getHeapPressurePercent();
  const guardPct = Math.min(99, Math.max(50, parseInt(process.env.MEMORY_GUARD_PCT || '85', 10)));
  const guardOff =
    process.env.MEMORY_GUARD_DISABLED === '1' || process.env.MEMORY_GUARD_DISABLED === 'true';

  return {
    scheduler: hb,
    webhookOutboxPending,
    webhookRetryAttemptsSum,
    lastReconciliationAt,
    avgProcessingMs24h,
    ledgerIntegrity,
    idempotencyTtlHours: idempotencyTtlHours(),
    idempotencyRequired: isIdempotencyKeyRequired(),
    internalGatewaySigning: {
      hmacSecretConfigured,
    },
    systemHealth: {
      level: systemHealthLevel,
      reasons: [...new Set(reasons)],
    },
    /** Node process memory (same basis as cron memory guard + /api/admin/jobs/status) */
    processMemory: {
      heapPressurePercent: heapPressurePct,
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      heapSizeLimitMb: Math.round(heapLimit / 1024 / 1024),
      rssMb: Math.round(mem.rss / 1024 / 1024),
      memoryGuardPct: guardPct,
      memoryGuardDisabled: guardOff,
      /** true when heap pressure > 80% of V8 limit (informational) */
      overEightyPercent: heapPressurePct > 80,
    },
    generatedAt: new Date().toISOString(),
  };
}

export { verifyLedgerIntegrity };

export { GATEWAY_TX_STATUS, sanitizeMetadata, maskMerchantReference };
