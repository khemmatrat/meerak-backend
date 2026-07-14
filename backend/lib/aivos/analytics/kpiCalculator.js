/**
 * KPI Calculator – derives business KPIs from aggregated analytics data.
 *
 * All calculations are pure functions: given raw counts/sums, return a number.
 * The calculator pulls from storage directly for convenience methods.
 *
 * KPIs:
 *   CTR          = clicks / impressions
 *   Watch Time   = total seconds watched (sum of watch events)
 *   Retention    = (watchers who reached threshold) / total viewers
 *   Hook Score   = avg watch time in first N seconds / threshold
 *   Conversion   = conversions / clicks
 *   Revenue      = sum of revenue events
 *   Cost         = sum of cost events
 *   ROI          = (revenue - cost) / cost  (0 when cost = 0)
 *   CPC          = cost / clicks
 *   CPM          = (cost / impressions) * 1000
 */
export function createKpiCalculator(deps = {}) {
  const storage = deps.storage;
  const aggregator = deps.aggregator;

  if (!storage) throw new Error('kpi_calculator_requires_storage');

  // ── Pure computation helpers ────────────────────────────────────────────────

  function ctr(clicks, impressions) {
    if (!impressions) return 0;
    return clicks / impressions;
  }

  function conversionRate(conversions, clicks) {
    if (!clicks) return 0;
    return conversions / clicks;
  }

  function roi(revenue, cost) {
    if (!cost) return 0;
    return (revenue - cost) / cost;
  }

  function cpc(cost, clicks) {
    if (!clicks) return 0;
    return cost / clicks;
  }

  function cpm(cost, impressions) {
    if (!impressions) return 0;
    return (cost / impressions) * 1000;
  }

  function hookScore(avgWatchSeconds, thresholdSeconds = 3) {
    if (!thresholdSeconds) return 0;
    return Math.min(1, avgWatchSeconds / thresholdSeconds);
  }

  function retention(watchersReachedThreshold, totalViewers) {
    if (!totalViewers) return 0;
    return watchersReachedThreshold / totalViewers;
  }

  // ── Storage-backed convenience methods ─────────────────────────────────────

  /**
   * Compute all KPIs for a given filter (jobId / platform / time range).
   * @param {{ jobId?, platform?, from?, to? }} filter
   * @returns {object} All KPIs as a flat object
   */
  function calculate(filter = {}) {
    const impressionCount = storage.count({ ...filter, type: 'impression' });
    const clickCount = storage.count({ ...filter, type: 'click' });
    const watchSum = storage.sum({ ...filter, type: 'watch' });
    const watchCount = storage.count({ ...filter, type: 'watch' });
    const conversionCount = storage.count({ ...filter, type: 'conversion' });
    const revenueSum = storage.sum({ ...filter, type: 'revenue' });
    const costSum = storage.sum({ ...filter, type: 'cost' });
    const publishCount = storage.count({ ...filter, type: 'publish' });

    const avgWatchTime = watchCount > 0 ? watchSum / watchCount : 0;

    return {
      impressions: impressionCount,
      clicks: clickCount,
      watch_sessions: watchCount,
      total_watch_seconds: watchSum,
      avg_watch_seconds: avgWatchTime,
      conversions: conversionCount,
      publishes: publishCount,
      revenue: revenueSum,
      cost: costSum,

      // Derived
      ctr: ctr(clickCount, impressionCount),
      conversion_rate: conversionRate(conversionCount, clickCount),
      roi: roi(revenueSum, costSum),
      cpc: cpc(costSum, clickCount),
      cpm: cpm(costSum, impressionCount),
      hook_score: hookScore(avgWatchTime, 3),
      retention_30s: retention(
        storage.query({ ...filter, type: 'watch' }).filter((e) => (e.value || 0) >= 30).length,
        storage.count({ ...filter, type: 'impression' }),
      ),
    };
  }

  return {
    // Pure functions (testable without storage)
    ctr,
    conversionRate,
    roi,
    cpc,
    cpm,
    hookScore,
    retention,
    // Storage-backed
    calculate,
  };
}

export default createKpiCalculator;
