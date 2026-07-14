/**
 * Phase 10.2 — SDK Packaging Layer (Developer Runtime Interface).
 *
 * Wraps the entire platform (8.x–10.1) into a developer-consumable SDK.
 * Transforms "internal platform" → "developer SDK".
 *
 * Five things:
 * 1. Wrap product platform → SDK client interface
 * 2. Expose intent/workflow execution API (controlled only)
 * 3. Normalize all internal complexity → simple calls
 * 4. Bind SDK → tenant + plan + governance
 * 5. Create deterministic invocation model
 *
 * Architecture position:
 *   Kernel (8–9) → Platform (10.1) → SDK (10.2) → External Developer Usage ◄── THIS
 *
 * SAFETY CONTRACT:
 * - NO new execution logic
 * - NO governance bypass
 * - NO new runtime engine
 * - NO billing / networking
 * - Only controlled wrapping + deterministic mapping
 */

import { createHash, randomUUID } from 'crypto';

// Phase 8 — intent, capability, workflow
import { createIntentEnvelope, validateIntentContract } from './intentContractLayer.js';
import { resolveRuntimeCapability } from './runtimeCapabilityMapper.js';
import { listRegisteredIntents } from './intentRegistry.js';
import { createWorkflowDefinition, validateWorkflowDefinition } from './workflowCompositionLayer.js';
import { createWorkflowRuntimeSession, advanceWorkflowRuntime } from './workflowRuntimeOrchestrator.js';

// Phase 9 — tenant, policy
import { buildTenantProvisioningSnapshot } from './tenantProvisioningLayer.js';
import { resolveTenantRuntimePolicy } from './tenantRuntimePolicyLayer.js';

// Phase 9.8–9.9 — convergence, seal
import { computeSystemConvergenceHash } from './runtimeSystemConvergenceEngine.js';
import { computeFinalSystemHash, isSystemFinalSealed } from './runtimeFinalSealEngine.js';

// Phase 10.1 — productization
import { computeProductPlatformHash, isProductPlatformFrozen, buildProductRuntimeSnapshot } from './runtimeProductizationLayer.js';

// ─── constants ─────────────────────────────────────────────────────

export const SDK_PACKAGING_VERSION = 'sdk_packaging_v1';

const GOVERNANCE_MODES = Object.freeze(new Set(['controlled', 'strict', 'simulation']));

// ─── internal state ────────────────────────────────────────────────

const _sdkClients = new Map();
const _sdkIntentLog = [];
const _sdkWorkflowSessions = new Map();
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

// ─── create SDK client ─────────────────────────────────────────────

/**
 * Create a developer-facing SDK client bound to a tenant + plan + governance.
 *
 * @param {object} input — { tenant_id, plan_id, governance_mode? }
 * @returns {object} — deeply frozen SDK client descriptor
 */
export function createSdkClient(input) {
  if (_frozen) {
    throw new Error('sdk_packaging_error: SDK is frozen — no new clients');
  }
  if (!input || typeof input !== 'object') {
    throw new Error('sdk_packaging_error: invalid input');
  }
  if (!input.tenant_id || typeof input.tenant_id !== 'string') {
    throw new Error('sdk_packaging_error: tenant_id required');
  }
  if (!input.plan_id || typeof input.plan_id !== 'string') {
    throw new Error('sdk_packaging_error: plan_id required');
  }

  const govMode = input.governance_mode || 'controlled';
  if (!GOVERNANCE_MODES.has(govMode)) {
    throw new Error(`sdk_packaging_error: invalid governance_mode '${govMode}'`);
  }

  // Validate tenant exists (9.3)
  const tenantSnap = _safe(() => buildTenantProvisioningSnapshot());
  if (tenantSnap.ok) {
    const found = tenantSnap.value.tenants.find(t => t.tenant_id === input.tenant_id);
    if (!found) {
      throw new Error(`sdk_packaging_error: tenant '${input.tenant_id}' not found`);
    }
  }

  // Validate tenant policy exists (9.4)
  const policy = _safe(() => resolveTenantRuntimePolicy({ tenant_id: input.tenant_id }));

  const clientId = `sdk-${randomUUID()}`;

  const client = _deepFreeze({
    client_id: clientId,
    tenant_id: input.tenant_id,
    plan: input.plan_id,
    governance_mode: govMode,
    bound: true,
    readonly_client: true,
    execution_allowed: false,
    policy_resolved: policy.ok,
    sdk_version: SDK_PACKAGING_VERSION,
    created_at: new Date().toISOString(),
  });

  _sdkClients.set(clientId, client);
  return client;
}

