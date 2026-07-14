/**
 * Phase 7.1 — Traffic entry layer (controlled ingestion surface).
 *
 * First contact layer between real traffic and the governance kernel.
 * Normalizes, validates, and builds execution-ready context objects
 * from incoming requests — but performs NO execution, routing,
 * lifecycle mutation, or governance decisions.
 *
 * Architecture position:
 *   External Traffic → 7.1 Ingress Gateway → Phase 6 Governance (frozen)
 *
 * SAFETY CONTRACT:
 * - No Phase 6 modification — governance frozen untouched
 * - No execution logic — ingestion only
 * - No routing / dispatch / consensus usage
 * - No lifecycle mutation
 * - No async workers or scheduling
 * - No persistence / DB writes
 * - Deterministic normalization only
 */

import { createHash, randomUUID } from 'crypto';

// ─── allowed event registry ────────────────────────────────────────

const ALLOWED_EVENT_TYPES = Object.freeze(new Set([
  'runtime_booted',
  'envelope_reserved',
  'dispatch_acknowledged',
  'execution_succeeded',
  'execution_failed',
  'execution_retryable',
  'execution_dead_lettered',
  'execution_committed',
  'lifecycle_advanced',
  'execution_window_closed',
]));

const ALLOWED_SOURCES = Object.freeze(new Set([
  'api',
  'webhook',
  'internal',
  'test',
  'cli',
]));

const INGRESS_VERSION = 'phase7_ingress_v1';

// ─── normalization ─────────────────────────────────────────────────

/**
 * Deterministic schema normalization of a raw traffic payload.
 * Ensures all fields exist with canonical types and defaults.
 *
 * @param {object} payload — raw incoming payload
 * @returns {{
 *   request_id: string,
 *   scope_id: string | null,
 *   event_type: string | null,
 *   payload: object,
 *   timestamp: string,
 *   source: string,
 *   normalized: boolean,
 *   normalized_at: string
 * }}
 */
export function normalizeTrafficPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return {
      request_id: _generateRequestId(),
      scope_id: null,
      event_type: null,
      payload: {},
      timestamp: new Date().toISOString(),
      source: 'unknown',
      normalized: false,
      normalized_at: new Date().toISOString(),
    };
  }

  const requestId = typeof payload.request_id === 'string' && payload.request_id.length > 0
    ? payload.request_id
    : _generateRequestId();

  const scopeId = typeof payload.scope_id === 'string' && payload.scope_id.length > 0
    ? payload.scope_id.trim()
    : null;

  const eventType = typeof payload.event_type === 'string' && payload.event_type.length > 0
    ? payload.event_type.trim().toLowerCase()
    : null;

  const innerPayload = payload.payload && typeof payload.payload === 'object'
    ? { ...payload.payload }
    : {};

  const timestamp = _isValidISO(payload.timestamp)
    ? payload.timestamp
    : new Date().toISOString();

  const source = typeof payload.source === 'string' && ALLOWED_SOURCES.has(payload.source)
    ? payload.source
    : 'unknown';

  return {
    request_id: requestId,
    scope_id: scopeId,
    event_type: eventType,
    payload: innerPayload,
    timestamp,
    source,
    normalized: true,
    normalized_at: new Date().toISOString(),
  };
}

// ─── validation ────────────────────────────────────────────────────

/**
 * Hard validation of an ingress request before entering governance.
 *
 * @param {object} input — normalized traffic payload
 * @returns {{
 *   valid: boolean,
 *   failed_checks: string[],
 *   checked_fields: number
 * }}
 */
