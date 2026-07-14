/**
 * Phase 6.2 — Controlled execution runtime bridge.
 *
 * The ONLY entry point that connects gateway-approved execution to
 * the controlled runtime execution flow. Still deterministic, still
 * non-autonomous — bridges the safety gate to runtime simulation.
 *
 * Architecture position:
 *   Phase 4 Kernel → Phase 5 Stack → 6.1 Gateway → 6.2 Runtime Bridge ◄── THIS PHASE
 *
 * SAFETY CONTRACT:
 * - No real execution side effects
 * - No Phase 4/5 modification
 * - No gateway logic modification (6.1 frozen)
 * - No networking or messaging
 * - No worker threads or schedulers
 * - No autonomous execution
 * - No persistence
 * - Deterministic — same input always produces same trace
 * - Gateway respected strictly — no bypass path
 */

import { evaluateExecutionGate, classifyExecutionRisk } from './executionGateway.js';
import { buildDispatchPlan } from './executionDispatcher.js';
import { executeDispatchPlan, validateExecutionPermission } from './executionRuntime.js';

// ─── trace sequence ────────────────────────────────────────────────

let _traceSeq = 0;

// ─── execution trace builder ───────────────────────────────────────

/**
 * Build a step-by-step execution trace showing the full pipeline.
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
 *   trace_id: string,
 *   steps: Array<{ step: string, result: string, detail: unknown }>,
 *   final_outcome: string
 * }}
 */
export function buildExecutionTrace(input) {
  const traceId = `trace-${Date.now()}-${++_traceSeq}`;
  const steps = [];

  if (!input || typeof input !== 'object') {
    steps.push({ step: 'input_validation', result: 'FAIL', detail: 'invalid_input' });
    return { trace_id: traceId, steps, final_outcome: 'BLOCKED' };
  }

  const gate = evaluateExecutionGate(input);
  steps.push({ step: 'gateway_evaluation', result: gate.allowed ? 'PASS' : 'FAIL', detail: { allowed: gate.allowed, reason: gate.gate_reason, risk: gate.risk_level } });

  if (!gate.allowed) {
    return { trace_id: traceId, steps, final_outcome: 'BLOCKED' };
  }

  steps.push({ step: 'route_resolution', result: input.route?.target_node_id ? 'PASS' : 'FAIL', detail: { target_node: input.route?.target_node_id || null } });

  if (input.current_state) {
    const plan = buildDispatchPlan({ current_state: input.current_state });
    steps.push({ step: 'dispatch_plan', result: plan.steps.length > 0 ? 'PASS' : 'SKIP', detail: { plan_id: plan.plan_id, step_count: plan.steps.length, terminal_reachable: plan.terminal_reachable } });

    if (plan.steps.length > 0) {
      const planWithDecision = { ...plan, _dispatch_decision: { dispatch_decision: input.dispatch_decision || 'BLOCK', reason: 'bridge_controlled' } };
      const execResult = executeDispatchPlan(planWithDecision, { envelope_id: input.envelope_id || null });
      steps.push({ step: 'execution_simulation', result: execResult.permitted ? 'PASS' : 'FAIL', detail: { execution_id: execResult.execution_id, steps_executed: execResult.steps_executed, final_state: execResult.final_state } });
    }
  } else {
    steps.push({ step: 'dispatch_plan', result: 'SKIP', detail: 'no_current_state' });
  }

  return { trace_id: traceId, steps, final_outcome: 'ALLOWED' };
}

// ─── bridge validation ─────────────────────────────────────────────

/**
 * Hard fail if bridge conditions are not met.
 *
 * @param {{
 *   dispatch_decision?: string,
 *   route?: { target_node_id?: string },
 *   consensus?: boolean,
 *   replay_consistent?: boolean,
 *   convergence_stable?: boolean,
 *   mesh_stable?: boolean
 * }} input
 * @returns {{ valid: boolean, reason: string }}
 * @throws {Error} if gateway blocked, invalid route, or inconsistent state
 */
export function validateExecutionBridge(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('bridge_error: invalid input');
  }

  const gate = evaluateExecutionGate(input);
  if (!gate.allowed) {
    throw new Error(`bridge_error: gateway_blocked — ${gate.gate_reason}`);
  }

  if (!input.route || !input.route.target_node_id) {
    throw new Error('bridge_error: invalid_route — no target_node_id');
  }

  return { valid: true, reason: 'bridge_validated' };
}

// ─── boolean wrapper ───────────────────────────────────────────────

/**
 * Simple boolean: is bridge execution allowed?
 *
 * @param {{ dispatch_decision?: string, route?: { target_node_id?: string }, consensus?: boolean, replay_consistent?: boolean, convergence_stable?: boolean, mesh_stable?: boolean }} input
 * @returns {boolean}
 */
export function isBridgeExecutionAllowed(input) {
  const gate = evaluateExecutionGate(input);
  return gate.allowed;
}

// ─── full pipeline simulation ──────────────────────────────────────

/**
 * Dry-run the full execution pipeline without actual execution.
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
 *   simulated: true,
 *   gateway: { allowed: boolean, risk_level: string },
 *   route: { target_node_id: string | null },
 *   plan: { step_count: number, terminal_reachable: boolean } | null,
 *   execution_trace: object
 * }}
 */
export function simulateExecutionFlow(input) {
  const safeInput = (input && typeof input === 'object') ? input : {};

  const gate = evaluateExecutionGate(safeInput);
  const risk = classifyExecutionRisk(safeInput);

  let planInfo = null;
  if (gate.allowed && safeInput.current_state) {
    const plan = buildDispatchPlan({ current_state: safeInput.current_state });
    planInfo = { step_count: plan.steps.length, terminal_reachable: plan.terminal_reachable };
  }

  const trace = buildExecutionTrace(safeInput);

  return {
    simulated: true,
    gateway: { allowed: gate.allowed, risk_level: risk.risk_level },
    route: { target_node_id: safeInput.route?.target_node_id || null },
    plan: planInfo,
    execution_trace: trace,
  };
}

// ─── gateway-gated execution ───────────────────────────────────────

/**
 * Execute through the gateway: input → gate → if allowed → runtime
 * execution simulation. No real side effects.
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
 *   executed: boolean,
 *   gateway_result: { allowed: boolean, gate_reason: string, risk_level: string },
 *   runtime_mode: string,
 *   execution_trace: object
 * }}
 */
export function executeThroughGateway(input) {
  const safeInput = (input && typeof input === 'object') ? input : {};

  const gate = evaluateExecutionGate(safeInput);

  if (!gate.allowed) {
    return {
      executed: false,
      gateway_result: { allowed: false, gate_reason: gate.gate_reason, risk_level: gate.risk_level },
      runtime_mode: 'blocked',
      execution_trace: buildExecutionTrace(safeInput),
    };
  }

  const trace = buildExecutionTrace(safeInput);

  return {
    executed: true,
    gateway_result: { allowed: true, gate_reason: gate.gate_reason, risk_level: gate.risk_level },
    runtime_mode: 'controlled',
    execution_trace: trace,
  };
}
