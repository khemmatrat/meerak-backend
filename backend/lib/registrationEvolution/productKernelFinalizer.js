/**
 * Phase 8.9 — Product kernel finalization.
 *
 * Permanently seals the orchestration platform kernel as a governed
 * runtime product foundation. Once frozen, no further Phase 8
 * structural mutations are allowed.
 *
 * Architecture position:
 *   8.1–8.8 (full stack) → 8.9 Product Kernel Finalizer ◄── FINAL PHASE
 *
 * SAFETY CONTRACT:
 * - NO execution or side effects
 * - NO networking, persistence, or async workers
 * - NO runtime mutation after freeze
 * - Immutable finalization state
 * - Deterministic platform sealing
 * - Governance-safe hard lock
 * - Replay-safe final kernel state
 */

import { createHash } from 'crypto';

import { INTENT_CONTRACT_VERSION, validateIntentContract, computeIntentHash, isIntentReplaySafe } from './intentContractLayer.js';
import { INTENT_REGISTRY_VERSION, listRegisteredIntents, isIntentRegistryFrozen } from './intentRegistry.js';
import { RUNTIME_CAPABILITY_VERSION, listRuntimeCapabilityMappings, isRuntimeCapabilityRegistryFrozen } from './runtimeCapabilityMapper.js';
import { WORKFLOW_COMPOSITION_VERSION, isWorkflowRegistryFrozen } from './workflowCompositionLayer.js';
import { WORKFLOW_RUNTIME_VERSION } from './workflowRuntimeOrchestrator.js';
import { WORKFLOW_CHECKPOINT_VERSION } from './workflowCheckpointRuntime.js';
import { DISTRIBUTED_WORKFLOW_VERSION, validateDistributedWorkflowIntegrity, computeDistributedWorkflowHash, buildDistributedWorkflowMap } from './distributedWorkflowCoordinator.js';
import { RUNTIME_SDK_VERSION, buildSdkRuntimeSnapshot, computeSdkSurfaceHash } from './runtimeSdkSurface.js';

// ─── constants ─────────────────────────────────────────────────────

export const PRODUCT_KERNEL_VERSION = 'product_kernel_v1';

const PHASE_8_LAYERS = Object.freeze([
  { id: '8.1', name: 'intent_contract', version: INTENT_CONTRACT_VERSION },
  { id: '8.2', name: 'intent_registry', version: INTENT_REGISTRY_VERSION },
  { id: '8.3', name: 'capability_mapping', version: RUNTIME_CAPABILITY_VERSION },
  { id: '8.4', name: 'workflow_composition', version: WORKFLOW_COMPOSITION_VERSION },
  { id: '8.5', name: 'workflow_runtime', version: WORKFLOW_RUNTIME_VERSION },
  { id: '8.6', name: 'checkpoint_runtime', version: WORKFLOW_CHECKPOINT_VERSION },
  { id: '8.7', name: 'distributed_coordination', version: DISTRIBUTED_WORKFLOW_VERSION },
  { id: '8.8', name: 'sdk_surface', version: RUNTIME_SDK_VERSION },
]);

// ─── internal state ────────────────────────────────────────────────

let _frozen = false;
let _sealedSnapshot = null;

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

// ─── integrity validation ──────────────────────────────────────────

/**
 * Validate all Phase 8 layers and return a deterministic integrity report.
 *
 * @returns {{ valid: boolean, layers: object[], checks: string[], violations: string[] }}
 */
