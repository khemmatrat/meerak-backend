/**
 * Phase 0 — Registration evolution readiness config (defaults + env overlays)
 *
 * Does NOT mutate global state. Does NOT depend on Postgres.
 * Wired only by future phases; importing this file alone changes no runtime behaviour.
 */

import {
  getRegistrationEvolutionFeatureFlags,
  isAnySignupEvolutionFeatureEnabled,
  parseEnvBoolean,
} from './featureFlags.js';

function parsePositiveInt(raw, fallback) {
  const n = parseInt(String(raw || '').trim(), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return n;
}

/**
 * @typedef {ReturnType<typeof getRegistrationEvolutionConfig>} RegistrationEvolutionConfig
 */
export function getRegistrationEvolutionConfig() {
  const flags = getRegistrationEvolutionFeatureFlags();

  /** Optional preview emission for signup_evolution_metrics (separate from V1 parsers). */
  const evolutionMetricsPreview = parseEnvBoolean(process.env.SIGNUP_EVOLUTION_METRICS_PREVIEW, false);

  return Object.freeze({
    flags,
    /** True if any evolution flag is on — useful for ops dashboards (not for gating V1). */
    anyEvolutionFeatureEnabled: isAnySignupEvolutionFeatureEnabled(),
    /**
     * Rollout / safety metadata — all defaults preserve V1.
     * Future phases may read these; Phase 0 leaves them inert.
     */
    safety: Object.freeze({
      /** Future V2 paths must treat this as mandatory: fail open to V1 on error. */
      failOpenToV1: true,
      /** When true, evolution code should never throw across the V1 boundary. */
      neverBlockV1: true,
      /** Reserved: max % for future canary; Phase 0 fixed at 0 (no automatic migration). */
      routerCanaryMaxPercent: parsePositiveInt(process.env.SIGNUP_TRAFFIC_ROUTER_CANARY_MAX_PERCENT, 0),
    }),
    metrics: Object.freeze({
      /** Allow isolated evolution metric preview logs (separate event namespace from V1). */
      evolutionPreviewEnabled: evolutionMetricsPreview,
    }),
  });
}
