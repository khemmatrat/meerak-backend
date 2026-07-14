/**
 * Phase 9.5 — Runtime usage metering & deterministic quota layer.
 *
 * Deterministic runtime metering and quota accounting above tenant
 * runtime policies (9.4) and below future billing/subscription layers.
 * Provides readonly, non-billing governance metering with tenant-scoped
 * usage isolation.
 *
 * Architecture position:
 *   9.3 Tenant Provisioning → 9.4 Runtime Policy → 9.5 Usage Meter ◄── THIS PHASE
 *
 * SAFETY CONTRACT:
 * - NO execution or side effects
 * - NO billing or payment logic
 * - NO persistence, networking, or async workers
 * - NO kernel mutation
 * - execution_allowed is ALWAYS false
 * - readonly_meter is ALWAYS true
 * - readonly_runtime is ALWAYS true
 * - immutable, deterministic, deeply frozen outputs only
 */

import { createHash } from 'crypto';
import { resolveTenantNamespace } from './tenantProvisioningLayer.js';
import { resolveTenantRuntimePolicy } from './tenantRuntimePolicyLayer.js';

// ─── constants ─────────────────────────────────────────────────────

export const RUNTIME_USAGE_METER_VERSION = 'runtime_usage_meter_v1';

const USAGE_EVENT_TYPES = Object.freeze(new Set([
  'request',
  'workflow_session',
  'runtime_invocation',
  'checkpoint_operation',
]));

const ALLOWED_GOVERNANCE_MODES = Object.freeze(new Set([
  'strict', 'simulation', 'canary', 'controlled',
]));

// ─── in-memory state ──────────────────────────────────────────────

const _meterRegistry = new Map();       // tenant_id → frozen meter descriptor
const _usageCounters = new Map();       // tenant_id → { request, workflow_session, ... }
let _totalUsageEvents = 0;

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

function _ensureCounters(tenantId) {
  if (!_usageCounters.has(tenantId)) {
    _usageCounters.set(tenantId, {
      request: 0,
      workflow_session: 0,
      runtime_invocation: 0,
      checkpoint_operation: 0,
    });
  }
  return _usageCounters.get(tenantId);
}

// ─── meter registration ────────────────────────────────────────────

/**
 * Register an immutable tenant-scoped metering profile.
 *
 * @param {object} input
 * @param {string} input.tenant_id
 * @param {string} input.namespace
 * @param {string} input.governance_mode
 * @param {object} input.quotas
 * @param {object} input.metering
 * @returns {object} — deeply frozen meter descriptor
 * @throws {Error} on validation failure
 */
