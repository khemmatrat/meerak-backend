/**
 * Phase 5.1 — Execution partitioning layer.
 *
 * Deterministic partitioning of execution scopes across multiple
 * runtime nodes. Each scope is owned by exactly one node at a time.
 * Mapping only — no execution, no communication, no networking.
 *
 * Architecture position:
 *   Phase 4 Kernel (single-node) → Phase 5 Partitioning (multi-node mapping) ◄── THIS PHASE
 *
 * SAFETY CONTRACT:
 * - No Phase 4 kernel modification
 * - No dispatcher or runtime execution modification
 * - No actual distributed networking
 * - No execution of any kind
 * - No scheduling or worker logic
 * - No journal / replay / fencing mutation
 * - Deterministic — same scope + same nodes always produces same assignment
 * - Stateless mapping logic (registry is for node tracking only)
 */

import { createHash } from 'crypto';

// ─── in-memory node registry ───────────────────────────────────────

/** @type {Map<string, { node_id: string, region: string, registered_at: string }>} */
const _nodeRegistry = new Map();

// ─── node registration ────────────────────────────────────────────

/**
 * Register a runtime node in the partitioning registry.
 *
 * @param {{ node_id?: string, region?: string }} input
 * @returns {{ node_id: string, region: string, registered_at: string }}
 * @throws {Error} if node_id is missing
 */
export function registerNode(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('partitioner_error: input must be a non-null object');
  }
  if (!input.node_id || typeof input.node_id !== 'string') {
    throw new Error('partitioner_error: node_id is required');
  }

  const entry = Object.freeze({
    node_id: input.node_id,
    region: (input.region && typeof input.region === 'string') ? input.region : 'default',
    registered_at: new Date().toISOString(),
  });

  _nodeRegistry.set(input.node_id, entry);
  return entry;
}

// ─── node listing ──────────────────────────────────────────────────

/**
 * Return all registered nodes (in-memory snapshot).
 *
 * @returns {Array<{ node_id: string, region: string, registered_at: string }>}
 */
export function getActiveNodes() {
  return [..._nodeRegistry.values()];
}

// ─── deterministic scope-to-node assignment ────────────────────────

/**
 * Deterministically assign a scope to a node from the provided list.
 * Uses consistent hashing: SHA-256(scope_id) mod nodes.length.
 *
 * @param {{ scope_id?: string }} scope
 * @param {Array<{ node_id: string }>} nodes
 * @returns {{ scope_id: string, node_id: string, node_index: number, reason: string }}
 * @throws {Error} if scope_id is missing or nodes list is empty
 */
export function assignScopeToNode(scope, nodes) {
  if (!scope || typeof scope !== 'object' || !scope.scope_id || typeof scope.scope_id !== 'string') {
    throw new Error('partitioner_error: scope must contain a valid scope_id');
  }
  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new Error('partitioner_error: nodes must be a non-empty array');
  }

  const hash = createHash('sha256').update(scope.scope_id).digest('hex');
  const hashInt = parseInt(hash.slice(0, 8), 16);
  const index = hashInt % nodes.length;
  const assigned = nodes[index];

  if (!assigned || !assigned.node_id) {
    throw new Error(`partitioner_error: node at index ${index} has no node_id`);
  }

  return {
    scope_id: scope.scope_id,
    node_id: assigned.node_id,
    node_index: index,
    reason: 'deterministic_hash_mapping',
  };
}

// ─── scope-to-node lookup ──────────────────────────────────────────

/**
 * Return the owning node for a scope given a node list.
 * Deterministic — same scope + same nodes always returns same node.
 *
 * @param {{ scope_id?: string }} scope
 * @param {Array<{ node_id: string }>} nodes
 * @returns {{ scope_id: string, node_id: string | null, reason: string }}
 */
export function getNodeForScope(scope, nodes) {
  try {
    const assignment = assignScopeToNode(scope, nodes);
    return { scope_id: assignment.scope_id, node_id: assignment.node_id, reason: assignment.reason };
  } catch (e) {
    return { scope_id: scope?.scope_id || '', node_id: null, reason: e.message };
  }
}

// ─── partition consistency validation ──────────────────────────────

/**
 * Validate that the partitioning rule is consistent:
 * - Same scope + same nodes → same node assignment (run 3 probes)
 * - No scope assigned to multiple nodes
 *
 * @param {Array<{ scope_id: string }>} [testScopes] — optional scopes to test
 * @param {Array<{ node_id: string }>} [testNodes] — optional nodes to test against
 * @returns {{
 *   consistent: boolean,
 *   probes_run: number,
 *   failures: Array<{ scope_id: string, error: string }>
 * }}
 */
export function validatePartitionConsistency(testScopes, testNodes) {
  const scopes = Array.isArray(testScopes) && testScopes.length > 0
    ? testScopes
    : [{ scope_id: 'probe-scope-1' }, { scope_id: 'probe-scope-2' }, { scope_id: 'probe-scope-3' }];

  const nodes = Array.isArray(testNodes) && testNodes.length > 0
    ? testNodes
    : [{ node_id: 'probe-node-a' }, { node_id: 'probe-node-b' }];

  const failures = [];
  let probes = 0;

  for (const scope of scopes) {
    try {
      const r1 = assignScopeToNode(scope, nodes);
      const r2 = assignScopeToNode(scope, nodes);
      const r3 = assignScopeToNode(scope, nodes);
      probes += 3;

      if (r1.node_id !== r2.node_id || r2.node_id !== r3.node_id) {
        failures.push({ scope_id: scope.scope_id, error: 'non_deterministic: different results across probes' });
      }
    } catch (e) {
      probes++;
      failures.push({ scope_id: scope.scope_id, error: e.message });
    }
  }

  return { consistent: failures.length === 0, probes_run: probes, failures };
}

// ─── test-only reset ───────────────────────────────────────────────

/**
 * Clear the node registry. Test-only — MUST NOT be used in runtime.
 *
 * @returns {{ cleared: boolean, previous_nodes: number }}
 */
export function clearNodeRegistry() {
  const prev = _nodeRegistry.size;
  _nodeRegistry.clear();
  return { cleared: true, previous_nodes: prev };
}
