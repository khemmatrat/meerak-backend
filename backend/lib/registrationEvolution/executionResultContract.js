/**
 * Phase 3.11 — Execution result contract (no execution).
 *
 * Defines the canonical result shape for signup-evolution async job
 * processing. Results describe what happened after a consumer attempted
 * to execute a job envelope — without actually executing anything.
 *
 * SAFETY CONTRACT:
 * - Pure synchronous logic only — no async/await, no Promises, no timers
 * - No job execution — results describe outcomes, nothing is processed
 * - No queue mutation — no enqueue, no dequeue
 * - No DB imports — no reads, no writes
 * - No V1 coupling — nothing in V1 imports or references this module
 * - Never throws — every public function is wrapped in try/catch
 */

// ─── constants ─────────────────────────────────────────────────────

export const SIGNUP_EXECUTION_RESULT_VERSION = 'signup_execution_result_v1';

export const SIGNUP_EXECUTION_RESULT_STATES = Object.freeze({
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  RETRYABLE: 'retryable',
  DEAD_LETTERED: 'dead_lettered',
  ABANDONED: 'abandoned',
});

export const SIGNUP_EXECUTION_ERROR_KINDS = Object.freeze({
  VALIDATION_ERROR: 'validation_error',
  NETWORK_ERROR: 'network_error',
  TIMEOUT_ERROR: 'timeout_error',
  DATABASE_ERROR: 'database_error',
  IDEMPOTENCY_CONFLICT: 'idempotency_conflict',
  UNEXPECTED_ERROR: 'unexpected_error',
  UNKNOWN: 'unknown',
});

const KNOWN_STATES = new Set(Object.values(SIGNUP_EXECUTION_RESULT_STATES));

const TERMINAL_STATES = new Set([
  SIGNUP_EXECUTION_RESULT_STATES.SUCCEEDED,
  SIGNUP_EXECUTION_RESULT_STATES.DEAD_LETTERED,
  SIGNUP_EXECUTION_RESULT_STATES.ABANDONED,
]);

const ALLOWED_TRANSITIONS = Object.freeze({
  [SIGNUP_EXECUTION_RESULT_STATES.RETRYABLE]: [
    SIGNUP_EXECUTION_RESULT_STATES.FAILED,
    SIGNUP_EXECUTION_RESULT_STATES.DEAD_LETTERED,
  ],
  [SIGNUP_EXECUTION_RESULT_STATES.FAILED]: [
    SIGNUP_EXECUTION_RESULT_STATES.RETRYABLE,
    SIGNUP_EXECUTION_RESULT_STATES.ABANDONED,
  ],
});

// ─── state helpers ─────────────────────────────────────────────────

/**
 * @param {string} state
 * @returns {boolean}
 */
