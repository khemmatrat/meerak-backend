/**
 * Phase 6.6 — Execution lifecycle & commit boundary.
 *
 * Execution is no longer just "run and finish" — it becomes a tracked
 * lifecycle object with deterministic state transitions and a strict
 * commit boundary.
 *
 * Lifecycle:  initialized → gated → routed → executing → committed → closed
 *
 * Architecture position:
 *   Phase 4 Kernel → Phase 5 → 6.1-6.5 → 6.6 Lifecycle Boundary ◄── THIS PHASE
 *
 * SAFETY CONTRACT:
 * - No Phase 4/5/6.1-6.5 modification
 * - No persistence or DB writes
 * - No async loops or workers
 * - No distributed calls or networking
 * - No autonomous execution
 * - Deterministic — same input always produces same lifecycle
 * - Immutable after finalization
 */

// ─── lifecycle states ──────────────────────────────────────────────

const LIFECYCLE_STATES = Object.freeze({
  INITIALIZED: 'initialized',
  GATED: 'gated',
  ROUTED: 'routed',
  EXECUTING: 'executing',
  COMMITTED: 'committed',
  CLOSED: 'closed',
});

const LIFECYCLE_TRANSITION_MAP = Object.freeze({
  [LIFECYCLE_STATES.INITIALIZED]: [LIFECYCLE_STATES.GATED],
  [LIFECYCLE_STATES.GATED]: [LIFECYCLE_STATES.ROUTED],
  [LIFECYCLE_STATES.ROUTED]: [LIFECYCLE_STATES.EXECUTING],
  [LIFECYCLE_STATES.EXECUTING]: [LIFECYCLE_STATES.COMMITTED, LIFECYCLE_STATES.CLOSED],
  [LIFECYCLE_STATES.COMMITTED]: [LIFECYCLE_STATES.CLOSED],
  [LIFECYCLE_STATES.CLOSED]: [],
});

const STAGE_LABELS = Object.freeze({
  [LIFECYCLE_STATES.INITIALIZED]: 'gateway_pending',
  [LIFECYCLE_STATES.GATED]: 'routing_pending',
  [LIFECYCLE_STATES.ROUTED]: 'execution_pending',
  [LIFECYCLE_STATES.EXECUTING]: 'commit_pending',
  [LIFECYCLE_STATES.COMMITTED]: 'closure_pending',
  [LIFECYCLE_STATES.CLOSED]: 'lifecycle_complete',
});

let _lifecycleSeq = 0;

// ─── lifecycle creation ────────────────────────────────────────────

/**
 * Create a new execution lifecycle object in initialized state.
 *
 * @param {{
 *   execution_id?: string,
 *   scope_id?: string,
 *   mode?: string
 * }} input
 * @returns {{
 *   execution_id: string,
 *   scope_id: string,
 *   mode: string,
 *   state: string,
 *   stage: string,
 *   history: Array<{ from: string | null, to: string, at: string }>,
 *   finalized: boolean,
 *   created_at: string
 * }}
 */
export function createExecutionLifecycle(input) {
  const safeInput = (input && typeof input === 'object') ? input : {};
  const ts = new Date().toISOString();

  return {
    execution_id: safeInput.execution_id || `lc-${Date.now()}-${++_lifecycleSeq}`,
    scope_id: safeInput.scope_id || '',
    mode: safeInput.mode || 'strict',
    state: LIFECYCLE_STATES.INITIALIZED,
    stage: STAGE_LABELS[LIFECYCLE_STATES.INITIALIZED],
    history: [{ from: null, to: LIFECYCLE_STATES.INITIALIZED, at: ts }],
    finalized: false,
    created_at: ts,
  };
}

// ─── lifecycle transition ──────────────────────────────────────────

/**
 * Deterministic state transition for a lifecycle object.
 * Returns a NEW lifecycle object — never mutates the original.
 *
 * @param {{
 *   execution_id: string,
 *   state: string,
 *   stage: string,
 *   history: Array<{ from: string | null, to: string, at: string }>,
 *   finalized: boolean,
 *   [key: string]: unknown
 * }} lifecycle
 * @param {string} event — target state
 * @returns {typeof lifecycle}
 * @throws {Error} on invalid transition or finalized lifecycle
 */
export function transitionExecutionLifecycle(lifecycle, event) {
  if (!lifecycle || typeof lifecycle !== 'object') {
    throw new Error('lifecycle_error: invalid lifecycle object');
  }
  if (!event || typeof event !== 'string') {
    throw new Error('lifecycle_error: invalid event');
  }
  if (lifecycle.finalized) {
    throw new Error(`lifecycle_error: lifecycle '${lifecycle.execution_id}' is finalized — no further transitions allowed`);
  }

  const current = lifecycle.state;
  const allowed = LIFECYCLE_TRANSITION_MAP[current];

  if (!allowed) {
    throw new Error(`lifecycle_error: unknown state '${current}'`);
  }
  if (!allowed.includes(event)) {
    throw new Error(`lifecycle_error: transition '${current}' → '${event}' is not allowed. Allowed: [${allowed.join(', ')}]`);
  }

  const ts = new Date().toISOString();
  const newHistory = [...lifecycle.history, { from: current, to: event, at: ts }];
  const isFinal = event === LIFECYCLE_STATES.CLOSED;

  return {
    ...lifecycle,
    state: event,
    stage: STAGE_LABELS[event] || event,
    history: newHistory,
    finalized: isFinal,
  };
}

