/**
 * Phase 5.6 — Eventual consistency mesh.
 *
 * Deterministic stabilization mesh ensuring all nodes continuously
 * converge toward the same canonical state over time. Measures drift,
 * computes convergence pressure, and simulates stabilization — all
 * without execution, mutation, or networking.
 *
 * Architecture position:
 *   Kernel → Partitioning → Routing → Consensus → Replay Consistency → Convergence → Mesh ◄── THIS PHASE
 *
 * SAFETY CONTRACT:
 * - No Phase 4 kernel modification
 * - No partition / routing / consensus / replay / convergence modification
 * - No networking or messaging
 * - No runtime execution
 * - No schedulers, loops, or workers
 * - No external state persistence
 * - Deterministic — same inputs always produce same outputs
 */

import { computeCanonicalState, detectStateConflicts, resolveStateConflict } from './executionConvergence.js';

// ─── stabilization vector ──────────────────────────────────────────

/**
 * Compute how far each node is from the canonical state.
 * Returns a score per node: 0 = perfectly converged, higher = more drift.
 *
 * @param {Array<{ node_id?: string, state: Record<string, unknown> }>} nodeStates
 * @returns {Record<string, number>}
 */
export function computeStabilizationVector(nodeStates) {
  if (!Array.isArray(nodeStates) || nodeStates.length === 0) return {};

  const canonical = computeCanonicalState(nodeStates);
  const canonicalStr = JSON.stringify(canonical.state);
  const result = {};

  for (const ns of nodeStates) {
    const nodeId = ns.node_id || 'unknown';
    const nodeStr = JSON.stringify(ns.state || {});

    if (nodeStr === canonicalStr) {
      result[nodeId] = 0;
    } else {
      const diff = _computeDriftScore(canonical.state, ns.state || {});
      result[nodeId] = diff;
    }
  }

  return result;
}

function _computeDriftScore(canonical, nodeState) {
  const conflicts = _countFieldDifferences(canonical, nodeState, '');
  const totalFields = _countFields(canonical, '');
  if (totalFields === 0) return 0;
  return Math.round((conflicts / totalFields) * 100) / 100;
}

function _countFieldDifferences(a, b, path) {
  if (a === b) return 0;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return JSON.stringify(a) !== JSON.stringify(b) ? 1 : 0;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return JSON.stringify(a) !== JSON.stringify(b) ? 1 : 0;
  }

  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let diffs = 0;
  for (const k of keys) {
    diffs += _countFieldDifferences(a[k], b[k], path ? `${path}.${k}` : k);
  }
  return diffs;
}

function _countFields(obj, path) {
  if (obj === null || typeof obj !== 'object') return 1;
  if (Array.isArray(obj)) return 1;
  const keys = Object.keys(obj);
  if (keys.length === 0) return 1;
  let count = 0;
  for (const k of keys) {
    count += _countFields(obj[k], path ? `${path}.${k}` : k);
  }
  return count;
}

// ─── system drift detection ────────────────────────────────────────

/**
 * Detect global inconsistency across all nodes.
 *
 * @param {Array<{ node_id?: string, state: Record<string, unknown> }>} nodeStates
 * @returns {{
 *   drift_detected: boolean,
 *   drift_score: number,
 *   affected_nodes: string[]
 * }}
 */
export function detectSystemDrift(nodeStates) {
  if (!Array.isArray(nodeStates) || nodeStates.length < 2) {
    return { drift_detected: false, drift_score: 0, affected_nodes: [] };
  }

  const vector = computeStabilizationVector(nodeStates);
  const affected = [];
  let totalDrift = 0;

  for (const [nodeId, score] of Object.entries(vector)) {
    if (score > 0) {
      affected.push(nodeId);
      totalDrift += score;
    }
  }

  const avgDrift = Object.keys(vector).length > 0
    ? Math.round((totalDrift / Object.keys(vector).length) * 100) / 100
    : 0;

  return { drift_detected: affected.length > 0, drift_score: avgDrift, affected_nodes: affected };
}

// ─── convergence pressure ──────────────────────────────────────────

/**
 * Compute deterministic "pressure" toward canonical state based on
 * conflict density, per-node drift, and overall divergence.
 *
 * @param {Array<{ node_id?: string, state: Record<string, unknown> }>} nodeStates
 * @returns {{
 *   pressure: number,
 *   conflict_density: number,
 *   max_node_drift: number,
 *   requires_convergence: boolean
 * }}
 */
export function computeConvergencePressure(nodeStates) {
  if (!Array.isArray(nodeStates) || nodeStates.length < 2) {
    return { pressure: 0, conflict_density: 0, max_node_drift: 0, requires_convergence: false };
  }

  const detection = detectStateConflicts(nodeStates);
  const vector = computeStabilizationVector(nodeStates);

  const conflictDensity = detection.conflicts.length;
  const maxDrift = Math.max(0, ...Object.values(vector));
  const pressure = Math.round((conflictDensity * 0.5 + maxDrift * 0.5) * 100) / 100;

  return {
    pressure,
    conflict_density: conflictDensity,
    max_node_drift: maxDrift,
    requires_convergence: pressure > 0,
  };
}

// ─── stabilization simulation ──────────────────────────────────────

/**
 * Simulate one convergence iteration: compute canonical state and
 * return an improved snapshot where all nodes hold the canonical state.
 * No mutation — returns a new array.
 *
 * @param {Array<{ node_id?: string, state: Record<string, unknown> }>} nodeStates
 * @returns {{
 *   simulated: true,
 *   iteration: number,
 *   before_drift: number,
 *   after_drift: number,
 *   stabilized_nodes: Array<{ node_id: string, state: Record<string, unknown> }>
 * }}
 */
let _simSeq = 0;

export function simulateStabilizationStep(nodeStates) {
  const iteration = ++_simSeq;

  if (!Array.isArray(nodeStates) || nodeStates.length === 0) {
    return { simulated: true, iteration, before_drift: 0, after_drift: 0, stabilized_nodes: [] };
  }

  const beforeDrift = detectSystemDrift(nodeStates);
  const canonical = computeCanonicalState(nodeStates);

  const stabilized = nodeStates.map(ns => ({
    node_id: ns.node_id || 'unknown',
    state: JSON.parse(JSON.stringify(canonical.state)),
  }));

  const afterDrift = detectSystemDrift(stabilized);

  return {
    simulated: true,
    iteration,
    before_drift: beforeDrift.drift_score,
    after_drift: afterDrift.drift_score,
    stabilized_nodes: stabilized,
  };
}

// ─── mesh stability validation ─────────────────────────────────────

/**
 * Hard check: system is stable if and only if drift_score === 0.
 *
 * @param {Array<{ node_id?: string, state: Record<string, unknown> }>} nodeStates
 * @returns {{
 *   stable: boolean,
 *   drift_score: number,
 *   affected_nodes: string[],
 *   reason: string
 * }}
 */
export function validateMeshStability(nodeStates) {
  const drift = detectSystemDrift(nodeStates);

  if (drift.drift_score === 0 && drift.affected_nodes.length === 0) {
    return { stable: true, drift_score: 0, affected_nodes: [], reason: 'all_nodes_converged' };
  }

  return {
    stable: false,
    drift_score: drift.drift_score,
    affected_nodes: drift.affected_nodes,
    reason: `drift_detected: score=${drift.drift_score}, nodes=${drift.affected_nodes.join(',')}`,
  };
}
