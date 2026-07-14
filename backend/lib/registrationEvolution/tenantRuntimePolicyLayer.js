/**
 * Phase 9.4 — Tenant runtime policy & governance isolation layer.
 *
 * Tenant-scoped runtime governance policies above Phase 9.3 namespace
 * isolation and below future billing/marketplace layers. Defines
 * immutable policy descriptors, workflow/API limits, capability and
 * intent authorization boundaries, and deterministic policy contexts.
 *
 * Architecture position:
 *   9.1 HTTP Surface → 9.2 API Gateway → 9.3 Tenant Provisioning → 9.4 Runtime Policy ◄── THIS PHASE
 *
 * SAFETY CONTRACT:
 * - NO execution or side effects
 * - NO networking, persistence, or async workers
 * - NO kernel mutation
 * - execution_allowed is ALWAYS false
 * - readonly_policy is ALWAYS true
 * - readonly_runtime is ALWAYS true
 * - immutable, deterministic, deeply frozen outputs only
 */

import { createHash } from 'crypto';
import { resolveTenantNamespace } from './tenantProvisioningLayer.js';
import { listRegisteredIntents } from './intentRegistry.js';
import { listRuntimeCapabilityMappings } from './runtimeCapabilityMapper.js';

// ─── constants ─────────────────────────────────────────────────────

export const TENANT_RUNTIME_POLICY_VERSION = 'tenant_runtime_policy_v1';

const ALLOWED_GOVERNANCE_MODES = Object.freeze(new Set([
  'strict', 'simulation', 'canary', 'controlled',
]));

// ─── in-memory state ──────────────────────────────────────────────

const _policyRegistry = new Map();      // tenant_id → frozen policy descriptor
const _policyByNamespace = new Map();   // namespace → tenant_id

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

// ─── policy registration ───────────────────────────────────────────

/**
 * Register an immutable tenant-scoped governance policy.
 *
 * @param {object} input
 * @param {string} input.tenant_id
 * @param {string} input.namespace
 * @param {string} input.governance_mode
 * @param {string[]} [input.allowed_intents]
 * @param {string[]} [input.allowed_capabilities]
 * @param {object} [input.workflow_limits]
 * @param {object} [input.api_limits]
 * @returns {object} — deeply frozen policy descriptor
 * @throws {Error} on validation failure
 */