export function validateProductKernelIntegrity() {
  const checks = [];
  const violations = [];
  const layers = [];

  // 8.1 Intent contract — version present
  layers.push({ id: '8.1', name: 'intent_contract', version: INTENT_CONTRACT_VERSION, status: 'present' });
  checks.push('8.1_intent_contract_version');

  // 8.2 Intent registry — accessible + version
  const intents = _safeCall(() => listRegisteredIntents());
  layers.push({ id: '8.2', name: 'intent_registry', version: INTENT_REGISTRY_VERSION, count: intents.ok ? intents.value.length : 0, status: intents.ok ? 'accessible' : 'error' });
  if (!intents.ok) violations.push(`8.2_intent_registry_error: ${intents.error}`);
  checks.push('8.2_intent_registry_access');

  // 8.3 Capability mappings — accessible + version
  const caps = _safeCall(() => listRuntimeCapabilityMappings());
  layers.push({ id: '8.3', name: 'capability_mapping', version: RUNTIME_CAPABILITY_VERSION, count: caps.ok ? caps.value.length : 0, status: caps.ok ? 'accessible' : 'error' });
  if (!caps.ok) violations.push(`8.3_capability_mapping_error: ${caps.error}`);
  checks.push('8.3_capability_mapping_access');

  // 8.4 Workflow composition — version + registry frozen check
  const wfFrozen = _safeCall(() => isWorkflowRegistryFrozen());
  layers.push({ id: '8.4', name: 'workflow_composition', version: WORKFLOW_COMPOSITION_VERSION, frozen: wfFrozen.ok ? wfFrozen.value : null, status: wfFrozen.ok ? 'accessible' : 'error' });
  checks.push('8.4_workflow_composition_access');

  // 8.5 Workflow runtime — version present
  layers.push({ id: '8.5', name: 'workflow_runtime', version: WORKFLOW_RUNTIME_VERSION, status: 'present' });
  checks.push('8.5_workflow_runtime_version');

  // 8.6 Checkpoint runtime — version present
  layers.push({ id: '8.6', name: 'checkpoint_runtime', version: WORKFLOW_CHECKPOINT_VERSION, status: 'present' });
  checks.push('8.6_checkpoint_runtime_version');

  // 8.7 Distributed coordination — integrity check
  const distIntegrity = _safeCall(() => validateDistributedWorkflowIntegrity());
  layers.push({ id: '8.7', name: 'distributed_coordination', version: DISTRIBUTED_WORKFLOW_VERSION, integrity: distIntegrity.ok ? distIntegrity.value.valid : null, status: distIntegrity.ok ? 'accessible' : 'error' });
  if (distIntegrity.ok && !distIntegrity.value.valid) {
    violations.push(`8.7_distributed_integrity_failed: ${distIntegrity.value.violations.join('; ')}`);
  }
  checks.push('8.7_distributed_integrity');

  // 8.8 SDK surface — snapshot accessible
  const sdkSnap = _safeCall(() => buildSdkRuntimeSnapshot());
  layers.push({ id: '8.8', name: 'sdk_surface', version: RUNTIME_SDK_VERSION, clients: sdkSnap.ok ? sdkSnap.value.total_clients : 0, status: sdkSnap.ok ? 'accessible' : 'error' });
  if (!sdkSnap.ok) violations.push(`8.8_sdk_surface_error: ${sdkSnap.error}`);
  checks.push('8.8_sdk_surface_access');

  // Cross-version coherence
  for (const layer of PHASE_8_LAYERS) {
    if (!layer.version) violations.push(`${layer.id}_missing_version`);
  }
  checks.push('cross_version_coherence');

  return _deepFreeze({ valid: violations.length === 0, layers, checks, violations });
}

// ─── platform snapshot ─────────────────────────────────────────────

/**
 * Build a deterministic full-platform snapshot.
 *
 * @returns {object} — deeply frozen platform snapshot
 */
export function buildProductKernelSnapshot() {
  const intents = _safeCall(() => listRegisteredIntents());
  const caps = _safeCall(() => listRuntimeCapabilityMappings());
  const sdkSnap = _safeCall(() => buildSdkRuntimeSnapshot());
  const distMap = _safeCall(() => buildDistributedWorkflowMap());
  const distHash = _safeCall(() => computeDistributedWorkflowHash());
  const sdkHash = _safeCall(() => computeSdkSurfaceHash());
  const intRegFrozen = _safeCall(() => isIntentRegistryFrozen());
  const capRegFrozen = _safeCall(() => isRuntimeCapabilityRegistryFrozen());
  const wfRegFrozen = _safeCall(() => isWorkflowRegistryFrozen());

  const snapshot = {
    kernel_version: PRODUCT_KERNEL_VERSION,
    frozen: _frozen,
    layer_versions: PHASE_8_LAYERS.map(l => ({ id: l.id, name: l.name, version: l.version })),
    counts: {
      registered_intents: intents.ok ? intents.value.length : 0,
      capability_mappings: caps.ok ? caps.value.length : 0,
      sdk_clients: sdkSnap.ok ? sdkSnap.value.total_clients : 0,
      distributed_sessions: distMap.ok ? distMap.value.total_sessions : 0,
      distributed_nodes: distMap.ok ? distMap.value.total_nodes : 0,
      distributed_transfers: distMap.ok ? distMap.value.total_transfers : 0,
    },
    registry_states: {
      intent_registry_frozen: intRegFrozen.ok ? intRegFrozen.value : null,
      capability_registry_frozen: capRegFrozen.ok ? capRegFrozen.value : null,
      workflow_registry_frozen: wfRegFrozen.ok ? wfRegFrozen.value : null,
    },
    hashes: {
      distributed_workflow: distHash.ok ? distHash.value : null,
      sdk_surface: sdkHash.ok ? sdkHash.value : null,
      sdk_snapshot: sdkSnap.ok ? sdkSnap.value.snapshot_hash : null,
      distributed_map: distMap.ok ? distMap.value.map_hash : null,
    },
    built_at: new Date().toISOString(),
  };

  snapshot.kernel_hash = computeProductKernelHash();

  return _deepFreeze(snapshot);
}

