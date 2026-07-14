/**
 * Phase 9.6 — Runtime audit ledger & immutable usage evidence layer.
 *
 * Deterministic audit evidence generation above runtime usage metering
 * (9.5) and below future billing/compliance/export systems. Provides
 * append-only in-memory ledger, evidence chains, and tenant-scoped
 * forensic reproducibility.
 *
 * Architecture position:
 *   9.4 Runtime Policy → 9.5 Usage Meter → 9.6 Audit Ledger ◄── THIS PHASE
 *
 * SAFETY CONTRACT:
 * - NO execution or side effects
 * - NO persistence, networking, or async workers
 * - NO billing or payment logic
 * - NO mutation of prior ledger entries
 * - execution_allowed is ALWAYS false
 * - readonly_ledger is ALWAYS true
 * - readonly_runtime is ALWAYS true
 * - append-only in-memory ledger model
 * - deterministic, deeply frozen outputs only
 */

import { createHash } from 'crypto';
import { resolveTenantNamespace } from './tenantProvisioningLayer.js';

// ─── constants ─────────────────────────────────────────────────────

export const RUNTIME_AUDIT_LEDGER_VERSION = 'runtime_audit_ledger_v1';

const EVIDENCE_TYPES = Object.freeze(new Set([
  'runtime_usage',
  'api_gateway_request',
  'tenant_policy_resolution',
  'workflow_runtime_session',
  'sdk_invocation',
]));

// ─── in-memory state ──────────────────────────────────────────────

const _ledger = [];                         // append-only entries
const _ledgerIdSet = new Set();             // dedup guard
const _tenantEntries = new Map();           // tenant_id → entry indices
const _sourceEntries = new Map();           // source_id → entry indices

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

// ─── ledger entry creation ─────────────────────────────────────────

/**
 * Create an immutable audit evidence entry.
 *
 * @param {object} input
 * @param {string} input.tenant_id
 * @param {string} input.namespace
 * @param {string} input.evidence_type
 * @param {string} input.source_id
 * @param {string} input.source_hash
 * @param {string} [input.governance_mode]
 * @param {object} [input.metadata]
 * @returns {object} — deeply frozen ledger entry
 * @throws {Error} on validation failure
 */
export function createAuditLedgerEntry(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('runtime_audit_ledger_error: invalid input');
  }
  if (!input.tenant_id || typeof input.tenant_id !== 'string') {
    throw new Error('runtime_audit_ledger_error: tenant_id required');
  }
  if (!input.namespace || typeof input.namespace !== 'string') {
    throw new Error('runtime_audit_ledger_error: namespace required');
  }
  if (!input.evidence_type || !EVIDENCE_TYPES.has(input.evidence_type)) {
    throw new Error(`runtime_audit_ledger_error: invalid evidence_type '${input.evidence_type}'`);
  }
  if (!input.source_id || typeof input.source_id !== 'string') {
    throw new Error('runtime_audit_ledger_error: source_id required');
  }
  if (!input.source_hash || typeof input.source_hash !== 'string') {
    throw new Error('runtime_audit_ledger_error: source_hash required');
  }

  // Tenant must exist (Phase 9.3)
  const tenantResolution = resolveTenantNamespace({ tenant_id: input.tenant_id });
  if (!tenantResolution) {
    throw new Error(`runtime_audit_ledger_error: tenant '${input.tenant_id}' not found`);
  }

  // Namespace must match
  if (tenantResolution.namespace !== input.namespace.toLowerCase().trim()) {
    throw new Error('runtime_audit_ledger_error: namespace mismatch');
  }

  const sequence = _ledger.length;
  const prevHash = sequence > 0 ? _ledger[sequence - 1].ledger_hash : '0'.repeat(64);

  const ledgerEntryId = `ale-${createHash('sha256').update(`${RUNTIME_AUDIT_LEDGER_VERSION}::${input.tenant_id}::${input.source_id}::${sequence}`).digest('hex').slice(0, 16)}`;

  if (_ledgerIdSet.has(ledgerEntryId)) {
    throw new Error(`runtime_audit_ledger_error: duplicate ledger_entry_id '${ledgerEntryId}'`);
  }

  const ledgerHash = createHash('sha256')
    .update([
      RUNTIME_AUDIT_LEDGER_VERSION,
      ledgerEntryId,
      input.tenant_id,
      input.namespace.toLowerCase().trim(),
      input.evidence_type,
      input.source_id,
      input.source_hash,
      input.governance_mode || 'strict',
      String(sequence),
      prevHash,
    ].join('::'))
    .digest('hex');

  const entry = _deepFreeze({
    ledger_entry_id: ledgerEntryId,
    sequence,
    tenant_id: input.tenant_id,
    namespace: input.namespace.toLowerCase().trim(),
    evidence_type: input.evidence_type,
    source_id: input.source_id,
    source_hash: input.source_hash,
    governance_mode: input.governance_mode || 'strict',
    metadata: input.metadata ? { ...input.metadata } : {},
    prev_hash: prevHash,
    readonly_ledger: true,
    execution_allowed: false,
    ledger_hash: ledgerHash,
    version: RUNTIME_AUDIT_LEDGER_VERSION,
    created_at: new Date().toISOString(),
  });

  _ledger.push(entry);
  _ledgerIdSet.add(ledgerEntryId);

  if (!_tenantEntries.has(input.tenant_id)) _tenantEntries.set(input.tenant_id, []);
  _tenantEntries.get(input.tenant_id).push(sequence);

  if (!_sourceEntries.has(input.source_id)) _sourceEntries.set(input.source_id, []);
  _sourceEntries.get(input.source_id).push(sequence);

  return entry;
}

