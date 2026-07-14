/**
 * Phase 7.4 — Execution policy enforcement layer (global control guard).
 *
 * Central policy layer that reads across all Phase 7 subsystems
 * (ingress, routing, shadow, observability) and enforces that
 * the entire execution surface remains within a controlled contract.
 *
 * Architecture position:
 *   7.1 Ingress → 7.2 Routing → 7.3 Shadow/Observability → 7.4 Policy Enforcer
 *
 * Design principle:
 *   "Observer of truth, not actor of truth"
 *
 * SAFETY CONTRACT:
 * - Read-only across all layers — zero mutation
 * - No execution trigger — policy decision only
 * - No lifecycle, dispatcher, or runtime invocation
 * - No scheduling, retry, or queue interaction
 * - No DB / persistence / networking
 * - Deterministic policy evaluation
 */

import { createHash } from 'crypto';
import { isTrafficAllowed, validateIngressRequest } from './trafficIngressGateway.js';
import { classifyTrafficIntent, validateRoutingIntent, buildRoutingIntent } from './executionExposureRouter.js';
import { simulateShadowExecution, validateShadowIntegrity, buildShadowTrace } from './executionShadowEngine.js';
import { buildObservabilitySnapshot, detectTraceAnomalies } from './executionObservabilityHub.js';

// ─── constants ─────────────────────────────────────────────────────

const POLICY_VERSION = 'phase7_policy_v1';

const POLICY_MODES = Object.freeze({
  STRICT_CONTROLLED: 'strict_controlled',
  RELAXED_SHADOW: 'relaxed_shadow',
  LOCKED: 'locked',
});

const RISK_LEVELS = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
});

const VIOLATION_TYPES = Object.freeze({
  INGRESS_INVALID: 'ingress_invalid',
  ROUTING_MISMATCH: 'routing_mismatch',
  SHADOW_EXECUTION_DRIFT: 'shadow_execution_drift',
  OBSERVABILITY_GAP: 'observability_gap',
  EXECUTION_LEAK_DETECTED: 'execution_leak_detected',
  STATE_MACHINE_VIOLATION: 'state_machine_violation',
  CROSS_SCOPE_CONTAMINATION: 'cross_scope_contamination',
});

// ─── global policy evaluation ──────────────────────────────────────

/**
 * Evaluate global execution policy across all Phase 7 layers.
 * Reads ingress, routing, shadow, and observability state for the
 * given input and produces a policy decision.
 *
 * @param {object} input
 * @param {string} input.scope_id
 * @param {string} [input.event_type]
 * @param {string} [input.source]
 * @param {string} [input.request_id]
 * @param {object} [input.ingress] — ingress result (from 7.1)
 * @param {object} [input.routing] — routing profile (from 7.2)
 * @param {object} [input.shadow] — shadow result (from 7.3)
 * @returns {{
 *   compliant: boolean,
 *   policy_mode: string,
 *   risk_level: string,
 *   violations: Array<{ type: string, detail: string }>,
 *   reason: string,
 *   policy_version: string,
 *   evaluated_at: string
 * }}
 */
export function evaluateGlobalExecutionPolicy(input) {
  if (!input || typeof input !== 'object') {
    return _policyResult(false, POLICY_MODES.LOCKED, RISK_LEVELS.CRITICAL,
      [{ type: VIOLATION_TYPES.INGRESS_INVALID, detail: 'input is not an object' }],
      'invalid_input');
  }

  const violations = [];

  _checkIngress(input, violations);
  _checkRouting(input, violations);
  _checkShadow(input, violations);
  _checkObservability(input, violations);
  _checkExecutionLeak(input, violations);
  _checkCrossScopeContamination(input, violations);

  const riskLevel = _computeRiskLevel(violations);
  const policyMode = violations.length === 0
    ? POLICY_MODES.STRICT_CONTROLLED
    : (riskLevel === RISK_LEVELS.CRITICAL ? POLICY_MODES.LOCKED : POLICY_MODES.RELAXED_SHADOW);
  const reason = violations.length === 0 ? 'all_layers_consistent' : `${violations.length}_violation(s)_detected`;

  return _policyResult(violations.length === 0, policyMode, riskLevel, violations, reason);
}

// ─── policy snapshot ───────────────────────────────────────────────

/**
 * Build a snapshot of the current policy state for a scope.
 *
 * @param {string} scopeId
 * @returns {{
 *   scope_id: string,
 *   policy_version: string,
 *   policy_mode: string,
 *   observability_status: object,
 *   snapshot_hash: string,
 *   built_at: string
 * }}
 */