export function validateIngressRequest(input) {
  const failures = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, failed_checks: ['input_not_object'], checked_fields: 0 };
  }

  if (!input.scope_id || typeof input.scope_id !== 'string') {
    failures.push('scope_id_missing');
  }

  if (!input.event_type || typeof input.event_type !== 'string') {
    failures.push('event_type_missing');
  } else if (!ALLOWED_EVENT_TYPES.has(input.event_type)) {
    failures.push('event_type_unknown');
  }

  if (!input.payload || typeof input.payload !== 'object') {
    failures.push('payload_not_object');
  }

  if (!input.request_id || typeof input.request_id !== 'string') {
    failures.push('request_id_missing');
  }

  if (!input.timestamp || !_isValidISO(input.timestamp)) {
    failures.push('timestamp_invalid');
  }

  return {
    valid: failures.length === 0,
    failed_checks: failures,
    checked_fields: 5,
  };
}

// ─── context builder ───────────────────────────────────────────────

/**
 * Build an execution-ready context object from a validated ingress input.
 * This context is the handoff contract to Phase 6 governance.
 *
 * @param {object} input — normalized + validated traffic payload
 * @returns {{
 *   ingress_id: string,
 *   scope_id: string,
 *   event_type: string,
 *   request_id: string,
 *   source: string,
 *   timestamp: string,
 *   context_hash: string,
 *   ready_for_governance: boolean,
 *   built_at: string
 * }}
 */
export function buildIngressContext(input) {
  const ingressId = `ing-${createHash('sha256').update(`${input.request_id}::${input.scope_id}::${input.event_type}`).digest('hex').slice(0, 16)}`;

  const contextHash = createHash('sha256')
    .update(`${INGRESS_VERSION}::${input.scope_id}::${input.event_type}::${input.request_id}::${input.timestamp}`)
    .digest('hex');

  return {
    ingress_id: ingressId,
    scope_id: input.scope_id,
    event_type: input.event_type,
    request_id: input.request_id,
    source: input.source || 'unknown',
    timestamp: input.timestamp,
    context_hash: contextHash,
    ready_for_governance: true,
    built_at: new Date().toISOString(),
  };
}

// ─── pre-gate traffic check ────────────────────────────────────────

/**
 * Boolean pre-gate check — lightweight, non-governance filter.
 * Returns false for obviously invalid or malformed requests
 * before they ever reach the governance layer.
 *
 * @param {object} input — raw or normalized payload
 * @returns {boolean}
 */
export function isTrafficAllowed(input) {
  if (!input || typeof input !== 'object') return false;
  if (!input.scope_id || typeof input.scope_id !== 'string') return false;
  if (!input.event_type || typeof input.event_type !== 'string') return false;
  if (!ALLOWED_EVENT_TYPES.has(input.event_type)) return false;
  return true;
}

// ─── full ingestion pipeline ───────────────────────────────────────

/**
 * Full traffic ingestion pipeline: normalize → validate → build context.
 *
 * @param {object} input — raw incoming request payload
 * @returns {{
 *   accepted: boolean,
 *   reason: string,
 *   ingress_id: string,
 *   context: object | null,
 *   failed_check: string | null
 * }}
 */
export function ingestTrafficRequest(input) {
  const normalized = normalizeTrafficPayload(input);
  const ingressId = `ing-${randomUUID().slice(0, 8)}`;

  if (!normalized.normalized) {
    return {
      accepted: false,
      reason: 'normalization_failed',
      ingress_id: ingressId,
      context: null,
      failed_check: 'payload_malformed',
    };
  }

  const validation = validateIngressRequest(normalized);
  if (!validation.valid) {
    return {
      accepted: false,
      reason: 'invalid_payload',
      ingress_id: ingressId,
      context: null,
      failed_check: validation.failed_checks[0],
    };
  }

  const context = buildIngressContext(normalized);

  return {
    accepted: true,
    reason: 'valid_request',
    ingress_id: context.ingress_id,
    context: {
      scope_id: context.scope_id,
      event_type: context.event_type,
      normalized: true,
      context_hash: context.context_hash,
      ready_for_governance: context.ready_for_governance,
    },
    failed_check: null,
  };
}

// ─── helpers ───────────────────────────────────────────────────────

function _generateRequestId() {
  return `req-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

function _isValidISO(str) {
  if (typeof str !== 'string') return false;
  const d = new Date(str);
  return !isNaN(d.getTime()) && str.includes('T');
}
