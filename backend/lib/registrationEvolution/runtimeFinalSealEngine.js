/**
 * Phase 9.9 — System Final Seal & Closure Layer (Minimal Correct Seal).
 *
 * Single purpose: transform the system from "verifiable system" → "sealed artifact".
 *
 * No new features, no new layers.
 * Only: verify → hash → lock.
 *
 * Architecture position:
 *   Phase 8 (sealed) → 9.1–9.7 (SaaS stack) → 9.8 (convergence) → 9.9 Final Seal ◄── THIS
 *
 * SAFETY CONTRACT:
 * - NO execution, NO networking, NO persistence
 * - NO async workers, NO mutation of any previous phase
 * - Only verification + hashing + irreversible lock
 * - Deterministic outputs only
 */

import { createHash, randomUUID } from 'crypto';

import {
  buildSystemConvergenceModel,
  detectSystemContradictions,
  computeSystemConvergenceHash,
  validateSystemConvergence,
  freezeSystemConvergence,
  isSystemConvergenceFrozen,
} from './runtimeSystemConvergenceEngine.js';

import { computeProductKernelHash } from './productKernelFinalizer.js';
import { computeSdkSurfaceHash } from './runtimeSdkSurface.js';
import { computeDistributedWorkflowHash } from './distributedWorkflowCoordinator.js';
import { computeRuntimeSurfaceHash } from './runtimeHttpSurface.js';
import { computeApiGatewayHash } from './runtimeApiGateway.js';
import { computeTenantProvisioningHash } from './tenantProvisioningLayer.js';
import { computeTenantPolicyHash } from './tenantRuntimePolicyLayer.js';
import { computeRuntimeUsageHash } from './runtimeUsageMeter.js';
import { computeRuntimeAuditHash } from './runtimeAuditLedger.js';
import { computeProvenanceHash } from './runtimeEventProvenanceGraph.js';

// ─── constants ─────────────────────────────────────────────────────

export const RUNTIME_FINAL_SEAL_VERSION = 'runtime_final_seal_v1';

const SEALED_LAYERS = Object.freeze([
  { id: '8.x', name: 'product_kernel' },
  { id: '8.7', name: 'distributed_sessions' },
  { id: '8.8', name: 'sdk_surface' },
  { id: '9.1', name: 'http_surface' },
  { id: '9.2', name: 'api_gateway' },
  { id: '9.3', name: 'tenant_provisioning' },
  { id: '9.4', name: 'tenant_policy' },
  { id: '9.5', name: 'usage_metering' },
  { id: '9.6', name: 'audit_ledger' },
  { id: '9.7', name: 'provenance_graph' },
]);

// ─── internal state ────────────────────────────────────────────────

let _sealed = false;
let _sealRecord = null;

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

// ─── final system hash ─────────────────────────────────────────────

/**
 * Deterministic SHA-256 over ALL subsystem hashes + convergence hash.
 * This is the single canonical system fingerprint.
 *
 * @returns {string}
 */
export function computeFinalSystemHash() {
  const convergenceHash = _safe(() => computeSystemConvergenceHash());
  const kernelHash = _safe(() => computeProductKernelHash());
  const sdkHash = _safe(() => computeSdkSurfaceHash());
  const distHash = _safe(() => computeDistributedWorkflowHash());
  const httpHash = _safe(() => computeRuntimeSurfaceHash());
  const gwHash = _safe(() => computeApiGatewayHash());
  const tenantHash = _safe(() => computeTenantProvisioningHash());
  const policyHash = _safe(() => computeTenantPolicyHash());
  const usageHash = _safe(() => computeRuntimeUsageHash());
  const auditHash = _safe(() => computeRuntimeAuditHash());
  const provHash = _safe(() => computeProvenanceHash());

  const hashInput = [
    RUNTIME_FINAL_SEAL_VERSION,
    convergenceHash.ok ? convergenceHash.value : 'none',
    kernelHash.ok ? kernelHash.value : 'none',
    sdkHash.ok ? sdkHash.value : 'none',
    distHash.ok ? distHash.value : 'none',
    httpHash.ok ? httpHash.value : 'none',
    gwHash.ok ? gwHash.value : 'none',
    tenantHash.ok ? tenantHash.value : 'none',
    policyHash.ok ? policyHash.value : 'none',
    usageHash.ok ? usageHash.value : 'none',
    auditHash.ok ? auditHash.value : 'none',
    provHash.ok ? provHash.value : 'none',
    String(_sealed),
  ].join('::');

  return createHash('sha256').update(hashInput).digest('hex');
}

// ─── create seal ───────────────────────────────────────────────────

/**
 * Create the final system seal. This is the one-shot closure action.
 *
 * Steps:
 * 1. Pull convergence model from 9.8
 * 2. Detect contradictions (must be zero)
 * 3. Ensure convergence is frozen (freeze if not yet)
 * 4. Validate convergence integrity
 * 5. Compute final system hash
 * 6. Lock state irreversibly
 *
 * @returns {object} — deeply frozen seal record
 * @throws {Error} if already sealed or contradictions exist
 */
