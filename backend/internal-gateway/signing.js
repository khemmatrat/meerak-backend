/**
 * @fileoverview HMAC-SHA256 request signing + replay protection contract.
 * Backend ↔ Internal Gateway service: same secret, clock skew window for timestamp.
 */
import crypto from 'crypto';

const DEFAULT_TTL_SEC = 300;
const MAX_CLOCK_SKEW_SEC = 120;

/**
 * @param {string} secret
 * @param {string} bodyCanonicalUtf8
 * @param {string} nonce
 * @param {string} timestampUnix
 * @returns {string} hex digest
 */
export function computeHmacSignature(secret, bodyCanonicalUtf8, nonce, timestampUnix) {
  const payload = `${timestampUnix}.${nonce}.${bodyCanonicalUtf8}`;
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

/**
 * @returns {{ nonce: string, ts: string }}
 */
export function generateNonceAndTimestamp() {
  const nonce = crypto.randomBytes(16).toString('hex');
  const ts = String(Math.floor(Date.now() / 1000));
  return { nonce, ts };
}

/**
 * Signs a UTF-8 body and returns nonce/timestamp headers for transport.
 * @param {string} secret Shared HMAC secret
 * @param {string} bodyUtf8 Canonical JSON body (caller stringifies once)
 * @returns {{ signature: string, nonce: string, timestamp: string, 'X-AQOND-Gateway-Timestamp': string, 'X-AQOND-Gateway-Nonce': string }}
 */
export function signBody(secret, bodyUtf8) {
  const { nonce, ts } = generateNonceAndTimestamp();
  const sig = computeHmacSignature(secret, bodyUtf8, nonce, ts);
  return {
    signature: sig,
    nonce,
    timestamp: ts,
    'X-AQOND-Gateway-Timestamp': ts,
    'X-AQOND-Gateway-Nonce': nonce,
  };
}

/**
 * @param {string} secret
 * @param {string} bodyUtf8
 * @param {string} signatureHex
 * @param {string} nonce
 * @param {string} timestampUnix
 * @returns {{ ok: boolean, reason?: string }}
 */
export function verifyHmacOnly(secret, bodyUtf8, signatureHex, nonce, timestampUnix) {
  if (!secret || !signatureHex || !nonce || !timestampUnix) {
    return { ok: false, reason: 'missing_fields' };
  }
  const ts = parseInt(timestampUnix, 10);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'bad_timestamp' };
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > DEFAULT_TTL_SEC + MAX_CLOCK_SKEW_SEC) {
    return { ok: false, reason: 'timestamp_expired' };
  }
  const expected = computeHmacSignature(secret, bodyUtf8, nonce, timestampUnix);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(String(signatureHex).trim(), 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad_signature' };
  }
  return { ok: true };
}