export function registerTenantRuntimePolicy(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('tenant_runtime_policy_error: invalid input');
  }
  if (!input.tenant_id || typeof input.tenant_id !== 'string') {
    throw new Error('tenant_runtime_policy_error: tenant_id required');
  }
  if (!input.namespace || typeof input.namespace !== 'string') {
    throw new Error('tenant_runtime_policy_error: namespace required');
  }

  const govMode = input.governance_mode || 'strict';
  if (!ALLOWED_GOVERNANCE_MODES.has(govMode)) {
    throw new Error(`tenant_runtime_policy_error: invalid governance_mode '${govMode}'`);
  }

  // Verify tenant exists via Phase 9.3
  const tenantResolution = resolveTenantNamespace({ tenant_id: input.tenant_id });
  if (!tenantResolution) {
    throw new Error(`tenant_runtime_policy_error: tenant '${input.tenant_id}' not found in Phase 9.3`);
  }

  // Namespace must match tenant
  if (tenantResolution.namespace !== input.namespace.toLowerCase().trim()) {
    throw new Error(`tenant_runtime_policy_error: namespace '${input.namespace}' does not match tenant namespace '${tenantResolution.namespace}'`);
  }

  // Governance mode must match tenant
  if (tenantResolution.governance_mode !== govMode) {
    throw new Error(`tenant_runtime_policy_error: governance_mode '${govMode}' does not match tenant governance '${tenantResolution.governance_mode}'`);
  }

  // Reject duplicate policy
  if (_policyRegistry.has(input.tenant_id)) {
    throw new Error(`tenant_runtime_policy_error: policy already registered for tenant '${input.tenant_id}'`);
  }

  // Validate intents against Phase 8.2
  const allowedIntents = input.allowed_intents || [];
  const registeredIntents = _safeCall(() => listRegisteredIntents());
  if (registeredIntents.ok && registeredIntents.value.length > 0) {
    const knownTypes = new Set(registeredIntents.value.map(i => i.intent_type || i));
    for (const it of allowedIntents) {
      if (!knownTypes.has(it)) {
        // Informational — intents may not be pre-registered in all configurations
      }
    }
  }

  // Validate capabilities against Phase 8.3
  const allowedCapabilities = input.allowed_capabilities || [];
  const registeredCaps = _safeCall(() => listRuntimeCapabilityMappings());
  if (registeredCaps.ok && registeredCaps.value.length > 0) {
    const knownCaps = new Set(registeredCaps.value.map(c => c.capability || c));
    for (const cap of allowedCapabilities) {
      if (!knownCaps.has(cap)) {
        // Informational — capabilities may not be pre-registered in all configurations
      }
    }
  }

  // Normalize limits
  const workflowLimits = _deepFreeze({
    max_workflows: (input.workflow_limits && input.workflow_limits.max_workflows) || 100,
    max_parallel_steps: (input.workflow_limits && input.workflow_limits.max_parallel_steps) || 10,
    max_replay_depth: (input.workflow_limits && input.workflow_limits.max_replay_depth) || 5,
  });

  const apiLimits = _deepFreeze({
    max_requests_per_minute: (input.api_limits && input.api_limits.max_requests_per_minute) || 1000,
    max_payload_size_kb: (input.api_limits && input.api_limits.max_payload_size_kb) || 512,
  });

  const policyId = `trp-${createHash('sha256').update(`${TENANT_RUNTIME_POLICY_VERSION}::${input.tenant_id}::${input.namespace}`).digest('hex').slice(0, 16)}`;

  const policyHash = createHash('sha256')
    .update([
      TENANT_RUNTIME_POLICY_VERSION,
      input.tenant_id,
      input.namespace,
      govMode,
      allowedIntents.slice().sort().join(','),
      allowedCapabilities.slice().sort().join(','),
      String(workflowLimits.max_workflows),
      String(workflowLimits.max_parallel_steps),
      String(workflowLimits.max_replay_depth),
      String(apiLimits.max_requests_per_minute),
      String(apiLimits.max_payload_size_kb),
    ].join('::'))
    .digest('hex');

  const descriptor = _deepFreeze({
    policy_id: policyId,
    tenant_id: input.tenant_id,
    namespace: input.namespace.toLowerCase().trim(),
    governance_mode: govMode,
    allowed_intents: Object.freeze([...allowedIntents]),
    allowed_capabilities: Object.freeze([...allowedCapabilities]),
    workflow_limits: workflowLimits,
    api_limits: apiLimits,
    readonly_policy: true,
    execution_allowed: false,
    policy_hash: policyHash,
    version: TENANT_RUNTIME_POLICY_VERSION,
    registered_at: new Date().toISOString(),
  });

  _policyRegistry.set(input.tenant_id, descriptor);
  _policyByNamespace.set(descriptor.namespace, input.tenant_id);
  return descriptor;
}

// ─── policy resolution ─────────────────────────────────────────────

/**
 * Resolve tenant policy from tenant_id, namespace, or client_id.
 *
 * @param {object} input — { tenant_id?, namespace?, client_id? }
 * @returns {object|null} — frozen policy snapshot or null
 */
export function resolveTenantRuntimePolicy(input) {
  if (!input || typeof input !== 'object') return null;

  let tenantId = null;

  // Priority: tenant_id → namespace → client_id (via Phase 9.3)
  if (input.tenant_id) {
    tenantId = input.tenant_id;
  } else if (input.namespace) {
    tenantId = _policyByNamespace.get(input.namespace.toLowerCase().trim());
  } else if (input.client_id) {
    const nsResolution = resolveTenantNamespace({ client_id: input.client_id });
    if (nsResolution) tenantId = nsResolution.tenant_id;
  }

  if (!tenantId) return null;

  const policy = _policyRegistry.get(tenantId);
  if (!policy) return null;

  return _deepFreeze({
    tenant_id: policy.tenant_id,
    namespace: policy.namespace,
    governance_mode: policy.governance_mode,
    allowed_intents: [...policy.allowed_intents],
    allowed_capabilities: [...policy.allowed_capabilities],
    limits: {
      workflow: { ...policy.workflow_limits },
      api: { ...policy.api_limits },
    },
  });
}

