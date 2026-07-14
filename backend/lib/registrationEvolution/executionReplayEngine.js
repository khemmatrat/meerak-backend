/**
 * Phase 4.12 — Deterministic execution replay engine.
 *
 * Pure reducer-based replay system that reconstructs full execution state
 * ONLY from the execution journal. No side effects, no inference, no
 * autonomous execution.
 *
 * CORE PRINCIPLE:
 *   state = events.reduce(applyEvent, initialState)
 *
 * SAFETY CONTRACT:
 * - Pure functions only — no side effects, no I/O, no mutation
 * - Deterministic — same journal input always produces identical output
 * - No timestamps for logic decisions — sequence-based ordering only
 * - No inference — missing events cause HARD FAIL, never guessed
 * - No journal mutation — read-only access
 * - No queue interaction — no enqueue, no dequeue
 * - No retry scheduling — no timers, no autonomous execution
 * - No V1 coupling — never affects V1 registration
 */

import { SIGNUP_JOURNAL_EVENT_TYPES } from './executionJournal.js';

// ─── constants ─────────────────────────────────────────────────────

const KNOWN_EVENT_TYPES = new Set(Object.values(SIGNUP_JOURNAL_EVENT_TYPES));

// ─── initial state ─────────────────────────────────────────────────

function createInitialState() {
  return {
    runtime_state: {
      booted: false,
      runtime_ids: [],
    },
    envelope_states: {},
    dispatch_states: {},
    replay_metadata: {
      event_count: 0,
      last_sequence: -1,
      replayed_at: null,
    },
  };
}

function createInitialEnvelopeState() {
  return {
    reserved: false,
    dispatched: false,
    dispatch_acknowledged: false,
    execution_state: null,
    committed: false,
    lifecycle_advanced: false,
    window_closed: false,
    event_sequences: [],
  };
}

// ─── state machine (pure reducer) ──────────────────────────────────

/**
 * Build the pure reducer function that defines deterministic
 * transformation rules for each event_type.
 *
 * @returns {(state: Record<string, unknown>, event: Record<string, unknown>) => Record<string, unknown>}
 */
