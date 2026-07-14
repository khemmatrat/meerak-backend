/**
 * Phase 8.4 — Workflow composition layer.
 *
 * Deterministic multi-intent workflow composition on top of the
 * governed intent-runtime fabric. Defines immutable workflow graphs,
 * validates structural integrity, and builds execution previews —
 * but does NOT execute anything.
 *
 * Architecture position:
 *   Phase 4–7 (sealed) → 8.1 Contract → 8.2 Registry → 8.3 Capability → 8.4 Composition ◄── THIS PHASE
 *
 * SAFETY CONTRACT:
 * - Zero Phase 4–7 / 8.1–8.3 mutation
 * - Zero execution or runtime orchestration
 * - Zero persistence, networking, or workers
 * - Deterministic graph validation and hashing
 * - Recursive immutability on workflows
 * - One-way registry freeze
 */

import { createHash } from 'crypto';
import { getIntentDefinition } from './intentRegistry.js';
import { resolveRuntimeCapability } from './runtimeCapabilityMapper.js';

// ─── constants ─────────────────────────────────────────────────────

export const WORKFLOW_COMPOSITION_VERSION = 'workflow_composition_v1';

export const WORKFLOW_STEP_TYPES = Object.freeze({
  INTENT: 'intent',
  CONDITIONAL: 'conditional',
  PARALLEL: 'parallel',
  APPROVAL: 'approval',
  REPLAY: 'replay',
  TERMINAL: 'terminal',
});

const ALL_STEP_TYPES = Object.freeze(new Set(Object.values(WORKFLOW_STEP_TYPES)));

// ─── internal state ────────────────────────────────────────────────

const _workflowRegistry = new Map();
let _workflowFrozen = false;

// ─── deep freeze ───────────────────────────────────────────────────

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

// ─── workflow hash ─────────────────────────────────────────────────

/**
 * Deterministic SHA-256 hash of a workflow definition.
 *
 * @param {object} workflow
 * @returns {string}
 */
export function computeWorkflowHash(workflow) {
  if (!workflow || typeof workflow !== 'object') {
    return createHash('sha256').update(`${WORKFLOW_COMPOSITION_VERSION}::invalid`).digest('hex');
  }

  const sortedSteps = (workflow.steps || []).slice().sort((a, b) => (a.step_id || '').localeCompare(b.step_id || ''));
  const stepsStr = sortedSteps.map(s => {
    const nextSorted = (s.next_steps || []).slice().sort().join(',');
    return `${s.step_id}:${s.step_type}:${s.intent_type || ''}:${s.runtime_capability || ''}:${nextSorted}`;
  }).join('|');

  const hashInput = [
    WORKFLOW_COMPOSITION_VERSION,
    workflow.workflow_id || '',
    workflow.workflow_name || '',
    workflow.workflow_version || 'v1',
    stepsStr,
  ].join('::');

  return createHash('sha256').update(hashInput).digest('hex');
}

// ─── workflow creation ─────────────────────────────────────────────

/**
 * Build an immutable canonical workflow definition.
 *
 * @param {object} input
 * @returns {object} — deeply frozen workflow
 * @throws {Error} on validation failure
 */
