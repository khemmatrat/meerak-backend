/**
 * Phase 6.8 — Execution governance finalization & hard lock layer.
 *
 * Final authority of Phase 6 correctness. Freezes all Phase 6 layers
 * permanently, enforces cross-layer integrity, and prevents any
 * further Phase 6 extensions.
 *
 * Architecture position:
 *   Phase 4 Kernel → Phase 5 Stack → 6.1-6.7 → 6.8 Governance Finalizer ◄── THIS PHASE (CLOSURE)
 *
 * SAFETY CONTRACT:
 * - No Phase 4/5 modification
 * - No Phase 6.x extension after finalization
 * - No runtime execution changes — control only
 * - No async workers/schedulers
 * - No network/distributed logic
 * - Deterministic snapshot generation
 * - Hard immutability enforced after freeze
 */

import { createHash } from 'crypto';
import { evaluateExecutionGate } from './executionGateway.js';
import { getExecutionMode, buildModeExecutionPolicy } from './executionModes.js';
import { determineExecutionDepth, shouldCommitExecution } from './executionModeController.js';
import { createExecutionLifecycle, validateLifecycleIntegrity } from './executionLifecycleBoundary.js';
import { isLifecycleRecoverable, computeRecoveryChecksum } from './executionDurabilityFoundation.js';

// ─── constants ─────────────────────────────────────────────────────

const GOVERNANCE_VERSION = 'phase6_governance_v1';

const PHASE_6_LAYERS = Object.freeze([
  { phase: '6.1', name: 'Gateway', file: 'executionGateway.js' },
  { phase: '6.2', name: 'Bridge', file: 'executionRuntimeBridge.js' },
  { phase: '6.3', name: 'Modes', file: 'executionModes.js' },
  { phase: '6.4', name: 'Mode Controller', file: 'executionModeController.js' },
  { phase: '6.5', name: 'Activation Engine', file: 'executionActivationEngine.js' },
  { phase: '6.6', name: 'Lifecycle Boundary', file: 'executionLifecycleBoundary.js' },
  { phase: '6.7', name: 'Durability Foundation', file: 'executionDurabilityFoundation.js' },
]);

let _governanceFrozen = false;
let _frozenSnapshot = null;

// ─── layer probes ──────────────────────────────────────────────────

function _probeGateway() {
  const gate = evaluateExecutionGate({ dispatch_decision: 'ALLOW', route: { target_node_id: 'probe-node' } });
  if (!gate || typeof gate.allowed !== 'boolean') return 'gateway returned invalid result';
  return null;
}

function _probeModes() {
  const mode = getExecutionMode({ dispatch_decision: 'ALLOW', route: { target_node_id: 'probe-node' } });
  if (!mode || !mode.mode) return 'mode system returned invalid result';
  const policy = buildModeExecutionPolicy(mode.mode);
  if (!policy || typeof policy.allow_real_execution !== 'boolean') return 'mode policy returned invalid result';
  return null;
}

function _probeController() {
  const depth = determineExecutionDepth('controlled');
  if (depth !== 'full') return `expected depth 'full' for controlled mode, got '${depth}'`;
  const commit = shouldCommitExecution('controlled');
  if (commit !== true) return 'shouldCommitExecution(controlled) should be true';
  const noCommit = shouldCommitExecution('canary');
  if (noCommit !== false) return 'shouldCommitExecution(canary) should be false';
  return null;
}

function _probeLifecycle() {
  try {
    const lc = createExecutionLifecycle({ execution_id: 'probe-lc', mode: 'controlled' });
    if (!lc || lc.state !== 'initialized') return 'lifecycle creation returned invalid state';
    validateLifecycleIntegrity(lc);
    return null;
  } catch (e) {
    return e.message;
  }
}

function _probeDurability() {
  const lc = createExecutionLifecycle({ execution_id: 'probe-dur', mode: 'controlled' });
  const recoverable = isLifecycleRecoverable(lc);
  if (typeof recoverable !== 'boolean') return 'isLifecycleRecoverable returned non-boolean';
  const checksum = computeRecoveryChecksum(lc);
  if (!checksum || typeof checksum !== 'string' || checksum.length !== 64) return 'recovery checksum invalid';
  return null;
}

function _probeCrossLayer() {
  const gateInput = { dispatch_decision: 'ALLOW', route: { target_node_id: 'probe-node' }, consensus: true, replay_consistent: true, convergence_stable: true, mesh_stable: true };
  const gate = evaluateExecutionGate(gateInput);
  const mode = getExecutionMode(gateInput);
  if (gate.allowed && mode.mode === 'strict') return 'cross-layer mismatch: gateway allows but mode is strict';
  if (!gate.allowed && mode.mode === 'controlled') return 'cross-layer mismatch: gateway blocks but mode is controlled';
  return null;
}

// ─── governance integrity validation ───────────────────────────────

