/**
 * Phase 4.11 — Deterministic execution journal.
 *
 * Append-only, in-memory journal that records every lifecycle transition
 * as an immutable event with deterministic sequencing. Enables full
 * lifecycle reconstruction and replay safety verification.
 *
 * SAFETY CONTRACT:
 * - Append-only — entries are added, never updated or deleted
 * - Immutable snapshots — returned entries are cloned, never mutable refs
 * - Deterministic ordering — monotonic sequence counter per journal
 * - No queue mutation — no enqueue, no dequeue
 * - No retry scheduling — events record transitions, not actions
 * - No timers — no setInterval, no setTimeout, no polling
 * - No worker_threads — runs in main thread
 * - No V1 coupling — never affects V1 registration
 * - No DB writes — fully in-memory
 * - Never throws — every public function is wrapped in try/catch
 */

import { parseEnvBoolean } from './featureFlags.js';

// ─── constants ─────────────────────────────────────────────────────

export const SIGNUP_EXECUTION_JOURNAL_VERSION = 'signup_execution_journal_v1';

export const SIGNUP_JOURNAL_EVENT_TYPES = Object.freeze({
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

const KNOWN_EVENT_TYPES = new Set(Object.values(SIGNUP_JOURNAL_EVENT_TYPES));

// ─── in-memory journal ─────────────────────────────────────────────

/** @type {Array<Record<string, unknown>>} */
const _journal = [];

let _journalSeq = 0;

// ─── stdout logging (opt-in) ───────────────────────────────────────

function emitJournalStdout(payload) {
  try {
    if (!parseEnvBoolean(process.env.SIGNUP_EXECUTION_JOURNAL_STDOUT, false)) return;
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      event: 'signup_execution_journal',
      version: SIGNUP_EXECUTION_JOURNAL_VERSION,
      ...payload,
    }));
  } catch (_) { /* noop */ }
}

// ─── append ────────────────────────────────────────────────────────

/**
 * Append an immutable event to the execution journal.
 *
 * @param {{
 *   event_type: string,
 *   runtime_id?: string,
 *   window_id?: string,
 *   envelope_id?: string,
 *   dispatch_id?: string,
 *   reservation_id?: string,
 *   commit_id?: string,
 *   metadata?: Record<string, unknown>
 * }} input
 * @returns {{ appended: boolean, journal_id: string | null, sequence: number | null, reason: string }}
 */
export function appendExecutionJournalEntry(input) {
  try {
    if (!input || typeof input !== 'object') {
      return { appended: false, journal_id: null, sequence: null, reason: 'invalid_input' };
    }

    if (!input.event_type || !KNOWN_EVENT_TYPES.has(input.event_type)) {
      return { appended: false, journal_id: null, sequence: null, reason: 'unknown_event_type' };
    }

    const seq = ++_journalSeq;
    const journalId = `jrnl-${Date.now()}-${seq}`;
    const now = new Date().toISOString();

    const entry = {
      journal_id: journalId,
      journal_version: SIGNUP_EXECUTION_JOURNAL_VERSION,
      event_type: input.event_type,
      runtime_id: input.runtime_id ? String(input.runtime_id) : null,
      window_id: input.window_id ? String(input.window_id) : null,
      envelope_id: input.envelope_id ? String(input.envelope_id) : null,
      dispatch_id: input.dispatch_id ? String(input.dispatch_id) : null,
      reservation_id: input.reservation_id ? String(input.reservation_id) : null,
      commit_id: input.commit_id ? String(input.commit_id) : null,
      recorded_at: now,
      sequence: seq,
      metadata: (input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata))
        ? { ...input.metadata }
        : {},
    };

    _journal.push(entry);

    emitJournalStdout({ action: 'append', journal_id: journalId, event_type: input.event_type, sequence: seq });

    return { appended: true, journal_id: journalId, sequence: seq, reason: 'ok' };
  } catch (_) {
    return { appended: false, journal_id: null, sequence: null, reason: 'unexpected_error' };
  }
}

// ─── inspection ────────────────────────────────────────────────────

/**
 * Inspect the execution journal. Returns cloned entries filtered by optional criteria.
 *
 * @param {{
 *   runtime_id?: string,
 *   envelope_id?: string,
 *   event_type?: string,
 *   since_sequence?: number
 * }} [input]
 * @returns {{
 *   total_entries: number,
 *   filtered_entries: number,
 *   entries: Array<Record<string, unknown>>
 * }}
 */
