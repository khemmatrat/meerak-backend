/**
 * Phase 4.16 → 4.18 — Scope-aware execution fencing & idempotency layer.
 *
 * Deterministic fingerprint-based duplicate detection scoped to execution
 * isolation domains. Prevents duplicate execution within the same scope
 * while allowing identical fingerprints across different scopes.
 *
 * Phase 4.18 upgrade: registry model changed from flat Set to
 * Map<scope_id, Set<fingerprint>> for multi-domain safety.
 *
 * Architecture position:
 *   Journal → Replay → State Machine → Dispatcher → Runtime → Fencing (Scoped) ◄── THIS PHASE
 *
 * SAFETY CONTRACT:
 * - No journal mutation
 * - No dispatcher modification
 * - No state machine modification
 * - No execution logic — only duplicate detection
 * - No retry logic — only classification
 * - No queue interaction
 * - No background workers or schedulers
 * - No persistence layer — in-memory registry only
 * - Deterministic — same input always produces same fingerprint
 * - Immutable registry — once registered, never removed (except test reset)
 * - Scope-isolated — no cross-scope contamination
 */

import { createHash } from 'crypto';

// ─── constants ─────────────────────────────────────────────────────

const EXECUTION_FENCING_VERSION = 'execution_fencing_v2';

const DEFAULT_SCOPE_ID = '__global__';

// ─── scoped in-memory fence registry ───────────────────────────────
// Map<scope_id, Set<fingerprint>>

const _fenceRegistry = new Map();

// ─── fingerprint generation ────────────────────────────────────────

/**
 * Generate a deterministic fingerprint from execution input.
 * Same inputs always produce the same fingerprint.
 *
 * Canonical format (Phase 4.18):
 *   scope_id|runtime_id|envelope_id|plan_id|event_type|sequence
 *
 * @param {{
 *   scope_id?: string,
 *   runtime_id?: string,
 *   envelope_id?: string,
 *   plan_id?: string,
 *   event_type?: string,
 *   current_state?: string,
 *   sequence?: number | string
 * }} input
 * @returns {string} deterministic fingerprint (SHA-256 hex)
 */
export function generateExecutionFingerprint(input) {
  if (!input || typeof input !== 'object') {
    return createHash('sha256').update('__empty__').digest('hex');
  }

  const parts = [
    String(input.scope_id || ''),
    String(input.runtime_id || ''),
    String(input.envelope_id || ''),
    String(input.plan_id || ''),
    String(input.event_type || input.current_state || ''),
    String(input.sequence ?? ''),
  ];

  const canonical = parts.join('|');
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Resolve the scope_id from input, falling back to DEFAULT_SCOPE_ID.
 *
 * @param {{ scope_id?: string }} input
 * @returns {string}
 */
function _resolveScopeId(input) {
  if (input && typeof input === 'object' && input.scope_id && typeof input.scope_id === 'string') {
    return input.scope_id;
  }
  return DEFAULT_SCOPE_ID;
}

// ─── duplicate detection ───────────────────────────────────────────

/**
 * Check whether an execution fingerprint has already been processed
 * within its scope bucket.
 *
 * @param {string} fingerprint
 * @param {string} [scopeId] — scope bucket to check (defaults to global)
 * @returns {boolean}
 */
export function isExecutionAlreadyProcessed(fingerprint, scopeId) {
  if (!fingerprint || typeof fingerprint !== 'string') {
    return false;
  }
  const sid = (scopeId && typeof scopeId === 'string') ? scopeId : DEFAULT_SCOPE_ID;
  const bucket = _fenceRegistry.get(sid);
  if (!bucket) return false;
  return bucket.has(fingerprint);
}

// ─── fingerprint registration ──────────────────────────────────────

/**
 * Register a fingerprint as processed under its scope bucket.
 * Once registered, it cannot be removed (immutable append-only).
 *
 * @param {string} fingerprint
 * @param {string} [scopeId] — scope bucket (defaults to global)
 * @returns {{ registered: boolean, fingerprint: string, scope_id: string, bucket_size: number }}
 */
export function registerExecutionFingerprint(fingerprint, scopeId) {
  const sid = (scopeId && typeof scopeId === 'string') ? scopeId : DEFAULT_SCOPE_ID;

  if (!fingerprint || typeof fingerprint !== 'string') {
    const bucket = _fenceRegistry.get(sid);
    return { registered: false, fingerprint: '', scope_id: sid, bucket_size: bucket ? bucket.size : 0 };
  }

  let bucket = _fenceRegistry.get(sid);
  if (!bucket) {
    bucket = new Set();
    _fenceRegistry.set(sid, bucket);
  }

  if (bucket.has(fingerprint)) {
    return { registered: false, fingerprint, scope_id: sid, bucket_size: bucket.size };
  }

  bucket.add(fingerprint);
  return { registered: true, fingerprint, scope_id: sid, bucket_size: bucket.size };
}

// ─── fencing validation ────────────────────────────────────────────

/**
 * Combined fencing gate: generate fingerprint → resolve scope → check
 * duplicate within scope → block or allow.
 *
 * Throws if a duplicate execution is detected within the same scope.
 * Same fingerprint in a different scope is explicitly ALLOWED.
 *
 * On success, the fingerprint is automatically registered under its
 * scope so any subsequent call with the same input + scope will be blocked.
 *
 * @param {{
 *   scope_id?: string,
 *   runtime_id?: string,
 *   envelope_id?: string,
 *   plan_id?: string,
 *   event_type?: string,
 *   current_state?: string,
 *   sequence?: number | string
 * }} input
 * @returns {{ allowed: boolean, fingerprint: string, scope_id: string, reason: string }}
 * @throws {Error} if duplicate execution is detected within the same scope
 */
export function validateExecutionFencing(input) {
  const fingerprint = generateExecutionFingerprint(input);
  const scopeId = _resolveScopeId(input);

  if (isExecutionAlreadyProcessed(fingerprint, scopeId)) {
    throw new Error(`execution_fence_violation: duplicate execution detected for fingerprint '${fingerprint}' in scope '${scopeId}'`);
  }

  registerExecutionFingerprint(fingerprint, scopeId);

  return { allowed: true, fingerprint, scope_id: scopeId, reason: 'execution_allowed' };
}

// ─── test-only reset ───────────────────────────────────────────────

/**
 * Clear the in-memory fence registry (all scopes).
 * MUST NOT be used in runtime flow — test-only.
 *
 * @returns {{ cleared: boolean, previous_scopes: number, previous_total: number }}
 */
export function clearExecutionFence() {
  let total = 0;
  for (const bucket of _fenceRegistry.values()) {
    total += bucket.size;
  }
  const scopes = _fenceRegistry.size;
  _fenceRegistry.clear();
  return { cleared: true, previous_scopes: scopes, previous_total: total };
}