// ─── ledger resolution ─────────────────────────────────────────────

/**
 * Resolve tenant-scoped immutable audit history.
 *
 * @param {object} input — { tenant_id?, namespace?, source_id? }
 * @returns {object|null} — deeply frozen ledger snapshot or null
 */
export function resolveAuditLedger(input) {
  if (!input || typeof input !== 'object') return null;

  let indices = null;
  let tenantId = null;
  let namespace = null;

  // Priority: tenant_id → namespace → source_id
  if (input.tenant_id) {
    tenantId = input.tenant_id;
    indices = _tenantEntries.get(input.tenant_id);
    const resolution = resolveTenantNamespace({ tenant_id: input.tenant_id });
    if (resolution) namespace = resolution.namespace;
  } else if (input.namespace) {
    const resolution = resolveTenantNamespace({ namespace: input.namespace });
    if (resolution) {
      tenantId = resolution.tenant_id;
      namespace = resolution.namespace;
      indices = _tenantEntries.get(resolution.tenant_id);
    }
  } else if (input.source_id) {
    indices = _sourceEntries.get(input.source_id);
    if (indices && indices.length > 0) {
      const firstEntry = _ledger[indices[0]];
      tenantId = firstEntry.tenant_id;
      namespace = firstEntry.namespace;
    }
  }

  if (!indices || indices.length === 0) return null;

  const entries = indices.map(i => _ledger[i]);

  // Evidence distribution
  const evidenceDist = {};
  for (const e of entries) {
    evidenceDist[e.evidence_type] = (evidenceDist[e.evidence_type] || 0) + 1;
  }

  return _deepFreeze({
    tenant_id: tenantId,
    namespace: namespace,
    total_entries: entries.length,
    evidence_distribution: evidenceDist,
    entries,
    readonly_runtime: true,
    execution_allowed: false,
    version: RUNTIME_AUDIT_LEDGER_VERSION,
  });
}

// ─── integrity validation ──────────────────────────────────────────

/**
 * Hard integrity verification of the audit ledger.
 *
 * @param {object} [input] — { tenant_id? } or omit for system-wide
 * @returns {{ valid: true, checks: string[] }}
 * @throws {Error} on integrity violation
 */
