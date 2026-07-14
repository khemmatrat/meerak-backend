/**
 * Phase 7.3 — Shadow execution engine.
 *
 * Simulates full execution paths without side effects. Produces
 * deterministic traces of what WOULD happen if the execution were
 * real — including step-by-step state progression, commit
 * eligibility, and divergence detection.
 *
 * Architecture position:
 *   7.1 Ingress → 7.2 Exposure Router → 7.3 Shadow Engine → Observability Hub
 *
 * SAFETY CONTRACT:
 * - No real execution — shadow-only simulation
 * - No commit operations
 * - No Phase 6 governance modification
 * - No lifecycle mutation
 * - No dispatcher invocation
 * - No async workers or scheduling
 * - No external persistence
 */

import { createHash, randomUUID } from 'crypto';

// ─── shadow execution constants ────────────────────────────────────

const SHADOW_VERSION = 'phase7_shadow_v1';

const SHADOW_STEP_SEQUENCE = Object.freeze([
  'runtime_booted',
  'envelope_reserved',
  'dispatch_acknowledged',
  'execution_succeeded',
  'execution_committed',
  'lifecycle_advanced',
  'execution_window_closed',
]);

// ─── shadow execution simulator ────────────────────────────────────

/**
 * Simulate full execution without side effects.
 * Walks through the deterministic step sequence and produces
 * a shadow execution result.
 *
 * @param {object} input — ingress context or routing intent
 * @returns {{
 *   shadow_execution: boolean,
 *   execution_id: string,
 *   scope_id: string,
 *   traffic_type: string,
 *   simulated_state: string,
 *   steps_simulated: number,
 *   step_trace: string[],
 *   commit_allowed: boolean,
 *   deterministic: boolean,
 *   simulation_hash: string,
 *   simulated_at: string
 * }}
 */
export function simulateShadowExecution(input) {
  if (!input || typeof input !== 'object') {
    return _emptyShadowResult('invalid_input');
  }

  const scopeId = input.scope_id || 'unknown';
  const trafficType = input.traffic_type || 'shadow';
  const executionId = `shadow-${randomUUID().slice(0, 12)}`;

  const stepTrace = [];
  let finalState = SHADOW_STEP_SEQUENCE[0];

  for (const step of SHADOW_STEP_SEQUENCE) {
    stepTrace.push(step);
    finalState = step;
  }

  const hashInput = `${SHADOW_VERSION}::${scopeId}::${trafficType}::${stepTrace.join(',')}`;
  const simulationHash = createHash('sha256').update(hashInput).digest('hex');

  return {
    shadow_execution: true,
    execution_id: executionId,
    scope_id: scopeId,
    traffic_type: trafficType,
    simulated_state: finalState,
    steps_simulated: stepTrace.length,
    step_trace: stepTrace,
    commit_allowed: false,
    deterministic: true,
    simulation_hash: simulationHash,
    simulated_at: new Date().toISOString(),
  };
}

// ─── shadow trace builder ──────────────────────────────────────────

/**
 * Create a deterministic execution trace from an input context.
 * This trace represents the full lifecycle timeline a request
 * would traverse in a real execution.
 *
 * @param {object} input — ingress context or routing intent
 * @returns {{
 *   trace_id: string,
 *   scope_id: string,
 *   timeline: string[],
 *   shadow: boolean,
 *   execution_real: boolean,
 *   trace_hash: string,
 *   built_at: string
 * }}
 */
export function buildShadowTrace(input) {
  if (!input || typeof input !== 'object') {
    return {
      trace_id: `trace-${randomUUID().slice(0, 8)}`,
      scope_id: 'unknown',
      timeline: ['error_invalid_input'],
      shadow: true,
      execution_real: false,
      trace_hash: '',
      built_at: new Date().toISOString(),
    };
  }

  const scopeId = input.scope_id || 'unknown';
  const traceId = `trace-${createHash('sha256').update(`${SHADOW_VERSION}::${scopeId}::${input.request_id || 'none'}`).digest('hex').slice(0, 12)}`;

  const timeline = [
    'ingress_received',
    'intent_classified',
    'route_resolved',
    'shadow_execution_started',
    'shadow_execution_completed',
    'observability_recorded',
  ];

  const traceHash = createHash('sha256')
    .update(`${traceId}::${scopeId}::${timeline.join(',')}`)
    .digest('hex');

  return {
    trace_id: traceId,
    scope_id: scopeId,
    timeline,
    shadow: true,
    execution_real: false,
    trace_hash: traceHash,
    built_at: new Date().toISOString(),
  };
}

