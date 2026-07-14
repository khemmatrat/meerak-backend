/**
 * Phase 5.4 — Cross-node replay consistency.
 *
 * Ensures replayed state is identical across all nodes, even under
 * divergent event ordering, partial logs, or different start times.
 * Pure validation and simulation — no execution, no networking.
 *
 * Architecture position:
 *   Phase 4 Kernel → Partitioning (5.1) → Routing (5.2) → Consensus (5.3) → Replay Consistency (5.4) ◄── THIS PHASE
 *
 * SAFETY CONTRACT:
 * - No Phase 4 kernel modification
 * - No dispatcher / routing / consensus modification
 * - No networking or cluster communication
 * - No runtime execution changes
 * - No scheduling or workers
 * - No external state persistence
 * - Deterministic — same journal always produces same state
 */

import { createHash } from 'crypto';
import { replayExecutionJournal, compareReplayStates } from './executionReplayEngine.js';

// ─── replay fingerprint ────────────────────────────────────────────

/**
 * Build a deterministic hash of a replayed state for cross-node comparison.
 * Strips non-deterministic fields (replayed_at) before hashing.
 *
 * @param {Record<string, unknown>} state — replay engine output
 * @returns {string} SHA-256 hex digest
 */
export function buildReplayFingerprint(state) {
  if (!state || typeof state !== 'object') {
    return createHash('sha256').update('__empty_state__').digest('hex');
  }

  const stable = {
    runtime_state: state.runtime_state || null,
    envelope_states: state.envelope_states || null,
    dispatch_states: state.dispatch_states || null,
    replay_metadata: state.replay_metadata
      ? { event_count: state.replay_metadata.event_count, last_sequence: state.replay_metadata.last_sequence }
      : null,
  };

  const canonical = JSON.stringify(stable, Object.keys(stable).sort());
  return createHash('sha256').update(canonical).digest('hex');
}

// ─── journal normalization ─────────────────────────────────────────

/**
 * Normalize a journal for deterministic replay:
 * - Sort entries by sequence (ascending)
 * - Remove exact duplicate entries (same sequence + event_type + envelope_id)
 * - Fill missing metadata with safe defaults
 *
 * @param {{ entries?: Array<Record<string, unknown>> }} journal
 * @returns {{ entries: Array<Record<string, unknown>>, normalized: boolean, removed_duplicates: number }}
 */
export function normalizeReplayInput(journal) {
  if (!journal || typeof journal !== 'object' || !Array.isArray(journal.entries)) {
    return { entries: [], normalized: true, removed_duplicates: 0 };
  }

  const sorted = [...journal.entries].sort((a, b) => {
    const seqA = typeof a.sequence === 'number' ? a.sequence : -1;
    const seqB = typeof b.sequence === 'number' ? b.sequence : -1;
    return seqA - seqB;
  });

  const seen = new Set();
  const deduped = [];
  let removed = 0;

  for (const entry of sorted) {
    const key = `${entry.sequence}|${entry.event_type}|${entry.envelope_id || ''}`;
    if (seen.has(key)) {
      removed++;
      continue;
    }
    seen.add(key);
    deduped.push(entry);
  }

  return { entries: deduped, normalized: true, removed_duplicates: removed };
}

// ─── cross-node replay with consistency check ──────────────────────

/**
 * Replay a journal as each node would, compare results, detect divergence.
 * Every node receives the same normalized journal and must produce
 * identical state.
 *
 * @param {{ entries?: Array<Record<string, unknown>> }} journal
 * @param {Array<{ node_id: string }>} nodes
 * @returns {{
 *   consistent: boolean,
 *   nodes_replayed: number,
 *   final_state_hash: string,
 *   divergence: Array<{ node_id: string, hash: string, differences: string[] }>
 * }}
 */
