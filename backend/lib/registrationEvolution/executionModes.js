/**
 * Phase 6.3 — Execution activation modes.
 *
 * Defines execution mode control system with different levels of
 * activation safety. Maps risk levels to execution behavior boundaries.
 *
 * Architecture position:
 *   Phase 4 Kernel → Phase 5 Stack → 6.1 Gateway → 6.2 Bridge → 6.3 Modes ◄── THIS PHASE
 *
 * SAFETY CONTRACT:
 * - No execution logic — mode definitions only
 * - No runtime mutation
 * - No Phase 4/5/6.1/6.2 modification
 * - No scheduling, workers, or async orchestration
 * - No networking or distributed calls
 * - No persistence
 * - Deterministic — same input always produces same mode
 */

import { classifyExecutionRisk } from './executionGateway.js';

// ─── constants ─────────────────────────────────────────────────────

const EXECUTION_MODES = Object.freeze({
  STRICT: 'strict',
  CONTROLLED: 'controlled',
  CANARY: 'canary',
  SIMULATION: 'simulation',
});

const RISK_TO_MODE = Object.freeze({
  low: EXECUTION_MODES.CONTROLLED,
  medium: EXECUTION_MODES.CANARY,
  high: EXECUTION_MODES.SIMULATION,
  blocked: EXECUTION_MODES.STRICT,
});

const REAL_EXECUTION_MODES = new Set([
  EXECUTION_MODES.CONTROLLED,
  EXECUTION_MODES.CANARY,
]);

// ─── risk-to-mode mapping ──────────────────────────────────────────

/**
 * Map a risk level to an execution mode.
 *
 * @param {string} riskLevel
 * @returns {{ mode: string, reason: string }}
 */
export function evaluateModeFromRisk(riskLevel) {
  if (!riskLevel || typeof riskLevel !== 'string') {
    return { mode: EXECUTION_MODES.STRICT, reason: 'invalid_risk_level' };
  }

  const mode = RISK_TO_MODE[riskLevel];
  if (!mode) {
    return { mode: EXECUTION_MODES.STRICT, reason: `unknown_risk_level: ${riskLevel}` };
  }

  return { mode, reason: `risk_${riskLevel}_maps_to_${mode}` };
}

// ─── mode resolution ───────────────────────────────────────────────

/**
 * Determine the execution mode from full input context.
 * Uses gateway risk classification to derive the mode.
 *
 * @param {{
 *   dispatch_decision?: string,
 *   route?: { target_node_id?: string },
 *   consensus?: boolean,
 *   replay_consistent?: boolean,
 *   convergence_stable?: boolean,
 *   mesh_stable?: boolean
 * }} input
 * @returns {{ mode: string, reason: string }}
 */
export function getExecutionMode(input) {
  if (!input || typeof input !== 'object') {
    return { mode: EXECUTION_MODES.STRICT, reason: 'invalid_input' };
  }

  const risk = classifyExecutionRisk(input);
  return evaluateModeFromRisk(risk.risk_level);
}

// ─── real execution check ──────────────────────────────────────────

/**
 * Check whether a mode allows real (non-simulated) execution.
 * Only `controlled` and `canary` modes permit real execution.
 *
 * @param {string} mode
 * @returns {boolean}
 */
export function isRealExecutionAllowed(mode) {
  return REAL_EXECUTION_MODES.has(mode);
}

// ─── mode execution policy ────────────────────────────────────────

/**
 * Build a policy object describing execution behavior for a given mode.
 *
 * @param {string} mode
 * @returns {{
 *   mode: string,
 *   allow_side_effects: boolean,
 *   allow_partial_execution: boolean,
 *   allow_simulation_fallback: boolean,
 *   allow_real_execution: boolean
 * }}
 */
export function buildModeExecutionPolicy(mode) {
  switch (mode) {
    case EXECUTION_MODES.STRICT:
      return {
        mode: EXECUTION_MODES.STRICT,
        allow_side_effects: false,
        allow_partial_execution: false,
        allow_simulation_fallback: false,
        allow_real_execution: false,
      };

    case EXECUTION_MODES.SIMULATION:
      return {
        mode: EXECUTION_MODES.SIMULATION,
        allow_side_effects: false,
        allow_partial_execution: false,
        allow_simulation_fallback: true,
        allow_real_execution: false,
      };

    case EXECUTION_MODES.CANARY:
      return {
        mode: EXECUTION_MODES.CANARY,
        allow_side_effects: false,
        allow_partial_execution: true,
        allow_simulation_fallback: true,
        allow_real_execution: true,
      };

    case EXECUTION_MODES.CONTROLLED:
      return {
        mode: EXECUTION_MODES.CONTROLLED,
        allow_side_effects: true,
        allow_partial_execution: true,
        allow_simulation_fallback: true,
        allow_real_execution: true,
      };

    default:
      return {
        mode: mode || 'unknown',
        allow_side_effects: false,
        allow_partial_execution: false,
        allow_simulation_fallback: false,
        allow_real_execution: false,
      };
  }
}

// ─── mode validation ───────────────────────────────────────────────

/**
 * Validate that an execution mode is compatible with the gateway risk
 * and system safety rules. Throws if incompatible.
 *
 * @param {{
 *   dispatch_decision?: string,
 *   route?: { target_node_id?: string },
 *   consensus?: boolean,
 *   replay_consistent?: boolean,
 *   convergence_stable?: boolean,
 *   mesh_stable?: boolean,
 *   requested_mode?: string
 * }} input
 * @returns {{ valid: boolean, mode: string, reason: string }}
 * @throws {Error} if mode is incompatible with risk or violates safety
 */
export function validateExecutionMode(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('mode_validation_error: invalid input');
  }

  const derived = getExecutionMode(input);
  const requestedMode = input.requested_mode;

  if (!requestedMode) {
    return { valid: true, mode: derived.mode, reason: 'derived_mode_accepted' };
  }

  const validModes = Object.values(EXECUTION_MODES);
  if (!validModes.includes(requestedMode)) {
    throw new Error(`mode_validation_error: unknown mode '${requestedMode}'`);
  }

  const modeRank = { strict: 0, simulation: 1, canary: 2, controlled: 3 };
  const derivedRank = modeRank[derived.mode] ?? 0;
  const requestedRank = modeRank[requestedMode] ?? 0;

  if (requestedRank > derivedRank) {
    throw new Error(
      `mode_validation_error: requested mode '${requestedMode}' exceeds ` +
      `risk-derived mode '${derived.mode}' — escalation not allowed`
    );
  }

  return { valid: true, mode: requestedMode, reason: 'requested_mode_within_safety_bounds' };
}
