/**
 * Phase 5.3 — Distributed dispatcher sync.
 *
 * Ensures all nodes produce identical dispatch decisions under identical
 * inputs. Pure deterministic validation and simulation — no execution,
 * no communication, no networking.
 *
 * Architecture position:
 *   Phase 4 Kernel → Partitioning (5.1) → Routing (5.2) → Dispatcher Sync (5.3) ◄── THIS PHASE
 *
 * SAFETY CONTRACT:
 * - No Phase 4 kernel modification
 * - No routing logic modification (Phase 5.2 frozen)
 * - No networking or messaging
 * - No distributed communication
 * - No workers or schedulers
 * - No runtime execution mutation
 * - No state persistence
 * - Deterministic — identical input produces identical output on every node
 */

import { createHash } from 'crypto';
import { dispatchExecution } from './executionDispatcher.js';
import { assignScopeToNode } from './executionPartitioner.js';

// ─── consensus key ─────────────────────────────────────────────────

/**
 * Build a deterministic consensus key from the full dispatch input.
 * All nodes hashing the same input will produce the same key.
 *
 * @param {{
 *   scope_id?: string,
 *   current_state?: string,
 *   event_type?: string,
 *   node_ids?: string[]
 * }} input
 * @returns {string} SHA-256 hex digest
 */
export function buildConsensusKey(input) {
  if (!input || typeof input !== 'object') {
    return createHash('sha256').update('__empty__').digest('hex');
  }

  const parts = [
    String(input.scope_id || ''),
    String(input.current_state || ''),
    String(input.event_type || ''),
    Array.isArray(input.node_ids) ? input.node_ids.slice().sort().join(',') : '',
  ];

  return createHash('sha256').update(parts.join('|')).digest('hex');
}

// ─── distributed dispatch computation ──────────────────────────────

/**
 * Compute a dispatch decision that is guaranteed identical on all nodes
 * given identical input.
 *
 * @param {{
 *   scope_id?: string,
 *   current_state?: string,
 *   event_type?: string,
 *   available_nodes?: Array<{ node_id: string }>
 * }} input
 * @returns {{
 *   scope_id: string,
 *   event_type: string,
 *   decision: string,
 *   target_node: string | null,
 *   consensus_key: string,
 *   reason: string
 * }}
 */
export function computeDistributedDispatch(input) {
  if (!input || typeof input !== 'object') {
    return { scope_id: '', event_type: '', decision: 'BLOCK', target_node: null, consensus_key: buildConsensusKey(null), reason: 'invalid_input' };
  }

  const scopeId = input.scope_id || '';
  const currentState = input.current_state || '';
  const eventType = input.event_type || '';
  const nodes = Array.isArray(input.available_nodes) ? input.available_nodes : [];
  const nodeIds = nodes.map(n => n.node_id).filter(Boolean);

  const consensusKey = buildConsensusKey({ scope_id: scopeId, current_state: currentState, event_type: eventType, node_ids: nodeIds });

  const dispatchResult = dispatchExecution({ current_state: currentState }, { event_type: eventType });

  let targetNode = null;
  if (scopeId && nodes.length > 0) {
    try {
      const assignment = assignScopeToNode({ scope_id: scopeId }, nodes);
      targetNode = assignment.node_id;
    } catch (_) { /* no target */ }
  }

  return {
    scope_id: scopeId,
    event_type: eventType,
    decision: dispatchResult.dispatch_decision,
    target_node: targetNode,
    consensus_key: consensusKey,
    reason: dispatchResult.reason,
  };
}

// ─── consensus validation ──────────────────────────────────────────

/**
 * Validate that all node results agree — same consensus_key, decision,
 * and target_node.
 *
 * @param {Array<{
 *   consensus_key?: string,
 *   decision?: string,
 *   target_node?: string | null,
 *   node_id?: string
 * }>} results
 * @returns {{
 *   consensus: boolean,
 *   nodes_checked: number,
 *   divergence: Array<{ field: string, node_id: string, expected: string, actual: string }>
 * }}
 */
export function validateDispatchConsensus(results) {
  if (!Array.isArray(results) || results.length === 0) {
    return { consensus: true, nodes_checked: 0, divergence: [] };
  }

  const divergence = [];
  const reference = results[0];

  for (let i = 1; i < results.length; i++) {
    const r = results[i];
    const nodeId = r.node_id || `node-index-${i}`;

    if (r.consensus_key !== reference.consensus_key) {
      divergence.push({ field: 'consensus_key', node_id: nodeId, expected: reference.consensus_key || '', actual: r.consensus_key || '' });
    }
    if (r.decision !== reference.decision) {
      divergence.push({ field: 'decision', node_id: nodeId, expected: reference.decision || '', actual: r.decision || '' });
    }
    if (String(r.target_node || '') !== String(reference.target_node || '')) {
      divergence.push({ field: 'target_node', node_id: nodeId, expected: String(reference.target_node || ''), actual: String(r.target_node || '') });
    }
  }

  return { consensus: divergence.length === 0, nodes_checked: results.length, divergence };
}

// ─── cluster simulation ────────────────────────────────────────────

/**
 * Simulate how ALL nodes in a cluster would decide for a given input.
 * Each simulated node receives the same input and must produce identical
 * output. Detects divergence immediately.
 *
 * @param {{
 *   scope_id?: string,
 *   current_state?: string,
 *   event_type?: string,
 *   available_nodes?: Array<{ node_id: string }>
 * }} input
 * @param {Array<{ node_id: string }>} nodes — nodes in the cluster
 * @returns {{
 *   simulated: true,
 *   consensus: boolean,
 *   nodes_simulated: number,
 *   results: object[],
 *   divergence: object[]
 * }}
 */
export function simulateClusterDispatch(input, nodes) {
  const clusterNodes = Array.isArray(nodes) && nodes.length > 0
    ? nodes
    : (Array.isArray(input?.available_nodes) ? input.available_nodes : []);

  const results = [];

  for (const node of clusterNodes) {
    const result = computeDistributedDispatch(input);
    results.push({ ...result, node_id: node.node_id || 'unknown' });
  }

  const validation = validateDispatchConsensus(results);

  return {
    simulated: true,
    consensus: validation.consensus,
    nodes_simulated: results.length,
    results,
    divergence: validation.divergence,
  };
}

// ─── drift detection ───────────────────────────────────────────────

/**
 * Detect dispatch drift across node results. Returns detailed diff
 * identifying the first divergence point.
 *
 * @param {Array<{
 *   consensus_key?: string,
 *   decision?: string,
 *   target_node?: string | null,
 *   node_id?: string
 * }>} results
 * @returns {{
 *   has_drift: boolean,
 *   first_divergence: { field: string, node_id: string, expected: string, actual: string } | null,
 *   total_divergences: number,
 *   all_divergences: object[]
 * }}
 */
export function detectDispatchDrift(results) {
  const validation = validateDispatchConsensus(results);

  return {
    has_drift: !validation.consensus,
    first_divergence: validation.divergence.length > 0 ? validation.divergence[0] : null,
    total_divergences: validation.divergence.length,
    all_divergences: validation.divergence,
  };
}
