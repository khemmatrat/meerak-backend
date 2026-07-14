/**
 * Phase 7.2 — Controlled exposure routing layer (intent mapping).
 *
 * Classifies incoming traffic by type (live / canary / shadow / replay)
 * and builds deterministic routing intents. Produces intent-only outputs —
 * no execution, dispatch, governance access, or lifecycle mutation.
 *
 * Architecture position:
 *   7.1 Ingress Gateway → 7.2 Exposure Router → (future) 7.3 Shadow Execution
 *
 * SAFETY CONTRACT:
 * - No Phase 6 governance access — frozen boundary respected
 * - No execution invocation — intent-only system
 * - No dispatch / lifecycle / mode engine usage
 * - No mutation of runtime state
 * - No async workers or scheduling
 * - No networking / distributed calls
 */

import { createHash } from 'crypto';

// ─── traffic type definitions ──────────────────────────────────────

const TRAFFIC_TYPES = Object.freeze({
  LIVE: 'live',
  CANARY: 'canary',
  SHADOW: 'shadow',
  REPLAY: 'replay',
});

const ALL_TRAFFIC_TYPES = Object.freeze(new Set(Object.values(TRAFFIC_TYPES)));

const ROUTING_VERSION = 'phase7_exposure_v1';

// ─── classification heuristics ─────────────────────────────────────

const REPLAY_EVENT_TYPES = Object.freeze(new Set([
  'execution_retryable',
  'execution_failed',
]));

const SHADOW_SOURCES = Object.freeze(new Set([
  'test',
  'cli',
]));

// ─── traffic classification ────────────────────────────────────────

/**
 * Classify traffic type from an ingress context.
 * Uses deterministic heuristics based on source, event_type,
 * and optional explicit hints.
 *
 * @param {object} input — ingress context (from Phase 7.1)
 * @returns {{
 *   traffic_type: string,
 *   confidence: number,
 *   reason: string
 * }}
 */
export function classifyTrafficIntent(input) {
  if (!input || typeof input !== 'object') {
    return { traffic_type: TRAFFIC_TYPES.SHADOW, confidence: 0.0, reason: 'invalid_input_defaulted_shadow' };
  }

  if (input.traffic_type && ALL_TRAFFIC_TYPES.has(input.traffic_type)) {
    return { traffic_type: input.traffic_type, confidence: 1.0, reason: 'explicit_traffic_type' };
  }

  if (input.replay === true || REPLAY_EVENT_TYPES.has(input.event_type)) {
    return { traffic_type: TRAFFIC_TYPES.REPLAY, confidence: 0.92, reason: 'replay_event_or_flag' };
  }

  if (SHADOW_SOURCES.has(input.source)) {
    return { traffic_type: TRAFFIC_TYPES.SHADOW, confidence: 0.95, reason: 'shadow_source_detected' };
  }

  if (input.canary === true || input.exposure === 'canary') {
    return { traffic_type: TRAFFIC_TYPES.CANARY, confidence: 0.94, reason: 'canary_flag_or_exposure' };
  }

  if (input.source === 'api' || input.source === 'webhook') {
    return { traffic_type: TRAFFIC_TYPES.LIVE, confidence: 0.88, reason: 'production_source_inferred' };
  }

  return { traffic_type: TRAFFIC_TYPES.SHADOW, confidence: 0.70, reason: 'unknown_source_defaulted_shadow' };
}

// ─── routing intent builder ────────────────────────────────────────

/**
 * Generate a deterministic routing intent from an ingress context
 * and its traffic classification.
 *
 * @param {object} context — ingress context (from Phase 7.1)
 * @returns {{
 *   intent_id: string,
 *   scope_id: string,
 *   traffic_type: string,
 *   intent: string,
 *   shadow_copy: boolean,
 *   execution_allowed: boolean,
 *   intent_hash: string,
 *   built_at: string
 * }}
 */
export function buildRoutingIntent(context) {
  if (!context || typeof context !== 'object' || !context.scope_id) {
    return _emptyIntent('missing_context');
  }

  const classification = classifyTrafficIntent(context);
  const intentAction = _resolveIntentAction(classification.traffic_type);

  const hashInput = `${ROUTING_VERSION}::${context.scope_id}::${classification.traffic_type}::${context.event_type || 'none'}::${context.request_id || 'none'}`;
  const intentHash = createHash('sha256').update(hashInput).digest('hex');
  const intentId = `ri-${intentHash.slice(0, 16)}`;

  return {
    intent_id: intentId,
    scope_id: context.scope_id,
    traffic_type: classification.traffic_type,
    intent: intentAction,
    shadow_copy: classification.traffic_type !== TRAFFIC_TYPES.LIVE,
    execution_allowed: false,
    intent_hash: intentHash,
    built_at: new Date().toISOString(),
  };
}

// ─── exposure route resolver ───────────────────────────────────────

