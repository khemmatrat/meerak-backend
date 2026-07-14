/**
 * Cost Optimizer – minimises spend while meeting quality and output targets.
 *
 * Strategies:
 *  - model_downgrade: switch to cheaper model if quality allows
 *  - token_reduction: reduce max_tokens if outputs consistently under-length
 *  - batch_defer:     defer non-urgent jobs to off-peak pricing windows
 *  - platform_trim:   skip low-ROI publish platforms
 */
export function createCostOptimizer(deps = {}) {
  const kpiCalculator = deps.kpiCalculator || null;
  const modelOptimizer = deps.modelOptimizer || null;

  const recommendations = [];

  /**
   * Analyse spending and suggest cost reduction actions.
   * @param {{ totalCost, totalRevenue, jobCount, modelId?, platformCosts? }} report
   * @returns {{ suggestions: object[], estimatedSavings }}
   */
  function analyse(report = {}) {
    const { totalCost = 0, totalRevenue = 0, jobCount = 1, modelId = null, platformCosts = {} } = report;
    const roi = totalCost > 0 ? (totalRevenue - totalCost) / totalCost : 0;
    const costPerJob = jobCount > 0 ? totalCost / jobCount : 0;
    const suggestions = [];

    // ROI below 1x → recommend model downgrade
    if (roi < 1.0 && modelOptimizer && modelId) {
      const cheaper = modelOptimizer.select({ maxCostPerToken: 0.0005, minQuality: 0.7 });
      if (cheaper.modelId !== modelId) {
        suggestions.push({ action: 'model_downgrade', from: modelId, to: cheaper.modelId, reason: 'low_roi', estimatedSaving: costPerJob * 0.3 });
      }
    }

    // Trim platforms with negative contribution
    for (const [platform, cost] of Object.entries(platformCosts)) {
      if (cost > (totalRevenue * 0.4) / Math.max(1, Object.keys(platformCosts).length)) {
        suggestions.push({ action: 'platform_trim', platform, reason: 'high_cost_share', estimatedSaving: cost * 0.5 });
      }
    }

    const estimatedSavings = suggestions.reduce((s, r) => s + (r.estimatedSaving || 0), 0);
    const rec = { ts: new Date().toISOString(), roi, suggestions, estimatedSavings };
    recommendations.push(rec);
    return rec;
  }

  function listRecommendations() { return [...recommendations]; }

  return { analyse, listRecommendations };
}

export default createCostOptimizer;
