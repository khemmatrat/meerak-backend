/**
 * Phase 8.8 — External runtime SDK surface.
 *
 * Exposes the orchestration fabric as a governed SDK/runtime platform
 * surface for external consumers. Provides deterministic client creation,
 * intent submission, workflow session binding, and invocation validation
 * without execution, networking, or persistence.
 *
 * Architecture position:
 *   8.5 Orchestrator → 8.6 Checkpoint → 8.7 Distributed → 8.8 SDK Surface ◄── THIS PHASE
 *
 * SAFETY CONTRACT:
 * - NO networking or HTTP layer
 * - NO persistence or storage engine
 * - NO real execution or side effects
 * - SDK surface and descriptors only
 * - Immutable client/runtime descriptors
 * - Deterministic invocation model
 * - Governance-safe exposure
 * - Replay-safe external interface
 */

import { createHash } from 'crypto';
import { validateIntentContract, computeIntentHash, isIntentReplaySafe } from './intentContractLayer.js';
import { listRegisteredIntents } from './intentRegistry.js';
import { resolveRuntimeCapability, listRuntimeCapabilityMappings } from './runtimeCapabilityMapper.js';
import { validateWorkflowDefinition, computeWorkflowHash } from './workflowCompositionLayer.js';
import { createWorkflowRuntimeSession } from './workflowRuntimeOrchestrator.js';
import { buildDistributedWorkflowMap } from './distributedWorkflowCoordinator.js';

// ─── constants ─────────────────────────────────────────────────────

export const RUNTIME_SDK_VERSION = 'runtime_sdk_v1';

const ALLOWED_GOVERNANCE_MODES = Object.freeze(new Set([
  'strict',
  'simulation',
  'canary',
  'controlled',
]));

// ─── in-memory state ──────────────────────────────────────────────

const _clientRegistry = new Map();  // client_id → frozen client descriptor

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

// ─── client creation ───────────────────────────────────────────────

/**
 * Create an immutable governed runtime client.
 *
 * @param {object} config
 * @param {string} config.client_name — unique client label
 * @param {string} [config.governance_mode] — strict|simulation|canary|controlled
 * @param {string[]} [config.allowed_intents] — intent types this client may submit
 * @param {string[]} [config.allowed_capabilities] — runtime capabilities this client may use
 * @returns {object} — deeply frozen client descriptor
 * @throws {Error} on invalid input or duplicate client name
 */
export function createRuntimeClient(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('runtime_sdk_error: invalid config');
  }
  if (!config.client_name || typeof config.client_name !== 'string') {
    throw new Error('runtime_sdk_error: client_name required');
  }

  const govMode = config.governance_mode || 'strict';
  if (!ALLOWED_GOVERNANCE_MODES.has(govMode)) {
    throw new Error(`runtime_sdk_error: invalid governance_mode '${govMode}'`);
  }

  const clientId = `sdk-${createHash('sha256').update(`${RUNTIME_SDK_VERSION}::${config.client_name}`).digest('hex').slice(0, 16)}`;

  if (_clientRegistry.has(clientId)) {
    throw new Error(`runtime_sdk_error: client '${config.client_name}' already registered`);
  }

  const client = _deepFreeze({
    client_id: clientId,
    client_name: config.client_name,
    governance_mode: govMode,
    allowed_intents: Object.freeze([...(config.allowed_intents || [])]),
    allowed_capabilities: Object.freeze([...(config.allowed_capabilities || [])]),
    version: RUNTIME_SDK_VERSION,
    created_at: new Date().toISOString(),
  });

  _clientRegistry.set(clientId, client);
  return client;
}

// ─── intent submission ─────────────────────────────────────────────

/**
 * Submit a runtime intent through the SDK surface.
 * Validates intent contract, capability mapping, and workflow compatibility.
 * Produces an immutable submission envelope — NO real execution.
 *
 * @param {object} client — runtime client descriptor
 * @param {object} intent — intent envelope (from Phase 8.1)
 * @returns {object} — deeply frozen submission envelope
 * @throws {Error} on invalid client, intent, or governance violation
 */
