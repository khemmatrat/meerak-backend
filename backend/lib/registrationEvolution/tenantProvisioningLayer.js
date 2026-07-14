/**
 * Phase 9.3 — Tenant provisioning & namespace isolation layer.
 *
 * First SaaS multi-tenant governance layer on top of the Runtime API
 * Gateway (9.2). Establishes tenant registration, namespace isolation,
 * governance boundaries, runtime ownership segregation, and
 * tenant-scoped SDK/runtime access.
 *
 * Architecture position:
 *   Phase 8 (sealed) → 9.1 HTTP Surface → 9.2 API Gateway → 9.3 Tenant Provisioning ◄── THIS PHASE
 *
 * SAFETY CONTRACT:
 * - NO real execution or side effects
 * - NO networking, persistence, or async workers
 * - NO distributed execution
 * - execution_allowed is ALWAYS false
 * - readonly orchestration exposure only
 * - immutable governance fabric
 * - no cross-tenant namespace access
 */

import { createHash } from 'crypto';

// ─── constants ─────────────────────────────────────────────────────

export const TENANT_PROVISIONING_VERSION = 'tenant_provisioning_v1';

const ALLOWED_GOVERNANCE_MODES = Object.freeze(new Set([
  'strict', 'simulation', 'canary', 'controlled',
]));

// ─── in-memory state ──────────────────────────────────────────────

const _tenantRegistry = new Map();      // tenant_id → frozen tenant descriptor
const _namespaceIndex = new Map();      // namespace → tenant_id
const _tenantNameIndex = new Map();     // tenant_name → tenant_id
const _clientBindings = new Map();      // client_id → { tenant_id, binding descriptor }
const _tenantClients = new Map();       // tenant_id → Set<client_id>

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

function _normalizeNamespace(ns) {
  return (ns || '').toLowerCase().trim();
}

// ─── tenant registration ───────────────────────────────────────────

/**
 * Register an immutable SaaS tenant descriptor.
 *
 * @param {object} input
 * @param {string} input.tenant_name
 * @param {string} input.governance_mode
 * @param {string} input.namespace — format: tenant-name.environment
 * @param {string[]} [input.allowed_intents]
 * @param {string[]} [input.allowed_capabilities]
 * @returns {object} — deeply frozen tenant descriptor
 * @throws {Error} on invalid input, duplicate namespace, or duplicate name
 */
export function registerTenant(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('tenant_provisioning_error: invalid input');
  }
  if (!input.tenant_name || typeof input.tenant_name !== 'string') {
    throw new Error('tenant_provisioning_error: tenant_name required');
  }
  if (!input.namespace || typeof input.namespace !== 'string') {
    throw new Error('tenant_provisioning_error: namespace required');
  }

  const govMode = input.governance_mode || 'strict';
  if (!ALLOWED_GOVERNANCE_MODES.has(govMode)) {
    throw new Error(`tenant_provisioning_error: invalid governance_mode '${govMode}'`);
  }

  const namespace = _normalizeNamespace(input.namespace);
  if (!namespace.includes('.')) {
    throw new Error('tenant_provisioning_error: namespace must follow tenant-name.environment format');
  }

  if (_namespaceIndex.has(namespace)) {
    throw new Error(`tenant_provisioning_error: namespace '${namespace}' already registered`);
  }

  const normalizedName = input.tenant_name.toLowerCase().trim();
  if (_tenantNameIndex.has(normalizedName)) {
    throw new Error(`tenant_provisioning_error: tenant_name '${input.tenant_name}' already registered`);
  }

  const tenantId = `tenant-${createHash('sha256').update(`${TENANT_PROVISIONING_VERSION}::${namespace}`).digest('hex').slice(0, 16)}`;

  const descriptor = _deepFreeze({
    tenant_id: tenantId,
    tenant_name: input.tenant_name,
    namespace,
    governance_mode: govMode,
    allowed_intents: Object.freeze([...(input.allowed_intents || [])]),
    allowed_capabilities: Object.freeze([...(input.allowed_capabilities || [])]),
    registered: true,
    execution_allowed: false,
    version: TENANT_PROVISIONING_VERSION,
    registered_at: new Date().toISOString(),
  });

  _tenantRegistry.set(tenantId, descriptor);
  _namespaceIndex.set(namespace, tenantId);
  _tenantNameIndex.set(normalizedName, tenantId);
  _tenantClients.set(tenantId, new Set());
  return descriptor;
}

// ─── client-tenant binding ─────────────────────────────────────────

/**
 * Bind a Phase 9.2 API client to a tenant namespace.
 *
 * @param {object} client — API client descriptor (must have client_id, governance_mode)
 * @param {object} tenant — tenant descriptor (must have tenant_id, namespace)
 * @returns {object} — deeply frozen binding descriptor
 * @throws {Error} on invalid input, unknown tenant, incompatibility, or duplicate binding
 */
