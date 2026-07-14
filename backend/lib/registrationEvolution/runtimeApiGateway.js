/**
 * Phase 9.2 — Runtime API gateway & request authentication layer.
 *
 * Governed API gateway on top of the Phase 9.1 HTTP Runtime Exposure
 * Surface. Provides deterministic request authentication, API client
 * identity, governed access evaluation, request signature verification,
 * and gateway admission pipeline.
 *
 * Architecture position:
 *   Phase 8 (sealed) → 9.1 HTTP Surface → 9.2 API Gateway ◄── THIS PHASE
 *
 * SAFETY CONTRACT:
 * - NO real execution or side effects
 * - NO networking, JWT, OAuth, or external auth
 * - NO persistence mutation
 * - NO async workers or retry systems
 * - execution_allowed is ALWAYS false
 * - readonly kernel exposure only
 * - deterministic admission + governance enforcement only
 */

import { createHash } from 'crypto';
import { handleRuntimeRequest, computeRuntimeSurfaceHash } from './runtimeHttpSurface.js';

// ─── constants ─────────────────────────────────────────────────────

export const RUNTIME_API_GATEWAY_VERSION = 'runtime_api_gateway_v1';

const ALLOWED_GOVERNANCE_MODES = Object.freeze(new Set([
  'strict', 'simulation', 'canary', 'controlled',
]));

// ─── in-memory state ──────────────────────────────────────────────

const _clientRegistry = new Map();      // client_id → frozen client descriptor
const _apiKeyIndex = new Map();         // api_key → client_id
let _authAttempts = 0;
let _authSuccesses = 0;
let _authFailures = 0;
let _authzAttempts = 0;
let _authzSuccesses = 0;
let _authzDenials = 0;
let _gatewayRequests = 0;

// ─── helpers ───────────────────────────────────────────────────────

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

function _safeCall(fn) {
  try { return { ok: true, value: fn() }; } catch (e) { return { ok: false, error: e.message }; }
}

// ─── client registration ───────────────────────────────────────────

/**
 * Register an immutable API client descriptor.
 *
 * @param {object} config
 * @param {string} config.client_name
 * @param {string} config.governance_mode
 * @param {string[]} config.allowed_routes — e.g. ['POST /runtime/intents', 'GET /runtime/health']
 * @param {string} config.api_key
 * @returns {object} — deeply frozen client descriptor
 * @throws {Error} on invalid input, duplicate name, or duplicate api_key
 */
export function registerApiClient(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('runtime_api_gateway_error: invalid config');
  }
  if (!config.client_name || typeof config.client_name !== 'string') {
    throw new Error('runtime_api_gateway_error: client_name required');
  }
  if (!config.api_key || typeof config.api_key !== 'string') {
    throw new Error('runtime_api_gateway_error: api_key required');
  }

  const govMode = config.governance_mode || 'strict';
  if (!ALLOWED_GOVERNANCE_MODES.has(govMode)) {
    throw new Error(`runtime_api_gateway_error: invalid governance_mode '${govMode}'`);
  }

  if (_apiKeyIndex.has(config.api_key)) {
    throw new Error('runtime_api_gateway_error: duplicate api_key');
  }

  const clientId = `gw-${createHash('sha256').update(`${RUNTIME_API_GATEWAY_VERSION}::${config.client_name}`).digest('hex').slice(0, 16)}`;

  if (_clientRegistry.has(clientId)) {
    throw new Error(`runtime_api_gateway_error: client '${config.client_name}' already registered`);
  }

  const allowedRoutes = Object.freeze([...(config.allowed_routes || [])]);

  const descriptor = _deepFreeze({
    client_id: clientId,
    client_name: config.client_name,
    governance_mode: govMode,
    allowed_routes: allowedRoutes,
    registered: true,
    execution_allowed: false,
    version: RUNTIME_API_GATEWAY_VERSION,
    registered_at: new Date().toISOString(),
  });

  _clientRegistry.set(clientId, descriptor);
  _apiKeyIndex.set(config.api_key, clientId);
  return descriptor;
}

// ─── request signature ─────────────────────────────────────────────

/**
 * Compute a deterministic SHA-256 request signature.
 *
 * @param {object} input
 * @param {string} input.method
 * @param {string} input.path
 * @param {string} input.request_id
 * @param {string} input.api_key
 * @param {object} [input.body]
 * @returns {string} — hex signature
 */
export function computeRequestSignature(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('runtime_api_gateway_error: invalid signature input');
  }

  const bodyNormalized = input.body
    ? JSON.stringify(input.body, Object.keys(input.body).sort())
    : '';

  const signatureInput = [
    RUNTIME_API_GATEWAY_VERSION,
    input.method || '',
    input.path || '',
    input.request_id || '',
    input.api_key || '',
    bodyNormalized,
  ].join('::');

  return createHash('sha256').update(signatureInput).digest('hex');
}

// ─── authentication ────────────────────────────────────────────────

