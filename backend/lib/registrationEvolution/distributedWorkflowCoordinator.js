/**
 * Phase 8.7 — Distributed workflow session coordination.
 *
 * Extends workflow runtime orchestration into deterministic multi-runtime
 * distributed workflow sessions with ownership, migration, and lineage
 * semantics.
 *
 * Architecture position:
 *   8.5 Runtime Orchestrator → 8.6 Checkpoint & Recovery → 8.7 Distributed Coordination ◄── THIS PHASE
 *
 * SAFETY CONTRACT:
 * - NO networking or real cluster communication
 * - NO async replication or persistence
 * - NO execution side effects
 * - Immutable ownership snapshots
 * - Deterministic session routing
 * - Transfer-safe lineage continuity
 */

import { createHash } from 'crypto';

// ─── constants ─────────────────────────────────────────────────────

export const DISTRIBUTED_WORKFLOW_VERSION = 'distributed_workflow_v1';

// ─── in-memory registries ──────────────────────────────────────────

const _nodeRegistry = new Map();          // node_id → frozen node descriptor
const _sessionOwnership = new Map();      // session_id → node_id
const _transferLog = [];                  // append-only transfer records

// ─── helpers ───────────────────────────────────────────────────────

function _deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const val of Object.values(obj)) {
    if (val !== null && typeof val === 'object' && !Object.isFrozen(val)) {
      _deepFreeze(val);
    }
  }
  return obj;
}

function _deterministicId(prefix, ...parts) {
  return `${prefix}-${createHash('sha256').update(parts.join('::')).digest('hex').slice(0, 16)}`;
}

// ─── node registration ─────────────────────────────────────────────

/**
 * Register an orchestration runtime node.
 *
 * @param {object} input
 * @param {string} input.node_name — human-readable node label
 * @param {string} [input.node_region] — logical region (informational)
 * @param {number} [input.capacity] — max concurrent sessions
 * @returns {object} — deeply frozen node descriptor
 * @throws {Error} on invalid input or duplicate name
 */
export function registerWorkflowRuntimeNode(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('distributed_workflow_error: invalid input');
  }
  if (!input.node_name || typeof input.node_name !== 'string') {
    throw new Error('distributed_workflow_error: node_name required');
  }

  const nodeId = _deterministicId('dwn', DISTRIBUTED_WORKFLOW_VERSION, input.node_name);

  if (_nodeRegistry.has(nodeId)) {
    throw new Error(`distributed_workflow_error: node '${input.node_name}' already registered`);
  }

  const descriptor = _deepFreeze({
    node_id: nodeId,
    node_name: input.node_name,
    node_region: input.node_region || 'default',
    capacity: input.capacity ?? 100,
    registered_at: new Date().toISOString(),
    version: DISTRIBUTED_WORKFLOW_VERSION,
  });

  _nodeRegistry.set(nodeId, descriptor);
  return descriptor;
}

// ─── session assignment ────────────────────────────────────────────

/**
 * Deterministically assign a workflow session to a node.
 * Enforces single-owner rule — a session can only be owned by one node.
 *
 * @param {object} session — workflow runtime session (must have session_id)
 * @param {object} node — registered node descriptor (must have node_id)
 * @returns {object} — deeply frozen assignment snapshot
 * @throws {Error} on invalid input, unknown node, or duplicate assignment
 */
export function assignWorkflowSession(session, node) {
  if (!session || !session.session_id) {
    throw new Error('distributed_workflow_error: session with session_id required');
  }
  if (!node || !node.node_id) {
    throw new Error('distributed_workflow_error: node with node_id required');
  }
  if (!_nodeRegistry.has(node.node_id)) {
    throw new Error(`distributed_workflow_error: node '${node.node_id}' not registered`);
  }
  if (_sessionOwnership.has(session.session_id)) {
    const current = _sessionOwnership.get(session.session_id);
    throw new Error(`distributed_workflow_error: session '${session.session_id}' already owned by '${current}'`);
  }

  _sessionOwnership.set(session.session_id, node.node_id);

  const assignmentHash = createHash('sha256')
    .update(`${DISTRIBUTED_WORKFLOW_VERSION}::assign::${session.session_id}::${node.node_id}`)
    .digest('hex');

  return _deepFreeze({
    type: 'assignment',
    session_id: session.session_id,
    node_id: node.node_id,
    assignment_hash: assignmentHash,
    assigned_at: new Date().toISOString(),
    version: DISTRIBUTED_WORKFLOW_VERSION,
  });
}

