/**
 * Phase 3.9 — Consumer lease contract (no execution).
 *
 * Defines the consumer lifecycle model for signup-evolution async jobs.
 * Leases track a consumer's reservation, processing, and acknowledgement
 * of a job envelope — without actually dequeuing or executing anything.
 *
 * SAFETY CONTRACT:
 * - Pure synchronous logic only — no async/await, no Promises, no timers
 * - No job execution — leases describe lifecycle, nothing is processed
 * - No queue consumption — no dequeue, no polling, no worker loops
 * - No DB imports — no reads, no writes
 * - No V1 coupling — nothing in V1 imports or references this module
 * - Never throws — every public function is wrapped in try/catch
 */

// ─── constants ─────────────────────────────────────────────────────

export const SIGNUP_CONSUMER_CONTRACT_VERSION = 'signup_consumer_v1';

export const SIGNUP_CONSUMER_STATES = Object.freeze({
  IDLE: 'idle',
  RESERVED: 'reserved',
  PROCESSING: 'processing',
  ACKNOWLEDGED: 'acknowledged',
  FAILED: 'failed',
  ABANDONED: 'abandoned',
});

export const SIGNUP_CONSUMER_FAILURE_REASONS = Object.freeze({
  LEASE_EXPIRED: 'lease_expired',
  INVALID_ENVELOPE: 'invalid_envelope',
  PROCESSING_ERROR: 'processing_error',
  ACKNOWLEDGEMENT_TIMEOUT: 'acknowledgement_timeout',
  UNKNOWN: 'unknown',
});

const KNOWN_STATES = new Set(Object.values(SIGNUP_CONSUMER_STATES));

const TERMINAL_STATES = new Set([
  SIGNUP_CONSUMER_STATES.ACKNOWLEDGED,
  SIGNUP_CONSUMER_STATES.ABANDONED,
]);

const ALLOWED_TRANSITIONS = Object.freeze({
  [SIGNUP_CONSUMER_STATES.IDLE]: [SIGNUP_CONSUMER_STATES.RESERVED],
  [SIGNUP_CONSUMER_STATES.RESERVED]: [SIGNUP_CONSUMER_STATES.PROCESSING],
  [SIGNUP_CONSUMER_STATES.PROCESSING]: [SIGNUP_CONSUMER_STATES.ACKNOWLEDGED, SIGNUP_CONSUMER_STATES.FAILED],
  [SIGNUP_CONSUMER_STATES.FAILED]: [SIGNUP_CONSUMER_STATES.ABANDONED],
});

const DEFAULT_LEASE_TIMEOUT_MS = 30000;

// ─── state helpers ─────────────────────────────────────────────────

/**
 * @param {string} state
 * @returns {boolean}
 */
export function isValidConsumerState(state) {
  try {
    return KNOWN_STATES.has(state);
  } catch (_) {
    return false;
  }
}

/**
 * @param {string} state
 * @returns {boolean}
 */
export function isTerminalConsumerState(state) {
  try {
    return TERMINAL_STATES.has(state);
  } catch (_) {
    return false;
  }
}

// ─── lease factory ─────────────────────────────────────────────────

let _leaseSeq = 0;

/**
 * Create a consumer lease descriptor.
 *
 * @param {{
 *   queue_name?: string,
 *   envelope_id?: string,
 *   consumer_id?: string,
 *   state?: string,
 *   lease_timeout_ms?: number,
 *   failure_reason?: string,
 *   metadata?: Record<string, unknown>
 * }} input
 * @returns {{
 *   lease_id: string,
 *   consumer_version: string,
 *   queue_name: string | null,
 *   envelope_id: string | null,
 *   consumer_id: string | null,
 *   state: string,
 *   leased_at: string,
 *   lease_timeout_ms: number,
 *   expires_at: string,
 *   failure_reason: string | null,
 *   metadata: Record<string, unknown>
 * } | null}
 */
