/**
 * Phase 5.2 — Execution routing model.
 *
 * Deterministic routing layer that resolves execution requests to
 * target nodes using Phase 5.1 partitioning results. Decides WHERE
 * execution should go — never executes, never sends network calls.
 *
 * Architecture position:
 *   Phase 4 Kernel → Phase 5.1 Partitioning → Phase 5.2 Routing ◄── THIS PHASE
 *
 * SAFETY CONTRACT:
 * - No Phase 4 kernel modification
 * - No execution logic
 * - No networking or message passing
 * - No distributed calls
 * - No workers or schedulers
 * - No external state persistence
 * - Deterministic — same input always produces same route
 * - Pure decision layer — no side effects
 */

import { assignScopeToNode } from './executionPartitioner.js';

// ─── route resolution ──────────────────────────────────────────────

/**
 * Resolve the execution route for a scope to a target node.
 *
 * @param {{
 *   scope?: { scope_id?: string },
 *   runtime_id?: string,
 *   available_nodes?: Array<{ node_id: string }>
 * }} input
 * @returns {{
 *   scope_id: string,
 *   target_node_id: string | null,
 *   route_strategy: string,
 *   reason: string
 * }}
 */
export function resolveExecutionRoute(input) {
  if (!input || typeof input !== 'object') {
    return { scope_id: '', target_node_id: null, route_strategy: 'none', reason: 'invalid_input' };
  }

  const scope = input.scope;
  if (!scope || typeof scope !== 'object' || !scope.scope_id) {
    return { scope_id: '', target_node_id: null, route_strategy: 'none', reason: 'missing_scope' };
  }

  const nodes = input.available_nodes;
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return { scope_id: scope.scope_id, target_node_id: null, route_strategy: 'none', reason: 'no_available_nodes' };
  }

  try {
    const assignment = assignScopeToNode(scope, nodes);
    return {
      scope_id: scope.scope_id,
      target_node_id: assignment.node_id,
      route_strategy: 'deterministic_partition',
      reason: 'partition_mapping_match',
    };
  } catch (e) {
    return { scope_id: scope.scope_id, target_node_id: null, route_strategy: 'none', reason: e.message };
  }
}

// ─── routing table ─────────────────────────────────────────────────

/**
 * Build a deterministic routing table mapping scopes to nodes.
 *
 * @param {Array<{ node_id: string }>} nodes
 * @param {Array<{ scope_id: string }>} scopes
 * @returns {Map<string, string>} scope_id → node_id
 */
export function buildRoutingTable(nodes, scopes) {
  const table = new Map();

  if (!Array.isArray(nodes) || nodes.length === 0 || !Array.isArray(scopes)) {
    return table;
  }

  for (const scope of scopes) {
    if (!scope || !scope.scope_id) continue;
    try {
      const assignment = assignScopeToNode(scope, nodes);
      table.set(scope.scope_id, assignment.node_id);
    } catch (_) { /* skip invalid */ }
  }

  return table;
}

// ─── route validation ──────────────────────────────────────────────

/**
 * Validate a routing decision. Ensures node exists, is in the active
 * list, and scope mapping is consistent.
 *
 * @param {{
 *   scope_id?: string,
 *   target_node_id?: string | null,
 *   route_strategy?: string
 * }} route
 * @param {Array<{ node_id: string }>} [activeNodes]
 * @returns {{ valid: boolean, reason: string }}
 * @throws {Error} if route is invalid
 */
export function validateRoutingDecision(route, activeNodes) {
  if (!route || typeof route !== 'object') {
    throw new Error('routing_error: invalid route object');
  }
  if (!route.scope_id || typeof route.scope_id !== 'string') {
    throw new Error('routing_error: route missing scope_id');
  }
  if (!route.target_node_id || typeof route.target_node_id !== 'string') {
    throw new Error('routing_error: invalid route target');
  }

  if (Array.isArray(activeNodes) && activeNodes.length > 0) {
    const nodeExists = activeNodes.some(n => n.node_id === route.target_node_id);
    if (!nodeExists) {
      throw new Error(`routing_error: target node '${route.target_node_id}' not in active node list`);
    }
  }

  return { valid: true, reason: 'ok' };
}

// ─── routing simulation ────────────────────────────────────────────

/**
 * Dry-run routing: returns where execution WOULD go without executing.
 *
 * @param {{
 *   scope?: { scope_id?: string },
 *   available_nodes?: Array<{ node_id: string }>
 * }} input
 * @returns {{
 *   simulated: true,
 *   scope_id: string,
 *   target_node_id: string | null,
 *   route_strategy: string,
 *   reason: string,
 *   valid: boolean
 * }}
 */
export function simulateRouting(input) {
  const route = resolveExecutionRoute(input);

  let valid = false;
  if (route.target_node_id) {
    try {
      validateRoutingDecision(route, input?.available_nodes);
      valid = true;
    } catch (_) { /* invalid */ }
  }

  return {
    simulated: true,
    scope_id: route.scope_id,
    target_node_id: route.target_node_id,
    route_strategy: route.route_strategy,
    reason: route.reason,
    valid,
  };
}

// ─── routing statistics ────────────────────────────────────────────

/**
 * Compute routing distribution statistics across nodes and scopes.
 *
 * @param {Array<{ node_id: string }>} nodes
 * @param {Array<{ scope_id: string }>} scopes
 * @returns {{
 *   total_nodes: number,
 *   routed_scopes: number,
 *   unrouted_scopes: number,
 *   distribution: Record<string, number>
 * }}
 */
export function getRoutingStats(nodes, scopes) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return { total_nodes: 0, routed_scopes: 0, unrouted_scopes: Array.isArray(scopes) ? scopes.length : 0, distribution: {} };
  }

  const distribution = {};
  for (const n of nodes) {
    if (n && n.node_id) distribution[n.node_id] = 0;
  }

  let routed = 0;
  let unrouted = 0;

  if (Array.isArray(scopes)) {
    for (const scope of scopes) {
      if (!scope || !scope.scope_id) { unrouted++; continue; }
      try {
        const assignment = assignScopeToNode(scope, nodes);
        if (distribution[assignment.node_id] !== undefined) {
          distribution[assignment.node_id]++;
        }
        routed++;
      } catch (_) {
        unrouted++;
      }
    }
  }

  return { total_nodes: nodes.length, routed_scopes: routed, unrouted_scopes: unrouted, distribution };
}
