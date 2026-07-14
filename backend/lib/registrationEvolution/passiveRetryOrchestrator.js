/**
 * Phase 4.5 — Passive retry orchestration runtime (analysis only, no scheduling).
 *
 * Inspects replay/recovery artifacts, evaluates retry policies, and derives
 * immutable retry orchestration artifacts with delay recommendations.
 * Never schedules retries, never enqueues, never executes.
 *
 * SAFETY CONTRACT:
 * - In-memory only — no DB, no persistence
 * - No retry scheduling — analysis and recommendation only
 * - No queue mutation — no enqueue, no dequeue
 * - No timers — no setTimeout, no setInterval
 * - No auth artifacts — no JWT, no session
 * - No V1 coupling — never affects V1 registration
 * - Never throws — every public function is wrapped in try/catch
 */

import { parseEnvBoolean } from './featureFlags.js';
import { inspectPassiveReplayRecovery } from './passiveReplayRecoveryRuntime.js';
import { createRetryPolicy, shouldRetryDispatch, calculateRetryDelayMs } from './retryPolicy.js';
import { shouldDeadLetterDispatch } from './deadLetterContract.js';

// ─── constants ─────────────────────────────────────────────────────

export const SIGNUP_PASSIVE_RETRY_RUNTIME_VERSION = 'signup_passive_retry_v1';

export const SIGNUP_RETRY_ORCHESTRATION_REASONS = Object.freeze({
  RETRY_ALLOWED: 'retry_allowed',
  RETRY_DENIED: 'retry_denied',
  MAX_ATTEMPTS_REACHED: 'max_attempts_reached',
  NON_RETRYABLE_FAILURE: 'non_retryable_failure',
  DEAD_LETTER_REQUIRED: 'dead_letter_required',
  RUNTIME_UNAVAILABLE: 'runtime_unavailable',
});

let _retrySeq = 0;

// ─── stdout logging (opt-in) ───────────────────────────────────────

function emitRetryStdout(payload) {
  try {
    if (!parseEnvBoolean(process.env.SIGNUP_PASSIVE_RETRY_STDOUT, false)) return;
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      event: 'signup_passive_retry',
      version: SIGNUP_PASSIVE_RETRY_RUNTIME_VERSION,
      ...payload,
    }));
  } catch (_) { /* noop */ }
}

// ─── retry decision evaluation ─────────────────────────────────────

/**
 * Evaluate a passive retry decision for a single artifact.
 *
 * @param {{
 *   current_attempt?: number,
 *   failure_reason?: string,
 *   replayable?: boolean,
 *   recoverable?: boolean,
 *   execution_state?: string,
 *   runtime_state?: string,
 *   policy?: ReturnType<import('./retryPolicy.js').createRetryPolicy>
 * }} input
 * @returns {{
 *   retryable: boolean,
 *   should_dead_letter: boolean,
 *   next_attempt: number | null,
 *   recommended_delay_ms: number | null,
 *   reason: string | null
 * }}
 */
export function evaluatePassiveRetryDecision(input) {
  try {
    if (!input || typeof input !== 'object') {
      return { retryable: false, should_dead_letter: false, next_attempt: null, recommended_delay_ms: null, reason: null };
    }

    if (input.runtime_state === 'shutdown') {
      return { retryable: false, should_dead_letter: false, next_attempt: null, recommended_delay_ms: null, reason: SIGNUP_RETRY_ORCHESTRATION_REASONS.RUNTIME_UNAVAILABLE };
    }

    if (input.execution_state === 'dead_lettered') {
      return { retryable: false, should_dead_letter: false, next_attempt: null, recommended_delay_ms: null, reason: SIGNUP_RETRY_ORCHESTRATION_REASONS.RETRY_DENIED };
    }

    if (input.execution_state === 'succeeded') {
      return { retryable: false, should_dead_letter: false, next_attempt: null, recommended_delay_ms: null, reason: SIGNUP_RETRY_ORCHESTRATION_REASONS.RETRY_DENIED };
    }

    const policy = input.policy || createRetryPolicy({});
    if (!policy) {
      return { retryable: false, should_dead_letter: false, next_attempt: null, recommended_delay_ms: null, reason: SIGNUP_RETRY_ORCHESTRATION_REASONS.RETRY_DENIED };
    }

    const currentAttempt = typeof input.current_attempt === 'number' ? input.current_attempt : 0;
    const failureReason = input.failure_reason || 'unknown';

    const retryDecision = shouldRetryDispatch({
      current_attempt: currentAttempt,
      failure_reason: failureReason,
      policy,
    });

    const dlDecision = shouldDeadLetterDispatch({
      retry_decision: retryDecision,
      failure_reason: failureReason,
    });

    if (dlDecision.dead_letter) {
      return {
        retryable: false,
        should_dead_letter: true,
        next_attempt: null,
        recommended_delay_ms: null,
        reason: SIGNUP_RETRY_ORCHESTRATION_REASONS.DEAD_LETTER_REQUIRED,
      };
    }

    if (!retryDecision.retry) {
      const reason = retryDecision.reason === 'max_attempts_reached'
        ? SIGNUP_RETRY_ORCHESTRATION_REASONS.MAX_ATTEMPTS_REACHED
        : retryDecision.reason?.startsWith('non_retryable')
          ? SIGNUP_RETRY_ORCHESTRATION_REASONS.NON_RETRYABLE_FAILURE
          : SIGNUP_RETRY_ORCHESTRATION_REASONS.RETRY_DENIED;

      return { retryable: false, should_dead_letter: false, next_attempt: null, recommended_delay_ms: null, reason };
    }

    const delayMs = calculateRetryDelayMs(
      policy.strategy,
      retryDecision.next_attempt,
      policy.base_delay_ms,
      policy.max_delay_ms,
    );

    return {
      retryable: true,
      should_dead_letter: false,
      next_attempt: retryDecision.next_attempt,
      recommended_delay_ms: delayMs,
      reason: SIGNUP_RETRY_ORCHESTRATION_REASONS.RETRY_ALLOWED,
    };
  } catch (_) {
    return { retryable: false, should_dead_letter: false, next_attempt: null, recommended_delay_ms: null, reason: null };
  }
}