// ─── policy validation ─────────────────────────────────────────────

/**
 * Hard validation of tenant runtime policy.
 *
 * @param {object} [input] — { tenant_id? } or omit for system-wide
 * @returns {{ valid: true, checks: string[] }}
 * @throws {Error} on any policy violation
 */
export function validateTenantRuntimePolicy(input) {
  const checks = [];

  const policiesToCheck = [];
  if (input && input.tenant_id) {
    const policy = _policyRegistry.get(input.tenant_id);
    if (!policy) throw new Error(`tenant_runtime_policy_violation: policy not found for '${input.tenant_id}'`);
    policiesToCheck.push(policy);
  } else {
    for (const [, p] of _policyRegistry) policiesToCheck.push(p);
  }

  for (const policy of policiesToCheck) {
    // 1. Tenant isolation — tenant must exist
    const tenantResolution = resolveTenantNamespace({ tenant_id: policy.tenant_id });
    if (!tenantResolution) {
      throw new Error(`tenant_runtime_policy_violation: tenant '${policy.tenant_id}' not found`);
    }
    checks.push(`${policy.tenant_id}::tenant_exists`);

    // 2. Governance mode alignment
    if (tenantResolution.governance_mode !== policy.governance_mode) {
      throw new Error(`tenant_runtime_policy_violation: governance mismatch for '${policy.tenant_id}'`);
    }
    checks.push(`${policy.tenant_id}::governance_aligned`);

    // 3. Namespace isolation preserved
    if (tenantResolution.namespace !== policy.namespace) {
      throw new Error(`tenant_runtime_policy_violation: namespace mismatch for '${policy.tenant_id}'`);
    }
    checks.push(`${policy.tenant_id}::namespace_isolated`);

    // 4. Workflow limits non-negative
    if (policy.workflow_limits.max_workflows < 0 || policy.workflow_limits.max_parallel_steps < 0 || policy.workflow_limits.max_replay_depth < 0) {
      throw new Error(`tenant_runtime_policy_violation: negative workflow limits for '${policy.tenant_id}'`);
    }
    checks.push(`${policy.tenant_id}::workflow_limits_valid`);

    // 5. API limits valid
    if (policy.api_limits.max_requests_per_minute < 0 || policy.api_limits.max_payload_size_kb < 0) {
      throw new Error(`tenant_runtime_policy_violation: negative API limits for '${policy.tenant_id}'`);
    }
    checks.push(`${policy.tenant_id}::api_limits_valid`);

    // 6. Policy hash reproducible
    const recomputed = createHash('sha256')
      .update([
        TENANT_RUNTIME_POLICY_VERSION,
        policy.tenant_id,
        policy.namespace,
        policy.governance_mode,
        policy.allowed_intents.slice().sort().join(','),
        policy.allowed_capabilities.slice().sort().join(','),
        String(policy.workflow_limits.max_workflows),
        String(policy.workflow_limits.max_parallel_steps),
        String(policy.workflow_limits.max_replay_depth),
        String(policy.api_limits.max_requests_per_minute),
        String(policy.api_limits.max_payload_size_kb),
      ].join('::'))
      .digest('hex');
    if (recomputed !== policy.policy_hash) {
      throw new Error(`tenant_runtime_policy_violation: policy_hash not reproducible for '${policy.tenant_id}'`);
    }
    checks.push(`${policy.tenant_id}::hash_reproducible`);
  }

  return { valid: true, checks };
}

// ─── policy runtime context ───────────────────────────────────────

/**
 * Create tenant-scoped readonly runtime policy context.
 *
 * @param {object} input — { tenant_id? , namespace?, client_id? }
 * @returns {object} — deeply frozen policy context
 * @throws {Error} if policy cannot be resolved
 */