export function inspectExecutionJournal(input) {
  try {
    let entries = _journal;

    if (input && typeof input === 'object') {
      if (input.runtime_id) {
        entries = entries.filter(e => e.runtime_id === input.runtime_id);
      }
      if (input.envelope_id) {
        entries = entries.filter(e => e.envelope_id === input.envelope_id);
      }
      if (input.event_type) {
        entries = entries.filter(e => e.event_type === input.event_type);
      }
      if (typeof input.since_sequence === 'number') {
        entries = entries.filter(e => e.sequence > input.since_sequence);
      }
    }

    return {
      total_entries: _journal.length,
      filtered_entries: entries.length,
      entries: entries.map(e => ({ ...e, metadata: { ...(e.metadata || {}) } })),
    };
  } catch (_) {
    return { total_entries: 0, filtered_entries: 0, entries: [] };
  }
}

// ─── timeline derivation ───────────────────────────────────────────

/**
 * Reconstruct an ordered execution timeline for a specific envelope.
 *
 * @param {{ envelope_id: string }} input
 * @returns {{
 *   envelope_id: string,
 *   timeline_length: number,
 *   first_event_at: string | null,
 *   last_event_at: string | null,
 *   timeline: Array<{ sequence: number, event_type: string, recorded_at: string }>
 * }}
 */
export function deriveExecutionTimeline(input) {
  try {
    if (!input || !input.envelope_id) {
      return { envelope_id: '', timeline_length: 0, first_event_at: null, last_event_at: null, timeline: [] };
    }

    const envId = String(input.envelope_id);
    const matching = _journal
      .filter(e => e.envelope_id === envId)
      .sort((a, b) => a.sequence - b.sequence);

    const timeline = matching.map(e => ({
      sequence: e.sequence,
      event_type: e.event_type,
      recorded_at: e.recorded_at,
    }));

    return {
      envelope_id: envId,
      timeline_length: timeline.length,
      first_event_at: timeline.length > 0 ? timeline[0].recorded_at : null,
      last_event_at: timeline.length > 0 ? timeline[timeline.length - 1].recorded_at : null,
      timeline,
    };
  } catch (_) {
    return { envelope_id: input?.envelope_id || '', timeline_length: 0, first_event_at: null, last_event_at: null, timeline: [] };
  }
}

// ─── replay safety ─────────────────────────────────────────────────

/**
 * Check whether the journal for a given envelope is replayable
 * (deterministically reconstructable from the recorded events).
 *
 * @param {{ envelope_id: string }} input
 * @returns {{ replayable: boolean, reason: string, event_count: number }}
 */
export function isJournalReplayable(input) {
  try {
    if (!input || !input.envelope_id) {
      return { replayable: false, reason: 'missing_envelope_id', event_count: 0 };
    }

    const envId = String(input.envelope_id);
    const matching = _journal.filter(e => e.envelope_id === envId);

    if (matching.length === 0) {
      return { replayable: false, reason: 'no_journal_entries', event_count: 0 };
    }

    const sequences = matching.map(e => e.sequence).sort((a, b) => a - b);
    for (let i = 1; i < sequences.length; i++) {
      if (sequences[i] <= sequences[i - 1]) {
        return { replayable: false, reason: 'non_monotonic_sequence', event_count: matching.length };
      }
    }

    const hasTerminal = matching.some(e =>
      e.event_type === SIGNUP_JOURNAL_EVENT_TYPES.EXECUTION_COMMITTED ||
      e.event_type === SIGNUP_JOURNAL_EVENT_TYPES.EXECUTION_DEAD_LETTERED
    );

    if (!hasTerminal) {
      return { replayable: true, reason: 'incomplete_lifecycle', event_count: matching.length };
    }

    return { replayable: true, reason: 'ok', event_count: matching.length };
  } catch (_) {
    return { replayable: false, reason: 'unexpected_error', event_count: 0 };
  }
}

// ─── test teardown ─────────────────────────────────────────────────

/**
 * Clear all journal entries. FOR TESTING ONLY.
 *
 * @returns {{ cleared: boolean, removed_count: number }}
 */
export function clearExecutionJournal() {
  try {
    const count = _journal.length;
    _journal.length = 0;
    _journalSeq = 0;
    return { cleared: true, removed_count: count };
  } catch (_) {
    return { cleared: false, removed_count: 0 };
  }
}
