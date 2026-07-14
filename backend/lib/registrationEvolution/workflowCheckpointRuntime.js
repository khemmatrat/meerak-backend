/**
 * Phase 8.6 — Workflow checkpoint & recovery runtime.
 *
 * Deterministic workflow durability semantics with recoverable
 * orchestration checkpoints and resumable execution lineage.
 * Transforms runtime orchestration into a recoverable system
 * capable of deterministic continuation after interruption.
 *
 * Architecture position:
 *   8.4 Composition → 8.5 Runtime Orchestrator → 8.6 Checkpoint & Recovery ◄── THIS PHASE
 *
 * SAFETY CONTRACT:
 * - NO persistence or storage engine
 * - NO networking or real replay execution
 * - Immutable snapshots only
 * - Deterministic restoration and hashing
 * - Resumable orchestration continuity
 * - Lineage-safe recovery model
 */

import { createHash } from 'crypto';
import { computeWorkflowRuntimeHash, validateWorkflowRuntimeIntegrity } from './workflowRuntimeOrchestrator.js';

// ─── constants ─────────────────────────────────────────────────────

export const WORKFLOW_CHECKPOINT_VERSION = 'workflow_checkpoint_v1';

// ─── deep freeze ───────────────────────────────────────────────────

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

// ─── checkpoint hash ───────────────────────────────────────────────

/**
 * Deterministic SHA-256 from normalized checkpoint state.
 *
 * @param {object} checkpoint
 * @returns {string}
 */
export function computeWorkflowCheckpointHash(checkpoint) {
  if (!checkpoint || typeof checkpoint !== 'object') {
    return createHash('sha256').update(`${WORKFLOW_CHECKPOINT_VERSION}::invalid`).digest('hex');
  }

  const cursorSorted = (checkpoint.cursor || []).slice().sort().join(',');
  const completedSorted = (checkpoint.completed_steps || []).slice().sort().join(',');
  const replaySorted = (checkpoint.replay_checkpoints || []).slice().sort().join(',');
  const branchesSorted = (checkpoint.active_branches || []).slice().sort().join(',');

  const hashInput = [
    WORKFLOW_CHECKPOINT_VERSION,
    checkpoint.session_id || '',
    checkpoint.workflow_id || '',
    checkpoint.state || '',
    cursorSorted,
    completedSorted,
    replaySorted,
    branchesSorted,
    String(checkpoint.step_index ?? 0),
    checkpoint.session_runtime_hash || '',
  ].join('::');

  return createHash('sha256').update(hashInput).digest('hex');
}

// ─── checkpoint creation ───────────────────────────────────────────

/**
 * Create an immutable checkpoint snapshot from a runtime session.
 *
 * @param {object} session — workflow runtime session (from Phase 8.5)
 * @returns {object} — deeply frozen checkpoint
 * @throws {Error} if session is invalid
 */
export function createWorkflowCheckpoint(session) {
  if (!session || typeof session !== 'object') {
    throw new Error('workflow_checkpoint_error: invalid session');
  }
  if (!session.session_id || !session.workflow_id) {
    throw new Error('workflow_checkpoint_error: session missing required identifiers');
  }

  const sessionHash = computeWorkflowRuntimeHash(session);

  const checkpoint = {
    checkpoint_id: `wcp-${createHash('sha256').update(`${WORKFLOW_CHECKPOINT_VERSION}::${session.session_id}::${sessionHash}`).digest('hex').slice(0, 16)}`,
    checkpoint_version: WORKFLOW_CHECKPOINT_VERSION,
    session_id: session.session_id,
    workflow_id: session.workflow_id,
    workflow_version: session.workflow_version || 'v1',
    workflow_hash: session.workflow_hash || '',
    state: session.state,
    cursor: [...(session.cursor || [])],
    completed_steps: [...(session.completed_steps || [])],
    blocked_steps: [...(session.blocked_steps || [])],
    active_branches: [...(session.active_branches || [])],
    replay_checkpoints: [...(session.replay_checkpoints || [])],
    step_index: session.step_index ?? 0,
    total_steps: session.total_steps ?? 0,
    terminal_steps: [...(session.terminal_steps || [])],
    _step_map: session._step_map ? { ...session._step_map } : {},
    session_runtime_hash: sessionHash,
    created_at: new Date().toISOString(),
  };

  checkpoint.checkpoint_hash = computeWorkflowCheckpointHash(checkpoint);

  return _deepFreeze(checkpoint);
}

// ─── checkpoint restoration ────────────────────────────────────────

/**
 * Reconstruct a runtime session snapshot from a checkpoint.
 * Preserves orchestration integrity, replay checkpoints, and branches.
 *
 * @param {object} checkpoint
 * @returns {object} — deeply frozen session snapshot
 * @throws {Error} if checkpoint is invalid
 */
