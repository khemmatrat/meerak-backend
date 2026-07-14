/**
 * Phase 10.4 — SaaS Dashboard Layer (Control Plane UI Runtime).
 *
 * Models a fully deterministic SaaS control plane dashboard with
 * sessions, widgets, actions, and interaction simulation — all
 * read-only with zero execution.
 *
 * Architecture position:
 *   Kernel (9.x) → Platform (10.1) → SDK (10.2) → GTM (10.3) → Dashboard (10.4) ◄── THIS
 *
 * SAFETY CONTRACT:
 * - readonly_dashboard: true on every output
 * - execution_allowed: false on every output
 * - UI interactions = simulation only
 * - NO DB, NO network, NO runtime execution
 * - deterministic hash everywhere
 */

import { createHash, randomUUID } from 'crypto';

// Phase 9 — tenant, policy, usage, audit
import { buildTenantProvisioningSnapshot } from './tenantProvisioningLayer.js';
import { buildTenantPolicySnapshot } from './tenantRuntimePolicyLayer.js';
import { buildRuntimeUsageSnapshot } from './runtimeUsageMeter.js';
import { buildRuntimeAuditSnapshot } from './runtimeAuditLedger.js';
import { computeSystemConvergenceHash } from './runtimeSystemConvergenceEngine.js';
import { computeFinalSystemHash } from './runtimeFinalSealEngine.js';

// Phase 10 — platform, SDK, GTM
import { computeProductPlatformHash, buildProductRuntimeSnapshot } from './runtimeProductizationLayer.js';
import { computeSdkPackageHash, buildSdkPackageSnapshot } from './runtimeSdkPackagingLayer.js';
import { computeGoToMarketHash, evaluateMarketReadiness, buildGoToMarketSnapshot } from './runtimeGoToMarketLayer.js';

// ─── constants ─────────────────────────────────────────────────────

export const DASHBOARD_VERSION = 'dashboard_v1';

const VALID_ROLES = Object.freeze(new Set(['admin', 'tenant_owner', 'viewer']));

const WIDGET_TYPES = Object.freeze(new Set([
  'tenant_overview', 'usage_meter', 'policy_status',
  'audit_chain', 'workflow_state', 'sdk_clients', 'market_readiness',
]));

const ACTION_TYPES = Object.freeze(new Set([
  'view_tenant', 'inspect_usage', 'simulate_workflow',
  'inspect_audit', 'view_sdk_clients', 'check_readiness',
]));

// ─── internal state ────────────────────────────────────────────────

const _sessions = new Map();
const _actions = new Map();
const _interactions = [];
let _frozen = false;

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

// ─── dashboard session ─────────────────────────────────────────────

/**
 * Create a dashboard session for a user (tenant/admin/viewer).
 *
 * @param {object} input — { tenant_id, user_role?, governance_mode? }
 * @returns {object} — deeply frozen session descriptor
 */
export function createDashboardSession(input) {
  if (_frozen) {
    throw new Error('dashboard_error: dashboard is frozen — no new sessions');
  }
  if (!input || typeof input !== 'object') {
    throw new Error('dashboard_error: invalid input');
  }
  if (!input.tenant_id || typeof input.tenant_id !== 'string') {
    throw new Error('dashboard_error: tenant_id required');
  }

  const role = input.user_role || 'viewer';
  if (!VALID_ROLES.has(role)) {
    throw new Error(`dashboard_error: invalid user_role '${role}'`);
  }

  const govMode = input.governance_mode || 'strict';
  const sessionId = `dash-${randomUUID()}`;

  const hashInput = [DASHBOARD_VERSION, sessionId, input.tenant_id, role, govMode].join('::');
  const sessionHash = createHash('sha256').update(hashInput).digest('hex');

  const session = _deepFreeze({
    dashboard_session_id: sessionId,
    tenant_id: input.tenant_id,
    user_role: role,
    governance_mode: govMode,
    readonly_dashboard: true,
    execution_allowed: false,
    session_hash: sessionHash,
    version: DASHBOARD_VERSION,
    created_at: new Date().toISOString(),
  });

  _sessions.set(sessionId, session);
  return session;
}

// ─── dashboard view ────────────────────────────────────────────────

