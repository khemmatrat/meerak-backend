/**
 * Phase 4.7 — Controlled active dispatch runtime.
 *
 * First controlled active execution path for the registration evolution
 * queue system. Executes AT MOST ONE envelope per invocation, operates
 * only on reserved envelopes, and never destructively modifies queues.
 *
 * SAFETY CONTRACT:
 * - One envelope per cycle — no batch processing, no runaway loops
 * - Reserved envelopes only — never touches unreserved queue entries
 * - Non-destructive — queue entries remain after execution
 * - No polling — single invocation, caller decides when to call
 * - No timers — no setInterval, no setTimeout
 * - No worker_threads — runs in main thread
 * - No V1 coupling — never affects V1 registration
 * - No DB writes — fully in-memory artifacts
 * - Fail-open — never throws, returns structured error results
 */

import { parseEnvBoolean } from './featureFlags.js';
import { getSignupQueueSnapshot } from './queueAdapter.js';
import { listSignupQueueReservations } from './queueReservationRuntime.js';
import { createDispatchReceipt, transitionDispatchReceipt } from './dispatchContract.js';
import { createConsumerLease, transitionConsumerLease } from './consumerContract.js';
import { createExecutionResult, SIGNUP_EXECUTION_RESULT_STATES } from './executionResultContract.js';

// ─── constants ─────────────────────────────────────────────────────

export const SIGNUP_ACTIVE_DISPATCH_RUNTIME_VERSION = 'signup_active_dispatch_v1';

// ─── gating ────────────────────────────────────────────────────────

/**
 * Check whether the active dispatch runtime is enabled.
 * @returns {boolean}
 */
export function isActiveDispatchRuntimeEnabled() {
  try {
    return parseEnvBoolean(process.env.ENABLE_SIGNUP_ACTIVE_DISPATCH_RUNTIME, false);
  } catch (_) {
    return false;
  }
}

// ─── stdout logging (opt-in) ───────────────────────────────────────

function emitActiveStdout(payload) {
  try {
    if (!parseEnvBoolean(process.env.SIGNUP_ACTIVE_DISPATCH_STDOUT, false)) return;
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      event: 'signup_active_dispatch',
      version: SIGNUP_ACTIVE_DISPATCH_RUNTIME_VERSION,
      ...payload,
    }));
  } catch (_) { /* noop */ }
}

// ─── single envelope execution ─────────────────────────────────────

/**
 * Execute a single reserved envelope through the full dispatch lifecycle.
 * Produces cloned, immutable execution artifacts. Never mutates originals.
 * Never deletes queue entries.
 *
 * @param {{
 *   envelope_id: string,
 *   queue_name?: string,
 *   runtime_id?: string,
 *   consumer_id?: string,
 *   noop?: boolean
 * }} input
 * @returns {{
 *   executed: boolean,
 *   envelope_id: string | null,
 *   dispatch_receipt: Record<string, unknown> | null,
 *   consumer_lease: Record<string, unknown> | null,
 *   execution_result: Record<string, unknown> | null,
 *   reason: string
 * }}
 */
export function executeSingleActiveEnvelope(input) {
  try {
    if (!input || typeof input !== 'object' || !input.envelope_id) {
      return { executed: false, envelope_id: null, dispatch_receipt: null, consumer_lease: null, execution_result: null, reason: 'invalid_input' };
    }

    if (!isActiveDispatchRuntimeEnabled()) {
      return { executed: false, envelope_id: input.envelope_id, dispatch_receipt: null, consumer_lease: null, execution_result: null, reason: 'runtime_disabled' };
    }

    const envelopeId = String(input.envelope_id);
    const queueName = input.queue_name || 'signup_v2_jobs';
    const consumerId = input.consumer_id || 'active-dispatch-runtime';
    const isNoop = input.noop !== false;
    const now = new Date().toISOString();

    const reservations = listSignupQueueReservations();
    const reserved = reservations.find(r => r.envelope_id === envelopeId);
    if (!reserved) {
      emitActiveStdout({ action: 'execute_single', envelope_id: envelopeId, outcome: 'not_reserved' });
      return { executed: false, envelope_id: envelopeId, dispatch_receipt: null, consumer_lease: null, execution_result: null, reason: 'envelope_not_reserved' };
    }

    const snapshot = getSignupQueueSnapshot(queueName);
    const envelopeExists = snapshot?.envelopes?.some(e => e.envelope_id === envelopeId);
    if (!envelopeExists) {
      emitActiveStdout({ action: 'execute_single', envelope_id: envelopeId, outcome: 'not_in_queue' });
      return { executed: false, envelope_id: envelopeId, dispatch_receipt: null, consumer_lease: null, execution_result: null, reason: 'envelope_not_in_queue' };
    }

    const receipt = createDispatchReceipt({ state: 'accepted', queue_name: queueName, envelope_id: envelopeId, metadata: { active: true } });
    const queuedReceipt = receipt ? transitionDispatchReceipt(receipt, 'queued') : { receipt: null };
    const dispatchedReceipt = queuedReceipt.receipt ? transitionDispatchReceipt(queuedReceipt.receipt, 'dispatched') : { receipt: null };
    const ackedReceipt = dispatchedReceipt.receipt ? transitionDispatchReceipt(dispatchedReceipt.receipt, 'acknowledged') : { receipt: null };

    const lease = createConsumerLease({ queue_name: queueName, envelope_id: envelopeId, consumer_id: consumerId, state: 'reserved', lease_timeout_ms: 30000, metadata: { active: true } });
    const processingLease = lease ? transitionConsumerLease(lease, 'processing') : { lease: null };
    const ackedLease = processingLease.lease ? transitionConsumerLease(processingLease.lease, 'acknowledged') : { lease: null };

    const execResult = createExecutionResult({
      envelope_id: envelopeId,
      dispatch_id: ackedReceipt.receipt?.dispatch_id || receipt?.dispatch_id || null,
      consumer_id: consumerId,
      state: SIGNUP_EXECUTION_RESULT_STATES.SUCCEEDED,
      started_at: now,
      completed_at: now,
      duration_ms: 0,
      metadata: { noop: isNoop, active: true },
    });

    emitActiveStdout({
      action: 'execute_single',
      envelope_id: envelopeId,
      outcome: 'executed',
      noop: isNoop,
      dispatch_state: ackedReceipt.receipt?.state || 'unknown',
      consumer_state: ackedLease.lease?.state || 'unknown',
      execution_state: execResult?.state || 'unknown',
    });

    return {
      executed: true,
      envelope_id: envelopeId,
      dispatch_receipt: ackedReceipt.receipt || dispatchedReceipt.receipt || receipt,
      consumer_lease: ackedLease.lease || processingLease.lease || lease,
      execution_result: execResult,
      reason: 'ok',
    };
  } catch (_) {
    return { executed: false, envelope_id: input?.envelope_id || null, dispatch_receipt: null, consumer_lease: null, execution_result: null, reason: 'unexpected_error' };
  }
}

