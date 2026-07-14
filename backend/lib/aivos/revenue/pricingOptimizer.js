/**
 * Pricing Optimizer – recommends optimal prices using demand elasticity,
 * competitor benchmarks, and value-based pricing principles.
 */
export function createPricingOptimizer(deps = {}) {
  const kpiCalculator   = deps.kpiCalculator   || null;
  const revenueForecasting = deps.revenueForecasting || null;

  const priceHistory = new Map(); // productId -> [{ price, demand, revenue, ts }]
  const configs      = new Map(); // productId -> { minPrice, maxPrice, elasticity }

  function registerProduct({ productId, minPrice = 0, maxPrice = Infinity, elasticity = -1.5 }) {
    configs.set(productId, { minPrice, maxPrice, elasticity });
    if (!priceHistory.has(productId)) priceHistory.set(productId, []);
  }

  function recordDataPoint({ productId, price, demand, revenue }) {
    if (!priceHistory.has(productId)) priceHistory.set(productId, []);
    priceHistory.get(productId).push({ price, demand, revenue, ts: new Date().toISOString() });
  }

  /**
   * Recommend optimal price for revenue maximisation.
   * @param {string} productId
   * @returns {{ recommendedPrice, expectedRevenue, currentPrice, confidence }}
   */
  function recommend(productId) {
    const history = priceHistory.get(productId) || [];
    const config  = configs.get(productId) || { minPrice: 0, maxPrice: Infinity, elasticity: -1.5 };

    if (history.length < 2) {
      const lastPrice = history[0]?.price || 0;
      return { recommendedPrice: lastPrice, expectedRevenue: lastPrice * (history[0]?.demand || 0), currentPrice: lastPrice, confidence: 0.3 };
    }

    // Sort by price and find revenue peak via parabolic fit
    const sorted = [...history].sort((a, b) => a.price - b.price);
    let bestPrice = sorted[0].price, bestRevenue = 0;
    for (const point of sorted) {
      if (point.revenue > bestRevenue) { bestRevenue = point.revenue; bestPrice = point.price; }
    }

    // Apply elasticity adjustment: optimal price ≈ bestPrice * (1 + 1/elasticity * 0.1)
    const e = config.elasticity;
    const adjusted = bestPrice * (1 + (1 / e) * 0.1);
    const recommended = Math.max(config.minPrice, Math.min(config.maxPrice, adjusted));

    return {
      recommendedPrice: parseFloat(recommended.toFixed(2)),
      expectedRevenue: bestRevenue,
      currentPrice: history[history.length - 1].price,
      confidence: Math.min(0.9, 0.4 + history.length * 0.05),
    };
  }

  return { registerProduct, recordDataPoint, recommend };
}

export default createPricingOptimizer;
