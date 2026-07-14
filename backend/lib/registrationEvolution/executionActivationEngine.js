/**
 * Phase 6.5 — Controlled execution activation engine.
 *
 * The FIRST entry point where execution actually "happens", but under
 * the full governance chain: gateway → bridge → mode → controller → execution.
 * Deterministic, constrained, and non-autonomous.
 *
 * Architecture position:
 *   Phase 4 Kernel → Phase 5 Stack → 6.1 Gateway → 6.2 Bridge → 6.3 Modes → 6.4 Controller → 6.5 Engine ◄── THIS PHASE
 *
 * SAFETY CONTRACT:
 * - Full governance chain respected — no bypass
 * - No Phase 4/5/6.1-6.4 modification
 * - No async orchestration loops
 * - No worker threads or schedulers
 * - No distributed calls or networking
 * - No persistence layer
 * - No autonomous execution
 * - No retry engine
 * - Deterministic — same input always produces same result
 */

import { evaluateExecutionGate } from './executionGateway.js';
import { buildExecutionTrace } from './executionRuntimeBridge.js';
import { getExecutionMode } from './executionModes.js';
import { applyExecutionMode, determineExecutionDepth, shouldCommitExecution, validateModeExecution } from './executionModeController.js';
import { buildDispatchPlan } from './executionDispatcher.js';
import { executeDispatchPlan } from './executionRuntime.js';

// ─── sequences ─────────────────────────────────────────────────────

let _execSeq = 0;
let _pipeSeq = 0;

// ─── activation pipeline builder ──────────────────────────────────

/**
 * Build the full activation pipeline without executing.
 *
 * @param {{
 *   scope_id?: string,
 *   event_type?: string,
 *   dispatch_decision?: string,
 *   route?: { target_node_id?: string },
 *   current_state?: string,
 *   consensus?: boolean,
 *   replay_consistent?: boolean,
 *   convergence_stable?: boolean,
 *   mesh_stable?: boolean
 * }} input
 * @returns {{
 *   pipeline_id: string,
 *   stages: string[],
 *   gate_result: { allowed: boolean, risk_level: string },
 *   mode: string,
 *   execution_depth: string,
 *   commit_allowed: boolean
 * }}
 */
export function buildActivationPipeline(input) {
  const pipelineId = `pipe-${Date.now()}-${++_pipeSeq}`;
  const safeInput = (input && typeof input === 'object') ? input : {};

  const stages = ['gateway', 'route', 'bridge', 'mode', 'controller', 'execution'];

  const gate = evaluateExecutionGate(safeInput);
  const modeResult = getExecutionMode(safeInput);
  const depth = determineExecutionDepth(modeResult.mode);
  const commit = shouldCommitExecution(modeResult.mode);

  return {
    pipeline_id: pipelineId,
    stages,
    gate_result: { allowed: gate.allowed, risk_level: gate.risk_level },
    mode: modeResult.mode,
    execution_depth: depth,
    commit_allowed: commit,
  };
}

// ─── activation eligibility ────────────────────────────────────────

/**
 * Hard fail if activation is not eligible.
 * Throws if gateway blocks, mode is strict, or controller denies.
 *
 * @param {{
 *   dispatch_decision?: string,
 *   route?: { target_node_id?: string },
 *   consensus?: boolean,
 *   replay_consistent?: boolean,
 *   convergence_stable?: boolean,
 *   mesh_stable?: boolean
 * }} input
 * @returns {{ eligible: boolean, mode: string, execution_depth: string }}
 * @throws {Error} on ineligibility
 */
export function validateActivationEligibility(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('activation_error: invalid input');
  }

  const gate = evaluateExecutionGate(input);
  if (!gate.allowed) {
    throw new Error(`activation_error: gateway_blocked — ${gate.gate_reason}`);
  }

  const modeResult = getExecutionMode(input);
  if (modeResult.mode === 'strict') {
    throw new Error('activation_error: mode is strict — execution denied');
  }

  validateModeExecution(input, modeResult.mode);

  const depth = determineExecutionDepth(modeResult.mode);

  return { eligible: true, mode: modeResult.mode, execution_depth: depth };
}

// ─── boolean check ─────────────────────────────────────────────────

/**
 * Boolean: is execution activated through the full governance chain?
 *
 * @param {{ dispatch_decision?: string, route?: { target_node_id?: string }, consensus?: boolean, replay_consistent?: boolean, convergence_stable?: boolean, mesh_stable?: boolean }} input
 * @returns {boolean}
 */
export function isExecutionActivated(input) {
  try {
    validateActivationEligibility(input);
    return true;
  } catch (_) {
    return false;
  }
}

// ─── governed step execution ───────────────────────────────────────