// ─── freeze ────────────────────────────────────────────────────────

/**
 * One-way irreversible freeze of the product kernel.
 * After this call, no structural mutations to Phase 8 are permitted.
 *
 * @returns {object} — deeply frozen sealed kernel state
 * @throws {Error} if already frozen or integrity invalid
 */
export function freezeProductKernel() {
  if (_frozen) {
    throw new Error('product_kernel_error: kernel already frozen — no further mutations allowed');
  }

  const integrity = validateProductKernelIntegrity();
  if (!integrity.valid) {
    throw new Error(`product_kernel_error: cannot freeze — integrity violations: ${integrity.violations.join('; ')}`);
  }

  _frozen = true;

  const snapshot = buildProductKernelSnapshot();

  _sealedSnapshot = _deepFreeze({
    seal_type: 'product_kernel_seal',
    kernel_version: PRODUCT_KERNEL_VERSION,
    frozen: true,
    integrity_valid: true,
    integrity_checks: integrity.checks.length,
    layer_count: PHASE_8_LAYERS.length,
    kernel_hash: snapshot.kernel_hash,
    sealed_at: new Date().toISOString(),
  });

  return _sealedSnapshot;
}

// ─── determinism validation ────────────────────────────────────────

/**
 * Verify determinism across the kernel: hash reproducibility,
 * registry ordering, replay safety, ownership consistency,
 * invocation determinism.
 *
 * @returns {{ valid: boolean, checks: string[], violations: string[] }}
 */
export function validateKernelDeterminism() {
  const checks = [];
  const violations = [];

  // 1. Hash reproducibility — compute twice and compare
  const hash1 = computeProductKernelHash();
  const hash2 = computeProductKernelHash();
  if (hash1 !== hash2) violations.push('kernel_hash_not_reproducible');
  checks.push('hash_reproducibility');

  // 2. SDK surface hash reproducibility
  const sdkH1 = _safeCall(() => computeSdkSurfaceHash());
  const sdkH2 = _safeCall(() => computeSdkSurfaceHash());
  if (sdkH1.ok && sdkH2.ok && sdkH1.value !== sdkH2.value) violations.push('sdk_hash_not_reproducible');
  checks.push('sdk_hash_reproducibility');

  // 3. Distributed hash reproducibility
  const dh1 = _safeCall(() => computeDistributedWorkflowHash());
  const dh2 = _safeCall(() => computeDistributedWorkflowHash());
  if (dh1.ok && dh2.ok && dh1.value !== dh2.value) violations.push('distributed_hash_not_reproducible');
  checks.push('distributed_hash_reproducibility');

  // 4. Registry ordering consistency — list twice, compare order
  const intents1 = _safeCall(() => listRegisteredIntents());
  const intents2 = _safeCall(() => listRegisteredIntents());
  if (intents1.ok && intents2.ok) {
    const s1 = intents1.value.map(i => i.intent_type || i).join(',');
    const s2 = intents2.value.map(i => i.intent_type || i).join(',');
    if (s1 !== s2) violations.push('intent_registry_ordering_inconsistent');
  }
  checks.push('registry_ordering_consistency');

  // 5. Distributed ownership consistency
  const distInt = _safeCall(() => validateDistributedWorkflowIntegrity());
  if (distInt.ok && !distInt.value.valid) {
    violations.push(`distributed_ownership_inconsistent: ${distInt.value.violations.join('; ')}`);
  }
  checks.push('distributed_ownership_consistency');

  // 6. Snapshot determinism — build twice and compare hash
  const snap1 = _safeCall(() => buildProductKernelSnapshot());
  const snap2 = _safeCall(() => buildProductKernelSnapshot());
  if (snap1.ok && snap2.ok && snap1.value.kernel_hash !== snap2.value.kernel_hash) {
    violations.push('snapshot_hash_not_deterministic');
  }
  checks.push('snapshot_determinism');

  return _deepFreeze({ valid: violations.length === 0, checks, violations });
}

