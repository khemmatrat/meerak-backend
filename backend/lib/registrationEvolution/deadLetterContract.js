/**
 * Phase 3.10 — Dead letter contract (no execution).
 *
 * Defines the dead-letter lifecycle for signup-evolution async jobs
 * that have exhausted retries or encountered non-retryable failures.
 * Records track quarantine, review, replay eligibility, and discard.
 *
 * SAFETY CONTRACT:
 * - Pure synchronous logic only — no async/await, no Promises, no timers
 * - No job execution — records describe lifecycle, nothing is replayed
 * - No queue mutation — no automatic re-enqueue, no dequeue
 * - No DB imports — no reads, no writes
 * - No V1 coupling — nothing in V1 imports or references this module
 * - Never throws — every public function is wrapped in try/catch
 */

// ─── constants ─────────────────────────────────────────────────────

export const SIGNUP_DEAD_LETTER_VERSION = 'signup_dead_letter_v1';

export const SIGNUP_DEAD_LETTER_REASONS = Object.freeze({
  MAX_RETRIES_EXCEEDED: 'max_retries_exceeded',
  NON_RETRYABLE_FAILURE: 'non_retryable_failure',
  INVALID_ENVELOPE: 'invalid_envelope',
  LEASE_EXPIRED: 'lease_expired',
  POISON_JOB: 'poison_job',
  UNKNOWN: 'unknown',
});

export const SIGNUP_DEAD_LETTER_STATES = Object.freeze({
  PENDING_REVIEW: 'pending_review',
  QUARANTINED: 'quarantined',
  REPLAYABLE: 'replayable',
  DISCARDED: 'discarded',
});

const KNOWN_STATES = new Set(Object.values(SIGNUP_DEAD_LETTER_STATES));

const TERMINAL_STATES = new Set([
  SIGNUP_DEAD_LETTER_STATES.DISCARDED,
]);

const ALLOWED_TRANSITIONS = Object.freeze({
  [SIGNUP_DEAD_LETTER_STATES.PENDING_REVIEW]: [
    SIGNUP_DEAD_LETTER_STATES.QUARANTINED,
    SIGNUP_DEAD_LETTER_STATES.REPLAYABLE,
  ],
  [SIGNUP_DEAD_LETTER_STATES.QUARANTINED]: [
    SIGNUP_DEAD_LETTER_STATES.DISCARDED,
  ],
  [SIGNUP_DEAD_LETTER_STATES.REPLAYABLE]: [
    SIGNUP_DEAD_LETTER_STATES.DISCARDED,
  ],
});

// ─── state helpers ─────────────────────────────────────────────────

/**
 * @param {string} state
 * @returns {boolean}
 */
export function isValidDeadLetterState(state) {
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
export function isTerminalDeadLetterState(state) {
  try {
    return TERMINAL_STATES.has(state);
  } catch (_) {
    return false;
  }
}

// ─── record factory ────────────────────────────────────────────────

let _dlqSeq = 0;

/**
 * Create a dead-letter record.
 *
 * @param {{
 *   queue_name?: string,
 *   envelope_id?: string,
 *   dispatch_id?: string,
 *   failure_reason?: string,
 *   state?: string,
 *   last_attempt_at?: string,
 *   retry_count?: number,
 *   metadata?: Record<string, unknown>
 * }} input
 * @returns {{
 *   dead_letter_id: string,
 *   dead_letter_version: string,
 *   queue_name: string | null,
 *   envelope_id: string | null,
 *   dispatch_id: string | null,
 *   failure_reason: string | null,
 *   state: string,
 *   created_at: string,
 *   last_attempt_at: string | null,
 *   retry_count: number,
 *   metadata: Record<string, unknown>
 * } | null}
 */
export function createDeadLetterRecord(input) {
  try {
    if (!input || typeof input !== 'object') return null;

    const state = input.state && KNOWN_STATES.has(input.state)
      ? input.state
      : SIGNUP_DEAD_LETTER_STATES.PENDING_REVIEW;

    const retryCount = typeof input.retry_count === 'number' && Number.isFinite(input.retry_count)
      ? Math.max(0, Math.floor(input.retry_count))
      : 0;

    return {
      dead_letter_id: `dlq-${Date.now()}-${++_dlqSeq}`,
      dead_letter_version: SIGNUP_DEAD_LETTER_VERSION,
      queue_name: input.queue_name ? String(input.queue_name) : null,
      envelope_id: input.envelope_id ? String(input.envelope_id) : null,
      dispatch_id: input.dispatch_id ? String(input.dispatch_id) : null,
      failure_reason: input.failure_reason ? String(input.failure_reason) : null,
      state,
      created_at: new Date().toISOString(),
      last_attempt_at: input.last_attempt_at ? String(input.last_attempt_at) : null,
      retry_count: retryCount,
      metadata: (input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata))
        ? input.metadata
        : {},
    };
  } catch (_) {
    return null;
  }
}

