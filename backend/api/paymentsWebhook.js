import crypto from 'crypto';
import { normalizePaymentWebhookEvent } from '../lib/paymentEventNormalizer.js';

const MAX_RAW_BODY_BYTES = 128 * 1024; // 128KB

function safeStringify(v) {
  try {
    return JSON.stringify(v);
  } catch {
    return '{}';
  }
}

function normalizeJson(value, seen = new WeakSet()) {
  if (value == null) return value;
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return value;
  if (Array.isArray(value)) return value.map((x) => normalizeJson(x, seen));
  if (t !== 'object') return String(value);
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  const out = {};
  for (const k of Object.keys(value).sort()) {
    out[k] = normalizeJson(value[k], seen);
  }
  seen.delete(value);
  return out;
}

function stableStringify(value) {
  return JSON.stringify(normalizeJson(value));
}

function toHeadersObject(headers) {
  const out = {};
  const h = headers && typeof headers === 'object' ? headers : {};
  for (const [k, v] of Object.entries(h)) {
    const key = String(k || '').toLowerCase().trim();
    if (!key) continue;
    if (Array.isArray(v)) {
      out[key] = v.map((x) => String(x)).join(',');
    } else if (v == null) {
      out[key] = '';
    } else {
      out[key] = String(v);
    }
  }
  return out;
}

function getRawBodyBuffer(req) {
  if (Buffer.isBuffer(req?.rawBody)) return req.rawBody;
  if (Buffer.isBuffer(req?.body)) return req.body;
  return Buffer.from(safeStringify(req?.body || {}), 'utf8');
}

function parsePayloadFromRaw(rawBody) {
  try {
    return { payload: JSON.parse(rawBody.toString('utf8')), parseIssues: [] };
  } catch {
    return { payload: {}, parseIssues: ['invalid_json'] };
  }
}

/**
 * Intake-only webhook handler:
 * - parse request
 * - normalize event
 * - enqueue one row into payment_webhook_jobs
 * - return 200 quickly
 *
 * @param {import('express').Request} req
 * @param {import('pg').Pool} pool
 */
export async function handlePaymentsWebhookIntake(req, pool) {
  const rawBody = getRawBodyBuffer(req);
  const rawBodyTextFull = rawBody.toString('utf8');
  const rawBodyTooLarge = rawBody.length > MAX_RAW_BODY_BYTES;
  const rawBodyText = rawBodyTooLarge
    ? rawBodyTextFull.slice(0, MAX_RAW_BODY_BYTES)
    : rawBodyTextFull;
  const rawHash = crypto.createHash('sha256').update(rawBody).digest('hex');
  const headers = toHeadersObject(req?.headers);
  const providerHint = (headers['x-payment-gateway'] || headers['x-gateway'] || '').toLowerCase().trim() || null;
  const ingressTraceId = (headers['x-trace-id'] || headers['x-request-id'] || '').trim() || crypto.randomUUID();

  const { payload, parseIssues } = parsePayloadFromRaw(rawBody);
  const normalizedBase = normalizePaymentWebhookEvent({
    payload,
    headers,
    provider: providerHint,
    rawHash,
  });
  const normalizedEvent = {
    ...normalizedBase,
    trace_id: normalizedBase.trace_id || ingressTraceId,
  };

  const issues = [...parseIssues, ...(Array.isArray(normalizedEvent.issues) ? normalizedEvent.issues : [])];
  if (rawBodyTooLarge) issues.push('raw_body_truncated');
  const provider = String(normalizedEvent.provider || 'unknown').toLowerCase().trim() || 'unknown';
  const eventId =
    String(normalizedEvent.event_id || `raw:${provider}:${rawHash.slice(0, 24)}`)
      .trim();
  const idempotencyKey = `${provider}:${eventId}`;

  const jobPayload = {
    provider,
    event_id: eventId,
    normalized_event: { ...normalizedEvent, issues },
    raw_body: rawBodyText,
    headers,
  };

  let inserted = { rowCount: 0 };
  let enqueueError = null;
  let replayCount = 0;

  try {
    const dedupe = await pool.query(
      `INSERT INTO payment_webhook_event_dedupe (
        provider, event_id, first_seen_at, last_seen_at, occurred_at, replay_count, last_replay_at, last_trace_id
      )
      VALUES ($1, $2, NOW(), NOW(), $3::timestamptz, 0, NULL, $4)
      ON CONFLICT (provider, event_id) DO UPDATE SET
        last_seen_at = NOW(),
        replay_count = payment_webhook_event_dedupe.replay_count + 1,
        last_replay_at = NOW(),
        last_trace_id = EXCLUDED.last_trace_id
      RETURNING replay_count`,
      [
        provider,
        eventId,
        normalizedEvent.occurred_at || null,
        normalizedEvent.trace_id || ingressTraceId,
      ],
    );
    replayCount = Number(dedupe.rows?.[0]?.replay_count || 0);

    if (replayCount === 0) {
      inserted = await pool.query(
        `INSERT INTO payment_webhook_jobs (
          provider, event_id, event_type, trace_id,
          headers_json, payload_json, payload_sha256, idempotency_key,
          status, retryable, attempt_count, next_attempt_at
        )
        VALUES (
          $1, $2, $3, $4,
          $5::jsonb, $6::jsonb, $7, $8,
          'queued', TRUE, 0, NOW()
        )
        RETURNING id`,
        [
          provider,
          eventId,
          normalizedEvent.event_type || 'unsupported',
          normalizedEvent.trace_id || ingressTraceId,
          stableStringify(headers),
          stableStringify(jobPayload),
          rawHash,
          idempotencyKey,
        ],
      );
    }
  } catch (e) {
    enqueueError = e?.message || 'enqueue_failed';
    console.error('[payments-webhook-intake]', {
      trace_id: normalizedEvent.trace_id || ingressTraceId,
      provider,
      event_id: eventId,
      error: enqueueError,
    });
  }

  return {
    status: 200,
    body: {
      ok: true,
      queued: inserted.rowCount > 0,
      duplicate: inserted.rowCount === 0 || replayCount > 0,
      idempotency_key: idempotencyKey,
      event_id: eventId,
      trace_id: normalizedEvent.trace_id || ingressTraceId,
      replay_count: replayCount,
      enqueue_error: enqueueError || undefined,
    },
  };
}