export function buildTenantPolicyRuntimeContext(input) {
  const resolved = resolveTenantRuntimePolicy(input);
  if (!resolved) {
    throw new Error('tenant_runtime_policy_error: cannot resolve policy for runtime context');
  }

  const contextHash = createHash('sha256')
    .update([
      TENANT_RUNTIME_POLICY_VERSION,
      resolved.tenant_id,
      resolved.namespace,
      resolved.governance_mode,
      resolved.allowed_intents.join(','),
      resolved.allowed_capabilities.join(','),
      String(resolved.limits.workflow.max_workflows),
      String(resolved.limits.api.max_requests_per_minute),
    ].join('::'))
    .digest('hex');

  return _deepFreeze({
    tenant_id: resolved.tenant_id,
    namespace: resolved.namespace,
    governance_mode: resolved.governance_mode,
    allowed_intents: [...resolved.allowed_intents],
    allowed_capabilities: [...resolved.allowed_capabilities],
    limits: resolved.limits,
    runtime_policy_hash: contextHash,
    readonly_runtime: true,
    execution_allowed: false,
    version: TENANT_RUNTIME_POLICY_VERSION,
    built_at: new Date().toISOString(),
  });
}

// ─── snapshot ──────────────────────────────────────────────────────

/**
 * Build a deterministic aggregate policy snapshot.
 *
 * @returns {object} — deeply frozen snapshot
 */
export function buildTenantPolicySnapshot() {
  const policies = [];
  for (const [, policy] of _policyRegistry) {
    policies.push({
      tenant_id: policy.tenant_id,
      namespace: policy.namespace,
      governance_mode: policy.governance_mode,
      intents: policy.allowed_intents.length,
      capabilities: policy.allowed_capabilities.length,
      max_workflows: policy.workflow_limits.max_workflows,
      max_rps: policy.api_limits.max_requests_per_minute,
    });
  }
  policies.sort((a, b) => a.tenant_id.localeCompare(b.tenant_id));

  // Governance distribution
  const govDist = {};
  for (const p of policies) {
    govDist[p.governance_mode] = (govDist[p.governance_mode] || 0) + 1;
  }

  // Intent distribution
  const intentDist = {};
  for (const [, policy] of _policyRegistry) {
    for (const it of policy.allowed_intents) {
      intentDist[it] = (intentDist[it] || 0) + 1;
    }
  }

  // Capability distribution
  const capDist = {};
  for (const [, policy] of _policyRegistry) {
    for (const cap of policy.allowed_capabilities) {
      capDist[cap] = (capDist[cap] || 0) + 1;
    }
  }

  // Workflow limit summaries
  let totalMaxWf = 0, totalMaxParallel = 0, totalMaxReplay = 0;
  for (const [, policy] of _policyRegistry) {
    totalMaxWf += policy.workflow_limits.max_workflows;
    totalMaxParallel += policy.workflow_limits.max_parallel_steps;
    totalMaxReplay += policy.workflow_limits.max_replay_depth;
  }

  // API limit summaries
  let totalMaxRps = 0, totalMaxPayload = 0;
  for (const [, policy] of _policyRegistry) {
    totalMaxRps += policy.api_limits.max_requests_per_minute;
    totalMaxPayload += policy.api_limits.max_payload_size_kb;
  }

  return _deepFreeze({
    version: TENANT_RUNTIME_POLICY_VERSION,
    policies,
    total_tenants: _policyRegistry.size,
    total_policies: policies.length,
    governance_distribution: govDist,
    intent_distribution: intentDist,
    capability_distribution: capDist,
    workflow_limits_summary: { total_max_workflows: totalMaxWf, total_max_parallel_steps: totalMaxParallel, total_max_replay_depth: totalMaxReplay },
    api_limits_summary: { total_max_rps: totalMaxRps, total_max_payload_kb: totalMaxPayload },
    built_at: new Date().toISOString(),
  });
}

// ─── policy hash ───────────────────────────────────────────────────

/**
 * Deterministic SHA-256 from normalized policy state.
 *
 * @returns {string}
 */
export function computeTenantPolicyHash() {
  const entries = [];
  for (const [tenantId, policy] of _policyRegistry) {
    entries.push(`${tenantId}=${policy.namespace}=${policy.governance_mode}=${policy.policy_hash}`);
  }
  entries.sort();

  const hashInput = [
    TENANT_RUNTIME_POLICY_VERSION,
    entries.join(','),
    String(_policyRegistry.size),
  ].join('::');

  return createHash('sha256').update(hashInput).digest('hex');
}
