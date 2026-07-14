/**
 * Signup intent state model — additive V2-only; V1 unaffected.
 */

export const SIGNUP_INTENT_STATES = Object.freeze({
  PENDING: 'pending',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  /** Reserved for linkage after successful signup (wired in a future phase). */
  CONSUMED: 'consumed',
});

/**
 * Phase 2.5 — Explicit allowed transition map.
 * Only transitions listed here are permitted. Everything else is rejected + logged.
 * Key = fromState, value = Set of valid toStates.
 */
export const SIGNUP_INTENT_ALLOWED_TRANSITIONS = Object.freeze({
  [SIGNUP_INTENT_STATES.PENDING]: Object.freeze(new Set([
    SIGNUP_INTENT_STATES.EXPIRED,
    SIGNUP_INTENT_STATES.CANCELLED,
    SIGNUP_INTENT_STATES.CONSUMED,
  ])),
  [SIGNUP_INTENT_STATES.EXPIRED]: Object.freeze(new Set([])),
  [SIGNUP_INTENT_STATES.CANCELLED]: Object.freeze(new Set([])),
  [SIGNUP_INTENT_STATES.CONSUMED]: Object.freeze(new Set([])),
});

/**
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
export function isTransitionAllowed(from, to) {
  const allowed = SIGNUP_INTENT_ALLOWED_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.has(to);
}

/** Default TTL from env SIGNUP_INTENT_TTL_MINUTES (bounded). */
export function getSignupIntentTtlMinutesResolved() {
  const raw = parseInt(process.env.SIGNUP_INTENT_TTL_MINUTES || '', 10);
  if (!Number.isFinite(raw) || raw <= 0) return 1440; // 24h
  return Math.min(Math.max(raw, 5), 10080); // 5 minutes .. 7 days
}

export const SIGNUP_INTENT_TRANSITION_EVENT = 'signup_intent_transition';

/** Current flow version tag — stamped on every new intent and event for traceability. */
export const SIGNUP_FLOW_VERSION = 'v2.5';

/**
 * Phase 2.5 — Expiration sweeper config helpers.
 */
export function getIntentExpirationSweeperBatchSize() {
  const raw = parseInt(process.env.SIGNUP_INTENT_SWEEPER_BATCH_SIZE || '', 10);
  if (!Number.isFinite(raw) || raw < 1) return 200;
  return Math.min(raw, 5000);
}

export function getIntentExpirationSweeperIntervalMs() {
  const raw = parseInt(process.env.SIGNUP_INTENT_SWEEPER_INTERVAL_MS || '', 10);
  if (!Number.isFinite(raw) || raw < 10000) return 5 * 60 * 1000; // 5 min
  return Math.min(raw, 60 * 60 * 1000); // cap 1h
}
