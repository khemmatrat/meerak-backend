/**
 * Phase 4.10 — Execution window coordinator.
 *
 * Bounded execution sessions that track lifecycle progression, executed
 * envelopes, and window state. Each window processes at most a configured
 * max count and must be explicitly invoked — no autonomous draining.
 *
 * SAFETY CONTRACT:
 * - Bounded — at most max_executions per window
 * - Append-only — window snapshots stored, never modified
 * - Non-destructive — queue entries never dequeued or removed
 * - No timers — no setInterval, no setTimeout, no polling
 * - No worker_threads — runs in main thread
 * - No V1 coupling — never affects V1 registration
 * - No DB writes — fully in-memory
 * - Never throws — every public function is wrapped in try/catch
 */

import { parseEnvBoolean } from './featureFlags.js';
import { listSignupQueueReservations } from './queueReservationRuntime.js';
import { executeSingleActiveEnvelope, isActiveDispatchRuntimeEnabled } from './activeDispatchRuntime.js';
import { commitExecutionArtifacts } from './executionCommitCoordinator.js';
import { advanceRuntimeLifecycle } from './runtimeLifecycleCoordinator.js';

// ─── constants ─────────────────────────────────────────────────────

export const SIGNUP_EXECUTION_WINDOW_COORDINATOR_VERSION = 'signup_execution_window_v1';

const WINDOW_STATES = Object.freeze({
  ACTIVE: 'active',
  PAUSED: 'paused',
  EXHAUSTED: 'exhausted',
  CLOSED: 'closed',
  NOOP_WINDOW: 'noop_window',
});

const DEFAULT_MAX_EXECUTIONS = 1;

// ─── in-memory window registry ─────────────────────────────────────

/** @type {Map<string, Record<string, unknown>>} keyed by window_id */
const _windowRegistry = new Map();

let _windowSeq = 0;

// ─── stdout logging (opt-in) ───────────────────────────────────────

function emitWindowStdout(payload) {
  try {
    if (!parseEnvBoolean(process.env.SIGNUP_EXECUTION_WINDOW_STDOUT, false)) return;
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      event: 'signup_execution_window',
      version: SIGNUP_EXECUTION_WINDOW_COORDINATOR_VERSION,
      ...payload,
    }));
  } catch (_) { /* noop */ }
}

// ─── eligibility ───────────────────────────────────────────────────

/**
 * Check whether an execution window can be created or continued.
 *
 * @param {{ max_executions?: number }} [input]
 * @returns {{ eligible: boolean, reason: string }}
 */
export function isExecutionWindowEligible(input) {
  try {
    if (!isActiveDispatchRuntimeEnabled()) {
      return { eligible: false, reason: 'dispatch_runtime_disabled' };
    }
    const reservations = listSignupQueueReservations();
    if (reservations.length === 0) {
      return { eligible: false, reason: 'no_reservations' };
    }
    return { eligible: true, reason: 'ok' };
  } catch (_) {
    return { eligible: false, reason: 'unexpected_error' };
  }
}

// ─── window creation ───────────────────────────────────────────────

/**
 * Create a new bounded execution window.
 *
 * @param {{
 *   max_executions?: number,
 *   runtime_id?: string,
 *   queue_name?: string,
 *   noop?: boolean,
 *   metadata?: Record<string, unknown>
 * }} [input]
 * @returns {{
 *   created: boolean,
 *   window_id: string | null,
 *   window_state: string | null,
 *   reason: string
 * }}
 */
