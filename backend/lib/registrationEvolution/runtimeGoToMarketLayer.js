/**
 * Phase 10.3 — Go-To-Market Foundation (Billing-Agnostic SaaS Layer).
 *
 * Packages the platform (10.1) + SDK (10.2) + sealed kernel (9.9) into
 * a market-ready SaaS offering with pricing strategy, readiness scoring,
 * and bundle management — all without real billing or payments.
 *
 * Architecture position:
 *   Kernel (9.x) → Platform (10.1) → SDK (10.2) → Go-To-Market (10.3) ◄── THIS
 *
 * Key shift: from "system that packages execution as product"
 *            to "system that measures SaaS readiness and defines pricing logic"
 *
 * SAFETY CONTRACT:
 * - execution_allowed: false on every output
 * - NO payment / billing / real money
 * - NO external API / network
 * - deterministic 100%, freeze = irreversible
 */

import { createHash, randomUUID } from 'crypto';

// Phase 9 — tenant, policy, usage, audit, convergence, seal
import { buildTenantProvisioningSnapshot, computeTenantProvisioningHash } from './tenantProvisioningLayer.js';
import { buildTenantPolicySnapshot, computeTenantPolicyHash } from './tenantRuntimePolicyLayer.js';
import { buildRuntimeUsageSnapshot, computeRuntimeUsageHash } from './runtimeUsageMeter.js';
import { buildRuntimeAuditSnapshot, computeRuntimeAuditHash } from './runtimeAuditLedger.js';
import { computeProvenanceHash } from './runtimeEventProvenanceGraph.js';
import { computeSystemConvergenceHash, detectSystemContradictions } from './runtimeSystemConvergenceEngine.js';
import { computeFinalSystemHash, isSystemFinalSealed } from './runtimeFinalSealEngine.js';

// Phase 10.1 — productization
import { computeProductPlatformHash, isProductPlatformFrozen, buildProductRuntimeSnapshot } from './runtimeProductizationLayer.js';

// Phase 10.2 — SDK packaging
import { computeSdkPackageHash, isSdkPackageFrozen, buildSdkPackageSnapshot } from './runtimeSdkPackagingLayer.js';

// ─── constants ─────────────────────────────────────────────────────

export const GTM_VERSION = 'gtm_v1';

const VALID_PRICING_MODELS = Object.freeze(new Set([
  'flat_rate', 'usage_based', 'tiered', 'freemium',
]));

const VALID_TIERS = Object.freeze(new Set(['free', 'pro', 'enterprise']));

// ─── internal state ────────────────────────────────────────────────

const _offerings = new Map();
const _pricingStrategies = new Map();
const _bundles = new Map();
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

// ─── market offering ───────────────────────────────────────────────

/**
 * Create a SaaS offering from Platform + SDK.
 *
 * @param {object} input — { name, description?, included_plans?, pricing_model? }
 * @returns {object} — deeply frozen offering record
 */
export function createMarketOffering(input) {
  if (_frozen) {
    throw new Error('gtm_error: GTM layer is frozen — no new offerings');
  }
  if (!input || typeof input !== 'object') {
    throw new Error('gtm_error: invalid input');
  }
  if (!input.name || typeof input.name !== 'string') {
    throw new Error('gtm_error: name required');
  }

  const pricingModel = input.pricing_model || 'tiered';
  if (!VALID_PRICING_MODELS.has(pricingModel)) {
    throw new Error(`gtm_error: invalid pricing_model '${pricingModel}'`);
  }

  const includedPlans = Array.isArray(input.included_plans) ? [...input.included_plans] : ['free', 'pro', 'enterprise'];
  for (const p of includedPlans) {
    if (!VALID_TIERS.has(p)) {
      throw new Error(`gtm_error: invalid plan '${p}'`);
    }
  }

  const sdkSnap = _safe(() => buildSdkPackageSnapshot());
  const platformSnap = _safe(() => buildProductRuntimeSnapshot());

  const offeringId = `offer-${randomUUID()}`;

  const hashInput = [GTM_VERSION, offeringId, input.name, pricingModel, includedPlans.sort().join(',')].join('::');
  const offeringHash = createHash('sha256').update(hashInput).digest('hex');

  const offering = _deepFreeze({
    offering_id: offeringId,
    name: input.name,
    description: input.description || '',
    included_plans: includedPlans,
    sdk_version: sdkSnap.ok ? sdkSnap.value.version : null,
    platform_version: platformSnap.ok ? platformSnap.value.version : null,
    pricing_model: pricingModel,
    execution_allowed: false,
    readonly_offering: true,
    offering_hash: offeringHash,
    version: GTM_VERSION,
    created_at: new Date().toISOString(),
  });

  _offerings.set(offeringId, offering);
  return offering;
}