export function isValidExecutionResultState(state) {
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
export function isTerminalExecutionResultState(state) {
  try {
    return TERMINAL_STATES.has(state);
  } catch (_) {
    return false;
  }
}

// ─── result factory ────────────────────────────────────────────────

let _execSeq = 0;

/**
 * Create an execution result descriptor.
 *
 * @param {{
 *   envelope_id?: string,
 *   dispatch_id?: string,
 *   consumer_id?: string,
 *   state?: string,
 *   error_kind?: string,
 *   retryable?: boolean,
 *   started_at?: string,
 *   completed_at?: string,
 *   duration_ms?: number,
 *   metadata?: Record<string, unknown>
 * }} input
 * @returns {{
 *   execution_result_id: string,
 *   execution_result_version: string,
 *   envelope_id: string | null,
 *   dispatch_id: string | null,
 *   consumer_id: string | null,
 *   state: string,
 *   error_kind: string | null,
 *   retryable: boolean,
 *   started_at: string | null,
 *   completed_at: string | null,
 *   duration_ms: number | null,
 *   metadata: Record<string, unknown>
 * } | null}
 */
export function createExecutionResult(input) {
  try {
    if (!input || typeof input !== 'object') return null;

    const state = input.state && KNOWN_STATES.has(input.state)
      ? input.state
      : SIGNUP_EXECUTION_RESULT_STATES.SUCCEEDED;

    const errorKind = input.error_kind ? String(input.error_kind) : null;

    const durationMs = typeof input.duration_ms === 'number' && Number.isFinite(input.duration_ms)
      ? Math.max(0, input.duration_ms)
      : (input.started_at && input.completed_at
        ? computeExecutionDurationMs(input.started_at, input.completed_at)
        : null);

    return {
      execution_result_id: `exec-${Date.now()}-${++_execSeq}`,
      execution_result_version: SIGNUP_EXECUTION_RESULT_VERSION,
      envelope_id: input.envelope_id ? String(input.envelope_id) : null,
      dispatch_id: input.dispatch_id ? String(input.dispatch_id) : null,
      consumer_id: input.consumer_id ? String(input.consumer_id) : null,
      state,
      error_kind: errorKind,
      retryable: Boolean(input.retryable),
      started_at: input.started_at ? String(input.started_at) : null,
      completed_at: input.completed_at ? String(input.completed_at) : null,
      duration_ms: durationMs,
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
 * Transition an execution result to a new state, returning a new cloned object.
 * Never mutates the original result.
 *
 * @param {Record<string, unknown>} result
 * @param {string} nextState
 * @param {{ error_kind?: string, metadata?: Record<string, unknown> }} [opts]
 * @returns {{ result: Record<string, unknown> | null, transitioned: boolean, reason: string }}
 */
export function transitionExecutionResult(result, nextState, opts) {
  try {
    if (!result || typeof result !== 'object') {
      return { result: null, transitioned: false, reason: 'invalid_result' };
    }
    if (!nextState || !KNOWN_STATES.has(nextState)) {
      return { result: null, transitioned: false, reason: 'invalid_next_state' };
    }

    const currentState = result.state;
    if (!currentState || !KNOWN_STATES.has(currentState)) {
      return { result: null, transitioned: false, reason: 'invalid_current_state' };
    }

    const allowed = ALLOWED_TRANSITIONS[currentState];
    if (!allowed || !allowed.includes(nextState)) {
      return {
        result: null,
        transitioned: false,
        reason: `transition_not_allowed: ${currentState} -> ${nextState}`,
      };
    }

    const cloned = { ...result };
    cloned.state = nextState;
    cloned.retryable = nextState === SIGNUP_EXECUTION_RESULT_STATES.RETRYABLE;

    if (opts?.error_kind) {
      cloned.error_kind = String(opts.error_kind);
    }
    if (opts?.metadata && typeof opts.metadata === 'object' && !Array.isArray(opts.metadata)) {
      cloned.metadata = { ...(cloned.metadata || {}), ...opts.metadata };
    }

    return { result: cloned, transitioned: true, reason: 'ok' };
  } catch (_) {
    return { result: null, transitioned: false, reason: 'unexpected_error' };
  }
}

// ─── state derivation ──────────────────────────────────────────────

/**
 * Derive the canonical execution result state from retry/dead-letter decisions.
 *
 * @param {{
 *   retry_decision?: { retry: boolean },
 *   dead_letter_decision?: { dead_letter: boolean },
 *   error_kind?: string
 * }} input
 * @returns {string} one of SIGNUP_EXECUTION_RESULT_STATES values
 */
export function deriveExecutionResultState(input) {
  try {
    if (!input || typeof input !== 'object') {
      return SIGNUP_EXECUTION_RESULT_STATES.FAILED;
    }

    if (!input.error_kind && !input.retry_decision && !input.dead_letter_decision) {
      return SIGNUP_EXECUTION_RESULT_STATES.SUCCEEDED;
    }

    if (input.dead_letter_decision?.dead_letter === true) {
      return SIGNUP_EXECUTION_RESULT_STATES.DEAD_LETTERED;
    }

    if (input.retry_decision?.retry === true) {
      return SIGNUP_EXECUTION_RESULT_STATES.RETRYABLE;
    }

    return SIGNUP_EXECUTION_RESULT_STATES.FAILED;
  } catch (_) {
    return SIGNUP_EXECUTION_RESULT_STATES.FAILED;
  }
}

// ─── duration helper ───────────────────────────────────────────────

/**
 * Compute execution duration in milliseconds from two ISO timestamps.
 *
 * @param {string} startedAt — ISO 8601 timestamp
 * @param {string} completedAt — ISO 8601 timestamp
 * @returns {number | null} duration in ms (>= 0), or null on invalid input
 */
export function computeExecutionDurationMs(startedAt, completedAt) {
  try {
    if (!startedAt || !completedAt) return null;

    const start = new Date(startedAt).getTime();
    const end = new Date(completedAt).getTime();

    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;

    return Math.max(0, end - start);
  } catch (_) {
    return null;
  }
}
