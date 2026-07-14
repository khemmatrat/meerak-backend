/**
 * Phase 3.12 — Runtime orchestrator contract (foundation only, no active consumption).
 *
 * Defines the orchestration state model that coordinates queue adapter,
 * dispatch contract, consumer lease, retry policy, dead-letter contract,
 * and execution result contract into a unified runtime lifecycle.
 *
 * SAFETY CONTRACT:
 * - Pure synchronous logic only — no async/await, no Promises, no timers
 * - No active consumption — no polling, no dequeue, no worker threads
 * - No queue reads/writes — no enqueue, no dequeue
 * - No DB imports — no reads, no writes
 * - No V1 coupling — nothing in V1 imports or references this module
 * - Never throws — every public function is wrapped in try/catch
 */

// ─── constants ─────────────────────────────────────────────────────

export const SIGNUP_RUNTIME_ORCHESTRATOR_VERSION = 'signup_runtime_orchestrator_v1';

export const SIGNUP_RUNTIME_STATES = Object.freeze({
  IDLE: 'idle',
  BOOTING: 'booting',
  READY: 'ready',
  DISPATCHING: 'dispatching',
  PAUSED: 'paused',
  FAILED: 'failed',
  SHUTDOWN: 'shutdown',
});

export const SIGNUP_RUNTIME_FAILURE_REASONS = Object.freeze({
  QUEUE_UNAVAILABLE: 'queue_unavailable',
  INVALID_DISPATCH: 'invalid_dispatch',
  LEASE_EXPIRED: 'lease_expired',
  RETRY_EXHAUSTED: 'retry_exhausted',
  DEAD_LETTERED: 'dead_lettered',
  UNKNOWN: 'unknown',
});

const KNOWN_STATES = new Set(Object.values(SIGNUP_RUNTIME_STATES));

const TERMINAL_STATES = new Set([
  SIGNUP_RUNTIME_STATES.SHUTDOWN,
]);

const ALLOWED_TRANSITIONS = Object.freeze({
  [SIGNUP_RUNTIME_STATES.IDLE]: [SIGNUP_RUNTIME_STATES.BOOTING],
  [SIGNUP_RUNTIME_STATES.BOOTING]: [SIGNUP_RUNTIME_STATES.READY, SIGNUP_RUNTIME_STATES.FAILED],
  [SIGNUP_RUNTIME_STATES.READY]: [SIGNUP_RUNTIME_STATES.DISPATCHING, SIGNUP_RUNTIME_STATES.PAUSED, SIGNUP_RUNTIME_STATES.SHUTDOWN],
  [SIGNUP_RUNTIME_STATES.DISPATCHING]: [SIGNUP_RUNTIME_STATES.READY, SIGNUP_RUNTIME_STATES.FAILED, SIGNUP_RUNTIME_STATES.SHUTDOWN],
  [SIGNUP_RUNTIME_STATES.PAUSED]: [SIGNUP_RUNTIME_STATES.READY, SIGNUP_RUNTIME_STATES.SHUTDOWN],
  [SIGNUP_RUNTIME_STATES.FAILED]: [SIGNUP_RUNTIME_STATES.SHUTDOWN],
});

// ─── state helpers ─────────────────────────────────────────────────

/**
 * @param {string} state
 * @returns {boolean}
 */