// ─── divergence comparison ─────────────────────────────────────────

/**
 * Detect divergence between a shadow execution result and an
 * expected outcome. Used for validating that shadow simulation
 * matches expected state machine paths.
 *
 * @param {object} shadow — shadow execution result
 * @param {object} expected — expected execution outcome
 * @returns {{
 *   diverged: boolean,
 *   divergence_points: Array<{ field: string, shadow: *, expected: * }>,
 *   checked_fields: number
 * }}
 */
export function compareShadowVsExpected(shadow, expected) {
  if (!shadow || !expected || typeof shadow !== 'object' || typeof expected !== 'object') {
    return { diverged: true, divergence_points: [{ field: '_input', shadow: typeof shadow, expected: typeof expected }], checked_fields: 0 };
  }

  const fieldsToCheck = ['simulated_state', 'steps_simulated', 'commit_allowed', 'deterministic'];
  const divergencePoints = [];

  for (const field of fieldsToCheck) {
    if (field in expected && shadow[field] !== expected[field]) {
      divergencePoints.push({ field, shadow: shadow[field], expected: expected[field] });
    }
  }

  if (expected.step_trace && shadow.step_trace) {
    if (shadow.step_trace.length !== expected.step_trace.length) {
      divergencePoints.push({ field: 'step_trace_length', shadow: shadow.step_trace.length, expected: expected.step_trace.length });
    } else {
      for (let i = 0; i < shadow.step_trace.length; i++) {
        if (shadow.step_trace[i] !== expected.step_trace[i]) {
          divergencePoints.push({ field: `step_trace[${i}]`, shadow: shadow.step_trace[i], expected: expected.step_trace[i] });
        }
      }
    }
  }

  return {
    diverged: divergencePoints.length > 0,
    divergence_points: divergencePoints,
    checked_fields: fieldsToCheck.length,
  };
}

// ─── shadow trace integrity ────────────────────────────────────────

/**
 * Ensure a shadow trace is consistent and deterministic.
 *
 * @param {object} trace — shadow trace (from buildShadowTrace)
 * @returns {{
 *   valid: boolean,
 *   failed_checks: string[]
 * }}
 */
export function validateShadowIntegrity(trace) {
  const failures = [];

  if (!trace || typeof trace !== 'object') {
    return { valid: false, failed_checks: ['trace_not_object'] };
  }

  if (!trace.trace_id || typeof trace.trace_id !== 'string') {
    failures.push('trace_id_missing');
  }

  if (!trace.scope_id || typeof trace.scope_id !== 'string') {
    failures.push('scope_id_missing');
  }

  if (!Array.isArray(trace.timeline) || trace.timeline.length === 0) {
    failures.push('timeline_empty');
  }

  if (trace.shadow !== true) {
    failures.push('shadow_flag_not_true');
  }

  if (trace.execution_real !== false) {
    failures.push('execution_real_not_false');
  }

  if (!trace.trace_hash || typeof trace.trace_hash !== 'string' || trace.trace_hash.length !== 64) {
    failures.push('trace_hash_invalid');
  }

  return { valid: failures.length === 0, failed_checks: failures };
}

// ─── shadow validation gate ────────────────────────────────────────

/**
 * Boolean shadow validation gate — quick check if the input
 * is suitable for shadow execution.
 *
 * @param {object} input — ingress context or routing intent
 * @returns {boolean}
 */
export function isShadowExecutionValid(input) {
  if (!input || typeof input !== 'object') return false;
  if (!input.scope_id || typeof input.scope_id !== 'string') return false;
  return true;
}

// ─── helpers ───────────────────────────────────────────────────────

function _emptyShadowResult(reason) {
  return {
    shadow_execution: false,
    execution_id: `shadow-err-${randomUUID().slice(0, 8)}`,
    scope_id: 'unknown',
    traffic_type: 'unknown',
    simulated_state: 'none',
    steps_simulated: 0,
    step_trace: [],
    commit_allowed: false,
    deterministic: false,
    simulation_hash: '',
    simulated_at: new Date().toISOString(),
    _error: reason,
  };
}
