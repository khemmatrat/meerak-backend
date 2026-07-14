/**
 * Phase 4.0 — Passive runtime bootstrap (no job execution).
 *
 * Provides boot/shutdown lifecycle for signup evolution runtime
 * coordinators. Creates a coordinator, transitions it through
 * idle → booting → ready, and registers it in the singleton registry.
 *
 * SAFETY CONTRACT:
 * - No queue consumption — no polling, no dequeue, no workers
 * - No timers — no setInterval, no setTimeout
 * - No DB writes — no persistence
 * - No V1 coupling — fail-open, never affects V1
 * - Never throws — every public function is wrapped in try/catch
 */

import { parseEnvBoolean } from './featureFlags.js';
import {
  createRuntimeCoordinator,
  transitionRuntimeCoordinator,
  SIGNUP_RUNTIME_STATES,
} from './runtimeOrchestratorContract.js';
import {
  registerSignupRuntime,
  getSignupRuntime,
  removeSignupRuntime,
} from './runtimeRegistry.js';
import { SIGNUP_QUEUE_BACKENDS } from './queueAdapter.js';

// ─── constants ─────────────────────────────────────────────────────

export const SIGNUP_RUNTIME_BOOTSTRAP_VERSION = 'signup_runtime_bootstrap_v1';

// ─── stdout logging (opt-in) ───────────────────────────────────────

function emitBootstrapStdout(payload) {
  try {
    if (!parseEnvBoolean(process.env.SIGNUP_RUNTIME_BOOTSTRAP_STDOUT, false)) return;
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      event: 'signup_runtime_bootstrap',
      version: SIGNUP_RUNTIME_BOOTSTRAP_VERSION,
      ...payload,
    }));
  } catch (_) { /* noop */ }
}

// ─── bootstrap ─────────────────────────────────────────────────────

/**
 * Bootstrap a passive signup runtime coordinator.
 *
 * Lifecycle: idle → booting → ready
 *
 * @param {{
 *   queue_backend?: string,
 *   queue_name?: string,
 *   metadata?: Record<string, unknown>
 * }} [opts]
 * @returns {{ bootstrapped: boolean, runtime: Record<string, unknown> | null, reason: string }}
 */
export function bootstrapSignupRuntime(opts) {
  try {
    const queueBackend = opts?.queue_backend || SIGNUP_QUEUE_BACKENDS.MEMORY;
    const queueName = opts?.queue_name || 'signup_v2_jobs';

    const coordinator = createRuntimeCoordinator({
      queue_backend: queueBackend,
      queue_name: queueName,
      metadata: opts?.metadata || {},
    });

    if (!coordinator) {
      emitBootstrapStdout({ action: 'bootstrap', outcome: 'create_failed' });
      return { bootstrapped: false, runtime: null, reason: 'create_failed' };
    }

    const bootResult = transitionRuntimeCoordinator(coordinator, SIGNUP_RUNTIME_STATES.BOOTING);
    if (!bootResult.transitioned) {
      emitBootstrapStdout({ action: 'bootstrap', outcome: 'boot_transition_failed', reason: bootResult.reason });
      return { bootstrapped: false, runtime: null, reason: bootResult.reason };
    }

    const readyResult = transitionRuntimeCoordinator(bootResult.runtime, SIGNUP_RUNTIME_STATES.READY);
    if (!readyResult.transitioned) {
      emitBootstrapStdout({ action: 'bootstrap', outcome: 'ready_transition_failed', reason: readyResult.reason });
      return { bootstrapped: false, runtime: null, reason: readyResult.reason };
    }

    const regResult = registerSignupRuntime(readyResult.runtime);
    if (!regResult.registered) {
      emitBootstrapStdout({ action: 'bootstrap', outcome: 'register_failed', reason: regResult.reason });
      return { bootstrapped: false, runtime: null, reason: regResult.reason };
    }

    emitBootstrapStdout({
      action: 'bootstrap',
      outcome: 'ok',
      runtime_id: readyResult.runtime.runtime_id,
      state: readyResult.runtime.state,
      queue_backend: queueBackend,
      queue_name: queueName,
    });

    return { bootstrapped: true, runtime: { ...readyResult.runtime }, reason: 'ok' };
  } catch (_) {
    emitBootstrapStdout({ action: 'bootstrap', outcome: 'unexpected_error' });
    return { bootstrapped: false, runtime: null, reason: 'unexpected_error' };
  }
}

// ─── shutdown ──────────────────────────────────────────────────────

/**
 * Gracefully shut down a registered runtime coordinator.
 *
 * @param {string} runtimeId
 * @returns {{ shutdown: boolean, runtime: Record<string, unknown> | null, reason: string }}
 */
export function shutdownSignupRuntime(runtimeId) {
  try {
    if (!runtimeId || typeof runtimeId !== 'string') {
      return { shutdown: false, runtime: null, reason: 'invalid_runtime_id' };
    }

    const current = getSignupRuntime(runtimeId);
    if (!current) {
      return { shutdown: false, runtime: null, reason: 'runtime_not_found' };
    }

    const shutdownResult = transitionRuntimeCoordinator(current, SIGNUP_RUNTIME_STATES.SHUTDOWN);
    if (!shutdownResult.transitioned) {
      emitBootstrapStdout({ action: 'shutdown', outcome: 'transition_failed', runtime_id: runtimeId, reason: shutdownResult.reason });
      return { shutdown: false, runtime: null, reason: shutdownResult.reason };
    }

    removeSignupRuntime(runtimeId);

    emitBootstrapStdout({
      action: 'shutdown',
      outcome: 'ok',
      runtime_id: runtimeId,
      state: shutdownResult.runtime.state,
    });

    return { shutdown: true, runtime: { ...shutdownResult.runtime }, reason: 'ok' };
  } catch (_) {
    emitBootstrapStdout({ action: 'shutdown', outcome: 'unexpected_error', runtime_id: runtimeId });
    return { shutdown: false, runtime: null, reason: 'unexpected_error' };
  }
}

// ─── health snapshot ───────────────────────────────────────────────

/**
 * Get a passive health snapshot for a registered runtime.
 *
 * @param {string} runtimeId
 * @returns {{
 *   runtime_id: string,
 *   state: string,
 *   active_dispatches: number,
 *   active_consumers: number,
 *   uptime_ms: number,
 *   queue_backend: string | null,
 *   queue_name: string | null
 * } | null}
 */
export function getSignupRuntimeHealth(runtimeId) {
  try {
    if (!runtimeId || typeof runtimeId !== 'string') return null;

    const current = getSignupRuntime(runtimeId);
    if (!current) return null;

    const startedAt = current.started_at ? new Date(current.started_at).getTime() : Date.now();
    const uptimeMs = Number.isFinite(startedAt) ? Math.max(0, Date.now() - startedAt) : 0;

    return {
      runtime_id: current.runtime_id,
      state: current.state,
      active_dispatches: current.active_dispatches || 0,
      active_consumers: current.active_consumers || 0,
      uptime_ms: uptimeMs,
      queue_backend: current.queue_backend || null,
      queue_name: current.queue_name || null,
    };
  } catch (_) {
    return null;
  }
}
