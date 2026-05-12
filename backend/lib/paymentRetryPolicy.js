/**
 * Task 12: Retry taxonomy + fixed schedule shared by webhook worker and outbound dispatcher.
 *
 * Scheduling is DB-owned (NOW() + interval); this module exposes delay seconds only — no jitter.
 */

/** Fixed backoff (seconds): attempt 1 → 30s, 2 → 2m, 3 → 10m, 4 → 30m; attempt ≥5 ⇒ exhausted (DLQ). */
export const RETRY_SCHEDULE_SECONDS = Object.freeze([30, 120, 600, 1800]);

/** @deprecated Prefer RETRY_SCHEDULE_SECONDS; retained for callers importing the old symbol. */
export const RETRY_BACKOFF_SECONDS = RETRY_SCHEDULE_SECONDS;

/** Frozen at 0: no random backoff (deterministic retries). Kept so existing regression bounds stay valid. */
export const RETRY_JITTER_RATIO = 0;

const _HARDFAIL_PG = new Set([
  '23502', // not_null_violation
  '23503', // foreign_key_violation
  '23505', // unique_violation
  '23514', // check_violation
  '22P02', // invalid_text_representation
  '42P01', // undefined_table
  '42703', // undefined_column
  '42501', // insufficient_privilege
]);

const _RETRY_PG = new Set([
  '08006', // connection_failure
  '08003', // connection_does_not_exist
  '57P03', // cannot_connect_now
  '53300', // too_many_connections
  '40P01', // deadlock_detected
]);

const _HARDFAIL_APP_CODES = new Set([
  'INVALID_SIGNATURE',
  'SIGNATURE_VERIFICATION_FAILED',
  'SIGNATURE_REJECTED',
  'UNKNOWN_PAYMENT_PURPOSE',
  'AMOUNT_MISMATCH',
  'CURRENCY_MISMATCH',
  'INVALID_TRANSITION',
  'MALFORMED_PAYLOAD',
  'POISON_MESSAGE',
  'HTTP_IN_TX_FORBIDDEN',
  'BAD_REQUEST',
  'VALIDATION_ERROR',
]);

const _RETRY_APP_CODES = new Set([
  'PROVIDER_TIMEOUT',
  'UPSTREAM_5XX',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'ESOCKETTIMEDOUT',
  'ENOTFOUND',
  'ENETUNREACH',
  'NETWORK_ERROR',
  'REDIS_UNAVAILABLE',
  'REDIS_ETIMEDOUT',
  'UPSTREAM_UNAVAILABLE',
  'TEMPORARY_UNAVAILABLE',
]);

/** Node errno-style codes (case-insensitive match). */
const _RETRY_NODE_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'ENOTFOUND',
  'ENETUNREACH',
  'ESOCKETTIMEDOUT',
]);

function _normFailureCode(raw) {
  const s = String(raw != null ? raw : '').trim();
  if (!s) return null;
  let u = s.toUpperCase().replace(/\s+/g, '_');
  return u.replace(/[^A-Z0-9_-]/g, '');
}

