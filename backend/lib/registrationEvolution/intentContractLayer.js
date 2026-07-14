/**
 * Phase 8.1 — Intent contract layer.
 *
 * Canonical intent structures and deterministic validation for the
 * product-facing intent system. Defines immutable intent envelopes,
 * deterministic hashing, and replay-safe contracts.
 *
 * Architecture position:
 *   Phase 4–7 (sealed) → 8.1 Intent Contract Layer ◄── THIS PHASE
 *
 * SAFETY CONTRACT:
 * - Zero Phase 4–7 mutation
 * - Zero execution behavior or orchestration
 * - Zero networking, persistence, or workers
 * - Deterministic hashing (no random, no Date.now in hash)
 * - Deep immutability enforced (recursive Object.freeze)
 * - Replay-safe validation
 */

import { createHash } from 'crypto';

// ─── constants ─────────────────────────────────────────────────────

export const INTENT_CONTRACT_VERSION = 'intent_contract_v1';

export const INTENT_TYPES = Object.freeze({
  USER_SIGNUP: 'user.signup',
  USER_LOGIN: 'user.login',
  PAYMENT_CAPTURE: 'payment.capture',
  WORKFLOW_EXECUTE: 'workflow.execute',
  AGENT_EXECUTE: 'agent.execute',
  SYSTEM_REPLAY: 'system.replay',
});

const ALL_INTENT_TYPES = Object.freeze(new Set(Object.values(INTENT_TYPES)));

const ALLOWED_GOVERNANCE_MODES = Object.freeze(new Set([
  'strict',
  'simulation',
  'canary',
  'controlled',
]));

// ─── deep freeze helper ────────────────────────────────────────────

function _deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const val of Object.values(obj)) {
    if (val !== null && typeof val === 'object' && !Object.isFrozen(val)) {
      _deepFreeze(val);
    }
  }
  return obj;
}

// ─── deterministic key-sorted stringify ─────────────────────────────

function _canonicalStringify(value) {
  if (value === null) return 'null';
  if (value === undefined) return '';
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) {
    return '[' + value.map(v => _canonicalStringify(v)).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  return '{' + keys
    .filter(k => value[k] !== undefined)
    .map(k => `"${k}":${_canonicalStringify(value[k])}`)
    .join(',') + '}';
}

// ─── payload normalization ─────────────────────────────────────────

/**
 * Deterministically normalize an intent payload.
 * - Sorts keys alphabetically
 * - Removes undefined values
 * - Preserves null and arrays
 * - Normalizes primitives
 *
 * @param {*} payload
 * @returns {object}
 */
export function normalizeIntentPayload(payload) {
  if (payload === null || payload === undefined || typeof payload !== 'object') {
    return {};
  }

  return _normalizeObject(payload);
}

function _normalizeObject(obj) {
  if (obj === null) return null;
  if (Array.isArray(obj)) {
    return obj.map(item => {
      if (item === null) return null;
      if (typeof item === 'object') return _normalizeObject(item);
      return item;
    });
  }
  if (typeof obj !== 'object') return obj;

  const sorted = {};
  const keys = Object.keys(obj).sort();
  for (const key of keys) {
    if (obj[key] === undefined) continue;
    if (obj[key] === null) {
      sorted[key] = null;
    } else if (typeof obj[key] === 'object') {
      sorted[key] = _normalizeObject(obj[key]);
    } else {
      sorted[key] = obj[key];
    }
  }
  return sorted;
}

// ─── intent hash computation ───────────────────────────────────────

/**
 * Deterministic SHA-256 hash from intent components.
 * Reproducible across runs — no random or time-based inputs.
 *
 * @param {object} intent — must have intent_type, payload, governance, execution_constraints
 * @returns {string} — 64-character hex hash
 */
export function computeIntentHash(intent) {
  if (!intent || typeof intent !== 'object') {
    return createHash('sha256').update(`${INTENT_CONTRACT_VERSION}::invalid`).digest('hex');
  }

  const normalizedPayload = _canonicalStringify(normalizeIntentPayload(intent.payload));
  const normalizedGov = _canonicalStringify(intent.governance || {});
  const normalizedConstraints = _canonicalStringify(intent.execution_constraints || {});

  const hashInput = [
    INTENT_CONTRACT_VERSION,
    intent.intent_type || '',
    intent.intent_version || 'v1',
    normalizedPayload,
    normalizedGov,
    normalizedConstraints,
  ].join('::');

  return createHash('sha256').update(hashInput).digest('hex');
}

// ─── intent envelope creation ──────────────────────────────────────

/**
 * Build an immutable canonical intent envelope.
 * The envelope is recursively frozen after creation.
 *
 * @param {object} input
 * @param {string} input.intent_type
 * @param {object} [input.payload]
 * @param {object} [input.governance]
 * @param {object} [input.execution_constraints]
 * @param {string} [input.intent_version]
 * @returns {object} — deeply frozen intent envelope
 */
