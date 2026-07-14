/**
 * Phase 4.4 — Passive replay/recovery runtime (analysis only, no execution).
 *
 * Inspects reservations and acknowledgement artifacts to identify stale,
 * incomplete, or inconsistent lifecycle states. Derives immutable replay
 * eligibility and recovery recommendations without replaying or retrying.
 *
 * SAFETY CONTRACT:
 * - In-memory only — no DB, no persistence
 * - No replay execution — analysis and artifact derivation only
 * - No queue mutation — no dequeue, no removal
 * - No retry scheduling — no timers, no backoff execution
 * - No auth artifacts — no JWT, no session
 * - No V1 coupling — never affects V1 registration
 * - Never throws — every public function is wrapped in try/catch
 */

import { parseEnvBoolean } from './featureFlags.js';
import { listSignupQueueReservations } from './queueReservationRuntime.js';
import { inspectPassiveAcknowledgements } from './passiveAcknowledgeRuntime.js';

// ─── constants ─────────────────────────────────────────────────────

export const SIGNUP_PASSIVE_REPLAY_RUNTIME_VERSION = 'signup_passive_replay_v1';

export const SIGNUP_REPLAY_RECOVERY_REASONS = Object.freeze({
  STALE_RESERVATION: 'stale_reservation',
  INCOMPLETE_ACKNOWLEDGEMENT: 'incomplete_acknowledgement',
  ORPHAN_DISPATCH: 'orphan_dispatch',
  EXPIRED_LEASE: 'expired_lease',
  ABANDONED_EXECUTION: 'abandoned_execution',
  INCONSISTENT_STATE: 'inconsistent_state',
});

let _replaySeq = 0;

// ─── stdout logging (opt-in) ───────────────────────────────────────

function emitReplayStdout(payload) {
  try {
    if (!parseEnvBoolean(process.env.SIGNUP_PASSIVE_REPLAY_STDOUT, false)) return;
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      event: 'signup_passive_replay',
      version: SIGNUP_PASSIVE_REPLAY_RUNTIME_VERSION,
      ...payload,
    }));
  } catch (_) { /* noop */ }
}

// ─── replay eligibility ────────────────────────────────────────────

/**
 * Evaluate replay/recovery eligibility for a given lifecycle snapshot.
 *
 * @param {{
 *   reservation_state?: string,
 *   dispatch_state?: string,
 *   consumer_state?: string,
 *   execution_state?: string,
 *   lease_expired?: boolean,
 *   runtime_state?: string
 * }} input
 * @returns {{ replayable: boolean, recoverable: boolean, reason: string | null }}
 */
export function evaluateReplayEligibility(input) {
  try {
    if (!input || typeof input !== 'object') {
      return { replayable: false, recoverable: false, reason: null };
    }

    if (input.runtime_state === 'shutdown') {
      return { replayable: false, recoverable: false, reason: 'runtime_shutdown' };
    }

    if (input.execution_state === 'dead_lettered') {
      return { replayable: false, recoverable: false, reason: 'dead_lettered' };
    }

    if (
      input.dispatch_state === 'acknowledged' &&
      input.consumer_state === 'acknowledged' &&
      input.execution_state === 'succeeded'
    ) {
      return { replayable: false, recoverable: false, reason: 'fully_acknowledged' };
    }

    if (input.reservation_state === 'reserved' && (!input.dispatch_state || input.dispatch_state === 'accepted')) {
      return { replayable: true, recoverable: true, reason: SIGNUP_REPLAY_RECOVERY_REASONS.STALE_RESERVATION };
    }

    if (input.lease_expired && input.execution_state !== 'succeeded') {
      return { replayable: false, recoverable: true, reason: SIGNUP_REPLAY_RECOVERY_REASONS.EXPIRED_LEASE };
    }

    if (input.execution_state === 'abandoned') {
      return { replayable: true, recoverable: true, reason: SIGNUP_REPLAY_RECOVERY_REASONS.ABANDONED_EXECUTION };
    }

    if (input.execution_state === 'failed' && input.consumer_state !== 'abandoned') {
      return { replayable: false, recoverable: true, reason: SIGNUP_REPLAY_RECOVERY_REASONS.ABANDONED_EXECUTION };
    }

    if (input.dispatch_state && !input.consumer_state) {
      return { replayable: true, recoverable: true, reason: SIGNUP_REPLAY_RECOVERY_REASONS.ORPHAN_DISPATCH };
    }

    if (input.dispatch_state === 'acknowledged' && input.consumer_state !== 'acknowledged') {
      return { replayable: false, recoverable: true, reason: SIGNUP_REPLAY_RECOVERY_REASONS.INCONSISTENT_STATE };
    }

    if (input.consumer_state === 'processing' && !input.execution_state) {
      return { replayable: false, recoverable: true, reason: SIGNUP_REPLAY_RECOVERY_REASONS.INCOMPLETE_ACKNOWLEDGEMENT };
    }

    return { replayable: false, recoverable: false, reason: null };
  } catch (_) {
    return { replayable: false, recoverable: false, reason: null };
  }
}