export function registerUsageMeter(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('runtime_usage_meter_error: invalid input');
  }
  if (!input.tenant_id || typeof input.tenant_id !== 'string') {
    throw new Error('runtime_usage_meter_error: tenant_id required');
  }
  if (!input.namespace || typeof input.namespace !== 'string') {
    throw new Error('runtime_usage_meter_error: namespace required');
  }

  const govMode = input.governance_mode || 'strict';
  if (!ALLOWED_GOVERNANCE_MODES.has(govMode)) {
    throw new Error(`runtime_usage_meter_error: invalid governance_mode '${govMode}'`);
  }

  // Tenant must exist (Phase 9.3)
  const tenantResolution = resolveTenantNamespace({ tenant_id: input.tenant_id });
  if (!tenantResolution) {
    throw new Error(`runtime_usage_meter_error: tenant '${input.tenant_id}' not found`);
  }

  // Namespace must match
  if (tenantResolution.namespace !== input.namespace.toLowerCase().trim()) {
    throw new Error(`runtime_usage_meter_error: namespace mismatch`);
  }

  // Governance must align
  if (tenantResolution.governance_mode !== govMode) {
    throw new Error(`runtime_usage_meter_error: governance_mode mismatch`);
  }

  // Tenant runtime policy must exist (Phase 9.4)
  const policyResolution = resolveTenantRuntimePolicy({ tenant_id: input.tenant_id });
  if (!policyResolution) {
    throw new Error(`runtime_usage_meter_error: tenant runtime policy not found for '${input.tenant_id}'`);
  }

  // Reject duplicate
  if (_meterRegistry.has(input.tenant_id)) {
    throw new Error(`runtime_usage_meter_error: meter already registered for tenant '${input.tenant_id}'`);
  }

  // Normalize quotas
  const quotas = input.quotas || {};
  const normalizedQuotas = {
    max_requests_per_hour: _nonNegInt(quotas.max_requests_per_hour, 10000),
    max_workflow_sessions: _nonNegInt(quotas.max_workflow_sessions, 500),
    max_runtime_invocations: _nonNegInt(quotas.max_runtime_invocations, 5000),
    max_checkpoint_operations: _nonNegInt(quotas.max_checkpoint_operations, 2000),
  };

  // Normalize metering flags
  const metering = input.metering || {};
  const normalizedMetering = {
    track_requests: metering.track_requests === true,
    track_workflows: metering.track_workflows === true,
    track_invocations: metering.track_invocations === true,
    track_checkpoints: metering.track_checkpoints === true,
  };

  const meterId = `rum-${createHash('sha256').update(`${RUNTIME_USAGE_METER_VERSION}::${input.tenant_id}::${input.namespace}`).digest('hex').slice(0, 16)}`;

  const meterHash = createHash('sha256')
    .update([
      RUNTIME_USAGE_METER_VERSION,
      input.tenant_id,
      input.namespace.toLowerCase().trim(),
      govMode,
      String(normalizedQuotas.max_requests_per_hour),
      String(normalizedQuotas.max_workflow_sessions),
      String(normalizedQuotas.max_runtime_invocations),
      String(normalizedQuotas.max_checkpoint_operations),
      String(normalizedMetering.track_requests),
      String(normalizedMetering.track_workflows),
      String(normalizedMetering.track_invocations),
      String(normalizedMetering.track_checkpoints),
    ].join('::'))
    .digest('hex');

  const descriptor = _deepFreeze({
    meter_id: meterId,
    tenant_id: input.tenant_id,
    namespace: input.namespace.toLowerCase().trim(),
    governance_mode: govMode,
    quotas: normalizedQuotas,
    metering: normalizedMetering,
    readonly_meter: true,
    execution_allowed: false,
    meter_hash: meterHash,
    version: RUNTIME_USAGE_METER_VERSION,
    registered_at: new Date().toISOString(),
  });

  _meterRegistry.set(input.tenant_id, descriptor);
  _ensureCounters(input.tenant_id);
  return descriptor;
}

function _nonNegInt(val, fallback) {
  const n = typeof val === 'number' ? Math.floor(val) : fallback;
  return n < 0 ? 0 : n;
}

// ─── usage recording ───────────────────────────────────────────────

/**
 * Deterministically record a readonly usage event.
 *
 * @param {object} input
 * @param {string} input.tenant_id
 * @param {string} input.event_type
 * @returns {object} — deeply frozen usage event record
 * @throws {Error} on invalid input or unknown event type
 */
export function recordRuntimeUsage(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('runtime_usage_meter_error: invalid input');
  }
  if (!input.tenant_id || typeof input.tenant_id !== 'string') {
    throw new Error('runtime_usage_meter_error: tenant_id required');
  }
  if (!input.event_type || !USAGE_EVENT_TYPES.has(input.event_type)) {
    throw new Error(`runtime_usage_meter_error: unknown event_type '${input.event_type}'`);
  }

  const meter = _meterRegistry.get(input.tenant_id);
  if (!meter) {
    throw new Error(`runtime_usage_meter_error: no meter registered for tenant '${input.tenant_id}'`);
  }

  // Check metering flag for this event type
  const trackingMap = {
    request: meter.metering.track_requests,
    workflow_session: meter.metering.track_workflows,
    runtime_invocation: meter.metering.track_invocations,
    checkpoint_operation: meter.metering.track_checkpoints,
  };

  if (!trackingMap[input.event_type]) {
    throw new Error(`runtime_usage_meter_error: event_type '${input.event_type}' not tracked for tenant '${input.tenant_id}'`);
  }

  // Quota mapping
  const quotaMap = {
    request: meter.quotas.max_requests_per_hour,
    workflow_session: meter.quotas.max_workflow_sessions,
    runtime_invocation: meter.quotas.max_runtime_invocations,
    checkpoint_operation: meter.quotas.max_checkpoint_operations,
  };

  const counters = _ensureCounters(input.tenant_id);
  counters[input.event_type]++;
  _totalUsageEvents++;

  const currentUsage = counters[input.event_type];
  const quotaLimit = quotaMap[input.event_type];
  const quotaRemaining = Math.max(0, quotaLimit - currentUsage);

  const usageEventId = `rue-${createHash('sha256').update(`${RUNTIME_USAGE_METER_VERSION}::${input.tenant_id}::${input.event_type}::${currentUsage}`).digest('hex').slice(0, 12)}`;

  const usageHash = createHash('sha256')
    .update(`${RUNTIME_USAGE_METER_VERSION}::usage::${input.tenant_id}::${input.event_type}::${currentUsage}::${quotaLimit}`)
    .digest('hex');

  return _deepFreeze({
    usage_event_id: usageEventId,
    tenant_id: input.tenant_id,
    event_type: input.event_type,
    recorded: true,
    current_usage: currentUsage,
    quota_limit: quotaLimit,
    quota_remaining: quotaRemaining,
    execution_allowed: false,
    usage_hash: usageHash,
    recorded_at: new Date().toISOString(),
    version: RUNTIME_USAGE_METER_VERSION,
  });
}

