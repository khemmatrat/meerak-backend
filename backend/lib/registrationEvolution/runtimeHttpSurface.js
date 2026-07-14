/**
 * Phase 9.1 — HTTP runtime exposure surface.
 *
 * Public-facing SaaS/product exposure layer on top of the sealed
 * Phase 8 Product Kernel. Provides a governed HTTP runtime facade
 * with deterministic request handling, immutable responses, and
 * zero execution side effects.
 *
 * Architecture position:
 *   Phase 4–7 (sealed) → Phase 8 (product kernel, sealed) → 9.1 HTTP Surface ◄── THIS PHASE
 *
 * STRICT DEPENDENCY RULE:
 *   Phase 9 depends on Phase 8. Phase 8 MUST NEVER depend on Phase 9.
 *
 * SAFETY CONTRACT:
 * - NO real execution or side effects
 * - NO networking fabric, fetch, or websocket
 * - NO persistence mutation or database writes
 * - NO async workers, queues, or retry systems
 * - NO distributed transport
 * - Immutable, deterministic, deeply frozen outputs only
 * - execution_allowed is ALWAYS false
 * - readonly kernel wrapping only
 */

import { createHash } from 'crypto';
import { validateIntentContract } from './intentContractLayer.js';
import { validateWorkflowDefinition } from './workflowCompositionLayer.js';
import { buildProductKernelSnapshot, isProductKernelFrozen } from './productKernelFinalizer.js';
import { buildSdkRuntimeSnapshot } from './runtimeSdkSurface.js';

// ─── constants ─────────────────────────────────────────────────────

export const RUNTIME_HTTP_SURFACE_VERSION = 'runtime_http_surface_v1';

const ALLOWED_METHODS = Object.freeze(new Set(['GET', 'POST']));

const DEFAULT_ROUTES = Object.freeze([
  { method: 'POST', path: '/runtime/intents', handler: '_handleIntentSubmission' },
  { method: 'POST', path: '/runtime/workflows', handler: '_handleWorkflowSubmission' },
  { method: 'GET', path: '/runtime/workflows/:id', handler: '_handleWorkflowGet' },
  { method: 'GET', path: '/runtime/platform/snapshot', handler: '_handlePlatformSnapshot' },
  { method: 'GET', path: '/runtime/health', handler: '_handleHealth' },
]);

// ─── in-memory state ──────────────────────────────────────────────

const _surfaces = new Map();           // surface_id → frozen descriptor
const _routeRegistry = new Map();      // `${method}::${path}` → frozen route
let _requestCount = 0;

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

function _routeKey(method, path) {
  return `${method}::${path}`;
}

function _matchRoute(method, requestPath) {
  const exact = _routeRegistry.get(_routeKey(method, requestPath));
  if (exact) return exact;

  for (const [, route] of _routeRegistry) {
    if (route.method !== method) continue;
    const pattern = route.path.replace(/:[\w]+/g, '[^/]+');
    const re = new RegExp(`^${pattern}$`);
    if (re.test(requestPath)) return route;
  }
  return null;
}

// ─── surface creation ──────────────────────────────────────────────

/**
 * Create an immutable HTTP runtime surface descriptor.
 *
 * @param {object} config
 * @param {string} config.surface_name
 * @param {string} [config.governance_mode]
 * @returns {object} — deeply frozen surface descriptor
 * @throws {Error} on invalid input or duplicate
 */
export function createRuntimeHttpSurface(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('runtime_http_surface_error: invalid config');
  }
  if (!config.surface_name || typeof config.surface_name !== 'string') {
    throw new Error('runtime_http_surface_error: surface_name required');
  }

  const surfaceId = `rhs-${createHash('sha256').update(`${RUNTIME_HTTP_SURFACE_VERSION}::${config.surface_name}`).digest('hex').slice(0, 16)}`;

  if (_surfaces.has(surfaceId)) {
    throw new Error(`runtime_http_surface_error: surface '${config.surface_name}' already exists`);
  }

  const descriptor = _deepFreeze({
    surface_id: surfaceId,
    surface_name: config.surface_name,
    governance_mode: config.governance_mode || 'strict',
    supported_routes: DEFAULT_ROUTES.map(r => `${r.method} ${r.path}`),
    readonly_kernel: true,
    execution_allowed: false,
    version: RUNTIME_HTTP_SURFACE_VERSION,
    created_at: new Date().toISOString(),
  });

  _surfaces.set(surfaceId, descriptor);
  return descriptor;
}

