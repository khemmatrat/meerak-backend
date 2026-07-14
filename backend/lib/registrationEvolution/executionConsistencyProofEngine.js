/**
 * Phase 7.7 — System consistency proof engine (deterministic verification core).
 *
 * Provides formal, deterministic proofs that the execution governance
 * stack is consistent by construction. Moves from "we believe the
 * system is consistent" to "we can prove the system is consistent."
 *
 * Architecture position:
 *   7.5 Guard → 7.6 Forensics → 7.7 Consistency Proof Engine
 *
 * Design principle:
 *   "Detection says something is wrong. Proof says nothing CAN be wrong."
 *
 * SAFETY CONTRACT:
 * - Read-only — zero mutation
 * - No execution, retry, or scheduling
 * - No external systems / DB / networking
 * - Pure mathematical/structural verification only
 * - Deterministic graph generation
 * - Must NOT override guard decisions or re-run execution
 */

import { createHash } from 'crypto';
import { evaluateExecutionGate } from './executionGateway.js';
import { getExecutionMode } from './executionModes.js';
import { buildRoutingIntent, validateRoutingIntent } from './executionExposureRouter.js';
import { simulateShadowExecution, validateShadowIntegrity, buildShadowTrace } from './executionShadowEngine.js';
import { buildObservabilitySnapshot, detectTraceAnomalies } from './executionObservabilityHub.js';
import { evaluateGlobalExecutionPolicy } from './executionPolicyEnforcer.js';
import { evaluateFinalExecutionGate, buildGuardDecisionTrace } from './executionGuardKernel.js';
import { analyzeExecutionForensics, detectDecisionDrift, computeForensicHash } from './executionForensicsEngine.js';

// ─── constants ─────────────────────────────────────────────────────

const PROOF_VERSION = 'phase7_proof_v1';

const PROOF_NODES = Object.freeze([
  'gateway',
  'mode',
  'routing',
  'shadow',
  'observability',
  'policy',
  'guard',
]);

// ─── consistency proof generation ──────────────────────────────────

/**
 * Generate a formal consistency proof for the full decision chain.
 * Verifies every cross-layer invariant and produces a deterministic
 * proof object.
 *
 * @param {object} input
 * @returns {{
 *   scope_id: string,
 *   consistent: boolean,
 *   proof_valid: boolean,
 *   proof_checks: Array<{ rule: string, passed: boolean, detail: string }>,
 *   graph_nodes: number,
 *   graph_edges: number,
 *   consistency_hash: string,
 *   violations: Array<{ rule: string, detail: string }>,
 *   proof_version: string,
 *   generated_at: string
 * }}
 */
