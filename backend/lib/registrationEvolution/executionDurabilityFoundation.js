/**
 * Phase 6.7 — Execution durability foundation.
 *
 * Introduces durability semantics without persistence. The system
 * becomes conceptually recoverable — able to reconstruct execution
 * state from lifecycle history and determine safe resume points.
 *
 * Architecture position:
 *   Phase 4 Kernel → Phase 5 → 6.1-6.6 → 6.7 Durability Foundation ◄── THIS PHASE
 *
 * SAFETY CONTRACT:
 * - No Phase 4/5/6.1-6.6 modification
 * - No DB, persistence, or file system usage
 * - No networking or distributed recovery
 * - No async recovery loops or workers
 * - No autonomous execution
 * - Deterministic — same lifecycle always produces same recovery plan
 * - Read-only analysis of lifecycle objects
 */

import { createHash } from 'crypto';
import { validateLifecycleIntegrity } from './executionLifecycleBoundary.js';

// ─── recovery state mapping ───────────────────────────────────────

const RECOVERY_NEXT_STEP = Object.freeze({
  initialized: 'gateway_pending',
  gated: 'routing_pending',
  routed: 'execution_pending',
  executing: 'commit_pending',
  committed: 'closure_pending',
  closed: 'lifecycle_complete',
});

const RECOVERY_ACTIONS = Object.freeze({
  initialized: ['validate_integrity', 'resume_gateway'],
  gated: ['validate_integrity', 'resume_routing'],
  routed: ['validate_integrity', 'resume_execution'],
  executing: ['replay_last_transition', 'validate_integrity', 'resume_commit_or_close'],
  committed: ['validate_integrity', 'resume_closure'],
  closed: [],
});

// ─── recoverability check ──────────────────────────────────────────

/**
 * Determine whether a lifecycle can be safely recovered.
 *
 * @param {{ state?: string, history?: unknown[], finalized?: boolean }} lifecycle
 * @returns {boolean}
 */
export function isLifecycleRecoverable(lifecycle) {
  if (!lifecycle || typeof lifecycle !== 'object') return false;
  if (lifecycle.finalized === true) return false;
  if (!lifecycle.state || typeof lifecycle.state !== 'string') return false;
  if (!Array.isArray(lifecycle.history) || lifecycle.history.length === 0) return false;
  if (lifecycle.state === 'closed') return false;

  try {
    validateLifecycleIntegrity(lifecycle);
    return true;
  } catch (_) {
    return false;
  }
}

// ─── recovery plan builder ─────────────────────────────────────────

/**
 * Build a recovery blueprint for a lifecycle that was interrupted.
 *
 * @param {{ execution_id?: string, state?: string, history?: Array<{ from: string | null, to: string, at: string }>, finalized?: boolean, mode?: string }} lifecycle
 * @returns {{
 *   execution_id: string,
 *   recoverable: boolean,
 *   last_known_state: string,
 *   next_step: string,
 *   recovery_actions: string[],
 *   recovery_checksum: string
 * }}
 */
export function buildExecutionRecoveryPlan(lifecycle) {
  if (!lifecycle || typeof lifecycle !== 'object') {
    return { execution_id: '', recoverable: false, last_known_state: 'unknown', next_step: 'none', recovery_actions: [], recovery_checksum: '' };
  }

  const execId = lifecycle.execution_id || '';
  const state = lifecycle.state || 'unknown';
  const recoverable = isLifecycleRecoverable(lifecycle);
  const nextStep = RECOVERY_NEXT_STEP[state] || 'unknown';
  const actions = recoverable ? [...(RECOVERY_ACTIONS[state] || [])] : ['lifecycle_not_recoverable'];
  const checksum = computeRecoveryChecksum(lifecycle);

  return {
    execution_id: execId,
    recoverable,
    last_known_state: state,
    next_step: nextStep,
    recovery_actions: actions,
    recovery_checksum: checksum,
  };
}

// ─── crash recovery simulation ─────────────────────────────────────

