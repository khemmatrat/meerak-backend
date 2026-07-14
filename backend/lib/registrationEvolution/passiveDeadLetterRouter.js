/**
 * Phase 4.6 — Passive dead-letter routing runtime (analysis only, no routing).
 *
 * Inspects retry orchestration artifacts, classifies terminal failures,
 * and derives immutable dead-letter routing recommendations.
 * Never routes jobs, never mutates queues, never replays executions.
 *
 * SAFETY CONTRACT:
 * - In-memory only — no DB, no persistence
 * - No DLQ enqueue — recommendation only
 * - No queue mutation — no enqueue, no dequeue, no deletion
 * - No timers — no setTimeout, no setInterval
 * - No auth artifacts — no JWT, no session
 * - No V1 coupling — never affects V1 registration
 * - Never throws — every public function is wrapped in try/catch
 */

import { parseEnvBoolean } from './featureFlags.js';
import { inspectPassiveRetryOrchestration } from './passiveRetryOrchestrator.js';

// ─── constants ─────────────────────────────────────────────────────

export const SIGNUP_PASSIVE_DLQ_RUNTIME_VERSION = 'signup_passive_dlq_v1';

export const SIGNUP_DLQ_ROUTING_REASONS = Object.freeze({
  MAX_ATTEMPTS_EXCEEDED: 'max_attempts_exceeded',
  NON_RETRYABLE_FAILURE: 'non_retryable_failure',
  ABANDONED_EXECUTION: 'abandoned_execution',
  RUNTIME_FAILURE: 'runtime_failure',
  INCONSISTENT_STATE: 'inconsistent_state',
  MANUAL_REVIEW_REQUIRED: 'manual_review_required',
  ALREADY_DEAD_LETTERED: 'already_dead_lettered',
});

let _dlqRouteSeq = 0;

// ─── stdout logging (opt-in) ───────────────────────────────────────

function emitDlqStdout(payload) {
  try {
    if (!parseEnvBoolean(process.env.SIGNUP_PASSIVE_DLQ_STDOUT, false)) return;
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      event: 'signup_passive_dlq',
      version: SIGNUP_PASSIVE_DLQ_RUNTIME_VERSION,
      ...payload,
    }));
  } catch (_) { /* noop */ }
}

// ─── DLQ decision evaluation ───────────────────────────────────────

/**
 * Evaluate a passive dead-letter routing decision for a single artifact.
 *
 * @param {{
 *   retryable?: boolean,
 *   should_dead_letter?: boolean,
 *   reason?: string,
 *   execution_state?: string,
 *   recovery_reason?: string
 * }} input
 * @returns {{ dead_letter: boolean, terminal: boolean, manual_review: boolean, reason: string | null }}
 */
export function evaluatePassiveDeadLetterDecision(input) {
  try {
    if (!input || typeof input !== 'object') {
      return { dead_letter: false, terminal: false, manual_review: false, reason: null };
    }

    if (input.execution_state === 'succeeded') {
      return { dead_letter: false, terminal: false, manual_review: false, reason: null };
    }

    if (input.execution_state === 'dead_lettered') {
      return { dead_letter: false, terminal: true, manual_review: false, reason: SIGNUP_DLQ_ROUTING_REASONS.ALREADY_DEAD_LETTERED };
    }

    if (input.should_dead_letter === true) {
      const reason = input.reason === 'dead_letter_required' || input.reason === 'max_attempts_reached'
        ? SIGNUP_DLQ_ROUTING_REASONS.MAX_ATTEMPTS_EXCEEDED
        : input.reason === 'non_retryable_failure'
          ? SIGNUP_DLQ_ROUTING_REASONS.NON_RETRYABLE_FAILURE
          : SIGNUP_DLQ_ROUTING_REASONS.MAX_ATTEMPTS_EXCEEDED;

      return { dead_letter: true, terminal: true, manual_review: false, reason };
    }

    if (input.recovery_reason === 'abandoned_execution') {
      return { dead_letter: true, terminal: false, manual_review: true, reason: SIGNUP_DLQ_ROUTING_REASONS.ABANDONED_EXECUTION };
    }

    if (input.reason === 'runtime_unavailable') {
      return { dead_letter: true, terminal: false, manual_review: true, reason: SIGNUP_DLQ_ROUTING_REASONS.RUNTIME_FAILURE };
    }

    if (input.recovery_reason === 'inconsistent_state') {
      return { dead_letter: true, terminal: false, manual_review: true, reason: SIGNUP_DLQ_ROUTING_REASONS.INCONSISTENT_STATE };
    }

    if (input.retryable === true) {
      return { dead_letter: false, terminal: false, manual_review: false, reason: null };
    }

    if (input.retryable === false && !input.should_dead_letter) {
      return { dead_letter: false, terminal: false, manual_review: true, reason: SIGNUP_DLQ_ROUTING_REASONS.MANUAL_REVIEW_REQUIRED };
    }

    return { dead_letter: false, terminal: false, manual_review: false, reason: null };
  } catch (_) {
    return { dead_letter: false, terminal: false, manual_review: false, reason: null };
  }
}