export function restoreWorkflowCheckpoint(checkpoint) {
  if (!checkpoint || typeof checkpoint !== 'object') {
    throw new Error('workflow_checkpoint_error: invalid checkpoint');
  }
  if (!checkpoint.session_id || !checkpoint.workflow_id) {
    throw new Error('workflow_checkpoint_error: checkpoint missing required identifiers');
  }

  // Verify checkpoint integrity before restoration
  const recomputedHash = computeWorkflowCheckpointHash(checkpoint);
  if (checkpoint.checkpoint_hash && recomputedHash !== checkpoint.checkpoint_hash) {
    throw new Error('workflow_checkpoint_error: checkpoint hash mismatch — data may be corrupted');
  }

  const restoredSession = {
    session_id: checkpoint.session_id,
    workflow_id: checkpoint.workflow_id,
    workflow_version: checkpoint.workflow_version || 'v1',
    workflow_hash: checkpoint.workflow_hash || '',
    state: checkpoint.state,
    cursor: [...(checkpoint.cursor || [])],
    completed_steps: [...(checkpoint.completed_steps || [])],
    blocked_steps: [...(checkpoint.blocked_steps || [])],
    active_branches: [...(checkpoint.active_branches || [])],
    replay_checkpoints: [...(checkpoint.replay_checkpoints || [])],
    step_index: checkpoint.step_index ?? 0,
    total_steps: checkpoint.total_steps ?? 0,
    terminal_steps: [...(checkpoint.terminal_steps || [])],
    _step_map: checkpoint._step_map ? { ...checkpoint._step_map } : {},
    created_at: checkpoint.created_at,
    restored_at: new Date().toISOString(),
    restored_from_checkpoint: checkpoint.checkpoint_id,
  };

  restoredSession.runtime_hash = computeWorkflowRuntimeHash(restoredSession);

  return _deepFreeze(restoredSession);
}

// ─── recovery plan ─────────────────────────────────────────────────

/**
 * Determine safe resume points and build a recovery plan.
 *
 * @param {object} session — workflow runtime session
 * @returns {{
 *   session_id: string,
 *   recoverable: boolean,
 *   safe_resume_points: string[],
 *   pending_steps: string[],
 *   completed_steps: string[],
 *   recovery_actions: Array<{ action: string, step_id: string, reason: string }>,
 *   replay_guidance: Array<{ checkpoint: string, action: string }>,
 *   recovery_hash: string,
 *   built_at: string
 * }}
 */
export function buildWorkflowRecoveryPlan(session) {
  if (!session || typeof session !== 'object') {
    return { session_id: 'unknown', recoverable: false, safe_resume_points: [], pending_steps: [], completed_steps: [], recovery_actions: [], replay_guidance: [], recovery_hash: '', built_at: new Date().toISOString() };
  }

  const completed = new Set(session.completed_steps || []);
  const cursor = session.cursor || [];
  const replayCheckpoints = session.replay_checkpoints || [];
  const terminals = session.terminal_steps || [];
  const stepMap = session._step_map || {};

  // Safe resume points = current cursor items
  const safeResumePoints = cursor.filter(id => !completed.has(id)).sort();

  // Pending steps = all steps not yet completed
  const allStepIds = Object.keys(stepMap).sort();
  const pendingSteps = allStepIds.filter(id => !completed.has(id));

  // Recovery actions
  const recoveryActions = [];
  for (const stepId of safeResumePoints) {
    const step = stepMap[stepId];
    if (step) {
      recoveryActions.push({ action: 'resume_step', step_id: stepId, reason: `step in cursor — ${step.step_type} type` });
    }
  }

  // If no cursor and not finalized, suggest replay from last checkpoint
  if (safeResumePoints.length === 0 && session.state !== 'finalized') {
    if (replayCheckpoints.length > 0) {
      const lastCheckpoint = replayCheckpoints[replayCheckpoints.length - 1];
      recoveryActions.push({ action: 'replay_from_checkpoint', step_id: lastCheckpoint, reason: 'no cursor — replay from last checkpoint' });
    } else {
      recoveryActions.push({ action: 'restart_required', step_id: '', reason: 'no cursor and no replay checkpoints' });
    }
  }

  // Replay guidance
  const replayGuidance = replayCheckpoints.map(cp => ({
    checkpoint: cp,
    action: completed.has(cp) ? 'replay_available' : 'checkpoint_pending',
  }));

  // Recoverability check
  const recoverable = session.state !== 'finalized' && (safeResumePoints.length > 0 || replayCheckpoints.length > 0);

  const recoveryHash = createHash('sha256')
    .update(`${WORKFLOW_CHECKPOINT_VERSION}::${session.session_id || ''}::${safeResumePoints.join(',')}::${pendingSteps.join(',')}`)
    .digest('hex');

  return {
    session_id: session.session_id || 'unknown',
    recoverable,
    safe_resume_points: safeResumePoints,
    pending_steps: pendingSteps,
    completed_steps: [...(session.completed_steps || [])],
    recovery_actions: recoveryActions,
    replay_guidance: replayGuidance,
    recovery_hash: recoveryHash,
    built_at: new Date().toISOString(),
  };
}

// ─── checkpoint validation ─────────────────────────────────────────