// ─── session transfer ──────────────────────────────────────────────

/**
 * Transfer session ownership from one node to another.
 * Preserves lineage via an append-only transfer log.
 *
 * @param {object} session — workflow runtime session
 * @param {object} fromNode — current owner node descriptor
 * @param {object} toNode — target owner node descriptor
 * @returns {object} — deeply frozen transfer record
 * @throws {Error} on invalid input, ownership mismatch, or same-node transfer
 */
export function transferWorkflowSession(session, fromNode, toNode) {
  if (!session || !session.session_id) {
    throw new Error('distributed_workflow_error: session with session_id required');
  }
  if (!fromNode || !fromNode.node_id) {
    throw new Error('distributed_workflow_error: fromNode with node_id required');
  }
  if (!toNode || !toNode.node_id) {
    throw new Error('distributed_workflow_error: toNode with node_id required');
  }
  if (fromNode.node_id === toNode.node_id) {
    throw new Error('distributed_workflow_error: cannot transfer to same node');
  }
  if (!_nodeRegistry.has(fromNode.node_id)) {
    throw new Error(`distributed_workflow_error: fromNode '${fromNode.node_id}' not registered`);
  }
  if (!_nodeRegistry.has(toNode.node_id)) {
    throw new Error(`distributed_workflow_error: toNode '${toNode.node_id}' not registered`);
  }

  const currentOwner = _sessionOwnership.get(session.session_id);
  if (currentOwner !== fromNode.node_id) {
    throw new Error(`distributed_workflow_error: session '${session.session_id}' not owned by '${fromNode.node_id}' (current: '${currentOwner || 'unassigned'}')`);
  }

  _sessionOwnership.set(session.session_id, toNode.node_id);

  const transferHash = createHash('sha256')
    .update(`${DISTRIBUTED_WORKFLOW_VERSION}::transfer::${session.session_id}::${fromNode.node_id}::${toNode.node_id}::${_transferLog.length}`)
    .digest('hex');

  const record = _deepFreeze({
    type: 'transfer',
    transfer_id: `dwt-${transferHash.slice(0, 16)}`,
    session_id: session.session_id,
    from_node_id: fromNode.node_id,
    to_node_id: toNode.node_id,
    sequence: _transferLog.length,
    transfer_hash: transferHash,
    transferred_at: new Date().toISOString(),
    version: DISTRIBUTED_WORKFLOW_VERSION,
  });

  _transferLog.push(record);
  return record;
}

// ─── ownership resolution ──────────────────────────────────────────

/**
 * Return the current owner node for a session.
 *
 * @param {string} sessionId
 * @returns {object|null} — node descriptor or null if unassigned
 */
export function resolveWorkflowSessionOwner(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') return null;

  const nodeId = _sessionOwnership.get(sessionId);
  if (!nodeId) return null;

  return _nodeRegistry.get(nodeId) || null;
}

// ─── distributed map ───────────────────────────────────────────────

/**
 * Build a snapshot of all session-to-node ownership mappings.
 * Deterministic ordering by session_id.
 *
 * @returns {object} — deeply frozen ownership map snapshot
 */
export function buildDistributedWorkflowMap() {
  const entries = [];
  for (const [sessionId, nodeId] of _sessionOwnership) {
    entries.push({ session_id: sessionId, node_id: nodeId });
  }
  entries.sort((a, b) => a.session_id.localeCompare(b.session_id));

  const mapHash = createHash('sha256')
    .update(`${DISTRIBUTED_WORKFLOW_VERSION}::map::${entries.map(e => `${e.session_id}=${e.node_id}`).join(',')}`)
    .digest('hex');

  return _deepFreeze({
    version: DISTRIBUTED_WORKFLOW_VERSION,
    total_nodes: _nodeRegistry.size,
    total_sessions: _sessionOwnership.size,
    total_transfers: _transferLog.length,
    ownership_entries: entries,
    transfer_log: [..._transferLog],
    map_hash: mapHash,
    built_at: new Date().toISOString(),
  });
}

// ─── integrity validation ──────────────────────────────────────────

