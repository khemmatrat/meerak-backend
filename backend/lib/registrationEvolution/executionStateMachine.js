/**
 * Phase 4.13 — Execution state machine formalization.
 *
 * Pure contract definition layer that defines the formal transition graph
 * for all execution lifecycle states. Single source of truth for allowed
 * transitions, terminal states, and transition validation.
 *
 * SAFETY CONTRACT:
 * - Pure data + validation only — no execution, no side effects
 * - No journal mutation — read-only compatibility
 * - No replay engine coupling — prepared but not enforced
 * - No DB, queue, worker, timer interaction
 * - Deterministic — transition graph is static and immutable
 * - Throws on invalid transitions — no silent failures
 */

// ─── constants ─────────────────────────────────────────────────────

export const EXECUTION_STATE_MACHINE_VERSION = 'execution_state_machine_v1';

export const EXECUTION_LIFECYCLE_STATES = Object.freeze({
  RUNTIME_BOOTED: 'runtime_booted',
  ENVELOPE_RESERVED: 'envelope_reserved',
  DISPATCH_ACKNOWLEDGED: 'dispatch_acknowledged',
  EXECUTION_SUCCEEDED: 'execution_succeeded',
  EXECUTION_FAILED: 'execution_failed',
  EXECUTION_RETRYABLE: 'execution_retryable',
  EXECUTION_DEAD_LETTERED: 'execution_dead_lettered',
  EXECUTION_COMMITTED: 'execution_committed',
  LIFECYCLE_ADVANCED: 'lifecycle_advanced',
  EXECUTION_WINDOW_CLOSED: 'execution_window_closed',
});

const ALL_STATES = new Set(Object.values(EXECUTION_LIFECYCLE_STATES));

const TRANSITION_MAP = Object.freeze({
  [EXECUTION_LIFECYCLE_STATES.RUNTIME_BOOTED]: Object.freeze([
    EXECUTION_LIFECYCLE_STATES.ENVELOPE_RESERVED,
  ]),
  [EXECUTION_LIFECYCLE_STATES.ENVELOPE_RESERVED]: Object.freeze([
    EXECUTION_LIFECYCLE_STATES.DISPATCH_ACKNOWLEDGED,
  ]),
  [EXECUTION_LIFECYCLE_STATES.DISPATCH_ACKNOWLEDGED]: Object.freeze([
    EXECUTION_LIFECYCLE_STATES.EXECUTION_SUCCEEDED,
    EXECUTION_LIFECYCLE_STATES.EXECUTION_FAILED,
  ]),
  [EXECUTION_LIFECYCLE_STATES.EXECUTION_SUCCEEDED]: Object.freeze([
    EXECUTION_LIFECYCLE_STATES.EXECUTION_COMMITTED,
  ]),
  [EXECUTION_LIFECYCLE_STATES.EXECUTION_FAILED]: Object.freeze([
    EXECUTION_LIFECYCLE_STATES.EXECUTION_RETRYABLE,
    EXECUTION_LIFECYCLE_STATES.EXECUTION_DEAD_LETTERED,
  ]),
  [EXECUTION_LIFECYCLE_STATES.EXECUTION_RETRYABLE]: Object.freeze([
    EXECUTION_LIFECYCLE_STATES.DISPATCH_ACKNOWLEDGED,
  ]),
  [EXECUTION_LIFECYCLE_STATES.EXECUTION_COMMITTED]: Object.freeze([
    EXECUTION_LIFECYCLE_STATES.LIFECYCLE_ADVANCED,
  ]),
  [EXECUTION_LIFECYCLE_STATES.LIFECYCLE_ADVANCED]: Object.freeze([
    EXECUTION_LIFECYCLE_STATES.EXECUTION_WINDOW_CLOSED,
  ]),
  [EXECUTION_LIFECYCLE_STATES.EXECUTION_DEAD_LETTERED]: Object.freeze([]),
  [EXECUTION_LIFECYCLE_STATES.EXECUTION_WINDOW_CLOSED]: Object.freeze([]),
});

const TERMINAL_STATES = Object.freeze([
  EXECUTION_LIFECYCLE_STATES.EXECUTION_DEAD_LETTERED,
  EXECUTION_LIFECYCLE_STATES.EXECUTION_WINDOW_CLOSED,
]);