// ─── quota state resolution ────────────────────────────────────────

/**
 * Resolve current quota state for a tenant.
 *
 * @param {object} input — { tenant_id }
 * @returns {object} — deeply frozen quota state
 * @throws {Error} if meter not found
 */
export function resolveRuntimeQuotaState(input) {
  if (!input || !input.tenant_id) {
    throw new Error('runtime_usage_meter_error: tenant_id required');
  }

  const meter = _meterRegistry.get(input.tenant_id);
  if (!meter) {
    throw new Error(`runtime_usage_meter_error: no meter for tenant '${input.tenant_id}'`);
  }

  const counters = _ensureCounters(input.tenant_id);

  const usage = {
    request: counters.request,
    workflow_session: counters.workflow_session,
    runtime_invocation: counters.runtime_invocation,
    checkpoint_operation: counters.checkpoint_operation,
  };

  const remaining = {
    request: Math.max(0, meter.quotas.max_requests_per_hour - counters.request),
    workflow_session: Math.max(0, meter.quotas.max_workflow_sessions - counters.workflow_session),
    runtime_invocation: Math.max(0, meter.quotas.max_runtime_invocations - counters.runtime_invocation),
    checkpoint_operation: Math.max(0, meter.quotas.max_checkpoint_operations - counters.checkpoint_operation),
  };

  const utilization = {
    request: Math.min(100, meter.quotas.max_requests_per_hour > 0 ? Math.round((counters.request / meter.quotas.max_requests_per_hour) * 100) : 0),
    workflow_session: Math.min(100, meter.quotas.max_workflow_sessions > 0 ? Math.round((counters.workflow_session / meter.quotas.max_workflow_sessions) * 100) : 0),
    runtime_invocation: Math.min(100, meter.quotas.max_runtime_invocations > 0 ? Math.round((counters.runtime_invocation / meter.quotas.max_runtime_invocations) * 100) : 0),
    checkpoint_operation: Math.min(100, meter.quotas.max_checkpoint_operations > 0 ? Math.round((counters.checkpoint_operation / meter.quotas.max_checkpoint_operations) * 100) : 0),
  };

  const exceeded = remaining.request === 0 || remaining.workflow_session === 0 ||
    remaining.runtime_invocation === 0 || remaining.checkpoint_operation === 0;

  return _deepFreeze({
    tenant_id: input.tenant_id,
    namespace: meter.namespace,
    quotas: { ...meter.quotas },
    usage,
    remaining,
    utilization_percent: utilization,
    quota_exceeded: exceeded,
    readonly_runtime: true,
    execution_allowed: false,
    version: RUNTIME_USAGE_METER_VERSION,
  });
}

// ─── quota validation ──────────────────────────────────────────────

/**
 * Hard quota enforcement validator.
 *
 * @param {object} input — { tenant_id }
 * @returns {{ valid: true, checks: string[] }}
 * @throws {Error} on quota violation
 */