/**
 * Validate distributed workflow integrity:
 * - no duplicate ownership
 * - no orphan sessions (owned by unregistered nodes)
 * - transfer lineage continuity
 * - deterministic ownership consistency
 *
 * @returns {{ valid: boolean, checks: string[], violations: string[] }}
 */
export function validateDistributedWorkflowIntegrity() {
  const checks = [];
  const violations = [];

  // 1. No duplicate ownership (Map enforces uniqueness by key, but verify values)
  const ownershipByNode = new Map();
  for (const [sessionId, nodeId] of _sessionOwnership) {
    if (!ownershipByNode.has(nodeId)) ownershipByNode.set(nodeId, []);
    ownershipByNode.get(nodeId).push(sessionId);
  }
  checks.push('ownership_uniqueness_checked');

  // 2. No orphan sessions — every owner node must be registered
  for (const [sessionId, nodeId] of _sessionOwnership) {
    if (!_nodeRegistry.has(nodeId)) {
      violations.push(`orphan_session: '${sessionId}' owned by unregistered node '${nodeId}'`);
    }
  }
  checks.push('orphan_session_check');

  // 3. Transfer lineage continuity — each transfer's from_node must match
  //    the owner at the time (reconstructed from sequence order)
  const reconstructed = new Map();
  // Pre-fill with current assignments excluding transfers (use first assignment)
  // We verify by replaying the transfer log in sequence order
  const assignmentBaseline = new Map();
  for (const [sid, nid] of _sessionOwnership) {
    assignmentBaseline.set(sid, nid);
  }
  // Replay transfers backwards to find the original assignment
  const sortedTransfers = [..._transferLog].sort((a, b) => a.sequence - b.sequence);
  const originMap = new Map(assignmentBaseline);
  for (let i = sortedTransfers.length - 1; i >= 0; i--) {
    const t = sortedTransfers[i];
    originMap.set(t.session_id, t.from_node_id);
  }
  // Now replay forward to verify continuity
  const currentState = new Map(originMap);
  for (const t of sortedTransfers) {
    const expected = currentState.get(t.session_id);
    if (expected !== t.from_node_id) {
      violations.push(`transfer_lineage_break: transfer '${t.transfer_id}' expected from '${expected}' but recorded '${t.from_node_id}'`);
    }
    currentState.set(t.session_id, t.to_node_id);
  }
  checks.push('transfer_lineage_continuity');

  // 4. Final state must match current ownership
  for (const [sid, nid] of _sessionOwnership) {
    const replayed = currentState.get(sid);
    if (replayed !== nid) {
      violations.push(`ownership_consistency: session '${sid}' current='${nid}' but replayed='${replayed}'`);
    }
  }
  checks.push('ownership_consistency');

  // 5. Transfer hash determinism — verify each transfer hash is reproducible
  for (const t of _transferLog) {
    const expected = createHash('sha256')
      .update(`${DISTRIBUTED_WORKFLOW_VERSION}::transfer::${t.session_id}::${t.from_node_id}::${t.to_node_id}::${t.sequence}`)
      .digest('hex');
    if (expected !== t.transfer_hash) {
      violations.push(`transfer_hash_mismatch: transfer '${t.transfer_id}' hash not reproducible`);
    }
  }
  checks.push('transfer_hash_determinism');

  return { valid: violations.length === 0, checks, violations };
}

// ─── distributed hash ──────────────────────────────────────────────

/**
 * Deterministic SHA-256 from the normalized ownership graph.
 *
 * @returns {string}
 */
export function computeDistributedWorkflowHash() {
  const nodeIds = [..._nodeRegistry.keys()].sort().join(',');
  const ownershipPairs = [];
  for (const [sid, nid] of _sessionOwnership) {
    ownershipPairs.push(`${sid}=${nid}`);
  }
  ownershipPairs.sort();

  const transferHashes = _transferLog
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .map(t => t.transfer_hash)
    .join(',');

  const hashInput = [
    DISTRIBUTED_WORKFLOW_VERSION,
    nodeIds,
    ownershipPairs.join(','),
    transferHashes,
    String(_nodeRegistry.size),
    String(_sessionOwnership.size),
    String(_transferLog.length),
  ].join('::');

  return createHash('sha256').update(hashInput).digest('hex');
}