/**
 * Validate inbound API request authentication.
 *
 * @param {object} input
 * @param {string} input.api_key
 * @param {string} input.request_signature
 * @param {string} input.request_id
 * @param {string} input.timestamp
 * @param {string} input.method — needed for signature verification
 * @param {string} input.path — needed for signature verification
 * @param {object} [input.body] — needed for signature verification
 * @returns {object} — deeply frozen authentication result
 */
export function authenticateRuntimeRequest(input) {
  _authAttempts++;

  if (!input || typeof input !== 'object') {
    _authFailures++;
    return _deepFreeze({ authenticated: false, client_id: null, governance_mode: null, reason: 'invalid_input' });
  }
  if (!input.api_key || typeof input.api_key !== 'string') {
    _authFailures++;
    return _deepFreeze({ authenticated: false, client_id: null, governance_mode: null, reason: 'missing_api_key' });
  }
  if (!input.request_id || typeof input.request_id !== 'string') {
    _authFailures++;
    return _deepFreeze({ authenticated: false, client_id: null, governance_mode: null, reason: 'missing_request_id' });
  }
  if (!input.timestamp || typeof input.timestamp !== 'string') {
    _authFailures++;
    return _deepFreeze({ authenticated: false, client_id: null, governance_mode: null, reason: 'missing_timestamp' });
  }

  const clientId = _apiKeyIndex.get(input.api_key);
  if (!clientId) {
    _authFailures++;
    return _deepFreeze({ authenticated: false, client_id: null, governance_mode: null, reason: 'unknown_api_key' });
  }

  const client = _clientRegistry.get(clientId);
  if (!client) {
    _authFailures++;
    return _deepFreeze({ authenticated: false, client_id: null, governance_mode: null, reason: 'client_not_found' });
  }

  // Verify request signature
  if (input.request_signature) {
    const expected = computeRequestSignature({
      method: input.method,
      path: input.path,
      request_id: input.request_id,
      api_key: input.api_key,
      body: input.body,
    });
    if (expected !== input.request_signature) {
      _authFailures++;
      return _deepFreeze({ authenticated: false, client_id: clientId, governance_mode: client.governance_mode, reason: 'signature_mismatch' });
    }
  }

  _authSuccesses++;
  return _deepFreeze({
    authenticated: true,
    client_id: clientId,
    governance_mode: client.governance_mode,
    reason: 'signature_valid',
  });
}

// ─── authorization ─────────────────────────────────────────────────

/**
 * Evaluate route-level authorization for a client.
 *
 * @param {object} input
 * @param {string} input.client_id
 * @param {string} input.method
 * @param {string} input.path
 * @returns {object} — deeply frozen authorization result
 */
export function authorizeRuntimeRequest(input) {
  _authzAttempts++;

  if (!input || typeof input !== 'object') {
    _authzDenials++;
    return _deepFreeze({ authorized: false, authorization_level: 'denied', execution_allowed: false, reason: 'invalid_input' });
  }

  const client = _clientRegistry.get(input.client_id);
  if (!client) {
    _authzDenials++;
    return _deepFreeze({ authorized: false, authorization_level: 'denied', execution_allowed: false, reason: 'client_not_registered' });
  }

  if (!input.method || !input.path) {
    _authzDenials++;
    return _deepFreeze({ authorized: false, authorization_level: 'denied', execution_allowed: false, reason: 'missing_route' });
  }

  const routeStr = `${input.method} ${input.path}`;

  // Check allowed_routes — if empty, all routes permitted
  if (client.allowed_routes.length > 0) {
    // Support parameterized route matching
    const permitted = client.allowed_routes.some(allowed => {
      if (allowed === routeStr) return true;
      const pattern = allowed.replace(/:[\w]+/g, '[^/]+');
      return new RegExp(`^${pattern}$`).test(routeStr);
    });

    if (!permitted) {
      _authzDenials++;
      return _deepFreeze({ authorized: false, authorization_level: 'denied', execution_allowed: false, reason: 'route_not_permitted' });
    }
  }

  _authzSuccesses++;
  return _deepFreeze({
    authorized: true,
    authorization_level: 'readonly_runtime_access',
    execution_allowed: false,
    reason: 'route_permitted',
  });
}

// ─── gateway pipeline ──────────────────────────────────────────────

/**
 * Full gateway pipeline: authenticate → authorize → delegate to 9.1.
 *
 * @param {object} input
 * @param {string} input.api_key
 * @param {string} input.request_signature
 * @param {string} input.request_id
 * @param {string} input.timestamp
 * @param {string} input.method
 * @param {string} input.path
 * @param {object} [input.body]
 * @returns {object} — deeply frozen gateway response
 */