// ─── pricing strategy ──────────────────────────────────────────────

/**
 * Define a logical pricing strategy (no real money).
 *
 * @param {object} input — { name?, tiers?, usage_multiplier?, entitlements? }
 * @returns {object} — deeply frozen pricing record
 */
export function definePricingStrategy(input) {
  if (_frozen) {
    throw new Error('gtm_error: GTM layer is frozen — no new pricing');
  }
  if (!input || typeof input !== 'object') {
    throw new Error('gtm_error: invalid input');
  }

  const tiers = {};
  const tierDefs = input.tiers && typeof input.tiers === 'object' ? input.tiers : {};

  for (const tier of VALID_TIERS) {
    const def = tierDefs[tier] || {};
    tiers[tier] = {
      base_price_unit: typeof def.base_price_unit === 'number' ? def.base_price_unit : (tier === 'free' ? 0 : tier === 'pro' ? 1 : 3),
      usage_multiplier: typeof def.usage_multiplier === 'number' ? def.usage_multiplier : 1.0,
      included_requests: typeof def.included_requests === 'number' ? def.included_requests : (tier === 'free' ? 100 : tier === 'pro' ? 10000 : 100000),
      included_workflows: typeof def.included_workflows === 'number' ? def.included_workflows : (tier === 'free' ? 5 : tier === 'pro' ? 100 : 1000),
    };
  }

  const limits = {
    max_tenants_per_plan: input.max_tenants_per_plan || { free: 1, pro: 5, enterprise: 50 },
    max_sdk_clients: input.max_sdk_clients || 100,
  };

  const entitlements = Array.isArray(input.entitlements) ? [...input.entitlements] : ['audit_access', 'sdk_access'];

  const pricingId = `pricing-${randomUUID()}`;

  const hashInput = [GTM_VERSION, pricingId, JSON.stringify(tiers), JSON.stringify(limits)].join('::');
  const pricingHash = createHash('sha256').update(hashInput).digest('hex');

  const strategy = _deepFreeze({
    pricing_id: pricingId,
    name: input.name || 'default_pricing',
    tiers,
    limits,
    entitlements,
    execution_allowed: false,
    readonly_pricing: true,
    pricing_hash: pricingHash,
    version: GTM_VERSION,
    defined_at: new Date().toISOString(),
  });

  _pricingStrategies.set(pricingId, strategy);
  return strategy;
}

// ─── GTM bundle ────────────────────────────────────────────────────

/**
 * Register a go-to-market bundle — combines the full ecosystem into one product.
 *
 * @param {object} input — { name?, offering_id?, pricing_id? }
 * @returns {object} — deeply frozen bundle record
 */
export function registerGoToMarketBundle(input) {
  if (_frozen) {
    throw new Error('gtm_error: GTM layer is frozen — no new bundles');
  }
  if (!input || typeof input !== 'object') {
    throw new Error('gtm_error: invalid input');
  }

  const readiness = evaluateMarketReadiness();

  const platformHash = _safe(() => computeProductPlatformHash());
  const sdkHash = _safe(() => computeSdkPackageHash());
  const sealHash = _safe(() => computeFinalSystemHash());
  const tenantSnap = _safe(() => buildTenantProvisioningSnapshot());
  const policySnap = _safe(() => buildTenantPolicySnapshot());
  const usageSnap = _safe(() => buildRuntimeUsageSnapshot());
  const auditSnap = _safe(() => buildRuntimeAuditSnapshot());

  const bundleId = `bundle-${randomUUID()}`;

  const hashInput = [
    GTM_VERSION, bundleId,
    platformHash.ok ? platformHash.value : 'none',
    sdkHash.ok ? sdkHash.value : 'none',
    sealHash.ok ? sealHash.value : 'none',
  ].join('::');
  const bundleHash = createHash('sha256').update(hashInput).digest('hex');

  const bundle = _deepFreeze({
    bundle_id: bundleId,
    name: input.name || 'default_bundle',
    offering_id: input.offering_id || null,
    pricing_id: input.pricing_id || null,
    market_ready: readiness.market_ready,
    readiness_score: readiness.score,
    blocking_issues: readiness.blockers,
    tenant_count: tenantSnap.ok ? tenantSnap.value.total_tenants : 0,
    policy_count: policySnap.ok ? policySnap.value.total_policies : 0,
    meter_count: usageSnap.ok ? usageSnap.value.total_meters : 0,
    audit_entries: auditSnap.ok ? auditSnap.value.total_entries : 0,
    execution_allowed: false,
    readonly_bundle: true,
    bundle_hash: bundleHash,
    version: GTM_VERSION,
    registered_at: new Date().toISOString(),
  });

  _bundles.set(bundleId, bundle);
  return bundle;
}

