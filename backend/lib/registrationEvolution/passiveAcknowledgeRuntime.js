/**
 * Phase 4.3 — Passive acknowledge runtime (no business execution).
 *
 * Reads existing reservations and derives immutable acknowledgement
 * artifacts by transitioning dispatch receipts, consumer leases, and
 * execution results through their respective state machines.
 *
 * SAFETY CONTRACT:
 * - In-memory only — no DB, no persistence
 * - No queue mutation — no dequeue, no removal, no modification
 * - No business execution — no signup processing, no user creation
 * - No auth artifacts — no JWT, no session
 * - No timers — no setInterval, no setTimeout, no polling
 * - No V1 coupling — never affects V1 registration
 * - Never throws — every public function is wrapped in try/catch
 */

import { parseEnvBoolean } from './featureFlags.js';
import { listSignupQueueReservations } from './queueReservationRuntime.js';
import { createDispatchReceipt, transitionDispatchReceipt } from './dispatchContract.js';
import { createConsumerLease, transitionConsumerLease } from './consumerContract.js';
import { createExecutionResult, SIGNUP_EXECUTION_RESULT_STATES } from './executionResultContract.js';

// ─── constants ─────────────────────────────────────────────────────

export const SIGNUP_PASSIVE_ACK_RUNTIME_VERSION = 'signup_passive_ack_v1';

// ─── stdout logging (opt-in) ───────────────────────────────────────

function emitAckStdout(payload) {
  try {
    if (!parseEnvBoolean(process.env.SIGNUP_PASSIVE_ACK_STDOUT, false)) return;
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      event: 'signup_passive_ack',
      version: SIGNUP_PASSIVE_ACK_RUNTIME_VERSION,
      ...payload,
    }));
  } catch (_) { /* noop */ }
}

// ─── acknowledgement artifact builder ──────────────────────────────

/**
 * Build a full passive acknowledgement artifact for a single reservation.
 * All transitions are immutable — original objects are never mutated.
 *
 * @param {Record<string, unknown>} reservation
 * @returns {Record<string, unknown> | null}
 */
function buildAckArtifact(reservation) {
  try {
    if (!reservation || typeof reservation !== 'object') return null;

    const now = new Date().toISOString();
    const envelopeId = reservation.envelope_id || null;
    const queueName = reservation.queue_name || 'signup_v2_jobs';
    const consumerId = reservation.consumer_id || 'passive-ack-runtime';

    const receipt = createDispatchReceipt({
      state: 'accepted',
      queue_name: queueName,
      envelope_id: envelopeId,
      metadata: { passive_ack: true },
    });

    const queuedReceipt = receipt ? transitionDispatchReceipt(receipt, 'queued') : { receipt: null, transitioned: false };
    const dispatchedReceipt = queuedReceipt.transitioned
      ? transitionDispatchReceipt(queuedReceipt.receipt, 'dispatched')
      : { receipt: null, transitioned: false };
    const ackedReceipt = dispatchedReceipt.transitioned
      ? transitionDispatchReceipt(dispatchedReceipt.receipt, 'acknowledged')
      : { receipt: null, transitioned: false };

    const lease = createConsumerLease({
      queue_name: queueName,
      envelope_id: envelopeId,
      consumer_id: consumerId,
      state: 'reserved',
      lease_timeout_ms: 0,
      metadata: { passive_ack: true },
    });

    const processingLease = lease ? transitionConsumerLease(lease, 'processing') : { lease: null, transitioned: false };
    const ackedLease = processingLease.transitioned
      ? transitionConsumerLease(processingLease.lease, 'acknowledged')
      : { lease: null, transitioned: false };

    const execResult = createExecutionResult({
      envelope_id: envelopeId,
      dispatch_id: ackedReceipt.receipt?.dispatch_id || receipt?.dispatch_id || null,
      consumer_id: consumerId,
      state: SIGNUP_EXECUTION_RESULT_STATES.SUCCEEDED,
      started_at: now,
      completed_at: now,
      duration_ms: 0,
      metadata: { noop: true, passive: true },
    });

    return {
      reservation_id: reservation.reservation_id || null,
      envelope_id: envelopeId,
      acknowledged_at: now,
      dispatch_receipt: ackedReceipt.receipt || dispatchedReceipt.receipt || receipt,
      consumer_lease: ackedLease.lease || processingLease.lease || lease,
      execution_result: execResult,
    };
  } catch (_) {
    return null;
  }
}

// ─── public API ────────────────────────────────────────────────────

/**
 * Inspect all active reservations and produce a passive acknowledgement report.
 *
 * @param {{ runtime_id?: string }} [input]
 * @returns {{
 *   runtime_id: string | null,
 *   inspected_at: string,
 *   reservation_count: number,
 *   artifacts: Array<Record<string, unknown>>
 * }}
 */
export function inspectPassiveAcknowledgements(input) {
  try {
    const reservations = listSignupQueueReservations();
    const artifacts = [];

    for (const rsv of reservations) {
      const artifact = buildAckArtifact(rsv);
      if (artifact) artifacts.push(artifact);
    }

    emitAckStdout({
      action: 'inspect',
      runtime_id: input?.runtime_id || null,
      reservation_count: reservations.length,
      artifact_count: artifacts.length,
    });

    return {
      runtime_id: input?.runtime_id || null,
      inspected_at: new Date().toISOString(),
      reservation_count: reservations.length,
      artifacts,
    };
  } catch (_) {
    return {
      runtime_id: input?.runtime_id || null,
      inspected_at: new Date().toISOString(),
      reservation_count: 0,
      artifacts: [],
    };
  }
}

/**
 * Create passive acknowledgement artifacts for all active reservations.
 * Convenience wrapper — returns only the artifacts array.
 *
 * @param {{ runtime_id?: string }} [input]
 * @returns {Array<Record<string, unknown>>}
 */
export function createPassiveAcknowledgementArtifacts(input) {
  try {
    const report = inspectPassiveAcknowledgements(input);
    return report.artifacts;
  } catch (_) {
    return [];
  }
}

/**
 * Create an immutable acknowledgement artifact for a specific reservation.
 *
 * @param {{ reservation_id?: string, envelope_id?: string, queue_name?: string, consumer_id?: string }} input
 * @returns {{ acknowledged: boolean, artifact: Record<string, unknown> | null, reason: string }}
 */
export function acknowledgePassiveReservation(input) {
  try {
    if (!input || typeof input !== 'object') {
      return { acknowledged: false, artifact: null, reason: 'invalid_input' };
    }

    const artifact = buildAckArtifact({
      reservation_id: input.reservation_id || null,
      envelope_id: input.envelope_id || null,
      queue_name: input.queue_name || 'signup_v2_jobs',
      consumer_id: input.consumer_id || 'passive-ack-runtime',
    });

    if (!artifact) {
      return { acknowledged: false, artifact: null, reason: 'artifact_build_failed' };
    }

    emitAckStdout({
      action: 'acknowledge',
      reservation_id: input.reservation_id || null,
      envelope_id: input.envelope_id || null,
    });

    return { acknowledged: true, artifact, reason: 'ok' };
  } catch (_) {
    return { acknowledged: false, artifact: null, reason: 'unexpected_error' };
  }
}
