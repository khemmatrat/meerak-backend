/**
 * Phase 4.2 — Queue claim & reservation layer (no business execution).
 *
 * Provides in-memory reservation ownership for queue envelopes.
 * Envelopes remain in the queue — reservations only prevent duplicate
 * active ownership. No dequeue, no deletion, no business execution.
 *
 * SAFETY CONTRACT:
 * - In-memory only — no DB, no persistence
 * - Envelopes remain in queue — no dequeue, no removal
 * - No business execution — no signup processing
 * - No timers — no setInterval, no setTimeout, no polling
 * - No V1 coupling — never affects V1 registration
 * - Never throws — every public function is wrapped in try/catch
 */

import { parseEnvBoolean } from './featureFlags.js';
import { getSignupQueueSnapshot } from './queueAdapter.js';
import { createDispatchReceipt } from './dispatchContract.js';
import { createConsumerLease } from './consumerContract.js';

// ─── constants ─────────────────────────────────────────────────────

export const SIGNUP_QUEUE_RESERVATION_RUNTIME_VERSION = 'signup_queue_reservation_v1';

const RESERVATION_STATES = Object.freeze({
  RESERVED: 'reserved',
  RELEASED: 'released',
  EXPIRED: 'expired',
});

// ─── in-memory reservation registry ────────────────────────────────

/** @type {Map<string, Record<string, unknown>>} active reservations keyed by envelope_id */
const _activeReservations = new Map();

/** @type {Map<string, Record<string, unknown>>} released/expired reservations keyed by reservation_id */
const _releasedReservations = new Map();

let _reservationSeq = 0;

// ─── stdout logging (opt-in) ───────────────────────────────────────

function emitReservationStdout(payload) {
  try {
    if (!parseEnvBoolean(process.env.SIGNUP_QUEUE_RESERVATION_STDOUT, false)) return;
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      event: 'signup_queue_reservation',
      version: SIGNUP_QUEUE_RESERVATION_RUNTIME_VERSION,
      ...payload,
    }));
  } catch (_) { /* noop */ }
}

// ─── reserve ───────────────────────────────────────────────────────

/**
 * Reserve an envelope from a queue snapshot. The envelope remains in the
 * queue — this only creates an in-memory ownership lock.
 *
 * @param {{
 *   queue_name?: string,
 *   envelope_id: string,
 *   runtime_id?: string,
 *   consumer_id?: string,
 *   metadata?: Record<string, unknown>
 * }} input
 * @returns {{
 *   reserved: boolean,
 *   reservation: Record<string, unknown> | null,
 *   dispatch_receipt: Record<string, unknown> | null,
 *   consumer_lease: Record<string, unknown> | null,
 *   reason: string
 * }}
 */
export function reserveSignupQueueEnvelope(input) {
  try {
    if (!input || typeof input !== 'object' || !input.envelope_id) {
      return { reserved: false, reservation: null, dispatch_receipt: null, consumer_lease: null, reason: 'invalid_input' };
    }

    const envelopeId = String(input.envelope_id);
    const queueName = input.queue_name || 'signup_v2_jobs';

    if (_activeReservations.has(envelopeId)) {
      return { reserved: false, reservation: null, dispatch_receipt: null, consumer_lease: null, reason: 'already_reserved' };
    }

    const snapshot = getSignupQueueSnapshot(queueName);
    const found = snapshot?.envelopes?.find(e => e.envelope_id === envelopeId);
    if (!found) {
      return { reserved: false, reservation: null, dispatch_receipt: null, consumer_lease: null, reason: 'envelope_not_found' };
    }

    const now = new Date().toISOString();
    const consumerId = input.consumer_id || 'reservation-runtime';

    const receipt = createDispatchReceipt({
      state: 'accepted',
      queue_name: queueName,
      envelope_id: envelopeId,
      metadata: { reservation: true },
    });

    const lease = createConsumerLease({
      queue_name: queueName,
      envelope_id: envelopeId,
      consumer_id: consumerId,
      lease_timeout_ms: 30000,
      metadata: { reservation: true },
    });

    const reservation = {
      reservation_id: `rsv-${Date.now()}-${++_reservationSeq}`,
      runtime_id: input.runtime_id || null,
      queue_name: queueName,
      envelope_id: envelopeId,
      dispatch_id: receipt?.dispatch_id || null,
      consumer_id: consumerId,
      reserved_at: now,
      released_at: null,
      state: RESERVATION_STATES.RESERVED,
      metadata: (input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata))
        ? input.metadata
        : {},
    };

    _activeReservations.set(envelopeId, reservation);

    emitReservationStdout({
      action: 'reserve',
      reservation_id: reservation.reservation_id,
      envelope_id: envelopeId,
      queue_name: queueName,
    });

    return {
      reserved: true,
      reservation: { ...reservation },
      dispatch_receipt: receipt,
      consumer_lease: lease,
      reason: 'ok',
    };
  } catch (_) {
    return { reserved: false, reservation: null, dispatch_receipt: null, consumer_lease: null, reason: 'unexpected_error' };
  }
}

