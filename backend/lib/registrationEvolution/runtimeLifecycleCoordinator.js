/**
 * Phase 4.9 — Runtime lifecycle advancement coordinator.
 *
 * Deterministic lifecycle advancement across reservation, dispatch,
 * consumer lease, execution result, and commit layers. Produces
 * immutable advancement snapshots without autonomous progression.
 *
 * SAFETY CONTRACT:
 * - Append-only — advancement snapshots are stored, never modified
 * - Non-destructive — original artifacts are never mutated
 * - No queue mutation — no enqueue, no dequeue
 * - No retry execution — advancement decisions recorded, not acted upon
 * - No timers — no setInterval, no setTimeout, no polling
 * - No worker_threads — runs in main thread
 * - No V1 coupling — never affects V1 registration
 * - No DB writes — fully in-memory
 * - At most one lifecycle per invocation
 * - Never throws — every public function is wrapped in try/catch
 */

import { parseEnvBoolean } from './featureFlags.js';
import { listSignupQueueReservations } from './queueReservationRuntime.js';
import { inspectCommittedExecutions } from './executionCommitCoordinator.js';

// ─── constants ─────────────────────────────────────────────────────

export const SIGNUP_RUNTIME_LIFECYCLE_COORDINATOR_VERSION = 'signup_runtime_lifecycle_v1';

const ADVANCEMENT_STATES = Object.freeze({
  ADVANCED: 'advanced',
  BLOCKED: 'blocked',
  REPLAYABLE: 'replayable',
  RETRYABLE: 'retryable',
  TERMINAL: 'terminal',
  NOOP_ADVANCEMENT: 'noop_advancement',
});

// ─── in-memory advancement registry ────────────────────────────────

/** @type {Map<string, Record<string, unknown>>} keyed by advancement_id */
const _advancementRegistry = new Map();

let _advSeq = 0;

// ─── stdout logging (opt-in) ───────────────────────────────────────

function emitLifecycleStdout(payload) {
  try {
    if (!parseEnvBoolean(process.env.SIGNUP_RUNTIME_LIFECYCLE_STDOUT, false)) return;
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      event: 'signup_runtime_lifecycle',
      version: SIGNUP_RUNTIME_LIFECYCLE_COORDINATOR_VERSION,
      ...payload,
    }));
  } catch (_) { /* noop */ }
}

// ─── advancement eligibility ───────────────────────────────────────

/**
 * Check whether a reservation is eligible for lifecycle advancement.
 *
 * @param {{
 *   reservation?: Record<string, unknown>,
 *   commit?: Record<string, unknown>
 * }} input
 * @returns {{ eligible: boolean, reason: string }}
 */
export function isLifecycleAdvanceEligible(input) {
  try {
    if (!input || typeof input !== 'object') {
      return { eligible: false, reason: 'invalid_input' };
    }
    if (!input.reservation || !input.reservation.envelope_id) {
      return { eligible: false, reason: 'missing_reservation' };
    }
    if (input.reservation.state === 'released') {
      return { eligible: false, reason: 'reservation_released' };
    }
    if (input.commit?.commit_state === 'terminal' || input.commit?.commit_state === 'abandoned') {
      return { eligible: false, reason: 'terminal_commit' };
    }
    return { eligible: true, reason: 'ok' };
  } catch (_) {
    return { eligible: false, reason: 'unexpected_error' };
  }
}

// ─── advancement derivation ────────────────────────────────────────

/**
 * Derive the advancement state for a reservation + commit pair.
 *
 * @param {{
 *   reservation?: Record<string, unknown>,
 *   commit?: Record<string, unknown>,
 *   noop?: boolean
 * }} input
 * @returns {{ advancement_state: string, reason: string }}
 */
export function deriveLifecycleAdvancement(input) {
  try {
    if (!input || typeof input !== 'object') {
      return { advancement_state: ADVANCEMENT_STATES.BLOCKED, reason: 'invalid_input' };
    }

    const isNoop = input.noop === true;
    if (isNoop) {
      return { advancement_state: ADVANCEMENT_STATES.NOOP_ADVANCEMENT, reason: 'noop_mode' };
    }

    const commitState = input.commit?.commit_state;

    if (!commitState) {
      if (input.reservation?.state === 'reserved') {
        return { advancement_state: ADVANCEMENT_STATES.BLOCKED, reason: 'awaiting_execution' };
      }
      return { advancement_state: ADVANCEMENT_STATES.BLOCKED, reason: 'no_commit' };
    }

    if (commitState === 'committed') {
      return { advancement_state: ADVANCEMENT_STATES.ADVANCED, reason: 'commit_succeeded' };
    }

    if (commitState === 'noop_commit') {
      return { advancement_state: ADVANCEMENT_STATES.NOOP_ADVANCEMENT, reason: 'noop_commit' };
    }

    if (commitState === 'retryable') {
      return { advancement_state: ADVANCEMENT_STATES.RETRYABLE, reason: 'commit_retryable' };
    }

    if (commitState === 'replayable') {
      return { advancement_state: ADVANCEMENT_STATES.REPLAYABLE, reason: 'commit_replayable' };
    }

    if (commitState === 'abandoned') {
      return { advancement_state: ADVANCEMENT_STATES.TERMINAL, reason: 'commit_abandoned' };
    }

    return { advancement_state: ADVANCEMENT_STATES.BLOCKED, reason: 'unknown_commit_state' };
  } catch (_) {
    return { advancement_state: ADVANCEMENT_STATES.BLOCKED, reason: 'unexpected_error' };
  }
}