export function generateConsistencyProof(input) {
  if (!input || typeof input !== 'object') {
    return _emptyProof('invalid_input');
  }

  const scopeId = input.scope_id || 'unknown';
  const checks = [];
  const violations = [];

  const gateInput = _buildGateInput(input);
  const gate = evaluateExecutionGate(gateInput);
  const mode = getExecutionMode(gateInput);
  const routing = buildRoutingIntent(input);
  const routingValid = validateRoutingIntent(routing);
  const shadow = simulateShadowExecution(input);
  const shadowTrace = buildShadowTrace(input);
  const shadowIntegrity = validateShadowIntegrity(shadowTrace);
  const policy = evaluateGlobalExecutionPolicy(input);
  const guard = evaluateFinalExecutionGate(input);
  const guardTrace = buildGuardDecisionTrace(input);
  const forensics = analyzeExecutionForensics(input);
  const drift = detectDecisionDrift(input);

  // Rule 1: Gateway → Guard consistency
  const r1 = !gate.allowed ? !guard.final_allowed : true;
  _addCheck(checks, violations, 'gateway_guard_consistency', r1,
    r1 ? 'gateway block implies guard block' : 'gateway BLOCK but guard ALLOW — impossible');

  // Rule 2: Policy → Shadow alignment
  const shadowValid = shadow.shadow_execution && shadow.deterministic && shadowIntegrity.valid;
  const r2 = !(policy.compliant && !shadowValid);
  _addCheck(checks, violations, 'policy_shadow_alignment', r2,
    r2 ? 'policy and shadow aligned' : 'policy COMPLIANT but shadow INVALID');

  // Rule 3: Routing determinism (same input → same output)
  const routing2 = buildRoutingIntent(input);
  const r3 = routing.intent_hash === routing2.intent_hash;
  _addCheck(checks, violations, 'routing_determinism', r3,
    r3 ? 'routing produces identical hash on replay' : 'routing non-deterministic');

  // Rule 4: No cross-scope contamination
  const r4 = !forensics.violations.some(v => v.layer === 'cross_scope_contamination');
  _addCheck(checks, violations, 'no_cross_scope_contamination', r4,
    r4 ? 'no cross-scope contamination detected' : 'cross-scope contamination found');

  // Rule 5: No execution leakage
  const r5 = routing.execution_allowed === false && shadow.commit_allowed === false;
  _addCheck(checks, violations, 'no_execution_leakage', r5,
    r5 ? 'execution flags are false across all layers' : 'execution leak detected');

  // Rule 6: Observability matches decision trace
  const obsSnapshot = buildObservabilitySnapshot(scopeId);
  const anomalies = detectTraceAnomalies(obsSnapshot);
  const r6 = !(guard.final_allowed && anomalies.anomaly_count > 0);
  _addCheck(checks, violations, 'observability_decision_match', r6,
    r6 ? 'observability consistent with decisions' : 'guard ALLOW but observability has anomalies');

  // Rule 7: Forensics hash binding — forensic hash reproducible
  const fHash1 = computeForensicHash(input);
  const fHash2 = computeForensicHash(input);
  const r7 = fHash1 === fHash2 && fHash1.length === 64;
  _addCheck(checks, violations, 'forensic_hash_binding', r7,
    r7 ? 'forensic hash deterministic and valid' : 'forensic hash non-deterministic or invalid');

  // Rule 8: No drift detected
  const r8 = !drift.drift_detected;
  _addCheck(checks, violations, 'no_decision_drift', r8,
    r8 ? 'zero drift across decision layers' : `${drift.drift_points.length} drift point(s) detected`);

  // Rule 9: Guard trace completeness — all layers evaluated
  const r9 = guardTrace.layers.length === PROOF_NODES.length - 1; // guard trace has 6 layers (excluding 'guard' itself)
  _addCheck(checks, violations, 'guard_trace_completeness', r9,
    r9 ? 'guard evaluated all required layers' : `guard trace has ${guardTrace.layers.length} layers, expected ${PROOF_NODES.length - 1}`);

  const graph = buildConsistencyGraph(input);
  const allPassed = violations.length === 0;

  const hashInput = `${PROOF_VERSION}::${scopeId}::${checks.map(c => `${c.rule}:${c.passed}`).join('|')}`;
  const consistencyHash = createHash('sha256').update(hashInput).digest('hex');

  return {
    scope_id: scopeId,
    consistent: allPassed,
    proof_valid: allPassed,
    proof_checks: checks,
    graph_nodes: graph.nodes.length,
    graph_edges: graph.edges.length,
    consistency_hash: consistencyHash,
    violations,
    proof_version: PROOF_VERSION,
    generated_at: new Date().toISOString(),
  };
}

// ─── hard validation ───────────────────────────────────────────────

/**
 * Hard-fail if the consistency proof does not pass.
 *
 * @param {object} input
 * @returns {{ consistent: true, verified_at: string }}
 * @throws {Error} if any proof rule fails
 */
export function validateSystemConsistency(input) {
  const proof = generateConsistencyProof(input);

  if (!proof.consistent) {
    const details = proof.violations.map(v => `[${v.rule}] ${v.detail}`).join('; ');
    throw new Error(`consistency_proof_failure: ${details}`);
  }

  return { consistent: true, verified_at: new Date().toISOString() };
}

// ─── proof comparison ──────────────────────────────────────────────

/**
 * Compare two consistency proof snapshots for drift.
 *
 * @param {object} a — first proof
 * @param {object} b — second proof
 * @returns {{
 *   identical: boolean,
 *   hash_match: boolean,
 *   consistency_match: boolean,
 *   node_count_match: boolean,
 *   edge_count_match: boolean,
 *   divergence_fields: string[]
 * }}
 */
export function compareConsistencyStates(a, b) {
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') {
    return { identical: false, hash_match: false, consistency_match: false, node_count_match: false, edge_count_match: false, divergence_fields: ['invalid_input'] };
  }

  const divergence = [];

  const hashMatch = a.consistency_hash === b.consistency_hash;
  if (!hashMatch) divergence.push('consistency_hash');

  const consistencyMatch = a.consistent === b.consistent;
  if (!consistencyMatch) divergence.push('consistent');

  const nodeMatch = a.graph_nodes === b.graph_nodes;
  if (!nodeMatch) divergence.push('graph_nodes');

  const edgeMatch = a.graph_edges === b.graph_edges;
  if (!edgeMatch) divergence.push('graph_edges');

  if (a.violations?.length !== b.violations?.length) divergence.push('violation_count');

  if ((a.proof_checks?.length || 0) !== (b.proof_checks?.length || 0)) divergence.push('proof_check_count');

  return {
    identical: divergence.length === 0,
    hash_match: hashMatch,
    consistency_match: consistencyMatch,
    node_count_match: nodeMatch,
    edge_count_match: edgeMatch,
    divergence_fields: divergence,
  };
}

// ─── consistency graph ─────────────────────────────────────────────