// ─── release ───────────────────────────────────────────────────────

/**
 * Release a reservation, removing active ownership lock.
 *
 * @param {{ envelope_id: string }} input
 * @returns {{ released: boolean, reservation: Record<string, unknown> | null, reason: string }}
 */
export function releaseSignupQueueReservation(input) {
  try {
    if (!input || !input.envelope_id) {
      return { released: false, reservation: null, reason: 'invalid_input' };
    }

    const envelopeId = String(input.envelope_id);

    if (!_activeReservations.has(envelopeId)) {
      return { released: false, reservation: null, reason: 'not_reserved' };
    }

    const reservation = _activeReservations.get(envelopeId);
    const released = {
      ...reservation,
      state: RESERVATION_STATES.RELEASED,
      released_at: new Date().toISOString(),
    };

    _activeReservations.delete(envelopeId);
    _releasedReservations.set(released.reservation_id, released);

    emitReservationStdout({
      action: 'release',
      reservation_id: released.reservation_id,
      envelope_id: envelopeId,
    });

    return { released: true, reservation: { ...released }, reason: 'ok' };
  } catch (_) {
    return { released: false, reservation: null, reason: 'unexpected_error' };
  }
}

// ─── inspection helpers ────────────────────────────────────────────

/**
 * List all active reservations as immutable snapshots.
 *
 * @returns {Record<string, unknown>[]}
 */
export function listSignupQueueReservations() {
  try {
    const result = [];
    for (const entry of _activeReservations.values()) {
      result.push({ ...entry });
    }
    return result;
  } catch (_) {
    return [];
  }
}

/**
 * Get a reservation by envelope ID.
 *
 * @param {string} envelopeId
 * @returns {Record<string, unknown> | null}
 */
export function getSignupQueueReservation(envelopeId) {
  try {
    if (!envelopeId || typeof envelopeId !== 'string') return null;
    const entry = _activeReservations.get(envelopeId);
    if (!entry) return null;
    return { ...entry };
  } catch (_) {
    return null;
  }
}

/**
 * Inspect the full reservation state.
 *
 * @returns {{
 *   active_reservations: number,
 *   released_reservations: number,
 *   reserved_envelope_ids: string[],
 *   queue_names: string[]
 * }}
 */
export function inspectReservedQueueState() {
  try {
    const envelopeIds = [];
    const queueNameSet = new Set();

    for (const [envId, rsv] of _activeReservations) {
      envelopeIds.push(envId);
      if (rsv.queue_name) queueNameSet.add(rsv.queue_name);
    }

    return {
      active_reservations: _activeReservations.size,
      released_reservations: _releasedReservations.size,
      reserved_envelope_ids: envelopeIds,
      queue_names: Array.from(queueNameSet),
    };
  } catch (_) {
    return {
      active_reservations: 0,
      released_reservations: 0,
      reserved_envelope_ids: [],
      queue_names: [],
    };
  }
}
