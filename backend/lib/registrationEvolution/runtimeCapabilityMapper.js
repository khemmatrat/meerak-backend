/**
 * Phase 8.3 — Runtime capability mapping layer.
 *
 * Deterministic capability governance between registered intents
 * and runtime execution surfaces. Defines which intents are allowed
 * to operate under which runtime capabilities — without executing.
 *
 * Architecture position:
 *   Phase 4–7 (sealed) → 8.1 Contract → 8.2 Registry → 8.3 Capability Mapper ◄── THIS PHASE
 *
 * SAFETY CONTRACT:
 * - Zero Phase 4–7 / 8.1 / 8.2 mutation
 * - Zero execution behavior or orchestration
 * - Zero networking, persistence, or workers
 * - Deterministic capability resolution and hashing
 * - Recursive immutability on mappings
 * - One-way registry freeze
 */

import { createHash } from 'crypto';
import { getIntentDefinition } from './intentRegistry.js';

// ─── constants ─────────────────────────────────────────────────────

export const RUNTIME_CAPABILITY_VERSION = 'runtime_capability_v1';

export const RUNTIME_CAPABILITIES = Object.freeze({
  SHADOW_EXECUTION: 'shadow_execution',
  SIMULATION_EXECUTION: 'simulation_execution',
  CANARY_EXECUTION: 'canary_execution',
  CONTROLLED_EXECUTION: 'controlled_execution',
  REPLAY_EXECUTION: 'replay_execution',
  FORENSIC_ANALYSIS: 'forensic_analysis',
  OBSERVABILITY_ACCESS: 'observability_access',
});

const ALL_CAPABILITIES = Object.freeze(new Set(Object.values(RUNTIME_CAPABILITIES)));

const ALLOWED_GOVERNANCE_MODES = Object.freeze(new Set([
  'strict',
  'simulation',
  'canary',
  'controlled',
]));

// ─── internal state ────────────────────────────────────────────────

const _capabilityRegistry = new Map();
let _capabilityFrozen = false;

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

// ─── canonical stringify ───────────────────────────────────────────

function _canonicalStringify(value) {
  if (value === null) return 'null';
  if (value === undefined) return '';
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) return '[' + value.map(v => _canonicalStringify(v)).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.filter(k => value[k] !== undefined).map(k => `"${k}":${_canonicalStringify(value[k])}`).join(',') + '}';
}

// ─── mapping hash ──────────────────────────────────────────────────

/**
 * Deterministic SHA-256 hash of a capability mapping.
 *
 * @param {object} mapping
 * @returns {string} — 64-character hex hash
 */
export function computeCapabilityMappingHash(mapping) {
  if (!mapping || typeof mapping !== 'object') {
    return createHash('sha256').update(`${RUNTIME_CAPABILITY_VERSION}::invalid`).digest('hex');
  }

  const normalizedCaps = (mapping.allowed_capabilities || []).slice().sort().join(',');
  const normalizedModes = (mapping.governance_modes || []).slice().sort().join(',');

  const hashInput = [
    RUNTIME_CAPABILITY_VERSION,
    mapping.intent_type || '',
    mapping.intent_version || 'v1',
    normalizedCaps,
    mapping.default_capability || '',
    normalizedModes,
    String(!!mapping.replay_safe),
  ].join('::');

  return createHash('sha256').update(hashInput).digest('hex');
}

// ─── registration ──────────────────────────────────────────────────

/**
 * Register an immutable intent → capability mapping.
 *
 * @param {object} input
 * @param {string} input.intent_type
 * @param {string} [input.intent_version]
 * @param {string[]} input.allowed_capabilities
 * @param {string} input.default_capability
 * @param {string[]} input.governance_modes
 * @param {boolean} input.replay_safe
 * @returns {object} — frozen mapping
 * @throws {Error} on invalid mapping, duplicate, or frozen registry
 */