// ─── cycle execution ───────────────────────────────────────────────

/**
 * Execute ONE active dispatch cycle: find the first reserved envelope
 * and execute it. AT MOST ONE envelope per invocation.
 *
 * @param {{ queue_name?: string, runtime_id?: string, noop?: boolean }} [input]
 * @returns {{
 *   runtime_id: string | null,
 *   queue_name: string,
 *   executed_at: string,
 *   executed_count: number,
 *   artifacts: Array<Record<string, unknown>>
 * }}
 */
export function executeActiveDispatchCycle(input) {
  try {
    const queueName = input?.queue_name || 'signup_v2_jobs';
    const runtimeId = input?.runtime_id || null;
    const isNoop = input?.noop !== false;
    const now = new Date().toISOString();

    if (!isActiveDispatchRuntimeEnabled()) {
      emitActiveStdout({ action: 'cycle', outcome: 'disabled', runtime_id: runtimeId });
      return { runtime_id: runtimeId, queue_name: queueName, executed_at: now, executed_count: 0, artifacts: [] };
    }

    const reservations = listSignupQueueReservations();
    if (reservations.length === 0) {
      emitActiveStdout({ action: 'cycle', outcome: 'no_reservations', runtime_id: runtimeId });
      return { runtime_id: runtimeId, queue_name: queueName, executed_at: now, executed_count: 0, artifacts: [] };
    }

    const first = reservations[0];
    const result = executeSingleActiveEnvelope({
      envelope_id: first.envelope_id,
      queue_name: queueName,
      runtime_id: runtimeId,
      noop: isNoop,
    });

    const artifacts = result.executed ? [{
      envelope_id: result.envelope_id,
      dispatch_receipt: result.dispatch_receipt,
      consumer_lease: result.consumer_lease,
      execution_result: result.execution_result,
    }] : [];

    emitActiveStdout({
      action: 'cycle',
      outcome: result.executed ? 'executed' : 'skipped',
      runtime_id: runtimeId,
      envelope_id: first.envelope_id,
      reason: result.reason,
    });

    return {
      runtime_id: runtimeId,
      queue_name: queueName,
      executed_at: now,
      executed_count: artifacts.length,
      artifacts,
    };
  } catch (_) {
    return {
      runtime_id: input?.runtime_id || null,
      queue_name: input?.queue_name || 'signup_v2_jobs',
      executed_at: new Date().toISOString(),
      executed_count: 0,
      artifacts: [],
    };
  }
}

/**
 * Derive active execution artifacts for all reserved envelopes.
 * Unlike executeActiveDispatchCycle (which processes at most one),
 * this produces preview artifacts for ALL reservations without
 * side effects beyond cloned object creation.
 *
 * @param {{ queue_name?: string, runtime_id?: string }} [input]
 * @returns {Array<Record<string, unknown>>}
 */
export function deriveActiveExecutionArtifacts(input) {
  try {
    if (!isActiveDispatchRuntimeEnabled()) return [];

    const queueName = input?.queue_name || 'signup_v2_jobs';
    const reservations = listSignupQueueReservations();
    const artifacts = [];

    for (const rsv of reservations) {
      const result = executeSingleActiveEnvelope({
        envelope_id: rsv.envelope_id,
        queue_name: queueName,
        runtime_id: input?.runtime_id || null,
        noop: true,
      });
      if (result.executed) {
        artifacts.push({
          envelope_id: result.envelope_id,
          dispatch_receipt: result.dispatch_receipt,
          consumer_lease: result.consumer_lease,
          execution_result: result.execution_result,
        });
      }
    }

    return artifacts;
  } catch (_) {
    return [];
  }
}
