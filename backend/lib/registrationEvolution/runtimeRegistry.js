/**
 * Phase 4.0 — Singleton runtime coordinator registry.
 *
 * In-memory Map-based registry for tracking active signup runtime
 * coordinators. Returns immutable snapshots to prevent mutation leakage.
 *
 * SAFETY CONTRACT:
 * - In-memory only — no persistence, no DB
 * - Immutable snapshots returned — callers cannot mutate registry state
 * - Duplicate runtime_id rejected
 * - No timers, no polling, no workers, no queue consumption
 * - Never throws — every public function is wrapped in try/catch
 */

// ─── constants ─────────────────────────────────────────────────────

export const SIGNUP_RUNTIME_REGISTRY_VERSION = 'signup_runtime_registry_v1';

// ─── singleton registry ────────────────────────────────────────────

/** @type {Map<string, Record<string, unknown>>} */
const _registry = new Map();

/**
 * Get a reference descriptor for the registry (version + size).
 *
 * @returns {{ version: string, size: number }}
 */
export function getSignupRuntimeRegistry() {
  try {
    return {
      version: SIGNUP_RUNTIME_REGISTRY_VERSION,
      size: _registry.size,
    };
  } catch (_) {
    return { version: SIGNUP_RUNTIME_REGISTRY_VERSION, size: 0 };
  }
}

/**
 * Register a runtime coordinator into the registry.
 * Rejects if runtime_id already exists.
 *
 * @param {Record<string, unknown>} runtime
 * @returns {{ registered: boolean, runtime_id: string, reason: string }}
 */
export function registerSignupRuntime(runtime) {
  try {
    if (!runtime || typeof runtime !== 'object' || !runtime.runtime_id) {
      return { registered: false, runtime_id: '', reason: 'invalid_runtime' };
    }

    const id = String(runtime.runtime_id);

    if (_registry.has(id)) {
      return { registered: false, runtime_id: id, reason: 'duplicate_runtime_id' };
    }

    _registry.set(id, { ...runtime });

    return { registered: true, runtime_id: id, reason: 'ok' };
  } catch (_) {
    return { registered: false, runtime_id: '', reason: 'unexpected_error' };
  }
}

/**
 * Get an immutable snapshot of a registered runtime by ID.
 *
 * @param {string} runtimeId
 * @returns {Record<string, unknown> | null}
 */
export function getSignupRuntime(runtimeId) {
  try {
    if (!runtimeId || typeof runtimeId !== 'string') return null;
    const entry = _registry.get(runtimeId);
    if (!entry) return null;
    return { ...entry };
  } catch (_) {
    return null;
  }
}

/**
 * List all registered runtimes as immutable snapshots.
 *
 * @returns {Record<string, unknown>[]}
 */
export function listSignupRuntimes() {
  try {
    const result = [];
    for (const entry of _registry.values()) {
      result.push({ ...entry });
    }
    return result;
  } catch (_) {
    return [];
  }
}

/**
 * Remove a runtime from the registry by ID.
 *
 * @param {string} runtimeId
 * @returns {{ removed: boolean, runtime_id: string }}
 */
export function removeSignupRuntime(runtimeId) {
  try {
    if (!runtimeId || typeof runtimeId !== 'string') {
      return { removed: false, runtime_id: '' };
    }
    const existed = _registry.delete(runtimeId);
    return { removed: existed, runtime_id: runtimeId };
  } catch (_) {
    return { removed: false, runtime_id: runtimeId || '' };
  }
}

/**
 * Clear all registered runtimes.
 *
 * @returns {{ cleared: boolean, removed_count: number }}
 */
export function clearSignupRuntimeRegistry() {
  try {
    const count = _registry.size;
    _registry.clear();
    return { cleared: true, removed_count: count };
  } catch (_) {
    return { cleared: false, removed_count: 0 };
  }
}