export function validateAuditLedgerIntegrity(input) {
  const checks = [];

  const entriesToCheck = [];
  if (input && input.tenant_id) {
    const indices = _tenantEntries.get(input.tenant_id) || [];
    for (const i of indices) entriesToCheck.push(_ledger[i]);
  } else {
    entriesToCheck.push(..._ledger);
  }

  // 1. No duplicate ledger IDs
  const idSet = new Set();
  for (const entry of entriesToCheck) {
    if (idSet.has(entry.ledger_entry_id)) {
      throw new Error(`runtime_audit_integrity_violation: duplicate ledger_entry_id '${entry.ledger_entry_id}'`);
    }
    idSet.add(entry.ledger_entry_id);
  }
  checks.push('no_duplicate_ids');

  // 2. Tenant existence and namespace isolation
  const tenantsSeen = new Set();
  for (const entry of entriesToCheck) {
    if (!tenantsSeen.has(entry.tenant_id)) {
      const resolution = resolveTenantNamespace({ tenant_id: entry.tenant_id });
      if (!resolution) {
        throw new Error(`runtime_audit_integrity_violation: tenant '${entry.tenant_id}' not found`);
      }
      if (resolution.namespace !== entry.namespace) {
        throw new Error(`runtime_audit_integrity_violation: namespace mismatch for '${entry.tenant_id}'`);
      }
      tenantsSeen.add(entry.tenant_id);
    }
  }
  checks.push('tenant_exists');
  checks.push('namespace_isolation');

  // 3. Source hashes exist (non-empty)
  for (const entry of entriesToCheck) {
    if (!entry.source_hash || typeof entry.source_hash !== 'string' || entry.source_hash.length === 0) {
      throw new Error(`runtime_audit_integrity_violation: missing source_hash for '${entry.ledger_entry_id}'`);
    }
  }
  checks.push('source_hashes_present');

  // 4. Ledger hashes reproducible
  for (const entry of entriesToCheck) {
    const recomputed = createHash('sha256')
      .update([
        RUNTIME_AUDIT_LEDGER_VERSION,
        entry.ledger_entry_id,
        entry.tenant_id,
        entry.namespace,
        entry.evidence_type,
        entry.source_id,
        entry.source_hash,
        entry.governance_mode,
        String(entry.sequence),
        entry.prev_hash,
      ].join('::'))
      .digest('hex');
    if (recomputed !== entry.ledger_hash) {
      throw new Error(`runtime_audit_integrity_violation: ledger_hash not reproducible for '${entry.ledger_entry_id}'`);
    }
  }
  checks.push('ledger_hashes_reproducible');

  // 5. Append-only ordering preserved (global check)
  if (!input || !input.tenant_id) {
    for (let i = 1; i < _ledger.length; i++) {
      if (_ledger[i].sequence !== i) {
        throw new Error(`runtime_audit_integrity_violation: sequence break at index ${i}`);
      }
      if (_ledger[i].prev_hash !== _ledger[i - 1].ledger_hash) {
        throw new Error(`runtime_audit_integrity_violation: chain break at index ${i}`);
      }
    }
    checks.push('append_only_ordering');
  }

  // 6. Governance mode alignment
  for (const entry of entriesToCheck) {
    const resolution = resolveTenantNamespace({ tenant_id: entry.tenant_id });
    if (resolution && resolution.governance_mode !== entry.governance_mode) {
      throw new Error(`runtime_audit_integrity_violation: governance mismatch for '${entry.ledger_entry_id}'`);
    }
  }
  checks.push('governance_alignment');

  return { valid: true, checks };
}

// ─── evidence chain ────────────────────────────────────────────────

/**
 * Build a deterministic evidence chain for a tenant or source.
 *
 * @param {object} input — { tenant_id?, source_id? }
 * @returns {object} — deeply frozen evidence chain
 * @throws {Error} if no entries found
 */
