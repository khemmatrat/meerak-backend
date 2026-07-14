/**
 * Phase 8.2 — Intent registry layer.
 *
 * Governed registry system for canonical intent definitions.
 * Provides deterministic registration, compatibility enforcement,
 * version tracking, and immutable runtime-safe intent metadata.
 *
 * Architecture position:
 *   Phase 4–7 (sealed) → 8.1 Intent Contract → 8.2 Intent Registry ◄── THIS PHASE
 *
 * SAFETY CONTRACT:
 * - Zero Phase 4–7 mutation
 * - Zero Phase 8.1 contract mutation
 * - Zero execution behavior or orchestration
 * - Zero persistence, networking, or workers
 * - Deterministic registry ordering and hashing
 * - Recursive immutability on definitions
 * - One-way registry freeze
 */

import { createHash } from 'crypto';
import { INTENT_TYPES } from './intentContractLayer.js';

// ─── constants ─────────────────────────────────────────────────────

export const INTENT_REGISTRY_VERSION = 'intent_registry_v1';

const ALL_INTENT_TYPES = Object.freeze(new Set(Object.values(INTENT_TYPES)));

const ALLOWED_GOVERNANCE_MODES = Object.freeze(new Set([
  'strict',
  'simulation',
  'canary',
  'controlled',
]));

// ─── internal state ────────────────────────────────────────────────

const _registry = new Map();
let _registryFrozen = false;

// ─── deep freeze helper ────────────────────────────────────────────

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

// ─── deterministic canonical stringify ──────────────────────────────

function _canonicalStringify(value) {
  if (value === null) return 'null';
  if (value === undefined) return '';
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) {
    return '[' + value.map(v => _canonicalStringify(v)).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  return '{' + keys
    .filter(k => value[k] !== undefined)
    .map(k => `"${k}":${_canonicalStringify(value[k])}`)
    .join(',') + '}';
}

// ─── definition hash ───────────────────────────────────────────────

/**
 * Deterministic SHA-256 hash of a normalized intent definition.
 *
 * @param {object} definition
 * @returns {string} — 64-character hex hash
 */
export function computeIntentDefinitionHash(definition) {
  if (!definition || typeof definition !== 'object') {
    return createHash('sha256').update(`${INTENT_REGISTRY_VERSION}::invalid`).digest('hex');
  }

  const normalizedSchema = _canonicalStringify(definition.schema || {});
  const normalizedModes = (definition.governance_modes || []).slice().sort().join(',');
  const normalizedCompat = _canonicalStringify(definition.compatibility || {});

  const hashInput = [
    INTENT_REGISTRY_VERSION,
    definition.intent_type || '',
    definition.intent_version || 'v1',
    normalizedSchema,
    normalizedModes,
    String(!!definition.replay_safe),
    normalizedCompat,
  ].join('::');

  return createHash('sha256').update(hashInput).digest('hex');
}

// ─── registration ──────────────────────────────────────────────────

/**
 * Register an immutable intent definition.
 *
 * @param {object} definition
 * @param {string} definition.intent_type
 * @param {string} [definition.intent_version]
 * @param {object} definition.schema
 * @param {string[]} definition.governance_modes
 * @param {boolean} definition.replay_safe
 * @param {object} [definition.compatibility]
 * @returns {object} — frozen registered definition
 * @throws {Error} on invalid definition, duplicate, or frozen registry
 */
export function registerIntentDefinition(definition) {
  if (_registryFrozen) {
    throw new Error('intent_registry_error: registry is frozen — no new registrations allowed');
  }

  if (!definition || typeof definition !== 'object') {
    throw new Error('intent_registry_error: invalid intent definition — must be an object');
  }

  if (!definition.intent_type || !ALL_INTENT_TYPES.has(definition.intent_type)) {
    throw new Error(`intent_registry_error: invalid intent definition — unsupported intent_type '${definition.intent_type}'`);
  }

  if (!definition.schema || typeof definition.schema !== 'object') {
    throw new Error('intent_registry_error: invalid intent definition — missing schema');
  }

  if (!Array.isArray(definition.governance_modes) || definition.governance_modes.length === 0) {
    throw new Error('intent_registry_error: invalid intent definition — governance_modes must be non-empty array');
  }

  for (const mode of definition.governance_modes) {
    if (!ALLOWED_GOVERNANCE_MODES.has(mode)) {
      throw new Error(`intent_registry_error: unsupported governance mode '${mode}'`);
    }
  }

  if (typeof definition.replay_safe !== 'boolean') {
    throw new Error('intent_registry_error: invalid intent definition — replay_safe must be boolean');
  }

  const version = definition.intent_version || 'v1';
  const registryKey = `${definition.intent_type}::${version}`;

  if (_registry.has(registryKey)) {
    throw new Error(`intent_registry_error: duplicate intent registration '${registryKey}'`);
  }

  const definitionHash = computeIntentDefinitionHash({ ...definition, intent_version: version });

  const entry = _deepFreeze({
    intent_type: definition.intent_type,
    intent_version: version,
    schema: { ...definition.schema },
    governance_modes: definition.governance_modes.slice().sort(),
    replay_safe: definition.replay_safe,
    compatibility: definition.compatibility && typeof definition.compatibility === 'object'
      ? { ...definition.compatibility }
      : { backward_compatible: true },
    definition_hash: definitionHash,
  });

  _registry.set(registryKey, entry);
  return entry;
}

