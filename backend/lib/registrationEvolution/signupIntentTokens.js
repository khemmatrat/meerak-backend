/**
 * Phase 2.5 — HMAC-signed recovery/access tokens for signup intents.
 *
 * Replaces raw recovery_token validation with signed tokens that embed:
 *   intent_id + recovery_token + expires_at
 * Prevents enumeration attacks even if raw UUIDs leak.
 *
 * Gated by ENABLE_INTENT_SIGNED_TOKENS (default off → falls back to raw token compare).
 */

import crypto from 'crypto';
import { getRegistrationEvolutionFeatureFlags } from './featureFlags.js';

const SIGNED_TOKEN_VERSION = 1;
const SEPARATOR = '.';

/**
 * Signing secret — derived from SIGNUP_INTENT_HMAC_SECRET or falls back to JWT_SECRET.
 * Caching would be premature since env reads are cheap and must reflect runtime changes.
 */
function getHmacSecret() {
  const explicit = (process.env.SIGNUP_INTENT_HMAC_SECRET || '').trim();
  if (explicit.length >= 32) return explicit;
  const jwt = (process.env.JWT_SECRET || '').trim();
  if (jwt) return `signup-intent-hmac:${jwt}`;
  return '';
}

/**
 * @param {string} intentId
 * @param {string} rawRecoveryToken
 * @param {string|Date} expiresAt
 * @returns {string} base64url signed token  (`version.payload.signature`)
 */
export function signIntentAccessToken(intentId, rawRecoveryToken, expiresAt) {
  const secret = getHmacSecret();
  if (!secret) {
    return rawRecoveryToken;
  }
  const expIso = typeof expiresAt === 'string' ? expiresAt : new Date(expiresAt).toISOString();
  const payloadObj = { v: SIGNED_TOKEN_VERSION, iid: intentId, rt: rawRecoveryToken, exp: expIso };
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return [SIGNED_TOKEN_VERSION, payloadB64, sig].join(SEPARATOR);
}

/**
 * Verify a signed intent access token.
 *
 * @param {string} signedToken  — the token supplied by the client
 * @param {string} intentId     — from URL param (must match embedded claim)
 * @returns {{ valid: boolean, rawRecoveryToken?: string, expired?: boolean, reason?: string }}
 */
export function verifyIntentAccessToken(signedToken, intentId) {
  const secret = getHmacSecret();
  if (!secret) {
    return { valid: true, rawRecoveryToken: signedToken };
  }
  try {
    const parts = String(signedToken || '').split(SEPARATOR);
    if (parts.length !== 3) return { valid: false, reason: 'malformed_token' };

    const [verStr, payloadB64, sigProvided] = parts;
    if (Number(verStr) !== SIGNED_TOKEN_VERSION) return { valid: false, reason: 'unsupported_version' };

    const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
    const sigMatch = crypto.timingSafeEqual(
      Buffer.from(expectedSig, 'utf8'),
      Buffer.from(String(sigProvided || ''), 'utf8'),
    );
    if (!sigMatch) return { valid: false, reason: 'invalid_signature' };

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (payload.iid !== intentId) return { valid: false, reason: 'intent_id_mismatch' };

    const expMs = new Date(payload.exp).getTime();
    if (!Number.isNaN(expMs) && expMs <= Date.now()) return { valid: false, expired: true, reason: 'token_expired' };

    return { valid: true, rawRecoveryToken: payload.rt };
  } catch (_) {
    return { valid: false, reason: 'parse_error' };
  }
}

/**
 * Returns true when signed token mode is active (flag on + secret available).
 */
export function isSignedTokenModeActive() {
  if (!getRegistrationEvolutionFeatureFlags().ENABLE_INTENT_SIGNED_TOKENS) return false;
  return getHmacSecret().length > 0;
}