// ─── artifact builder ──────────────────────────────────────────────

function buildRetryArtifact(replayArtifact, runtimeId) {
  try {
    const now = new Date().toISOString();

    const decision = evaluatePassiveRetryDecision({
      current_attempt: 0,
      failure_reason: replayArtifact?.recovery_reason || 'unknown',
      replayable: replayArtifact?.replayable || false,
      recoverable: replayArtifact?.recoverable || false,
    });

    return {
      retry_id: `retry-${Date.now()}-${++_retrySeq}`,
      runtime_id: runtimeId || null,
      envelope_id: replayArtifact?.envelope_id || null,
      dispatch_id: null,
      recommended_attempt: decision.next_attempt,
      recommended_delay_ms: decision.recommended_delay_ms,
      retryable: decision.retryable,
      should_dead_letter: decision.should_dead_letter,
      reason: decision.reason,
      evaluated_at: now,
      metadata: { passive: true, noop: true },
    };
  } catch (_) {
    return null;
  }
}

// ─── public API ────────────────────────────────────────────────────

/**
 * Inspect all replay/recovery artifacts and produce retry orchestration report.
 *
 * @param {{ runtime_id?: string }} [input]
 * @returns {{
 *   runtime_id: string | null,
 *   inspected_at: string,
 *   replay_artifact_count: number,
 *   retryable_count: number,
 *   dead_letter_count: number,
 *   artifacts: Array<Record<string, unknown>>
 * }}
 */
export function inspectPassiveRetryOrchestration(input) {
  try {
    const runtimeId = input?.runtime_id || null;
    const replayReport = inspectPassiveReplayRecovery({ runtime_id: runtimeId });
    const replayArtifacts = replayReport.artifacts || [];

    const artifacts = [];
    let retryableCount = 0;
    let deadLetterCount = 0;

    for (const rpl of replayArtifacts) {
      const artifact = buildRetryArtifact(rpl, runtimeId);
      if (artifact) {
        artifacts.push(artifact);
        if (artifact.retryable) retryableCount++;
        if (artifact.should_dead_letter) deadLetterCount++;
      }
    }

    emitRetryStdout({
      action: 'inspect',
      runtime_id: runtimeId,
      replay_artifact_count: replayArtifacts.length,
      retryable_count: retryableCount,
      dead_letter_count: deadLetterCount,
    });

    return {
      runtime_id: runtimeId,
      inspected_at: new Date().toISOString(),
      replay_artifact_count: replayArtifacts.length,
      retryable_count: retryableCount,
      dead_letter_count: deadLetterCount,
      artifacts,
    };
  } catch (_) {
    return {
      runtime_id: input?.runtime_id || null,
      inspected_at: new Date().toISOString(),
      replay_artifact_count: 0,
      retryable_count: 0,
      dead_letter_count: 0,
      artifacts: [],
    };
  }
}

/**
 * Derive retry orchestration artifacts for all replay/recovery items.
 * Convenience wrapper — returns only the artifacts array.
 *
 * @param {{ runtime_id?: string }} [input]
 * @returns {Array<Record<string, unknown>>}
 */
export function deriveRetryOrchestrationArtifacts(input) {
  try {
    const report = inspectPassiveRetryOrchestration(input);
    return report.artifacts;
  } catch (_) {
    return [];
  }
}