export function buildPolicySnapshot(scopeId) {
  const sid = scopeId && typeof scopeId === 'string' ? scopeId : 'unknown';

  const obsSnapshot = buildObservabilitySnapshot(sid);
  const anomalies = detectTraceAnomalies(obsSnapshot);

  const policyMode = anomalies.anomaly_count === 0
    ? POLICY_MODES.STRICT_CONTROLLED
    : POLICY_MODES.RELAXED_SHADOW;

  const hashInput = `${POLICY_VERSION}::${sid}::${policyMode}::${obsSnapshot.total_traces}::${anomalies.anomaly_count}`;
  const snapshotHash = createHash('sha256').update(hashInput).digest('hex');

  return {
    scope_id: sid,
    policy_version: POLICY_VERSION,
    policy_mode: policyMode,
    observability_status: {
      total_traces: obsSnapshot.total_traces,
      total_metrics: obsSnapshot.total_metrics,
      anomaly_count: anomalies.anomaly_count,
      shadow_success_rate: obsSnapshot.metrics.shadow_success_rate,
    },
    snapshot_hash: snapshotHash,
    built_at: new Date().toISOString(),
  };
}

// ─── compliance validation (hard fail) ─────────────────────────────

/**
 * Hard-fail compliance validation. Throws on any violation.
 *
 * @param {object} input — same shape as evaluateGlobalExecutionPolicy
 * @returns {{ compliant: true, checked_at: string }}
 * @throws {Error} on any policy violation
 */
export function validatePolicyCompliance(input) {
  const result = evaluateGlobalExecutionPolicy(input);

  if (!result.compliant) {
    const details = result.violations.map(v => `${v.type}: ${v.detail}`).join('; ');
    throw new Error(`policy_compliance_violation: ${details}`);
  }

  return { compliant: true, checked_at: new Date().toISOString() };
}

// ─── boolean compliance check ──────────────────────────────────────

/**
 * Lightweight boolean check — does not throw.
 *
 * @param {object} input
 * @returns {boolean}
 */
export function isExecutionCompliant(input) {
  try {
    const result = evaluateGlobalExecutionPolicy(input);
    return result.compliant;
  } catch {
    return false;
  }
}

// ─── violation signal detection ────────────────────────────────────

/**
 * Analyze all Phase 7 layers for abnormal signals without
 * making a pass/fail judgment. Returns raw signal list.
 *
 * @param {object} input
 * @returns {{
 *   signals: Array<{ type: string, severity: string, detail: string }>,
 *   signal_count: number,
 *   scanned_layers: string[],
 *   scanned_at: string
 * }}
 */
export function detectPolicyViolationSignals(input) {
  const signals = [];
  const scannedLayers = [];

  if (!input || typeof input !== 'object') {
    return { signals: [{ type: 'invalid_input', severity: 'critical', detail: 'input is not an object' }], signal_count: 1, scanned_layers: [], scanned_at: new Date().toISOString() };
  }

  // ingress signals
  scannedLayers.push('ingress');
  if (!isTrafficAllowed(input)) {
    signals.push({ type: VIOLATION_TYPES.INGRESS_INVALID, severity: 'high', detail: 'traffic pre-gate check failed' });
  }

  // routing signals
  scannedLayers.push('routing');
  const classification = classifyTrafficIntent(input);
  if (classification.confidence < 0.80) {
    signals.push({ type: VIOLATION_TYPES.ROUTING_MISMATCH, severity: 'medium', detail: `low classification confidence: ${classification.confidence}` });
  }

  // shadow signals
  scannedLayers.push('shadow');
  if (input.scope_id) {
    const shadowResult = simulateShadowExecution(input);
    if (!shadowResult.shadow_execution || !shadowResult.deterministic) {
      signals.push({ type: VIOLATION_TYPES.SHADOW_EXECUTION_DRIFT, severity: 'high', detail: 'shadow simulation failed or non-deterministic' });
    }
    if (shadowResult.commit_allowed === true) {
      signals.push({ type: VIOLATION_TYPES.EXECUTION_LEAK_DETECTED, severity: 'critical', detail: 'shadow commit_allowed should never be true' });
    }
  }

  // observability signals
  scannedLayers.push('observability');
  if (input.scope_id) {
    const obsSnapshot = buildObservabilitySnapshot(input.scope_id);
    const anomalies = detectTraceAnomalies(obsSnapshot);
    if (anomalies.anomaly_count > 0) {
      for (const a of anomalies.anomalies) {
        signals.push({ type: VIOLATION_TYPES.OBSERVABILITY_GAP, severity: 'medium', detail: `${a.type}: ${a.detail}` });
      }
    }
  }

  // execution leak — structural assertion
  scannedLayers.push('execution_leak_guard');
  if (input.execution_allowed === true || input.commit_allowed === true) {
    signals.push({ type: VIOLATION_TYPES.EXECUTION_LEAK_DETECTED, severity: 'critical', detail: 'execution or commit flag is true in controlled context' });
  }

  return {
    signals,
    signal_count: signals.length,
    scanned_layers: scannedLayers,
    scanned_at: new Date().toISOString(),
  };
}

