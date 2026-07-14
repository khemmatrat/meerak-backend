/**
 * Phase 9.7 — Runtime event provenance graph & causal lineage engine.
 *
 * Deterministic causal graph of runtime events above the audit ledger
 * (9.6). Provides immutable provenance nodes, causal edge linking,
 * lineage tracing, and graph integrity validation for tenant-scoped
 * forensic reproducibility.
 *
 * Architecture position:
 *   9.5 Usage Meter → 9.6 Audit Ledger → 9.7 Provenance Graph ◄── THIS PHASE
 *
 * SAFETY CONTRACT:
 * - NO execution or side effects
 * - NO persistence, networking, or async workers
 * - NO billing or payment logic
 * - execution_allowed is ALWAYS false
 * - readonly_graph is ALWAYS true
 * - readonly_runtime is ALWAYS true
 * - immutable adjacency structure
 * - deterministic graph reconstruction
 * - no cross-tenant edges
 */

import { createHash } from 'crypto';
import { resolveTenantNamespace } from './tenantProvisioningLayer.js';

// ─── constants ─────────────────────────────────────────────────────

export const RUNTIME_PROVENANCE_VERSION = 'runtime_provenance_v1';

const SOURCE_LAYERS = Object.freeze(new Set([
  'gateway', 'policy', 'meter', 'audit', 'workflow', 'sdk',
]));

const RELATION_TYPES = Object.freeze(new Set([
  'triggers', 'derives_from', 'validates', 'records', 'observes',
]));

// ─── in-memory state ──────────────────────────────────────────────

const _nodes = new Map();               // node_id → frozen node
const _eventIdToNode = new Map();       // event_id → node_id
const _links = [];                       // append-only edges
const _adjacency = new Map();           // from_node_id → [{ to_node_id, link }]
const _reverseAdj = new Map();          // to_node_id → [{ from_node_id, link }]
const _tenantNodes = new Map();         // tenant_id → Set<node_id>

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

// ─── node registration ─────────────────────────────────────────────

/**
 * Register an immutable event node in the causal graph.
 *
 * @param {object} input
 * @returns {object} — deeply frozen provenance node
 * @throws {Error} on validation failure
 */
export function registerProvenanceNode(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('runtime_provenance_error: invalid input');
  }
  if (!input.tenant_id || typeof input.tenant_id !== 'string') {
    throw new Error('runtime_provenance_error: tenant_id required');
  }
  if (!input.namespace || typeof input.namespace !== 'string') {
    throw new Error('runtime_provenance_error: namespace required');
  }
  if (!input.event_type || typeof input.event_type !== 'string') {
    throw new Error('runtime_provenance_error: event_type required');
  }
  if (!input.event_id || typeof input.event_id !== 'string') {
    throw new Error('runtime_provenance_error: event_id required');
  }
  if (!input.source_layer || !SOURCE_LAYERS.has(input.source_layer)) {
    throw new Error(`runtime_provenance_error: invalid source_layer '${input.source_layer}'`);
  }
  if (!input.source_hash || typeof input.source_hash !== 'string') {
    throw new Error('runtime_provenance_error: source_hash required');
  }

  // Tenant must exist (Phase 9.3)
  const tenantResolution = resolveTenantNamespace({ tenant_id: input.tenant_id });
  if (!tenantResolution) {
    throw new Error(`runtime_provenance_error: tenant '${input.tenant_id}' not found`);
  }
  if (tenantResolution.namespace !== input.namespace.toLowerCase().trim()) {
    throw new Error('runtime_provenance_error: namespace mismatch');
  }

  // Unique event_id
  if (_eventIdToNode.has(input.event_id)) {
    throw new Error(`runtime_provenance_error: event_id '${input.event_id}' already registered`);
  }

  const nodeId = `pn-${createHash('sha256').update(`${RUNTIME_PROVENANCE_VERSION}::${input.tenant_id}::${input.event_id}`).digest('hex').slice(0, 16)}`;

  const nodeHash = createHash('sha256')
    .update([
      RUNTIME_PROVENANCE_VERSION,
      nodeId,
      input.tenant_id,
      input.namespace.toLowerCase().trim(),
      input.event_type,
      input.event_id,
      input.source_layer,
      input.source_hash,
    ].join('::'))
    .digest('hex');

  const node = _deepFreeze({
    node_id: nodeId,
    tenant_id: input.tenant_id,
    namespace: input.namespace.toLowerCase().trim(),
    event_type: input.event_type,
    event_id: input.event_id,
    source_layer: input.source_layer,
    source_hash: input.source_hash,
    metadata: input.metadata ? { ...input.metadata } : {},
    readonly_graph: true,
    execution_allowed: false,
    node_hash: nodeHash,
    version: RUNTIME_PROVENANCE_VERSION,
    created_at: new Date().toISOString(),
  });

  _nodes.set(nodeId, node);
  _eventIdToNode.set(input.event_id, nodeId);
  if (!_tenantNodes.has(input.tenant_id)) _tenantNodes.set(input.tenant_id, new Set());
  _tenantNodes.get(input.tenant_id).add(nodeId);

  return node;
}