export function registerRuntimeCapabilityMapping(input) {
  if (_capabilityFrozen) {
    throw new Error('runtime_capability_error: registry is frozen — no new mappings allowed');
  }

  if (!input || typeof input !== 'object') {
    throw new Error('runtime_capability_error: invalid mapping — must be an object');
  }

  const version = input.intent_version || 'v1';
  const registryKey = `${input.intent_type}::${version}`;

  // Validate intent exists in Phase 8.2 registry
  const intentDef = getIntentDefinition(input.intent_type, version);
  if (!intentDef) {
    throw new Error(`runtime_capability_error: unknown intent '${registryKey}' — not registered in intent registry`);
  }

  // Duplicate check
  if (_capabilityRegistry.has(registryKey)) {
    throw new Error(`runtime_capability_error: duplicate mapping '${registryKey}'`);
  }

  // Validate capabilities
  if (!Array.isArray(input.allowed_capabilities) || input.allowed_capabilities.length === 0) {
    throw new Error('runtime_capability_error: allowed_capabilities must be non-empty array');
  }
  for (const cap of input.allowed_capabilities) {
    if (!ALL_CAPABILITIES.has(cap)) {
      throw new Error(`runtime_capability_error: unknown capability '${cap}'`);
    }
  }

  // Validate default capability
  if (!input.default_capability || !ALL_CAPABILITIES.has(input.default_capability)) {
    throw new Error(`runtime_capability_error: unknown capability '${input.default_capability}' as default`);
  }
  if (!input.allowed_capabilities.includes(input.default_capability)) {
    throw new Error(`runtime_capability_error: invalid default capability '${input.default_capability}' — not in allowed_capabilities`);
  }

  // Validate governance modes
  if (!Array.isArray(input.governance_modes) || input.governance_modes.length === 0) {
    throw new Error('runtime_capability_error: governance_modes must be non-empty array');
  }
  for (const mode of input.governance_modes) {
    if (!ALLOWED_GOVERNANCE_MODES.has(mode)) {
      throw new Error(`runtime_capability_error: governance mismatch — unsupported mode '${mode}'`);
    }
  }

  // Governance alignment with intent definition
  for (const mode of input.governance_modes) {
    if (!intentDef.governance_modes.includes(mode)) {
      throw new Error(`runtime_capability_error: governance mismatch — mode '${mode}' not allowed by intent definition [${intentDef.governance_modes.join(', ')}]`);
    }
  }

  // Replay safe must be boolean
  if (typeof input.replay_safe !== 'boolean') {
    throw new Error('runtime_capability_error: replay_safe must be boolean');
  }

  const mappingHash = computeCapabilityMappingHash({ ...input, intent_version: version });

  const entry = _deepFreeze({
    intent_type: input.intent_type,
    intent_version: version,
    allowed_capabilities: input.allowed_capabilities.slice().sort(),
    default_capability: input.default_capability,
    governance_modes: input.governance_modes.slice().sort(),
    replay_safe: input.replay_safe,
    mapping_hash: mappingHash,
  });

  _capabilityRegistry.set(registryKey, entry);
  return entry;
}

// ─── capability resolution ─────────────────────────────────────────

/**
 * Resolve the runtime capability for an intent.
 *
 * @param {object} intent — intent envelope (from Phase 8.1)
 * @param {string} [requestedCapability] — optional explicit capability
 * @returns {{
 *   intent_type: string,
 *   intent_version: string,
 *   resolved_capability: string,
 *   capability_allowed: boolean,
 *   reason: string
 * }}
 */
