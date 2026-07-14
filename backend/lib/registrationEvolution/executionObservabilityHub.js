/**
 * Phase 7.3 — Execution observability hub.
 *
 * Unified tracing and metrics collection for the execution pipeline.
 * Aggregates ingress → routing → shadow execution into full lifecycle
 * traces, records deterministic metrics, and detects anomalies.
 * All data is in-memory only.
 *
 * Architecture position:
 *   7.1 Ingress → 7.2 Exposure Router → 7.3 Shadow Engine → Observability Hub
 *
 * SAFETY CONTRACT:
 * - No real execution — observation only
 * - No Phase 6 governance modification
 * - No lifecycle mutation
 * - No external persistence / DB writes
 * - No async workers or scheduling
 * - All storage in-memory only
 */

import { createHash, randomUUID } from 'crypto';

// ─── constants ─────────────────────────────────────────────────────

const OBSERVABILITY_VERSION = 'phase7_observability_v1';

// ─── in-memory telemetry store ─────────────────────────────────────

const _traceStore = new Map();
const _metricStore = [];

// ─── execution trace creation ──────────────────────────────────────

/**
 * Build a full lifecycle trace combining ingress, routing, and shadow data.
 *
 * @param {object} input
 * @param {string} input.scope_id
 * @param {object} [input.ingress] — ingress result (from 7.1)
 * @param {object} [input.routing] — routing profile (from 7.2)
 * @param {object} [input.shadow] — shadow execution result (from 7.3 engine)
 * @returns {{
 *   trace_id: string,
 *   scope_id: string,
 *   timeline: string[],
 *   phases: object,
 *   shadow: boolean,
 *   execution_real: boolean,
 *   trace_hash: string,
 *   created_at: string
 * }}
 */
export function createExecutionTrace(input) {
  if (!input || typeof input !== 'object' || !input.scope_id) {
    return _emptyTrace('invalid_input');
  }

  const traceId = `obs-${createHash('sha256').update(`${OBSERVABILITY_VERSION}::${input.scope_id}::${Date.now()}`).digest('hex').slice(0, 12)}`;

  const timeline = [];
  const phases = {};

  if (input.ingress) {
    timeline.push('ingress_received');
    phases.ingress = {
      accepted: input.ingress.accepted ?? null,
      ingress_id: input.ingress.ingress_id || null,
    };
  }

  if (input.routing) {
    timeline.push('intent_classified', 'route_resolved');
    phases.routing = {
      traffic_type: input.routing.classification?.traffic_type || input.routing.traffic_type || null,
      route: input.routing.route?.route || null,
    };
  }

  if (input.shadow) {
    timeline.push('shadow_execution_started', 'shadow_execution_completed');
    phases.shadow = {
      execution_id: input.shadow.execution_id || null,
      simulated_state: input.shadow.simulated_state || null,
      steps_simulated: input.shadow.steps_simulated || 0,
    };
  }

  timeline.push('observability_recorded');

  const traceHash = createHash('sha256')
    .update(`${traceId}::${input.scope_id}::${timeline.join(',')}`)
    .digest('hex');

  const trace = {
    trace_id: traceId,
    scope_id: input.scope_id,
    timeline,
    phases,
    shadow: true,
    execution_real: false,
    trace_hash: traceHash,
    created_at: new Date().toISOString(),
  };

  const scopeTraces = _traceStore.get(input.scope_id) || [];
  scopeTraces.push(trace);
  _traceStore.set(input.scope_id, scopeTraces);

  return trace;
}

// ─── metric recording ──────────────────────────────────────────────

/**
 * Record a deterministic metric snapshot.
 *
 * @param {object} metric
 * @param {string} metric.scope_id
 * @param {string} metric.metric_type — e.g. 'shadow_success', 'shadow_failure', 'ingress_rejected'
 * @param {number} [metric.value] — numeric metric value (default 1)
 * @param {object} [metric.tags] — optional key-value tags
 * @returns {{
 *   metric_id: string,
 *   scope_id: string,
 *   metric_type: string,
 *   value: number,
 *   recorded_at: string
 * }}
 */
export function recordExecutionMetric(metric) {
  if (!metric || typeof metric !== 'object' || !metric.scope_id || !metric.metric_type) {
    return { metric_id: 'none', scope_id: 'unknown', metric_type: 'unknown', value: 0, recorded_at: new Date().toISOString() };
  }

  const record = {
    metric_id: `met-${randomUUID().slice(0, 8)}`,
    scope_id: metric.scope_id,
    metric_type: metric.metric_type,
    value: typeof metric.value === 'number' ? metric.value : 1,
    tags: metric.tags && typeof metric.tags === 'object' ? { ...metric.tags } : {},
    recorded_at: new Date().toISOString(),
  };

  _metricStore.push(record);
  return record;
}

// ─── observability snapshot ────────────────────────────────────────