// ─── advancement execution ─────────────────────────────────────────

/**
 * Advance a single runtime lifecycle. Produces an immutable advancement
 * snapshot. AT MOST ONE lifecycle per invocation.
 *
 * @param {{ runtime_id?: string, noop?: boolean }} [input]
 * @returns {{
 *   advanced: boolean,
 *   advancement_id: string | null,
 *   advancement_state: string | null,
 *   envelope_id: string | null,
 *   reason: string
 * }}
 */
export function advanceRuntimeLifecycle(input) {
  try {
    const runtimeId = input?.runtime_id || null;
    const isNoop = input?.noop !== false;
    const now = new Date().toISOString();

    const reservations = listSignupQueueReservations();
    if (reservations.length === 0) {
      emitLifecycleStdout({ action: 'advance', outcome: 'no_reservations', runtime_id: runtimeId });
      return { advanced: false, advancement_id: null, advancement_state: null, envelope_id: null, reason: 'no_reservations' };
    }

    const first = reservations[0];
    const envelopeId = first.envelope_id;

    const commitReport = inspectCommittedExecutions({ runtime_id: runtimeId });
    const matchingCommit = commitReport.commits.find(c => c.envelope_id === envelopeId) || null;

    const eligibility = isLifecycleAdvanceEligible({ reservation: first, commit: matchingCommit });
    if (!eligibility.eligible) {
      emitLifecycleStdout({ action: 'advance', outcome: 'not_eligible', envelope_id: envelopeId, reason: eligibility.reason });
      return { advanced: false, advancement_id: null, advancement_state: null, envelope_id: envelopeId, reason: eligibility.reason };
    }

    const decision = deriveLifecycleAdvancement({ reservation: first, commit: matchingCommit, noop: isNoop });

    const advancementId = `adv-${Date.now()}-${++_advSeq}`;
    const snapshot = {
      advancement_id: advancementId,
      advancement_version: SIGNUP_RUNTIME_LIFECYCLE_COORDINATOR_VERSION,
      advancement_state: decision.advancement_state,
      advancement_reason: decision.reason,
      runtime_id: runtimeId,
      envelope_id: envelopeId,
      reservation_id: first.reservation_id || null,
      commit_id: matchingCommit?.commit_id || null,
      advanced_at: now,
      metadata: { noop: isNoop },
    };

    _advancementRegistry.set(advancementId, snapshot);

    emitLifecycleStdout({
      action: 'advance',
      outcome: 'ok',
      advancement_id: advancementId,
      advancement_state: decision.advancement_state,
      envelope_id: envelopeId,
      reason: decision.reason,
    });

    return {
      advanced: true,
      advancement_id: advancementId,
      advancement_state: decision.advancement_state,
      envelope_id: envelopeId,
      reason: 'ok',
    };
  } catch (_) {
    return { advanced: false, advancement_id: null, advancement_state: null, envelope_id: null, reason: 'unexpected_error' };
  }
}

// ─── inspection ────────────────────────────────────────────────────

/**
 * Inspect all lifecycle advancement snapshots.
 *
 * @param {{ runtime_id?: string }} [input]
 * @returns {{
 *   total_advancements: number,
 *   advanced_count: number,
 *   blocked_count: number,
 *   replayable_count: number,
 *   retryable_count: number,
 *   terminal_count: number,
 *   noop_count: number,
 *   advancements: Array<Record<string, unknown>>
 * }}
 */
export function inspectLifecycleAdvancements(input) {
  try {
    const runtimeId = input?.runtime_id || null;
    let advanced = 0, blocked = 0, replayable = 0, retryable = 0, terminal = 0, noop = 0;
    const advancements = [];

    for (const snapshot of _advancementRegistry.values()) {
      if (runtimeId && snapshot.runtime_id !== runtimeId) continue;
      advancements.push({ ...snapshot });

      switch (snapshot.advancement_state) {
        case ADVANCEMENT_STATES.ADVANCED: advanced++; break;
        case ADVANCEMENT_STATES.BLOCKED: blocked++; break;
        case ADVANCEMENT_STATES.REPLAYABLE: replayable++; break;
        case ADVANCEMENT_STATES.RETRYABLE: retryable++; break;
        case ADVANCEMENT_STATES.TERMINAL: terminal++; break;
        case ADVANCEMENT_STATES.NOOP_ADVANCEMENT: noop++; break;
      }
    }

    return { total_advancements: advancements.length, advanced_count: advanced, blocked_count: blocked, replayable_count: replayable, retryable_count: retryable, terminal_count: terminal, noop_count: noop, advancements };
  } catch (_) {
    return { total_advancements: 0, advanced_count: 0, blocked_count: 0, replayable_count: 0, retryable_count: 0, terminal_count: 0, noop_count: 0, advancements: [] };
  }
}