/**
 * Dry-run crash recovery: reconstruct lifecycle state and determine
 * safe resume point. No actual mutation.
 *
 * @param {{ execution_id?: string, state?: string, history?: Array<{ from: string | null, to: string, at: string }>, finalized?: boolean, mode?: string, scope_id?: string }} lifecycle
 * @returns {{
 *   simulated: true,
 *   execution_id: string,
 *   recoverable: boolean,
 *   reconstructed_state: string,
 *   safe_resume_point: string | null,
 *   transitions_replayed: number,
 *   integrity_valid: boolean,
 *   recovery_checksum: string
 * }}
 */
export function simulateCrashRecovery(lifecycle) {
  if (!lifecycle || typeof lifecycle !== 'object') {
    return { simulated: true, execution_id: '', recoverable: false, reconstructed_state: 'unknown', safe_resume_point: null, transitions_replayed: 0, integrity_valid: false, recovery_checksum: '' };
  }

  const history = Array.isArray(lifecycle.history) ? lifecycle.history : [];
  let reconstructedState = 'unknown';

  if (history.length > 0) {
    reconstructedState = history[history.length - 1].to || 'unknown';
  }

  let integrityValid = false;
  try {
    validateLifecycleIntegrity(lifecycle);
    integrityValid = true;
  } catch (_) { /* invalid */ }

  const recoverable = isLifecycleRecoverable(lifecycle);
  const safeResumePoint = recoverable ? (RECOVERY_NEXT_STEP[reconstructedState] || null) : null;
  const checksum = computeRecoveryChecksum(lifecycle);

  return {
    simulated: true,
    execution_id: lifecycle.execution_id || '',
    recoverable,
    reconstructed_state: reconstructedState,
    safe_resume_point: safeResumePoint,
    transitions_replayed: history.length,
    integrity_valid: integrityValid,
    recovery_checksum: checksum,
  };
}

// ─── durability integrity validation ───────────────────────────────

/**
 * Validate durability integrity: missing transitions, invalid progression,
 * commit without execution history.
 *
 * @param {{ state?: string, history?: Array<{ from: string | null, to: string }>, finalized?: boolean }} lifecycle
 * @returns {{ valid: boolean, reason: string }}
 * @throws {Error} on integrity violation
 */
export function validateDurabilityIntegrity(lifecycle) {
  if (!lifecycle || typeof lifecycle !== 'object') {
    throw new Error('durability_error: invalid lifecycle object');
  }

  validateLifecycleIntegrity(lifecycle);

  const history = lifecycle.history || [];
  const states = history.map(h => h.to);

  if (states.includes('committed') && !states.includes('executing')) {
    throw new Error('durability_error: commit found without execution in history');
  }

  if (lifecycle.finalized && lifecycle.state !== 'closed') {
    throw new Error(`durability_error: finalized lifecycle must be in 'closed' state, got '${lifecycle.state}'`);
  }

  const checksum1 = computeRecoveryChecksum(lifecycle);
  const checksum2 = computeRecoveryChecksum(lifecycle);
  if (checksum1 !== checksum2) {
    throw new Error('durability_error: recovery checksum is non-deterministic');
  }

  return { valid: true, reason: 'ok' };
}

// ─── recovery checksum ────────────────────────────────────────────

/**
 * Compute a deterministic hash of the lifecycle for recovery verification.
 *
 * @param {{ execution_id?: string, state?: string, history?: Array<{ from: string | null, to: string }> }} lifecycle
 * @returns {string} SHA-256 hex digest
 */
export function computeRecoveryChecksum(lifecycle) {
  if (!lifecycle || typeof lifecycle !== 'object') {
    return createHash('sha256').update('__empty_lifecycle__').digest('hex');
  }

  const history = Array.isArray(lifecycle.history) ? lifecycle.history : [];
  const transitions = history.map(h => `${h.from || 'null'}>${h.to}`).join('|');

  const canonical = [
    String(lifecycle.execution_id || ''),
    String(lifecycle.state || ''),
    transitions,
  ].join('::');

  return createHash('sha256').update(canonical).digest('hex');
}