function _httpStatus(error) {
  const n =
    Number(error?.response?.status) ||
    Number(error?.response?.statusCode) ||
    Number(error?.status) ||
    0;
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {unknown} error
 * @returns {{
 *   retryable: boolean,
 *   hardFail: boolean,
 *   deadLetterReason?: string,
 *   failureCode?: string,
 *   requiresManualReview?: boolean
 * }}
 *
 * Pure: no DB, no logging, no mutation of error, deterministic for the same inputs.
 */
export function classifyRetryability(error) {
  if (error == null) {
    return {
      retryable: true,
      hardFail: false,
      failureCode: 'NETWORK_ERROR',
      requiresManualReview: false,
    };
  }

  const ctorName = String(error?.constructor?.name || '');
  if (ctorName === 'SyntaxError' || ctorName === 'TypeError') {
    return {
      retryable: false,
      hardFail: true,
      failureCode: 'POISON_MESSAGE',
      requiresManualReview: true,
    };
  }

  if (error.nonRetryable === true) {
    const fc =
      _normFailureCode(error.code ?? error.failure_code) || 'NON_RETRYABLE';
    return {
      retryable: false,
      hardFail: true,
      failureCode: fc,
      requiresManualReview: true,
    };
  }

  const rawCodeAny = /** @type {any} */ (error).code;
  const pgCodeCandidate =
    rawCodeAny != null && typeof rawCodeAny === 'string' && /^[0-9A-Z]{5}$/.test(rawCodeAny)
      ? rawCodeAny
      : '';

  const codeStrUpper =
    typeof rawCodeAny === 'string' ? rawCodeAny.toUpperCase() : '';

  const fcFromCode =
    codeStrUpper && /^[A-Z][A-Z0-9_-]*$/.test(codeStrUpper) && !/^[0-9]/.test(codeStrUpper)
      ? _normFailureCode(codeStrUpper)
      : codeStrUpper;

  const msg = String(error.message || '');

  if (/invalid\s*(webhook\s*)?signature/i.test(msg) || /signature\s+verification\s+failed/i.test(msg)) {
    return {
      retryable: false,
      hardFail: true,
      failureCode: 'INVALID_SIGNATURE',
      requiresManualReview: true,
    };
  }
  if (/\bamount\s*mismatch\b/i.test(msg)) {
    return {
      retryable: false,
      hardFail: true,
      failureCode: 'AMOUNT_MISMATCH',
      requiresManualReview: true,
    };
  }
  if (/\bcurrency\s*mismatch\b/i.test(msg)) {
    return {
      retryable: false,
      hardFail: true,
      failureCode: 'CURRENCY_MISMATCH',
      requiresManualReview: true,
    };
  }
  if (/\binvalid_transition\b/i.test(msg) || /\binvalid\s+state\s+transition/i.test(msg)) {
    return {
      retryable: false,
      hardFail: true,
      failureCode: 'INVALID_TRANSITION',
      requiresManualReview: true,
    };
  }
  if (/malformed|invalid\s+json|unexpected\s+token/i.test(msg)) {
    return {
      retryable: false,
      hardFail: true,
      failureCode: 'MALFORMED_PAYLOAD',
      requiresManualReview: true,
    };
  }

  const http = _httpStatus(error);
  if (http === 408) {
    return {
      retryable: true,
      hardFail: false,
      failureCode: 'PROVIDER_TIMEOUT',
      requiresManualReview: false,
    };
  }
  if (http === 429) {
    return {
      retryable: true,
      hardFail: false,
      failureCode: 'NETWORK_ERROR',
      requiresManualReview: false,
    };
  }
  if (http >= 500 && http <= 599) {
    return {
      retryable: true,
      hardFail: false,
      failureCode: 'UPSTREAM_5XX',
      requiresManualReview: false,
    };
  }
  if (http >= 400 && http <= 499) {
    return {
      retryable: false,
      hardFail: true,
      failureCode: fcFromCode && String(fcFromCode).length <= 48 ? fcFromCode : 'POISON_MESSAGE',
      requiresManualReview: true,
    };
  }

  if (pgCodeCandidate && _HARDFAIL_PG.has(pgCodeCandidate)) {
    let fc = pgCodeCandidate;
    if (pgCodeCandidate === '23505') fc = 'BUSINESS_INVARIANT_VIOLATION';
    else if (pgCodeCandidate === '22P02') fc = 'MALFORMED_PAYLOAD';
    else fc = 'POISON_MESSAGE';
    return {
      retryable: false,
      hardFail: true,
      failureCode: fc,
      requiresManualReview: true,
    };
  }

  if (pgCodeCandidate && _RETRY_PG.has(pgCodeCandidate)) {
    return {
      retryable: true,
      hardFail: false,
      failureCode: 'NETWORK_ERROR',
      requiresManualReview: false,
    };
  }

  if (_RETRY_NODE_CODES.has(codeStrUpper)) {
    const fc =
      [..._RETRY_NODE_CODES].find((c) => c === codeStrUpper) || codeStrUpper;
    return {
      retryable: true,
      hardFail: false,
      failureCode: fc || 'NETWORK_ERROR',
      requiresManualReview: false,
    };
  }

  if (_HARDFAIL_APP_CODES.has(codeStrUpper)) {
    return {
      retryable: false,
      hardFail: true,
      failureCode: codeStrUpper,
      requiresManualReview: true,
    };
  }
  if (_RETRY_APP_CODES.has(codeStrUpper)) {
    return {
      retryable: true,
      hardFail: false,
      failureCode: codeStrUpper,
      requiresManualReview: false,
    };
  }

  if (/\bredis\b/i.test(msg) && /(timeout|unavailable|econnrefused|econnreset)/i.test(msg)) {
    return {
      retryable: true,
      hardFail: false,
      failureCode: 'REDIS_UNAVAILABLE',
      requiresManualReview: false,
    };
  }

  if (/^([a-z][a-z0-9]*)(_([a-z0-9])+)+$/i.test(String(rawCodeAny || '').trim())) {
    const u = String(rawCodeAny).trim().toUpperCase();
    const transientSnakeFragment =
      /CONNECTION|TIMEOUT|RESET|REDIS|UPSTREAM|TEMPORARY|RETRY|NETWORK|SOCKET|REFUSED|UNREACHABLE|ECONN|EPIPE|EHOST/i.test(u);
    if (!_RETRY_NODE_CODES.has(u) && !_RETRY_APP_CODES.has(u) && !transientSnakeFragment) {
      return {
        retryable: false,
        hardFail: true,
        failureCode: u,
        requiresManualReview: true,
      };
    }
  }

  return {
    retryable: true,
    hardFail: false,
    failureCode: fcFromCode || 'NETWORK_ERROR',
    requiresManualReview: false,
  };
}

/**
 * Delay before the next attempt (seconds), or null when schedule exhausted (DLQ).
 * `attempt` is post-fetch `attempt_count` (first failed run ⇒ 1 ⇒ 30s).
 *
 * @param {number|string} attempt
 * @returns {number|null}
 */
export function computeRetryDelaySeconds(attempt) {
  const N = Number(attempt) || 0;
  if (N <= 0 || N > RETRY_SCHEDULE_SECONDS.length) return null;
  const idx = Math.min(N - 1, RETRY_SCHEDULE_SECONDS.length - 1);
  return RETRY_SCHEDULE_SECONDS[idx];
}

/**
 * @deprecated Use computeRetryDelaySeconds
 * @param {number|string} attemptCount
 * @returns {number|null}
 */
export function computeRetryBackoffSeconds(attemptCount) {
  return computeRetryDelaySeconds(attemptCount);
}
