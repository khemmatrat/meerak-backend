/**
 * Phase 10.1 — Productization Layer (SaaS + Platform Exposure Core).
 *
 * Transforms the sealed kernel (8.x–9.9) into a "Platform Product API +
 * Commercial Runtime Boundary".
 *
 * No new governance logic. This layer wraps the system so it can be
 * consumed as a product:
 *   - Product boundary around the sealed kernel
 *   - Product surface model (sellable/metered/plan units)
 *   - Commercial control layer (plan tiers, quota binding, entitlements)
 *   - Platform contract layer (external vs internal surface)
 *
 * Architecture position:
 *   Kernel (8–9) → Convergence (9.8) → Seal (9.9) → PRODUCT PLATFORM (10.1) ◄── THIS
 *
 * SAFETY CONTRACT:
 * - NO logic execution
 * - NO kernel mutation
 * - NO network / billing implementation
 * - Only product abstraction layer + deterministic mapping
 */

import { createHash, randomUUID } from 'crypto';

import { computeSystemConvergenceHash } from './runtimeSystemConvergenceEngine.js';
import { computeFinalSystemHash, isSystemFinalSealed } from './runtimeFinalSealEngine.js';
import { computeSdkSurfaceHash, buildSdkRuntimeSnapshot } from './runtimeSdkSurface.js';
import { computeRuntimeSurfaceHash } from './runtimeHttpSurface.js';
import { computeApiGatewayHash, buildApiGatewaySnapshot } from './runtimeApiGateway.js';
import { buildTenantProvisioningSnapshot, computeTenantProvisioningHash } from './tenantProvisioningLayer.js';
import { computeTenantPolicyHash, buildTenantPolicySnapshot } from './tenantRuntimePolicyLayer.js';
import { computeRuntimeUsageHash, buildRuntimeUsageSnapshot } from './runtimeUsageMeter.js';
import { computeRuntimeAuditHash, buildRuntimeAuditSnapshot } from './runtimeAuditLedger.js';
import { resolveRuntimeCapability, listRuntimeCapabilityMappings } from './runtimeCapabilityMapper.js';

// ─── constants ─────────────────────────────────────────────────────

export const RUNTIME_PRODUCTIZATION_VERSION = 'runtime_productization_v1';

const VALID_PLAN_IDS = Object.freeze(new Set(['free', 'pro', 'enterprise']));

const DEFAULT_PLAN_LIMITS = Object.freeze({
  free: { requests_per_minute: 60, workflows: 5, tenants: 1 },
  pro: { requests_per_minute: 1000, workflows: 100, tenants: 5 },
  enterprise: { requests_per_minute: 10000, workflows: 1000, tenants: 50 },
});

const DEFAULT_PLAN_CAPABILITIES = Object.freeze({
  free: ['simulation_only'],
  pro: ['controlled_execution', 'audit_access'],
  enterprise: ['controlled_execution', 'audit_access', 'provenance_access', 'sdk_full_access'],
});

// ─── internal state ────────────────────────────────────────────────

let _platformInstance = null;
let _planRegistry = new Map();
let _tenantPlanBindings = new Map();
let _frozen = false;

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

function _safe(fn) {
  try { return { ok: true, value: fn() }; } catch (e) { return { ok: false, error: e.message }; }
}

// ─── create product platform ───────────────────────────────────────

/**
 * Create the productized platform instance on top of the sealed kernel.
 *
 * @param {object} [input] - optional config overrides
 * @returns {object} — deeply frozen platform descriptor
 * @throws {Error} if platform already created or frozen
 */
export function createProductPlatform(input) {
  if (_frozen) {
    throw new Error('product_platform_error: platform is frozen');
  }
  if (_platformInstance) {
    throw new Error('product_platform_error: platform already created');
  }

  const config = input && typeof input === 'object' ? input : {};

  const sealHash = _safe(() => computeFinalSystemHash());
  const convergenceHash = _safe(() => computeSystemConvergenceHash());

  const platformId = `plat-${randomUUID()}`;

  _platformInstance = _deepFreeze({
    platform_id: platformId,
    sealed_kernel_hash: sealHash.ok ? sealHash.value : null,
    convergence_hash: convergenceHash.ok ? convergenceHash.value : null,
    exposed_surface: {
      http: config.expose_http !== false,
      sdk: config.expose_sdk !== false,
      gateway: config.expose_gateway !== false,
    },
    product_mode: 'SaaS_READY',
    readonly_runtime: true,
    execution_allowed: false,
    version: RUNTIME_PRODUCTIZATION_VERSION,
    created_at: new Date().toISOString(),
  });

  return _platformInstance;
}

// ─── plan management ───────────────────────────────────────────────