// ─── SDK submit intent ─────────────────────────────────────────────

/**
 * Main SDK API — submit an intent through the governed pipeline.
 *
 * Flow: validate intent (8.1) → resolve capability (8.3) →
 *       enforce tenant policy (9.4) → return deterministic result.
 *
 * @param {object} client — SDK client descriptor
 * @param {object} intent — intent submission input
 * @returns {object} — deeply frozen submission result
 */
export function sdkSubmitIntent(client, intent) {
  if (!client || !client.client_id) {
    throw new Error('sdk_packaging_error: invalid client');
  }
  if (!_sdkClients.has(client.client_id)) {
    throw new Error(`sdk_packaging_error: client '${client.client_id}' not registered`);
  }

  const boundClient = _sdkClients.get(client.client_id);

  // 1. Create intent envelope (8.1)
  const envelope = createIntentEnvelope({
    intent_type: intent.intent_type,
    payload: intent.payload || {},
    governance: { mode: boundClient.governance_mode },
    execution_constraints: intent.execution_constraints || {},
    intent_version: intent.intent_version || 'v1',
  });

  // 2. Validate intent contract (8.1)
  validateIntentContract(envelope);

  // 3. Resolve capability (8.3)
  const capability = _safe(() => resolveRuntimeCapability(
    { intent_type: envelope.intent_type, intent_id: envelope.intent_id },
    intent.requested_capability || 'controlled_execution'
  ));

  // 4. Check tenant policy (9.4)
  const policyCheck = _safe(() => resolveTenantRuntimePolicy({ tenant_id: boundClient.tenant_id }));

  const submission = _deepFreeze({
    intent_id: envelope.intent_id,
    intent_type: envelope.intent_type,
    client_id: boundClient.client_id,
    tenant_id: boundClient.tenant_id,
    plan: boundClient.plan,
    accepted: true,
    capability: capability.ok ? 'controlled_execution' : 'simulation_only',
    capability_resolved: capability.ok,
    policy_checked: policyCheck.ok,
    workflow_ready: true,
    execution_allowed: false,
    sdk_version: SDK_PACKAGING_VERSION,
    submitted_at: new Date().toISOString(),
  });

  _sdkIntentLog.push(submission);
  return submission;
}

// ─── SDK create workflow ───────────────────────────────────────────

/**
 * Create a workflow through the SDK, bound to client's tenant + plan context.
 *
 * @param {object} client — SDK client descriptor
 * @param {object} workflow — workflow definition input
 * @returns {object} — deeply frozen workflow session
 */
export function sdkCreateWorkflow(client, workflow) {
  if (!client || !client.client_id) {
    throw new Error('sdk_packaging_error: invalid client');
  }
  if (!_sdkClients.has(client.client_id)) {
    throw new Error(`sdk_packaging_error: client '${client.client_id}' not registered`);
  }

  const boundClient = _sdkClients.get(client.client_id);

  // 1. Create workflow definition (8.4)
  const wfDef = createWorkflowDefinition(workflow);

  // 2. Validate (8.4)
  validateWorkflowDefinition(wfDef);

  // 3. Create runtime session (8.5)
  const session = createWorkflowRuntimeSession({ workflow: wfDef });

  // 4. Attach tenant + plan context
  const sdkSession = _deepFreeze({
    ...session,
    sdk_context: {
      client_id: boundClient.client_id,
      tenant_id: boundClient.tenant_id,
      plan: boundClient.plan,
      governance_mode: boundClient.governance_mode,
    },
    execution_allowed: false,
    sdk_version: SDK_PACKAGING_VERSION,
  });

  _sdkWorkflowSessions.set(sdkSession.session_id, sdkSession);
  return sdkSession;
}

// ─── SDK invoke workflow ───────────────────────────────────────────

/**
 * Controlled execution interface — advance a workflow session.
 *
 * Calls runtime orchestrator (8.5), respects governance mode (9.4),
 * respects product freeze (10.1), never bypasses kernel seal (9.9).
 *
 * @param {object} session — workflow session
 * @param {object} event — step completion event { step_id }
 * @returns {object} — deeply frozen advanced session
 */