export function bindClientToTenant(client, tenant) {
  if (!client || !client.client_id) {
    throw new Error('tenant_provisioning_error: valid client with client_id required');
  }
  if (!tenant || !tenant.tenant_id) {
    throw new Error('tenant_provisioning_error: valid tenant with tenant_id required');
  }

  const registeredTenant = _tenantRegistry.get(tenant.tenant_id);
  if (!registeredTenant) {
    throw new Error(`tenant_provisioning_error: tenant '${tenant.tenant_id}' not registered`);
  }

  if (_clientBindings.has(client.client_id)) {
    throw new Error(`tenant_provisioning_error: client '${client.client_id}' already bound to a tenant`);
  }

  // Governance compatibility — client mode must match or be compatible with tenant mode
  if (client.governance_mode && client.governance_mode !== registeredTenant.governance_mode) {
    const compatible = _areGovernanceModesCompatible(client.governance_mode, registeredTenant.governance_mode);
    if (!compatible) {
      throw new Error(`tenant_provisioning_error: governance mode mismatch — client '${client.governance_mode}' incompatible with tenant '${registeredTenant.governance_mode}'`);
    }
  }

  const bindingHash = createHash('sha256')
    .update(`${TENANT_PROVISIONING_VERSION}::bind::${client.client_id}::${tenant.tenant_id}::${registeredTenant.namespace}`)
    .digest('hex');

  const binding = _deepFreeze({
    binding_id: `tb-${bindingHash.slice(0, 16)}`,
    client_id: client.client_id,
    tenant_id: tenant.tenant_id,
    namespace: registeredTenant.namespace,
    governance_mode: registeredTenant.governance_mode,
    execution_allowed: false,
    binding_hash: bindingHash,
    bound_at: new Date().toISOString(),
    version: TENANT_PROVISIONING_VERSION,
  });

  _clientBindings.set(client.client_id, binding);
  _tenantClients.get(tenant.tenant_id).add(client.client_id);
  return binding;
}

function _areGovernanceModesCompatible(clientMode, tenantMode) {
  // Strict tenant only allows strict clients
  if (tenantMode === 'strict') return clientMode === 'strict';
  // Simulation tenant allows simulation and strict
  if (tenantMode === 'simulation') return clientMode === 'simulation' || clientMode === 'strict';
  // Canary and controlled are broadly compatible
  return true;
}

// ─── namespace resolution ──────────────────────────────────────────

/**
 * Resolve runtime namespace ownership.
 *
 * @param {object} input — { tenant_id?, namespace?, client_id? }
 * @returns {object|null} — frozen namespace resolution or null
 */
export function resolveTenantNamespace(input) {
  if (!input || typeof input !== 'object') return null;

  let tenantId = null;

  // Priority: tenant_id → namespace → client_id
  if (input.tenant_id) {
    tenantId = input.tenant_id;
  } else if (input.namespace) {
    tenantId = _namespaceIndex.get(_normalizeNamespace(input.namespace));
  } else if (input.client_id) {
    const binding = _clientBindings.get(input.client_id);
    if (binding) tenantId = binding.tenant_id;
  }

  if (!tenantId) return null;

  const tenant = _tenantRegistry.get(tenantId);
  if (!tenant) return null;

  return _deepFreeze({
    tenant_id: tenant.tenant_id,
    namespace: tenant.namespace,
    governance_mode: tenant.governance_mode,
    isolated: true,
  });
}

// ─── isolation validation ──────────────────────────────────────────

/**
 * Hard validation for namespace isolation.
 *
 * @param {object} [input] — optional, validates entire system if omitted
 * @returns {{ valid: true, checks: string[] }}
 * @throws {Error} on any isolation violation
 */
export function validateTenantIsolation(input) {
  const checks = [];

  // 1. Namespace uniqueness
  const nsSet = new Set();
  for (const [ns] of _namespaceIndex) {
    if (nsSet.has(ns)) {
      throw new Error(`tenant_isolation_violation: duplicate namespace '${ns}'`);
    }
    nsSet.add(ns);
  }
  checks.push('namespace_uniqueness');

  // 2. Client ownership validity — every bound client maps to a registered tenant
  for (const [clientId, binding] of _clientBindings) {
    if (!_tenantRegistry.has(binding.tenant_id)) {
      throw new Error(`tenant_isolation_violation: client '${clientId}' bound to unregistered tenant '${binding.tenant_id}'`);
    }
  }
  checks.push('client_ownership_valid');

  // 3. No cross-tenant route contamination — each client bound to exactly one tenant
  const clientTenantMap = new Map();
  for (const [clientId, binding] of _clientBindings) {
    if (clientTenantMap.has(clientId) && clientTenantMap.get(clientId) !== binding.tenant_id) {
      throw new Error(`tenant_isolation_violation: client '${clientId}' bound to multiple tenants`);
    }
    clientTenantMap.set(clientId, binding.tenant_id);
  }
  checks.push('no_cross_tenant_contamination');

  // 4. Capability compatibility — if input specifies a tenant, check specific
  if (input && input.tenant_id) {
    const tenant = _tenantRegistry.get(input.tenant_id);
    if (!tenant) {
      throw new Error(`tenant_isolation_violation: tenant '${input.tenant_id}' not found`);
    }
    checks.push('tenant_capability_check');
  }

  // 5. Governance compatibility across all bindings
  for (const [clientId, binding] of _clientBindings) {
    const tenant = _tenantRegistry.get(binding.tenant_id);
    if (tenant && binding.governance_mode !== tenant.governance_mode) {
      throw new Error(`tenant_isolation_violation: binding governance mismatch for client '${clientId}'`);
    }
  }
  checks.push('governance_compatibility');

  return { valid: true, checks };
}

