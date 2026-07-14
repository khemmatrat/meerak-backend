/**
 * Phase 7.6 — Execution audit & forensics layer (post-decision truth system).
 *
 * Analyzes decision outcomes after the guard kernel has spoken.
 * Reconstructs the full decision chain, detects drift between
 * layers, and produces deterministic forensic reports — without
 * influencing, re-evaluating, or mutating any execution state.
 *
 * Architecture position:
 *   7.5 Guard Kernel → 7.6 Forensics Engine (post-decision observer)
 *
 * Design principle:
 *   "Guard decides what CAN happen. Forensics explains what DID happen."
 *   "Truth observer, not truth rewriter."
 *
 * SAFETY CONTRACT:
 * - Read-only — zero mutation of any state
 * - No execution trigger or influence
 * - No re-evaluation of guard/policy decisions
 * - No scheduling / workers / queue interaction
 * - No persistence / DB / networking
 * - Pure deterministic analysis only
 * - In-memory only
 */

import { createHash } from 'crypto';
import { evaluateExecutionGate } from './executionGateway.js';
import { getExecutionMode } from './executionModes.js';
import { buildRoutingIntent, classifyTrafficIntent } from './executionExposureRouter.js';
import { simulateShadowExecution, validateShadowIntegrity, buildShadowTrace } from './executionShadowEngine.js';
import { buildObservabilitySnapshot, detectTraceAnomalies } from './executionObservabilityHub.js';
import { evaluateGlobalExecutionPolicy } from './executionPolicyEnforcer.js';
import { evaluateFinalExecutionGate, buildGuardDecisionTrace } from './executionGuardKernel.js';

// ─── constants ─────────────────────────────────────────────────────

const FORENSICS_VERSION = 'phase7_forensics_v1';

// ─── full forensic analysis ────────────────────────────────────────

/**
 * Analyze the full decision chain for a given input.
 * Reconstructs what each layer decided and aggregates into
 * a single forensic view.
 *
 * @param {object} input
 * @returns {{
 *   scope_id: string,
 *   decision_chain: {
 *     gateway: string,
 *     mode: string,
 *     routing: string,
 *     shadow: string,
 *     observability: string,
 *     policy: string,
 *     guard: string
 *   },
 *   drift_detected: boolean,
 *   violations: Array<{ layer: string, detail: string }>,
 *   forensic_hash: string,
 *   integrity: string,
 *   analyzed_at: string
 * }}
 */
export function analyzeExecutionForensics(input) {
  if (!input || typeof input !== 'object') {
    return _emptyForensics('invalid_input');
  }

  const scopeId = input.scope_id || 'unknown';

  const gateInput = {
    dispatch_decision: input.dispatch_decision || 'ALLOW',
    route: input.route || { target_node_id: scopeId },
    consensus: input.consensus,
    replay_consistent: input.replay_consistent,
    convergence_stable: input.convergence_stable,
    mesh_stable: input.mesh_stable,
  };

  const gate = evaluateExecutionGate(gateInput);
  const mode = getExecutionMode(gateInput);
  const routingIntent = buildRoutingIntent(input);
  const shadow = simulateShadowExecution(input);
  const shadowTrace = buildShadowTrace(input);
  const shadowIntegrity = validateShadowIntegrity(shadowTrace);
  const obsSnapshot = buildObservabilitySnapshot(scopeId);
  const anomalies = detectTraceAnomalies(obsSnapshot);
  const policy = evaluateGlobalExecutionPolicy(input);
  const guard = evaluateFinalExecutionGate(input);

  const decisionChain = {
    gateway: gate.allowed ? 'ALLOW' : 'BLOCK',
    mode: mode.mode,
    routing: routingIntent.intent_id !== 'ri-none' ? routingIntent.intent : 'INVALID',
    shadow: shadow.shadow_execution && shadow.deterministic && shadowIntegrity.valid ? 'VALID' : 'INVALID',
    observability: anomalies.anomaly_count === 0 ? 'CLEAN' : `${anomalies.anomaly_count}_ANOMALIES`,
    policy: policy.compliant ? 'COMPLIANT' : 'NON_COMPLIANT',
    guard: guard.decision,
  };

  const violations = [];
  const driftPoints = _detectDriftPoints(gate, mode, routingIntent, shadow, shadowIntegrity, policy, guard);
  const driftDetected = driftPoints.length > 0;

  for (const dp of driftPoints) {
    violations.push(dp);
  }

  const forensicHash = _computeChainHash(scopeId, decisionChain);

  return {
    scope_id: scopeId,
    decision_chain: decisionChain,
    drift_detected: driftDetected,
    violations,
    forensic_hash: forensicHash,
    integrity: violations.length === 0 ? 'PASS' : 'FAIL',
    analyzed_at: new Date().toISOString(),
  };
}

