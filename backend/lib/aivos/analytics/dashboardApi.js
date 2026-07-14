/**
 * Dashboard API – assembles a single aggregated KPI response for the UI.
 *
 * Combines KPIs, time-series, funnel, and publish history stats into
 * one response object. Designed to be called by an HTTP handler or SSE stream.
 */
export function createDashboardApi(deps = {}) {
  const kpiCalculator = deps.kpiCalculator;
  const aggregator = deps.aggregator;
  const funnel = deps.funnel;
  const publishHistory = deps.publishHistory || null;

  if (!kpiCalculator) throw new Error('dashboard_api_requires_kpi_calculator');
  if (!aggregator) throw new Error('dashboard_api_requires_aggregator');
  if (!funnel) throw new Error('dashboard_api_requires_funnel');

  /**
   * Build a full dashboard snapshot.
   *
   * @param {{ jobId?, platform?, from?, to?, granularity? }} options
   * @returns {object}  Dashboard payload
   */
  function snapshot(options = {}) {
    const filter = {
      jobId: options.jobId,
      platform: options.platform,
      from: options.from,
      to: options.to,
    };

    const kpis = kpiCalculator.calculate(filter);
    const timeSeries = aggregator.timeSeries({ ...options, ...filter });
    const contentFunnelData = funnel.contentFunnel(filter);
    const revenueFunnelData = funnel.revenueFunnel(filter);

    const topPlatforms = aggregator.totals(['impression', 'click', 'publish'], filter);

    const publishStats = publishHistory ? publishHistory.stats() : null;

    return {
      generated_at: new Date().toISOString(),
      filter: { jobId: options.jobId || null, platform: options.platform || null, from: options.from || null, to: options.to || null },
      kpis,
      time_series: timeSeries,
      funnels: {
        content: contentFunnelData,
        revenue: revenueFunnelData,
      },
      top_platforms: topPlatforms,
      publish_stats: publishStats,
    };
  }

  /**
   * Lightweight summary (for list views / tiles).
   */
  function summary(options = {}) {
    const kpis = kpiCalculator.calculate({
      jobId: options.jobId,
      platform: options.platform,
      from: options.from,
      to: options.to,
    });
    return {
      generated_at: new Date().toISOString(),
      impressions: kpis.impressions,
      clicks: kpis.clicks,
      ctr: kpis.ctr,
      watch_sessions: kpis.watch_sessions,
      avg_watch_seconds: kpis.avg_watch_seconds,
      conversions: kpis.conversions,
      revenue: kpis.revenue,
      cost: kpis.cost,
      roi: kpis.roi,
    };
  }

  return { snapshot, summary };
}

export default createDashboardApi;