/**
 * Build the SaaS control plane view with all widgets.
 *
 * @param {object} session — dashboard session
 * @returns {object} — deeply frozen dashboard view
 */
export function buildDashboardView(session) {
  if (!session || !session.dashboard_session_id) {
    throw new Error('dashboard_error: invalid session');
  }
  if (!_sessions.has(session.dashboard_session_id)) {
    throw new Error(`dashboard_error: session '${session.dashboard_session_id}' not found`);
  }

  const widgets = [];
  for (const wType of WIDGET_TYPES) {
    const data = _safe(() => getDashboardWidgetData({ widget_type: wType, tenant_id: session.tenant_id }));
    widgets.push({
      widget_type: wType,
      available: data.ok,
      summary: data.ok ? data.value.summary : null,
    });
  }

  const viewId = `view-${randomUUID()}`;
  const hashInput = [DASHBOARD_VERSION, viewId, session.dashboard_session_id, widgets.length.toString()].join('::');
  const snapshotHash = createHash('sha256').update(hashInput).digest('hex');

  return _deepFreeze({
    dashboard_view_id: viewId,
    session_id: session.dashboard_session_id,
    tenant_id: session.tenant_id,
    user_role: session.user_role,
    widgets,
    widget_count: widgets.length,
    readonly_dashboard: true,
    execution_allowed: false,
    snapshot_hash: snapshotHash,
    version: DASHBOARD_VERSION,
    built_at: new Date().toISOString(),
  });
}

// ─── widget data ───────────────────────────────────────────────────

/**
 * Get deterministic widget data by type.
 *
 * @param {object} input — { widget_type, tenant_id? }
 * @returns {object} — deeply frozen widget data
 */
export function getDashboardWidgetData(input) {
  if (!input || !input.widget_type) {
    throw new Error('dashboard_error: widget_type required');
  }
  if (!WIDGET_TYPES.has(input.widget_type)) {
    throw new Error(`dashboard_error: invalid widget_type '${input.widget_type}'`);
  }

  let summary = null;

  switch (input.widget_type) {
    case 'tenant_overview': {
      const snap = _safe(() => buildTenantProvisioningSnapshot());
      summary = snap.ok ? { total_tenants: snap.value.total_tenants, total_namespaces: snap.value.total_namespaces } : { error: 'unavailable' };
      break;
    }
    case 'usage_meter': {
      const snap = _safe(() => buildRuntimeUsageSnapshot());
      summary = snap.ok ? { total_meters: snap.value.total_meters } : { error: 'unavailable' };
      break;
    }
    case 'policy_status': {
      const snap = _safe(() => buildTenantPolicySnapshot());
      summary = snap.ok ? { total_policies: snap.value.total_policies } : { error: 'unavailable' };
      break;
    }
    case 'audit_chain': {
      const snap = _safe(() => buildRuntimeAuditSnapshot());
      summary = snap.ok ? { total_entries: snap.value.total_entries, integrity: snap.value.append_only_integrity !== false } : { error: 'unavailable' };
      break;
    }
    case 'workflow_state': {
      const sdkSnap = _safe(() => buildSdkPackageSnapshot());
      summary = sdkSnap.ok ? { workflow_sessions: sdkSnap.value.workflow_sessions } : { error: 'unavailable' };
      break;
    }
    case 'sdk_clients': {
      const sdkSnap = _safe(() => buildSdkPackageSnapshot());
      summary = sdkSnap.ok ? { client_count: sdkSnap.value.client_count } : { error: 'unavailable' };
      break;
    }
    case 'market_readiness': {
      const readiness = _safe(() => evaluateMarketReadiness());
      summary = readiness.ok ? { score: readiness.value.score, market_ready: readiness.value.market_ready } : { error: 'unavailable' };
      break;
    }
  }

  const widgetHash = createHash('sha256')
    .update([DASHBOARD_VERSION, input.widget_type, JSON.stringify(summary)].join('::'))
    .digest('hex');

  return _deepFreeze({
    widget_type: input.widget_type,
    summary,
    readonly_dashboard: true,
    execution_allowed: false,
    widget_hash: widgetHash,
    version: DASHBOARD_VERSION,
    fetched_at: new Date().toISOString(),
  });
}

