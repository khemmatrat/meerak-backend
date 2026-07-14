import { assertAnalyticsEnabled, isAnalyticsEnabled } from './config.js';
import { createAnalyticsStorage } from './analyticsStorage.js';
import { createMetricsCollector } from './metricsCollector.js';
import { createEventAggregator } from './eventAggregator.js';
import { createKpiCalculator } from './kpiCalculator.js';
import { createFunnelAnalytics } from './funnelAnalytics.js';
import { createDashboardApi } from './dashboardApi.js';
import { createEventReplay } from './eventReplay.js';

export { createAnalyticsStorage } from './analyticsStorage.js';
export { createMetricsCollector } from './metricsCollector.js';
export { createEventAggregator } from './eventAggregator.js';
export { createKpiCalculator } from './kpiCalculator.js';
export { createFunnelAnalytics } from './funnelAnalytics.js';
export { createDashboardApi } from './dashboardApi.js';
export { createEventReplay } from './eventReplay.js';

/**
 * createAnalyticsEngine – main factory wiring all analytics sub-components.
 *
 * Returns a disabled stub when AIVOS_ANALYTICS_ENABLED is falsy.
 *
 * Exposes:
 *   engine.storage     → AnalyticsStorage
 *   engine.collector   → MetricsCollector
 *   engine.aggregator  → EventAggregator
 *   engine.kpi         → KpiCalculator
 *   engine.funnel      → FunnelAnalytics
 *   engine.dashboard   → DashboardApi
 *   engine.replay      → EventReplay
 *   engine.consumeRuntimeEvent(envelope) → forward ACP events into collector
 */
export function createAnalyticsEngine(deps = {}) {
  if (!isAnalyticsEnabled()) {
    return {
      enabled: false,
      consumeRuntimeEvent() {},
    };
  }

  const storage = deps.storage || createAnalyticsStorage();
  const collector = createMetricsCollector({ storage });
  const aggregator = createEventAggregator({ storage });
  const kpi = createKpiCalculator({ storage, aggregator });
  const funnel = createFunnelAnalytics({ storage });
  const dashboard = createDashboardApi({
    kpiCalculator: kpi,
    aggregator,
    funnel,
    publishHistory: deps.publishHistory || null,
  });
  const replay = createEventReplay({ storage });

  /**
   * Forward an ACP event envelope from the Runtime events bus into the collector.
   * This is the single integration point — call this from runtimeEvents.emit wrapper.
   */
  function consumeRuntimeEvent(envelope) {
    return collector.consumeRuntimeEvent(envelope);
  }

  return {
    enabled: true,
    storage,
    collector,
    aggregator,
    kpi,
    funnel,
    dashboard,
    replay,
    consumeRuntimeEvent,
  };
}

export default createAnalyticsEngine;