export function buildExecutionStateMachine() {
  return function applyEvent(state, event) {
    if (!event || typeof event !== 'object') {
      throw new Error('replay_error: invalid event object');
    }

    if (!event.event_type || !KNOWN_EVENT_TYPES.has(event.event_type)) {
      throw new Error(`replay_error: unknown event_type '${event.event_type}'`);
    }

    if (typeof event.sequence !== 'number' || !Number.isFinite(event.sequence)) {
      throw new Error(`replay_error: invalid sequence '${event.sequence}'`);
    }

    if (event.sequence <= state.replay_metadata.last_sequence) {
      throw new Error(`replay_error: non_monotonic_sequence current=${event.sequence} last=${state.replay_metadata.last_sequence}`);
    }

    const newState = {
      runtime_state: { ...state.runtime_state, runtime_ids: [...state.runtime_state.runtime_ids] },
      envelope_states: { ...state.envelope_states },
      dispatch_states: { ...state.dispatch_states },
      replay_metadata: {
        event_count: state.replay_metadata.event_count + 1,
        last_sequence: event.sequence,
        replayed_at: state.replay_metadata.replayed_at,
      },
    };

    const envId = event.envelope_id;
    const dispatchId = event.dispatch_id;

    switch (event.event_type) {
      case SIGNUP_JOURNAL_EVENT_TYPES.RUNTIME_BOOTED: {
        newState.runtime_state = { ...newState.runtime_state, booted: true };
        if (event.runtime_id && !newState.runtime_state.runtime_ids.includes(event.runtime_id)) {
          newState.runtime_state.runtime_ids = [...newState.runtime_state.runtime_ids, event.runtime_id];
        }
        break;
      }

      case SIGNUP_JOURNAL_EVENT_TYPES.ENVELOPE_RESERVED: {
        if (!envId) throw new Error('replay_error: envelope_reserved requires envelope_id');
        const envState = { ...(newState.envelope_states[envId] || createInitialEnvelopeState()) };
        envState.reserved = true;
        envState.event_sequences = [...envState.event_sequences, event.sequence];
        newState.envelope_states = { ...newState.envelope_states, [envId]: envState };
        break;
      }

      case SIGNUP_JOURNAL_EVENT_TYPES.DISPATCH_ACKNOWLEDGED: {
        if (!envId) throw new Error('replay_error: dispatch_acknowledged requires envelope_id');
        const envState = { ...(newState.envelope_states[envId] || createInitialEnvelopeState()) };
        envState.dispatched = true;
        envState.dispatch_acknowledged = true;
        envState.event_sequences = [...envState.event_sequences, event.sequence];
        newState.envelope_states = { ...newState.envelope_states, [envId]: envState };
        if (dispatchId) {
          newState.dispatch_states = { ...newState.dispatch_states, [dispatchId]: { acknowledged: true, envelope_id: envId } };
        }
        break;
      }

      case SIGNUP_JOURNAL_EVENT_TYPES.EXECUTION_SUCCEEDED: {
        if (!envId) throw new Error('replay_error: execution_succeeded requires envelope_id');
        const envState = { ...(newState.envelope_states[envId] || createInitialEnvelopeState()) };
        envState.execution_state = 'succeeded';
        envState.event_sequences = [...envState.event_sequences, event.sequence];
        newState.envelope_states = { ...newState.envelope_states, [envId]: envState };
        break;
      }

      case SIGNUP_JOURNAL_EVENT_TYPES.EXECUTION_FAILED: {
        if (!envId) throw new Error('replay_error: execution_failed requires envelope_id');
        const envState = { ...(newState.envelope_states[envId] || createInitialEnvelopeState()) };
        envState.execution_state = 'failed';
        envState.event_sequences = [...envState.event_sequences, event.sequence];
        newState.envelope_states = { ...newState.envelope_states, [envId]: envState };
        break;
      }

      case SIGNUP_JOURNAL_EVENT_TYPES.EXECUTION_RETRYABLE: {
        if (!envId) throw new Error('replay_error: execution_retryable requires envelope_id');
        const envState = { ...(newState.envelope_states[envId] || createInitialEnvelopeState()) };
        envState.execution_state = 'retryable';
        envState.event_sequences = [...envState.event_sequences, event.sequence];
        newState.envelope_states = { ...newState.envelope_states, [envId]: envState };
        break;
      }

      case SIGNUP_JOURNAL_EVENT_TYPES.EXECUTION_DEAD_LETTERED: {
        if (!envId) throw new Error('replay_error: execution_dead_lettered requires envelope_id');
        const envState = { ...(newState.envelope_states[envId] || createInitialEnvelopeState()) };
        envState.execution_state = 'dead_lettered';
        envState.event_sequences = [...envState.event_sequences, event.sequence];
        newState.envelope_states = { ...newState.envelope_states, [envId]: envState };
        break;
      }

      case SIGNUP_JOURNAL_EVENT_TYPES.EXECUTION_COMMITTED: {
        if (!envId) throw new Error('replay_error: execution_committed requires envelope_id');
        const envState = { ...(newState.envelope_states[envId] || createInitialEnvelopeState()) };
        envState.committed = true;
        envState.event_sequences = [...envState.event_sequences, event.sequence];
        newState.envelope_states = { ...newState.envelope_states, [envId]: envState };
        break;
      }

      case SIGNUP_JOURNAL_EVENT_TYPES.LIFECYCLE_ADVANCED: {
        if (envId) {
          const envState = { ...(newState.envelope_states[envId] || createInitialEnvelopeState()) };
          envState.lifecycle_advanced = true;
          envState.event_sequences = [...envState.event_sequences, event.sequence];
          newState.envelope_states = { ...newState.envelope_states, [envId]: envState };
        }
        break;
      }

      case SIGNUP_JOURNAL_EVENT_TYPES.EXECUTION_WINDOW_CLOSED: {
        if (envId) {
          const envState = { ...(newState.envelope_states[envId] || createInitialEnvelopeState()) };
          envState.window_closed = true;
          envState.event_sequences = [...envState.event_sequences, event.sequence];
          newState.envelope_states = { ...newState.envelope_states, [envId]: envState };
        }
        break;
      }

      default:
        throw new Error(`replay_error: unhandled event_type '${event.event_type}'`);
    }

    return newState;
  };
}

// ─── validation ────────────────────────────────────────────────────

/**
 * Validate journal integrity for replay. HARD FAIL on any violation.
 *
 * @param {{ entries: Array<Record<string, unknown>> }} input
 * @returns {{ valid: boolean, error: string | null, event_count: number }}
 */
export function validateReplayIntegrity(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.entries)) {
    return { valid: false, error: 'invalid_input: entries must be an array', event_count: 0 };
  }

  const entries = input.entries;
  if (entries.length === 0) {
    return { valid: false, error: 'empty_journal: no events to replay', event_count: 0 };
  }

  const seenSequences = new Set();
  let lastSeq = -1;

  for (let i = 0; i < entries.length; i++) {
    const event = entries[i];

    if (!event || typeof event !== 'object') {
      return { valid: false, error: `invalid_event: index ${i} is not an object`, event_count: i };
    }

    if (!event.event_type || typeof event.event_type !== 'string') {
      return { valid: false, error: `missing_event_type: index ${i}`, event_count: i };
    }

    if (!KNOWN_EVENT_TYPES.has(event.event_type)) {
      return { valid: false, error: `unknown_event_type: '${event.event_type}' at index ${i}`, event_count: i };
    }

    if (typeof event.sequence !== 'number' || !Number.isFinite(event.sequence)) {
      return { valid: false, error: `invalid_sequence: index ${i} sequence='${event.sequence}'`, event_count: i };
    }

    if (seenSequences.has(event.sequence)) {
      return { valid: false, error: `duplicate_sequence: ${event.sequence} at index ${i}`, event_count: i };
    }

    if (event.sequence <= lastSeq) {
      return { valid: false, error: `non_monotonic_sequence: ${event.sequence} <= ${lastSeq} at index ${i}`, event_count: i };
    }

    seenSequences.add(event.sequence);
    lastSeq = event.sequence;
  }

  return { valid: true, error: null, event_count: entries.length };
}