/**
 * Aggregate system-level visibility from stored traces and metrics.
 *
 * @param {string} [scopeId] — optional scope filter (null = all)
 * @returns {{
 *   scope_id: string,
 *   total_traces: number,
 *   total_metrics: number,
 *   metrics: {
 *     total_requests: number,
 *     shadow_success_rate: number,
 *     intent_distribution: object
 *   },
 *   snapshot_hash: string,
 *   built_at: string
 * }}
 */
export function buildObservabilitySnapshot(scopeId) {
  const filteredTraces = scopeId
    ? (_traceStore.get(scopeId) || [])
    : Array.from(_traceStore.values()).flat();

  const filteredMetrics = scopeId
    ? _metricStore.filter(m => m.scope_id === scopeId)
    : [..._metricStore];

  const totalRequests = filteredTraces.length;

  const shadowSuccesses = filteredMetrics.filter(m => m.metric_type === 'shadow_success').length;
  const shadowFailures = filteredMetrics.filter(m => m.metric_type === 'shadow_failure').length;
  const shadowTotal = shadowSuccesses + shadowFailures;
  const shadowSuccessRate = shadowTotal > 0 ? shadowSuccesses / shadowTotal : 1.0;

  const intentCounts = { live: 0, canary: 0, shadow: 0, replay: 0 };
  for (const trace of filteredTraces) {
    const tt = trace.phases?.routing?.traffic_type;
    if (tt && tt in intentCounts) intentCounts[tt]++;
  }
  const intentTotal = Object.values(intentCounts).reduce((a, b) => a + b, 0);
  const intentDistribution = {};
  for (const [k, v] of Object.entries(intentCounts)) {
    intentDistribution[k] = intentTotal > 0 ? +(v / intentTotal).toFixed(2) : 0;
  }

  const snapshotHash = createHash('sha256')
    .update(`${OBSERVABILITY_VERSION}::${scopeId || 'all'}::${totalRequests}::${filteredMetrics.length}`)
    .digest('hex');

  return {
    scope_id: scopeId || 'all',
    total_traces: totalRequests,
    total_metrics: filteredMetrics.length,
    metrics: {
      total_requests: totalRequests,
      shadow_success_rate: +shadowSuccessRate.toFixed(2),
      intent_distribution: intentDistribution,
    },
    snapshot_hash: snapshotHash,
    built_at: new Date().toISOString(),
  };
}

// ─── anomaly detection ─────────────────────────────────────────────

/**
 * Detect inconsistencies or drift in observability data.
 *
 * @param {object} snapshot — observability snapshot (from buildObservabilitySnapshot)
 * @returns {{
 *   anomalies: Array<{ type: string, detail: string }>,
 *   anomaly_count: number,
 *   checked_at: string
 * }}
 */
export function detectTraceAnomalies(snapshot) {
  const anomalies = [];

  if (!snapshot || typeof snapshot !== 'object') {
    return { anomalies: [{ type: 'invalid_snapshot', detail: 'snapshot is not an object' }], anomaly_count: 1, checked_at: new Date().toISOString() };
  }

  if (snapshot.metrics?.shadow_success_rate < 0.90) {
    anomalies.push({ type: 'low_shadow_success_rate', detail: `shadow success rate ${snapshot.metrics.shadow_success_rate} below 0.90 threshold` });
  }

  if (snapshot.total_traces > 0 && snapshot.total_metrics === 0) {
    anomalies.push({ type: 'traces_without_metrics', detail: `${snapshot.total_traces} traces but 0 metrics` });
  }

  const dist = snapshot.metrics?.intent_distribution;
  if (dist) {
    const sum = Object.values(dist).reduce((a, b) => a + b, 0);
    if (snapshot.total_traces > 0 && Math.abs(sum - 1.0) > 0.05) {
      anomalies.push({ type: 'intent_distribution_drift', detail: `distribution sum ${sum} deviates from 1.0` });
    }
  }

  return {
    anomalies,
    anomaly_count: anomalies.length,
    checked_at: new Date().toISOString(),
  };
}

// ─── telemetry retrieval ───────────────────────────────────────────

/**
 * Retrieve full execution history for a scope (in-memory).
 *
 * @param {string} scopeId
 * @returns {{
 *   scope_id: string,
 *   traces: object[],
 *   metrics: object[],
 *   total_traces: number,
 *   total_metrics: number
 * }}
 */
export function getExecutionTelemetry(scopeId) {
  if (!scopeId || typeof scopeId !== 'string') {
    return { scope_id: 'unknown', traces: [], metrics: [], total_traces: 0, total_metrics: 0 };
  }

  const traces = _traceStore.get(scopeId) || [];
  const metrics = _metricStore.filter(m => m.scope_id === scopeId);

  return {
    scope_id: scopeId,
    traces: [...traces],
    metrics: [...metrics],
    total_traces: traces.length,
    total_metrics: metrics.length,
  };
}

// ─── helpers ───────────────────────────────────────────────────────

function _emptyTrace(reason) {
  return {
    trace_id: `obs-err-${randomUUID().slice(0, 8)}`,
    scope_id: 'unknown',
    timeline: ['error'],
    phases: {},
    shadow: true,
    execution_real: false,
    trace_hash: '',
    created_at: new Date().toISOString(),
    _error: reason,
  };
}