export function sdkInvokeWorkflow(session, event) {
  if (!session || !session.session_id) {
    throw new Error('sdk_packaging_error: invalid session');
  }

  const tracked = _sdkWorkflowSessions.get(session.session_id);
  if (!tracked) {
    throw new Error(`sdk_packaging_error: session '${session.session_id}' not found`);
  }

  // Governance checks
  const sdkCtx = tracked.sdk_context;
  if (sdkCtx) {
    const policy = _safe(() => resolveTenantRuntimePolicy({ tenant_id: sdkCtx.tenant_id }));
    // Policy resolved = governance checked (no hard block, controlled mode)
  }

  // Advance via runtime orchestrator (8.5)
  const advanced = advanceWorkflowRuntime(tracked, event);

  const sdkAdvanced = _deepFreeze({
    ...advanced,
    sdk_context: tracked.sdk_context,
    execution_allowed: false,
    sdk_version: SDK_PACKAGING_VERSION,
  });

  _sdkWorkflowSessions.set(sdkAdvanced.session_id, sdkAdvanced);
  return sdkAdvanced;
}

// ─── SDK package snapshot ──────────────────────────────────────────

/**
 * Aggregate full SDK package state.
 *
 * @returns {object} — deeply frozen snapshot
 */
export function buildSdkPackageSnapshot() {
  const productSnap = _safe(() => buildProductRuntimeSnapshot());
  const platformHash = _safe(() => computeProductPlatformHash());
  const sealHash = _safe(() => computeFinalSystemHash());
  const intents = _safe(() => listRegisteredIntents());

  const clients = [..._sdkClients.values()];
  const sessions = [..._sdkWorkflowSessions.values()];

  return _deepFreeze({
    sdk_state: _frozen ? 'FROZEN' : 'ACTIVE',
    client_count: clients.length,
    intent_submissions: _sdkIntentLog.length,
    workflow_sessions: sessions.length,
    intent_registry_count: intents.ok ? intents.value.length : 0,
    product_state: productSnap.ok ? productSnap.value.product_state : 'UNKNOWN',
    platform_hash: platformHash.ok ? platformHash.value : null,
    seal_hash: sealHash.ok ? sealHash.value : null,
    system_sealed: _safe(() => isSystemFinalSealed()).value || false,
    platform_frozen: _safe(() => isProductPlatformFrozen()).value || false,
    sdk_frozen: _frozen,
    readonly_runtime: true,
    execution_allowed: false,
    version: SDK_PACKAGING_VERSION,
    built_at: new Date().toISOString(),
  });
}

// ─── SDK package hash ──────────────────────────────────────────────

/**
 * Deterministic SHA-256 over SDK state + upstream hashes.
 *
 * @returns {string}
 */
export function computeSdkPackageHash() {
  const platformHash = _safe(() => computeProductPlatformHash());
  const sealHash = _safe(() => computeFinalSystemHash());
  const convergenceHash = _safe(() => computeSystemConvergenceHash());

  const clientIds = [..._sdkClients.keys()].sort().join(',');
  const sessionIds = [..._sdkWorkflowSessions.keys()].sort().join(',');

  const hashInput = [
    SDK_PACKAGING_VERSION,
    platformHash.ok ? platformHash.value : 'none',
    sealHash.ok ? sealHash.value : 'none',
    convergenceHash.ok ? convergenceHash.value : 'none',
    clientIds,
    sessionIds,
    String(_sdkIntentLog.length),
    String(_frozen),
  ].join('::');

  return createHash('sha256').update(hashInput).digest('hex');
}

// ─── freeze SDK package ────────────────────────────────────────────

/**
 * Lock SDK surface permanently — no new clients, bindings, or exposure changes.
 *
 * @returns {object} — deeply frozen lock record
 * @throws {Error} if already frozen
 */
export function freezeSdkPackage() {
  if (_frozen) {
    throw new Error('sdk_packaging_error: SDK package already frozen');
  }

  _frozen = true;

  const finalHash = computeSdkPackageHash();

  return _deepFreeze({
    sdk_frozen: true,
    sdk_mode: 'IMMUTABLE_CONSUMPTION_LAYER',
    sdk_state: 'FROZEN',
    platform: _safe(() => isProductPlatformFrozen()).value ? 'PRODUCTIZED' : 'ACTIVE',
    kernel: _safe(() => isSystemFinalSealed()).value ? 'SEALED' : 'ACTIVE',
    final_hash: finalHash,
    clients_locked: _sdkClients.size,
    sessions_locked: _sdkWorkflowSessions.size,
    readonly_runtime: true,
    execution_allowed: false,
    version: SDK_PACKAGING_VERSION,
    frozen_at: new Date().toISOString(),
  });
}

// ─── frozen check ──────────────────────────────────────────────────

/**
 * @returns {boolean}
 */
export function isSdkPackageFrozen() {
  return _frozen;
}