/**
 * Execute ONE governed step: gateway validated, mode checked, controller applied.
 *
 * @param {{ action?: string, target_state?: string, safe?: boolean }} step
 * @param {{
 *   dispatch_decision?: string,
 *   route?: { target_node_id?: string },
 *   current_state?: string,
 *   mode?: string,
 *   consensus?: boolean,
 *   replay_consistent?: boolean,
 *   convergence_stable?: boolean,
 *   mesh_stable?: boolean
 * }} context
 * @returns {{
 *   step_executed: boolean,
 *   step: string | null,
 *   mode: string,
 *   execution_depth: string,
 *   reason: string
 * }}
 */
export function executeGovernedStep(step, context) {
  if (!step || typeof step !== 'object' || !step.action) {
    return { step_executed: false, step: null, mode: 'strict', execution_depth: 'none', reason: 'invalid_step' };
  }

  const safeCtx = (context && typeof context === 'object') ? context : {};

  const gate = evaluateExecutionGate(safeCtx);
  if (!gate.allowed) {
    return { step_executed: false, step: step.action, mode: 'strict', execution_depth: 'none', reason: `gateway_blocked: ${gate.gate_reason}` };
  }

  const modeResult = getExecutionMode(safeCtx);
  const mode = safeCtx.mode || modeResult.mode;
  const depth = determineExecutionDepth(mode);

  if (depth === 'none') {
    return { step_executed: false, step: step.action, mode, execution_depth: depth, reason: 'mode_denies_execution' };
  }

  if (step.safe !== true) {
    return { step_executed: false, step: step.action, mode, execution_depth: depth, reason: 'step_marked_unsafe' };
  }

  return { step_executed: true, step: step.action, mode, execution_depth: depth, reason: 'governed_step_executed' };
}

// ─── full controlled activation ────────────────────────────────────

/**
 * Activate controlled execution through the full governance pipeline.
 *
 * @param {{
 *   scope_id?: string,
 *   event_type?: string,
 *   dispatch_decision?: string,
 *   route?: { target_node_id?: string },
 *   current_state?: string,
 *   envelope_id?: string,
 *   consensus?: boolean,
 *   replay_consistent?: boolean,
 *   convergence_stable?: boolean,
 *   mesh_stable?: boolean
 * }} input
 * @returns {{
 *   activated: boolean,
 *   execution_id: string,
 *   gateway: { allowed: boolean, risk_level: string },
 *   mode: string,
 *   execution_depth: string,
 *   result: string,
 *   trace_id: string,
 *   steps_executed: number,
 *   final_state: string | null
 * }}
 */
export function activateControlledExecution(input) {
  const executionId = `exec-${Date.now()}-${++_execSeq}`;
  const safeInput = (input && typeof input === 'object') ? input : {};

  const gate = evaluateExecutionGate(safeInput);
  if (!gate.allowed) {
    return {
      activated: false,
      execution_id: executionId,
      gateway: { allowed: false, risk_level: gate.risk_level },
      mode: 'strict',
      execution_depth: 'none',
      result: 'gateway_blocked',
      trace_id: '',
      steps_executed: 0,
      final_state: safeInput.current_state || null,
    };
  }

  const modeResult = getExecutionMode(safeInput);
  const modeApplied = applyExecutionMode(safeInput, modeResult.mode);
  const depth = modeApplied.execution_behavior.execution_depth;

  const trace = buildExecutionTrace(safeInput);

  if (depth === 'none') {
    return {
      activated: false,
      execution_id: executionId,
      gateway: { allowed: true, risk_level: gate.risk_level },
      mode: modeResult.mode,
      execution_depth: depth,
      result: 'mode_denies_execution',
      trace_id: trace.trace_id,
      steps_executed: 0,
      final_state: safeInput.current_state || null,
    };
  }

  let stepsExecuted = 0;
  let finalState = safeInput.current_state || null;
  let resultStatus = 'controlled_success';

  if (safeInput.current_state && (depth === 'full' || depth === 'partial')) {
    const plan = buildDispatchPlan({ current_state: safeInput.current_state });

    if (plan.steps.length > 0) {
      const maxSteps = depth === 'partial' ? 1 : plan.steps.length;
      const limitedPlan = {
        ...plan,
        steps: plan.steps.slice(0, maxSteps),
        _dispatch_decision: { dispatch_decision: safeInput.dispatch_decision || 'ALLOW', reason: 'activation_engine' },
      };

      const execResult = executeDispatchPlan(limitedPlan, { envelope_id: safeInput.envelope_id || null });
      stepsExecuted = execResult.steps_executed;
      finalState = execResult.final_state;
      resultStatus = execResult.permitted ? 'controlled_success' : 'execution_rejected';
    }
  } else if (depth === 'trace-only') {
    resultStatus = 'trace_only';
  }

  return {
    activated: true,
    execution_id: executionId,
    gateway: { allowed: true, risk_level: gate.risk_level },
    mode: modeResult.mode,
    execution_depth: depth,
    result: resultStatus,
    trace_id: trace.trace_id,
    steps_executed: stepsExecuted,
    final_state: finalState,
  };
}
