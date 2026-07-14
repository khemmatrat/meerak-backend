/**
 * Phase 8.5 — Workflow runtime orchestrator.
 *
 * Transforms static workflow definitions into deterministic runtime
 * orchestration sessions. Manages session lifecycle (create, advance,
 * pause, resume, finalize) under governance control.
 *
 * Architecture position:
 *   8.1 Contract → 8.2 Registry → 8.3 Capability → 8.4 Composition → 8.5 Runtime Orchestrator ◄── THIS PHASE
 *
 * SAFETY CONTRACT:
 * - NO real execution — orchestration state only
 * - Immutable snapshots at every transition
 * - Deterministic cursor progression
 * - No persistence, networking, or async workers
 * - Support parallel branches, replay checkpoints, resumable state
 */

import { createHash } from 'crypto';
import { validateWorkflowDefinition, buildWorkflowExecutionPlan, WORKFLOW_STEP_TYPES } from './workflowCompositionLayer.js';

// ─── constants ─────────────────────────────────────────────────────

export const WORKFLOW_RUNTIME_VERSION = 'workflow_runtime_v1';

const SESSION_STATES = Object.freeze({
  INITIALIZED: 'initialized',
  RUNNING: 'running',
  PAUSED: 'paused',
  FINALIZED: 'finalized',
});

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

// ─── runtime hash ──────────────────────────────────────────────────

/**
 * Deterministic SHA-256 from runtime session state.
 *
 * @param {object} session
 * @returns {string}
 */
export function computeWorkflowRuntimeHash(session) {
  if (!session || typeof session !== 'object') {
    return createHash('sha256').update(`${WORKFLOW_RUNTIME_VERSION}::invalid`).digest('hex');
  }

  const completedSorted = (session.completed_steps || []).slice().sort().join(',');
  const cursorSorted = (Array.isArray(session.cursor) ? session.cursor : [session.cursor || '']).slice().sort().join(',');
  const branchesSorted = (session.active_branches || []).slice().sort().join(',');

  const hashInput = [
    WORKFLOW_RUNTIME_VERSION,
    session.session_id || '',
    session.workflow_id || '',
    session.state || '',
    cursorSorted,
    completedSorted,
    branchesSorted,
    String(session.step_index || 0),
  ].join('::');

  return createHash('sha256').update(hashInput).digest('hex');
}

// ─── session creation ──────────────────────────────────────────────

/**
 * Instantiate a workflow runtime session from a workflow definition.
 *
 * @param {object} input
 * @param {object} input.workflow — frozen workflow definition (from Phase 8.4)
 * @param {string} [input.session_id_seed] — deterministic seed for session_id
 * @returns {object} — immutable initial runtime snapshot
 * @throws {Error} if workflow is invalid
 */
export function createWorkflowRuntimeSession(input) {
  if (!input || typeof input !== 'object' || !input.workflow) {
    throw new Error('workflow_runtime_error: invalid input — must provide workflow');
  }

  const workflow = input.workflow;

  // Validate workflow
  try {
    validateWorkflowDefinition(workflow);
  } catch (e) {
    throw new Error(`workflow_runtime_error: workflow validation failed — ${e.message}`);
  }

  const plan = buildWorkflowExecutionPlan(workflow);

  // Find entry steps (steps with 0 in-degree)
  const referencedAsNext = new Set();
  for (const step of workflow.steps) {
    for (const nextId of (step.next_steps || [])) {
      referencedAsNext.add(nextId);
    }
  }
  const entrySteps = workflow.steps
    .filter(s => !referencedAsNext.has(s.step_id))
    .map(s => s.step_id)
    .sort();

  if (entrySteps.length === 0) {
    throw new Error('workflow_runtime_error: no entry steps found');
  }

  const seedStr = input.session_id_seed || `${workflow.workflow_id}::${workflow.workflow_version || 'v1'}`;
  const sessionId = `wrs-${createHash('sha256').update(`${WORKFLOW_RUNTIME_VERSION}::${seedStr}`).digest('hex').slice(0, 16)}`;

  const session = {
    session_id: sessionId,
    workflow_id: workflow.workflow_id,
    workflow_version: workflow.workflow_version || 'v1',
    workflow_hash: workflow.workflow_hash,
    state: SESSION_STATES.INITIALIZED,
    cursor: entrySteps,
    completed_steps: [],
    blocked_steps: [],
    active_branches: entrySteps.length > 1 ? [...entrySteps] : [],
    replay_checkpoints: [],
    step_index: 0,
    total_steps: plan.total_steps,
    terminal_steps: plan.terminal_steps,
    _step_map: Object.fromEntries(workflow.steps.map(s => [s.step_id, { step_id: s.step_id, step_type: s.step_type, intent_type: s.intent_type, runtime_capability: s.runtime_capability, next_steps: [...(s.next_steps || [])] }])),
    created_at: new Date().toISOString(),
  };

  session.runtime_hash = computeWorkflowRuntimeHash(session);

  return _deepFreeze(session);
}