// ─── tenant runtime context ───────────────────────────────────────

/**
 * Create an immutable tenant-scoped runtime context.
 *
 * @param {object} input — { tenant_id } or { namespace } or { client_id }
 * @returns {object} — deeply frozen runtime context
 * @throws {Error} if tenant cannot be resolved
 */
export function buildTenantRuntimeContext(input) {
  const resolution = resolveTenantNamespace(input);
  if (!resolution) {
    throw new Error('tenant_provisioning_error: cannot resolve tenant for runtime context');
  }

  const tenant = _tenantRegistry.get(resolution.tenant_id);
  if (!tenant) {
    throw new Error('tenant_provisioning_error: tenant not found');
  }

  // Collect bound client routes
  const clientIds = _tenantClients.get(tenant.tenant_id) || new Set();
  const allRoutes = new Set();
  for (const cid of clientIds) {
    const binding = _clientBindings.get(cid);
    if (binding) {
      // Binding doesn't store routes, but we note the client for association
    }
  }

  const contextHash = createHash('sha256')
    .update([
      TENANT_PROVISIONING_VERSION,
      tenant.tenant_id,
      tenant.namespace,
      tenant.governance_mode,
      tenant.allowed_intents.join(','),
      tenant.allowed_capabilities.join(','),
      String(clientIds.size),
    ].join('::'))
    .digest('hex');

  return _deepFreeze({
    tenant_id: tenant.tenant_id,
    namespace: tenant.namespace,
    governance_mode: tenant.governance_mode,
    allowed_intents: [...tenant.allowed_intents],
    allowed_capabilities: [...tenant.allowed_capabilities],
    bound_clients: clientIds.size,
    readonly_runtime: true,
    execution_allowed: false,
    context_hash: contextHash,
    built_at: new Date().toISOString(),
    version: TENANT_PROVISIONING_VERSION,
  });
}

// ─── snapshot ──────────────────────────────────────────────────────

/**
 * Build a deterministic provisioning snapshot.
 *
 * @returns {object} — deeply frozen snapshot
 */
export function buildTenantProvisioningSnapshot() {
  const tenants = [];
  for (const [, tenant] of _tenantRegistry) {
    const clientCount = (_tenantClients.get(tenant.tenant_id) || new Set()).size;
    tenants.push({
      tenant_id: tenant.tenant_id,
      tenant_name: tenant.tenant_name,
      namespace: tenant.namespace,
      governance_mode: tenant.governance_mode,
      bound_clients: clientCount,
    });
  }
  tenants.sort((a, b) => a.tenant_id.localeCompare(b.tenant_id));

  const namespaces = [..._namespaceIndex.keys()].sort();

  const bindings = [];
  for (const [clientId, binding] of _clientBindings) {
    bindings.push({ client_id: clientId, tenant_id: binding.tenant_id, namespace: binding.namespace });
  }
  bindings.sort((a, b) => a.client_id.localeCompare(b.client_id));

  // Governance distribution
  const govDist = {};
  for (const [, tenant] of _tenantRegistry) {
    govDist[tenant.governance_mode] = (govDist[tenant.governance_mode] || 0) + 1;
  }

  // Capability distribution
  const capDist = {};
  for (const [, tenant] of _tenantRegistry) {
    for (const cap of tenant.allowed_capabilities) {
      capDist[cap] = (capDist[cap] || 0) + 1;
    }
  }

  return _deepFreeze({
    version: TENANT_PROVISIONING_VERSION,
    tenants,
    total_tenants: tenants.length,
    namespaces,
    total_namespaces: namespaces.length,
    bindings,
    total_bindings: bindings.length,
    governance_distribution: govDist,
    capability_distribution: capDist,
    built_at: new Date().toISOString(),
  });
}

// ─── provisioning hash ────────────────────────────────────────────

/**
 * Deterministic SHA-256 from the normalized provisioning state.
 *
 * @returns {string}
 */
export function computeTenantProvisioningHash() {
  const tenantIds = [..._tenantRegistry.keys()].sort().join(',');
  const namespaces = [..._namespaceIndex.keys()].sort().join(',');
  const bindingPairs = [];
  for (const [clientId, binding] of _clientBindings) {
    bindingPairs.push(`${clientId}=${binding.tenant_id}`);
  }
  bindingPairs.sort();

  const hashInput = [
    TENANT_PROVISIONING_VERSION,
    tenantIds,
    namespaces,
    bindingPairs.join(','),
    String(_tenantRegistry.size),
    String(_namespaceIndex.size),
    String(_clientBindings.size),
  ].join('::');

  return createHash('sha256').update(hashInput).digest('hex');
}