// ─── forensic report builder ───────────────────────────────────────

/**
 * Build a forensic report for a scope: timeline, guard decisions,
 * violations, and observability state.
 *
 * @param {string} scopeId
 * @returns {{
 *   scope_id: string,
 *   timeline: string[],
 *   observability: { total_traces: number, total_metrics: number, anomaly_count: number },
 *   guard_trace: object,
 *   policy_state: object,
 *   report_hash: string,
 *   built_at: string
 * }}
 */
export function buildForensicReport(scopeId) {
  const sid = scopeId && typeof scopeId === 'string' ? scopeId : 'unknown';

  const obsSnapshot = buildObservabilitySnapshot(sid);
  const anomalies = detectTraceAnomalies(obsSnapshot);

  const probeInput = {
    scope_id: sid,
    event_type: 'envelope_reserved',
    source: 'internal',
    dispatch_decision: 'ALLOW',
    route: { target_node_id: sid },
  };
  const guardTrace = buildGuardDecisionTrace(probeInput);
  const policyState = evaluateGlobalExecutionPolicy(probeInput);

  const timeline = [
    'forensic_scope_identified',
    'observability_snapshot_taken',
    'guard_trace_reconstructed',
    'policy_state_captured',
    'forensic_report_compiled',
  ];

  const hashInput = `${FORENSICS_VERSION}::${sid}::${obsSnapshot.total_traces}::${guardTrace.all_passed}::${policyState.compliant}`;
  const reportHash = createHash('sha256').update(hashInput).digest('hex');

  return {
    scope_id: sid,
    timeline,
    observability: {
      total_traces: obsSnapshot.total_traces,
      total_metrics: obsSnapshot.total_metrics,
      anomaly_count: anomalies.anomaly_count,
    },
    guard_trace: {
      layers_checked: guardTrace.layers.length,
      all_passed: guardTrace.all_passed,
      final_decision: guardTrace.final_decision,
    },
    policy_state: {
      compliant: policyState.compliant,
      risk_level: policyState.risk_level,
      violation_count: policyState.violations.length,
    },
    report_hash: reportHash,
    built_at: new Date().toISOString(),
  };
}

// ─── decision drift detection ──────────────────────────────────────

/**
 * Detect mismatch between policy, guard, shadow, and routing
 * decisions for the same input.
 *
 * @param {object} input
 * @returns {{
 *   drift_detected: boolean,
 *   drift_points: Array<{ layer: string, detail: string }>,
 *   checked_pairs: number,
 *   checked_at: string
 * }}
 */
export function detectDecisionDrift(input) {
  if (!input || typeof input !== 'object') {
    return { drift_detected: true, drift_points: [{ layer: 'input', detail: 'invalid input' }], checked_pairs: 0, checked_at: new Date().toISOString() };
  }

  const gateInput = {
    dispatch_decision: input.dispatch_decision || 'ALLOW',
    route: input.route || { target_node_id: input.scope_id || 'default' },
    consensus: input.consensus,
    replay_consistent: input.replay_consistent,
    convergence_stable: input.convergence_stable,
    mesh_stable: input.mesh_stable,
  };

  const gate = evaluateExecutionGate(gateInput);
  const mode = getExecutionMode(gateInput);
  const routingIntent = buildRoutingIntent(input);
  const shadow = simulateShadowExecution(input);
  const shadowTrace = buildShadowTrace(input);
  const shadowIntegrity = validateShadowIntegrity(shadowTrace);
  const policy = evaluateGlobalExecutionPolicy(input);
  const guard = evaluateFinalExecutionGate(input);

  const driftPoints = _detectDriftPoints(gate, mode, routingIntent, shadow, shadowIntegrity, policy, guard);

  return {
    drift_detected: driftPoints.length > 0,
    drift_points: driftPoints,
    checked_pairs: 4,
    checked_at: new Date().toISOString(),
  };
}

