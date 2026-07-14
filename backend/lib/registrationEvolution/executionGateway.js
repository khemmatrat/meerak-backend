/**
 * Phase 6.1 — Controlled execution gateway.
 *
 * First production-facing gate that transforms Phase 5 correctness
 * guarantees into execution safety decisions. Evaluates whether an
 * execution is eligible to enter real runtime context.
 *
 * Architecture position:
 *   Phase 4 Kernel → Phase 5 Distributed Stack → Phase 6.1 Execution Gateway ◄── THIS PHASE
 *
 * SAFETY CONTRACT:
 * - No execution logic — gate decisions only
 * - No state mutation
 * - No scheduling, workers, or queue processing
 * - No networking or retries
 * - No Phase 4 kernel modification
 * - No Phase 5 logic modification
 * - Deterministic — same input always produces same gate decision
 * - Purely evaluative — no side effects, no hidden state
 */

// ─── risk levels ───────────────────────────────────────────────────

const RISK_LEVELS = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  BLOCKED: 'blocked',
});

// ─── internal checkers ─────────────────────────────────────────────

function _checkDispatch(input) {
  if (!input.dispatch_decision) return { pass: false, reason: 'missing_dispatch_decision' };
  if (input.dispatch_decision !== 'ALLOW') return { pass: false, reason: `dispatch_decision_is_${input.dispatch_decision}` };
  return { pass: true, reason: 'dispatch_allowed' };
}

function _checkRoute(input) {
  if (!input.route || typeof input.route !== 'object') return { pass: false, reason: 'missing_route' };
  if (!input.route.target_node_id) return { pass: false, reason: 'route_has_no_target' };
  return { pass: true, reason: 'route_valid' };
}

function _checkConsensus(input) {
  if (input.consensus === undefined) return { pass: true, reason: 'consensus_not_provided_default_pass' };
  if (input.consensus !== true) return { pass: false, reason: 'consensus_not_reached' };
  return { pass: true, reason: 'consensus_confirmed' };
}

function _checkReplayDrift(input) {
  if (input.replay_consistent === undefined) return { pass: true, reason: 'replay_not_provided_default_pass' };
  if (input.replay_consistent !== true) return { pass: false, reason: 'replay_drift_detected' };
  return { pass: true, reason: 'replay_deterministic' };
}

function _checkConvergence(input) {
  if (input.convergence_stable === undefined) return { pass: true, reason: 'convergence_not_provided_default_pass' };
  if (input.convergence_stable !== true) return { pass: false, reason: 'unstable_convergence' };
  return { pass: true, reason: 'convergence_stable' };
}

function _checkMeshStability(input) {
  if (input.mesh_stable === undefined) return { pass: true, reason: 'mesh_not_provided_default_pass' };
  if (input.mesh_stable !== true) return { pass: false, reason: 'mesh_not_stable' };
  return { pass: true, reason: 'mesh_stable' };
}

function _runAllChecks(input) {
  return [
    { check: 'dispatch', ...(_checkDispatch(input)) },
    { check: 'route', ...(_checkRoute(input)) },
    { check: 'consensus', ...(_checkConsensus(input)) },
    { check: 'replay', ...(_checkReplayDrift(input)) },
    { check: 'convergence', ...(_checkConvergence(input)) },
    { check: 'mesh', ...(_checkMeshStability(input)) },
  ];
}

// ─── risk classification ───────────────────────────────────────────

/**
 * Classify the execution risk profile based on gate check results.
 *
 * @param {{
 *   scope_id?: string,
 *   event_type?: string,
 *   dispatch_decision?: string,
 *   route?: { target_node_id?: string },
 *   consensus?: boolean,
 *   replay_consistent?: boolean,
 *   convergence_stable?: boolean,
 *   mesh_stable?: boolean
 * }} input
 * @returns {{
 *   risk_level: string,
 *   factors: string[]
 * }}
 */
export function classifyExecutionRisk(input) {
  if (!input || typeof input !== 'object') {
    return { risk_level: RISK_LEVELS.BLOCKED, factors: ['invalid_input'] };
  }

  const checks = _runAllChecks(input);
  const failures = checks.filter(c => !c.pass);
  const factors = failures.map(f => f.reason);

  if (failures.length === 0) return { risk_level: RISK_LEVELS.LOW, factors: [] };

  const hasDispatchBlock = failures.some(f => f.check === 'dispatch');
  const hasRouteBlock = failures.some(f => f.check === 'route');

  if (hasDispatchBlock || hasRouteBlock) return { risk_level: RISK_LEVELS.BLOCKED, factors };
  if (failures.length >= 3) return { risk_level: RISK_LEVELS.HIGH, factors };
  if (failures.length >= 1) return { risk_level: RISK_LEVELS.MEDIUM, factors };

  return { risk_level: RISK_LEVELS.LOW, factors };
}

