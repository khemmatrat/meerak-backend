/**
 * Phase 4.1 — Passive dispatch runtime (no business execution).
 *
 * Inspects queue snapshots and produces dispatch artifacts (receipts,
 * leases, noop execution results) WITHOUT consuming, dequeuing, or
 * executing any jobs.
 *
 * SAFETY CONTRACT:
 * - Read-only queue access — never dequeues, never mutates queue state
 * - No business execution — all execution results are noop stubs
 * - No DB writes — fully in-memory
 * - No timers — no setInterval, no setTimeout, no polling
 * - No V1 coupling — never affects V1 registration
 * - Never throws — every public function is wrapped in try/catch
 */

import { parseEnvBoolean } from './featureFlags.js';
import { getSignupQueueSnapshot } from './queueAdapter.js';
import { createDispatchReceipt } from './dispatchContract.js';
import { createConsumerLease } from './consumerContract.js';
import { createExecutionResult, SIGNUP_EXECUTION_RESULT_STATES } from './executionResultContract.js';

// ─── constants ─────────────────────────────────────────────────────

export const SIGNUP_PASSIVE_DISPATCH_RUNTIME_VERSION = 'signup_passive_dispatch_v1';

const DEFAULT_QUEUE_NAME = 'signup_v2_jobs';

// ─── stdout logging (opt-in) ───────────────────────────────────────

function emitPassiveDispatchStdout(payload) {
  try {
    if (!parseEnvBoolean(process.env.SIGNUP_PASSIVE_DISPATCH_STDOUT, false)) return;
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      event: 'signup_passive_dispatch',
      version: SIGNUP_PASSIVE_DISPATCH_RUNTIME_VERSION,
      ...payload,
    }));
  } catch (_) { /* noop */ }
}

// ─── passive inspection ────────────────────────────────────────────

/**
 * Inspect the current queue snapshot and produce passive dispatch artifacts
 * for each envelope. Never dequeues or mutates queue state.
 *
 * @param {{ queue_name?: string, runtime_id?: string }} [input]
 * @returns {{
 *   runtime_id: string | null,
 *   queue_name: string,
 *   inspected_at: string,
 *   queue_depth: number,
 *   artifacts: Array<{
 *     envelope: Record<string, unknown>,
 *     dispatch_receipt: Record<string, unknown>,
 *     consumer_lease: Record<string, unknown>,
 *     execution_result: Record<string, unknown>
 *   }>
 * }}
 */
export function inspectPassiveDispatchCycle(input) {
  try {
    const queueName = input?.queue_name || DEFAULT_QUEUE_NAME;
    const runtimeId = input?.runtime_id || null;
    const now = new Date().toISOString();

    const snapshot = getSignupQueueSnapshot(queueName);
    const envelopes = snapshot?.envelopes || [];

    const artifacts = envelopes.map(envelope => buildPassiveArtifact(envelope, queueName));

    emitPassiveDispatchStdout({
      action: 'inspect',
      runtime_id: runtimeId,
      queue_name: queueName,
      queue_depth: envelopes.length,
      artifact_count: artifacts.length,
    });

    return {
      runtime_id: runtimeId,
      queue_name: queueName,
      inspected_at: now,
      queue_depth: envelopes.length,
      artifacts,
    };
  } catch (_) {
    return {
      runtime_id: input?.runtime_id || null,
      queue_name: input?.queue_name || DEFAULT_QUEUE_NAME,
      inspected_at: new Date().toISOString(),
      queue_depth: 0,
      artifacts: [],
    };
  }
}

/**
 * Derive a summary snapshot of the passive dispatch state.
 *
 * @param {{ queue_name?: string, runtime_id?: string }} [input]
 * @returns {{ runtime_id: string | null, queue_name: string, queue_depth: number, inspected_at: string }}
 */
export function derivePassiveDispatchSnapshot(input) {
  try {
    const queueName = input?.queue_name || DEFAULT_QUEUE_NAME;
    const snapshot = getSignupQueueSnapshot(queueName);

    return {
      runtime_id: input?.runtime_id || null,
      queue_name: queueName,
      queue_depth: snapshot?.depth || 0,
      inspected_at: new Date().toISOString(),
    };
  } catch (_) {
    return {
      runtime_id: input?.runtime_id || null,
      queue_name: input?.queue_name || DEFAULT_QUEUE_NAME,
      queue_depth: 0,
      inspected_at: new Date().toISOString(),
    };
  }
}

/**
 * Create passive dispatch artifacts for all envelopes in a queue snapshot.
 * Convenience wrapper around inspectPassiveDispatchCycle that returns
 * only the artifacts array.
 *
 * @param {{ queue_name?: string }} [input]
 * @returns {Array<{ envelope: Record<string, unknown>, dispatch_receipt: Record<string, unknown>, consumer_lease: Record<string, unknown>, execution_result: Record<string, unknown> }>}
 */
export function createPassiveDispatchArtifacts(input) {
  try {
    const result = inspectPassiveDispatchCycle(input);
    return result.artifacts;
  } catch (_) {
    return [];
  }
}

// ─── internal helpers ──────────────────────────────────────────────

function buildPassiveArtifact(envelope, queueName) {
  const envelopeId = envelope?.envelope_id || null;
  const now = new Date().toISOString();

  const receipt = createDispatchReceipt({
    state: 'accepted',
    queue_name: queueName,
    envelope_id: envelopeId,
    metadata: { passive: true },
  });

  const lease = createConsumerLease({
    queue_name: queueName,
    envelope_id: envelopeId,
    consumer_id: 'passive-inspector',
    lease_timeout_ms: 0,
    metadata: { passive: true },
  });

  const execResult = createExecutionResult({
    envelope_id: envelopeId,
    dispatch_id: receipt?.dispatch_id || null,
    consumer_id: 'passive-inspector',
    state: SIGNUP_EXECUTION_RESULT_STATES.SUCCEEDED,
    started_at: now,
    completed_at: now,
    duration_ms: 0,
    metadata: { noop: true, passive: true },
  });

  return {
    envelope: { ...envelope },
    dispatch_receipt: receipt,
    consumer_lease: lease,
    execution_result: execResult,
  };
}