export function createIntentEnvelope(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('intent_contract_error: invalid envelope — input is not an object');
  }

  if (!input.intent_type || !ALL_INTENT_TYPES.has(input.intent_type)) {
    throw new Error(`intent_contract_error: invalid intent type '${input.intent_type}'`);
  }

  const normalizedPayload = normalizeIntentPayload(input.payload);
  if (Object.keys(normalizedPayload).length === 0 && (!input.payload || typeof input.payload !== 'object' || Object.keys(input.payload).length === 0)) {
    throw new Error('intent_contract_error: missing payload');
  }

  const governance = _validateAndNormalizeGovernance(input.governance);
  const constraints = _validateAndNormalizeConstraints(input.execution_constraints);
  const intentVersion = input.intent_version || 'v1';

  const partial = {
    intent_type: input.intent_type,
    intent_version: intentVersion,
    payload: normalizedPayload,
    governance,
    execution_constraints: constraints,
  };

  const intentHash = computeIntentHash(partial);
  const intentId = `intent-${intentHash.slice(0, 16)}`;

  const envelope = {
    intent_id: intentId,
    intent_type: input.intent_type,
    intent_version: intentVersion,
    payload: normalizedPayload,
    governance,
    execution_constraints: constraints,
    created_at: new Date().toISOString(),
    intent_hash: intentHash,
  };

  return _deepFreeze(envelope);
}

// ─── contract validation ───────────────────────────────────────────

/**
 * Hard validation of an intent contract. Throws on any violation.
 *
 * @param {object} intent
 * @returns {{ valid: true }}
 * @throws {Error} on any contract violation
 */
export function validateIntentContract(intent) {
  if (!intent || typeof intent !== 'object') {
    throw new Error('intent_contract_error: invalid envelope — not an object');
  }

  if (!intent.intent_type || !ALL_INTENT_TYPES.has(intent.intent_type)) {
    throw new Error(`intent_contract_error: invalid intent type '${intent.intent_type}'`);
  }

  if (!intent.payload || typeof intent.payload !== 'object') {
    throw new Error('intent_contract_error: missing payload');
  }

  _validateAndNormalizeGovernance(intent.governance);
  _validateAndNormalizeConstraints(intent.execution_constraints);

  if (!intent.intent_hash || typeof intent.intent_hash !== 'string' || intent.intent_hash.length !== 64) {
    throw new Error('intent_contract_error: invalid or missing intent_hash');
  }

  // Verify hash reproducibility
  const recomputed = computeIntentHash(intent);
  if (recomputed !== intent.intent_hash) {
    throw new Error('intent_contract_error: intent_hash mismatch — envelope may have been tampered');
  }

  return { valid: true };
}

// ─── contract parser ───────────────────────────────────────────────

/**
 * Compatibility-safe parser: normalize → validate → enrich → freeze.
 *
 * @param {object} input — raw intent input
 * @returns {object} — canonical immutable intent object
 */
export function parseIntentContract(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('intent_contract_error: invalid envelope — input is not an object');
  }

  const defaults = {
    intent_version: input.intent_version || 'v1',
    governance: input.governance || { mode: 'controlled' },
    execution_constraints: input.execution_constraints || { replay_safe: true, max_retries: 0, execution_timeout_ms: 0 },
    payload: input.payload || {},
  };

  return createIntentEnvelope({
    intent_type: input.intent_type,
    intent_version: defaults.intent_version,
    payload: defaults.payload,
    governance: defaults.governance,
    execution_constraints: defaults.execution_constraints,
  });
}

// ─── replay safety check ───────────────────────────────────────────

/**
 * Check whether an intent envelope is replay-safe.
 *
 * @param {object} intent — intent envelope
 * @returns {boolean}
 */
export function isIntentReplaySafe(intent) {
  if (!intent || typeof intent !== 'object') return false;

  // Must have a valid deterministic hash
  if (!intent.intent_hash || typeof intent.intent_hash !== 'string' || intent.intent_hash.length !== 64) return false;

  // Must be immutable
  if (!Object.isFrozen(intent)) return false;

  // Must have a valid contract
  try {
    validateIntentContract(intent);
  } catch {
    return false;
  }

  // Must declare replay_safe
  if (!intent.execution_constraints || intent.execution_constraints.replay_safe !== true) return false;

  return true;
}

// ─── internal validation helpers ───────────────────────────────────

function _validateAndNormalizeGovernance(governance) {
  if (!governance || typeof governance !== 'object') {
    throw new Error('intent_contract_error: invalid governance — must be an object');
  }
  if (!governance.mode || !ALLOWED_GOVERNANCE_MODES.has(governance.mode)) {
    throw new Error(`intent_contract_error: invalid governance mode '${governance.mode}'`);
  }
  return { mode: governance.mode };
}

function _validateAndNormalizeConstraints(constraints) {
  if (!constraints || typeof constraints !== 'object') {
    throw new Error('intent_contract_error: invalid execution constraints — must be an object');
  }

  const result = {};

  if ('replay_safe' in constraints) {
    if (typeof constraints.replay_safe !== 'boolean') {
      throw new Error('intent_contract_error: execution_constraints.replay_safe must be boolean');
    }
    result.replay_safe = constraints.replay_safe;
  } else {
    result.replay_safe = true;
  }

  if ('max_retries' in constraints) {
    if (typeof constraints.max_retries !== 'number' || !Number.isInteger(constraints.max_retries) || constraints.max_retries < 0) {
      throw new Error('intent_contract_error: execution_constraints.max_retries must be integer >= 0');
    }
    result.max_retries = constraints.max_retries;
  } else {
    result.max_retries = 0;
  }

  if ('execution_timeout_ms' in constraints) {
    if (typeof constraints.execution_timeout_ms !== 'number' || !Number.isInteger(constraints.execution_timeout_ms) || constraints.execution_timeout_ms < 0) {
      throw new Error('intent_contract_error: execution_constraints.execution_timeout_ms must be integer >= 0');
    }
    result.execution_timeout_ms = constraints.execution_timeout_ms;
  } else {
    result.execution_timeout_ms = 0;
  }

  return result;
}
