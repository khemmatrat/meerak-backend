/**
 * Phase 3.8 — Retry policy contract (no retry execution).
 *
 * Defines retry strategies, eligibility logic, and delay calculations
 * for signup-evolution async jobs. This module makes decisions about
 * WHETHER and WHEN to retry — it never executes the retry itself.
 *
 * SAFETY CONTRACT:
 * - Pure synchronous logic only — no async/await, no Promises, no timers
 * - No retry execution — decisions only, no scheduling or dispatching
 * - No DB imports — no reads, no writes
 * - No queue interaction — no enqueue, no dequeue, no polling
 * - No V1 coupling — nothing in V1 imports or references this module
 * - Never throws — every public function is wrapped in try/catch
 */

// ─── constants ─────────────────────────────────────────────────────

export const SIGNUP_RETRY_POLICY_VERSION = 'signup_retry_policy_v1';

export const SIGNUP_RETRY_STRATEGIES = Object.freeze({
  NONE: 'none',
  FIXED: 'fixed',
  EXPONENTIAL: 'exponential',
  DEAD_LETTER_ONLY: 'dead_letter_only',
});

export const SIGNUP_RETRYABLE_FAILURES = Object.freeze({
  NETWORK: 'network',
  TIMEOUT: 'timeout',
  TEMPORARY_DB: 'temporary_db',
  RATE_LIMIT: 'rate_limit',
  UNKNOWN: 'unknown',
});

const KNOWN_STRATEGIES = new Set(Object.values(SIGNUP_RETRY_STRATEGIES));
const KNOWN_FAILURES = new Set(Object.values(SIGNUP_RETRYABLE_FAILURES));

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 30000;

// ─── policy factory ────────────────────────────────────────────────

/**
 * Create a retry policy descriptor.
 *
 * @param {{
 *   strategy?: string,
 *   max_attempts?: number,
 *   base_delay_ms?: number,
 *   max_delay_ms?: number,
 *   dead_letter_after_max?: boolean,
 *   retryable_failures?: string[]
 * }} input
 * @returns {{
 *   policy_version: string,
 *   strategy: string,
 *   max_attempts: number,
 *   base_delay_ms: number,
 *   max_delay_ms: number,
 *   dead_letter_after_max: boolean,
 *   retryable_failures: string[]
 * } | null}
 */
export function createRetryPolicy(input) {
  try {
    if (!input || typeof input !== 'object') return null;

    const strategy = input.strategy && KNOWN_STRATEGIES.has(input.strategy)
      ? input.strategy
      : SIGNUP_RETRY_STRATEGIES.EXPONENTIAL;

    const maxAttempts = typeof input.max_attempts === 'number' && Number.isFinite(input.max_attempts)
      ? Math.max(0, Math.floor(input.max_attempts))
      : DEFAULT_MAX_ATTEMPTS;

    const baseDelay = typeof input.base_delay_ms === 'number' && Number.isFinite(input.base_delay_ms)
      ? Math.max(0, Math.floor(input.base_delay_ms))
      : DEFAULT_BASE_DELAY_MS;

    const maxDelay = typeof input.max_delay_ms === 'number' && Number.isFinite(input.max_delay_ms)
      ? Math.max(baseDelay, Math.floor(input.max_delay_ms))
      : DEFAULT_MAX_DELAY_MS;

    let retryableFailures = [];
    if (Array.isArray(input.retryable_failures)) {
      retryableFailures = input.retryable_failures.filter(f => typeof f === 'string' && KNOWN_FAILURES.has(f));
    }
    if (retryableFailures.length === 0) {
      retryableFailures = Object.values(SIGNUP_RETRYABLE_FAILURES);
    }

    return {
      policy_version: SIGNUP_RETRY_POLICY_VERSION,
      strategy,
      max_attempts: maxAttempts,
      base_delay_ms: baseDelay,
      max_delay_ms: maxDelay,
      dead_letter_after_max: input.dead_letter_after_max !== false,
      retryable_failures: retryableFailures,
    };
  } catch (_) {
    return null;
  }
}

// ─── retry eligibility ─────────────────────────────────────────────

/**
 * Determine whether a failed dispatch should be retried.
 *
 * @param {{
 *   current_attempt: number,
 *   failure_reason: string,
 *   policy: ReturnType<typeof createRetryPolicy>
 * }} input
 * @returns {{ retry: boolean, terminal: boolean, next_attempt: number, reason: string }}
 */
export function shouldRetryDispatch(input) {
  try {
    if (!input || typeof input !== 'object') {
      return { retry: false, terminal: true, next_attempt: 0, reason: 'invalid_input' };
    }

    const policy = input.policy;
    if (!policy || typeof policy !== 'object') {
      return { retry: false, terminal: true, next_attempt: 0, reason: 'missing_policy' };
    }

    const currentAttempt = typeof input.current_attempt === 'number' && Number.isFinite(input.current_attempt)
      ? input.current_attempt
      : 0;

    if (policy.strategy === SIGNUP_RETRY_STRATEGIES.NONE) {
      return { retry: false, terminal: true, next_attempt: currentAttempt, reason: 'strategy_none' };
    }

    if (policy.strategy === SIGNUP_RETRY_STRATEGIES.DEAD_LETTER_ONLY) {
      return { retry: false, terminal: true, next_attempt: currentAttempt, reason: 'dead_letter_only' };
    }

    if (currentAttempt >= policy.max_attempts) {
      return {
        retry: false,
        terminal: policy.dead_letter_after_max,
        next_attempt: currentAttempt,
        reason: 'max_attempts_reached',
      };
    }

    const failureReason = input.failure_reason || '';
    if (failureReason && Array.isArray(policy.retryable_failures) && policy.retryable_failures.length > 0) {
      if (!policy.retryable_failures.includes(failureReason)) {
        return {
          retry: false,
          terminal: true,
          next_attempt: currentAttempt,
          reason: `non_retryable_failure: ${failureReason}`,
        };
      }
    }

    return {
      retry: true,
      terminal: false,
      next_attempt: currentAttempt + 1,
      reason: 'eligible',
    };
  } catch (_) {
    return { retry: false, terminal: true, next_attempt: 0, reason: 'unexpected_error' };
  }
}

// ─── delay calculation ─────────────────────────────────────────────

/**
 * Calculate the retry delay for a given attempt.
 *
 * @param {string} strategy — FIXED or EXPONENTIAL
 * @param {number} attempt — current attempt number (0-based)
 * @param {number} baseDelayMs
 * @param {number} maxDelayMs
 * @returns {number} delay in milliseconds, capped at maxDelayMs
 */
export function calculateRetryDelayMs(strategy, attempt, baseDelayMs, maxDelayMs) {
  try {
    const base = typeof baseDelayMs === 'number' && Number.isFinite(baseDelayMs)
      ? Math.max(0, baseDelayMs)
      : DEFAULT_BASE_DELAY_MS;

    const cap = typeof maxDelayMs === 'number' && Number.isFinite(maxDelayMs)
      ? Math.max(base, maxDelayMs)
      : DEFAULT_MAX_DELAY_MS;

    const att = typeof attempt === 'number' && Number.isFinite(attempt)
      ? Math.max(0, Math.floor(attempt))
      : 0;

    if (strategy === SIGNUP_RETRY_STRATEGIES.FIXED) {
      return Math.min(base, cap);
    }

    if (strategy === SIGNUP_RETRY_STRATEGIES.EXPONENTIAL) {
      const delay = base * Math.pow(2, att);
      return Math.min(delay, cap);
    }

    return 0;
  } catch (_) {
    return 0;
  }
}
