/**
 * Revenue Recommendation – generates actionable growth recommendations
 * based on revenue KPIs, forecasts, and unit economics.
 */
export function createRevenueRecommendation(deps = {}) {
  const revenueDashboard  = deps.revenueDashboard  || null;
  const ltvPrediction     = deps.ltvPrediction     || null;
  const cacTracking       = deps.cacTracking       || null;
  const revenueForecasting = deps.revenueForecasting || null;
  const history           = [];

  /**
   * Generate prioritised revenue recommendations.
   * @returns {{ recommendations: object[], generatedAt: string }}
   */
  function generate(context = {}) {
    const recs = [];
    const ts   = new Date().toISOString();

    const summary = revenueDashboard ? revenueDashboard.summary() : {};
    const avgLtv  = ltvPrediction ? ltvPrediction.avgLtv() : null;
    const cacData = cacTracking ? cacTracking.calculate() : null;

    // LTV:CAC ratio check
    if (avgLtv !== null && cacData?.cac) {
      const ltvCacRatio = avgLtv / cacData.cac;
      if (ltvCacRatio < 3) {
        recs.push({ priority: 'high', category: 'unit_economics', action: 'improve_ltv_cac_ratio', current: ltvCacRatio, target: 3, reason: `LTV:CAC is ${ltvCacRatio.toFixed(2)}x (target: 3x)` });
      }
    }

    // Low gross margin
    if (summary.grossMargin !== null && summary.grossMargin < 0.5) {
      recs.push({ priority: 'high', category: 'margin', action: 'reduce_cogs', current: summary.grossMargin, target: 0.6, reason: 'Gross margin below 50%' });
    }

    // ROAS below target
    if (summary.roas !== null && summary.roas < 3) {
      recs.push({ priority: 'medium', category: 'performance_marketing', action: 'optimise_ad_spend', current: summary.roas, target: 4, reason: `ROAS ${summary.roas.toFixed(2)}x below 3x threshold` });
    }

    // Forecast growth opportunity
    if (revenueForecasting && summary.forecastNext !== null && summary.totalRevenue > 0) {
      const growthRate = (summary.forecastNext - summary.totalRevenue) / summary.totalRevenue;
      if (growthRate < 0.05) {
        recs.push({ priority: 'medium', category: 'growth', action: 'diversify_revenue_streams', current: growthRate, target: 0.1, reason: 'Forecasted growth below 5%' });
      }
    }

    // Subscription expansion
    if (summary.mrr > 0 && summary.arr < summary.totalRevenue * 0.3) {
      recs.push({ priority: 'low', category: 'recurring_revenue', action: 'expand_subscription_base', reason: 'Subscription ARR < 30% of total revenue' });
    }

    recs.sort((a, b) => { const p = { high: 0, medium: 1, low: 2 }; return p[a.priority] - p[b.priority]; });
    const result = { recommendations: recs, totalCount: recs.length, generatedAt: ts };
    history.push(result);
    return result;
  }

  function getHistory() { return [...history]; }

  return { generate, getHistory };
}

export default createRevenueRecommendation;
