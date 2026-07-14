/**
 * Phase 3.7 — Queue dispatch contract (no execution).
 *
 * Defines the dispatch lifecycle model for signup-evolution async jobs.
 * Receipts track an envelope's journey from acceptance through queue
 * placement, dispatch to a consumer, acknowledgement, or failure.
 *
 * SAFETY CONTRACT:
 * - Pure synchronous logic only — no async/await, no Promises, no timers
 * - No job execution — receipts describe lifecycle, nothing is processed
 * - No DB imports — no reads, no writes
 * - No queue consumption — no polling, no dequeue
 * - No V1 coupling — nothing in V1 imports or references this module
 * - Never throws — every public function is wrapped in try/catch
 */

// ─── constants ─────────────────────────────────────────────────────

export const SIGNUP_DISPATCH_CONTRACT_VERSION = 'signup_dispatch_v1';

export const SIGNUP_DISPATCH_STATES = Object.freeze({
  ACCEPTED: 'accepted',
  QUEUED: 'queued',
  DISPATCHED: 'dispatched',
  ACKNOWLEDGED: 'acknowledged',
  FAILED: 'failed',
  DEAD_LETTERED: 'dead_lettered',
});

export const SIGNUP_DISPATCH_FAILURE_REASONS = Object.freeze({
  INVALID_ENVELOPE: 'invalid_envelope',
  QUEUE_UNAVAILABLE: 'queue_unavailable',
  EXECUTION_DISABLED: 'execution_disabled',
  UNKNOWN: 'unknown',
});

const KNOWN_STATES = new Set(Object.values(SIGNUP_DISPATCH_STATES));

const TERMINAL_STATES = new Set([
  SIGNUP_DISPATCH_STATES.ACKNOWLEDGED,
  SIGNUP_DISPATCH_STATES.FAILED,
  SIGNUP_DISPATCH_STATES.DEAD_LETTERED,
]);

const ALLOWED_TRANSITIONS = Object.freeze({
  [SIGNUP_DISPATCH_STATES.ACCEPTED]: [SIGNUP_DISPATCH_STATES.QUEUED],
  [SIGNUP_DISPATCH_STATES.QUEUED]: [SIGNUP_DISPATCH_STATES.DISPATCHED],
  [SIGNUP_DISPATCH_STATES.DISPATCHED]: [SIGNUP_DISPATCH_STATES.ACKNOWLEDGED, SIGNUP_DISPATCH_STATES.FAILED],
  [SIGNUP_DISPATCH_STATES.FAILED]: [SIGNUP_DISPATCH_STATES.DEAD_LETTERED],
});

// ─── state helpers ─────────────────────────────────────────────────

/**
 * @param {string} state
 * @returns {boolean}
 */
export function isValidDispatchState(state) {
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
export function isTerminalDispatchState(state) {
  try {
    return TERMINAL_STATES.has(state);
  } catch (_) {
    return false;
  }
}

// ─── receipt factory ───────────────────────────────────────────────

let _dispatchSeq = 0;

/**
 * Create a dispatch receipt for a job envelope.
 *
 * @param {{
 *   state?: string,
 *   queue_name?: string,
 *   envelope_id?: string,
 *   failure_reason?: string,
 *   metadata?: Record<string, unknown>
 * }} input
 * @returns {{
 *   dispatch_id: string,
 *   dispatch_version: string,
 *   state: string,
 *   queue_name: string | null,
 *   envelope_id: string | null,
 *   created_at: string,
 *   acknowledged: boolean,
 *   failure_reason: string | null,
 *   metadata: Record<string, unknown>
 * } | null}
 */
export function createDispatchReceipt(input) {
  try {
    if (!input || typeof input !== 'object') return null;

    const state = input.state && KNOWN_STATES.has(input.state)
      ? input.state
      : SIGNUP_DISPATCH_STATES.ACCEPTED;

    return {
      dispatch_id: `dsp-${Date.now()}-${++_dispatchSeq}`,
      dispatch_version: SIGNUP_DISPATCH_CONTRACT_VERSION,
      state,
      queue_name: input.queue_name ? String(input.queue_name) : null,
      envelope_id: input.envelope_id ? String(input.envelope_id) : null,
      created_at: new Date().toISOString(),
      acknowledged: state === SIGNUP_DISPATCH_STATES.ACKNOWLEDGED,
      failure_reason: input.failure_reason ? String(input.failure_reason) : null,
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
 * Transition a dispatch receipt to a new state, returning a new cloned object.
 * Never mutates the original receipt.
 *
 * @param {Record<string, unknown>} receipt
 * @param {string} nextState
 * @param {{ failure_reason?: string, metadata?: Record<string, unknown> }} [opts]
 * @returns {{ receipt: Record<string, unknown> | null, transitioned: boolean, reason: string }}
 */
export function transitionDispatchReceipt(receipt, nextState, opts) {
  try {
    if (!receipt || typeof receipt !== 'object') {
      return { receipt: null, transitioned: false, reason: 'invalid_receipt' };
    }
    if (!nextState || !KNOWN_STATES.has(nextState)) {
      return { receipt: null, transitioned: false, reason: 'invalid_next_state' };
    }

    const currentState = receipt.state;
    if (!currentState || !KNOWN_STATES.has(currentState)) {
      return { receipt: null, transitioned: false, reason: 'invalid_current_state' };
    }

    const allowed = ALLOWED_TRANSITIONS[currentState];
    if (!allowed || !allowed.includes(nextState)) {
      return {
        receipt: null,
        transitioned: false,
        reason: `transition_not_allowed: ${currentState} -> ${nextState}`,
      };
    }

    const cloned = { ...receipt };
    cloned.state = nextState;
    cloned.acknowledged = nextState === SIGNUP_DISPATCH_STATES.ACKNOWLEDGED;

    if (opts?.failure_reason) {
      cloned.failure_reason = String(opts.failure_reason);
    }
    if (opts?.metadata && typeof opts.metadata === 'object' && !Array.isArray(opts.metadata)) {
      cloned.metadata = { ...(cloned.metadata || {}), ...opts.metadata };
    }

    return { receipt: cloned, transitioned: true, reason: 'ok' };
  } catch (_) {
    return { receipt: null, transitioned: false, reason: 'unexpected_error' };
  }
}
