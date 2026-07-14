/**
 * Phase 6.4 — Mode-aware execution controller.
 *
 * Applies execution mode rules to actual execution flow behavior.
 * Modes now modify execution behavior, not just classification.
 *
 * Architecture position:
 *   Phase 4 Kernel → Phase 5 Stack → 6.1 Gateway → 6.2 Bridge → 6.3 Modes → 6.4 Controller ◄── THIS PHASE
 *
 * SAFETY CONTRACT:
 * - No Phase 4/5/6.1/6.2/6.3 modification
 * - No runtime execution engine
 * - No async execution loops
 * - No persistence
 * - No distributed coordination
 * - No worker threads or schedulers
 * - No autonomous execution
 * - Deterministic — same input + same mode always produces same behavior
 */

import { evaluateExecutionGate } from './executionGateway.js';
import { buildModeExecutionPolicy } from './executionModes.js';

// ─── constants ─────────────────────────────────────────────────────

const EXECUTION_DEPTHS = Object.freeze({
  NONE: 'none',
  TRACE_ONLY: 'trace-only',
  PARTIAL: 'partial',
  FULL: 'full',
});

// ─── execution depth ──────────────────────────────────────────────

/**
 * Determine execution depth for a given mode.
 *
 * @param {string} mode
 * @returns {string}
 */
export function determineExecutionDepth(mode) {
  switch (mode) {
    case 'strict': return EXECUTION_DEPTHS.NONE;
    case 'simulation': return EXECUTION_DEPTHS.TRACE_ONLY;
    case 'canary': return EXECUTION_DEPTHS.PARTIAL;
    case 'controlled': return EXECUTION_DEPTHS.FULL;
    default: return EXECUTION_DEPTHS.NONE;
  }
}

// ─── commit check ──────────────────────────────────────────────────

/**
 * Check whether execution results should be committed in a given mode.
 * Only `controlled` mode allows commits.
 *
 * @param {string} mode
 * @returns {boolean}
 */
export function shouldCommitExecution(mode) {
  return mode === 'controlled';
}

// ─── apply execution mode ──────────────────────────────────────────

/**
 * Apply execution mode rules to produce modified execution behavior.
 *
 * @param {{
 *   dispatch_decision?: string,
 *   route?: { target_node_id?: string },
 *   consensus?: boolean,
 *   replay_consistent?: boolean,
 *   convergence_stable?: boolean,
 *   mesh_stable?: boolean
 * }} input
 * @param {string} mode
 * @returns {{
 *   mode: string,
 *   execution_behavior: {
 *     allow_side_effects: boolean,
 *     execution_depth: string,
 *     commit_allowed: boolean
 *   },
 *   reason: string
 * }}
 */
export function applyExecutionMode(input, mode) {
  if (!mode || typeof mode !== 'string') {
    return {
      mode: 'strict',
      execution_behavior: { allow_side_effects: false, execution_depth: EXECUTION_DEPTHS.NONE, commit_allowed: false },
      reason: 'invalid_mode_defaulted_to_strict',
    };
  }

  const policy = buildModeExecutionPolicy(mode);
  const depth = determineExecutionDepth(mode);
  const commitAllowed = shouldCommitExecution(mode);

  return {
    mode,
    execution_behavior: {
      allow_side_effects: policy.allow_side_effects,
      execution_depth: depth,
      commit_allowed: commitAllowed,
    },
    reason: 'mode_applied',
  };
}

// ─── mode execution plan ───────────────────────────────────────────

let _planSeq = 0;

/**
 * Build an execution plan with mode-specific restrictions applied.
 *
 * @param {{
 *   dispatch_decision?: string,
 *   route?: { target_node_id?: string },
 *   consensus?: boolean,
 *   replay_consistent?: boolean,
 *   convergence_stable?: boolean,
 *   mesh_stable?: boolean
 * }} input
 * @param {string} mode
 * @returns {{
 *   plan_id: string,
 *   mode: string,
 *   steps: Array<{ step: string, allowed: boolean | string }>,
 *   execution_depth: string,
 *   commit_allowed: boolean
 * }}
 */
export function buildModeExecutionPlan(input, mode) {
  const planId = `mode-plan-${Date.now()}-${++_planSeq}`;
  const safeMode = mode || 'strict';
  const depth = determineExecutionDepth(safeMode);
  const commitAllowed = shouldCommitExecution(safeMode);

  const gate = evaluateExecutionGate(input || {});

  const steps = [];

  steps.push({ step: 'gateway', allowed: gate.allowed });

  steps.push({ step: 'route', allowed: !!(input?.route?.target_node_id) });

  if (depth === EXECUTION_DEPTHS.NONE) {
    steps.push({ step: 'execution', allowed: false });
  } else if (depth === EXECUTION_DEPTHS.TRACE_ONLY) {
    steps.push({ step: 'execution', allowed: 'trace-only' });
  } else if (depth === EXECUTION_DEPTHS.PARTIAL) {
    steps.push({ step: 'execution', allowed: 'partial' });
  } else {
    steps.push({ step: 'execution', allowed: true });
  }

  steps.push({ step: 'commit', allowed: commitAllowed });

  return { plan_id: planId, mode: safeMode, steps, execution_depth: depth, commit_allowed: commitAllowed };
}

// ─── mode execution validation ─────────────────────────────────────

/**
 * Validate that a mode-based execution is consistent. Throws if:
 * - Mode contradicts gateway decision
 * - Mode allows execution but gateway blocked
 * - Commit attempted in canary/simulation/strict
 *
 * @param {{
 *   dispatch_decision?: string,
 *   route?: { target_node_id?: string },
 *   consensus?: boolean,
 *   replay_consistent?: boolean,
 *   convergence_stable?: boolean,
 *   mesh_stable?: boolean,
 *   attempt_commit?: boolean
 * }} input
 * @param {string} mode
 * @returns {{ valid: boolean, mode: string, reason: string }}
 * @throws {Error} on validation failure
 */
export function validateModeExecution(input, mode) {
  if (!input || typeof input !== 'object') {
    throw new Error('mode_controller_error: invalid input');
  }
  if (!mode || typeof mode !== 'string') {
    throw new Error('mode_controller_error: invalid mode');
  }

  const gate = evaluateExecutionGate(input);
  const depth = determineExecutionDepth(mode);

  if (!gate.allowed && depth !== EXECUTION_DEPTHS.NONE) {
    throw new Error(`mode_controller_error: mode '${mode}' allows execution (depth=${depth}) but gateway is blocked — ${gate.gate_reason}`);
  }

  if (input.attempt_commit && !shouldCommitExecution(mode)) {
    throw new Error(`mode_controller_error: commit attempted in mode '${mode}' which does not allow commits`);
  }

  return { valid: true, mode, reason: 'mode_execution_validated' };
}