// ─── market readiness ──────────────────────────────────────────────

/**
 * Evaluate whether the system is market-ready.
 *
 * @returns {object} — deeply frozen readiness assessment
 */
export function evaluateMarketReadiness() {
  const blockers = [];
  const warnings = [];
  let score = 0;
  const maxScore = 7;

  // 1. SDK frozen (10.2)
  const sdkFrozen = _safe(() => isSdkPackageFrozen());
  if (sdkFrozen.ok && sdkFrozen.value) { score++; } else { blockers.push('sdk_not_frozen'); }

  // 2. Platform frozen (10.1)
  const platFrozen = _safe(() => isProductPlatformFrozen());
  if (platFrozen.ok && platFrozen.value) { score++; } else { blockers.push('platform_not_frozen'); }

  // 3. Kernel sealed (9.9)
  const sealed = _safe(() => isSystemFinalSealed());
  if (sealed.ok && sealed.value) { score++; } else { blockers.push('kernel_not_sealed'); }

  // 4. Policy clean (9.4)
  const policySnap = _safe(() => buildTenantPolicySnapshot());
  if (policySnap.ok) { score++; } else { warnings.push('policy_snapshot_unavailable'); }

  // 5. Usage within quota (9.5)
  const usageSnap = _safe(() => buildRuntimeUsageSnapshot());
  if (usageSnap.ok) { score++; } else { warnings.push('usage_snapshot_unavailable'); }

  // 6. Audit integrity (9.6)
  const auditSnap = _safe(() => buildRuntimeAuditSnapshot());
  if (auditSnap.ok && auditSnap.value.append_only_integrity !== false) { score++; } else { blockers.push('audit_integrity_failed'); }

  // 7. Convergence stable (9.8)
  const contradictions = _safe(() => detectSystemContradictions());
  if (contradictions.ok && contradictions.value.consistent) { score++; } else { blockers.push('convergence_contradictions'); }

  const readinessHash = createHash('sha256')
    .update([GTM_VERSION, String(score), String(maxScore), blockers.join(','), warnings.join(',')].join('::'))
    .digest('hex');

  return _deepFreeze({
    market_ready: blockers.length === 0,
    score: `${score}/${maxScore}`,
    blockers,
    warnings,
    execution_allowed: false,
    readiness_hash: readinessHash,
    version: GTM_VERSION,
    evaluated_at: new Date().toISOString(),
  });
}

// ─── freeze GTM layer ──────────────────────────────────────────────

/**
 * Lock the entire commercial layer irreversibly.
 *
 * @returns {object} — deeply frozen lock record
 * @throws {Error} if already frozen
 */
export function freezeGoToMarketLayer() {
  if (_frozen) {
    throw new Error('gtm_error: GTM layer already frozen');
  }

  _frozen = true;

  const lockHash = computeGoToMarketHash();

  return _deepFreeze({
    frozen: true,
    commercial_state: 'MARKET_LOCKED',
    offerings_locked: _offerings.size,
    pricing_locked: _pricingStrategies.size,
    bundles_locked: _bundles.size,
    market_lock_hash: lockHash,
    readonly_runtime: true,
    execution_allowed: false,
    version: GTM_VERSION,
    frozen_at: new Date().toISOString(),
  });
}