// ─── advance runtime ───────────────────────────────────────────────

/**
 * Advance the workflow runtime cursor forward by completing a step.
 *
 * @param {object} session — current runtime session (immutable)
 * @param {object} event — step completion event
 * @param {string} event.step_id — the step to complete
 * @returns {object} — new immutable session snapshot
 * @throws {Error} on invalid transition
 */
export function advanceWorkflowRuntime(session, event) {
  if (!session || typeof session !== 'object') {
    throw new Error('workflow_runtime_error: invalid session');
  }
  if (!event || !event.step_id) {
    throw new Error('workflow_runtime_error: event must include step_id');
  }
  if (session.state === SESSION_STATES.FINALIZED) {
    throw new Error('workflow_runtime_error: session is finalized — no further advancement');
  }
  if (session.state === SESSION_STATES.PAUSED) {
    throw new Error('workflow_runtime_error: session is paused — resume before advancing');
  }

  const cursor = [...(session.cursor || [])];
  if (!cursor.includes(event.step_id)) {
    throw new Error(`workflow_runtime_error: step '${event.step_id}' is not in current cursor [${cursor.join(', ')}]`);
  }

  const stepDef = session._step_map?.[event.step_id];
  if (!stepDef) {
    throw new Error(`workflow_runtime_error: unknown step '${event.step_id}'`);
  }

  const completed = [...(session.completed_steps || []), event.step_id];

  // Remove completed step from cursor, add its next_steps
  const newCursor = cursor.filter(id => id !== event.step_id);
  for (const nextId of (stepDef.next_steps || [])) {
    if (!completed.includes(nextId) && !newCursor.includes(nextId)) {
      newCursor.push(nextId);
    }
  }
  newCursor.sort();

  // Track replay checkpoints
  const replayCheckpoints = [...(session.replay_checkpoints || [])];
  if (stepDef.step_type === WORKFLOW_STEP_TYPES.REPLAY) {
    replayCheckpoints.push(event.step_id);
  }

  // Track parallel branches
  const activeBranches = newCursor.length > 1 ? [...newCursor] : [];

  // Detect if terminal reached
  const isTerminal = stepDef.step_type === WORKFLOW_STEP_TYPES.TERMINAL || (stepDef.next_steps || []).length === 0;
  const allTerminalsComplete = isTerminal && newCursor.length === 0;

  const newState = allTerminalsComplete
    ? SESSION_STATES.FINALIZED
    : SESSION_STATES.RUNNING;

  const newSession = {
    session_id: session.session_id,
    workflow_id: session.workflow_id,
    workflow_version: session.workflow_version,
    workflow_hash: session.workflow_hash,
    state: newState,
    cursor: newCursor,
    completed_steps: completed,
    blocked_steps: [...(session.blocked_steps || [])],
    active_branches: activeBranches,
    replay_checkpoints: replayCheckpoints,
    step_index: (session.step_index || 0) + 1,
    total_steps: session.total_steps,
    terminal_steps: session.terminal_steps,
    _step_map: session._step_map,
    created_at: session.created_at,
    advanced_at: new Date().toISOString(),
  };

  newSession.runtime_hash = computeWorkflowRuntimeHash(newSession);
  return _deepFreeze(newSession);
}

// ─── executable steps ──────────────────────────────────────────────

/**
 * Return currently executable steps from the session cursor.
 *
 * @param {object} session
 * @returns {Array<object>}
 */
export function getExecutableWorkflowSteps(session) {
  if (!session || !Array.isArray(session.cursor) || !session._step_map) {
    return [];
  }
  if (session.state === SESSION_STATES.FINALIZED || session.state === SESSION_STATES.PAUSED) {
    return [];
  }

  const completed = new Set(session.completed_steps || []);
  const blocked = new Set(session.blocked_steps || []);

  return session.cursor
    .filter(id => !completed.has(id) && !blocked.has(id))
    .map(id => session._step_map[id])
    .filter(Boolean)
    .sort((a, b) => a.step_id.localeCompare(b.step_id));
}

// ─── pause / resume ────────────────────────────────────────────────

/**
 * Pause a running workflow runtime session.
 *
 * @param {object} session
 * @returns {object} — new immutable paused snapshot
 * @throws {Error} if session cannot be paused
 */
export function pauseWorkflowRuntime(session) {
  if (!session || typeof session !== 'object') {
    throw new Error('workflow_runtime_error: invalid session');
  }
  if (session.state === SESSION_STATES.FINALIZED) {
    throw new Error('workflow_runtime_error: cannot pause finalized session');
  }
  if (session.state === SESSION_STATES.PAUSED) {
    return session; // already paused, return as-is
  }

  const paused = {
    ...session,
    state: SESSION_STATES.PAUSED,
    paused_at: new Date().toISOString(),
  };
  paused.runtime_hash = computeWorkflowRuntimeHash(paused);
  return _deepFreeze(paused);
}