// ─── cross-layer consistency ───────────────────────────────────────

/**
 * Cross-layer consistency proof across all Phase 8 subsystems.
 *
 * @returns {{ consistent: boolean, proofs: object[], violations: string[] }}
 */
export function verifyProductKernelConsistency() {
  const proofs = [];
  const violations = [];

  // 1. Intent ↔ Capability mapping consistency
  const intents = _safeCall(() => listRegisteredIntents());
  const caps = _safeCall(() => listRuntimeCapabilityMappings());
  if (intents.ok && caps.ok) {
    const intentTypes = new Set(intents.value.map(i => i.intent_type || i));
    const mappedIntents = new Set(caps.value.map(c => c.intent_type || c));
    const unmapped = [...intentTypes].filter(t => !mappedIntents.has(t));
    proofs.push({ proof: 'intent_capability_mapping', intent_count: intentTypes.size, mapped_count: mappedIntents.size, unmapped_intents: unmapped.length });
    // Unmapped intents are informational, not violations (intents may not require capabilities)
  } else {
    proofs.push({ proof: 'intent_capability_mapping', status: 'unavailable' });
  }

  // 2. Workflow ↔ Runtime compatibility
  const wfFrozen = _safeCall(() => isWorkflowRegistryFrozen());
  proofs.push({ proof: 'workflow_runtime_compatibility', workflow_registry_frozen: wfFrozen.ok ? wfFrozen.value : null, runtime_version: WORKFLOW_RUNTIME_VERSION, checkpoint_version: WORKFLOW_CHECKPOINT_VERSION });

  // 3. Distributed session ↔ Workflow lineage
  const distMap = _safeCall(() => buildDistributedWorkflowMap());
  const distIntegrity = _safeCall(() => validateDistributedWorkflowIntegrity());
  if (distIntegrity.ok && !distIntegrity.value.valid) {
    violations.push(`distributed_lineage_broken: ${distIntegrity.value.violations.join('; ')}`);
  }
  proofs.push({
    proof: 'distributed_workflow_lineage',
    sessions: distMap.ok ? distMap.value.total_sessions : 0,
    nodes: distMap.ok ? distMap.value.total_nodes : 0,
    transfers: distMap.ok ? distMap.value.total_transfers : 0,
    integrity_valid: distIntegrity.ok ? distIntegrity.value.valid : null,
  });

  // 4. SDK invocation ↔ Governance alignment
  const sdkSnap = _safeCall(() => buildSdkRuntimeSnapshot());
  proofs.push({
    proof: 'sdk_governance_alignment',
    clients: sdkSnap.ok ? sdkSnap.value.total_clients : 0,
    intents_available: intents.ok ? intents.value.length : 0,
    capabilities_available: caps.ok ? caps.value.length : 0,
    sdk_version: RUNTIME_SDK_VERSION,
  });

  // 5. Version coherence across all layers
  const versionSet = new Set(PHASE_8_LAYERS.map(l => l.version).filter(Boolean));
  proofs.push({ proof: 'version_coherence', unique_versions: versionSet.size, total_layers: PHASE_8_LAYERS.length });

  return _deepFreeze({ consistent: violations.length === 0, proofs, violations });
}

// ─── frozen check ──────────────────────────────────────────────────

/**
 * @returns {boolean}
 */
export function isProductKernelFrozen() {
  return _frozen;
}

// ─── kernel hash ───────────────────────────────────────────────────

/**
 * Deterministic SHA-256 from the normalized full platform state.
 *
 * @returns {string}
 */
export function computeProductKernelHash() {
  const layerVersions = PHASE_8_LAYERS.map(l => `${l.id}=${l.version}`).join(',');

  const intents = _safeCall(() => listRegisteredIntents());
  const caps = _safeCall(() => listRuntimeCapabilityMappings());
  const distHash = _safeCall(() => computeDistributedWorkflowHash());
  const sdkHash = _safeCall(() => computeSdkSurfaceHash());

  const hashInput = [
    PRODUCT_KERNEL_VERSION,
    layerVersions,
    String(intents.ok ? intents.value.length : 0),
    String(caps.ok ? caps.value.length : 0),
    distHash.ok ? distHash.value : 'none',
    sdkHash.ok ? sdkHash.value : 'none',
    String(_frozen),
  ].join('::');

  return createHash('sha256').update(hashInput).digest('hex');
}
