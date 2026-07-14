/**
 * Phase 4.8 — Execution commit coordinator.
 *
 * Deterministic commit coordination for active dispatch execution artifacts.
 * Creates immutable committed snapshots from execution results without
 * mutating queues, triggering retries, or enqueuing new jobs.
 *
 * SAFETY CONTRACT:
 * - Append-only — committed snapshots are stored, never updated or deleted
 * - Non-destructive — original artifacts are never mutated
 * - No queue mutation — no enqueue, no dequeue, no deletion
 * - No retry execution — commit decisions are recorded, not acted upon
 * - No timers — no setInterval, no setTimeout, no polling
 * - No worker_threads — runs in main thread
 * - No V1 coupling — never affects V1 registration
 * - No DB writes — fully in-memory
 * - Never throws — every public function is wrapped in try/catch
 */

import { parseEnvBoolean } from './featureFlags.js';

// ─── constants ─────────────────────────────────────────────────────

export const SIGNUP_EXECUTION_COMMIT_COORDINATOR_VERSION = 'signup_execution_commit_v1';

const COMMIT_STATES = Object.freeze({
  COMMITTED: 'committed',
  REPLAYABLE: 'replayable',
  RETRYABLE: 'retryable',
  ABANDONED: 'abandoned',
  NOOP_COMMIT: 'noop_commit',
});

// ─── in-memory commit registry ─────────────────────────────────────

/** @type {Map<string, Record<string, unknown>>} keyed by commit_id */
const _commitRegistry = new Map();

let _commitSeq = 0;

// ─── stdout logging (opt-in) ───────────────────────────────────────

function emitCommitStdout(payload) {
  try {
    if (!parseEnvBoolean(process.env.SIGNUP_EXECUTION_COMMIT_STDOUT, false)) return;
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      event: 'signup_execution_commit',
      version: SIGNUP_EXECUTION_COMMIT_COORDINATOR_VERSION,
      ...payload,
    }));
  } catch (_) { /* noop */ }
}

// ─── commit eligibility ────────────────────────────────────────────

/**
 * Check whether an execution artifact is eligible for commit.
 *
 * @param {{
 *   executed?: boolean,
 *   execution_result?: { state?: string, metadata?: Record<string, unknown> },
 *   envelope_id?: string
 * }} input
 * @returns {{ eligible: boolean, reason: string }}
 */
export function isExecutionCommitEligible(input) {
  try {
    if (!input || typeof input !== 'object') {
      return { eligible: false, reason: 'invalid_input' };
    }
    if (!input.envelope_id) {
      return { eligible: false, reason: 'missing_envelope_id' };
    }
    if (input.executed !== true) {
      return { eligible: false, reason: 'not_executed' };
    }
    if (!input.execution_result || typeof input.execution_result !== 'object') {
      return { eligible: false, reason: 'missing_execution_result' };
    }
    return { eligible: true, reason: 'ok' };
  } catch (_) {
    return { eligible: false, reason: 'unexpected_error' };
  }
}

// ─── commit decision derivation ────────────────────────────────────

/**
 * Derive the commit state for an execution artifact.
 *
 * @param {{
 *   execution_result?: { state?: string, metadata?: Record<string, unknown> },
 *   retryable?: boolean,
 *   should_dead_letter?: boolean
 * }} input
 * @returns {{ commit_state: string, reason: string }}
 */
export function deriveCommitDecision(input) {
  try {
    if (!input || typeof input !== 'object') {
      return { commit_state: COMMIT_STATES.ABANDONED, reason: 'invalid_input' };
    }

    const execState = input.execution_result?.state;
    const isNoop = input.execution_result?.metadata?.noop === true;

    if (isNoop) {
      return { commit_state: COMMIT_STATES.NOOP_COMMIT, reason: 'noop_execution' };
    }

    if (execState === 'succeeded') {
      return { commit_state: COMMIT_STATES.COMMITTED, reason: 'execution_succeeded' };
    }

    if (execState === 'dead_lettered') {
      return { commit_state: COMMIT_STATES.ABANDONED, reason: 'dead_lettered' };
    }

    if (execState === 'abandoned') {
      return { commit_state: COMMIT_STATES.ABANDONED, reason: 'execution_abandoned' };
    }

    if (input.retryable === true || execState === 'retryable') {
      return { commit_state: COMMIT_STATES.RETRYABLE, reason: 'retry_eligible' };
    }

    if (execState === 'failed') {
      return { commit_state: COMMIT_STATES.REPLAYABLE, reason: 'execution_failed' };
    }

    return { commit_state: COMMIT_STATES.NOOP_COMMIT, reason: 'unknown_state' };
  } catch (_) {
    return { commit_state: COMMIT_STATES.ABANDONED, reason: 'unexpected_error' };
  }
}

