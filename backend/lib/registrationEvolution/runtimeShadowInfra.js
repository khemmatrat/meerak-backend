/**
 * Phase 11 — Shadow Infrastructure Singleton.
 *
 * Creates exactly ONE shadow tenant + policy + meter at module load time.
 * All shadow pipeline calls reuse this single frozen infrastructure.
 *
 * INVARIANTS:
 * - One tenant, one policy, one meter — forever
 * - Created once at import time, never recreated
 * - Frozen and immutable after creation
 * - No per-request registration, no graph explosion, no memory growth
 *
 * SAFETY CONTRACT:
 * - Entire creation is try/catch wrapped
 * - If creation fails, getShadowInfra() returns null (fail-open)
 * - No database, no network, no side effects beyond in-memory V2 registries
 */

import { registerTenant, resolveTenantNamespace } from './tenantProvisioningLayer.js';
import { registerTenantRuntimePolicy } from './tenantRuntimePolicyLayer.js';
import { registerUsageMeter } from './runtimeUsageMeter.js';

export const SHADOW_INFRA_VERSION = 'shadow_infra_v1';

const SHADOW_TENANT_NAME = 'shadow_bridge';
const SHADOW_NAMESPACE = 'shadow.production';
const SHADOW_GOV_MODE = 'simulation';

let _shadowInfra = null;

function _createShadowInfraOnce() {
  // Check if tenant already exists (idempotent)
  const existing = resolveTenantNamespace({ namespace: SHADOW_NAMESPACE });
  let tenant;
  if (existing) {
    tenant = existing;
  } else {
    tenant = registerTenant({
      tenant_name: SHADOW_TENANT_NAME,
      namespace: SHADOW_NAMESPACE,
      governance_mode: SHADOW_GOV_MODE,
      allowed_intents: ['user.signup', 'user.login', 'payment.capture', 'workflow.execute'],
      allowed_capabilities: ['shadow_execution'],
    });
  }

  const tenantId = tenant.tenant_id;

  let policy = null;
  try {
    policy = registerTenantRuntimePolicy({
      tenant_id: tenantId,
      namespace: SHADOW_NAMESPACE,
      governance_mode: SHADOW_GOV_MODE,
      allowed_intents: ['user.signup', 'user.login', 'payment.capture', 'workflow.execute'],
      allowed_capabilities: ['shadow_execution'],
      workflow_limits: { max_workflows: 10000, max_parallel_steps: 10, max_replay_depth: 5 },
      api_limits: { max_requests_per_minute: 100000, max_payload_size_kb: 512 },
    });
  } catch (_) { /* policy may already exist if module reloaded */ }

  let meter = null;
  try {
    meter = registerUsageMeter({
      tenant_id: tenantId,
      namespace: SHADOW_NAMESPACE,
      governance_mode: SHADOW_GOV_MODE,
      quotas: {
        max_requests_per_hour: 999999,
        max_workflow_sessions: 999999,
        max_runtime_invocations: 999999,
        max_checkpoint_operations: 999999,
      },
      metering: {
        track_requests: true,
        track_workflows: true,
        track_invocations: true,
        track_checkpoints: true,
      },
    });
  } catch (_) { /* meter may already exist if module reloaded */ }

  return Object.freeze({
    tenant_id: tenantId,
    namespace: SHADOW_NAMESPACE,
    governance_mode: SHADOW_GOV_MODE,
    tenant,
    policy,
    meter,
    initialized_at: Date.now(),
    version: SHADOW_INFRA_VERSION,
  });
}

// Initialize once at module load — fail-open if anything breaks
try {
  _shadowInfra = _createShadowInfraOnce();
} catch (_) {
  _shadowInfra = null;
}

/**
 * Get the singleton shadow infrastructure.
 * Returns null if initialization failed (fail-open).
 *
 * @returns {object|null} — frozen { tenant_id, namespace, tenant, policy, meter }
 */
export function getShadowInfra() {
  return _shadowInfra;
}

/**
 * Check if shadow infrastructure is available.
 *
 * @returns {boolean}
 */
export function isShadowInfraReady() {
  return _shadowInfra !== null && !!_shadowInfra.tenant_id;
}