// ─── state transition ──────────────────────────────────────────────

/**
 * Transition a dead-letter record to a new state, returning a new cloned object.
 * Never mutates the original record.
 *
 * @param {Record<string, unknown>} record
 * @param {string} nextState
 * @param {{ metadata?: Record<string, unknown> }} [opts]
 * @returns {{ record: Record<string, unknown> | null, transitioned: boolean, reason: string }}
 */
export function transitionDeadLetterState(record, nextState, opts) {
  try {
    if (!record || typeof record !== 'object') {
      return { record: null, transitioned: false, reason: 'invalid_record' };
    }
    if (!nextState || !KNOWN_STATES.has(nextState)) {
      return { record: null, transitioned: false, reason: 'invalid_next_state' };
    }

    const currentState = record.state;
    if (!currentState || !KNOWN_STATES.has(currentState)) {
      return { record: null, transitioned: false, reason: 'invalid_current_state' };
    }

    const allowed = ALLOWED_TRANSITIONS[currentState];
    if (!allowed || !allowed.includes(nextState)) {
      return {
        record: null,
        transitioned: false,
        reason: `transition_not_allowed: ${currentState} -> ${nextState}`,
      };
    }

    const cloned = { ...record };
    cloned.state = nextState;

    if (opts?.metadata && typeof opts.metadata === 'object' && !Array.isArray(opts.metadata)) {
      cloned.metadata = { ...(cloned.metadata || {}), ...opts.metadata };
    }

    return { record: cloned, transitioned: true, reason: 'ok' };
  } catch (_) {
    return { record: null, transitioned: false, reason: 'unexpected_error' };
  }
}

// ─── dead-letter eligibility ───────────────────────────────────────

/**
 * Determine whether a failed dispatch should be dead-lettered.
 *
 * @param {{
 *   dispatch_state?: string,
 *   retry_decision?: { retry: boolean, terminal: boolean, reason?: string },
 *   failure_reason?: string
 * }} input
 * @returns {{ dead_letter: boolean, reason: string }}
 */
export function shouldDeadLetterDispatch(input) {
  try {
    if (!input || typeof input !== 'object') {
      return { dead_letter: false, reason: 'invalid_input' };
    }

    const retryDecision = input.retry_decision;

    if (retryDecision && typeof retryDecision === 'object') {
      if (retryDecision.retry === true) {
        return { dead_letter: false, reason: 'retry_allowed' };
      }
      if (retryDecision.terminal === true) {
        const dlReason = retryDecision.reason || input.failure_reason || SIGNUP_DEAD_LETTER_REASONS.UNKNOWN;
        return { dead_letter: true, reason: dlReason };
      }
    }

    if (input.failure_reason) {
      return { dead_letter: true, reason: String(input.failure_reason) };
    }

    return { dead_letter: false, reason: 'no_failure_detected' };
  } catch (_) {
    return { dead_letter: false, reason: 'unexpected_error' };
  }
}
