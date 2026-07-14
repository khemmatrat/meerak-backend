/**
 * Phase 4.17 — Execution scope isolation.
 *
 * Defines execution isolation domains (runtime, envelope, plan) to
 * prevent global fence collisions and prepare for distributed runtime.
 * Determines WHERE execution is allowed to exist — not HOW it executes.
 *
 * Architecture position:
 *   Journal → Replay → State Machine → Dispatcher → Runtime → Fencing → Scope ◄── THIS PHASE
 *
 * SAFETY CONTRACT:
 * - Pure data definition — no execution, no dispatch, no fencing logic
 * - No journal mutation
 * - No dispatcher modification
 * - No state machine modification
 * - No runtime execution modification
 * - No persistence — in-memory only
 * - No distributed coordination — single-node safe
 * - Deterministic — same input always produces same scope
 */

import { createHash } from 'crypto';

// ─── scope creation ────────────────────────────────────────────────

/**
 * Create an execution scope from identifying inputs.
 *
 * @param {{
 *   runtime_id?: string,
 *   envelope_id?: string,
 *   plan_id?: string
 * }} input
 * @returns {{
 *   scope_id: string,
 *   runtime_id: string,
 *   envelope_id: string,
 *   plan_id: string
 * }}
 * @throws {Error} if any required identifier is missing
 */
export function createExecutionScope(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('execution_scope_error: input must be a non-null object');
  }

  const runtimeId = input.runtime_id;
  const envelopeId = input.envelope_id;
  const planId = input.plan_id;

  if (!runtimeId || typeof runtimeId !== 'string') {
    throw new Error('execution_scope_error: runtime_id is required');
  }
  if (!envelopeId || typeof envelopeId !== 'string') {
    throw new Error('execution_scope_error: envelope_id is required');
  }
  if (!planId || typeof planId !== 'string') {
    throw new Error('execution_scope_error: plan_id is required');
  }

  const canonical = `${runtimeId}:${envelopeId}:${planId}`;
  const scopeId = `scope-${createHash('sha256').update(canonical).digest('hex').slice(0, 16)}`;

  return Object.freeze({
    scope_id: scopeId,
    runtime_id: runtimeId,
    envelope_id: envelopeId,
    plan_id: planId,
  });
}

// ─── scope key resolution ──────────────────────────────────────────

/**
 * Generate a deterministic scope key for fencing isolation.
 *
 * @param {{ runtime_id?: string, envelope_id?: string, plan_id?: string }} scope
 * @returns {string} `runtime_id:envelope_id:plan_id`
 * @throws {Error} if scope is invalid
 */
export function resolveScopeKey(scope) {
  if (!scope || typeof scope !== 'object') {
    throw new Error('execution_scope_error: scope must be a non-null object');
  }
  if (!scope.runtime_id || !scope.envelope_id || !scope.plan_id) {
    throw new Error('execution_scope_error: scope must contain runtime_id, envelope_id, and plan_id');
  }

  return `${scope.runtime_id}:${scope.envelope_id}:${scope.plan_id}`;
}

// ─── scope validation ──────────────────────────────────────────────

/**
 * Validate that a scope has all required identifiers.
 *
 * @param {{ scope_id?: string, runtime_id?: string, envelope_id?: string, plan_id?: string }} scope
 * @returns {{ valid: boolean, reason: string }}
 * @throws {Error} if any required identifier is missing
 */
export function isScopeValid(scope) {
  if (!scope || typeof scope !== 'object') {
    throw new Error('execution_scope_error: scope must be a non-null object');
  }

  if (!scope.scope_id || typeof scope.scope_id !== 'string') {
    throw new Error('execution_scope_error: scope_id is required');
  }
  if (!scope.runtime_id || typeof scope.runtime_id !== 'string') {
    throw new Error('execution_scope_error: runtime_id is required');
  }
  if (!scope.envelope_id || typeof scope.envelope_id !== 'string') {
    throw new Error('execution_scope_error: envelope_id is required');
  }
  if (!scope.plan_id || typeof scope.plan_id !== 'string') {
    throw new Error('execution_scope_error: plan_id is required');
  }

  return { valid: true, reason: 'ok' };
}

// ─── scope comparison ──────────────────────────────────────────────

/**
 * Determine whether two executions belong to the same scope domain.
 *
 * @param {{ runtime_id?: string, envelope_id?: string, plan_id?: string }} a
 * @param {{ runtime_id?: string, envelope_id?: string, plan_id?: string }} b
 * @returns {{
 *   same_scope: boolean,
 *   same_runtime: boolean,
 *   same_envelope: boolean,
 *   same_plan: boolean
 * }}
 */
export function compareScopes(a, b) {
  if (!a || typeof a !== 'object' || !b || typeof b !== 'object') {
    return { same_scope: false, same_runtime: false, same_envelope: false, same_plan: false };
  }

  const sameRuntime = Boolean(a.runtime_id && b.runtime_id && a.runtime_id === b.runtime_id);
  const sameEnvelope = Boolean(a.envelope_id && b.envelope_id && a.envelope_id === b.envelope_id);
  const samePlan = Boolean(a.plan_id && b.plan_id && a.plan_id === b.plan_id);

  return {
    same_scope: sameRuntime && sameEnvelope && samePlan,
    same_runtime: sameRuntime,
    same_envelope: sameEnvelope,
    same_plan: samePlan,
  };
}

// ─── scope hierarchy ───────────────────────────────────────────────

/**
 * Determine the isolation hierarchy of a scope.
 *
 * @param {{ runtime_id?: string, envelope_id?: string, plan_id?: string }} scope
 * @returns {{
 *   global: boolean,
 *   runtime_scoped: boolean,
 *   envelope_scoped: boolean,
 *   plan_scoped: boolean
 * }}
 */
export function getScopeHierarchy(scope) {
  if (!scope || typeof scope !== 'object') {
    return { global: true, runtime_scoped: false, envelope_scoped: false, plan_scoped: false };
  }

  const hasRuntime = Boolean(scope.runtime_id && typeof scope.runtime_id === 'string');
  const hasEnvelope = Boolean(scope.envelope_id && typeof scope.envelope_id === 'string');
  const hasPlan = Boolean(scope.plan_id && typeof scope.plan_id === 'string');

  const isGlobal = !hasRuntime && !hasEnvelope && !hasPlan;

  return {
    global: isGlobal,
    runtime_scoped: hasRuntime,
    envelope_scoped: hasEnvelope,
    plan_scoped: hasPlan,
  };
}
