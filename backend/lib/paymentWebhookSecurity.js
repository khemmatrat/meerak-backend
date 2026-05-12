/**
 * Task 3 — Payment webhook HMAC signature verification (shared by worker orchestrator).
 *
 * Env (primary secret — first non-empty wins, backward compatible):
 *   PAYMENT_WEBHOOK_SECRET
 *   PAYMENT_GATEWAY_WEBHOOK_SECRET
 *
 * Env (rotation / next key — first non-empty wins):
 *   PAYMENT_WEBHOOK_SECRET_NEXT
 *   PAYMENT_GATEWAY_WEBHOOK_SECRET_NEXT
 *
 * Env (optional):
 *   PAYMENT_GATEWAY_WEBHOOK_SIGNATURE_HEADER — custom header name (lowercase) for signature, same as server.js wallet handler
 *   PAYMENT_WEBHOOK_STRICT=1 — in production, if no primary secret is configured, verification fails closed (instead of skipped)
 *
 * Route → signature header resolution (must match server.js only; see table WEBHOOK_SIGNATURE_HEADER_SOURCES below).
 * Algorithms: HMAC-SHA256 over raw body bytes; compare with crypto.timingSafeEqual on hex digests when possible.
 *
 * No secrets or raw bodies are logged from this module.
 */

import crypto from 'crypto';

/** @typedef {'phase1a_payments'|'checkout_wallet'} WebhookRouteKind */

/**
 * Header resolution order aligned with createPaymentWebhookHandler() in server.js
 * (POST /api/webhooks/checkout) and the same header names used for POST /api/payments/webhook
 * Phase 1A intake (no inline verify there — worker verifies here).
 *
 * @type {ReadonlyArray<{ route: WebhookRouteKind, serverJsAnchor: string, headerKeys: readonly string[] }>}
 */
export const WEBHOOK_SIGNATURE_HEADER_SOURCES = Object.freeze([
  {
    route: 'phase1a_payments',
    serverJsAnchor: "POST '/api/payments/webhook' (express.raw + handlePaymentsConfirmWebhook)",
    /** Same resolution order as createPaymentWebhookHandler in server.js (custom env, x-webhook-signature, x-payment-signature). */
    headerKeys: Object.freeze([
      'PAYMENT_GATEWAY_WEBHOOK_SIGNATURE_HEADER',
      'x-webhook-signature',
      'x-payment-signature',
    ]),
  },
  {
    route: 'checkout_wallet',
    serverJsAnchor: "POST '/api/webhooks/checkout' + createPaymentWebhookHandler()",
    headerKeys: Object.freeze([
      'PAYMENT_GATEWAY_WEBHOOK_SIGNATURE_HEADER',
      'x-webhook-signature',
      'x-payment-signature',
    ]),
  },
]);

function safeStringify(v) {
  try {
    return JSON.stringify(v);
  } catch {
    return '{}';
  }
}

function toLowerHeaders(h) {
  const out = {};
  if (!h || typeof h !== 'object' || Array.isArray(h)) return out;
  for (const [k, v] of Object.entries(h)) {
    const key = String(k || '').toLowerCase().trim();
    if (!key) continue;
    out[key] = Array.isArray(v) ? v.map((x) => String(x)).join(',') : String(v ?? '');
  }
  return out;
}

/**
 * Primary webhook secret: PAYMENT_WEBHOOK_SECRET, else PAYMENT_GATEWAY_WEBHOOK_SECRET.
 */
export function resolvePrimaryWebhookSecret() {
  const a = String(process.env.PAYMENT_WEBHOOK_SECRET ?? '').trim();
  const b = String(process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET ?? '').trim();
  return a || b || '';
}

/**
 * Next rotation secret: PAYMENT_WEBHOOK_SECRET_NEXT, else PAYMENT_GATEWAY_WEBHOOK_SECRET_NEXT.
 */
export function resolveNextWebhookSecret() {
  const a = String(process.env.PAYMENT_WEBHOOK_SECRET_NEXT ?? '').trim();
  const b = String(process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET_NEXT ?? '').trim();
  return a || b || '';
}

function customSignatureHeaderName() {
  return String(process.env.PAYMENT_GATEWAY_WEBHOOK_SIGNATURE_HEADER || '').toLowerCase().trim();
}

/**
 * Resolve inbound signature string from headers (same order as server.js wallet webhook).
 * @param {Record<string, string>} headersLower
 */
export function extractSignatureFromHeaders(headersLower) {
  const h = headersLower || {};
  const custom = customSignatureHeaderName();
  if (custom && h[custom]) return String(h[custom]).trim();
  if (h['x-webhook-signature']) return String(h['x-webhook-signature']).trim();
  if (h['x-payment-signature']) return String(h['x-payment-signature']).trim();
  return '';
}