export function createWorkflowDefinition(input) {
  if (_workflowFrozen) {
    throw new Error('workflow_composition_error: registry is frozen — no new workflows allowed');
  }

  if (!input || typeof input !== 'object') {
    throw new Error('workflow_composition_error: invalid input — must be an object');
  }

  if (!input.workflow_id || typeof input.workflow_id !== 'string') {
    throw new Error('workflow_composition_error: missing workflow_id');
  }

  if (!input.workflow_name || typeof input.workflow_name !== 'string') {
    throw new Error('workflow_composition_error: missing workflow_name');
  }

  if (!Array.isArray(input.steps) || input.steps.length === 0) {
    throw new Error('workflow_composition_error: steps must be non-empty array');
  }

  const version = input.workflow_version || 'v1';
  const registryKey = `${input.workflow_id}::${version}`;

  if (_workflowRegistry.has(registryKey)) {
    throw new Error(`workflow_composition_error: duplicate workflow '${registryKey}'`);
  }

  // Validate steps
  const stepIds = new Set();
  const normalizedSteps = [];

  for (const step of input.steps) {
    if (!step.step_id || typeof step.step_id !== 'string') {
      throw new Error('workflow_composition_error: step missing step_id');
    }

    if (stepIds.has(step.step_id)) {
      throw new Error(`workflow_composition_error: duplicate step id '${step.step_id}'`);
    }
    stepIds.add(step.step_id);

    if (!step.step_type || !ALL_STEP_TYPES.has(step.step_type)) {
      throw new Error(`workflow_composition_error: invalid step_type '${step.step_type}' for step '${step.step_id}'`);
    }

    // Validate intent exists in Phase 8.2
    if (step.intent_type) {
      const intentDef = getIntentDefinition(step.intent_type);
      if (!intentDef) {
        throw new Error(`workflow_composition_error: unknown intent '${step.intent_type}' in step '${step.step_id}'`);
      }
    }

    // Validate runtime capability exists in Phase 8.3
    if (step.runtime_capability && step.intent_type) {
      const capCheck = resolveRuntimeCapability({ intent_type: step.intent_type, intent_version: 'v1', governance: { mode: 'controlled' } }, step.runtime_capability);
      if (!capCheck.capability_allowed) {
        throw new Error(`workflow_composition_error: incompatible capability '${step.runtime_capability}' for intent '${step.intent_type}' in step '${step.step_id}'`);
      }
    }

    normalizedSteps.push({
      step_id: step.step_id,
      step_type: step.step_type,
      intent_type: step.intent_type || null,
      runtime_capability: step.runtime_capability || null,
      next_steps: Array.isArray(step.next_steps) ? step.next_steps.slice().sort() : [],
    });
  }

  // Validate next_step references
  for (const step of normalizedSteps) {
    for (const nextId of step.next_steps) {
      if (!stepIds.has(nextId)) {
        throw new Error(`workflow_composition_error: invalid step reference '${nextId}' in step '${step.step_id}'`);
      }
    }
  }

  // Check for terminal step reachability
  const terminalSteps = normalizedSteps.filter(s => s.step_type === WORKFLOW_STEP_TYPES.TERMINAL || s.next_steps.length === 0);
  if (terminalSteps.length === 0) {
    throw new Error('workflow_composition_error: unreachable terminal — no terminal step found');
  }

  // Cycle detection
  const cycles = _detectCycles(normalizedSteps);
  if (cycles.illegal_cycles.length > 0) {
    throw new Error(`workflow_composition_error: illegal workflow cycle detected in steps [${cycles.illegal_cycles.join(', ')}]`);
  }

  const workflowDef = {
    workflow_id: input.workflow_id,
    workflow_name: input.workflow_name,
    workflow_version: version,
    steps: normalizedSteps,
  };

  workflowDef.workflow_hash = computeWorkflowHash(workflowDef);

  const frozen = _deepFreeze(workflowDef);
  _workflowRegistry.set(registryKey, frozen);

  return frozen;
}

// ─── workflow validation ───────────────────────────────────────────

/**
 * Hard validation of a workflow definition.
 *
 * @param {object} workflow
 * @returns {{ valid: true }}
 * @throws {Error} on any validation failure
 */
export function validateWorkflowDefinition(workflow) {
  if (!workflow || typeof workflow !== 'object') {
    throw new Error('workflow_composition_error: invalid workflow — not an object');
  }

  if (!workflow.workflow_id || !workflow.workflow_name || !Array.isArray(workflow.steps)) {
    throw new Error('workflow_composition_error: missing required fields');
  }

  const stepIds = new Set();
  for (const step of workflow.steps) {
    if (stepIds.has(step.step_id)) {
      throw new Error(`workflow_composition_error: duplicate step id '${step.step_id}'`);
    }
    stepIds.add(step.step_id);

    if (!ALL_STEP_TYPES.has(step.step_type)) {
      throw new Error(`workflow_composition_error: invalid step_type '${step.step_type}'`);
    }

    for (const nextId of (step.next_steps || [])) {
      if (!stepIds.has(nextId) && !workflow.steps.some(s => s.step_id === nextId)) {
        throw new Error(`workflow_composition_error: invalid step reference '${nextId}'`);
      }
    }
  }

  const terminals = workflow.steps.filter(s => s.step_type === WORKFLOW_STEP_TYPES.TERMINAL || (s.next_steps || []).length === 0);
  if (terminals.length === 0) {
    throw new Error('workflow_composition_error: unreachable terminal');
  }

  const cycles = _detectCycles(workflow.steps);
  if (cycles.illegal_cycles.length > 0) {
    throw new Error(`workflow_composition_error: illegal workflow cycle`);
  }

  // Hash reproducibility
  if (workflow.workflow_hash) {
    const recomputed = computeWorkflowHash(workflow);
    if (recomputed !== workflow.workflow_hash) {
      throw new Error('workflow_composition_error: workflow_hash mismatch');
    }
  }

  return { valid: true };
}

// ─── execution plan (preview only) ────────────────────────────────

/**
 * Build a deterministic execution preview. NO execution.
 *
 * @param {object} workflow
 * @returns {{
 *   workflow_id: string,
 *   total_steps: number,
 *   terminal_steps: string[],
 *   execution_order: string[],
 *   replay_points: string[],
 *   parallel_segments: string[][]
 * }}
 */
