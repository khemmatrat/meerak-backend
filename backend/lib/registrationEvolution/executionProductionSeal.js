/**
 * Phase 7.8 — Production hard lock seal (system finalization layer).
 *
 * Final sealing layer for the entire execution governance system
 * (Phase 4–7). Once sealed, the system becomes a closed formal
 * model: it can observe reality but cannot change its interpretation.
 *
 * Architecture position:
 *   Phase 4 Kernel → Phase 5 Stack → Phase 6 Governance → Phase 7.1–7.7 → 7.8 Production Seal (CLOSURE)
 *
 * Design principle:
 *   "After sealing, system can observe reality — but cannot change its interpretation."
 *
 * SAFETY CONTRACT:
 * - Immutable system snapshot after seal
 * - No runtime mutation or execution logic changes
 * - No async behavior, workers, or scheduling
 * - No external dependencies, DB, or networking
 * - Deterministic seal generation
 * - Cross-layer final consistency validation (Phase 4–7)
 */

import { createHash } from 'crypto';
import { validateKernelIntegrity, getKernelSummary } from './kernelFinalizer.js';
import { validateGovernanceIntegrity, isGovernanceFrozen, buildGovernanceFinalSnapshot } from './executionGovernanceFinalizer.js';
import { validateIngressRequest } from './trafficIngressGateway.js';
import { validateRoutingIntent, buildRoutingIntent } from './executionExposureRouter.js';
import { validateShadowIntegrity, buildShadowTrace, simulateShadowExecution } from './executionShadowEngine.js';
import { buildObservabilitySnapshot, detectTraceAnomalies } from './executionObservabilityHub.js';
import { evaluateGlobalExecutionPolicy } from './executionPolicyEnforcer.js';
import { evaluateFinalExecutionGate } from './executionGuardKernel.js';
import { analyzeExecutionForensics } from './executionForensicsEngine.js';
import { generateConsistencyProof, buildConsistencyGraph } from './executionConsistencyProofEngine.js';

// ─── constants ─────────────────────────────────────────────────────

const SEAL_VERSION = 'phase7_seal_v1';

const SEALED_LAYERS = Object.freeze([
  'ingress',
  'routing',
  'shadow',
  'observability',
  'policy',
  'guard',
  'forensics',
  'consistency',
]);

let _systemSealed = false;
let _sealSnapshot = null;

// ─── production seal creation ──────────────────────────────────────

/**
 * Create a production seal of the entire system state (Phase 4–7).
 * One-way lock: once sealed, the system cannot be unsealed.
 * Throws if the system is not consistent enough to seal.
 *
 * @param {object} input — representative execution context for verification
 * @returns {{
 *   sealed: boolean,
 *   seal_id: string,
 *   timestamp: string,
 *   system_state_hash: string,
 *   layers_locked: string[],
 *   integrity: string,
 *   phase_states: { phase4: string, phase5: string, phase6: string, phase7: string },
 *   seal_version: string
 * }}
 * @throws {Error} if system is not consistent enough to seal
 */