export function resolveRuntimeCapability(intent, requestedCapability) {
  if (!intent || typeof intent !== 'object' || !intent.intent_type) {
    return { intent_type: 'unknown', intent_version: 'unknown', resolved_capability: 'none', capability_allowed: false, reason: 'invalid_intent' };
  }

  const version = intent.intent_version || 'v1';
  const key = `${intent.intent_type}::${version}`;
  const mapping = _capabilityRegistry.get(key);

  if (!mapping) {
    return { intent_type: intent.intent_type, intent_version: version, resolved_capability: 'none', capability_allowed: false, reason: 'mapping_not_found' };
  }

  const capability = requestedCapability || mapping.default_capability;

  if (!mapping.allowed_capabilities.includes(capability)) {
    return { intent_type: intent.intent_type, intent_version: version, resolved_capability: capability, capability_allowed: false, reason: `capability_not_allowed: ${capability}` };
  }

  // Governance check
  if (intent.governance && intent.governance.mode) {
    if (!mapping.governance_modes.includes(intent.governance.mode)) {
      return { intent_type: intent.intent_type, intent_version: version, resolved_capability: capability, capability_allowed: false, reason: `governance_mode_not_permitted: ${intent.governance.mode}` };
    }
  }

  return { intent_type: intent.intent_type, intent_version: version, resolved_capability: capability, capability_allowed: true, reason: requestedCapability ? 'requested_capability_allowed' : 'default_capability_resolved' };
}

// ─── listing ───────────────────────────────────────────────────────

/**
 * Return a deterministic sorted registry snapshot.
 *
 * @returns {Array<object>}
 */
export function listRuntimeCapabilityMappings() {
  const entries = Array.from(_capabilityRegistry.values());
  entries.sort((a, b) => {
    const typeCompare = a.intent_type.localeCompare(b.intent_type);
    if (typeCompare !== 0) return typeCompare;
    return a.intent_version.localeCompare(b.intent_version);
  });
  return entries;
}

// ─── capability validation ─────────────────────────────────────────

/**
 * Hard validation of a runtime capability for an intent.
 *
 * @param {object} intent
 * @param {string} capability
 * @returns {{ valid: true }}
 * @throws {Error} on any capability violation
 */
export function validateRuntimeCapability(intent, capability) {
  if (!intent || typeof intent !== 'object' || !intent.intent_type) {
    throw new Error('runtime_capability_error: invalid intent');
  }

  const version = intent.intent_version || 'v1';
  const key = `${intent.intent_type}::${version}`;
  const mapping = _capabilityRegistry.get(key);

  if (!mapping) {
    throw new Error(`runtime_capability_error: mapping missing for '${key}'`);
  }

  if (!capability || !ALL_CAPABILITIES.has(capability)) {
    throw new Error(`runtime_capability_error: unknown capability '${capability}'`);
  }

  if (!mapping.allowed_capabilities.includes(capability)) {
    throw new Error(`runtime_capability_error: capability not allowed — '${capability}' not in [${mapping.allowed_capabilities.join(', ')}]`);
  }

  if (mapping.replay_safe && capability === RUNTIME_CAPABILITIES.REPLAY_EXECUTION) {
    // replay is allowed for replay-safe intents — pass
  } else if (!mapping.replay_safe && capability === RUNTIME_CAPABILITIES.REPLAY_EXECUTION) {
    throw new Error('runtime_capability_error: replay unsafe — intent is not replay-safe');
  }

  return { valid: true };
}

// ─── registry freeze ───────────────────────────────────────────────

/**
 * One-way freeze. No new mappings or mutations after freeze.
 *
 * @returns {{ frozen: true, mapping_count: number, registry_hash: string }}
 */
export function freezeRuntimeCapabilityRegistry() {
  _capabilityFrozen = true;
  const entries = listRuntimeCapabilityMappings();
  const hashes = entries.map(e => e.mapping_hash);
  const registryHash = createHash('sha256')
    .update(`${RUNTIME_CAPABILITY_VERSION}::${hashes.join('|')}`)
    .digest('hex');

  return { frozen: true, mapping_count: entries.length, registry_hash: registryHash };
}

/**
 * Check whether the capability registry has been frozen.
 *
 * @returns {boolean}
 */
export function isRuntimeCapabilityRegistryFrozen() {
  return _capabilityFrozen;
}
