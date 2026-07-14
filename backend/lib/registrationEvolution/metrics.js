/**
 * Phase 0 — Metrics namespace isolation for signup evolution (V2 prep)
 * Phase 3.3 — Shadow comparison metrics (additive namespace)
 *
 * CONTRACT:
 * - V1 lines keep using event name `registration_metrics` (existing server behaviour).
 * - Evolution experiments MUST ONLY emit using SIGNUP_EVOLUTION_METRICS_EVENT and schema version v_evolution.*
 * - Shadow comparisons use SHADOW_COMPARISON_METRICS_EVENT / shadow_compare_v1.
 * - This module MUST NOT mutate or intercept V1 log lines.
 */

import { getRegistrationEvolutionConfig } from './config.js';
import { parseEnvBoolean } from './featureFlags.js';

/** Immutable V1 marker — parsers must continue to recognise existing production lines. */
export const REGISTRATION_METRICS_EVENT_V1 = 'registration_metrics';

/**
 * Isolated namespace for evolution / V2-era metrics tooling.
 * No production ingestion should depend on this until an explicit rollout phase.
 */
export const SIGNUP_EVOLUTION_METRICS_EVENT = 'signup_evolution_metrics';

/** Schema slug reserved for evolution JSON lines — never reuse V1 schema numbers. */
export const SIGNUP_EVOLUTION_METRICS_SCHEMA = 'signup_evolution_v0';

/** Phase 3.3 — Shadow comparison metrics namespace (separate from V1 and evolution). */
export const SHADOW_COMPARISON_METRICS_EVENT = 'signup_shadow_comparison';
export const SHADOW_COMPARISON_METRICS_SCHEMA = 'shadow_compare_v1';

/**
 * Optional preview-only logger — default OFF unless SIGNUP_EVOLUTION_METRICS_PREVIEW=1 via config overlay.
 * Does not alter V1 `registration_metrics` emission.
 *
 * @param {Record<string, unknown>} payload
 */
export function logSignupEvolutionMetric(payload) {
  try {
    const cfg = getRegistrationEvolutionConfig();
    if (!cfg.metrics.evolutionPreviewEnabled) return;
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      event: SIGNUP_EVOLUTION_METRICS_EVENT,
      schema: SIGNUP_EVOLUTION_METRICS_SCHEMA,
      ...payload,
    });
    console.log(line);
  } catch (_) {
    /* deliberate fail-silent — must never disrupt V1 */
  }
}

/**
 * Phase 3.3 — Shadow comparison metric logger.
 * Gated by SIGNUP_SHADOW_COMPARISON_STDOUT (default off).
 * Does NOT affect V1 or evolution metric lines.
 *
 * @param {{ comparison_id: string, confidence_score: number, drift_detected: boolean, mismatch_count: number, shadow_result_kind: string, [key: string]: unknown }} payload
 */
export function logShadowComparisonMetric(payload) {
  try {
    if (!parseEnvBoolean(process.env.SIGNUP_SHADOW_COMPARISON_STDOUT, false)) return;
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      event: SHADOW_COMPARISON_METRICS_EVENT,
      schema: SHADOW_COMPARISON_METRICS_SCHEMA,
      ...payload,
    }));
  } catch (_) {
    /* fail-silent */
  }
}

/** Phase 3.4 — Shadow snapshot persistence metrics namespace (separate from comparison). */
export const SHADOW_SNAPSHOT_METRICS_EVENT = 'signup_shadow_snapshot';
export const SHADOW_SNAPSHOT_METRICS_SCHEMA = 'shadow_snapshot_v1';

/**
 * Phase 3.4 — Shadow snapshot persistence metric logger.
 * Gated by SIGNUP_SHADOW_SNAPSHOT_STDOUT (default off).
 *
 * @param {{ snapshot_persisted: boolean, confidence_score?: number, drift_detected?: boolean, mismatch_count?: number, persist_reason?: string, [key: string]: unknown }} payload
 */
export function logShadowSnapshotMetric(payload) {
  try {
    if (!parseEnvBoolean(process.env.SIGNUP_SHADOW_SNAPSHOT_STDOUT, false)) return;
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      event: SHADOW_SNAPSHOT_METRICS_EVENT,
      schema: SHADOW_SNAPSHOT_METRICS_SCHEMA,
      ...payload,
    }));
  } catch (_) {
    /* fail-silent */
  }
}
