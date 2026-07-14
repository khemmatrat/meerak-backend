/**
 * Phase 7.5 — Execution guard kernel (hard enforcement core).
 *
 * Final authority layer before any execution enters the real world.
 * Evaluates a strict, ordered chain of checks across Phase 5 routing,
 * Phase 6 governance (gateway + modes), and Phase 7 layers (shadow,
 * observability, policy). No layer may be bypassed or short-circuited.
 *
 * Architecture position:
 *   Phase 5 Routing → Phase 6 Gateway/Modes → Phase 7.1–7.4 → 7.5 Guard Kernel
 *
 * Design principle:
 *   "Policy decides risk. Guard decides reality."
 *
 * SAFETY CONTRACT:
 * - No execution side effects — decision only
 * - No mutation of any input or state
 * - No scheduling / workers / queue interaction
 * - No persistence / DB / networking
 * - Deterministic multi-layer evaluation
 * - Strict layer ordering enforced — no shortcutting
 */

import { createHash } from 'crypto';
import { evaluateExecutionGate, classifyExecutionRisk } from './executionGateway.js';
import { getExecutionMode, buildModeExecutionPolicy } from './executionModes.js';
import { determineExecutionDepth } from './executionModeController.js';
import { validateRoutingIntent, buildRoutingIntent } from './executionExposureRouter.js';
import { simulateShadowExecution, validateShadowIntegrity, buildShadowTrace } from './executionShadowEngine.js';
import { buildObservabilitySnapshot, detectTraceAnomalies } from './executionObservabilityHub.js';
import { evaluateGlobalExecutionPolicy } from './executionPolicyEnforcer.js';

// ─── constants ─────────────────────────────────────────────────────

const GUARD_VERSION = 'phase7_guard_v1';

const GUARD_LAYERS = Object.freeze([
  'gateway',
  'mode_system',
  'routing',
  'shadow',
  'observability',
  'policy',
]);

const DECISIONS = Object.freeze({
  ALLOW: 'ALLOW_CONTROLLED_EXECUTION',
  DENY: 'DENY_EXECUTION',
  SHADOW_ONLY: 'SHADOW_ONLY_EXECUTION',
});

// ─── layer evaluators ──────────────────────────────────────────────

function _evaluateGateway(input) {
  const gateInput = {
    dispatch_decision: input.dispatch_decision || 'ALLOW',
    route: input.route || { target_node_id: input.scope_id || 'default-node' },
    consensus: input.consensus,
    replay_consistent: input.replay_consistent,
    convergence_stable: input.convergence_stable,
    mesh_stable: input.mesh_stable,
  };

  const gate = evaluateExecutionGate(gateInput);
  const risk = classifyExecutionRisk(gateInput);

  return {
    layer: 'gateway',
    passed: gate.allowed,
    gateway_allowed: gate.allowed,
    risk_level: risk.risk_level,
    reason: gate.gate_reason,
  };
}

function _evaluateModeSystem(input, gatewayResult) {
  const gateInput = {
    dispatch_decision: input.dispatch_decision || 'ALLOW',
    route: input.route || { target_node_id: input.scope_id || 'default-node' },
    consensus: input.consensus,
    replay_consistent: input.replay_consistent,
    convergence_stable: input.convergence_stable,
    mesh_stable: input.mesh_stable,
  };

  const modeResult = getExecutionMode(gateInput);
  const policy = buildModeExecutionPolicy(modeResult.mode);
  const depth = determineExecutionDepth(modeResult.mode);

  const passed = gatewayResult.passed
    ? (modeResult.mode !== 'strict')
    : false;

  return {
    layer: 'mode_system',
    passed,
    mode: modeResult.mode,
    depth,
    allow_real_execution: policy.allow_real_execution,
    reason: modeResult.reason,
  };
}

function _evaluateRouting(input) {
  if (!input.scope_id) {
    return { layer: 'routing', passed: false, routing_valid: false, reason: 'scope_id_missing' };
  }

  const intent = buildRoutingIntent(input);
  const validation = validateRoutingIntent(intent);

  return {
    layer: 'routing',
    passed: validation.valid,
    routing_valid: validation.valid,
    failed_checks: validation.failed_checks,
    reason: validation.valid ? 'routing_intent_valid' : `routing_failed: ${validation.failed_checks.join(', ')}`,
  };
}