/**
 * Define a product plan (no billing — abstract tier definition only).
 *
 * @param {object} input — { plan_id, limits?, capabilities? }
 * @returns {object} — deeply frozen plan record
 * @throws {Error} on invalid input or duplicate
 */
export function defineProductPlan(input) {
  if (_frozen) {
    throw new Error('product_platform_error: platform is frozen — no new plans');
  }
  if (!input || typeof input !== 'object') {
    throw new Error('product_platform_error: invalid input');
  }
  if (!input.plan_id || !VALID_PLAN_IDS.has(input.plan_id)) {
    throw new Error(`product_platform_error: invalid plan_id — must be one of: ${[...VALID_PLAN_IDS].join(', ')}`);
  }
  if (_planRegistry.has(input.plan_id)) {
    throw new Error(`product_platform_error: plan '${input.plan_id}' already defined`);
  }

  const defaults = DEFAULT_PLAN_LIMITS[input.plan_id];
  const limits = {
    requests_per_minute: (input.limits && typeof input.limits.requests_per_minute === 'number')
      ? input.limits.requests_per_minute : defaults.requests_per_minute,
    workflows: (input.limits && typeof input.limits.workflows === 'number')
      ? input.limits.workflows : defaults.workflows,
    tenants: (input.limits && typeof input.limits.tenants === 'number')
      ? input.limits.tenants : defaults.tenants,
  };

  const capabilities = Array.isArray(input.capabilities)
    ? [...input.capabilities]
    : [...DEFAULT_PLAN_CAPABILITIES[input.plan_id]];

  const plan = _deepFreeze({
    plan_id: input.plan_id,
    limits,
    capabilities,
    readonly_plan: true,
    execution_allowed: false,
    version: RUNTIME_PRODUCTIZATION_VERSION,
    defined_at: new Date().toISOString(),
  });

  _planRegistry.set(input.plan_id, plan);
  return plan;
}

// ─── tenant-plan binding ───────────────────────────────────────────

/**
 * Bind a tenant (9.3) to a product plan.
 * Validates policy compatibility (9.4), quota compatibility (9.5),
 * and capability mapping (8.3).
 *
 * @param {{ tenant_id: string }} tenant
 * @param {{ plan_id: string }} plan
 * @returns {object} — deeply frozen binding record
 */
export function bindTenantToPlan(tenant, plan) {
  if (_frozen) {
    throw new Error('product_platform_error: platform is frozen — no new bindings');
  }
  if (!tenant || !tenant.tenant_id) {
    throw new Error('product_platform_error: tenant_id required');
  }
  if (!plan || !plan.plan_id) {
    throw new Error('product_platform_error: plan_id required');
  }

  const planRecord = _planRegistry.get(plan.plan_id);
  if (!planRecord) {
    throw new Error(`product_platform_error: plan '${plan.plan_id}' not defined`);
  }

  if (_tenantPlanBindings.has(tenant.tenant_id)) {
    throw new Error(`product_platform_error: tenant '${tenant.tenant_id}' already bound to a plan`);
  }

  // Validate tenant exists in provisioning layer (9.3)
  const tenantSnap = _safe(() => buildTenantProvisioningSnapshot());
  if (tenantSnap.ok) {
    const found = tenantSnap.value.tenants.find(t => t.tenant_id === tenant.tenant_id);
    if (!found) {
      throw new Error(`product_platform_error: tenant '${tenant.tenant_id}' not found in provisioning layer`);
    }
  }

  // Validate policy exists (9.4)
  const policySnap = _safe(() => buildTenantPolicySnapshot());

  // Validate capability compatibility (8.3)
  const capValidation = [];
  for (const cap of planRecord.capabilities) {
    const capCheck = _safe(() => resolveRuntimeCapability(
      { intent_type: 'product_entitlement', intent_id: `plan_${plan.plan_id}` },
      cap
    ));
    capValidation.push({ capability: cap, resolved: capCheck.ok });
  }

  const bindingId = `binding-${randomUUID()}`;

  const binding = _deepFreeze({
    binding_id: bindingId,
    tenant_id: tenant.tenant_id,
    plan_id: plan.plan_id,
    plan_limits: planRecord.limits,
    plan_capabilities: planRecord.capabilities,
    capability_validation: capValidation,
    readonly_binding: true,
    execution_allowed: false,
    version: RUNTIME_PRODUCTIZATION_VERSION,
    bound_at: new Date().toISOString(),
  });

  _tenantPlanBindings.set(tenant.tenant_id, binding);
  return binding;
}

// ─── product runtime snapshot ──────────────────────────────────────

/**
 * Build comprehensive product runtime snapshot.
 *
 * @returns {object} — deeply frozen product state
 */