// ─── commit execution ──────────────────────────────────────────────

/**
 * Commit execution artifacts into the append-only commit registry.
 * Creates an immutable committed snapshot. Never mutates originals.
 * Single execution per invocation.
 *
 * @param {{
 *   envelope_id: string,
 *   dispatch_receipt?: Record<string, unknown>,
 *   consumer_lease?: Record<string, unknown>,
 *   execution_result?: Record<string, unknown>,
 *   executed?: boolean,
 *   runtime_id?: string,
 *   metadata?: Record<string, unknown>
 * }} input
 * @returns {{
 *   committed: boolean,
 *   commit_id: string | null,
 *   commit_state: string | null,
 *   reason: string
 * }}
 */
export function commitExecutionArtifacts(input) {
  try {
    const eligibility = isExecutionCommitEligible(input);
    if (!eligibility.eligible) {
      return { committed: false, commit_id: null, commit_state: null, reason: eligibility.reason };
    }

    const decision = deriveCommitDecision({
      execution_result: input.execution_result,
      retryable: false,
    });

    const now = new Date().toISOString();
    const commitId = `commit-${Date.now()}-${++_commitSeq}`;

    const snapshot = {
      commit_id: commitId,
      commit_version: SIGNUP_EXECUTION_COMMIT_COORDINATOR_VERSION,
      commit_state: decision.commit_state,
      commit_reason: decision.reason,
      envelope_id: String(input.envelope_id),
      runtime_id: input.runtime_id || null,
      dispatch_receipt: input.dispatch_receipt ? { ...input.dispatch_receipt } : null,
      consumer_lease: input.consumer_lease ? { ...input.consumer_lease } : null,
      execution_result: input.execution_result ? { ...input.execution_result } : null,
      committed_at: now,
      metadata: {
        ...(input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata) ? input.metadata : {}),
      },
    };

    _commitRegistry.set(commitId, snapshot);

    emitCommitStdout({
      action: 'commit',
      commit_id: commitId,
      commit_state: decision.commit_state,
      envelope_id: input.envelope_id,
      reason: decision.reason,
    });

    return {
      committed: true,
      commit_id: commitId,
      commit_state: decision.commit_state,
      reason: 'ok',
    };
  } catch (_) {
    return { committed: false, commit_id: null, commit_state: null, reason: 'unexpected_error' };
  }
}

// ─── inspection ────────────────────────────────────────────────────

/**
 * Inspect all committed execution snapshots.
 *
 * @param {{ runtime_id?: string }} [input]
 * @returns {{
 *   total_commits: number,
 *   committed_count: number,
 *   noop_count: number,
 *   replayable_count: number,
 *   retryable_count: number,
 *   abandoned_count: number,
 *   commits: Array<Record<string, unknown>>
 * }}
 */
export function inspectCommittedExecutions(input) {
  try {
    const runtimeId = input?.runtime_id || null;
    let committed = 0;
    let noop = 0;
    let replayable = 0;
    let retryable = 0;
    let abandoned = 0;
    const commits = [];

    for (const snapshot of _commitRegistry.values()) {
      if (runtimeId && snapshot.runtime_id !== runtimeId) continue;

      commits.push({ ...snapshot });

      switch (snapshot.commit_state) {
        case COMMIT_STATES.COMMITTED: committed++; break;
        case COMMIT_STATES.NOOP_COMMIT: noop++; break;
        case COMMIT_STATES.REPLAYABLE: replayable++; break;
        case COMMIT_STATES.RETRYABLE: retryable++; break;
        case COMMIT_STATES.ABANDONED: abandoned++; break;
      }
    }

    return {
      total_commits: commits.length,
      committed_count: committed,
      noop_count: noop,
      replayable_count: replayable,
      retryable_count: retryable,
      abandoned_count: abandoned,
      commits,
    };
  } catch (_) {
    return { total_commits: 0, committed_count: 0, noop_count: 0, replayable_count: 0, retryable_count: 0, abandoned_count: 0, commits: [] };
  }
}