// ─── dashboard action ──────────────────────────────────────────────

/**
 * Register a UI action definition (no real execution).
 *
 * @param {object} input — { action_type, target_id?, session_id? }
 * @returns {object} — deeply frozen action record
 */
export function registerDashboardAction(input) {
  if (_frozen) {
    throw new Error('dashboard_error: dashboard is frozen — no new actions');
  }
  if (!input || typeof input !== 'object') {
    throw new Error('dashboard_error: invalid input');
  }
  if (!input.action_type || !ACTION_TYPES.has(input.action_type)) {
    throw new Error(`dashboard_error: invalid action_type '${input.action_type}'`);
  }

  const actionId = `action-${randomUUID()}`;
  const hashInput = [DASHBOARD_VERSION, actionId, input.action_type, input.target_id || ''].join('::');
  const actionHash = createHash('sha256').update(hashInput).digest('hex');

  const action = _deepFreeze({
    action_id: actionId,
    action_type: input.action_type,
    target_id: input.target_id || null,
    session_id: input.session_id || null,
    allowed: true,
    execution_allowed: false,
    readonly_action: true,
    action_hash: actionHash,
    version: DASHBOARD_VERSION,
    registered_at: new Date().toISOString(),
  });

  _actions.set(actionId, action);
  return action;
}

// ─── interaction simulation ────────────────────────────────────────

/**
 * Simulate a user interaction flow through the dashboard.
 * No side effects — produces a deterministic trace.
 *
 * @param {object} input — { session_id, path: string[] }
 * @returns {object} — deeply frozen interaction trace
 */
export function simulateDashboardInteraction(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('dashboard_error: invalid input');
  }
  if (!input.session_id || !_sessions.has(input.session_id)) {
    throw new Error(`dashboard_error: session '${input.session_id}' not found`);
  }

  const path = Array.isArray(input.path) ? input.path : ['tenant_overview'];
  const session = _sessions.get(input.session_id);

  const traceSteps = [];
  for (const step of path) {
    if (WIDGET_TYPES.has(step)) {
      const widgetData = _safe(() => getDashboardWidgetData({ widget_type: step, tenant_id: session.tenant_id }));
      traceSteps.push({ step, type: 'widget', resolved: widgetData.ok });
    } else if (ACTION_TYPES.has(step)) {
      traceSteps.push({ step, type: 'action', resolved: true });
    } else {
      traceSteps.push({ step, type: 'unknown', resolved: false });
    }
  }

  const stateSnapshot = _safe(() => buildDashboardSnapshot());
  const interactionId = `interact-${randomUUID()}`;

  const hashInput = [DASHBOARD_VERSION, interactionId, input.session_id, path.join('→')].join('::');
  const interactionHash = createHash('sha256').update(hashInput).digest('hex');

  const interaction = _deepFreeze({
    interaction_id: interactionId,
    session_id: input.session_id,
    path_traversed: path,
    steps: traceSteps.length,
    deterministic_trace: traceSteps,
    state_snapshot_available: stateSnapshot.ok,
    readonly_dashboard: true,
    execution_allowed: false,
    interaction_hash: interactionHash,
    version: DASHBOARD_VERSION,
    simulated_at: new Date().toISOString(),
  });

  _interactions.push(interaction);
  return interaction;
}

// ─── dashboard snapshot ────────────────────────────────────────────

/**
 * Full platform-level dashboard snapshot.
 *
 * @returns {object} — deeply frozen snapshot
 */
