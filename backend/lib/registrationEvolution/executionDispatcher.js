/**
 * Phase 4.14 — Execution dispatcher (controlled execution gate).
 *
 * Deterministic decision engine that evaluates replayed state against the
 * formal state machine to produce dispatch decisions. Decides WHAT should
 * happen next — never executes it.
 *
 * Architecture position:
 *   Journal (truth) → Replay (state) → State Machine (rules) → Dispatcher (decision) → ❌ Execution (not yet)
 *
 * SAFETY CONTRACT:
 * - Pure decision layer — no execution, no side effects
 * - No journal mutation — read-only state consumption
 * - No state mutation — produces new decision objects only
 * - No queue interaction — no enqueue, no dequeue
 * - No retry loops — classifies retry eligibility, never schedules
 * - No timers — no setInterval, no setTimeout
 * - No V1 coupling — never affects V1 registration
 * - Throws on invalid input — explicit error handling required
 */

import {
  EXECUTION_LIFECYCLE_STATES,
  isTerminalState,
  getSuccessorStates,
  validateTransition,
} from './executionStateMachine.js';

// ─── constants ─────────────────────────────────────────────────────

const DISPATCH_DECISIONS = Object.freeze({
  ALLOW: 'ALLOW',
  BLOCK: 'BLOCK',
  RETRY: 'RETRY',
  DEAD_LETTER: 'DEAD_LETTER',
});

const OUTCOME_CLASSIFICATIONS = Object.freeze({
  SUCCESS: 'SUCCESS',
  FAILURE: 'FAILURE',
  RETRYABLE: 'RETRYABLE',
  TERMINAL: 'TERMINAL',
  UNKNOWN: 'UNKNOWN',
});

let _planSeq = 0;

// ─── outcome classification ────────────────────────────────────────

/**
 * Classify an event_type into a canonical execution outcome.
 *
 * @param {string} eventType
 * @returns {{ classification: string, terminal: boolean }}
 */
export function classifyExecutionOutcome(eventType) {
  if (!eventType || typeof eventType !== 'string') {
    return { classification: OUTCOME_CLASSIFICATIONS.UNKNOWN, terminal: false };
  }

  switch (eventType) {
    case EXECUTION_LIFECYCLE_STATES.EXECUTION_SUCCEEDED:
    case EXECUTION_LIFECYCLE_STATES.EXECUTION_COMMITTED:
    case EXECUTION_LIFECYCLE_STATES.LIFECYCLE_ADVANCED:
    case EXECUTION_LIFECYCLE_STATES.EXECUTION_WINDOW_CLOSED:
      return { classification: OUTCOME_CLASSIFICATIONS.SUCCESS, terminal: isTerminalState(eventType) };

    case EXECUTION_LIFECYCLE_STATES.EXECUTION_FAILED:
      return { classification: OUTCOME_CLASSIFICATIONS.FAILURE, terminal: false };

    case EXECUTION_LIFECYCLE_STATES.EXECUTION_RETRYABLE:
      return { classification: OUTCOME_CLASSIFICATIONS.RETRYABLE, terminal: false };

    case EXECUTION_LIFECYCLE_STATES.EXECUTION_DEAD_LETTERED:
      return { classification: OUTCOME_CLASSIFICATIONS.TERMINAL, terminal: true };

    case EXECUTION_LIFECYCLE_STATES.RUNTIME_BOOTED:
    case EXECUTION_LIFECYCLE_STATES.ENVELOPE_RESERVED:
    case EXECUTION_LIFECYCLE_STATES.DISPATCH_ACKNOWLEDGED:
      return { classification: OUTCOME_CLASSIFICATIONS.SUCCESS, terminal: false };

    default:
      return { classification: OUTCOME_CLASSIFICATIONS.UNKNOWN, terminal: false };
  }
}

// ─── dispatch safety check ─────────────────────────────────────────

/**
 * Check whether a dispatch from current state with a given event is safe.
 *
 * @param {{ current_state?: string }} state
 * @param {{ event_type?: string }} event
 * @returns {{ safe: boolean, reason: string }}
 */
export function isDispatchSafe(state, event) {
  if (!state || typeof state !== 'object' || !state.current_state) {
    return { safe: false, reason: 'invalid_state' };
  }
  if (!event || typeof event !== 'object' || !event.event_type) {
    return { safe: false, reason: 'invalid_event' };
  }

  const from = state.current_state;
  const to = event.event_type;

  if (isTerminalState(from)) {
    return { safe: false, reason: `terminal_state: ${from}` };
  }

  try {
    validateTransition(from, to);
    return { safe: true, reason: 'ok' };
  } catch (e) {
    return { safe: false, reason: e.message };
  }
}

// ─── dispatch eligibility ──────────────────────────────────────────