export function submitRuntimeIntent(client, intent) {
  if (!client || !client.client_id) {
    throw new Error('runtime_sdk_error: valid client required');
  }
  if (!_clientRegistry.has(client.client_id)) {
    throw new Error(`runtime_sdk_error: client '${client.client_id}' not registered`);
  }
  if (!intent || typeof intent !== 'object') {
    throw new Error('runtime_sdk_error: valid intent required');
  }

  // Validate intent contract
  const contractValidation = validateIntentContract(intent);
  if (!contractValidation.valid) {
    throw new Error(`runtime_sdk_error: intent contract invalid — ${contractValidation.checks.join(', ')}`);
  }

  // Check client is allowed to submit this intent type
  if (client.allowed_intents.length > 0 && !client.allowed_intents.includes(intent.intent_type)) {
    throw new Error(`runtime_sdk_error: client not authorized for intent type '${intent.intent_type}'`);
  }

  // Check capability mapping if intent specifies a capability
  let capabilityResolution = null;
  if (intent.runtime_capability) {
    try {
      capabilityResolution = resolveRuntimeCapability(intent, intent.runtime_capability);
    } catch {
      capabilityResolution = { resolved: false, reason: 'capability_resolution_failed' };
    }
  }

  // Replay safety check
  const replaySafe = isIntentReplaySafe(intent);

  const intentHash = computeIntentHash(intent);

  const submissionId = `sub-${createHash('sha256').update(`${RUNTIME_SDK_VERSION}::${client.client_id}::${intentHash}`).digest('hex').slice(0, 16)}`;

  return _deepFreeze({
    submission_id: submissionId,
    client_id: client.client_id,
    intent_type: intent.intent_type,
    intent_hash: intentHash,
    governance_mode: client.governance_mode,
    capability_resolution: capabilityResolution,
    replay_safe: replaySafe,
    contract_valid: true,
    submitted_at: new Date().toISOString(),
    version: RUNTIME_SDK_VERSION,
  });
}

// ─── workflow session creation ─────────────────────────────────────

/**
 * Create an orchestration-ready workflow session bound to a client's governance context.
 *
 * @param {object} client — runtime client descriptor
 * @param {object} workflow — workflow definition (from Phase 8.4)
 * @returns {object} — deeply frozen session descriptor with governance binding
 * @throws {Error} on invalid input or governance incompatibility
 */
export function createWorkflowSession(client, workflow) {
  if (!client || !client.client_id) {
    throw new Error('runtime_sdk_error: valid client required');
  }
  if (!_clientRegistry.has(client.client_id)) {
    throw new Error(`runtime_sdk_error: client '${client.client_id}' not registered`);
  }
  if (!workflow || typeof workflow !== 'object') {
    throw new Error('runtime_sdk_error: valid workflow required');
  }

  // Validate workflow definition
  validateWorkflowDefinition(workflow);

  // Create the underlying runtime session
  const session = createWorkflowRuntimeSession({ workflow });

  const workflowHash = computeWorkflowHash(workflow);

  const bindingHash = createHash('sha256')
    .update(`${RUNTIME_SDK_VERSION}::bind::${client.client_id}::${session.session_id}::${workflowHash}`)
    .digest('hex');

  return _deepFreeze({
    session_id: session.session_id,
    client_id: client.client_id,
    workflow_id: workflow.workflow_id,
    workflow_hash: workflowHash,
    governance_mode: client.governance_mode,
    state: session.state,
    cursor: [...session.cursor],
    total_steps: session.total_steps,
    binding_hash: bindingHash,
    bound_at: new Date().toISOString(),
    version: RUNTIME_SDK_VERSION,
  });
}

// ─── invocation building ───────────────────────────────────────────

/**
 * Build a deterministic invocation payload.
 *
 * @param {object} input
 * @param {string} input.client_id
 * @param {string} input.intent_type
 * @param {string} input.intent_hash
 * @param {string} [input.workflow_hash]
 * @param {string} [input.capability]
 * @param {string} [input.governance_mode]
 * @returns {object} — deeply frozen invocation descriptor
 * @throws {Error} on invalid input
 */
export function buildRuntimeInvocation(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('runtime_sdk_error: invalid invocation input');
  }
  if (!input.client_id || !input.intent_type || !input.intent_hash) {
    throw new Error('runtime_sdk_error: client_id, intent_type, and intent_hash required');
  }

  const govMode = input.governance_mode || 'strict';
  if (!ALLOWED_GOVERNANCE_MODES.has(govMode)) {
    throw new Error(`runtime_sdk_error: invalid governance_mode '${govMode}'`);
  }

  const invocationHash = createHash('sha256')
    .update([
      RUNTIME_SDK_VERSION,
      input.client_id,
      input.intent_type,
      input.intent_hash,
      input.workflow_hash || '',
      input.capability || '',
      govMode,
    ].join('::'))
    .digest('hex');

  return _deepFreeze({
    invocation_id: `inv-${invocationHash.slice(0, 16)}`,
    client_id: input.client_id,
    intent_type: input.intent_type,
    intent_hash: input.intent_hash,
    workflow_hash: input.workflow_hash || null,
    capability: input.capability || null,
    governance_mode: govMode,
    invocation_hash: invocationHash,
    built_at: new Date().toISOString(),
    version: RUNTIME_SDK_VERSION,
  });
}

// ─── invocation validation ─────────────────────────────────────────

/**
 * Validate a runtime invocation against all upstream invariants.
 *
 * @param {object} invocation — from buildRuntimeInvocation
 * @returns {{ valid: boolean, checks: string[], violations: string[] }}
 */
