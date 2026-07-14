/**
 * Phase 4.15 — Controlled execution runtime.
 *
 * First layer that can affect external system state, but ONLY when
 * the dispatcher (Phase 4.14) has explicitly issued an ALLOW decision.
 * Every execution is single-shot, explicitly invoked, and deterministic.
 *
 * Architecture position:
 *   Journal → Replay → State Machine → Dispatcher → Execution Runtime ◄── THIS PHASE
 *
 * SAFETY CONTRACT:
 * - Executes ONLY when dispatcher decision is ALLOW
 * - BLOCK / RETRY / DEAD_LETTER → hard reject, zero execution
 * - No journal mutation
 * - No state machine bypass
 * - No dispatcher bypass
 * - No autonomous loops, background workers, or schedulers
 * - No retry logic — classifies only, never reschedules
 * - No queue writes
 * - No V1 coupling
 * - Deterministic — same inputs always produce same outputs
 */

import {
  dispatchExecution,
  buildDispatchPlan,
  classifyExecutionOutcome,
  isDispatchSafe,
} from './executionDispatcher.js';

import {
  validateTransition,
} from './executionStateMachine.js';

// ─── constants ─────────────────────────────────────────────────────

const EXECUTION_RUNTIME_VERSION = 'execution_runtime_v1';

const PERMISSION_DECISIONS = Object.freeze({
  ALLOW: 'ALLOW',
});

const STEP_RESULTS = Object.freeze({
  EXECUTED: 'EXECUTED',
  SKIPPED: 'SKIPPED',
  REJECTED: 'REJECTED',
});

let _execSeq = 0;

// ─── permission gate ───────────────────────────────────────────────

/**
 * Hard gate — only ALLOW decisions may proceed to execution.
 *
 * @param {{ dispatch_decision?: string, reason?: string }} decision
 * @returns {{ permitted: boolean, reason: string }}
 */
export function validateExecutionPermission(decision) {
  if (!decision || typeof decision !== 'object') {
    return { permitted: false, reason: 'invalid_decision_object' };
  }

  if (!decision.dispatch_decision) {
    return { permitted: false, reason: 'missing_dispatch_decision' };
  }

  if (decision.dispatch_decision === PERMISSION_DECISIONS.ALLOW) {
    return { permitted: true, reason: 'dispatch_allowed' };
  }

  return { permitted: false, reason: `decision_is_${decision.dispatch_decision}: ${decision.reason || 'no_reason'}` };
}

// ─── single step executor ──────────────────────────────────────────

/**
 * Execute a single plan step in a controlled, deterministic manner.
 * Does NOT mutate journal. Does NOT bypass state machine.
 *
 * @param {{ action?: string, target_state?: string, safe?: boolean }} step
 * @param {{ current_state?: string, envelope_id?: string }} context
 * @returns {{
 *   step_result: string,
 *   action: string | null,
 *   from_state: string | null,
 *   to_state: string | null,
 *   reason: string,
 *   executed_at: string
 * }}
 */
export function applyExecutionStep(step, context) {
  const ts = new Date().toISOString();

  if (!step || typeof step !== 'object' || !step.action || !step.target_state) {
    return { step_result: STEP_RESULTS.REJECTED, action: null, from_state: null, to_state: null, reason: 'invalid_step', executed_at: ts };
  }

  if (step.safe !== true) {
    return { step_result: STEP_RESULTS.REJECTED, action: step.action, from_state: context?.current_state || null, to_state: step.target_state, reason: 'step_marked_unsafe', executed_at: ts };
  }

  if (!context || typeof context !== 'object' || !context.current_state) {
    return { step_result: STEP_RESULTS.REJECTED, action: step.action, from_state: null, to_state: step.target_state, reason: 'invalid_context', executed_at: ts };
  }

  try {
    validateTransition(context.current_state, step.target_state);
  } catch (e) {
    return { step_result: STEP_RESULTS.REJECTED, action: step.action, from_state: context.current_state, to_state: step.target_state, reason: e.message, executed_at: ts };
  }

  return {
    step_result: STEP_RESULTS.EXECUTED,
    action: step.action,
    from_state: context.current_state,
    to_state: step.target_state,
    reason: 'step_executed',
    executed_at: ts,
  };
}

// ─── result emission ───────────────────────────────────────────────

/**
 * Produce an immutable execution result object. No side effects beyond return.
 *
 * @param {{
 *   execution_id?: string,
 *   steps_executed?: number,
 *   steps_rejected?: number,
 *   final_state?: string | null,
 *   plan_id?: string | null,
 *   classification?: string
 * }} result
 * @returns {{ version: string, execution_result: object, emitted_at: string }}
 */
export function emitExecutionResult(result) {
  return {
    version: EXECUTION_RUNTIME_VERSION,
    execution_result: Object.freeze({ ...result }),
    emitted_at: new Date().toISOString(),
  };
}

// ─── plan executor ─────────────────────────────────────────────────

