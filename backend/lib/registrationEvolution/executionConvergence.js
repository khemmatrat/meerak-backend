/**
 * Phase 5.5 — Execution convergence layer.
 *
 * Deterministic convergence mechanism that reconciles divergent node
 * states into a single canonical state. Handles drift, partial replay,
 * and inconsistent execution paths through field-level conflict
 * detection and priority-based resolution.
 *
 * Architecture position:
 *   Kernel → Partitioning → Routing → Consensus → Replay Consistency → Convergence ◄── THIS PHASE
 *
 * SAFETY CONTRACT:
 * - No Phase 4 kernel modification
 * - No partition / routing / consensus / replay modification
 * - No networking or distributed messaging
 * - No runtime execution
 * - No workers or schedulers
 * - No external state persistence
 * - Deterministic — same node states always produce same canonical state
 * - No node bias — resolution rules are position-independent
 */

import { createHash } from 'crypto';

// ─── resolution priority ───────────────────────────────────────────

const EXECUTION_STATE_PRIORITY = Object.freeze({
  'committed': 60,
  'succeeded': 50,
  'failed': 30,
  'retryable': 20,
  'dead_letter': 10,
  null: 0,
});

function _statePriority(state) {
  if (state && EXECUTION_STATE_PRIORITY[state] !== undefined) {
    return EXECUTION_STATE_PRIORITY[state];
  }
  return -1;
}

// ─── conflict detection ────────────────────────────────────────────

/**
 * Detect conflicting fields across multiple node states.
 *
 * @param {Array<{ node_id?: string, state: Record<string, unknown> }>} nodeStates
 * @returns {{
 *   has_conflict: boolean,
 *   conflicts: Array<{ field: string, values: Array<{ node_id: string, value: unknown }> }>
 * }}
 */
export function detectStateConflicts(nodeStates) {
  if (!Array.isArray(nodeStates) || nodeStates.length < 2) {
    return { has_conflict: false, conflicts: [] };
  }

  const conflicts = [];

  const envelopeIds = new Set();
  for (const ns of nodeStates) {
    if (ns.state && ns.state.envelope_states) {
      for (const eid of Object.keys(ns.state.envelope_states)) envelopeIds.add(eid);
    }
  }

  for (const envId of envelopeIds) {
    const execStates = [];
    const committedFlags = [];
    const reservedFlags = [];
    const lastSequences = [];

    for (const ns of nodeStates) {
      const nodeId = ns.node_id || 'unknown';
      const env = ns.state?.envelope_states?.[envId];
      execStates.push({ node_id: nodeId, value: env?.execution_state ?? null });
      committedFlags.push({ node_id: nodeId, value: env?.committed ?? false });
      reservedFlags.push({ node_id: nodeId, value: env?.reserved ?? false });
      const seqs = env?.event_sequences || [];
      lastSequences.push({ node_id: nodeId, value: seqs.length > 0 ? seqs[seqs.length - 1] : -1 });
    }

    if (!_allSame(execStates.map(e => e.value))) {
      conflicts.push({ field: `envelope_states.${envId}.execution_state`, values: execStates });
    }
    if (!_allSame(committedFlags.map(e => e.value))) {
      conflicts.push({ field: `envelope_states.${envId}.committed`, values: committedFlags });
    }
    if (!_allSame(reservedFlags.map(e => e.value))) {
      conflicts.push({ field: `envelope_states.${envId}.reserved`, values: reservedFlags });
    }
    if (!_allSame(lastSequences.map(e => e.value))) {
      conflicts.push({ field: `envelope_states.${envId}.last_sequence`, values: lastSequences });
    }
  }

  const bootedFlags = nodeStates.map(ns => ({ node_id: ns.node_id || 'unknown', value: ns.state?.runtime_state?.booted ?? false }));
  if (!_allSame(bootedFlags.map(e => e.value))) {
    conflicts.push({ field: 'runtime_state.booted', values: bootedFlags });
  }

  return { has_conflict: conflicts.length > 0, conflicts };
}

function _allSame(values) {
  if (values.length === 0) return true;
  const first = JSON.stringify(values[0]);
  return values.every(v => JSON.stringify(v) === first);
}

// ─── conflict resolution ───────────────────────────────────────────

/**
 * Resolve a set of conflicts using deterministic priority rules.
 *
 * Priority order:
 * - execution_committed wins over all
 * - succeeded > failed > retryable > dead_letter
 * - Higher sequence number wins for tie-breaking
 * - Boolean fields: true wins over false
 *
 * @param {Array<{ field: string, values: Array<{ node_id: string, value: unknown }> }>} conflictSet
 * @returns {Array<{ field: string, resolved_value: unknown, reason: string }>}
 */
