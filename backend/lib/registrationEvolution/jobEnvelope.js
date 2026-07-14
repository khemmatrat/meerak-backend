/**
 * Phase 3.5 — Async job envelope definitions.
 *
 * Pure utility module that defines the canonical shape for signup-evolution
 * async job envelopes. Used by future queue producers/consumers to ensure
 * consistent serialization, validation, and idempotent replay.
 *
 * SAFETY CONTRACT:
 * - Pure synchronous logic only — no DB, no queue, no worker, no timer
 * - No async/await — every function returns immediately
 * - No side effects — no environment mutation, no logging, no I/O
 * - No throwing — every public function returns a value, never throws
 * - No runtime coupling to V1
 */

// ─── constants ─────────────────────────────────────────────────────

export const SIGNUP_JOB_TYPES = Object.freeze({
  CREATE_SIGNUP_INTENT: 'create_signup_intent',
  EXECUTE_SIGNUP_V2: 'execute_signup_v2',
  EXPIRE_SIGNUP_INTENT: 'expire_signup_intent',
  RECONCILE_SIGNUP_STATE: 'reconcile_signup_state',
});

export const SIGNUP_JOB_PRIORITIES = Object.freeze({
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  CRITICAL: 'critical',
});

export const SIGNUP_JOB_ENVELOPE_VERSION = 'signup_job_v1';

const KNOWN_JOB_TYPES = new Set(Object.values(SIGNUP_JOB_TYPES));
const KNOWN_PRIORITIES = new Set(Object.values(SIGNUP_JOB_PRIORITIES));

const DEFAULT_MAX_RETRIES = 3;

// ─── envelope factory ──────────────────────────────────────────────

let _envelopeSeq = 0;

/**
 * Create a canonical signup job envelope.
 *
 * @param {{
 *   job_type: string,
 *   priority?: string,
 *   request_id?: string,
 *   idempotency_key?: string,
 *   retry_count?: number,
 *   max_retries?: number,
 *   payload?: Record<string, unknown>
 * }} input
 * @returns {{
 *   envelope_id: string,
 *   envelope_version: string,
 *   job_type: string,
 *   priority: string,
 *   created_at: string,
 *   request_id: string | null,
 *   idempotency_key: string | null,
 *   retry_count: number,
 *   max_retries: number,
 *   payload: Record<string, unknown>
 * } | null}
 */
export function createSignupJobEnvelope(input) {
  try {
    if (!input || typeof input !== 'object') return null;

    const jobType = input.job_type;
    if (!jobType || typeof jobType !== 'string') return null;

    const priority = input.priority && KNOWN_PRIORITIES.has(input.priority)
      ? input.priority
      : SIGNUP_JOB_PRIORITIES.NORMAL;

    const retryCount = typeof input.retry_count === 'number' && Number.isFinite(input.retry_count)
      ? Math.max(0, Math.floor(input.retry_count))
      : 0;

    const maxRetries = typeof input.max_retries === 'number' && Number.isFinite(input.max_retries)
      ? Math.max(0, Math.floor(input.max_retries))
      : DEFAULT_MAX_RETRIES;

    return {
      envelope_id: `env-${Date.now()}-${++_envelopeSeq}`,
      envelope_version: SIGNUP_JOB_ENVELOPE_VERSION,
      job_type: jobType,
      priority,
      created_at: new Date().toISOString(),
      request_id: input.request_id ? String(input.request_id).slice(0, 120) : null,
      idempotency_key: input.idempotency_key ? String(input.idempotency_key).slice(0, 120) : null,
      retry_count: retryCount,
      max_retries: maxRetries,
      payload: (input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload))
        ? input.payload
        : {},
    };
  } catch (_) {
    return null;
  }
}

// ─── validation ────────────────────────────────────────────────────

/**
 * Validate a signup job envelope.
 *
 * @param {Record<string, unknown>} envelope
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateSignupJobEnvelope(envelope) {
  const errors = [];
  try {
    if (!envelope || typeof envelope !== 'object') {
      return { valid: false, errors: ['envelope must be a non-null object'] };
    }

    if (!envelope.envelope_id || typeof envelope.envelope_id !== 'string') {
      errors.push('missing or invalid envelope_id');
    }

    if (!envelope.envelope_version || typeof envelope.envelope_version !== 'string') {
      errors.push('missing or invalid envelope_version');
    }

    if (!envelope.job_type || typeof envelope.job_type !== 'string') {
      errors.push('missing or invalid job_type');
    } else if (!KNOWN_JOB_TYPES.has(envelope.job_type)) {
      errors.push(`unknown job_type: ${envelope.job_type}`);
    }

    if (!envelope.priority || typeof envelope.priority !== 'string') {
      errors.push('missing or invalid priority');
    } else if (!KNOWN_PRIORITIES.has(envelope.priority)) {
      errors.push(`unknown priority: ${envelope.priority}`);
    }

    if (!envelope.created_at || typeof envelope.created_at !== 'string') {
      errors.push('missing or invalid created_at');
    }

    if (typeof envelope.retry_count !== 'number' || !Number.isFinite(envelope.retry_count)) {
      errors.push('missing or invalid retry_count');
    }

    if (typeof envelope.max_retries !== 'number' || !Number.isFinite(envelope.max_retries)) {
      errors.push('missing or invalid max_retries');
    }

    if (
      typeof envelope.retry_count === 'number' &&
      typeof envelope.max_retries === 'number' &&
      envelope.retry_count > envelope.max_retries
    ) {
      errors.push('retry_count exceeds max_retries');
    }

    if (envelope.payload !== undefined && envelope.payload !== null) {
      if (typeof envelope.payload !== 'object' || Array.isArray(envelope.payload)) {
        errors.push('payload must be a plain object');
      }
    }

    return { valid: errors.length === 0, errors };
  } catch (_) {
    errors.push('validation threw unexpectedly');
    return { valid: false, errors };
  }
}

// ─── serialization ─────────────────────────────────────────────────

/**
 * Serialize a signup job envelope to a JSON string.
 *
 * @param {Record<string, unknown>} envelope
 * @returns {string | null} JSON string, or null on failure
 */
export function serializeSignupJobEnvelope(envelope) {
  try {
    if (!envelope || typeof envelope !== 'object') return null;
    return JSON.stringify(envelope);
  } catch (_) {
    return null;
  }
}

/**
 * Deserialize a JSON string back into a signup job envelope object.
 *
 * @param {string} json
 * @returns {Record<string, unknown> | null} parsed envelope, or null on failure
 */
export function deserializeSignupJobEnvelope(json) {
  try {
    if (!json || typeof json !== 'string') return null;
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}