// ─── edge linking ──────────────────────────────────────────────────

/**
 * Build a causal relationship between two provenance nodes.
 *
 * @param {object} input
 * @param {string} input.from_node_id
 * @param {string} input.to_node_id
 * @param {string} input.relation_type
 * @returns {object} — deeply frozen link descriptor
 * @throws {Error} on validation failure
 */
export function linkProvenanceNodes(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('runtime_provenance_error: invalid input');
  }
  if (!input.from_node_id || !_nodes.has(input.from_node_id)) {
    throw new Error(`runtime_provenance_error: from_node_id '${input.from_node_id}' not found`);
  }
  if (!input.to_node_id || !_nodes.has(input.to_node_id)) {
    throw new Error(`runtime_provenance_error: to_node_id '${input.to_node_id}' not found`);
  }
  if (!input.relation_type || !RELATION_TYPES.has(input.relation_type)) {
    throw new Error(`runtime_provenance_error: invalid relation_type '${input.relation_type}'`);
  }

  const fromNode = _nodes.get(input.from_node_id);
  const toNode = _nodes.get(input.to_node_id);

  // No cross-tenant edges
  if (fromNode.tenant_id !== toNode.tenant_id) {
    throw new Error('runtime_provenance_error: cross-tenant edges not allowed');
  }

  // Cycle detection (unless derives_from)
  if (input.relation_type !== 'derives_from') {
    if (_wouldCreateCycle(input.from_node_id, input.to_node_id)) {
      throw new Error('runtime_provenance_error: cycle detected — only derives_from allows cycles');
    }
  }

  const linkHash = createHash('sha256')
    .update([
      RUNTIME_PROVENANCE_VERSION,
      input.from_node_id,
      input.to_node_id,
      input.relation_type,
      String(_links.length),
    ].join('::'))
    .digest('hex');

  const linkId = `pl-${linkHash.slice(0, 16)}`;

  const link = _deepFreeze({
    link_id: linkId,
    from_node_id: input.from_node_id,
    to_node_id: input.to_node_id,
    relation_type: input.relation_type,
    link_hash: linkHash,
    version: RUNTIME_PROVENANCE_VERSION,
    created_at: new Date().toISOString(),
  });

  _links.push(link);

  if (!_adjacency.has(input.from_node_id)) _adjacency.set(input.from_node_id, []);
  _adjacency.get(input.from_node_id).push({ to_node_id: input.to_node_id, link });

  if (!_reverseAdj.has(input.to_node_id)) _reverseAdj.set(input.to_node_id, []);
  _reverseAdj.get(input.to_node_id).push({ from_node_id: input.from_node_id, link });

  return link;
}