// ─── lifecycle state snapshot ──────────────────────────────────────

/**
 * Return current state snapshot of a lifecycle.
 *
 * @param {{ execution_id?: string, state?: string, stage?: string, history?: unknown[], finalized?: boolean, mode?: string }} lifecycle
 * @returns {{
 *   execution_id: string,
 *   state: string,
 *   stage: string,
 *   transitions_count: number,
 *   finalized: boolean,
 *   mode: string
 * }}
 */
export function getExecutionLifecycleState(lifecycle) {
  if (!lifecycle || typeof lifecycle !== 'object') {
    return { execution_id: '', state: 'unknown', stage: 'unknown', transitions_count: 0, finalized: false, mode: 'unknown' };
  }

  return {
    execution_id: lifecycle.execution_id || '',
    state: lifecycle.state || 'unknown',
    stage: lifecycle.stage || 'unknown',
    transitions_count: Array.isArray(lifecycle.history) ? lifecycle.history.length : 0,
    finalized: lifecycle.finalized || false,
    mode: lifecycle.mode || 'unknown',
  };
}

// ─── lifecycle finalization ────────────────────────────────────────

/**
 * Hard commit boundary — finalize a lifecycle. Only controlled mode
 * may commit; all modes may close.
 *
 * @param {{ state: string, mode?: string, finalized?: boolean, [key: string]: unknown }} lifecycle
 * @param {{ commit?: boolean }} [options]
 * @returns {typeof lifecycle}
 * @throws {Error} if commit in non-controlled mode or invalid state
 */
export function finalizeExecutionLifecycle(lifecycle, options) {
  if (!lifecycle || typeof lifecycle !== 'object') {
    throw new Error('lifecycle_error: invalid lifecycle object');
  }
  if (lifecycle.finalized) {
    throw new Error(`lifecycle_error: lifecycle '${lifecycle.execution_id}' is already finalized`);
  }

  const wantsCommit = options && options.commit === true;

  if (wantsCommit) {
    if (lifecycle.mode !== 'controlled') {
      throw new Error(`lifecycle_error: commit not allowed in mode '${lifecycle.mode}' — only 'controlled' mode permits commits`);
    }
    if (lifecycle.state !== LIFECYCLE_STATES.EXECUTING) {
      throw new Error(`lifecycle_error: commit requires state 'executing', current is '${lifecycle.state}'`);
    }

    const committed = transitionExecutionLifecycle(lifecycle, LIFECYCLE_STATES.COMMITTED);
    return transitionExecutionLifecycle(committed, LIFECYCLE_STATES.CLOSED);
  }

  if (lifecycle.state === LIFECYCLE_STATES.CLOSED) {
    throw new Error('lifecycle_error: lifecycle is already closed');
  }

  if (lifecycle.state === LIFECYCLE_STATES.EXECUTING || lifecycle.state === LIFECYCLE_STATES.COMMITTED) {
    if (lifecycle.state === LIFECYCLE_STATES.EXECUTING) {
      return transitionExecutionLifecycle(lifecycle, LIFECYCLE_STATES.CLOSED);
    }
    return transitionExecutionLifecycle(lifecycle, LIFECYCLE_STATES.CLOSED);
  }

  throw new Error(`lifecycle_error: cannot finalize from state '${lifecycle.state}' — must be in 'executing' or 'committed'`);
}

// ─── lifecycle integrity validation ────────────────────────────────

/**
 * Validate lifecycle integrity. Throws on:
 * - Invalid state transition in history
 * - Missing stage history
 * - Commit without execution
 *
 * @param {{ state?: string, history?: Array<{ from: string | null, to: string }>, finalized?: boolean }} lifecycle
 * @returns {{ valid: boolean, reason: string, transitions_validated: number }}
 * @throws {Error} on integrity violation
 */
export function validateLifecycleIntegrity(lifecycle) {
  if (!lifecycle || typeof lifecycle !== 'object') {
    throw new Error('lifecycle_integrity_error: invalid lifecycle object');
  }

  const history = lifecycle.history;
  if (!Array.isArray(history) || history.length === 0) {
    throw new Error('lifecycle_integrity_error: missing stage history');
  }

  if (history[0].to !== LIFECYCLE_STATES.INITIALIZED) {
    throw new Error(`lifecycle_integrity_error: first transition must be to '${LIFECYCLE_STATES.INITIALIZED}', got '${history[0].to}'`);
  }

  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1].to;
    const curr = history[i].to;
    const from = history[i].from;

    if (from !== prev) {
      throw new Error(`lifecycle_integrity_error: transition ${i} 'from' is '${from}' but previous state was '${prev}'`);
    }

    const allowed = LIFECYCLE_TRANSITION_MAP[prev];
    if (!allowed || !allowed.includes(curr)) {
      throw new Error(`lifecycle_integrity_error: illegal transition '${prev}' → '${curr}' at index ${i}`);
    }
  }

  const hasCommit = history.some(h => h.to === LIFECYCLE_STATES.COMMITTED);
  const hasExecution = history.some(h => h.to === LIFECYCLE_STATES.EXECUTING);

  if (hasCommit && !hasExecution) {
    throw new Error('lifecycle_integrity_error: commit found without prior execution');
  }

  return { valid: true, reason: 'ok', transitions_validated: history.length };
}