const TERMINAL_SET = new Set(TERMINAL_STATES);

// ─── transition graph access ───────────────────────────────────────

/**
 * Returns the full immutable transition map.
 *
 * @returns {Record<string, string[]>}
 */
export function getAllowedTransitions() {
  const result = {};
  for (const [from, targets] of Object.entries(TRANSITION_MAP)) {
    result[from] = [...targets];
  }
  return result;
}

/**
 * Returns all terminal (no outgoing transitions) states.
 *
 * @returns {string[]}
 */
export function getTerminalStates() {
  return [...TERMINAL_STATES];
}

/**
 * Check whether a state is terminal.
 *
 * @param {string} state
 * @returns {boolean}
 */
export function isTerminalState(state) {
  return TERMINAL_SET.has(state);
}

// ─── transition validation ─────────────────────────────────────────

/**
 * Validate a transition between two states.
 *
 * @param {string} from — source state
 * @param {string} to — target state
 * @returns {{ valid: boolean, error: string | null }}
 * @throws {Error} on unknown state or invalid transition
 */
export function validateTransition(from, to) {
  if (!from || typeof from !== 'string') {
    throw new Error(`state_machine_error: invalid 'from' state: '${from}'`);
  }
  if (!to || typeof to !== 'string') {
    throw new Error(`state_machine_error: invalid 'to' state: '${to}'`);
  }

  if (!ALL_STATES.has(from)) {
    throw new Error(`state_machine_error: unknown 'from' state: '${from}'`);
  }
  if (!ALL_STATES.has(to)) {
    throw new Error(`state_machine_error: unknown 'to' state: '${to}'`);
  }

  if (TERMINAL_SET.has(from)) {
    throw new Error(`state_machine_error: cannot transition from terminal state '${from}'`);
  }

  const allowed = TRANSITION_MAP[from];
  if (!allowed || !allowed.includes(to)) {
    throw new Error(`state_machine_error: transition '${from}' -> '${to}' is not allowed`);
  }

  return { valid: true, error: null };
}

// ─── graph analysis helpers ────────────────────────────────────────

/**
 * Detect whether a sequence of states forms a valid path through the graph.
 *
 * @param {string[]} path — ordered array of states
 * @returns {{ valid: boolean, error: string | null, validated_length: number }}
 * @throws {Error} on unknown states or invalid transitions
 */
export function validateStatePath(path) {
  if (!Array.isArray(path) || path.length === 0) {
    throw new Error('state_machine_error: path must be a non-empty array');
  }

  if (!ALL_STATES.has(path[0])) {
    throw new Error(`state_machine_error: unknown state in path: '${path[0]}'`);
  }

  for (let i = 1; i < path.length; i++) {
    validateTransition(path[i - 1], path[i]);
  }

  return { valid: true, error: null, validated_length: path.length };
}

/**
 * Get all states reachable from a given state (direct successors only).
 *
 * @param {string} state
 * @returns {string[]}
 * @throws {Error} on unknown state
 */
export function getSuccessorStates(state) {
  if (!state || !ALL_STATES.has(state)) {
    throw new Error(`state_machine_error: unknown state: '${state}'`);
  }
  return [...(TRANSITION_MAP[state] || [])];
}

/**
 * Detect cycles reachable from a given state.
 * Returns the cycle path if found, null otherwise.
 *
 * @param {string} startState
 * @returns {{ has_cycle: boolean, cycle_path: string[] | null }}
 */
export function detectCyclesFrom(startState) {
  if (!startState || !ALL_STATES.has(startState)) {
    return { has_cycle: false, cycle_path: null };
  }

  const visited = new Set();
  const pathStack = [];

  function dfs(current) {
    if (pathStack.includes(current)) {
      const cycleStart = pathStack.indexOf(current);
      return [...pathStack.slice(cycleStart), current];
    }
    if (visited.has(current)) return null;

    visited.add(current);
    pathStack.push(current);

    const successors = TRANSITION_MAP[current] || [];
    for (const next of successors) {
      const cycle = dfs(next);
      if (cycle) return cycle;
    }

    pathStack.pop();
    return null;
  }

  const cyclePath = dfs(startState);
  return {
    has_cycle: cyclePath !== null,
    cycle_path: cyclePath,
  };
}