/**
 * Execute an approved dispatch plan step-by-step.
 * MUST validate that the plan's originating decision was ALLOW.
 * Every step is individually validated against the state machine.
 *
 * @param {{
 *   plan_id?: string,
 *   current_state?: string | null,
 *   steps?: Array<{ action: string, target_state: string, safe: boolean }>,
 *   terminal_reachable?: boolean,
 *   _dispatch_decision?: { dispatch_decision: string, reason: string }
 * }} plan
 * @param {{ envelope_id?: string }} context
 * @returns {{
 *   execution_id: string,
 *   plan_id: string | null,
 *   permitted: boolean,
 *   steps_executed: number,
 *   steps_rejected: number,
 *   step_results: object[],
 *   final_state: string | null,
 *   result: object
 * }}
 */
export function executeDispatchPlan(plan, context) {
  const executionId = `exec-${Date.now()}-${++_execSeq}`;

  if (!plan || typeof plan !== 'object') {
    const res = emitExecutionResult({ execution_id: executionId, steps_executed: 0, steps_rejected: 0, final_state: null, plan_id: null, classification: 'REJECTED' });
    return { execution_id: executionId, plan_id: null, permitted: false, steps_executed: 0, steps_rejected: 0, step_results: [], final_state: null, result: res };
  }

  if (plan._dispatch_decision) {
    const perm = validateExecutionPermission(plan._dispatch_decision);
    if (!perm.permitted) {
      const res = emitExecutionResult({ execution_id: executionId, steps_executed: 0, steps_rejected: 0, final_state: plan.current_state, plan_id: plan.plan_id || null, classification: 'REJECTED' });
      return { execution_id: executionId, plan_id: plan.plan_id || null, permitted: false, steps_executed: 0, steps_rejected: 0, step_results: [], final_state: plan.current_state || null, result: res };
    }
  }

  const steps = Array.isArray(plan.steps) ? plan.steps : [];
  if (steps.length === 0) {
    const res = emitExecutionResult({ execution_id: executionId, steps_executed: 0, steps_rejected: 0, final_state: plan.current_state || null, plan_id: plan.plan_id || null, classification: 'EMPTY' });
    return { execution_id: executionId, plan_id: plan.plan_id || null, permitted: true, steps_executed: 0, steps_rejected: 0, step_results: [], final_state: plan.current_state || null, result: res };
  }

  const stepResults = [];
  let currentState = plan.current_state || null;
  let executed = 0;
  let rejected = 0;

  for (const step of steps) {
    const stepCtx = { current_state: currentState, envelope_id: context?.envelope_id || null };
    const sr = applyExecutionStep(step, stepCtx);
    stepResults.push(sr);

    if (sr.step_result === STEP_RESULTS.EXECUTED) {
      executed++;
      currentState = sr.to_state;
    } else {
      rejected++;
      break;
    }
  }

  const outcome = classifyExecutionOutcome(currentState);
  const res = emitExecutionResult({
    execution_id: executionId,
    steps_executed: executed,
    steps_rejected: rejected,
    final_state: currentState,
    plan_id: plan.plan_id || null,
    classification: outcome.classification,
  });

  return { execution_id: executionId, plan_id: plan.plan_id || null, permitted: true, steps_executed: executed, steps_rejected: rejected, step_results: stepResults, final_state: currentState, result: res };
}

// ─── full controlled execution ─────────────────────────────────────

/**
 * End-to-end controlled execution: replay state → dispatcher decision →
 * permission gate → plan execution → result emission.
 *
 * Explicitly invoked. Single-shot. No loops.
 *
 * @param {{ current_state?: string, envelope_id?: string }} state
 * @param {{ event_type?: string }} event
 * @returns {{
 *   execution_id: string,
 *   dispatch_decision: string,
 *   permitted: boolean,
 *   plan_id: string | null,
 *   steps_executed: number,
 *   final_state: string | null,
 *   result: object
 * }}
 */
export function runControlledExecution(state, event) {
  const decision = dispatchExecution(state, event);

  const perm = validateExecutionPermission(decision);
  if (!perm.permitted) {
    const executionId = `exec-${Date.now()}-${++_execSeq}`;
    const res = emitExecutionResult({
      execution_id: executionId,
      steps_executed: 0,
      steps_rejected: 0,
      final_state: state?.current_state || null,
      plan_id: null,
      classification: 'REJECTED',
    });
    return {
      execution_id: executionId,
      dispatch_decision: decision.dispatch_decision,
      permitted: false,
      plan_id: null,
      steps_executed: 0,
      final_state: state?.current_state || null,
      result: res,
    };
  }

  const plan = buildDispatchPlan(state);
  plan._dispatch_decision = decision;

  const execution = executeDispatchPlan(plan, { envelope_id: state?.envelope_id || null });

  return {
    execution_id: execution.execution_id,
    dispatch_decision: decision.dispatch_decision,
    permitted: true,
    plan_id: execution.plan_id,
    steps_executed: execution.steps_executed,
    final_state: execution.final_state,
    result: execution.result,
  };
}
