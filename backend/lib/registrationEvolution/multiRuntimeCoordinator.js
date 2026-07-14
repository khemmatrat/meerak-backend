/**
 * Phase 4.19 — Multi-runtime coordination model.
 *
 * Logical coordination abstraction for multiple runtime instances.
 * Defines how runtimes perceive shared execution domains, maps scopes
 * to owning runtimes, and resolves execution ownership — all without
 * performing any actual execution or distributed communication.
 *
 * Architecture position:
 *   Journal → Replay → State Machine → Dispatcher → Runtime → Fencing → Scope → Coordinator ◄── THIS PHASE
 *
 * SAFETY CONTRACT:
 * - No execution logic — ownership mapping only
 * - No journal mutation
 * - No replay engine interaction
 * - No state machine modification
 * - No dispatcher modification
 * - No runtime execution calls
 * - No fencing changes (Phase 4.18 frozen)
 * - No networking or real distributed systems
 * - No persistence — in-memory registries only
 * - Deterministic — same scope always maps to same runtime
 */

// ─── in-memory registries ──────────────────────────────────────────

/** @type {Map<string, { runtime_id: string, node_id: string, registered_at: string }>} */
const _runtimeInstances = new Map();

/** @type {Map<string, string>} scope_id → runtime_id */
const _scopeOwnership = new Map();

// ─── runtime registration ──────────────────────────────────────────

/**
 * Register a runtime instance in the coordination registry.
 *
 * @param {{ runtime_id?: string, node_id?: string }} input
 * @returns {{ runtime_id: string, node_id: string, registered_at: string }}
 * @throws {Error} if runtime_id or node_id is missing
 */
export function registerRuntimeInstance(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('coordinator_error: input must be a non-null object');
  }
  if (!input.runtime_id || typeof input.runtime_id !== 'string') {
    throw new Error('coordinator_error: runtime_id is required');
  }
  if (!input.node_id || typeof input.node_id !== 'string') {
    throw new Error('coordinator_error: node_id is required');
  }

  const entry = Object.freeze({
    runtime_id: input.runtime_id,
    node_id: input.node_id,
    registered_at: new Date().toISOString(),
  });

  _runtimeInstances.set(input.runtime_id, entry);
  return entry;
}

// ─── runtime listing ───────────────────────────────────────────────

/**
 * Return all known runtime instances (in-memory snapshot).
 *
 * @returns {Array<{ runtime_id: string, node_id: string, registered_at: string }>}
 */
export function getActiveRuntimes() {
  return [..._runtimeInstances.values()];
}

// ─── scope-to-runtime assignment ───────────────────────────────────

/**
 * Assign ownership of a scope to a specific runtime instance.
 * If the scope is already assigned to a different runtime, throws.
 *
 * @param {{ scope_id?: string }} scope
 * @param {string} runtimeId
 * @returns {{ scope_id: string, runtime_id: string, assigned: boolean }}
 * @throws {Error} if scope_id or runtimeId is missing, or if scope is already owned by another runtime
 */
export function assignScopeToRuntime(scope, runtimeId) {
  if (!scope || typeof scope !== 'object' || !scope.scope_id || typeof scope.scope_id !== 'string') {
    throw new Error('coordinator_error: scope must contain a valid scope_id');
  }
  if (!runtimeId || typeof runtimeId !== 'string') {
    throw new Error('coordinator_error: runtimeId is required');
  }

  const existing = _scopeOwnership.get(scope.scope_id);
  if (existing && existing !== runtimeId) {
    throw new Error(`coordinator_error: scope '${scope.scope_id}' is already assigned to runtime '${existing}', cannot reassign to '${runtimeId}'`);
  }

  if (existing === runtimeId) {
    return { scope_id: scope.scope_id, runtime_id: runtimeId, assigned: false };
  }

  _scopeOwnership.set(scope.scope_id, runtimeId);
  return { scope_id: scope.scope_id, runtime_id: runtimeId, assigned: true };
}

// ─── scope ownership lookup ────────────────────────────────────────

/**
 * Return the owning runtime for a given scope_id.
 *
 * @param {string} scopeId
 * @returns {{ owned: boolean, scope_id: string, runtime_id: string | null }}
 */
export function getRuntimeForScope(scopeId) {
  if (!scopeId || typeof scopeId !== 'string') {
    return { owned: false, scope_id: '', runtime_id: null };
  }

  const runtimeId = _scopeOwnership.get(scopeId) || null;
  return { owned: runtimeId !== null, scope_id: scopeId, runtime_id: runtimeId };
}

// ─── execution ownership resolution ────────────────────────────────

/**
 * Resolve whether a runtime owns execution for a given scope + plan.
 * Deterministic — same scope always resolves to same runtime.
 *
 * @param {{ scope_id?: string }} scope
 * @param {{ plan_id?: string, runtime_id?: string }} plan
 * @returns {{
 *   owned: boolean,
 *   runtime_id: string | null,
 *   scope_id: string | null,
 *   reason: string
 * }}
 */
export function resolveExecutionOwnership(scope, plan) {
  if (!scope || typeof scope !== 'object' || !scope.scope_id) {
    return { owned: false, runtime_id: null, scope_id: null, reason: 'invalid_scope' };
  }
  if (!plan || typeof plan !== 'object') {
    return { owned: false, runtime_id: null, scope_id: scope.scope_id, reason: 'invalid_plan' };
  }

  const lookup = getRuntimeForScope(scope.scope_id);

  if (!lookup.owned) {
    return { owned: false, runtime_id: null, scope_id: scope.scope_id, reason: 'scope_unassigned' };
  }

  if (plan.runtime_id && plan.runtime_id !== lookup.runtime_id) {
    return { owned: false, runtime_id: lookup.runtime_id, scope_id: scope.scope_id, reason: 'runtime_mismatch' };
  }

  return { owned: true, runtime_id: lookup.runtime_id, scope_id: scope.scope_id, reason: 'scope_assigned_match' };
}

// ─── test-only reset ───────────────────────────────────────────────

/**
 * Clear all coordination registries. Test-only — MUST NOT be used in runtime.
 *
 * @returns {{ cleared: boolean, previous_runtimes: number, previous_assignments: number }}
 */
export function clearCoordinationState() {
  const runtimes = _runtimeInstances.size;
  const assignments = _scopeOwnership.size;
  _runtimeInstances.clear();
  _scopeOwnership.clear();
  return { cleared: true, previous_runtimes: runtimes, previous_assignments: assignments };
}