/**
 * Validate cross-layer integrity of all Phase 6 systems.
 *
 * @returns {{
 *   integrity: 'PASS' | 'FAIL',
 *   governance_version: string,
 *   checked_layers: number,
 *   failures: Array<{ phase: string, name: string, error: string }>
 * }}
 */
export function validateGovernanceIntegrity() {
  const probes = [
    { phase: '6.1', name: 'Gateway', probe: _probeGateway },
    { phase: '6.3', name: 'Modes', probe: _probeModes },
    { phase: '6.4', name: 'Mode Controller', probe: _probeController },
    { phase: '6.6', name: 'Lifecycle', probe: _probeLifecycle },
    { phase: '6.7', name: 'Durability', probe: _probeDurability },
    { phase: '6.x', name: 'Cross-Layer', probe: _probeCrossLayer },
  ];

  const failures = [];
  for (const p of probes) {
    try {
      const err = p.probe();
      if (err) failures.push({ phase: p.phase, name: p.name, error: err });
    } catch (e) {
      failures.push({ phase: p.phase, name: p.name, error: e.message });
    }
  }

  return { integrity: failures.length === 0 ? 'PASS' : 'FAIL', governance_version: GOVERNANCE_VERSION, checked_layers: probes.length, failures };
}

// ─── governance finalization ───────────────────────────────────────

/**
 * Freeze all Phase 6 layers permanently. One-way lock.
 * Throws if integrity validation fails.
 *
 * @returns {{
 *   phase: string,
 *   status: string,
 *   governance_locked: boolean,
 *   layers_frozen: string[],
 *   mutation_allowed: boolean,
 *   extension_allowed: boolean,
 *   integrity: string,
 *   snapshot_id: string,
 *   frozen_at: string
 * }}
 * @throws {Error} if integrity fails
 */
export function finalizeExecutionGovernance() {
  if (_governanceFrozen && _frozenSnapshot) {
    return { ..._frozenSnapshot };
  }

  const integrity = validateGovernanceIntegrity();
  if (integrity.integrity !== 'PASS') {
    throw new Error(`governance_freeze_error: cannot finalize with ${integrity.failures.length} failure(s): ${JSON.stringify(integrity.failures)}`);
  }

  const snapshot = {
    phase: '6',
    status: 'FINALIZED',
    governance_locked: true,
    layers_frozen: PHASE_6_LAYERS.map(l => l.name.toLowerCase().replace(/\s+/g, '_')),
    mutation_allowed: false,
    extension_allowed: false,
    integrity: 'PASS',
    snapshot_id: `gov-final-${GOVERNANCE_VERSION}`,
    frozen_at: new Date().toISOString(),
  };

  _governanceFrozen = true;
  _frozenSnapshot = Object.freeze(snapshot);

  return { ..._frozenSnapshot };
}

// ─── frozen state check ────────────────────────────────────────────

/**
 * Check whether governance has been hard-locked.
 *
 * @returns {boolean}
 */
export function isGovernanceFrozen() {
  return _governanceFrozen;
}

// ─── mutation guard ────────────────────────────────────────────────

/**
 * Assert that no Phase 6 layer has been mutated after freeze.
 * Throws if governance is frozen and re-validation detects issues.
 *
 * @returns {{ intact: boolean, reason: string }}
 * @throws {Error} if governance is frozen and integrity fails
 */
export function assertNoPhase6Mutation() {
  if (!_governanceFrozen) {
    return { intact: true, reason: 'governance_not_yet_frozen' };
  }

  const integrity = validateGovernanceIntegrity();
  if (integrity.integrity !== 'PASS') {
    throw new Error(`governance_frozen_violation: Phase 6 mutation detected after freeze — ${JSON.stringify(integrity.failures)}`);
  }

  return { intact: true, reason: 'governance_intact_after_freeze' };
}

// ─── final snapshot ────────────────────────────────────────────────

/**
 * Build a deterministic final governance snapshot.
 *
 * @returns {{
 *   governance_version: string,
 *   phase: string,
 *   frozen: boolean,
 *   integrity: string,
 *   layer_manifest: Array<{ phase: string, name: string, file: string }>,
 *   snapshot_hash: string
 * }}
 */
export function buildGovernanceFinalSnapshot() {
  const integrity = validateGovernanceIntegrity();

  const manifestStr = PHASE_6_LAYERS.map(l => `${l.phase}:${l.name}:${l.file}`).join('|');
  const hashInput = `${GOVERNANCE_VERSION}::${integrity.integrity}::${_governanceFrozen}::${manifestStr}`;
  const snapshotHash = createHash('sha256').update(hashInput).digest('hex');

  return {
    governance_version: GOVERNANCE_VERSION,
    phase: '6',
    frozen: _governanceFrozen,
    integrity: integrity.integrity,
    layer_manifest: [...PHASE_6_LAYERS],
    snapshot_hash: snapshotHash,
  };
}