export function validateRuntimeInvocation(invocation) {
  if (!invocation || typeof invocation !== 'object') {
    return { valid: false, checks: [], violations: ['invalid_invocation_object'] };
  }

  const checks = [];
  const violations = [];

  // 1. Structural completeness
  if (!invocation.client_id) violations.push('missing_client_id');
  if (!invocation.intent_type) violations.push('missing_intent_type');
  if (!invocation.intent_hash) violations.push('missing_intent_hash');
  if (!invocation.invocation_hash) violations.push('missing_invocation_hash');
  checks.push('structural_completeness');

  // 2. Client exists
  if (invocation.client_id && !_clientRegistry.has(invocation.client_id)) {
    violations.push('client_not_registered');
  }
  checks.push('client_registration');

  // 3. Governance mode validity
  if (invocation.governance_mode && !ALLOWED_GOVERNANCE_MODES.has(invocation.governance_mode)) {
    violations.push('invalid_governance_mode');
  }
  checks.push('governance_mode_valid');

  // 4. Hash reproducibility
  if (invocation.invocation_hash) {
    const recomputed = createHash('sha256')
      .update([
        RUNTIME_SDK_VERSION,
        invocation.client_id || '',
        invocation.intent_type || '',
        invocation.intent_hash || '',
        invocation.workflow_hash || '',
        invocation.capability || '',
        invocation.governance_mode || 'strict',
      ].join('::'))
      .digest('hex');
    if (recomputed !== invocation.invocation_hash) {
      violations.push('invocation_hash_not_reproducible');
    }
  }
  checks.push('hash_reproducibility');

  // 5. Client authorization for intent type
  if (invocation.client_id && _clientRegistry.has(invocation.client_id)) {
    const client = _clientRegistry.get(invocation.client_id);
    if (client.allowed_intents.length > 0 && !client.allowed_intents.includes(invocation.intent_type)) {
      violations.push('client_not_authorized_for_intent');
    }
  }
  checks.push('client_intent_authorization');

  // 6. Version consistency
  if (invocation.version && invocation.version !== RUNTIME_SDK_VERSION) {
    violations.push('version_mismatch');
  }
  checks.push('version_consistency');

  return { valid: violations.length === 0, checks, violations };
}

// ─── platform snapshot ─────────────────────────────────────────────

/**
 * Build a deterministic snapshot of the entire SDK platform surface.
 *
 * @returns {object} — deeply frozen platform snapshot
 */
export function buildSdkRuntimeSnapshot() {
  const clients = [];
  for (const [, client] of _clientRegistry) {
    clients.push({ client_id: client.client_id, client_name: client.client_name, governance_mode: client.governance_mode });
  }
  clients.sort((a, b) => a.client_id.localeCompare(b.client_id));

  let registeredIntents = [];
  try { registeredIntents = listRegisteredIntents(); } catch { /* empty if unavailable */ }

  let capabilityMappings = [];
  try { capabilityMappings = listRuntimeCapabilityMappings(); } catch { /* empty if unavailable */ }

  let distributedMap = null;
  try { distributedMap = buildDistributedWorkflowMap(); } catch { /* null if unavailable */ }

  const snapshotHash = createHash('sha256')
    .update([
      RUNTIME_SDK_VERSION,
      clients.map(c => c.client_id).join(','),
      String(registeredIntents.length),
      String(capabilityMappings.length),
      distributedMap ? distributedMap.map_hash : 'none',
    ].join('::'))
    .digest('hex');

  return _deepFreeze({
    version: RUNTIME_SDK_VERSION,
    total_clients: clients.length,
    clients,
    registered_intents_count: registeredIntents.length,
    capability_mappings_count: capabilityMappings.length,
    distributed_sessions: distributedMap ? distributedMap.total_sessions : 0,
    distributed_nodes: distributedMap ? distributedMap.total_nodes : 0,
    snapshot_hash: snapshotHash,
    built_at: new Date().toISOString(),
  });
}

// ─── SDK surface hash ──────────────────────────────────────────────

/**
 * Deterministic SHA-256 from the normalized SDK surface state.
 *
 * @returns {string}
 */
export function computeSdkSurfaceHash() {
  const clientIds = [..._clientRegistry.keys()].sort().join(',');

  let intentCount = 0;
  try { intentCount = listRegisteredIntents().length; } catch { /* 0 */ }

  let capCount = 0;
  try { capCount = listRuntimeCapabilityMappings().length; } catch { /* 0 */ }

  let distHash = 'none';
  try { distHash = buildDistributedWorkflowMap().map_hash; } catch { /* none */ }

  const hashInput = [
    RUNTIME_SDK_VERSION,
    clientIds,
    String(_clientRegistry.size),
    String(intentCount),
    String(capCount),
    distHash,
  ].join('::');

  return createHash('sha256').update(hashInput).digest('hex');
}