// ─── forensic integrity validation ─────────────────────────────────

/**
 * Hard-fail validation of forensic report consistency.
 *
 * @param {object} report — forensic report (from buildForensicReport)
 * @returns {{ valid: true, checked_at: string }}
 * @throws {Error} if forensic data is inconsistent
 */
export function validateForensicIntegrity(report) {
  if (!report || typeof report !== 'object') {
    throw new Error('forensic_integrity_error: report is not an object');
  }

  if (!report.scope_id || typeof report.scope_id !== 'string') {
    throw new Error('forensic_integrity_error: scope_id missing');
  }

  if (!Array.isArray(report.timeline) || report.timeline.length === 0) {
    throw new Error('forensic_integrity_error: timeline is empty');
  }

  if (!report.report_hash || typeof report.report_hash !== 'string' || report.report_hash.length !== 64) {
    throw new Error('forensic_integrity_error: report_hash invalid');
  }

  if (!report.observability || typeof report.observability !== 'object') {
    throw new Error('forensic_integrity_error: observability section missing');
  }

  if (!report.guard_trace || typeof report.guard_trace !== 'object') {
    throw new Error('forensic_integrity_error: guard_trace section missing');
  }

  if (!report.policy_state || typeof report.policy_state !== 'object') {
    throw new Error('forensic_integrity_error: policy_state section missing');
  }

  return { valid: true, checked_at: new Date().toISOString() };
}

// ─── forensic hash computation ─────────────────────────────────────

/**
 * Compute a deterministic SHA-256 hash of the full decision chain.
 *
 * @param {object} input
 * @returns {string} — 64-character hex hash
 */
export function computeForensicHash(input) {
  if (!input || typeof input !== 'object') {
    return createHash('sha256').update(`${FORENSICS_VERSION}::invalid_input`).digest('hex');
  }

  const forensics = analyzeExecutionForensics(input);
  return forensics.forensic_hash;
}

// ─── internal drift detection ──────────────────────────────────────

function _detectDriftPoints(gate, mode, routingIntent, shadow, shadowIntegrity, policy, guard) {
  const points = [];

  // gateway vs guard: if gateway allows but guard denies (or vice versa)
  if (gate.allowed && !guard.final_allowed) {
    points.push({ layer: 'gateway_vs_guard', detail: 'gateway ALLOW but guard DENY — downstream layer blocked' });
  }
  if (!gate.allowed && guard.final_allowed) {
    points.push({ layer: 'gateway_vs_guard', detail: 'gateway BLOCK but guard ALLOW — impossible state' });
  }

  // policy vs shadow: if policy compliant but shadow invalid
  if (policy.compliant && (!shadow.shadow_execution || !shadow.deterministic || !shadowIntegrity.valid)) {
    points.push({ layer: 'policy_vs_shadow', detail: 'policy COMPLIANT but shadow INVALID' });
  }

  // routing vs exposure intent
  if (routingIntent.execution_allowed === true) {
    points.push({ layer: 'routing_vs_exposure', detail: 'routing intent has execution_allowed=true — must always be false' });
  }

  // observability vs decision trace: guard says all passed but policy has violations
  if (guard.final_allowed && !policy.compliant) {
    points.push({ layer: 'observability_vs_decision', detail: 'guard ALLOW but policy NON_COMPLIANT — should not happen' });
  }

  return points;
}

// ─── helpers ───────────────────────────────────────────────────────

function _computeChainHash(scopeId, decisionChain) {
  const chainStr = Object.entries(decisionChain).map(([k, v]) => `${k}=${v}`).join('|');
  return createHash('sha256').update(`${FORENSICS_VERSION}::${scopeId}::${chainStr}`).digest('hex');
}

function _emptyForensics(reason) {
  return {
    scope_id: 'unknown',
    decision_chain: { gateway: 'UNKNOWN', mode: 'unknown', routing: 'UNKNOWN', shadow: 'UNKNOWN', observability: 'UNKNOWN', policy: 'UNKNOWN', guard: 'UNKNOWN' },
    drift_detected: false,
    violations: [],
    forensic_hash: '',
    integrity: 'FAIL',
    analyzed_at: new Date().toISOString(),
    _error: reason,
  };
}