/**
 * Evaluate whether a dispatch is eligible given replayed state and a proposed event.
 *
 * @param {{ current_state?: string, envelope_id?: string, committed?: boolean, execution_state?: string }} state
 * @param {{ event_type?: string }} event
 * @returns {{ eligible: boolean, reason: string }}
 */
export function evaluateDispatchEligibility(state, event) {
  if (!state || typeof state !== 'object') {
    return { eligible: false, reason: 'invalid_state' };
  }
  if (!event || typeof event !== 'object' || !event.event_type) {
    return { eligible: false, reason: 'invalid_event' };
  }

  const safety = isDispatchSafe(state, event);
  if (!safety.safe) {
    return { eligible: false, reason: safety.reason };
  }

  return { eligible: true, reason: 'ok' };
}

// ─── dispatch decision ─────────────────────────────────────────────

/**
 * Produce a deterministic dispatch decision for a given state + event context.
 *
 * @param {{
 *   current_state?: string,
 *   envelope_id?: string,
 *   execution_state?: string,
 *   committed?: boolean
 * }} state
 * @param {{ event_type?: string }} event
 * @returns {{
 *   dispatch_decision: string,
 *   reason: string,
 *   next_allowed_states: string[],
 *   required_transition: string | null
 * }}
 */
export function dispatchExecution(state, event) {
  if (!state || typeof state !== 'object' || !state.current_state) {
    return { dispatch_decision: DISPATCH_DECISIONS.BLOCK, reason: 'invalid_state', next_allowed_states: [], required_transition: null };
  }

  const from = state.current_state;

  if (isTerminalState(from)) {
    return { dispatch_decision: DISPATCH_DECISIONS.BLOCK, reason: `terminal_state: ${from}`, next_allowed_states: [], required_transition: null };
  }

  let nextAllowed;
  try {
    nextAllowed = getSuccessorStates(from);
  } catch (_) {
    return { dispatch_decision: DISPATCH_DECISIONS.BLOCK, reason: 'unknown_current_state', next_allowed_states: [], required_transition: null };
  }

  if (!event || typeof event !== 'object' || !event.event_type) {
    return { dispatch_decision: DISPATCH_DECISIONS.BLOCK, reason: 'missing_event', next_allowed_states: nextAllowed, required_transition: nextAllowed.length === 1 ? nextAllowed[0] : null };
  }

  const to = event.event_type;

  const safety = isDispatchSafe(state, event);
  if (!safety.safe) {
    return { dispatch_decision: DISPATCH_DECISIONS.BLOCK, reason: safety.reason, next_allowed_states: nextAllowed, required_transition: null };
  }

  const outcome = classifyExecutionOutcome(to);

  if (outcome.classification === OUTCOME_CLASSIFICATIONS.RETRYABLE) {
    return { dispatch_decision: DISPATCH_DECISIONS.RETRY, reason: 'retryable_transition', next_allowed_states: nextAllowed, required_transition: to };
  }

  if (outcome.classification === OUTCOME_CLASSIFICATIONS.TERMINAL && to === EXECUTION_LIFECYCLE_STATES.EXECUTION_DEAD_LETTERED) {
    return { dispatch_decision: DISPATCH_DECISIONS.DEAD_LETTER, reason: 'dead_letter_transition', next_allowed_states: nextAllowed, required_transition: to };
  }

  return { dispatch_decision: DISPATCH_DECISIONS.ALLOW, reason: 'transition_allowed', next_allowed_states: nextAllowed, required_transition: to };
}

// ─── dispatch plan ─────────────────────────────────────────────────

/**
 * Build a deterministic execution plan from current state.
 * Produces a sequence of safe steps — DOES NOT EXECUTE anything.
 *
 * @param {{ current_state?: string, envelope_id?: string }} state
 * @returns {{
 *   plan_id: string,
 *   current_state: string | null,
 *   steps: Array<{ action: string, target_state: string, safe: boolean }>,
 *   terminal_reachable: boolean
 * }}
 */
export function buildDispatchPlan(state) {
  const planId = `dp-${Date.now()}-${++_planSeq}`;

  if (!state || typeof state !== 'object' || !state.current_state) {
    return { plan_id: planId, current_state: null, steps: [], terminal_reachable: false };
  }

  const steps = [];
  const visited = new Set();
  let current = state.current_state;
  let terminalReachable = false;

  while (current && !visited.has(current)) {
    visited.add(current);

    if (isTerminalState(current)) {
      terminalReachable = true;
      break;
    }

    let successors;
    try {
      successors = getSuccessorStates(current);
    } catch (_) {
      break;
    }

    if (successors.length === 0) {
      break;
    }

    const next = successors[0];
    let safe = false;
    try {
      validateTransition(current, next);
      safe = true;
    } catch (_) { /* not safe */ }

    steps.push({
      action: next,
      target_state: next,
      safe,
    });

    current = next;
  }

  return { plan_id: planId, current_state: state.current_state, steps, terminal_reachable: terminalReachable };
}
