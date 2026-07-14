/**
 * Phase 10.5 — Minimal Admin Bridge (Shadow → Dashboard Data).
 *
 * Provides real V2 shadow data to the dashboard layer (10.4),
 * transforming simulated views into production shadow views.
 *
 * SAFETY CONTRACT:
 * - Read-only aggregation of V2 in-memory state
 * - NO database, NO network, NO mutation
 * - All calls fail-safe
 */

import { buildRuntimeUsageSnapshot } from './runtimeUsageMeter.js';
import { buildRuntimeAuditSnapshot } from './runtimeAuditLedger.js';
import { buildProvenanceSnapshot } from './runtimeEventProvenanceGraph.js';
import { buildProductRuntimeSnapshot } from './runtimeProductizationLayer.js';
import { buildSdkPackageSnapshot } from './runtimeSdkPackagingLayer.js';
import { buildGoToMarketSnapshot } from './runtimeGoToMarketLayer.js';
import { buildDashboardSnapshot } from './runtimeSaaSDashboardLayer.js';

export const ADMIN_BRIDGE_VERSION = 'admin_bridge_v1';

function _safe(fn) {
  try { return { ok: true, value: fn() }; } catch (e) { return { ok: false, error: e.message }; }
}

/**
 * Build unified admin view from all V2 layers.
 *
 * @returns {object} — aggregated view across usage, audit, provenance, product
 */
export function buildUnifiedAdminView() {
  const usage = _safe(() => buildRuntimeUsageSnapshot());
  const audit = _safe(() => buildRuntimeAuditSnapshot());
  const provenance = _safe(() => buildProvenanceSnapshot());
  const product = _safe(() => buildProductRuntimeSnapshot());
  const sdk = _safe(() => buildSdkPackageSnapshot());
  const gtm = _safe(() => buildGoToMarketSnapshot());
  const dashboard = _safe(() => buildDashboardSnapshot());

  return {
    usage: usage.ok ? usage.value : null,
    audit: audit.ok ? audit.value : null,
    provenance: provenance.ok ? provenance.value : null,
    product: product.ok ? product.value : null,
    sdk: sdk.ok ? sdk.value : null,
    gtm: gtm.ok ? gtm.value : null,
    dashboard: dashboard.ok ? dashboard.value : null,
    layers_available: [
      usage.ok && 'usage',
      audit.ok && 'audit',
      provenance.ok && 'provenance',
      product.ok && 'product',
      sdk.ok && 'sdk',
      gtm.ok && 'gtm',
      dashboard.ok && 'dashboard',
    ].filter(Boolean),
    meta: {
      source: 'v1_shadow_bridge',
      version: ADMIN_BRIDGE_VERSION,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Get key metrics from V2 shadow state.
 *
 * @returns {object} — summary metrics
 */
export function getAdminMetrics() {
  const usage = _safe(() => buildRuntimeUsageSnapshot());
  const audit = _safe(() => buildRuntimeAuditSnapshot());
  const provenance = _safe(() => buildProvenanceSnapshot());
  const sdk = _safe(() => buildSdkPackageSnapshot());

  return {
    total_meters: usage.ok ? usage.value.total_meters : 0,
    total_audit_entries: audit.ok ? audit.value.total_entries : 0,
    audit_integrity: audit.ok ? (audit.value.append_only_integrity !== false) : false,
    provenance_nodes: provenance.ok ? provenance.value.total_nodes : 0,
    provenance_links: provenance.ok ? provenance.value.total_links : 0,
    sdk_clients: sdk.ok ? sdk.value.client_count : 0,
    sdk_intents: sdk.ok ? sdk.value.intent_submissions : 0,
    system_mode: 'shadow_connected',
    version: ADMIN_BRIDGE_VERSION,
    timestamp: new Date().toISOString(),
  };
}