// ─── replay engine ─────────────────────────────────────────────────

/**
 * Replay an entire execution journal into a deterministic state.
 *
 * GUARANTEES:
 * - Same input always produces identical output
 * - Throws on any integrity violation (no partial success)
 * - No side effects
 * - No journal mutation
 *
 * @param {{ entries: Array<Record<string, unknown>> }} input
 * @returns {{
 *   runtime_state: Record<string, unknown>,
 *   envelope_states: Record<string, Record<string, unknown>>,
 *   dispatch_states: Record<string, Record<string, unknown>>,
 *   replay_metadata: { event_count: number, last_sequence: number, replayed_at: string }
 * }}
 * @throws {Error} on any integrity or replay violation
 */
export function replayExecutionJournal(input) {
  const validation = validateReplayIntegrity(input);
  if (!validation.valid) {
    throw new Error(`replay_integrity_failure: ${validation.error}`);
  }

  const reducer = buildExecutionStateMachine();
  let state = createInitialState();

  for (const event of input.entries) {
    state = reducer(state, event);
  }

  state.replay_metadata.replayed_at = new Date().toISOString();

  return {
    runtime_state: state.runtime_state,
    envelope_states: state.envelope_states,
    dispatch_states: state.dispatch_states,
    replay_metadata: state.replay_metadata,
  };
}

/**
 * Replay journal for a single envelope, reconstructing only its state.
 *
 * @param {{ entries: Array<Record<string, unknown>>, envelope_id: string }} input
 * @returns {{
 *   runtime_state: Record<string, unknown>,
 *   envelope_state: Record<string, unknown> | null,
 *   dispatch_states: Record<string, Record<string, unknown>>,
 *   replay_metadata: { event_count: number, last_sequence: number, replayed_at: string }
 * }}
 * @throws {Error} on integrity violation
 */
export function replayEnvelopeState(input) {
  if (!input || !input.envelope_id) {
    throw new Error('replay_error: missing envelope_id');
  }

  const envId = String(input.envelope_id);
  const entries = (input.entries || []).filter(e =>
    e.envelope_id === envId ||
    e.event_type === SIGNUP_JOURNAL_EVENT_TYPES.RUNTIME_BOOTED ||
    e.event_type === SIGNUP_JOURNAL_EVENT_TYPES.EXECUTION_WINDOW_CLOSED
  );

  if (entries.length === 0) {
    throw new Error(`replay_error: no journal entries for envelope_id '${envId}'`);
  }

  const fullResult = replayExecutionJournal({ entries });

  return {
    runtime_state: fullResult.runtime_state,
    envelope_state: fullResult.envelope_states[envId] || null,
    dispatch_states: fullResult.dispatch_states,
    replay_metadata: fullResult.replay_metadata,
  };
}

// ─── state comparison ──────────────────────────────────────────────

/**
 * Deep compare two replay outputs for determinism verification.
 *
 * @param {Record<string, unknown>} a
 * @param {Record<string, unknown>} b
 * @returns {{ identical: boolean, differences: string[] }}
 */
export function compareReplayStates(a, b) {
  const differences = [];

  if (!a || !b) {
    differences.push('one_or_both_null');
    return { identical: false, differences };
  }

  compareRecursive(a, b, '', differences);

  return { identical: differences.length === 0, differences };
}

function compareRecursive(a, b, path, differences) {
  if (a === b) return;

  const typeA = typeof a;
  const typeB = typeof b;

  if (typeA !== typeB) {
    differences.push(`${path || 'root'}: type mismatch (${typeA} vs ${typeB})`);
    return;
  }

  if (a === null || b === null) {
    if (a !== b) differences.push(`${path || 'root'}: null mismatch`);
    return;
  }

  if (typeA !== 'object') {
    if (a !== b) differences.push(`${path || 'root'}: value mismatch (${String(a).slice(0, 50)} vs ${String(b).slice(0, 50)})`);
    return;
  }

  if (Array.isArray(a) !== Array.isArray(b)) {
    differences.push(`${path || 'root'}: array/object mismatch`);
    return;
  }

  if (Array.isArray(a)) {
    if (a.length !== b.length) {
      differences.push(`${path || 'root'}: array length mismatch (${a.length} vs ${b.length})`);
      return;
    }
    for (let i = 0; i < a.length; i++) {
      compareRecursive(a[i], b[i], `${path}[${i}]`, differences);
    }
    return;
  }

  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();

  if (keysA.length !== keysB.length || keysA.join(',') !== keysB.join(',')) {
    const missingInB = keysA.filter(k => !keysB.includes(k));
    const extraInB = keysB.filter(k => !keysA.includes(k));
    if (missingInB.length) differences.push(`${path || 'root'}: missing keys in b: ${missingInB.join(',')}`);
    if (extraInB.length) differences.push(`${path || 'root'}: extra keys in b: ${extraInB.join(',')}`);
    return;
  }

  for (const key of keysA) {
    compareRecursive(a[key], b[key], path ? `${path}.${key}` : key, differences);
  }
}