export function buildAuditEvidenceChain(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('runtime_audit_ledger_error: invalid input');
  }

  let indices = null;
  let tenantId = null;

  if (input.tenant_id) {
    tenantId = input.tenant_id;
    indices = _tenantEntries.get(input.tenant_id);
  } else if (input.source_id) {
    indices = _sourceEntries.get(input.source_id);
    if (indices && indices.length > 0) tenantId = _ledger[indices[0]].tenant_id;
  }

  if (!indices || indices.length === 0) {
    throw new Error('runtime_audit_ledger_error: no entries found for evidence chain');
  }

  const chain = indices.map(i => ({
    ledger_entry_id: _ledger[i].ledger_entry_id,
    sequence: _ledger[i].sequence,
    evidence_type: _ledger[i].evidence_type,
    source_id: _ledger[i].source_id,
    source_hash: _ledger[i].source_hash,
    ledger_hash: _ledger[i].ledger_hash,
    prev_hash: _ledger[i].prev_hash,
  }));

  const chainHash = createHash('sha256')
    .update([
      RUNTIME_AUDIT_LEDGER_VERSION,
      tenantId || 'unknown',
      chain.map(c => c.ledger_hash).join(','),
      String(chain.length),
    ].join('::'))
    .digest('hex');

  const chainId = `aec-${chainHash.slice(0, 16)}`;

  return _deepFreeze({
    chain_id: chainId,
    tenant_id: tenantId,
    total_links: chain.length,
    evidence_chain: chain,
    chain_hash: chainHash,
    readonly_runtime: true,
    execution_allowed: false,
    version: RUNTIME_AUDIT_LEDGER_VERSION,
    built_at: new Date().toISOString(),
  });
}

// ─── snapshot ──────────────────────────────────────────────────────

/**
 * Build a deterministic platform-wide audit snapshot.
 *
 * @returns {object} — deeply frozen snapshot
 */
export function buildRuntimeAuditSnapshot() {
  // Evidence type distribution
  const evidenceDist = {};
  const govDist = {};
  const tenantSet = new Set();

  for (const entry of _ledger) {
    evidenceDist[entry.evidence_type] = (evidenceDist[entry.evidence_type] || 0) + 1;
    govDist[entry.governance_mode] = (govDist[entry.governance_mode] || 0) + 1;
    tenantSet.add(entry.tenant_id);
  }

  // Latest ledger hashes per tenant
  const latestHashes = {};
  for (const [tenantId, indices] of _tenantEntries) {
    if (indices.length > 0) {
      latestHashes[tenantId] = _ledger[indices[indices.length - 1]].ledger_hash;
    }
  }

  // Chain statistics
  const chainStats = {};
  for (const tenantId of tenantSet) {
    const indices = _tenantEntries.get(tenantId) || [];
    chainStats[tenantId] = { entries: indices.length };
  }

  // Append-only integrity
  let appendOnlyValid = true;
  for (let i = 1; i < _ledger.length; i++) {
    if (_ledger[i].prev_hash !== _ledger[i - 1].ledger_hash) {
      appendOnlyValid = false;
      break;
    }
  }

  return _deepFreeze({
    version: RUNTIME_AUDIT_LEDGER_VERSION,
    total_tenants: tenantSet.size,
    total_entries: _ledger.length,
    evidence_type_distribution: evidenceDist,
    governance_distribution: govDist,
    append_only_integrity: appendOnlyValid,
    latest_ledger_hashes: latestHashes,
    chain_statistics: chainStats,
    built_at: new Date().toISOString(),
  });
}

// ─── audit hash ────────────────────────────────────────────────────

/**
 * Deterministic SHA-256 from the normalized audit ledger state.
 *
 * @returns {string}
 */
export function computeRuntimeAuditHash() {
  const entryIds = _ledger.map(e => e.ledger_entry_id).join(',');
  const sourceHashes = _ledger.map(e => e.source_hash).join(',');
  const tenantIds = [...new Set(_ledger.map(e => e.tenant_id))].sort().join(',');

  const evidenceDist = {};
  for (const entry of _ledger) {
    evidenceDist[entry.evidence_type] = (evidenceDist[entry.evidence_type] || 0) + 1;
  }
  const distStr = Object.entries(evidenceDist).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join(',');

  const hashInput = [
    RUNTIME_AUDIT_LEDGER_VERSION,
    entryIds,
    sourceHashes,
    tenantIds,
    distStr,
    String(_ledger.length),
  ].join('::');

  return createHash('sha256').update(hashInput).digest('hex');
}