// ─── route registration ────────────────────────────────────────────

/**
 * Register a deterministic HTTP route definition.
 *
 * @param {object} route
 * @param {string} route.method — GET or POST
 * @param {string} route.path — must begin with /runtime/
 * @param {string} [route.description]
 * @returns {object} — deeply frozen route descriptor
 * @throws {Error} on invalid method, path, or duplicate
 */
export function registerRuntimeRoute(route) {
  if (!route || typeof route !== 'object') {
    throw new Error('runtime_http_surface_error: invalid route');
  }
  if (!route.method || !ALLOWED_METHODS.has(route.method)) {
    throw new Error(`runtime_http_surface_error: method must be GET or POST, got '${route.method}'`);
  }
  if (!route.path || typeof route.path !== 'string' || !route.path.startsWith('/runtime/')) {
    throw new Error(`runtime_http_surface_error: path must begin with /runtime/, got '${route.path}'`);
  }

  const key = _routeKey(route.method, route.path);
  if (_routeRegistry.has(key)) {
    throw new Error(`runtime_http_surface_error: route '${route.method} ${route.path}' already registered`);
  }

  const routeId = `rr-${createHash('sha256').update(`${RUNTIME_HTTP_SURFACE_VERSION}::${key}`).digest('hex').slice(0, 12)}`;

  const descriptor = _deepFreeze({
    route_id: routeId,
    method: route.method,
    path: route.path,
    description: route.description || '',
    readonly_kernel: true,
    execution_allowed: false,
    registered_at: new Date().toISOString(),
    version: RUNTIME_HTTP_SURFACE_VERSION,
  });

  _routeRegistry.set(key, descriptor);
  return descriptor;
}

// ─── request validation ────────────────────────────────────────────

/**
 * Validate inbound HTTP request structure.
 *
 * @param {object} input
 * @param {string} input.method
 * @param {string} input.path
 * @param {string} input.request_id
 * @param {string} input.timestamp
 * @returns {{ valid: true, route: object }}
 * @throws {Error} on validation failure
 */
export function validateRuntimeRequest(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('runtime_request_validation_error: invalid input');
  }
  if (!input.method || !ALLOWED_METHODS.has(input.method)) {
    throw new Error(`runtime_request_validation_error: invalid method '${input.method}'`);
  }
  if (!input.path || typeof input.path !== 'string') {
    throw new Error('runtime_request_validation_error: path required');
  }
  if (!input.request_id || typeof input.request_id !== 'string') {
    throw new Error('runtime_request_validation_error: request_id required');
  }
  if (!input.timestamp || typeof input.timestamp !== 'string') {
    throw new Error('runtime_request_validation_error: timestamp required');
  }

  const route = _matchRoute(input.method, input.path);
  if (!route) {
    throw new Error(`runtime_request_validation_error: no route registered for '${input.method} ${input.path}'`);
  }

  return { valid: true, route };
}

// ─── request handlers (internal) ───────────────────────────────────

function _handleIntentSubmission(input) {
  const body = input.body || {};
  const result = _safeCall(() => validateIntentContract(body));

  return {
    status: result.ok ? 200 : 400,
    action: 'intent_validation',
    valid: result.ok,
    error: result.ok ? null : result.error,
    execution_allowed: false,
  };
}

function _handleWorkflowSubmission(input) {
  const body = input.body || {};
  const result = _safeCall(() => validateWorkflowDefinition(body));

  return {
    status: result.ok ? 200 : 400,
    action: 'workflow_validation',
    valid: result.ok,
    error: result.ok ? null : result.error,
    execution_allowed: false,
  };
}

function _handleWorkflowGet(input) {
  return {
    status: 200,
    action: 'workflow_lookup',
    workflow_id: input.path.split('/').pop() || 'unknown',
    execution_allowed: false,
    note: 'readonly facade — no persistence layer',
  };
}

function _handlePlatformSnapshot() {
  const snapshot = _safeCall(() => buildProductKernelSnapshot());
  return {
    status: snapshot.ok ? 200 : 503,
    action: 'platform_snapshot',
    snapshot: snapshot.ok ? snapshot.value : null,
    error: snapshot.ok ? null : snapshot.error,
    execution_allowed: false,
  };
}