export function validateRuntimeQuota(input) {
  if (!input || !input.tenant_id) {
    throw new Error('runtime_quota_violation: tenant_id required');
  }

  const checks = [];

  // Meter exists
  const meter = _meterRegistry.get(input.tenant_id);
  if (!meter) {
    throw new Error(`runtime_quota_violation: no meter for tenant '${input.tenant_id}'`);
  }
  checks.push('meter_exists');

  // Tenant exists (Phase 9.3)
  const tenantResolution = resolveTenantNamespace({ tenant_id: input.tenant_id });
  if (!tenantResolution) {
    throw new Error(`runtime_quota_violation: tenant '${input.tenant_id}' not found`);
  }
  checks.push('tenant_exists');

  // Governance alignment
  if (tenantResolution.governance_mode !== meter.governance_mode) {
    throw new Error(`runtime_quota_violation: governance mismatch for '${input.tenant_id}'`);
  }
  checks.push('governance_aligned');

  // Namespace isolation
  if (tenantResolution.namespace !== meter.namespace) {
    throw new Error(`runtime_quota_violation: namespace mismatch for '${input.tenant_id}'`);
  }
  checks.push('namespace_isolated');

  // Usage within quota
  const counters = _ensureCounters(input.tenant_id);
  const quotaChecks = [
    { type: 'request', usage: counters.request, limit: meter.quotas.max_requests_per_hour, tracked: meter.metering.track_requests },
    { type: 'workflow_session', usage: counters.workflow_session, limit: meter.quotas.max_workflow_sessions, tracked: meter.metering.track_workflows },
    { type: 'runtime_invocation', usage: counters.runtime_invocation, limit: meter.quotas.max_runtime_invocations, tracked: meter.metering.track_invocations },
    { type: 'checkpoint_operation', usage: counters.checkpoint_operation, limit: meter.quotas.max_checkpoint_operations, tracked: meter.metering.track_checkpoints },
  ];

  for (const qc of quotaChecks) {
    if (qc.tracked && qc.usage > qc.limit) {
      throw new Error(`runtime_quota_violation: ${qc.type} usage (${qc.usage}) exceeds quota (${qc.limit}) for '${input.tenant_id}'`);
    }
    checks.push(`${qc.type}_within_quota`);
  }

  return { valid: true, checks };
}

// ─── snapshot ──────────────────────────────────────────────────────

/**
 * Build a deterministic platform-wide metering snapshot.
 *
 * @returns {object} — deeply frozen snapshot
 */
export function buildRuntimeUsageSnapshot() {
  const meters = [];
  let exceededCount = 0;
  const govDist = {};
  const trackedDist = { request: 0, workflow_session: 0, runtime_invocation: 0, checkpoint_operation: 0 };
  let totalRequests = 0, totalWorkflows = 0, totalInvocations = 0, totalCheckpoints = 0;

  for (const [tenantId, meter] of _meterRegistry) {
    const counters = _ensureCounters(tenantId);
    const exceeded = counters.request > meter.quotas.max_requests_per_hour ||
      counters.workflow_session > meter.quotas.max_workflow_sessions ||
      counters.runtime_invocation > meter.quotas.max_runtime_invocations ||
      counters.checkpoint_operation > meter.quotas.max_checkpoint_operations;
    if (exceeded) exceededCount++;

    meters.push({
      tenant_id: tenantId,
      namespace: meter.namespace,
      governance_mode: meter.governance_mode,
      usage_requests: counters.request,
      usage_workflows: counters.workflow_session,
      exceeded,
    });

    govDist[meter.governance_mode] = (govDist[meter.governance_mode] || 0) + 1;
    if (meter.metering.track_requests) trackedDist.request++;
    if (meter.metering.track_workflows) trackedDist.workflow_session++;
    if (meter.metering.track_invocations) trackedDist.runtime_invocation++;
    if (meter.metering.track_checkpoints) trackedDist.checkpoint_operation++;

    totalRequests += counters.request;
    totalWorkflows += counters.workflow_session;
    totalInvocations += counters.runtime_invocation;
    totalCheckpoints += counters.checkpoint_operation;
  }

  meters.sort((a, b) => a.tenant_id.localeCompare(b.tenant_id));

  return _deepFreeze({
    version: RUNTIME_USAGE_METER_VERSION,
    meters,
    total_tenants: _meterRegistry.size,
    total_meters: meters.length,
    total_usage_events: _totalUsageEvents,
    total_usage: { requests: totalRequests, workflow_sessions: totalWorkflows, runtime_invocations: totalInvocations, checkpoint_operations: totalCheckpoints },
    exceeded_quota_count: exceededCount,
    governance_distribution: govDist,
    tracked_metric_distribution: trackedDist,
    built_at: new Date().toISOString(),
  });
}

// ─── usage hash ────────────────────────────────────────────────────

/**
 * Deterministic SHA-256 from normalized metering state.
 *
 * @returns {string}
 */
export function computeRuntimeUsageHash() {
  const entries = [];
  for (const [tenantId, meter] of _meterRegistry) {
    const counters = _ensureCounters(tenantId);
    entries.push(`${tenantId}=${meter.meter_id}=${counters.request},${counters.workflow_session},${counters.runtime_invocation},${counters.checkpoint_operation}`);
  }
  entries.sort();

  const hashInput = [
    RUNTIME_USAGE_METER_VERSION,
    entries.join('|'),
    String(_meterRegistry.size),
    String(_totalUsageEvents),
  ].join('::');

  return createHash('sha256').update(hashInput).digest('hex');
}