// ─── artifact builder ──────────────────────────────────────────────

function buildDlqRoutingArtifact(retryArtifact, runtimeId) {
  try {
    const now = new Date().toISOString();

    const decision = evaluatePassiveDeadLetterDecision({
      retryable: retryArtifact?.retryable || false,
      should_dead_letter: retryArtifact?.should_dead_letter || false,
      reason: retryArtifact?.reason || null,
      recovery_reason: null,
    });

    return {
      dead_letter_routing_id: `dlq-route-${Date.now()}-${++_dlqRouteSeq}`,
      runtime_id: runtimeId || null,
      envelope_id: retryArtifact?.envelope_id || null,
      dispatch_id: retryArtifact?.dispatch_id || null,
      dead_letter: decision.dead_letter,
      terminal: decision.terminal,
      manual_review: decision.manual_review,
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
 * Inspect all retry orchestration artifacts and produce DLQ routing report.
 *
 * @param {{ runtime_id?: string }} [input]
 * @returns {{
 *   runtime_id: string | null,
 *   inspected_at: string,
 *   retry_artifact_count: number,
 *   dead_letter_count: number,
 *   manual_review_count: number,
 *   artifacts: Array<Record<string, unknown>>
 * }}
 */
export function inspectPassiveDeadLetterRouting(input) {
  try {
    const runtimeId = input?.runtime_id || null;
    const retryReport = inspectPassiveRetryOrchestration({ runtime_id: runtimeId });
    const retryArtifacts = retryReport.artifacts || [];

    const artifacts = [];
    let deadLetterCount = 0;
    let manualReviewCount = 0;

    for (const rta of retryArtifacts) {
      const artifact = buildDlqRoutingArtifact(rta, runtimeId);
      if (artifact) {
        artifacts.push(artifact);
        if (artifact.dead_letter) deadLetterCount++;
        if (artifact.manual_review) manualReviewCount++;
      }
    }

    emitDlqStdout({
      action: 'inspect',
      runtime_id: runtimeId,
      retry_artifact_count: retryArtifacts.length,
      dead_letter_count: deadLetterCount,
      manual_review_count: manualReviewCount,
    });

    return {
      runtime_id: runtimeId,
      inspected_at: new Date().toISOString(),
      retry_artifact_count: retryArtifacts.length,
      dead_letter_count: deadLetterCount,
      manual_review_count: manualReviewCount,
      artifacts,
    };
  } catch (_) {
    return {
      runtime_id: input?.runtime_id || null,
      inspected_at: new Date().toISOString(),
      retry_artifact_count: 0,
      dead_letter_count: 0,
      manual_review_count: 0,
      artifacts: [],
    };
  }
}

/**
 * Derive DLQ routing artifacts for all retry orchestration items.
 * Convenience wrapper — returns only the artifacts array.
 *
 * @param {{ runtime_id?: string }} [input]
 * @returns {Array<Record<string, unknown>>}
 */
export function deriveDeadLetterRoutingArtifacts(input) {
  try {
    const report = inspectPassiveDeadLetterRouting(input);
    return report.artifacts;
  } catch (_) {
    return [];
  }
}
