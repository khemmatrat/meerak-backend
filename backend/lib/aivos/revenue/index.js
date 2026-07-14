import { isRevenueEnabled, defaultTakeRate, revenueCurrency } from './config.js';
import { createRevenueAttribution }  from './revenueAttribution.js';
import { createRevenueForecasting }  from './revenueForecasting.js';
import { createLtvPrediction }       from './ltvPrediction.js';
import { createCacTracking }         from './cacTracking.js';
import { createRoasCalculator }      from './roasCalculator.js';
import { createProfitEngine }        from './profitEngine.js';
import { createPricingOptimizer }    from './pricingOptimizer.js';
import { createCommissionEngine }    from './commissionEngine.js';
import { createSubscriptionRevenue } from './subscriptionRevenue.js';
import { createMarketplaceRevenue }  from './marketplaceRevenue.js';
import { createMerchantRevenue }     from './merchantRevenue.js';
import { createAiServiceRevenue }    from './aiServiceRevenue.js';
import { createRevenueDashboard }    from './revenueDashboard.js';
import { createRevenueRecommendation } from './revenueRecommendation.js';
import { createRevenueStrategyEngine } from './revenueStrategyEngine.js';

/**
 * Create the full Revenue Growth Engine.
 *
 * Reuses: Runtime (events), Analytics (KPI), Learning (signals),
 *         Optimization (budget), Automation (campaigns).
 *
 * No direct Kernel access. No Frontend. No new Runtime.
 *
 * @param {object} deps
 * @returns {RevenueGrowthEngine}
 */
export function createRevenueGrowthEngine(deps = {}) {
  if (!isRevenueEnabled()) {
    return {
      enabled: false,
      attribution: null, forecasting: null, ltv: null, cac: null,
      roas: null, profit: null, pricing: null, commission: null,
      subscription: null, marketplace: null, merchant: null, aiService: null,
      dashboard: null, recommendations: null, strategy: null,
    };
  }

  const currency = revenueCurrency();
  const takeRate = defaultTakeRate;

  // ── Layer 1: primitive trackers ───────────────────────────────────────────
  const attribution  = createRevenueAttribution();
  const forecasting  = createRevenueForecasting();
  const ltv          = createLtvPrediction();
  const cac          = createCacTracking();
  const roas         = createRoasCalculator();
  const profit       = createProfitEngine();
  const commission   = createCommissionEngine({ defaultTakeRate: takeRate });
  const subscription = createSubscriptionRevenue();
  const marketplace  = createMarketplaceRevenue({ defaultTakeRate: takeRate });
  const merchant     = createMerchantRevenue({ commissionEngine: commission });
  const aiService    = createAiServiceRevenue();

  // ── Layer 2: pricing optimizer (may use forecasting) ─────────────────────
  const pricing = createPricingOptimizer({
    revenueForecasting: forecasting,
    kpiCalculator: deps.kpiCalculator || null,
  });

  // ── Layer 3: dashboard + recommendations + strategy ───────────────────────
  const dashboard = createRevenueDashboard({
    profitEngine:        profit,
    subscriptionRevenue: subscription,
    marketplaceRevenue:  marketplace,
    aiServiceRevenue:    aiService,
    revenueForecasting:  forecasting,
    cacTracking:         cac,
    roasCalculator:      roas,
  });

  const recommendations = createRevenueRecommendation({
    revenueDashboard:   dashboard,
    ltvPrediction:      ltv,
    cacTracking:        cac,
    revenueForecasting: forecasting,
  });

  const strategy = createRevenueStrategyEngine({
    revenueDashboard: dashboard,
    ltvPrediction:    ltv,
    cacTracking:      cac,
  });

  /**
   * Consume an Analytics KPI update to hydrate revenue engine.
   * Called by Runtime after analytics cycle.
   */
  function consumeKpiUpdate(kpis = {}) {
    if (kpis.revenue)   profit.recordRevenue({ stream: 'analytics', amount: kpis.revenue });
    if (kpis.adSpend && kpis.revenue) roas.record({ channel: 'analytics', adSpend: kpis.adSpend, attributedRevenue: kpis.revenue });
    if (kpis.revenue)   forecasting.record(`kpi_${Date.now()}`, kpis.revenue);
  }

  /**
   * Run a full revenue growth cycle:
   * 1. Generate recommendations
   * 2. Select optimal strategy
   * 3. Return consolidated report
   */
  function runCycle(context = {}) {
    const recs     = recommendations.generate(context);
    const selected = strategy.select(context);
    const snap     = dashboard.snapshot();
    return { cycle: new Date().toISOString(), currency, snapshot: snap, recommendations: recs, strategy: selected };
  }

  return {
    enabled: true, currency,
    // streams
    attribution, forecasting, ltv, cac, roas,
    profit, pricing, commission,
    subscription, marketplace, merchant, aiService,
    // insight layer
    dashboard, recommendations, strategy,
    // integration
    consumeKpiUpdate, runCycle,
  };
}

export default createRevenueGrowthEngine;