// ─── internal check functions ──────────────────────────────────────

function _checkIngress(input, violations) {
  if (!isTrafficAllowed(input)) {
    const validation = validateIngressRequest(input);
    const failedCheck = validation.failed_checks.length > 0 ? validation.failed_checks[0] : 'unknown';
    violations.push({ type: VIOLATION_TYPES.INGRESS_INVALID, detail: `ingress validation failed: ${failedCheck}` });
  }
}

function _checkRouting(input, violations) {
  if (!input.scope_id) return;

  const intent = buildRoutingIntent(input);
  const intentValidation = validateRoutingIntent(intent);
  if (!intentValidation.valid) {
    violations.push({ type: VIOLATION_TYPES.ROUTING_MISMATCH, detail: `routing intent invalid: ${intentValidation.failed_checks.join(', ')}` });
  }
}

function _checkShadow(input, violations) {
  if (!input.scope_id) return;

  const shadowResult = simulateShadowExecution(input);
  if (!shadowResult.shadow_execution) {
    violations.push({ type: VIOLATION_TYPES.SHADOW_EXECUTION_DRIFT, detail: 'shadow simulation returned shadow_execution=false' });
  }

  if (!shadowResult.deterministic) {
    violations.push({ type: VIOLATION_TYPES.STATE_MACHINE_VIOLATION, detail: 'shadow simulation is non-deterministic' });
  }

  const trace = buildShadowTrace(input);
  const traceIntegrity = validateShadowIntegrity(trace);
  if (!traceIntegrity.valid) {
    violations.push({ type: VIOLATION_TYPES.SHADOW_EXECUTION_DRIFT, detail: `shadow trace integrity failed: ${traceIntegrity.failed_checks.join(', ')}` });
  }
}

function _checkObservability(input, violations) {
  if (!input.scope_id) return;

  const snapshot = buildObservabilitySnapshot(input.scope_id);
  const anomalies = detectTraceAnomalies(snapshot);
  if (anomalies.anomaly_count > 0) {
    for (const a of anomalies.anomalies) {
      violations.push({ type: VIOLATION_TYPES.OBSERVABILITY_GAP, detail: `${a.type}: ${a.detail}` });
    }
  }
}

function _checkExecutionLeak(input, violations) {
  if (input.execution_allowed === true) {
    violations.push({ type: VIOLATION_TYPES.EXECUTION_LEAK_DETECTED, detail: 'execution_allowed is true — must always be false' });
  }
  if (input.commit_allowed === true) {
    violations.push({ type: VIOLATION_TYPES.EXECUTION_LEAK_DETECTED, detail: 'commit_allowed is true — must always be false' });
  }
}

function _checkCrossScopeContamination(input, violations) {
  if (!input.scope_id) return;

  if (input.ingress && input.ingress.scope_id && input.ingress.scope_id !== input.scope_id) {
    violations.push({ type: VIOLATION_TYPES.CROSS_SCOPE_CONTAMINATION, detail: `ingress scope '${input.ingress.scope_id}' differs from input scope '${input.scope_id}'` });
  }

  if (input.routing && input.routing.intent && input.routing.intent.scope_id && input.routing.intent.scope_id !== input.scope_id) {
    violations.push({ type: VIOLATION_TYPES.CROSS_SCOPE_CONTAMINATION, detail: `routing scope '${input.routing.intent.scope_id}' differs from input scope '${input.scope_id}'` });
  }
}

// ─── helpers ───────────────────────────────────────────────────────

function _computeRiskLevel(violations) {
  if (violations.length === 0) return RISK_LEVELS.LOW;
  const hasCritical = violations.some(v => v.type === VIOLATION_TYPES.EXECUTION_LEAK_DETECTED || v.type === VIOLATION_TYPES.STATE_MACHINE_VIOLATION);
  if (hasCritical) return RISK_LEVELS.CRITICAL;
  if (violations.length >= 3) return RISK_LEVELS.HIGH;
  return RISK_LEVELS.MEDIUM;
}

function _policyResult(compliant, policyMode, riskLevel, violations, reason) {
  return {
    compliant,
    policy_mode: policyMode,
    risk_level: riskLevel,
    violations,
    reason,
    policy_version: POLICY_VERSION,
    evaluated_at: new Date().toISOString(),
  };
}