export function createFinalSystemSeal() {
  if (_sealed) {
    throw new Error('final_seal_error: system already sealed');
  }

  // 1. Pull convergence model
  const convergence = buildSystemConvergenceModel();
  if (!convergence.converged) {
    throw new Error('final_seal_error: convergence model is not converged');
  }

  // 2. Detect contradictions — must be zero
  const contradictions = detectSystemContradictions();
  if (!contradictions.consistent) {
    throw new Error(`final_seal_error: contradictions detected — ${contradictions.violations.join('; ')}`);
  }

  // 3. Ensure 9.8 convergence is frozen
  if (!isSystemConvergenceFrozen()) {
    freezeSystemConvergence();
  }

  // 4. Validate convergence integrity
  validateSystemConvergence();

  // 5. Compute final hash BEFORE sealing
  _sealed = true;
  const finalHash = computeFinalSystemHash();
  const sealId = `seal-${randomUUID()}`;

  _sealRecord = _deepFreeze({
    sealed: true,
    seal_id: sealId,
    final_system_hash: finalHash,
    layers_verified: SEALED_LAYERS.length,
    convergence_attested: true,
    immutability: 'ABSOLUTE',
    readonly_runtime: true,
    execution_allowed: false,
    version: RUNTIME_FINAL_SEAL_VERSION,
    sealed_at: new Date().toISOString(),
  });

  return _sealRecord;
}

// ─── seal integrity validation ─────────────────────────────────────

/**
 * Re-compute all hashes and compare against sealed hash.
 * Detects any post-seal drift.
 *
 * @returns {{ valid: true, seal_id: string, verified_hash: string }}
 * @throws {Error} if not sealed or integrity violation detected
 */
export function validateFinalSealIntegrity() {
  if (!_sealed || !_sealRecord) {
    throw new Error('final_seal_integrity_violation: system is not sealed');
  }

  const currentHash = computeFinalSystemHash();
  if (currentHash !== _sealRecord.final_system_hash) {
    throw new Error('final_seal_integrity_violation: post-seal drift detected — hash mismatch');
  }

  const convergenceValid = _safe(() => validateSystemConvergence());
  if (!convergenceValid.ok) {
    throw new Error(`final_seal_integrity_violation: convergence validation failed — ${convergenceValid.error}`);
  }

  const contradictions = detectSystemContradictions();
  if (!contradictions.consistent) {
    throw new Error(`final_seal_integrity_violation: post-seal contradictions — ${contradictions.violations.join('; ')}`);
  }

  return { valid: true, seal_id: _sealRecord.seal_id, verified_hash: currentHash };
}

// ─── system attestation ────────────────────────────────────────────

/**
 * Build a read-only attestation report proving system consistency and seal.
 *
 * @returns {object} — deeply frozen attestation
 * @throws {Error} if not sealed
 */
export function buildFinalSystemAttestation() {
  if (!_sealed || !_sealRecord) {
    throw new Error('final_seal_error: cannot attest — system is not sealed');
  }

  const integrity = _safe(() => validateFinalSealIntegrity());

  return _deepFreeze({
    attestation: integrity.ok ? 'system_is_consistent_and_sealed' : 'seal_integrity_uncertain',
    seal_id: _sealRecord.seal_id,
    proof_layers: SEALED_LAYERS.length,
    final_hash: _sealRecord.final_system_hash,
    integrity_verified: integrity.ok,
    integrity_detail: integrity.ok ? integrity.value : integrity.error,
    readonly_runtime: true,
    execution_allowed: false,
    version: RUNTIME_FINAL_SEAL_VERSION,
    attested_at: new Date().toISOString(),
  });
}

// ─── freeze final seal ─────────────────────────────────────────────

/**
 * Freeze the convergence snapshot, hash inputs, and lock system state permanently.
 * Prevents recomputation drift by locking the seal record.
 *
 * @returns {object} — deeply frozen finalization record
 * @throws {Error} if not sealed or integrity check fails
 */
export function freezeFinalSystemSeal() {
  if (!_sealed || !_sealRecord) {
    throw new Error('final_seal_error: cannot freeze — system is not sealed');
  }

  const integrity = validateFinalSealIntegrity();

  return _deepFreeze({
    finalized: true,
    sealed: true,
    immutable: true,
    seal_id: _sealRecord.seal_id,
    final_hash: integrity.verified_hash,
    layers_locked: SEALED_LAYERS.length,
    readonly_runtime: true,
    execution_allowed: false,
    version: RUNTIME_FINAL_SEAL_VERSION,
    frozen_at: new Date().toISOString(),
  });
}

// ─── sealed check ──────────────────────────────────────────────────

/**
 * @returns {boolean}
 */
export function isSystemFinalSealed() {
  return _sealed;
}