export function isValidRuntimeState(state) {
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
export function isTerminalRuntimeState(state) {
  try {
    return TERMINAL_STATES.has(state);
  } catch (_) {
    return false;
  }
}

// ─── coordinator factory ───────────────────────────────────────────

let _runtimeSeq = 0;

/**
 * Create a runtime coordinator descriptor.
 *
 * @param {{
 *   queue_backend?: string,
 *   queue_name?: string,
 *   state?: string,
 *   active_dispatches?: number,
 *   active_consumers?: number,
 *   metadata?: Record<string, unknown>
 * }} input
 * @returns {{
 *   runtime_id: string,
 *   runtime_version: string,
 *   queue_backend: string | null,
 *   queue_name: string | null,
 *   state: string,
 *   started_at: string,
 *   last_transition_at: string,
 *   active_dispatches: number,
 *   active_consumers: number,
 *   metadata: Record<string, unknown>
 * } | null}
 */
export function createRuntimeCoordinator(input) {
  try {
    if (!input || typeof input !== 'object') return null;

    const state = input.state && KNOWN_STATES.has(input.state)
      ? input.state
      : SIGNUP_RUNTIME_STATES.IDLE;

    const now = new Date().toISOString();

    const activeDispatches = typeof input.active_dispatches === 'number' && Number.isFinite(input.active_dispatches)
      ? Math.max(0, Math.floor(input.active_dispatches))
      : 0;

    const activeConsumers = typeof input.active_consumers === 'number' && Number.isFinite(input.active_consumers)
      ? Math.max(0, Math.floor(input.active_consumers))
      : 0;

    return {
      runtime_id: `rt-${Date.now()}-${++_runtimeSeq}`,
      runtime_version: SIGNUP_RUNTIME_ORCHESTRATOR_VERSION,
      queue_backend: input.queue_backend ? String(input.queue_backend) : null,
      queue_name: input.queue_name ? String(input.queue_name) : null,
      state,
      started_at: now,
      last_transition_at: now,
      active_dispatches: activeDispatches,
      active_consumers: activeConsumers,
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
 * Transition a runtime coordinator to a new state, returning a new cloned object.
 * Never mutates the original coordinator.
 *
 * @param {Record<string, unknown>} runtime
 * @param {string} nextState
 * @param {{ failure_reason?: string, active_dispatches?: number, active_consumers?: number, metadata?: Record<string, unknown> }} [opts]
 * @returns {{ runtime: Record<string, unknown> | null, transitioned: boolean, reason: string }}
 */
export function transitionRuntimeCoordinator(runtime, nextState, opts) {
  try {
    if (!runtime || typeof runtime !== 'object') {
      return { runtime: null, transitioned: false, reason: 'invalid_runtime' };
    }
    if (!nextState || !KNOWN_STATES.has(nextState)) {
      return { runtime: null, transitioned: false, reason: 'invalid_next_state' };
    }

    const currentState = runtime.state;
    if (!currentState || !KNOWN_STATES.has(currentState)) {
      return { runtime: null, transitioned: false, reason: 'invalid_current_state' };
    }

    const allowed = ALLOWED_TRANSITIONS[currentState];
    if (!allowed || !allowed.includes(nextState)) {
      return {
        runtime: null,
        transitioned: false,
        reason: `transition_not_allowed: ${currentState} -> ${nextState}`,
      };
    }

    const cloned = { ...runtime };
    cloned.state = nextState;
    cloned.last_transition_at = new Date().toISOString();

    if (opts?.failure_reason) {
      cloned.failure_reason = String(opts.failure_reason);
    }
    if (typeof opts?.active_dispatches === 'number' && Number.isFinite(opts.active_dispatches)) {
      cloned.active_dispatches = Math.max(0, Math.floor(opts.active_dispatches));
    }
    if (typeof opts?.active_consumers === 'number' && Number.isFinite(opts.active_consumers)) {
      cloned.active_consumers = Math.max(0, Math.floor(opts.active_consumers));
    }
    if (opts?.metadata && typeof opts.metadata === 'object' && !Array.isArray(opts.metadata)) {
      cloned.metadata = { ...(cloned.metadata || {}), ...opts.metadata };
    }

    return { runtime: cloned, transitioned: true, reason: 'ok' };
  } catch (_) {
    return { runtime: null, transitioned: false, reason: 'unexpected_error' };
  }
}

// ─── state derivation ──────────────────────────────────────────────

/**
 * Derive the appropriate runtime state from current conditions.
 *
 * @param {{
 *   queue_available?: boolean,
 *   has_active_dispatches?: boolean,
 *   has_active_consumers?: boolean,
 *   has_failure?: boolean,
 *   shutdown_requested?: boolean
 * }} input
 * @returns {string} one of SIGNUP_RUNTIME_STATES values
 */
export function deriveRuntimeState(input) {
  try {
    if (!input || typeof input !== 'object') {
      return SIGNUP_RUNTIME_STATES.IDLE;
    }

    if (input.shutdown_requested) {
      return SIGNUP_RUNTIME_STATES.SHUTDOWN;
    }

    if (input.has_failure) {
      return SIGNUP_RUNTIME_STATES.FAILED;
    }

    if (!input.queue_available) {
      return SIGNUP_RUNTIME_STATES.IDLE;
    }

    if (input.has_active_dispatches || input.has_active_consumers) {
      return SIGNUP_RUNTIME_STATES.DISPATCHING;
    }

    return SIGNUP_RUNTIME_STATES.READY;
  } catch (_) {
    return SIGNUP_RUNTIME_STATES.IDLE;
  }
}
