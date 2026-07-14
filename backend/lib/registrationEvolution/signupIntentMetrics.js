/**
 * Phase 2.5 — Intent observability metrics.
 *
 * In-process counters + optional stdout JSON lines.
 * Gated by ENABLE_INTENT_METRICS (default off).
 * MUST NEVER block V1 or throw into caller hot paths.
 */

import { getRegistrationEvolutionFeatureFlags, parseEnvBoolean } from './featureFlags.js';
import { SIGNUP_FLOW_VERSION } from './signupIntentConstants.js';

const INTENT_METRICS_EVENT = 'signup_intent_metrics';

const _counters = {
  intent_created: 0,
  intent_expired_lazy: 0,
  intent_expired_sweeper: 0,
  intent_replay: 0,
  intent_invalid_transition: 0,
  recovery_success: 0,
  recovery_failed: 0,
  signed_token_issued: 0,
  signed_token_verified: 0,
  signed_token_rejected: 0,
  sweeper_cycle: 0,
};

/**
 * Increment a named counter. Silently ignored when metrics flag is off or on unknown key.
 * @param {string} name
 * @param {Record<string, unknown>} [extra]
 */
export function emitIntentMetric(name, extra) {
  try {
    if (!getRegistrationEvolutionFeatureFlags().ENABLE_INTENT_METRICS) return;
    if (name in _counters) _counters[name]++;

    if (parseEnvBoolean(process.env.SIGNUP_INTENT_METRICS_STDOUT, false)) {
      console.log(JSON.stringify({
        ts: new Date().toISOString(),
        event: INTENT_METRICS_EVENT,
        metric: name,
        flow_version: SIGNUP_FLOW_VERSION,
        ...extra,
      }));
    }
  } catch (_) {
    /* fail-silent */
  }
}

/**
 * Snapshot of in-process counters.
 * @returns {Promise<Record<string, number>>}
 */
export function getIntentMetricsSnapshot() {
  return { ..._counters };
}

/**
 * Live counts from DB (for observability endpoint).
 * @param {import('pg').Pool} pool
 * @returns {Promise<Record<string, number>>}
 */
export async function getIntentMetricsFromDb(pool) {
  try {
    const r = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE state = 'pending')   AS pending_count,
        COUNT(*) FILTER (WHERE state = 'expired')   AS expired_count,
        COUNT(*) FILTER (WHERE state = 'cancelled') AS cancelled_count,
        COUNT(*) FILTER (WHERE state = 'consumed')  AS consumed_count,
        SUM(retry_count)                             AS total_replays
       FROM signup_intents`,
    );
    const row = r.rows?.[0] || {};
    return {
      pending_count: Number(row.pending_count || 0),
      expired_count: Number(row.expired_count || 0),
      cancelled_count: Number(row.cancelled_count || 0),
      consumed_count: Number(row.consumed_count || 0),
      total_replays: Number(row.total_replays || 0),
    };
  } catch (e) {
    console.warn('[signup-intent-metrics] DB query failed:', e?.message || e);
    return null;
  }
}

/**
 * Event-log breakdown (invalid transitions, recovery attempts, etc.) from the events table.
 * @param {import('pg').Pool} pool
 * @returns {Promise<Record<string, number> | null>}
 */
export async function getIntentEventMetricsFromDb(pool) {
  try {
    const r = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE meta->>'kind' = 'invalid_transition_attempt') AS invalid_transitions,
        COUNT(*) FILTER (WHERE meta->>'kind' = 'recovery_access')            AS recovery_successes,
        COUNT(*) FILTER (WHERE meta->>'kind' = 'idempotent_replay')          AS idempotent_replays,
        COUNT(*) FILTER (WHERE meta->>'kind' = 'created')                    AS created_events
       FROM signup_intent_events`,
    );
    const row = r.rows?.[0] || {};
    return {
      invalid_transitions: Number(row.invalid_transitions || 0),
      recovery_successes: Number(row.recovery_successes || 0),
      idempotent_replays: Number(row.idempotent_replays || 0),
      created_events: Number(row.created_events || 0),
    };
  } catch (e) {
    console.warn('[signup-intent-metrics] event DB query failed:', e?.message || e);
    return null;
  }
}