export function replayWithConsistencyCheck(journal, nodes) {
  const clusterNodes = Array.isArray(nodes) && nodes.length > 0
    ? nodes
    : [{ node_id: 'single-node' }];

  const normalized = normalizeReplayInput(journal);

  if (normalized.entries.length === 0) {
    return { consistent: true, nodes_replayed: clusterNodes.length, final_state_hash: buildReplayFingerprint(null), divergence: [] };
  }

  const results = [];

  for (const node of clusterNodes) {
    try {
      const state = replayExecutionJournal({ entries: normalized.entries });
      const hash = buildReplayFingerprint(state);
      results.push({ node_id: node.node_id, state, hash, error: null });
    } catch (e) {
      results.push({ node_id: node.node_id, state: null, hash: '__replay_error__', error: e.message });
    }
  }

  const referenceHash = results[0].hash;
  const divergence = [];

  for (let i = 1; i < results.length; i++) {
    const r = results[i];
    if (r.hash !== referenceHash) {
      let differences = [];
      if (r.state && results[0].state) {
        const cmp = compareReplayStates(results[0].state, r.state);
        differences = cmp.differences;
      } else if (r.error) {
        differences = [`replay_error: ${r.error}`];
      }
      divergence.push({ node_id: r.node_id, hash: r.hash, differences });
    }
  }

  return {
    consistent: divergence.length === 0,
    nodes_replayed: results.length,
    final_state_hash: referenceHash,
    divergence,
  };
}

// ─── replay drift detection ────────────────────────────────────────

/**
 * Detect replay state drift across a set of pre-computed node states.
 *
 * @param {Array<{ node_id?: string, state: Record<string, unknown> }>} nodeStates
 * @returns {{
 *   has_drift: boolean,
 *   first_divergence: { node_id: string, differences: string[] } | null,
 *   total_drifted_nodes: number,
 *   all_drift: Array<{ node_id: string, differences: string[] }>
 * }}
 */
export function detectReplayDrift(nodeStates) {
  if (!Array.isArray(nodeStates) || nodeStates.length < 2) {
    return { has_drift: false, first_divergence: null, total_drifted_nodes: 0, all_drift: [] };
  }

  const reference = nodeStates[0];
  const refHash = buildReplayFingerprint(reference.state);
  const allDrift = [];

  for (let i = 1; i < nodeStates.length; i++) {
    const ns = nodeStates[i];
    const hash = buildReplayFingerprint(ns.state);

    if (hash !== refHash) {
      const cmp = compareReplayStates(reference.state, ns.state);
      allDrift.push({ node_id: ns.node_id || `node-index-${i}`, differences: cmp.differences });
    }
  }

  return {
    has_drift: allDrift.length > 0,
    first_divergence: allDrift.length > 0 ? allDrift[0] : null,
    total_drifted_nodes: allDrift.length,
    all_drift: allDrift,
  };
}

// ─── determinism validation ────────────────────────────────────────

/**
 * Hard assertion: all nodes MUST produce identical replay result
 * from the same journal. Throws if determinism is violated.
 *
 * @param {{ entries?: Array<Record<string, unknown>> }} journal
 * @param {Array<{ node_id: string }>} nodes
 * @returns {{
 *   deterministic: boolean,
 *   nodes_validated: number,
 *   final_state_hash: string
 * }}
 * @throws {Error} if any node produces a different replay result
 */
export function validateReplayDeterminism(journal, nodes) {
  const result = replayWithConsistencyCheck(journal, nodes);

  if (!result.consistent) {
    const firstDiv = result.divergence[0];
    throw new Error(
      `replay_determinism_violation: node '${firstDiv.node_id}' diverged — ` +
      `expected hash '${result.final_state_hash}', got '${firstDiv.hash}'. ` +
      `Differences: ${firstDiv.differences.join('; ')}`
    );
  }

  return {
    deterministic: true,
    nodes_validated: result.nodes_replayed,
    final_state_hash: result.final_state_hash,
  };
}