/**
 * Validate checkpoint reproducibility, hash consistency, and lineage.
 *
 * @param {object} checkpoint
 * @returns {{ valid: true, checks: string[] }}
 * @throws {Error} on any integrity violation
 */
export function validateWorkflowCheckpoint(checkpoint) {
  if (!checkpoint || typeof checkpoint !== 'object') {
    throw new Error('workflow_checkpoint_error: invalid checkpoint');
  }

  const checks = [];

  if (!checkpoint.checkpoint_id || typeof checkpoint.checkpoint_id !== 'string') {
    throw new Error('workflow_checkpoint_error: missing checkpoint_id');
  }
  checks.push('checkpoint_id_present');

  if (!checkpoint.session_id || typeof checkpoint.session_id !== 'string') {
    throw new Error('workflow_checkpoint_error: missing session_id');
  }
  checks.push('session_id_present');

  if (!checkpoint.workflow_id || typeof checkpoint.workflow_id !== 'string') {
    throw new Error('workflow_checkpoint_error: missing workflow_id');
  }
  checks.push('workflow_id_present');

  if (!Array.isArray(checkpoint.cursor)) {
    throw new Error('workflow_checkpoint_error: cursor must be array');
  }
  checks.push('cursor_valid');

  if (!Array.isArray(checkpoint.completed_steps)) {
    throw new Error('workflow_checkpoint_error: completed_steps must be array');
  }
  checks.push('completed_steps_valid');

  // Hash reproducibility
  if (checkpoint.checkpoint_hash) {
    const recomputed = computeWorkflowCheckpointHash(checkpoint);
    if (recomputed !== checkpoint.checkpoint_hash) {
      throw new Error('workflow_checkpoint_error: checkpoint_hash mismatch — not reproducible');
    }
  }
  checks.push('hash_reproducible');

  // Session runtime hash consistency
  if (checkpoint.session_runtime_hash && typeof checkpoint.session_runtime_hash !== 'string') {
    throw new Error('workflow_checkpoint_error: invalid session_runtime_hash');
  }
  checks.push('session_hash_valid');

  // No cursor-completed overlap
  const completedSet = new Set(checkpoint.completed_steps);
  for (const c of checkpoint.cursor) {
    if (completedSet.has(c)) {
      throw new Error(`workflow_checkpoint_error: step '${c}' in both cursor and completed`);
    }
  }
  checks.push('no_cursor_completed_overlap');

  return { valid: true, checks };
}

// ─── checkpoint comparison ─────────────────────────────────────────

/**
 * Detect drift between two checkpoints.
 *
 * @param {object} a
 * @param {object} b
 * @returns {{
 *   identical: boolean,
 *   hash_match: boolean,
 *   cursor_match: boolean,
 *   completed_match: boolean,
 *   replay_match: boolean,
 *   divergence_fields: string[]
 * }}
 */
export function compareWorkflowCheckpoints(a, b) {
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') {
    return { identical: false, hash_match: false, cursor_match: false, completed_match: false, replay_match: false, divergence_fields: ['invalid_input'] };
  }

  const divergence = [];

  const hashMatch = a.checkpoint_hash === b.checkpoint_hash;
  if (!hashMatch) divergence.push('checkpoint_hash');

  const cursorA = (a.cursor || []).slice().sort().join(',');
  const cursorB = (b.cursor || []).slice().sort().join(',');
  const cursorMatch = cursorA === cursorB;
  if (!cursorMatch) divergence.push('cursor');

  const compA = (a.completed_steps || []).slice().sort().join(',');
  const compB = (b.completed_steps || []).slice().sort().join(',');
  const completedMatch = compA === compB;
  if (!completedMatch) divergence.push('completed_steps');

  const replayA = (a.replay_checkpoints || []).slice().sort().join(',');
  const replayB = (b.replay_checkpoints || []).slice().sort().join(',');
  const replayMatch = replayA === replayB;
  if (!replayMatch) divergence.push('replay_checkpoints');

  if (a.state !== b.state) divergence.push('state');
  if (a.step_index !== b.step_index) divergence.push('step_index');
  if (a.session_id !== b.session_id) divergence.push('session_id');

  return {
    identical: divergence.length === 0,
    hash_match: hashMatch,
    cursor_match: cursorMatch,
    completed_match: completedMatch,
    replay_match: replayMatch,
    divergence_fields: divergence,
  };
}

// ─── recoverability check ──────────────────────────────────────────

/**
 * Check if a session is recoverable from a checkpoint.
 * True only if checkpoint-safe and integrity-valid.
 *
 * @param {object} session
 * @returns {boolean}
 */
export function isWorkflowRecoverable(session) {
  if (!session || typeof session !== 'object') return false;
  if (session.state === 'finalized') return false;

  try {
    validateWorkflowRuntimeIntegrity(session);
  } catch {
    return false;
  }

  try {
    const checkpoint = createWorkflowCheckpoint(session);
    validateWorkflowCheckpoint(checkpoint);
  } catch {
    return false;
  }

  return true;
}