/**
 * Resume a paused workflow runtime session.
 *
 * @param {object} session
 * @returns {object} — new immutable running snapshot
 * @throws {Error} if session cannot be resumed
 */
export function resumeWorkflowRuntime(session) {
  if (!session || typeof session !== 'object') {
    throw new Error('workflow_runtime_error: invalid session');
  }
  if (session.state === SESSION_STATES.FINALIZED) {
    throw new Error('workflow_runtime_error: cannot resume finalized session');
  }
  if (session.state !== SESSION_STATES.PAUSED) {
    return session; // not paused, return as-is
  }

  const resumed = {
    ...session,
    state: SESSION_STATES.RUNNING,
    resumed_at: new Date().toISOString(),
  };
  delete resumed.paused_at;
  resumed.runtime_hash = computeWorkflowRuntimeHash(resumed);
  return _deepFreeze(resumed);
}

// ─── finalization ──────────────────────────────────────────────────

/**
 * Finalize a workflow runtime session.
 * Only succeeds if all terminal steps are reachable/completed
 * or the cursor is empty.
 *
 * @param {object} session
 * @returns {object} — immutable finalized snapshot
 * @throws {Error} if finalization is not possible
 */
export function finalizeWorkflowRuntime(session) {
  if (!session || typeof session !== 'object') {
    throw new Error('workflow_runtime_error: invalid session');
  }
  if (session.state === SESSION_STATES.FINALIZED) {
    return session;
  }

  const completed = new Set(session.completed_steps || []);
  const terminals = session.terminal_steps || [];

  const hasTerminalCompleted = terminals.some(t => completed.has(t));
  const cursorEmpty = (session.cursor || []).length === 0;

  if (!hasTerminalCompleted && !cursorEmpty) {
    throw new Error('workflow_runtime_error: cannot finalize — no terminal step completed and cursor not empty');
  }

  const finalized = {
    ...session,
    state: SESSION_STATES.FINALIZED,
    cursor: [],
    active_branches: [],
    finalized_at: new Date().toISOString(),
  };
  finalized.runtime_hash = computeWorkflowRuntimeHash(finalized);
  return _deepFreeze(finalized);
}

// ─── integrity validation ──────────────────────────────────────────

/**
 * Validate workflow runtime session integrity.
 *
 * @param {object} session
 * @returns {{ valid: true, checks: string[] }}
 * @throws {Error} on any integrity violation
 */
export function validateWorkflowRuntimeIntegrity(session) {
  if (!session || typeof session !== 'object') {
    throw new Error('workflow_runtime_error: invalid session');
  }

  const checks = [];

  // Session ID
  if (!session.session_id || typeof session.session_id !== 'string') {
    throw new Error('workflow_runtime_error: integrity — missing session_id');
  }
  checks.push('session_id_present');

  // State validity
  const validStates = Object.values(SESSION_STATES);
  if (!validStates.includes(session.state)) {
    throw new Error(`workflow_runtime_error: integrity — invalid state '${session.state}'`);
  }
  checks.push('state_valid');

  // Cursor consistency
  if (!Array.isArray(session.cursor)) {
    throw new Error('workflow_runtime_error: integrity — cursor must be array');
  }
  checks.push('cursor_array');

  // Completed steps must not overlap with cursor
  const completedSet = new Set(session.completed_steps || []);
  for (const cursorId of session.cursor) {
    if (completedSet.has(cursorId)) {
      throw new Error(`workflow_runtime_error: integrity — step '${cursorId}' in both cursor and completed`);
    }
  }
  checks.push('no_cursor_completed_overlap');

  // Replay checkpoints must be in completed
  for (const rp of (session.replay_checkpoints || [])) {
    if (!completedSet.has(rp)) {
      throw new Error(`workflow_runtime_error: integrity — replay checkpoint '${rp}' not in completed steps`);
    }
  }
  checks.push('replay_checkpoints_valid');

  // Step index consistency
  if (typeof session.step_index !== 'number' || session.step_index < 0) {
    throw new Error('workflow_runtime_error: integrity — invalid step_index');
  }
  if (session.step_index !== (session.completed_steps || []).length) {
    throw new Error('workflow_runtime_error: integrity — step_index does not match completed_steps count');
  }
  checks.push('step_index_consistent');

  // Hash reproducibility
  const recomputed = computeWorkflowRuntimeHash(session);
  if (session.runtime_hash && recomputed !== session.runtime_hash) {
    throw new Error('workflow_runtime_error: integrity — runtime_hash mismatch');
  }
  checks.push('hash_reproducible');

  // Finalized state constraints
  if (session.state === SESSION_STATES.FINALIZED) {
    if (session.cursor.length > 0) {
      throw new Error('workflow_runtime_error: integrity — finalized session has non-empty cursor');
    }
    checks.push('finalized_cursor_empty');
  }

  return { valid: true, checks };
}
