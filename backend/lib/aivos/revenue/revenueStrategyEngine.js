/**
 * Revenue Strategy Engine – selects the optimal growth strategy based on
 * current revenue health, market position, and growth objectives.
 *
 * Strategies:
 *   acquire     – maximise new customer acquisition (high CAC budget)
 *   retain      – focus on reducing churn and increasing LTV
 *   expand      – upsell/cross-sell to existing customers
 *   monetise    – launch new revenue streams
 *   consolidate – optimise margins before next growth phase
 */
export function createRevenueStrategyEngine(deps = {}) {
  const revenueDashboard = deps.revenueDashboard || null;
  const ltvPrediction    = deps.ltvPrediction    || null;
  const cacTracking      = deps.cacTracking      || null;

  const decisions = [];

  const STRATEGIES = {
    acquire:     { name: 'Customer Acquisition',  description: 'Invest in channels with lowest CAC and highest LTV potential' },
    retain:      { name: 'Retention Focus',       description: 'Reduce churn, increase NPS, expand within existing base' },
    expand:      { name: 'Revenue Expansion',     description: 'Upsell / cross-sell to high-LTV customers' },
    monetise:    { name: 'New Revenue Streams',   description: 'Launch adjacent services: AI credits, marketplace, B2B' },
    consolidate: { name: 'Margin Consolidation',  description: 'Optimise COGS and operating costs before next growth phase' },
  };

  /**
   * Select optimal strategy based on current health metrics.
   * @returns {{ strategy, name, description, rationale, confidence }}
   */
  function select(context = {}) {
    const summary    = revenueDashboard ? revenueDashboard.summary() : {};
    const avgLtv     = ltvPrediction ? ltvPrediction.avgLtv() : null;
    const cacData    = cacTracking ? cacTracking.calculate() : null;
    const churnRate  = summary.churnRate || 0;

    let strategy = 'acquire';
    let confidence = 0.6;
    let rationale  = 'Default: focus on growth';

    // High churn → retain first
    if (churnRate > 0.1) {
      strategy = 'retain'; confidence = 0.85; rationale = `Churn rate ${(churnRate * 100).toFixed(1)}% exceeds 10% threshold`;
    }
    // Low gross margin → consolidate
    else if (summary.grossMargin !== null && summary.grossMargin < 0.4) {
      strategy = 'consolidate'; confidence = 0.8; rationale = `Gross margin ${(summary.grossMargin * 100).toFixed(1)}% too low for aggressive growth`;
    }
    // Good LTV:CAC → expand existing customers
    else if (avgLtv !== null && cacData?.cac && (avgLtv / cacData.cac) > 5) {
      strategy = 'expand'; confidence = 0.75; rationale = `LTV:CAC ratio ${(avgLtv / cacData.cac).toFixed(1)}x — strong case for expansion`;
    }
    // Subscription ARR < 20% total → monetise with subscription
    else if (summary.totalRevenue > 0 && (summary.arr || 0) / summary.totalRevenue < 0.2) {
      strategy = 'monetise'; confidence = 0.7; rationale = 'Recurring revenue below 20% — diversify with subscription/AI services';
    }

    const selected = { strategy, ...STRATEGIES[strategy], rationale, confidence, ts: new Date().toISOString() };
    decisions.push(selected);
    return selected;
  }

  function listStrategies() { return Object.entries(STRATEGIES).map(([id, s]) => ({ id, ...s })); }
  function auditTrail()    { return [...decisions]; }

  return { select, listStrategies, auditTrail };
}

export default createRevenueStrategyEngine;