function _wouldCreateCycle(fromId, toId) {
  const visited = new Set();
  const stack = [toId];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === fromId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const edges = _adjacency.get(current) || [];
    for (const edge of edges) {
      stack.push(edge.to_node_id);
    }
  }
  return false;
}

// ─── graph building ────────────────────────────────────────────────

/**
 * Build full causal graph for a tenant.
 *
 * @param {object} input — { tenant_id }
 * @returns {object} — deeply frozen graph descriptor
 * @throws {Error} if tenant not found
 */
export function buildProvenanceGraph(input) {
  if (!input || !input.tenant_id) {
    throw new Error('runtime_provenance_error: tenant_id required');
  }

  const nodeIds = _tenantNodes.get(input.tenant_id);
  if (!nodeIds || nodeIds.size === 0) {
    throw new Error(`runtime_provenance_error: no nodes for tenant '${input.tenant_id}'`);
  }

  const nodeIdSet = nodeIds;
  const adjList = {};
  const inDegree = {};
  const outDegree = {};

  for (const nid of nodeIdSet) {
    adjList[nid] = [];
    inDegree[nid] = 0;
    outDegree[nid] = 0;
  }

  const graphLinks = [];
  for (const link of _links) {
    if (nodeIdSet.has(link.from_node_id) && nodeIdSet.has(link.to_node_id)) {
      adjList[link.from_node_id].push(link.to_node_id);
      outDegree[link.from_node_id]++;
      inDegree[link.to_node_id] = (inDegree[link.to_node_id] || 0) + 1;
      graphLinks.push(link.link_id);
    }
  }

  const rootNodes = [...nodeIdSet].filter(nid => (inDegree[nid] || 0) === 0).sort();
  const leafNodes = [...nodeIdSet].filter(nid => (outDegree[nid] || 0) === 0).sort();

  const graphHash = createHash('sha256')
    .update([
      RUNTIME_PROVENANCE_VERSION,
      input.tenant_id,
      [...nodeIdSet].sort().join(','),
      graphLinks.sort().join(','),
      String(nodeIdSet.size),
      String(graphLinks.length),
    ].join('::'))
    .digest('hex');

  const graphId = `pg-${graphHash.slice(0, 16)}`;

  return _deepFreeze({
    graph_id: graphId,
    tenant_id: input.tenant_id,
    total_nodes: nodeIdSet.size,
    total_links: graphLinks.length,
    adjacency_list: adjList,
    root_nodes: rootNodes,
    leaf_nodes: leafNodes,
    graph_hash: graphHash,
    readonly_runtime: true,
    execution_allowed: false,
    version: RUNTIME_PROVENANCE_VERSION,
    built_at: new Date().toISOString(),
  });
}

// ─── graph validation ──────────────────────────────────────────────

/**
 * Hard validation of provenance graph integrity.
 *
 * @param {object} [input] — { tenant_id? } or omit for system-wide
 * @returns {{ valid: true, checks: string[] }}
 * @throws {Error} on integrity violation
 */