export function createExecutionWindow(input) {
  try {
    const isNoop = input?.noop !== false;
    const maxExec = typeof input?.max_executions === 'number' && Number.isFinite(input.max_executions)
      ? Math.max(1, Math.floor(input.max_executions))
      : DEFAULT_MAX_EXECUTIONS;

    const windowId = `win-${Date.now()}-${++_windowSeq}`;
    const now = new Date().toISOString();

    const state = isNoop ? WINDOW_STATES.NOOP_WINDOW : WINDOW_STATES.ACTIVE;

    const window = {
      window_id: windowId,
      window_version: SIGNUP_EXECUTION_WINDOW_COORDINATOR_VERSION,
      window_state: state,
      runtime_id: input?.runtime_id || null,
      queue_name: input?.queue_name || 'signup_v2_jobs',
      max_executions: maxExec,
      executed_count: 0,
      executed_envelopes: [],
      created_at: now,
      closed_at: null,
      metadata: (input?.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata))
        ? input.metadata
        : { noop: isNoop },
    };

    _windowRegistry.set(windowId, window);

    emitWindowStdout({ action: 'create', window_id: windowId, window_state: state, max_executions: maxExec });

    return { created: true, window_id: windowId, window_state: state, reason: 'ok' };
  } catch (_) {
    return { created: false, window_id: null, window_state: null, reason: 'unexpected_error' };
  }
}

// ─── window cycle execution ────────────────────────────────────────

/**
 * Execute one cycle within a bounded window. Processes at most one
 * envelope per call and tracks progress against max_executions.
 *
 * @param {{ window_id: string, noop?: boolean }} input
 * @returns {{
 *   executed: boolean,
 *   window_id: string,
 *   window_state: string | null,
 *   executed_count: number,
 *   envelope_id: string | null,
 *   reason: string
 * }}
 */
export function executeWindowCycle(input) {
  try {
    if (!input || !input.window_id) {
      return { executed: false, window_id: '', window_state: null, executed_count: 0, envelope_id: null, reason: 'invalid_input' };
    }

    const windowId = String(input.window_id);
    const window = _windowRegistry.get(windowId);
    if (!window) {
      return { executed: false, window_id: windowId, window_state: null, executed_count: 0, envelope_id: null, reason: 'window_not_found' };
    }

    if (window.window_state === WINDOW_STATES.CLOSED || window.window_state === WINDOW_STATES.EXHAUSTED) {
      return { executed: false, window_id: windowId, window_state: window.window_state, executed_count: window.executed_count, envelope_id: null, reason: 'window_not_active' };
    }

    if (window.executed_count >= window.max_executions) {
      window.window_state = WINDOW_STATES.EXHAUSTED;
      emitWindowStdout({ action: 'cycle', window_id: windowId, outcome: 'exhausted', executed_count: window.executed_count });
      return { executed: false, window_id: windowId, window_state: WINDOW_STATES.EXHAUSTED, executed_count: window.executed_count, envelope_id: null, reason: 'max_executions_reached' };
    }

    if (window.window_state === WINDOW_STATES.NOOP_WINDOW || input.noop === true) {
      window.executed_count++;
      const envelopeId = `noop-${windowId}-${window.executed_count}`;
      window.executed_envelopes.push(envelopeId);
      if (window.executed_count >= window.max_executions) {
        window.window_state = WINDOW_STATES.EXHAUSTED;
      }
      emitWindowStdout({ action: 'cycle', window_id: windowId, outcome: 'noop', executed_count: window.executed_count });
      return { executed: true, window_id: windowId, window_state: window.window_state, executed_count: window.executed_count, envelope_id: envelopeId, reason: 'noop_executed' };
    }

    const reservations = listSignupQueueReservations();
    if (reservations.length === 0) {
      emitWindowStdout({ action: 'cycle', window_id: windowId, outcome: 'no_reservations' });
      return { executed: false, window_id: windowId, window_state: window.window_state, executed_count: window.executed_count, envelope_id: null, reason: 'no_reservations' };
    }

    const first = reservations[0];
    const execResult = executeSingleActiveEnvelope({
      envelope_id: first.envelope_id,
      queue_name: window.queue_name,
      runtime_id: window.runtime_id,
      noop: false,
    });

    if (!execResult.executed) {
      emitWindowStdout({ action: 'cycle', window_id: windowId, outcome: 'exec_failed', reason: execResult.reason });
      return { executed: false, window_id: windowId, window_state: window.window_state, executed_count: window.executed_count, envelope_id: first.envelope_id, reason: execResult.reason };
    }

    commitExecutionArtifacts({
      envelope_id: execResult.envelope_id,
      dispatch_receipt: execResult.dispatch_receipt,
      consumer_lease: execResult.consumer_lease,
      execution_result: execResult.execution_result,
      executed: true,
      runtime_id: window.runtime_id,
    });

    advanceRuntimeLifecycle({ runtime_id: window.runtime_id, noop: false });

    window.executed_count++;
    window.executed_envelopes.push(first.envelope_id);
    if (window.executed_count >= window.max_executions) {
      window.window_state = WINDOW_STATES.EXHAUSTED;
    }

    emitWindowStdout({ action: 'cycle', window_id: windowId, outcome: 'executed', envelope_id: first.envelope_id, executed_count: window.executed_count });

    return {
      executed: true,
      window_id: windowId,
      window_state: window.window_state,
      executed_count: window.executed_count,
      envelope_id: first.envelope_id,
      reason: 'ok',
    };
  } catch (_) {
    return { executed: false, window_id: input?.window_id || '', window_state: null, executed_count: 0, envelope_id: null, reason: 'unexpected_error' };
  }
}