// ─── artifact builder ──────────────────────────────────────────────

function buildReplayArtifact(reservation, ackArtifact, runtimeId) {
  try {
    const now = new Date().toISOString();
    const envelopeId = reservation?.envelope_id || null;

    const dispatchState = ackArtifact?.dispatch_receipt?.state || null;
    const consumerState = ackArtifact?.consumer_lease?.state || null;
    const executionState = ackArtifact?.execution_result?.state || null;

    const eligibility = evaluateReplayEligibility({
      reservation_state: reservation?.state || null,
      dispatch_state: dispatchState,
      consumer_state: consumerState,
      execution_state: executionState,
      lease_expired: false,
    });

    return {
      replay_id: `rpl-${Date.now()}-${++_replaySeq}`,
      runtime_id: runtimeId || null,
      reservation_id: reservation?.reservation_id || null,
      envelope_id: envelopeId,
      recovery_reason: eligibility.reason,
      replayable: eligibility.replayable,
      recoverable: eligibility.recoverable,
      evaluated_at: now,
      metadata: { passive: true, noop: true },
    };
  } catch (_) {
    return null;
  }
}

// ─── public API ────────────────────────────────────────────────────

/**
 * Inspect all reservations and acknowledgement artifacts to produce
 * a replay/recovery report.
 *
 * @param {{ runtime_id?: string }} [input]
 * @returns {{
 *   runtime_id: string | null,
 *   inspected_at: string,
 *   reservation_count: number,
 *   replayable_count: number,
 *   recoverable_count: number,
 *   artifacts: Array<Record<string, unknown>>
 * }}
 */
export function inspectPassiveReplayRecovery(input) {
  try {
    const runtimeId = input?.runtime_id || null;
    const reservations = listSignupQueueReservations();
    const ackReport = inspectPassiveAcknowledgements({ runtime_id: runtimeId });

    const ackByEnvelopeId = new Map();
    for (const art of (ackReport.artifacts || [])) {
      if (art.envelope_id) ackByEnvelopeId.set(art.envelope_id, art);
    }

    const artifacts = [];
    let replayableCount = 0;
    let recoverableCount = 0;

    for (const rsv of reservations) {
      const ackArtifact = ackByEnvelopeId.get(rsv.envelope_id) || null;
      const artifact = buildReplayArtifact(rsv, ackArtifact, runtimeId);
      if (artifact) {
        artifacts.push(artifact);
        if (artifact.replayable) replayableCount++;
        if (artifact.recoverable) recoverableCount++;
      }
    }

    emitReplayStdout({
      action: 'inspect',
      runtime_id: runtimeId,
      reservation_count: reservations.length,
      replayable_count: replayableCount,
      recoverable_count: recoverableCount,
      artifact_count: artifacts.length,
    });

    return {
      runtime_id: runtimeId,
      inspected_at: new Date().toISOString(),
      reservation_count: reservations.length,
      replayable_count: replayableCount,
      recoverable_count: recoverableCount,
      artifacts,
    };
  } catch (_) {
    return {
      runtime_id: input?.runtime_id || null,
      inspected_at: new Date().toISOString(),
      reservation_count: 0,
      replayable_count: 0,
      recoverable_count: 0,
      artifacts: [],
    };
  }
}

/**
 * Derive replay recovery artifacts for all active reservations.
 * Convenience wrapper — returns only the artifacts array.
 *
 * @param {{ runtime_id?: string }} [input]
 * @returns {Array<Record<string, unknown>>}
 */
export function deriveReplayRecoveryArtifacts(input) {
  try {
    const report = inspectPassiveReplayRecovery(input);
    return report.artifacts;
  } catch (_) {
    return [];
  }
}