/**
 * Map a routing intent to its target route.
 * Produces a deterministic route object — NO execution triggered.
 *
 * @param {object} intent — routing intent (from buildRoutingIntent)
 * @returns {{
 *   route: string,
 *   route_type: string,
 *   traffic_type: string,
 *   execution_allowed: boolean,
 *   reason: string,
 *   resolved_at: string
 * }}
 */
export function resolveExposureRoute(intent) {
  if (!intent || typeof intent !== 'object' || !intent.intent_id) {
    return {
      route: 'none',
      route_type: 'rejected',
      traffic_type: 'unknown',
      execution_allowed: false,
      reason: 'invalid_intent',
      resolved_at: new Date().toISOString(),
    };
  }

  const routeMap = {
    [TRAFFIC_TYPES.LIVE]: { route: 'node-primary', route_type: 'deterministic_exposure' },
    [TRAFFIC_TYPES.CANARY]: { route: 'node-canary', route_type: 'deterministic_exposure' },
    [TRAFFIC_TYPES.SHADOW]: { route: 'node-shadow', route_type: 'mirror_only' },
    [TRAFFIC_TYPES.REPLAY]: { route: 'node-replay', route_type: 'deterministic_replay' },
  };

  const resolved = routeMap[intent.traffic_type] || { route: 'node-shadow', route_type: 'fallback' };

  return {
    route: resolved.route,
    route_type: resolved.route_type,
    traffic_type: intent.traffic_type,
    execution_allowed: false,
    reason: 'exposure_only_layer',
    resolved_at: new Date().toISOString(),
  };
}

// ─── full exposure profile ─────────────────────────────────────────

/**
 * Full classification + routing profile in a single call.
 * Combines classifyTrafficIntent → buildRoutingIntent → resolveExposureRoute.
 *
 * @param {object} input — ingress context (from Phase 7.1)
 * @returns {{
 *   classification: object,
 *   intent: object,
 *   route: object,
 *   profile_hash: string
 * }}
 */
export function getTrafficExposureProfile(input) {
  const classification = classifyTrafficIntent(input);
  const intent = buildRoutingIntent(input);
  const route = resolveExposureRoute(intent);

  const profileHash = createHash('sha256')
    .update(`${ROUTING_VERSION}::${classification.traffic_type}::${intent.intent_id}::${route.route}`)
    .digest('hex');

  return {
    classification,
    intent,
    route,
    profile_hash: profileHash,
  };
}

// ─── routing intent validation ─────────────────────────────────────

/**
 * Hard validation for routing intents — detects invalid or conflicting signals.
 *
 * @param {object} intent — routing intent to validate
 * @returns {{
 *   valid: boolean,
 *   failed_checks: string[]
 * }}
 */
export function validateRoutingIntent(intent) {
  const failures = [];

  if (!intent || typeof intent !== 'object') {
    return { valid: false, failed_checks: ['intent_not_object'] };
  }

  if (!intent.intent_id || typeof intent.intent_id !== 'string') {
    failures.push('intent_id_missing');
  }

  if (!intent.scope_id || typeof intent.scope_id !== 'string') {
    failures.push('scope_id_missing');
  }

  if (!intent.traffic_type || !ALL_TRAFFIC_TYPES.has(intent.traffic_type)) {
    failures.push('traffic_type_invalid');
  }

  if (!intent.intent || typeof intent.intent !== 'string') {
    failures.push('intent_action_missing');
  }

  if (intent.execution_allowed === true) {
    failures.push('execution_not_allowed_at_routing_layer');
  }

  if (typeof intent.shadow_copy !== 'boolean') {
    failures.push('shadow_copy_flag_missing');
  }

  if (intent.traffic_type === TRAFFIC_TYPES.LIVE && intent.shadow_copy === true) {
    failures.push('live_traffic_should_not_shadow_copy');
  }

  if (intent.traffic_type === TRAFFIC_TYPES.SHADOW && intent.shadow_copy === false) {
    failures.push('shadow_traffic_must_have_shadow_copy');
  }

  return { valid: failures.length === 0, failed_checks: failures };
}

// ─── helpers ───────────────────────────────────────────────────────

function _resolveIntentAction(trafficType) {
  const actions = {
    [TRAFFIC_TYPES.LIVE]: 'route_to_primary_node',
    [TRAFFIC_TYPES.CANARY]: 'route_to_canary_node',
    [TRAFFIC_TYPES.SHADOW]: 'route_to_shadow_mirror',
    [TRAFFIC_TYPES.REPLAY]: 'route_to_replay_processor',
  };
  return actions[trafficType] || 'route_to_shadow_mirror';
}

function _emptyIntent(reason) {
  return {
    intent_id: 'ri-none',
    scope_id: 'none',
    traffic_type: TRAFFIC_TYPES.SHADOW,
    intent: 'route_to_shadow_mirror',
    shadow_copy: true,
    execution_allowed: false,
    intent_hash: '',
    built_at: new Date().toISOString(),
    _error: reason,
  };
}