function _evaluateShadow(input) {
  if (!input.scope_id) {
    return { layer: 'shadow', passed: false, shadow_valid: false, reason: 'scope_id_missing' };
  }

  const shadowResult = simulateShadowExecution(input);
  const trace = buildShadowTrace(input);
  const integrity = validateShadowIntegrity(trace);

  const passed = shadowResult.shadow_execution
    && shadowResult.deterministic
    && integrity.valid
    && shadowResult.commit_allowed === false;

  return {
    layer: 'shadow',
    passed,
    shadow_valid: passed,
    steps_simulated: shadowResult.steps_simulated,
    simulated_state: shadowResult.simulated_state,
    reason: passed ? 'shadow_simulation_valid' : 'shadow_validation_failed',
  };
}

function _evaluateObservability(input) {
  if (!input.scope_id) {
    return { layer: 'observability', passed: true, observability_valid: true, reason: 'no_scope_default_pass' };
  }

  const snapshot = buildObservabilitySnapshot(input.scope_id);
  const anomalies = detectTraceAnomalies(snapshot);

  return {
    layer: 'observability',
    passed: anomalies.anomaly_count === 0,
    observability_valid: anomalies.anomaly_count === 0,
    anomaly_count: anomalies.anomaly_count,
    reason: anomalies.anomaly_count === 0 ? 'no_anomalies' : `${anomalies.anomaly_count}_anomalies_detected`,
  };
}

function _evaluatePolicy(input) {
  const policyResult = evaluateGlobalExecutionPolicy(input);

  return {
    layer: 'policy',
    passed: policyResult.compliant,
    policy_compliant: policyResult.compliant,
    policy_mode: policyResult.policy_mode,
    risk_level: policyResult.risk_level,
    violations: policyResult.violations.length,
    reason: policyResult.reason,
  };
}

// ─── final execution gate ──────────────────────────────────────────

/**
 * Evaluate the final execution gate across all layers in strict order.
 * Every layer is evaluated — no short-circuiting.
 *
 * @param {object} input
 * @returns {{
 *   final_allowed: boolean,
 *   decision: string,
 *   risk_level: string,
 *   policy_compliant: boolean,
 *   gateway_allowed: boolean,
 *   mode: string,
 *   routing_valid: boolean,
 *   shadow_valid: boolean,
 *   observability_valid: boolean,
 *   reason: string,
 *   guard_version: string,
 *   evaluated_at: string
 * }}
 */
export function evaluateFinalExecutionGate(input) {
  if (!input || typeof input !== 'object') {
    return _guardResult(false, DECISIONS.DENY, 'critical', false, false, 'blocked', false, false, false, 'invalid_input');
  }

  const gateway = _evaluateGateway(input);
  const modeSystem = _evaluateModeSystem(input, gateway);
  const routing = _evaluateRouting(input);
  const shadow = _evaluateShadow(input);
  const observability = _evaluateObservability(input);
  const policy = _evaluatePolicy(input);

  const allPassed = gateway.passed && modeSystem.passed && routing.passed
    && shadow.passed && observability.passed && policy.passed;

  const decision = allPassed
    ? DECISIONS.ALLOW
    : (shadow.passed ? DECISIONS.SHADOW_ONLY : DECISIONS.DENY);

  const riskLevel = policy.risk_level || gateway.risk_level || 'medium';

  const failedLayers = [gateway, modeSystem, routing, shadow, observability, policy]
    .filter(l => !l.passed)
    .map(l => l.layer);

  const reason = allPassed
    ? 'all_layers_passed_guard'
    : `blocked_by: ${failedLayers.join(', ')}`;

  return _guardResult(
    allPassed,
    decision,
    riskLevel,
    policy.policy_compliant || false,
    gateway.gateway_allowed || false,
    modeSystem.mode || 'strict',
    routing.routing_valid || false,
    shadow.shadow_valid || false,
    observability.observability_valid || false,
    reason,
  );
}

// ─── hard validation ───────────────────────────────────────────────