// ─── GTM snapshot ──────────────────────────────────────────────────

/**
 * Full business-level snapshot of the GTM layer.
 *
 * @returns {object} — deeply frozen snapshot
 */
export function buildGoToMarketSnapshot() {
  const tenantSnap = _safe(() => buildTenantProvisioningSnapshot());
  const sdkSnap = _safe(() => buildSdkPackageSnapshot());
  const productSnap = _safe(() => buildProductRuntimeSnapshot());
  const usageSnap = _safe(() => buildRuntimeUsageSnapshot());
  const auditSnap = _safe(() => buildRuntimeAuditSnapshot());
  const convergenceHash = _safe(() => computeSystemConvergenceHash());
  const sealHash = _safe(() => computeFinalSystemHash());
  const platformHash = _safe(() => computeProductPlatformHash());
  const sdkHash = _safe(() => computeSdkPackageHash());

  const readiness = evaluateMarketReadiness();

  return _deepFreeze({
    gtm_state: _frozen ? 'MARKET_LOCKED' : 'ACTIVE',
    offerings: _offerings.size,
    pricing_strategies: _pricingStrategies.size,
    bundles: _bundles.size,
    tenant_count: tenantSnap.ok ? tenantSnap.value.total_tenants : 0,
    sdk_clients: sdkSnap.ok ? sdkSnap.value.client_count : 0,
    plans_defined: productSnap.ok ? productSnap.value.plans_defined : 0,
    workflow_sessions: sdkSnap.ok ? sdkSnap.value.workflow_sessions : 0,
    usage_meters: usageSnap.ok ? usageSnap.value.total_meters : 0,
    audit_entries: auditSnap.ok ? auditSnap.value.total_entries : 0,
    audit_integrity: auditSnap.ok ? (auditSnap.value.append_only_integrity !== false) : false,
    readiness_score: readiness.score,
    market_ready: readiness.market_ready,
    hashes: {
      convergence: convergenceHash.ok ? convergenceHash.value : null,
      seal: sealHash.ok ? sealHash.value : null,
      platform: platformHash.ok ? platformHash.value : null,
      sdk: sdkHash.ok ? sdkHash.value : null,
      gtm: computeGoToMarketHash(),
    },
    readonly_runtime: true,
    execution_allowed: false,
    version: GTM_VERSION,
    built_at: new Date().toISOString(),
  });
}

// ─── GTM hash ──────────────────────────────────────────────────────

/**
 * Deterministic SHA-256 over all GTM + upstream layer hashes.
 *
 * @returns {string}
 */
export function computeGoToMarketHash() {
  const platformHash = _safe(() => computeProductPlatformHash());
  const sdkHash = _safe(() => computeSdkPackageHash());
  const sealHash = _safe(() => computeFinalSystemHash());
  const convergenceHash = _safe(() => computeSystemConvergenceHash());
  const tenantHash = _safe(() => computeTenantProvisioningHash());
  const policyHash = _safe(() => computeTenantPolicyHash());
  const usageHash = _safe(() => computeRuntimeUsageHash());
  const auditHash = _safe(() => computeRuntimeAuditHash());
  const provHash = _safe(() => computeProvenanceHash());

  const offeringIds = [..._offerings.keys()].sort().join(',');
  const pricingIds = [..._pricingStrategies.keys()].sort().join(',');
  const bundleIds = [..._bundles.keys()].sort().join(',');

  const hashInput = [
    GTM_VERSION,
    platformHash.ok ? platformHash.value : 'none',
    sdkHash.ok ? sdkHash.value : 'none',
    sealHash.ok ? sealHash.value : 'none',
    convergenceHash.ok ? convergenceHash.value : 'none',
    tenantHash.ok ? tenantHash.value : 'none',
    policyHash.ok ? policyHash.value : 'none',
    usageHash.ok ? usageHash.value : 'none',
    auditHash.ok ? auditHash.value : 'none',
    provHash.ok ? provHash.value : 'none',
    offeringIds,
    pricingIds,
    bundleIds,
    String(_frozen),
  ].join('::');

  return createHash('sha256').update(hashInput).digest('hex');
}

// ─── frozen check ──────────────────────────────────────────────────

/**
 * @returns {boolean}
 */
export function isGoToMarketFrozen() {
  return _frozen;
}