export function handleGatewayRuntimeRequest(input) {
  _gatewayRequests++;

  if (!input || typeof input !== 'object') {
    return _deepFreeze({
      gateway_request_id: 'unknown',
      authenticated: false,
      authorized: false,
      status: 400,
      error: 'invalid_input',
      execution_allowed: false,
      response_hash: createHash('sha256').update(`${RUNTIME_API_GATEWAY_VERSION}::error::invalid`).digest('hex'),
      responded_at: new Date().toISOString(),
      version: RUNTIME_API_GATEWAY_VERSION,
    });
  }

  const gatewayRequestId = `gw-req-${createHash('sha256').update(`${RUNTIME_API_GATEWAY_VERSION}::${input.request_id || 'none'}::${_gatewayRequests}`).digest('hex').slice(0, 12)}`;

  // 1. Authenticate
  const authResult = authenticateRuntimeRequest(input);
  if (!authResult.authenticated) {
    const hash = createHash('sha256').update(`${RUNTIME_API_GATEWAY_VERSION}::authn_fail::${gatewayRequestId}::${authResult.reason}`).digest('hex');
    return _deepFreeze({
      gateway_request_id: gatewayRequestId,
      authenticated: false,
      authorized: false,
      status: 401,
      error: authResult.reason,
      execution_allowed: false,
      response_hash: hash,
      responded_at: new Date().toISOString(),
      version: RUNTIME_API_GATEWAY_VERSION,
    });
  }

  // 2. Authorize
  const authzResult = authorizeRuntimeRequest({ client_id: authResult.client_id, method: input.method, path: input.path });
  if (!authzResult.authorized) {
    const hash = createHash('sha256').update(`${RUNTIME_API_GATEWAY_VERSION}::authz_fail::${gatewayRequestId}::${authzResult.reason}`).digest('hex');
    return _deepFreeze({
      gateway_request_id: gatewayRequestId,
      authenticated: true,
      authorized: false,
      status: 403,
      error: authzResult.reason,
      execution_allowed: false,
      response_hash: hash,
      responded_at: new Date().toISOString(),
      version: RUNTIME_API_GATEWAY_VERSION,
    });
  }

  // 3. Delegate to Phase 9.1 runtime surface
  const runtimeResponse = _safeCall(() => handleRuntimeRequest({
    method: input.method,
    path: input.path,
    request_id: input.request_id,
    timestamp: input.timestamp,
    body: input.body,
  }));

  const delegatedStatus = runtimeResponse.ok ? (runtimeResponse.value.status || 200) : 502;
  const responseHash = createHash('sha256')
    .update(`${RUNTIME_API_GATEWAY_VERSION}::response::${gatewayRequestId}::${delegatedStatus}::${authResult.client_id}`)
    .digest('hex');

  return _deepFreeze({
    gateway_request_id: gatewayRequestId,
    authenticated: true,
    authorized: true,
    client_id: authResult.client_id,
    governance_mode: authResult.governance_mode,
    status: delegatedStatus,
    runtime_response: runtimeResponse.ok ? runtimeResponse.value : null,
    runtime_error: runtimeResponse.ok ? null : runtimeResponse.error,
    execution_allowed: false,
    response_hash: responseHash,
    responded_at: new Date().toISOString(),
    version: RUNTIME_API_GATEWAY_VERSION,
  });
}

// ─── snapshot ──────────────────────────────────────────────────────

/**
 * Build a deterministic snapshot of the API gateway state.
 *
 * @returns {object} — deeply frozen snapshot
 */
export function buildApiGatewaySnapshot() {
  const clients = [];
  for (const [, client] of _clientRegistry) {
    clients.push({
      client_id: client.client_id,
      client_name: client.client_name,
      governance_mode: client.governance_mode,
      routes: client.allowed_routes.length,
    });
  }
  clients.sort((a, b) => a.client_id.localeCompare(b.client_id));

  const surfaceHash = _safeCall(() => computeRuntimeSurfaceHash());

  return _deepFreeze({
    version: RUNTIME_API_GATEWAY_VERSION,
    clients,
    total_clients: clients.length,
    authentication: {
      attempts: _authAttempts,
      successes: _authSuccesses,
      failures: _authFailures,
    },
    authorization: {
      attempts: _authzAttempts,
      successes: _authzSuccesses,
      denials: _authzDenials,
    },
    gateway_requests: _gatewayRequests,
    runtime_surface_hash: surfaceHash.ok ? surfaceHash.value : null,
    built_at: new Date().toISOString(),
  });
}

// ─── gateway hash ──────────────────────────────────────────────────

/**
 * Deterministic SHA-256 from the normalized gateway state.
 *
 * @returns {string}
 */
export function computeApiGatewayHash() {
  const clientIds = [..._clientRegistry.keys()].sort().join(',');
  const surfaceHash = _safeCall(() => computeRuntimeSurfaceHash());

  const hashInput = [
    RUNTIME_API_GATEWAY_VERSION,
    clientIds,
    String(_clientRegistry.size),
    String(_authAttempts),
    String(_authSuccesses),
    String(_authFailures),
    String(_authzAttempts),
    String(_authzSuccesses),
    String(_authzDenials),
    String(_gatewayRequests),
    surfaceHash.ok ? surfaceHash.value : 'none',
  ].join('::');

  return createHash('sha256').update(hashInput).digest('hex');
}