// ─── retrieval ─────────────────────────────────────────────────────

/**
 * Retrieve a registered intent definition.
 *
 * @param {string} intentType
 * @param {string} [version] — defaults to latest registered version
 * @returns {object | null} — frozen definition or null if not found
 */
export function getIntentDefinition(intentType, version) {
  if (!intentType || typeof intentType !== 'string') return null;

  if (version) {
    const key = `${intentType}::${version}`;
    return _registry.get(key) || null;
  }

  // Find latest version for this intent_type
  let latest = null;
  for (const [key, entry] of _registry) {
    if (key.startsWith(`${intentType}::`)) {
      if (!latest || entry.intent_version > latest.intent_version) {
        latest = entry;
      }
    }
  }
  return latest;
}

// ─── listing ───────────────────────────────────────────────────────

/**
 * Return a deterministic sorted registry snapshot.
 * Sorted by intent_type then version.
 *
 * @returns {Array<object>} — array of frozen definitions
 */
export function listRegisteredIntents() {
  const entries = Array.from(_registry.values());
  entries.sort((a, b) => {
    const typeCompare = a.intent_type.localeCompare(b.intent_type);
    if (typeCompare !== 0) return typeCompare;
    return a.intent_version.localeCompare(b.intent_version);
  });
  return entries;
}

// ─── compatibility validation ──────────────────────────────────────

/**
 * Validate an intent against its registered definition for compatibility.
 *
 * @param {object} intent — intent envelope (from Phase 8.1)
 * @returns {{ compatible: true }}
 * @throws {Error} on any compatibility violation
 */
export function validateIntentCompatibility(intent) {
  if (!intent || typeof intent !== 'object') {
    throw new Error('intent_registry_error: invalid intent — must be an object');
  }

  const definition = getIntentDefinition(intent.intent_type, intent.intent_version);
  if (!definition) {
    throw new Error(`intent_registry_error: incompatible intent version — no definition for '${intent.intent_type}::${intent.intent_version || 'latest'}'`);
  }

  // Version compatibility
  if (intent.intent_version && intent.intent_version !== definition.intent_version) {
    if (!definition.compatibility?.backward_compatible) {
      throw new Error(`intent_registry_error: incompatible intent version — '${intent.intent_version}' not backward-compatible with '${definition.intent_version}'`);
    }
  }

  // Governance compatibility
  if (intent.governance && intent.governance.mode) {
    if (!definition.governance_modes.includes(intent.governance.mode)) {
      throw new Error(`intent_registry_error: governance mismatch — mode '${intent.governance.mode}' not in allowed modes [${definition.governance_modes.join(', ')}]`);
    }
  }

  // Replay safety alignment
  if (definition.replay_safe && intent.execution_constraints) {
    if (intent.execution_constraints.replay_safe === false) {
      throw new Error('intent_registry_error: replay safety mismatch — definition requires replay_safe but intent declares replay_safe=false');
    }
  }

  // Schema presence
  if (!definition.schema || typeof definition.schema !== 'object' || Object.keys(definition.schema).length === 0) {
    throw new Error('intent_registry_error: missing schema — registered definition has empty schema');
  }

  return { compatible: true };
}

// ─── registry freeze ───────────────────────────────────────────────

/**
 * One-way registry lock. After freeze, no new registrations or mutations.
 *
 * @returns {{ frozen: true, registry_hash: string, total_definitions: number }}
 */
export function freezeIntentRegistry() {
  if (_registryFrozen) {
    const registryHash = _computeRegistryHash();
    return { frozen: true, registry_hash: registryHash, total_definitions: _registry.size };
  }

  _registryFrozen = true;
  const registryHash = _computeRegistryHash();

  return { frozen: true, registry_hash: registryHash, total_definitions: _registry.size };
}

/**
 * Check whether the registry has been frozen.
 *
 * @returns {boolean}
 */
export function isIntentRegistryFrozen() {
  return _registryFrozen;
}

// ─── internal helpers ──────────────────────────────────────────────

function _computeRegistryHash() {
  const entries = listRegisteredIntents();
  const hashes = entries.map(e => e.definition_hash);
  return createHash('sha256')
    .update(`${INTENT_REGISTRY_VERSION}::${hashes.join('|')}`)
    .digest('hex');
}