export function validateProvenanceGraph(input) {
  const checks = [];

  // Determine scope
  const tenantIds = [];
  if (input && input.tenant_id) {
    tenantIds.push(input.tenant_id);
  } else {
    for (const tid of _tenantNodes.keys()) tenantIds.push(tid);
  }

  // 1. No broken references in links
  for (const link of _links) {
    if (!_nodes.has(link.from_node_id)) {
      throw new Error(`runtime_provenance_violation: broken from_node_id '${link.from_node_id}'`);
    }
    if (!_nodes.has(link.to_node_id)) {
      throw new Error(`runtime_provenance_violation: broken to_node_id '${link.to_node_id}'`);
    }
  }
  checks.push('no_broken_references');

  // 2. No cross-tenant edges
  for (const link of _links) {
    const from = _nodes.get(link.from_node_id);
    const to = _nodes.get(link.to_node_id);
    if (from.tenant_id !== to.tenant_id) {
      throw new Error(`runtime_provenance_violation: cross-tenant edge '${link.link_id}'`);
    }
  }
  checks.push('no_cross_tenant_edges');

  // 3. Namespace isolation
  for (const tid of tenantIds) {
    const nodeIds = _tenantNodes.get(tid) || new Set();
    const resolution = resolveTenantNamespace({ tenant_id: tid });
    if (!resolution) {
      throw new Error(`runtime_provenance_violation: tenant '${tid}' not found`);
    }
    for (const nid of nodeIds) {
      const node = _nodes.get(nid);
      if (node.namespace !== resolution.namespace) {
        throw new Error(`runtime_provenance_violation: namespace mismatch for node '${nid}'`);
      }
    }
  }
  checks.push('namespace_isolation');

  // 4. Node hash reproducibility
  for (const [, node] of _nodes) {
    const recomputed = createHash('sha256')
      .update([
        RUNTIME_PROVENANCE_VERSION,
        node.node_id,
        node.tenant_id,
        node.namespace,
        node.event_type,
        node.event_id,
        node.source_layer,
        node.source_hash,
      ].join('::'))
      .digest('hex');
    if (recomputed !== node.node_hash) {
      throw new Error(`runtime_provenance_violation: node_hash not reproducible for '${node.node_id}'`);
    }
  }
  checks.push('node_hash_reproducible');

  // 5. Source hash consistency (non-empty)
  for (const [, node] of _nodes) {
    if (!node.source_hash || node.source_hash.length === 0) {
      throw new Error(`runtime_provenance_violation: missing source_hash for '${node.node_id}'`);
    }
  }
  checks.push('source_hash_consistency');

  // 6. Link hash reproducibility
  for (let i = 0; i < _links.length; i++) {
    const link = _links[i];
    const recomputed = createHash('sha256')
      .update([
        RUNTIME_PROVENANCE_VERSION,
        link.from_node_id,
        link.to_node_id,
        link.relation_type,
        String(i),
      ].join('::'))
      .digest('hex');
    if (recomputed !== link.link_hash) {
      throw new Error(`runtime_provenance_violation: link_hash not reproducible for '${link.link_id}'`);
    }
  }
  checks.push('link_hash_reproducible');

  return { valid: true, checks };
}

// ─── lineage tracing ───────────────────────────────────────────────

/**
 * Trace full causal lineage from an event.
 *
 * @param {object} input — { event_id } or { node_id }
 * @returns {object} — deeply frozen lineage descriptor
 * @throws {Error} if event not found
 */