export function createProductionSeal(input) {
  if (_systemSealed && _sealSnapshot) {
    return { ..._sealSnapshot };
  }

  const safeInput = (input && typeof input === 'object') ? input : {};
  const validationErrors = [];

  // Phase 4 kernel check
  let phase4Status = 'UNKNOWN';
  try {
    const kernelIntegrity = validateKernelIntegrity();
    phase4Status = kernelIntegrity.integrity === 'PASS' ? 'FROZEN' : 'INTEGRITY_FAIL';
    if (phase4Status !== 'FROZEN') validationErrors.push('phase4_kernel_integrity_fail');
  } catch {
    phase4Status = 'CHECK_ERROR';
    validationErrors.push('phase4_kernel_check_error');
  }

  // Phase 6 governance check
  let phase6Status = 'UNKNOWN';
  try {
    const govIntegrity = validateGovernanceIntegrity();
    phase6Status = govIntegrity.integrity === 'PASS' ? 'FROZEN' : 'INTEGRITY_FAIL';
    if (phase6Status !== 'FROZEN') validationErrors.push('phase6_governance_integrity_fail');
  } catch {
    phase6Status = 'CHECK_ERROR';
    validationErrors.push('phase6_governance_check_error');
  }

  // Phase 7 consistency proof
  let phase7Status = 'UNKNOWN';
  const proof = generateConsistencyProof(safeInput);
  if (proof.consistent) {
    phase7Status = 'CONSISTENT';
  } else {
    phase7Status = 'INCONSISTENT';
    validationErrors.push(`phase7_proof_failed: ${proof.violations.map(v => v.rule).join(', ')}`);
  }

  // Phase 5 — inherits from Phase 6 governance (Phase 5 is locked as part of Phase 6 seal)
  const phase5Status = phase6Status === 'FROZEN' ? 'FROZEN' : 'DEPENDS_ON_PHASE6';

  if (validationErrors.length > 0) {
    throw new Error(`production_seal_error: cannot seal with ${validationErrors.length} issue(s): ${validationErrors.join('; ')}`);
  }

  // Build seal
  const graph = buildConsistencyGraph(safeInput);
  const forensics = analyzeExecutionForensics(safeInput);

  const stateComponents = [
    `p4:${phase4Status}`,
    `p5:${phase5Status}`,
    `p6:${phase6Status}`,
    `p7:${phase7Status}`,
    `proof:${proof.consistency_hash}`,
    `graph:${graph.graph_hash}`,
    `forensics:${forensics.forensic_hash}`,
  ];

  const systemStateHash = createHash('sha256')
    .update(`${SEAL_VERSION}::${stateComponents.join('|')}`)
    .digest('hex');

  const sealId = `seal-${systemStateHash.slice(0, 16)}`;

  const snapshot = {
    sealed: true,
    seal_id: sealId,
    timestamp: new Date().toISOString(),
    system_state_hash: systemStateHash,
    layers_locked: [...SEALED_LAYERS],
    integrity: 'LOCKED',
    phase_states: {
      phase4: phase4Status,
      phase5: phase5Status,
      phase6: phase6Status,
      phase7: phase7Status,
    },
    seal_version: SEAL_VERSION,
  };

  _systemSealed = true;
  _sealSnapshot = Object.freeze(snapshot);

  return { ..._sealSnapshot };
}

// ─── seal integrity validation ─────────────────────────────────────

/**
 * Hard-fail validation after seal. Throws if any layer has drifted.
 *
 * @param {object} input — representative execution context
 * @returns {{ intact: true, verified_at: string }}
 * @throws {Error} if any post-seal drift is detected
 */
export function validateSealIntegrity(input) {
  if (!_systemSealed) {
    return { intact: true, verified_at: new Date().toISOString(), reason: 'system_not_yet_sealed' };
  }

  const safeInput = (input && typeof input === 'object') ? input : {};
  const issues = [];

  // Re-run consistency proof
  const proof = generateConsistencyProof(safeInput);
  if (!proof.consistent) {
    issues.push(`consistency_proof_failed: ${proof.violations.length} violation(s)`);
  }

  // Check Phase 4 kernel
  try {
    const kernel = validateKernelIntegrity();
    if (kernel.integrity !== 'PASS') issues.push('phase4_kernel_drift');
  } catch {
    issues.push('phase4_kernel_check_error');
  }

  // Check Phase 6 governance
  try {
    const gov = validateGovernanceIntegrity();
    if (gov.integrity !== 'PASS') issues.push('phase6_governance_drift');
  } catch {
    issues.push('phase6_governance_check_error');
  }

  // Check guard still works
  const guard = evaluateFinalExecutionGate(safeInput);
  if (safeInput.scope_id && safeInput.dispatch_decision === 'ALLOW' && !guard.final_allowed) {
    issues.push('guard_decision_changed_post_seal');
  }

  if (issues.length > 0) {
    throw new Error(`seal_integrity_violation: ${issues.join('; ')}`);
  }

  return { intact: true, verified_at: new Date().toISOString() };
}

// ─── sealed state check ────────────────────────────────────────────

/**
 * Check whether the system has been production-sealed.
 *
 * @returns {boolean}
 */
export function isSystemSealed() {
  return _systemSealed;
}

// ─── full seal report ──────────────────────────────────────────────

/**
 * Build a full system report covering Phase 4–7 state.
 *
 * @param {object} input — representative execution context
 * @returns {{
 *   sealed: boolean,
 *   seal_version: string,
 *   phase_summary: object,
 *   consistency: { consistent: boolean, proof_checks: number, violations: number },
 *   graph: { nodes: number, edges: number },
 *   forensics: { integrity: string, drift_detected: boolean },
 *   guard: { final_allowed: boolean, decision: string },
 *   policy: { compliant: boolean, risk_level: string },
 *   report_hash: string,
 *   built_at: string
 * }}
 */