export function buildDashboardSnapshot() {
  const tenantSnap = _safe(() => buildTenantProvisioningSnapshot());
  const policySnap = _safe(() => buildTenantPolicySnapshot());
  const usageSnap = _safe(() => buildRuntimeUsageSnapshot());
  const auditSnap = _safe(() => buildRuntimeAuditSnapshot());
  const sdkSnap = _safe(() => buildSdkPackageSnapshot());
  const productSnap = _safe(() => buildProductRuntimeSnapshot());
  const gtmSnap = _safe(() => buildGoToMarketSnapshot());
  const readiness = _safe(() => evaluateMarketReadiness());

  const convergenceHash = _safe(() => computeSystemConvergenceHash());
  const sealHash = _safe(() => computeFinalSystemHash());
  const platformHash = _safe(() => computeProductPlatformHash());
  const sdkHash = _safe(() => computeSdkPackageHash());
  const gtmHash = _safe(() => computeGoToMarketHash());

  return _deepFreeze({
    dashboard_state: _frozen ? 'FROZEN' : 'ACTIVE',
    sessions: _sessions.size,
    actions_registered: _actions.size,
    interactions_logged: _interactions.length,
    tenants: tenantSnap.ok ? tenantSnap.value.total_tenants : 0,
    policies: policySnap.ok ? policySnap.value.total_policies : 0,
    usage_meters: usageSnap.ok ? usageSnap.value.total_meters : 0,
    audit_entries: auditSnap.ok ? auditSnap.value.total_entries : 0,
    audit_integrity: auditSnap.ok ? (auditSnap.value.append_only_integrity !== false) : false,
    sdk_clients: sdkSnap.ok ? sdkSnap.value.client_count : 0,
    workflow_sessions: sdkSnap.ok ? sdkSnap.value.workflow_sessions : 0,
    plans_defined: productSnap.ok ? productSnap.value.plans_defined : 0,
    gtm_offerings: gtmSnap.ok ? gtmSnap.value.offerings : 0,
    readiness_score: readiness.ok ? readiness.value.score : 'N/A',
    market_ready: readiness.ok ? readiness.value.market_ready : false,
    hashes: {
      convergence: convergenceHash.ok ? convergenceHash.value : null,
      seal: sealHash.ok ? sealHash.value : null,
      platform: platformHash.ok ? platformHash.value : null,
      sdk: sdkHash.ok ? sdkHash.value : null,
      gtm: gtmHash.ok ? gtmHash.value : null,
      dashboard: computeDashboardHash(),
    },
    readonly_dashboard: true,
    execution_allowed: false,
    version: DASHBOARD_VERSION,
    built_at: new Date().toISOString(),
  });
}

// ─── dashboard hash ────────────────────────────────────────────────

/**
 * Deterministic SHA-256 over dashboard state + upstream hashes.
 *
 * @returns {string}
 */
export function computeDashboardHash() {
  const platformHash = _safe(() => computeProductPlatformHash());
  const sdkHash = _safe(() => computeSdkPackageHash());
  const gtmHash = _safe(() => computeGoToMarketHash());
  const sealHash = _safe(() => computeFinalSystemHash());
  const convergenceHash = _safe(() => computeSystemConvergenceHash());

  const sessionIds = [..._sessions.keys()].sort().join(',');
  const actionIds = [..._actions.keys()].sort().join(',');

  const hashInput = [
    DASHBOARD_VERSION,
    platformHash.ok ? platformHash.value : 'none',
    sdkHash.ok ? sdkHash.value : 'none',
    gtmHash.ok ? gtmHash.value : 'none',
    sealHash.ok ? sealHash.value : 'none',
    convergenceHash.ok ? convergenceHash.value : 'none',
    sessionIds,
    actionIds,
    String(_interactions.length),
    String(_frozen),
  ].join('::');

  return createHash('sha256').update(hashInput).digest('hex');
}

// ─── freeze dashboard ──────────────────────────────────────────────

/**
 * Lock the dashboard layer permanently.
 *
 * @returns {object} — deeply frozen lock record
 * @throws {Error} if already frozen
 */
export function freezeDashboardLayer() {
  if (_frozen) {
    throw new Error('dashboard_error: dashboard already frozen');
  }

  _frozen = true;

  const finalHash = computeDashboardHash();

  return _deepFreeze({
    frozen: true,
    dashboard_state: 'FROZEN',
    sessions_locked: _sessions.size,
    actions_locked: _actions.size,
    interactions_logged: _interactions.length,
    dashboard_hash: finalHash,
    readonly_dashboard: true,
    execution_allowed: false,
    version: DASHBOARD_VERSION,
    frozen_at: new Date().toISOString(),
  });
}

// ─── frozen check ──────────────────────────────────────────────────

/**
 * @returns {boolean}
 */
export function isDashboardFrozen() {
  return _frozen;
}