export function buildWorkflowExecutionPlan(workflow) {
  if (!workflow || !Array.isArray(workflow.steps)) {
    return { workflow_id: 'unknown', total_steps: 0, terminal_steps: [], execution_order: [], replay_points: [], parallel_segments: [] };
  }

  const terminalSteps = workflow.steps
    .filter(s => s.step_type === WORKFLOW_STEP_TYPES.TERMINAL || (s.next_steps || []).length === 0)
    .map(s => s.step_id);

  const replayPoints = workflow.steps
    .filter(s => s.step_type === WORKFLOW_STEP_TYPES.REPLAY)
    .map(s => s.step_id);

  const parallelSegments = workflow.steps
    .filter(s => s.step_type === WORKFLOW_STEP_TYPES.PARALLEL)
    .map(s => [s.step_id, ...(s.next_steps || [])]);

  const executionOrder = _topologicalSort(workflow.steps);

  return {
    workflow_id: workflow.workflow_id,
    total_steps: workflow.steps.length,
    terminal_steps: terminalSteps,
    execution_order: executionOrder,
    replay_points: replayPoints,
    parallel_segments: parallelSegments,
  };
}

// ─── cycle detection ───────────────────────────────────────────────

/**
 * Detect cycles in the workflow graph.
 * Replay steps MAY create legal loops.
 *
 * @param {object} workflow
 * @returns {{ has_cycles: boolean, legal_cycles: string[], illegal_cycles: string[] }}
 */
export function detectWorkflowCycles(workflow) {
  if (!workflow || typeof workflow !== 'object') {
    return { has_cycles: false, legal_cycles: [], illegal_cycles: [] };
  }
  const steps = workflow.steps || workflow;
  if (!Array.isArray(steps)) {
    return { has_cycles: false, legal_cycles: [], illegal_cycles: [] };
  }
  return _detectCycles(steps);
}

// ─── step listing ──────────────────────────────────────────────────

/**
 * Deterministic ordered steps.
 * Topological order if possible, fallback lexical by step_id.
 *
 * @param {object} workflow
 * @returns {Array<object>}
 */
export function listWorkflowSteps(workflow) {
  if (!workflow || !Array.isArray(workflow.steps)) return [];

  const topoOrder = _topologicalSort(workflow.steps);
  if (topoOrder.length === workflow.steps.length) {
    const stepMap = new Map(workflow.steps.map(s => [s.step_id, s]));
    return topoOrder.map(id => stepMap.get(id));
  }

  return workflow.steps.slice().sort((a, b) => a.step_id.localeCompare(b.step_id));
}

// ─── registry freeze ───────────────────────────────────────────────

/**
 * One-way freeze of workflow registry.
 *
 * @returns {{ frozen: true, workflow_count: number, registry_hash: string }}
 */
export function freezeWorkflowRegistry() {
  _workflowFrozen = true;

  const entries = Array.from(_workflowRegistry.values())
    .sort((a, b) => a.workflow_id.localeCompare(b.workflow_id));
  const hashes = entries.map(e => e.workflow_hash);
  const registryHash = createHash('sha256')
    .update(`${WORKFLOW_COMPOSITION_VERSION}::${hashes.join('|')}`)
    .digest('hex');

  return { frozen: true, workflow_count: entries.length, registry_hash: registryHash };
}

/**
 * @returns {boolean}
 */
export function isWorkflowRegistryFrozen() {
  return _workflowFrozen;
}

// ─── internal helpers ──────────────────────────────────────────────

function _detectCycles(steps) {
  const stepMap = new Map(steps.map(s => [s.step_id, s]));
  const visited = new Set();
  const inStack = new Set();
  const legalCycles = [];
  const illegalCycles = [];

  function dfs(id) {
    if (inStack.has(id)) {
      const step = stepMap.get(id);
      if (step && step.step_type === WORKFLOW_STEP_TYPES.REPLAY) {
        legalCycles.push(id);
      } else {
        illegalCycles.push(id);
      }
      return;
    }
    if (visited.has(id)) return;

    visited.add(id);
    inStack.add(id);

    const step = stepMap.get(id);
    if (step) {
      for (const nextId of (step.next_steps || [])) {
        dfs(nextId);
      }
    }

    inStack.delete(id);
  }

  for (const step of steps) {
    dfs(step.step_id);
  }

  return {
    has_cycles: legalCycles.length > 0 || illegalCycles.length > 0,
    legal_cycles: legalCycles,
    illegal_cycles: illegalCycles,
  };
}

function _topologicalSort(steps) {
  const stepMap = new Map(steps.map(s => [s.step_id, s]));
  const inDegree = new Map();
  const adj = new Map();

  for (const step of steps) {
    if (!inDegree.has(step.step_id)) inDegree.set(step.step_id, 0);
    if (!adj.has(step.step_id)) adj.set(step.step_id, []);
    for (const nextId of (step.next_steps || [])) {
      adj.get(step.step_id).push(nextId);
      inDegree.set(nextId, (inDegree.get(nextId) || 0) + 1);
    }
  }

  const queue = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }
  queue.sort();

  const result = [];
  while (queue.length > 0) {
    const id = queue.shift();
    result.push(id);
    for (const nextId of (adj.get(id) || [])) {
      const newDeg = inDegree.get(nextId) - 1;
      inDegree.set(nextId, newDeg);
      if (newDeg === 0) {
        queue.push(nextId);
        queue.sort();
      }
    }
  }

  return result;
}