/** Strip optional `sha256=` prefix (some providers). */
function normalizeSignatureInput(sig) {
  const s = String(sig || '').trim();
  if (!s) return '';
  const lower = s.toLowerCase();
  if (lower.startsWith('sha256=')) return s.slice(7).trim();
  return s;
}

/**
 * @param {string} sig
 * @returns {Buffer|null} 32-byte buffer or null if not valid 64-char hex
 */
function tryHexToBuffer32(sig) {
  const s = normalizeSignatureInput(sig);
  if (!/^[0-9a-fA-F]{64}$/.test(s)) return null;
  return Buffer.from(s, 'hex');
}

/**
 * Pure verifier for unit tests and tooling.
 *
 * @param {{
 *   rawBody: Buffer|string,
 *   headers: Record<string, unknown>,
 *   provider?: string|null,
 * }} input
 * @returns {{
 *   ok: boolean,
 *   key_version: string,
 *   failure_code?: string,
 *   retryable: false,
 * }}
 */
export function verifyPaymentWebhookSignature(input) {
  const retryable = false;
  const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
  const strict = String(process.env.PAYMENT_WEBHOOK_STRICT || '').trim() === '1';

  const rawBody = input?.rawBody;
  const buf =
    Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(typeof rawBody === 'string' ? rawBody : String(rawBody ?? ''), 'utf8');

  const headersLower = toLowerHeaders(input?.headers || {});
  const primary = resolvePrimaryWebhookSecret();
  const next = resolveNextWebhookSecret();

  if (!primary) {
    if (isProd && strict) {
      return {
        ok: false,
        key_version: 'none',
        failure_code: 'SIGNATURE_REJECTED',
        retryable,
      };
    }
    if (isProd && !strict) {
      return { ok: true, key_version: 'skipped_no_secret', retryable };
    }
    return { ok: true, key_version: 'skipped_no_secret', retryable };
  }

  const sigHeader = extractSignatureFromHeaders(headersLower);
  if (!sigHeader) {
    if (isProd) {
      return { ok: false, key_version: 'none', failure_code: 'INVALID_SIGNATURE', retryable };
    }
    return { ok: true, key_version: 'skipped_missing_signature_non_prod', retryable };
  }

  const sigBuf = tryHexToBuffer32(sigHeader);
  if (!sigBuf) {
    return {
      ok: false,
      key_version: 'none',
      failure_code: 'SIGNATURE_VERIFICATION_FAILED',
      retryable,
    };
  }

  const trySecret = (secret, versionLabel) => {
    const expectedHex = crypto.createHmac('sha256', secret).update(buf).digest('hex');
    const expBuf = Buffer.from(expectedHex, 'hex');
    if (expBuf.length !== sigBuf.length) return false;
    try {
      return crypto.timingSafeEqual(expBuf, sigBuf);
    } catch {
      return false;
    }
  };

  if (trySecret(primary, 'active')) {
    return { ok: true, key_version: 'active', retryable };
  }
  if (next && trySecret(next, 'next')) {
    return { ok: true, key_version: 'next', retryable };
  }

  return {
    ok: false,
    key_version: 'none',
    failure_code: 'SIGNATURE_VERIFICATION_FAILED',
    retryable,
  };
}

/**
 * Reconstruct raw body + headers from payment_webhook_jobs row (matches intake payload shape).
 * @param {any} job
 */
export function extractRawBodyAndHeadersFromJob(job) {
  let payload = job?.payload_json;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = {};
    }
  }
  if (!payload || typeof payload !== 'object') payload = {};

  const rawStr = typeof payload.raw_body === 'string' ? payload.raw_body : '';
  const rawBuf = rawStr.length ? Buffer.from(rawStr, 'utf8') : Buffer.from(safeStringify(payload), 'utf8');

  let headers = job?.headers_json;
  if (typeof headers === 'string') {
    try {
      headers = JSON.parse(headers);
    } catch {
      headers = {};
    }
  }
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) headers = {};

  return { rawBuf, headers: toLowerHeaders(headers) };
}

/**
 * Callback for paymentCoreConfirm.setSignatureVerifier / paymentWebhookWorker.setSignatureVerifier.
 */
export function createPaymentWebhookSignatureVerifierCallback() {
  return async function verifyJobSignature({ job }) {
    const { rawBuf, headers } = extractRawBodyAndHeadersFromJob(job);
    return verifyPaymentWebhookSignature({ rawBody: rawBuf, headers, provider: job?.provider });
  };
}