export function buildProductRuntimeSnapshot() {
  const tenantSnap = _safe(() => buildTenantProvisioningSnapshot());
  const sdkSnap = _safe(() => buildSdkRuntimeSnapshot());
  const gwSnap = _safe(() => buildApiGatewaySnapshot());
  const auditSnap = _safe(() => buildRuntimeAuditSnapshot());
  const usageSnap = _safe(() => buildRuntimeUsageSnapshot());
  const convergenceHash = _safe(() => computeSystemConvergenceHash());
  const sealHash = _safe(() => computeFinalSystemHash());

  const plans = [..._planRegistry.values()];
  const bindings = [..._tenantPlanBindings.values()];

  const planDistribution = {};
  for (const binding of bindings) {
    planDistribution[binding.plan_id] = (planDistribution[binding.plan_id] || 0) + 1;
  }

  return _deepFreeze({
    product_state: _platformInstance ? (_frozen ? 'LOCKED' : 'ACTIVE') : 'NOT_INITIALIZED',
    platform_id: _platformInstance ? _platformInstance.platform_id : null,
    tenant_count: tenantSnap.ok ? tenantSnap.value.total_tenants : 0,
    sdk_clients: sdkSnap.ok ? sdkSnap.value.total_clients : 0,
    gateway_clients: gwSnap.ok ? gwSnap.value.total_clients : 0,
    audit_entries: auditSnap.ok ? auditSnap.value.total_entries : 0,
    metered_tenants: usageSnap.ok ? usageSnap.value.total_meters : 0,
    plans_defined: plans.length,
    plan_distribution: planDistribution,
    bindings_count: bindings.length,
    convergence_hash: convergenceHash.ok ? convergenceHash.value : null,
    seal_hash: sealHash.ok ? sealHash.value : null,
    system_sealed: _safe(() => isSystemFinalSealed()).value || false,
    product_frozen: _frozen,
    readonly_runtime: true,
    execution_allowed: false,
    version: RUNTIME_PRODUCTIZATION_VERSION,
    built_at: new Date().toISOString(),
  });
}

// ─── product platform hash ─────────────────────────────────────────

/**
 * Deterministic SHA-256 — the "commercial fingerprint".
 *
 * @returns {string}
 */
export function computeProductPlatformHash() {
  const sealHash = _safe(() => computeFinalSystemHash());
  const convergenceHash = _safe(() => computeSystemConvergenceHash());
  const usageHash = _safe(() => computeRuntimeUsageHash());
  const tenantHash = _safe(() => computeTenantProvisioningHash());
  const policyHash = _safe(() => computeTenantPolicyHash());
  const sdkHash = _safe(() => computeSdkSurfaceHash());
  const httpHash = _safe(() => computeRuntimeSurfaceHash());
  const gwHash = _safe(() => computeApiGatewayHash());
  const auditHash = _safe(() => computeRuntimeAuditHash());

  const planIds = [..._planRegistry.keys()].sort().join(',');
  const bindingIds = [..._tenantPlanBindings.keys()].sort().join(',');

  const hashInput = [
    RUNTIME_PRODUCTIZATION_VERSION,
    sealHash.ok ? sealHash.value : 'none',
    convergenceHash.ok ? convergenceHash.value : 'none',
    usageHash.ok ? usageHash.value : 'none',
    tenantHash.ok ? tenantHash.value : 'none',
    policyHash.ok ? policyHash.value : 'none',
    sdkHash.ok ? sdkHash.value : 'none',
    httpHash.ok ? httpHash.value : 'none',
    gwHash.ok ? gwHash.value : 'none',
    auditHash.ok ? auditHash.value : 'none',
    planIds,
    bindingIds,
    _platformInstance ? _platformInstance.platform_id : 'none',
    String(_frozen),
  ].join('::');

  return createHash('sha256').update(hashInput).digest('hex');
}

// ─── freeze product platform ───────────────────────────────────────

/**
 * Lock the product platform state permanently.
 *
 * @returns {object} — deeply frozen lock record
 * @throws {Error} if not initialized or already frozen
 */
export function freezeProductPlatform() {
  if (!_platformInstance) {
    throw new Error('product_platform_error: platform not initialized');
  }
  if (_frozen) {
    throw new Error('product_platform_error: platform already frozen');
  }

  _frozen = true;

  const finalHash = computeProductPlatformHash();

  return _deepFreeze({
    product_frozen: true,
    commercial_state: 'LOCKED',
    billing_ready: true,
    platform_id: _platformInstance.platform_id,
    final_hash: finalHash,
    plans_locked: _planRegistry.size,
    bindings_locked: _tenantPlanBindings.size,
    readonly_runtime: true,
    execution_allowed: false,
    version: RUNTIME_PRODUCTIZATION_VERSION,
    frozen_at: new Date().toISOString(),
  });
}

// ─── frozen check ──────────────────────────────────────────────────

/**
 * @returns {boolean}
 */
export function isProductPlatformFrozen() {
  return _frozen;
}