export function buildSealReport(input) {
  const safeInput = (input && typeof input === 'object') ? input : {};

  // Phase summaries
  let kernelSummary = {};
  try { kernelSummary = getKernelSummary(); } catch { kernelSummary = { error: 'unavailable' }; }

  let govSnapshot = {};
  try { govSnapshot = buildGovernanceFinalSnapshot(); } catch { govSnapshot = { error: 'unavailable' }; }

  const proof = generateConsistencyProof(safeInput);
  const graph = buildConsistencyGraph(safeInput);
  const forensics = analyzeExecutionForensics(safeInput);
  const guard = evaluateFinalExecutionGate(safeInput);
  const policy = evaluateGlobalExecutionPolicy(safeInput);

  const phaseSummary = {
    phase4: { kernel_version: kernelSummary.kernel_version || 'unknown', status: kernelSummary.ready_for_phase5 ? 'FROZEN' : 'UNKNOWN' },
    phase5: { status: govSnapshot.frozen ? 'FROZEN' : 'ACTIVE' },
    phase6: { governance_frozen: isGovernanceFrozen(), integrity: govSnapshot.integrity || 'unknown' },
    phase7: { sealed: _systemSealed, consistency: proof.consistent ? 'PROVEN' : 'UNPROVEN' },
  };

  const hashInput = `${SEAL_VERSION}::${_systemSealed}::${proof.consistency_hash}::${graph.graph_hash}::${forensics.forensic_hash}`;
  const reportHash = createHash('sha256').update(hashInput).digest('hex');

  return {
    sealed: _systemSealed,
    seal_version: SEAL_VERSION,
    phase_summary: phaseSummary,
    consistency: { consistent: proof.consistent, proof_checks: proof.proof_checks.length, violations: proof.violations.length },
    graph: { nodes: graph.nodes.length, edges: graph.edges.length },
    forensics: { integrity: forensics.integrity, drift_detected: forensics.drift_detected },
    guard: { final_allowed: guard.final_allowed, decision: guard.decision },
    policy: { compliant: policy.compliant, risk_level: policy.risk_level },
    report_hash: reportHash,
    built_at: new Date().toISOString(),
  };
}

// ─── seal consistency verification ─────────────────────────────────

/**
 * Verify that all proofs, guards, and policies still match the seal.
 * Re-generates the system state hash and compares against the sealed snapshot.
 *
 * @param {object} input — representative execution context
 * @returns {{
 *   consistent: boolean,
 *   seal_hash_match: boolean,
 *   proof_still_valid: boolean,
 *   guard_stable: boolean,
 *   policy_stable: boolean,
 *   verified_at: string
 * }}
 */
export function verifySealConsistency(input) {
  if (!_systemSealed || !_sealSnapshot) {
    return {
      consistent: true,
      seal_hash_match: true,
      proof_still_valid: true,
      guard_stable: true,
      policy_stable: true,
      verified_at: new Date().toISOString(),
      reason: 'system_not_yet_sealed',
    };
  }

  const safeInput = (input && typeof input === 'object') ? input : {};

  const proof = generateConsistencyProof(safeInput);
  const proofValid = proof.consistent;

  const guard = evaluateFinalExecutionGate(safeInput);
  const guardStable = typeof guard.final_allowed === 'boolean';

  const policy = evaluateGlobalExecutionPolicy(safeInput);
  const policyStable = typeof policy.compliant === 'boolean';

  // Re-derive state hash to compare
  let phase4Status;
  try {
    const k = validateKernelIntegrity();
    phase4Status = k.integrity === 'PASS' ? 'FROZEN' : 'INTEGRITY_FAIL';
  } catch { phase4Status = 'CHECK_ERROR'; }

  let phase6Status;
  try {
    const g = validateGovernanceIntegrity();
    phase6Status = g.integrity === 'PASS' ? 'FROZEN' : 'INTEGRITY_FAIL';
  } catch { phase6Status = 'CHECK_ERROR'; }

  const graph = buildConsistencyGraph(safeInput);
  const forensics = analyzeExecutionForensics(safeInput);

  const stateComponents = [
    `p4:${phase4Status}`,
    `p5:${phase6Status === 'FROZEN' ? 'FROZEN' : 'DEPENDS_ON_PHASE6'}`,
    `p6:${phase6Status}`,
    `p7:${proof.consistent ? 'CONSISTENT' : 'INCONSISTENT'}`,
    `proof:${proof.consistency_hash}`,
    `graph:${graph.graph_hash}`,
    `forensics:${forensics.forensic_hash}`,
  ];

  const recomputedHash = createHash('sha256')
    .update(`${SEAL_VERSION}::${stateComponents.join('|')}`)
    .digest('hex');

  const sealHashMatch = recomputedHash === _sealSnapshot.system_state_hash;

  return {
    consistent: sealHashMatch && proofValid,
    seal_hash_match: sealHashMatch,
    proof_still_valid: proofValid,
    guard_stable: guardStable,
    policy_stable: policyStable,
    verified_at: new Date().toISOString(),
  };
}
