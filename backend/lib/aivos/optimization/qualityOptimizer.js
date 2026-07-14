/**
 * Quality Optimizer – maximises content quality score within cost and latency budgets.
 *
 * Recommends quality-enhancing actions: prompt enrichment, higher-tier model,
 * additional review passes, or caption/thumbnail improvements.
 */
export function createQualityOptimizer(deps = {}) {
  const qualityLearning = deps.qualityLearning || null;
  const modelOptimizer = deps.modelOptimizer || null;

  const history = [];

  /**
   * Recommend actions to improve quality for a given job context.
   * @param {{ currentQuality, budget?, targetQuality?, taskType? }} params
   * @returns {{ recommendations: object[], projectedQuality, confidence }}
   */
  function recommend({ currentQuality = 0, budget = Infinity, targetQuality = 0.8, taskType = 'writing' } = {}) {
    const gap = targetQuality - currentQuality;
    const recs = [];

    if (gap <= 0) return { recommendations: [], projectedQuality: currentQuality, confidence: 1.0 };

    // Upgrade model if quality gap is significant
    if (gap > 0.2 && modelOptimizer) {
      const premium = modelOptimizer.select({ minQuality: 0.85, maxCostPerToken: budget });
      recs.push({ action: 'upgrade_model', modelId: premium.modelId, expectedGain: 0.1, cost: premium.score });
    }

    // Suggest caption enrichment for watch time quality
    if (currentQuality < 0.6) {
      recs.push({ action: 'enrich_captions', expectedGain: 0.05, cost: 0 });
    }

    // Suggest prompt enrichment
    if (gap > 0.1) {
      recs.push({ action: 'enrich_prompt', expectedGain: 0.08, cost: 0.001 });
    }

    const projectedQuality = Math.min(1.0, currentQuality + recs.reduce((s, r) => s + r.expectedGain, 0));
    const result = { recommendations: recs, projectedQuality, confidence: 0.7 };
    history.push({ ts: new Date().toISOString(), input: { currentQuality, targetQuality }, ...result });
    return result;
  }

  /**
   * Check if quality-ctr correlation warrants threshold adjustment.
   */
  function calibrate() {
    if (!qualityLearning) return null;
    return qualityLearning.suggestThreshold();
  }

  return { recommend, calibrate };
}

export default createQualityOptimizer;
