/**
 * Phase 0 — Registration evolution feature flags (safety baseline)
 *
 * SAFETY CONTRACT (non-negotiable):
 * - All flags default OFF → production behaves exactly as pure V1.
 * - No code path outside future experimental modules should require these flags ON.
 * - Evolution work must remain fail-open: V2 MUST NOT block V1.
 *
 * Read pattern: callers invoke getRegistrationEvolutionFeatureFlags(); values are evaluated
 * on each call so tests / late env injection behave predictably (within normal Node semantics).
 */

/** Exported for sibling modules (env parsing must stay identical). */
export function parseEnvBoolean(raw, fallback = false) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const v = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'enable', 'enabled'].includes(v)) return true;
  if (['0', 'false', 'no', 'off', 'disable', 'disabled'].includes(v)) return false;
  return fallback;
}

/** @typedef {Readonly<{ ENABLE_SIGNUP_V2: boolean, ENABLE_SIGNUP_INTENTS: boolean, ENABLE_SIGNUP_STATE_MACHINE: boolean, ENABLE_ASYNC_SIGNUP_JOBS: boolean, ENABLE_SIGNUP_RECOVERY_V2: boolean, ENABLE_EMBEDDED_BROWSER_MODE: boolean, ENABLE_SIGNUP_TRAFFIC_ROUTER: boolean, ENABLE_INTENT_SIGNED_TOKENS: boolean, ENABLE_INTENT_SWEEPER: boolean, ENABLE_INTENT_METRICS: boolean }>} RegistrationEvolutionFeatureFlags */

/**
 * Centralized evolution flags — single source for env keys below.
 * - Phase 1: `signupOrchestrator.js` reads these gates (still defaults OFF — V1 untouched).
 *
 * ENV keys (explicit, grep-friendly):
 * - ENABLE_SIGNUP_V2
 * - ENABLE_SIGNUP_INTENTS
 * - ENABLE_SIGNUP_STATE_MACHINE
 * - ENABLE_ASYNC_SIGNUP_JOBS
 * - ENABLE_SIGNUP_RECOVERY_V2
 * - ENABLE_EMBEDDED_BROWSER_MODE
 * - ENABLE_SIGNUP_TRAFFIC_ROUTER
 * - ENABLE_INTENT_SIGNED_TOKENS       (Phase 2.5)
 * - ENABLE_INTENT_SWEEPER             (Phase 2.5)
 * - ENABLE_INTENT_METRICS             (Phase 2.5)
 */
export function getRegistrationEvolutionFeatureFlags() {
  /** @type {RegistrationEvolutionFeatureFlags} */
  const flags = Object.freeze({
    ENABLE_SIGNUP_V2: parseEnvBoolean(process.env.ENABLE_SIGNUP_V2, false),
    ENABLE_SIGNUP_INTENTS: parseEnvBoolean(process.env.ENABLE_SIGNUP_INTENTS, false),
    ENABLE_SIGNUP_STATE_MACHINE: parseEnvBoolean(process.env.ENABLE_SIGNUP_STATE_MACHINE, false),
    ENABLE_ASYNC_SIGNUP_JOBS: parseEnvBoolean(process.env.ENABLE_ASYNC_SIGNUP_JOBS, false),
    ENABLE_SIGNUP_RECOVERY_V2: parseEnvBoolean(process.env.ENABLE_SIGNUP_RECOVERY_V2, false),
    ENABLE_EMBEDDED_BROWSER_MODE: parseEnvBoolean(process.env.ENABLE_EMBEDDED_BROWSER_MODE, false),
    ENABLE_SIGNUP_TRAFFIC_ROUTER: parseEnvBoolean(process.env.ENABLE_SIGNUP_TRAFFIC_ROUTER, false),
    ENABLE_INTENT_SIGNED_TOKENS: parseEnvBoolean(process.env.ENABLE_INTENT_SIGNED_TOKENS, false),
    ENABLE_INTENT_SWEEPER: parseEnvBoolean(process.env.ENABLE_INTENT_SWEEPER, false),
    ENABLE_INTENT_METRICS: parseEnvBoolean(process.env.ENABLE_INTENT_METRICS, false),
  });
  return flags;
}

/**
 * Explicit “anything evolution turned on?” — keeps future rollout checks terse.
 * Phase 0: always false unless someone sets env in non-prod experiments.
 */
export function isAnySignupEvolutionFeatureEnabled() {
  const f = getRegistrationEvolutionFeatureFlags();
  return Object.values(f).some(Boolean);
}