// ─── execution gate evaluation ─────────────────────────────────────

/**
 * Evaluate the execution gate — should this execution enter real runtime?
 *
 * @param {{
 *   scope_id?: string,
 *   event_type?: string,
 *   dispatch_decision?: string,
 *   route?: { target_node_id?: string },
 *   consensus?: boolean,
 *   replay_consistent?: boolean,
 *   convergence_stable?: boolean,
 *   mesh_stable?: boolean
 * }} input
 * @returns {{
 *   allowed: boolean,
 *   gate_reason: string,
 *   mode: string,
 *   risk_level: string
 * }}
 */
export function evaluateExecutionGate(input) {
  if (!input || typeof input !== 'object') {
    return { allowed: false, gate_reason: 'invalid_input', mode: 'blocked', risk_level: RISK_LEVELS.BLOCKED };
  }

  const checks = _runAllChecks(input);
  const failures = checks.filter(c => !c.pass);
  const risk = classifyExecutionRisk(input);

  if (failures.length === 0) {
    return { allowed: true, gate_reason: 'all_checks_passed', mode: 'controlled_execution', risk_level: risk.risk_level };
  }

  return {
    allowed: false,
    gate_reason: `gate_blocked: ${failures.map(f => f.reason).join(', ')}`,
    mode: 'blocked',
    risk_level: risk.risk_level,
  };
}

// ─── eligibility validation ────────────────────────────────────────

/**
 * Hard validation — throws if execution is not eligible.
 *
 * @param {{
 *   scope_id?: string,
 *   event_type?: string,
 *   dispatch_decision?: string,
 *   route?: { target_node_id?: string },
 *   consensus?: boolean,
 *   replay_consistent?: boolean,
 *   convergence_stable?: boolean,
 *   mesh_stable?: boolean
 * }} input
 * @returns {{ eligible: boolean, reason: string }}
 * @throws {Error} if any check fails
 */
export function validateExecutionEligibility(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('execution_gate_violation: invalid input');
  }

  const checks = _runAllChecks(input);
  const failures = checks.filter(c => !c.pass);

  if (failures.length > 0) {
    throw new Error(`execution_gate_violation: ${failures.map(f => `[${f.check}] ${f.reason}`).join('; ')}`);
  }

  return { eligible: true, reason: 'all_checks_passed' };
}

// ─── gate report ───────────────────────────────────────────────────

/**
 * Build a full diagnostic report of all gate checks.
 *
 * @param {{
 *   scope_id?: string,
 *   event_type?: string,
 *   dispatch_decision?: string,
 *   route?: { target_node_id?: string },
 *   consensus?: boolean,
 *   replay_consistent?: boolean,
 *   convergence_stable?: boolean,
 *   mesh_stable?: boolean
 * }} input
 * @returns {{
 *   scope_id: string,
 *   event_type: string,
 *   checks: Array<{ check: string, pass: boolean, reason: string }>,
 *   all_passed: boolean,
 *   risk_level: string,
 *   gate_decision: string
 * }}
 */
export function buildExecutionGateReport(input) {
  const safeInput = (input && typeof input === 'object') ? input : {};
  const checks = _runAllChecks(safeInput);
  const allPassed = checks.every(c => c.pass);
  const risk = classifyExecutionRisk(safeInput);

  return {
    scope_id: safeInput.scope_id || '',
    event_type: safeInput.event_type || '',
    checks,
    all_passed: allPassed,
    risk_level: risk.risk_level,
    gate_decision: allPassed ? 'ALLOW' : 'BLOCK',
  };
}

// ─── simple boolean wrapper ────────────────────────────────────────

/**
 * Simple boolean check: is execution allowed?
 *
 * @param {{
 *   dispatch_decision?: string,
 *   route?: { target_node_id?: string },
 *   consensus?: boolean,
 *   replay_consistent?: boolean,
 *   convergence_stable?: boolean,
 *   mesh_stable?: boolean
 * }} input
 * @returns {boolean}
 */
export function isExecutionAllowed(input) {
  const gate = evaluateExecutionGate(input);
  return gate.allowed;
}