export function traceCausalLineage(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('runtime_provenance_error: invalid input');
  }

  let startNodeId = null;
  if (input.node_id && _nodes.has(input.node_id)) {
    startNodeId = input.node_id;
  } else if (input.event_id && _eventIdToNode.has(input.event_id)) {
    startNodeId = _eventIdToNode.get(input.event_id);
  }

  if (!startNodeId) {
    throw new Error('runtime_provenance_error: event/node not found for lineage trace');
  }

  // BFS forward to find all downstream
  const chain = [];
  const visited = new Set();
  const queue = [{ nodeId: startNodeId, depth: 0 }];
  let maxDepth = 0;
  const terminals = [];

  while (queue.length > 0) {
    const { nodeId, depth } = queue.shift();
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    const node = _nodes.get(nodeId);
    chain.push({ node_id: nodeId, event_id: node.event_id, event_type: node.event_type, source_layer: node.source_layer, depth });

    if (depth > maxDepth) maxDepth = depth;

    const edges = _adjacency.get(nodeId) || [];
    if (edges.length === 0) {
      terminals.push(nodeId);
    }
    for (const edge of edges) {
      if (!visited.has(edge.to_node_id)) {
        queue.push({ nodeId: edge.to_node_id, depth: depth + 1 });
      }
    }
  }

  // Find root by tracing backwards
  let rootNodeId = startNodeId;
  const rootVisited = new Set();
  const rootQueue = [startNodeId];
  while (rootQueue.length > 0) {
    const current = rootQueue.shift();
    if (rootVisited.has(current)) continue;
    rootVisited.add(current);
    const parents = _reverseAdj.get(current) || [];
    if (parents.length === 0) {
      rootNodeId = current;
    }
    for (const p of parents) {
      if (!rootVisited.has(p.from_node_id)) rootQueue.push(p.from_node_id);
    }
  }

  const rootNode = _nodes.get(rootNodeId);

  const lineageHash = createHash('sha256')
    .update([
      RUNTIME_PROVENANCE_VERSION,
      startNodeId,
      chain.map(c => c.node_id).join(','),
      String(chain.length),
      String(maxDepth),
    ].join('::'))
    .digest('hex');

  return _deepFreeze({
    event_id: _nodes.get(startNodeId).event_id,
    lineage_chain: chain,
    depth: maxDepth,
    root_event: rootNode.event_id,
    terminal_events: terminals.map(t => _nodes.get(t).event_id),
    lineage_hash: lineageHash,
    readonly_runtime: true,
    execution_allowed: false,
    version: RUNTIME_PROVENANCE_VERSION,
    traced_at: new Date().toISOString(),
  });
}

// ─── snapshot ──────────────────────────────────────────────────────

/**
 * Build a deterministic platform-wide provenance snapshot.
 *
 * @returns {object} — deeply frozen snapshot
 */
export function buildProvenanceSnapshot() {
  // Node counts per layer
  const layerDist = {};
  for (const [, node] of _nodes) {
    layerDist[node.source_layer] = (layerDist[node.source_layer] || 0) + 1;
  }

  // Edge counts per relation type
  const relationDist = {};
  for (const link of _links) {
    relationDist[link.relation_type] = (relationDist[link.relation_type] || 0) + 1;
  }

  // Tenant distribution
  const tenantDist = {};
  for (const [tid, nodeIds] of _tenantNodes) {
    tenantDist[tid] = nodeIds.size;
  }

  // Lineage depth stats (approximate via max adjacency depth per root)
  let totalRoots = 0;
  for (const [, node] of _nodes) {
    const incoming = _reverseAdj.get(node.node_id) || [];
    if (incoming.length === 0) totalRoots++;
  }

  // Graph integrity
  let integrityValid = true;
  try { validateProvenanceGraph(); } catch { integrityValid = false; }

  return _deepFreeze({
    version: RUNTIME_PROVENANCE_VERSION,
    total_nodes: _nodes.size,
    total_links: _links.length,
    total_tenants: _tenantNodes.size,
    node_layer_distribution: layerDist,
    edge_relation_distribution: relationDist,
    tenant_distribution: tenantDist,
    root_node_count: totalRoots,
    graph_integrity: integrityValid,
    built_at: new Date().toISOString(),
  });
}

// ─── provenance hash ───────────────────────────────────────────────

/**
 * Deterministic SHA-256 from normalized provenance graph state.
 *
 * @returns {string}
 */
export function computeProvenanceHash() {
  const nodeIds = [..._nodes.keys()].sort().join(',');
  const edgeList = _links.map(l => `${l.from_node_id}->${l.to_node_id}`).join(',');
  const tenantIds = [..._tenantNodes.keys()].sort().join(',');
  const eventHashes = [..._nodes.values()].map(n => n.node_hash).sort().join(',');

  const hashInput = [
    RUNTIME_PROVENANCE_VERSION,
    nodeIds,
    edgeList,
    tenantIds,
    eventHashes,
    String(_nodes.size),
    String(_links.length),
  ].join('::');

  return createHash('sha256').update(hashInput).digest('hex');
}