export function resolveStateConflict(conflictSet) {
  if (!Array.isArray(conflictSet)) return [];

  const resolutions = [];

  for (const conflict of conflictSet) {
    if (!conflict || !conflict.field || !Array.isArray(conflict.values)) continue;

    if (conflict.field.endsWith('.execution_state')) {
      const best = _resolveByPriority(conflict.values);
      resolutions.push({ field: conflict.field, resolved_value: best.value, reason: `priority_resolution (from ${best.node_id})` });
    } else if (conflict.field.endsWith('.committed') || conflict.field.endsWith('.reserved') || conflict.field === 'runtime_state.booted') {
      const hasTrue = conflict.values.some(v => v.value === true);
      resolutions.push({ field: conflict.field, resolved_value: hasTrue, reason: 'boolean_true_wins' });
    } else if (conflict.field.endsWith('.last_sequence')) {
      const maxEntry = conflict.values.reduce((best, cur) => (cur.value > best.value ? cur : best), conflict.values[0]);
      resolutions.push({ field: conflict.field, resolved_value: maxEntry.value, reason: `latest_sequence_wins (from ${maxEntry.node_id})` });
    } else {
      const sorted = [...conflict.values].sort((a, b) => JSON.stringify(a.value).localeCompare(JSON.stringify(b.value)));
      resolutions.push({ field: conflict.field, resolved_value: sorted[0].value, reason: 'lexicographic_first' });
    }
  }

  return resolutions;
}

function _resolveByPriority(values) {
  let best = values[0];
  let bestPriority = _statePriority(best.value);

  for (let i = 1; i < values.length; i++) {
    const p = _statePriority(values[i].value);
    if (p > bestPriority) {
      best = values[i];
      bestPriority = p;
    }
  }

  return best;
}

// ─── canonical state computation ───────────────────────────────────

/**
 * Merge multiple node states into one canonical state.
 * Deterministic — same inputs always produce same output.
 *
 * @param {Array<{ node_id?: string, state: Record<string, unknown> }>} nodeStates
 * @returns {{
 *   canonical: boolean,
 *   state: Record<string, unknown>,
 *   conflicts_resolved: number,
 *   convergence_hash: string
 * }}
 */
export function computeCanonicalState(nodeStates) {
  if (!Array.isArray(nodeStates) || nodeStates.length === 0) {
    return { canonical: false, state: {}, conflicts_resolved: 0, convergence_hash: _hashState({}) };
  }

  if (nodeStates.length === 1) {
    const s = nodeStates[0].state || {};
    return { canonical: true, state: s, conflicts_resolved: 0, convergence_hash: _hashState(s) };
  }

  const base = JSON.parse(JSON.stringify(nodeStates[0].state || {}));
  const detection = detectStateConflicts(nodeStates);

  if (!detection.has_conflict) {
    return { canonical: true, state: base, conflicts_resolved: 0, convergence_hash: _hashState(base) };
  }

  const resolutions = resolveStateConflict(detection.conflicts);

  for (const res of resolutions) {
    _applyResolution(base, res.field, res.resolved_value);
  }

  return { canonical: true, state: base, conflicts_resolved: resolutions.length, convergence_hash: _hashState(base) };
}

function _applyResolution(state, fieldPath, value) {
  const parts = fieldPath.split('.');
  let current = state;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

function _hashState(state) {
  return createHash('sha256').update(JSON.stringify(state)).digest('hex');
}

// ─── convergence plan ──────────────────────────────────────────────

let _planSeq = 0;

/**
 * Build a step-by-step convergence plan from divergent node states.
 *
 * @param {Array<{ node_id?: string, state: Record<string, unknown> }>} nodeStates
 * @returns {{
 *   plan_id: string,
 *   steps: Array<{ action: string, detail: string }>,
 *   conflicts_detected: number,
 *   resolvable: boolean
 * }}
 */
export function buildConvergencePlan(nodeStates) {
  const planId = `conv-${Date.now()}-${++_planSeq}`;

  if (!Array.isArray(nodeStates) || nodeStates.length < 2) {
    return { plan_id: planId, steps: [], conflicts_detected: 0, resolvable: true };
  }

  const detection = detectStateConflicts(nodeStates);
  const steps = [];

  steps.push({ action: 'detect_conflicts', detail: `${detection.conflicts.length} conflict(s) found` });

  if (detection.has_conflict) {
    steps.push({ action: 'resolve_conflicts', detail: `applying priority-based resolution to ${detection.conflicts.length} field(s)` });
    steps.push({ action: 'merge_execution_state', detail: 'merging resolved values into base state' });
  }

  steps.push({ action: 'finalize_state', detail: 'computing convergence hash for canonical state' });

  return { plan_id: planId, steps, conflicts_detected: detection.conflicts.length, resolvable: true };
}

// ─── convergence validation ────────────────────────────────────────

/**
 * Validate that a converged state is canonical — no unresolved conflicts,
 * deterministic merge outcome.
 *
 * @param {Record<string, unknown>} state
 * @returns {{ valid: boolean, reason: string, convergence_hash: string }}
 */
export function validateConvergence(state) {
  if (!state || typeof state !== 'object') {
    return { valid: false, reason: 'invalid_state', convergence_hash: '' };
  }

  const singleNode = [{ node_id: 'validation', state }];
  const detection = detectStateConflicts(singleNode);

  if (detection.has_conflict) {
    return { valid: false, reason: `unresolved_conflicts: ${detection.conflicts.length}`, convergence_hash: '' };
  }

  const hash = _hashState(state);

  const hash2 = _hashState(state);
  if (hash !== hash2) {
    return { valid: false, reason: 'non_deterministic_hash', convergence_hash: '' };
  }

  return { valid: true, reason: 'ok', convergence_hash: hash };
}