// ─── window close ──────────────────────────────────────────────────

/**
 * Close an execution window.
 *
 * @param {{ window_id: string }} input
 * @returns {{ closed: boolean, window_id: string, reason: string }}
 */
export function closeExecutionWindow(input) {
  try {
    if (!input || !input.window_id) {
      return { closed: false, window_id: '', reason: 'invalid_input' };
    }

    const windowId = String(input.window_id);
    const window = _windowRegistry.get(windowId);
    if (!window) {
      return { closed: false, window_id: windowId, reason: 'window_not_found' };
    }

    if (window.window_state === WINDOW_STATES.CLOSED) {
      return { closed: true, window_id: windowId, reason: 'already_closed' };
    }

    window.window_state = WINDOW_STATES.CLOSED;
    window.closed_at = new Date().toISOString();

    emitWindowStdout({ action: 'close', window_id: windowId, executed_count: window.executed_count });

    return { closed: true, window_id: windowId, reason: 'ok' };
  } catch (_) {
    return { closed: false, window_id: input?.window_id || '', reason: 'unexpected_error' };
  }
}

// ─── inspection ────────────────────────────────────────────────────

/**
 * Inspect all execution windows.
 *
 * @param {{ runtime_id?: string }} [input]
 * @returns {{
 *   total_windows: number,
 *   active_count: number,
 *   exhausted_count: number,
 *   closed_count: number,
 *   noop_count: number,
 *   total_executions: number,
 *   windows: Array<Record<string, unknown>>
 * }}
 */
export function inspectExecutionWindows(input) {
  try {
    const runtimeId = input?.runtime_id || null;
    let active = 0, exhausted = 0, closed = 0, noop = 0, totalExec = 0;
    const windows = [];

    for (const win of _windowRegistry.values()) {
      if (runtimeId && win.runtime_id !== runtimeId) continue;
      windows.push({ ...win, executed_envelopes: [...(win.executed_envelopes || [])] });
      totalExec += win.executed_count || 0;

      switch (win.window_state) {
        case WINDOW_STATES.ACTIVE: active++; break;
        case WINDOW_STATES.EXHAUSTED: exhausted++; break;
        case WINDOW_STATES.CLOSED: closed++; break;
        case WINDOW_STATES.NOOP_WINDOW: noop++; break;
        case WINDOW_STATES.PAUSED: active++; break;
      }
    }

    return { total_windows: windows.length, active_count: active, exhausted_count: exhausted, closed_count: closed, noop_count: noop, total_executions: totalExec, windows };
  } catch (_) {
    return { total_windows: 0, active_count: 0, exhausted_count: 0, closed_count: 0, noop_count: 0, total_executions: 0, windows: [] };
  }
}