export function createConsumerLease(input) {
  try {
    if (!input || typeof input !== 'object') return null;

    const state = input.state && KNOWN_STATES.has(input.state)
      ? input.state
      : SIGNUP_CONSUMER_STATES.RESERVED;

    const timeoutMs = typeof input.lease_timeout_ms === 'number' && Number.isFinite(input.lease_timeout_ms)
      ? Math.max(0, Math.floor(input.lease_timeout_ms))
      : DEFAULT_LEASE_TIMEOUT_MS;

    const leasedAt = new Date();
    const expiresAt = new Date(leasedAt.getTime() + timeoutMs);

    return {
      lease_id: `lease-${Date.now()}-${++_leaseSeq}`,
      consumer_version: SIGNUP_CONSUMER_CONTRACT_VERSION,
      queue_name: input.queue_name ? String(input.queue_name) : null,
      envelope_id: input.envelope_id ? String(input.envelope_id) : null,
      consumer_id: input.consumer_id ? String(input.consumer_id) : null,
      state,
      leased_at: leasedAt.toISOString(),
      lease_timeout_ms: timeoutMs,
      expires_at: expiresAt.toISOString(),
      failure_reason: input.failure_reason ? String(input.failure_reason) : null,
      metadata: (input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata))
        ? input.metadata
        : {},
    };
  } catch (_) {
    return null;
  }
}

// ─── lease transition ──────────────────────────────────────────────

/**
 * Transition a consumer lease to a new state, returning a new cloned object.
 * Never mutates the original lease.
 *
 * @param {Record<string, unknown>} lease
 * @param {string} nextState
 * @param {{ failure_reason?: string, metadata?: Record<string, unknown> }} [opts]
 * @returns {{ lease: Record<string, unknown> | null, transitioned: boolean, reason: string }}
 */
export function transitionConsumerLease(lease, nextState, opts) {
  try {
    if (!lease || typeof lease !== 'object') {
      return { lease: null, transitioned: false, reason: 'invalid_lease' };
    }
    if (!nextState || !KNOWN_STATES.has(nextState)) {
      return { lease: null, transitioned: false, reason: 'invalid_next_state' };
    }

    const currentState = lease.state;
    if (!currentState || !KNOWN_STATES.has(currentState)) {
      return { lease: null, transitioned: false, reason: 'invalid_current_state' };
    }

    const allowed = ALLOWED_TRANSITIONS[currentState];
    if (!allowed || !allowed.includes(nextState)) {
      return {
        lease: null,
        transitioned: false,
        reason: `transition_not_allowed: ${currentState} -> ${nextState}`,
      };
    }

    const cloned = { ...lease };
    cloned.state = nextState;

    if (opts?.failure_reason) {
      cloned.failure_reason = String(opts.failure_reason);
    }
    if (opts?.metadata && typeof opts.metadata === 'object' && !Array.isArray(opts.metadata)) {
      cloned.metadata = { ...(cloned.metadata || {}), ...opts.metadata };
    }

    return { lease: cloned, transitioned: true, reason: 'ok' };
  } catch (_) {
    return { lease: null, transitioned: false, reason: 'unexpected_error' };
  }
}

// ─── lease expiration helpers ──────────────────────────────────────

/**
 * Check whether a lease has expired.
 *
 * @param {Record<string, unknown>} lease
 * @param {Date} [now] — defaults to current time
 * @returns {boolean}
 */
export function isLeaseExpired(lease, now) {
  try {
    if (!lease || !lease.expires_at) return true;
    const expiresAt = new Date(lease.expires_at).getTime();
    if (!Number.isFinite(expiresAt)) return true;
    const current = (now instanceof Date ? now : new Date()).getTime();
    return current >= expiresAt;
  } catch (_) {
    return true;
  }
}

/**
 * Compute remaining milliseconds on a lease.
 *
 * @param {Record<string, unknown>} lease
 * @param {Date} [now] — defaults to current time
 * @returns {number} remaining ms, minimum 0
 */
export function computeLeaseRemainingMs(lease, now) {
  try {
    if (!lease || !lease.expires_at) return 0;
    const expiresAt = new Date(lease.expires_at).getTime();
    if (!Number.isFinite(expiresAt)) return 0;
    const current = (now instanceof Date ? now : new Date()).getTime();
    return Math.max(0, expiresAt - current);
  } catch (_) {
    return 0;
  }
}