function _handleHealth() {
  const frozen = _safeCall(() => isProductKernelFrozen());
  return {
    status: 200,
    action: 'health_check',
    kernel_frozen: frozen.ok ? frozen.value : null,
    surface_count: _surfaces.size,
    route_count: _routeRegistry.size,
    request_count: _requestCount,
    execution_allowed: false,
    version: RUNTIME_HTTP_SURFACE_VERSION,
  };
}

const _handlers = {
  'POST::/runtime/intents': _handleIntentSubmission,
  'POST::/runtime/workflows': _handleWorkflowSubmission,
  'GET::/runtime/platform/snapshot': _handlePlatformSnapshot,
  'GET::/runtime/health': _handleHealth,
};

// ─── governed request handling ─────────────────────────────────────

/**
 * Governed request handling pipeline.
 * request → validation → route resolution → adapter → immutable response.
 *
 * @param {object} input — { method, path, request_id, timestamp, body? }
 * @returns {object} — deeply frozen response snapshot
 */
export function handleRuntimeRequest(input) {
  _requestCount++;

  const validation = validateRuntimeRequest(input);

  const routeKey = _routeKey(input.method, input.path);
  let handler = _handlers[routeKey];

  // Parameterized route fallback
  if (!handler) {
    if (input.method === 'GET' && /^\/runtime\/workflows\/[^/]+$/.test(input.path)) {
      handler = _handleWorkflowGet;
    }
  }

  let responseBody;
  if (handler) {
    responseBody = handler(input);
  } else {
    responseBody = { status: 404, action: 'not_found', error: 'no handler for route', execution_allowed: false };
  }

  const responseHash = createHash('sha256')
    .update(`${RUNTIME_HTTP_SURFACE_VERSION}::response::${input.request_id}::${responseBody.status}::${responseBody.action}`)
    .digest('hex');

  return _deepFreeze({
    request_id: input.request_id,
    method: input.method,
    path: input.path,
    ...responseBody,
    response_hash: responseHash,
    responded_at: new Date().toISOString(),
    version: RUNTIME_HTTP_SURFACE_VERSION,
  });
}

// ─── snapshot ──────────────────────────────────────────────────────

/**
 * Build a deterministic snapshot of the HTTP runtime surface.
 *
 * @returns {object} — deeply frozen snapshot
 */
export function buildRuntimeHttpSnapshot() {
  const routes = [];
  for (const [, route] of _routeRegistry) {
    routes.push({ route_id: route.route_id, method: route.method, path: route.path });
  }
  routes.sort((a, b) => `${a.method}${a.path}`.localeCompare(`${b.method}${b.path}`));

  const surfaces = [];
  for (const [, surface] of _surfaces) {
    surfaces.push({ surface_id: surface.surface_id, surface_name: surface.surface_name, governance_mode: surface.governance_mode });
  }
  surfaces.sort((a, b) => a.surface_id.localeCompare(b.surface_id));

  const kernelFrozen = _safeCall(() => isProductKernelFrozen());
  const sdkSnap = _safeCall(() => buildSdkRuntimeSnapshot());

  return _deepFreeze({
    version: RUNTIME_HTTP_SURFACE_VERSION,
    routes,
    surfaces,
    route_count: routes.length,
    surface_count: surfaces.length,
    request_count: _requestCount,
    kernel_frozen: kernelFrozen.ok ? kernelFrozen.value : null,
    sdk_clients: sdkSnap.ok ? sdkSnap.value.total_clients : 0,
    built_at: new Date().toISOString(),
  });
}

// ─── surface hash ──────────────────────────────────────────────────

/**
 * Deterministic SHA-256 from the normalized HTTP surface state.
 *
 * @returns {string}
 */
export function computeRuntimeSurfaceHash() {
  const routeKeys = [..._routeRegistry.keys()].sort().join(',');
  const surfaceIds = [..._surfaces.keys()].sort().join(',');
  const kernelFrozen = _safeCall(() => isProductKernelFrozen());

  const hashInput = [
    RUNTIME_HTTP_SURFACE_VERSION,
    routeKeys,
    surfaceIds,
    String(_routeRegistry.size),
    String(_surfaces.size),
    String(_requestCount),
    kernelFrozen.ok ? String(kernelFrozen.value) : 'unknown',
  ].join('::');

  return createHash('sha256').update(hashInput).digest('hex');
}