/**
 * Hard-fail validation. Throws on any guard violation.
 *
 * @param {object} input
 * @returns {{ passed: true, evaluated_at: string }}
 * @throws {Error} on any layer failure
 */
export function validateExecutionGuard(input) {
  const result = evaluateFinalExecutionGate(input);

  if (!result.final_allowed) {
    throw new Error(`execution_guard_violation: ${result.reason} [decision=${result.decision}, risk=${result.risk_level}]`);
  }

  return { passed: true, evaluated_at: new Date().toISOString() };
}

// ─── boolean check ─────────────────────────────────────────────────

/**
 * Lightweight boolean guard check — never throws.
 *
 * @param {object} input
 * @returns {boolean}
 */
export function isExecutionGuardPassed(input) {
  try {
    const result = evaluateFinalExecutionGate(input);
    return result.final_allowed;
  } catch {
    return false;
  }
}

// ─── decision trace ────────────────────────────────────────────────

/**
 * Build a full trace of why the guard allowed or denied execution.
 * Evaluates every layer and records individual results.
 *
 * @param {object} input
 * @returns {{
 *   trace_id: string,
 *   layers: Array<{ layer: string, passed: boolean, reason: string }>,
 *   final_decision: string,
 *   all_passed: boolean,
 *   trace_hash: string,
 *   built_at: string
 * }}
 */
export function buildGuardDecisionTrace(input) {
  const safeInput = (input && typeof input === 'object') ? input : {};

  const gateway = _evaluateGateway(safeInput);
  const modeSystem = _evaluateModeSystem(safeInput, gateway);
  const routing = _evaluateRouting(safeInput);
  const shadow = _evaluateShadow(safeInput);
  const observability = _evaluateObservability(safeInput);
  const policy = _evaluatePolicy(safeInput);

  const layers = [gateway, modeSystem, routing, shadow, observability, policy].map(l => ({
    layer: l.layer,
    passed: l.passed,
    reason: l.reason,
  }));

  const allPassed = layers.every(l => l.passed);
  const finalDecision = allPassed ? DECISIONS.ALLOW : DECISIONS.DENY;

  const hashInput = `${GUARD_VERSION}::${layers.map(l => `${l.layer}:${l.passed}`).join('|')}`;
  const traceHash = createHash('sha256').update(hashInput).digest('hex');
  const traceId = `guard-${traceHash.slice(0, 12)}`;

  return {
    trace_id: traceId,
    layers,
    final_decision: finalDecision,
    all_passed: allPassed,
    trace_hash: traceHash,
    built_at: new Date().toISOString(),
  };
}

// ─── execution finality ────────────────────────────────────────────

/**
 * Return the FINAL_DECISION object — the absolute last word
 * before execution enters reality.
 *
 * @param {object} input
 * @returns {{
 *   final_allowed: boolean,
 *   decision: string,
 *   guard_version: string,
 *   layer_count: number,
 *   all_layers_evaluated: boolean,
 *   finality_hash: string,
 *   resolved_at: string
 * }}
 */
export function resolveExecutionFinality(input) {
  const gate = evaluateFinalExecutionGate(input);
  const trace = buildGuardDecisionTrace(input);

  const finalityHash = createHash('sha256')
    .update(`${GUARD_VERSION}::${gate.final_allowed}::${gate.decision}::${trace.trace_hash}`)
    .digest('hex');

  return {
    final_allowed: gate.final_allowed,
    decision: gate.decision,
    guard_version: GUARD_VERSION,
    layer_count: GUARD_LAYERS.length,
    all_layers_evaluated: true,
    finality_hash: finalityHash,
    resolved_at: new Date().toISOString(),
  };
}

// ─── helpers ───────────────────────────────────────────────────────

function _guardResult(finalAllowed, decision, riskLevel, policyCompliant, gatewayAllowed, mode, routingValid, shadowValid, observabilityValid, reason) {
  return {
    final_allowed: finalAllowed,
    decision,
    risk_level: riskLevel,
    policy_compliant: policyCompliant,
    gateway_allowed: gatewayAllowed,
    mode,
    routing_valid: routingValid,
    shadow_valid: shadowValid,
    observability_valid: observabilityValid,
    reason,
    guard_version: GUARD_VERSION,
    evaluated_at: new Date().toISOString(),
  };
}