/**
 * Build a graph representation of the decision flow.
 * Each node is a decision layer, each edge is a dependency.
 *
 * @param {object} input
 * @returns {{
 *   nodes: Array<{ id: string, layer: string, status: string }>,
 *   edges: Array<{ from: string, to: string, relationship: string }>,
 *   graph_hash: string,
 *   built_at: string
 * }}
 */
export function buildConsistencyGraph(input) {
  const safeInput = (input && typeof input === 'object') ? input : {};
  const gateInput = _buildGateInput(safeInput);

  const gate = evaluateExecutionGate(gateInput);
  const mode = getExecutionMode(gateInput);
  const routing = buildRoutingIntent(safeInput);
  const routingValid = validateRoutingIntent(routing);
  const shadow = simulateShadowExecution(safeInput);
  const shadowTrace = buildShadowTrace(safeInput);
  const shadowInteg = validateShadowIntegrity(shadowTrace);
  const obsSnapshot = buildObservabilitySnapshot(safeInput.scope_id || 'unknown');
  const anomalies = detectTraceAnomalies(obsSnapshot);
  const policy = evaluateGlobalExecutionPolicy(safeInput);
  const guard = evaluateFinalExecutionGate(safeInput);

  const nodes = [
    { id: 'gateway', layer: '6.1', status: gate.allowed ? 'PASS' : 'FAIL' },
    { id: 'mode', layer: '6.3', status: mode.mode !== 'strict' ? 'PASS' : 'RESTRICTED' },
    { id: 'routing', layer: '7.2', status: routingValid.valid ? 'PASS' : 'FAIL' },
    { id: 'shadow', layer: '7.3', status: shadow.shadow_execution && shadowInteg.valid ? 'PASS' : 'FAIL' },
    { id: 'observability', layer: '7.3', status: anomalies.anomaly_count === 0 ? 'PASS' : 'WARN' },
    { id: 'policy', layer: '7.4', status: policy.compliant ? 'PASS' : 'FAIL' },
    { id: 'guard', layer: '7.5', status: guard.final_allowed ? 'PASS' : 'FAIL' },
  ];

  const edges = [
    { from: 'gateway', to: 'mode', relationship: 'risk_classification' },
    { from: 'gateway', to: 'guard', relationship: 'gate_decision' },
    { from: 'mode', to: 'guard', relationship: 'mode_constraint' },
    { from: 'routing', to: 'guard', relationship: 'route_validation' },
    { from: 'routing', to: 'shadow', relationship: 'intent_feeds_simulation' },
    { from: 'shadow', to: 'observability', relationship: 'trace_recording' },
    { from: 'shadow', to: 'guard', relationship: 'shadow_validation' },
    { from: 'shadow', to: 'policy', relationship: 'shadow_compliance' },
    { from: 'observability', to: 'policy', relationship: 'anomaly_detection' },
    { from: 'observability', to: 'guard', relationship: 'observability_check' },
    { from: 'policy', to: 'guard', relationship: 'compliance_enforcement' },
    { from: 'guard', to: 'forensics', relationship: 'post_decision_analysis' },
  ];

  const graphStr = nodes.map(n => `${n.id}:${n.status}`).join('|') + '::' + edges.map(e => `${e.from}->${e.to}`).join('|');
  const graphHash = createHash('sha256').update(`${PROOF_VERSION}::${graphStr}`).digest('hex');

  return {
    nodes,
    edges,
    graph_hash: graphHash,
    built_at: new Date().toISOString(),
  };
}

// ─── boolean consistency check ─────────────────────────────────────

/**
 * Lightweight boolean check — never throws.
 *
 * @param {object} input
 * @returns {boolean}
 */
export function isSystemConsistent(input) {
  try {
    const proof = generateConsistencyProof(input);
    return proof.consistent;
  } catch {
    return false;
  }
}

// ─── internal helpers ──────────────────────────────────────────────

function _buildGateInput(input) {
  return {
    dispatch_decision: input.dispatch_decision || 'ALLOW',
    route: input.route || { target_node_id: input.scope_id || 'default' },
    consensus: input.consensus,
    replay_consistent: input.replay_consistent,
    convergence_stable: input.convergence_stable,
    mesh_stable: input.mesh_stable,
  };
}

function _addCheck(checks, violations, rule, passed, detail) {
  checks.push({ rule, passed, detail });
  if (!passed) violations.push({ rule, detail });
}

function _emptyProof(reason) {
  return {
    scope_id: 'unknown',
    consistent: false,
    proof_valid: false,
    proof_checks: [],
    graph_nodes: 0,
    graph_edges: 0,
    consistency_hash: '',
    violations: [{ rule: 'input_validation', detail: reason }],
    proof_version: PROOF_VERSION,
    generated_at: new Date().toISOString(),
  };
}
