/**
 * Revenue Dashboard – assembles a comprehensive revenue snapshot
 * from all revenue stream modules.
 */
export function createRevenueDashboard(deps = {}) {
  const profitEngine      = deps.profitEngine      || null;
  const subscriptionRevenue = deps.subscriptionRevenue || null;
  const marketplaceRevenue  = deps.marketplaceRevenue  || null;
  const aiServiceRevenue    = deps.aiServiceRevenue    || null;
  const revenueForecasting  = deps.revenueForecasting  || null;
  const cacTracking         = deps.cacTracking         || null;
  const roasCalculator      = deps.roasCalculator      || null;

  /**
   * Return a full revenue snapshot.
   * @param {{ since? }} opts
   */
  function snapshot(opts = {}) {
    const ts = new Date().toISOString();

    const profit      = profitEngine ? profitEngine.calculate(opts) : null;
    const subscription = subscriptionRevenue ? subscriptionRevenue.metrics() : null;
    const marketplace  = marketplaceRevenue  ? marketplaceRevenue.metrics(opts) : null;
    const aiService    = aiServiceRevenue    ? aiServiceRevenue.revenue(opts) : null;
    const forecast     = revenueForecasting  ? revenueForecasting.forecast({ periods: 3 }) : null;
    const cac          = cacTracking         ? cacTracking.calculate() : null;
    const roas         = roasCalculator      ? roasCalculator.calculate() : null;

    const totalRevenue =
      (profit?.grossRevenue || 0) +
      (subscription?.mrr    || 0) +
      (marketplace?.totalNetRevenue || 0) +
      (aiService?.totalAmount || 0);

    return {
      ts,
      totalRevenue,
      profit,
      subscription,
      marketplace,
      aiService,
      forecast,
      cac,
      roas,
    };
  }

  /**
   * Summarise top-line KPIs in a concise object.
   */
  function summary() {
    const s = snapshot();
    return {
      totalRevenue:  s.totalRevenue,
      mrr:           s.subscription?.mrr || 0,
      arr:           s.subscription?.arr || 0,
      gmv:           s.marketplace?.totalGmv || 0,
      grossMargin:   s.profit?.grossMargin || null,
      netMargin:     s.profit?.netMargin   || null,
      forecastNext:  s.forecast?.forecasts?.[0]?.value || null,
      roas:          s.roas?.roas || null,
      cac:           s.cac?.cac  || null,
    };
  }

  return { snapshot, summary };
}

export default createRevenueDashboard;
