/**
 * Model Optimizer – selects the optimal AI model for a task given
 * quality, cost, and latency constraints.
 *
 * Uses policy learning stats + explicit constraint scoring.
 */
export function createModelOptimizer(deps = {}) {
  const modelEvaluation = deps.modelEvaluation || null;
  const policyLearning = deps.policyLearning || null;

  /** Model catalogue: modelId -> { tier, baseCostPerToken, avgLatencyMs, qualityEstimate } */
  const catalogue = new Map(Object.entries({
    'hermes3:3b':   { tier: 'fast',     baseCostPerToken: 0.0001, avgLatencyMs: 800,  qualityEstimate: 0.70 },
    'qwen2:7b':     { tier: 'balanced', baseCostPerToken: 0.0003, avgLatencyMs: 1500, qualityEstimate: 0.80 },
    'llama3:8b':    { tier: 'balanced', baseCostPerToken: 0.0004, avgLatencyMs: 1800, qualityEstimate: 0.82 },
    'gpt-4o-mini':  { tier: 'premium',  baseCostPerToken: 0.0010, avgLatencyMs: 2000, qualityEstimate: 0.92 },
    'claude-3':     { tier: 'premium',  baseCostPerToken: 0.0015, avgLatencyMs: 2500, qualityEstimate: 0.94 },
  }));

  /** Register or update a model in the catalogue. */
  function register(modelId, spec) {
    catalogue.set(modelId, { ...catalogue.get(modelId), ...spec });
  }

  /**
   * Select the best model for a task given constraints.
   * @param {{ taskType, maxCostPerToken?, maxLatencyMs?, minQuality?, preferTier? }} constraints
   * @returns {{ modelId, score, reason }}
   */
  function select(constraints = {}) {
    const { maxCostPerToken = Infinity, maxLatencyMs = Infinity, minQuality = 0, preferTier = null } = constraints;

    let candidates = [...catalogue.entries()]
      .map(([modelId, spec]) => ({ modelId, ...spec }))
      .filter((m) => m.baseCostPerToken <= maxCostPerToken && m.avgLatencyMs <= maxLatencyMs && m.qualityEstimate >= minQuality);

    if (candidates.length === 0) candidates = [...catalogue.values()];

    // Enrich with observed stats from model evaluation
    if (modelEvaluation) {
      candidates = candidates.map((c) => {
        const report = modelEvaluation.report(c.modelId);
        return { ...c, observedQuality: report?.avgQuality ?? c.qualityEstimate };
      });
    } else {
      candidates = candidates.map((c) => ({ ...c, observedQuality: c.qualityEstimate }));
    }

    // Score: quality * 0.5 + (1 - normalised cost) * 0.3 + (1 - normalised latency) * 0.2
    const maxCost = Math.max(...candidates.map((c) => c.baseCostPerToken), 1);
    const maxLat = Math.max(...candidates.map((c) => c.avgLatencyMs), 1);

    const scored = candidates.map((c) => ({
      ...c,
      score: c.observedQuality * 0.5 + (1 - c.baseCostPerToken / maxCost) * 0.3 + (1 - c.avgLatencyMs / maxLat) * 0.2,
    }));

    if (preferTier) scored.sort((a, b) => (a.tier === preferTier ? -1 : 1) - (b.tier === preferTier ? -1 : 1) || b.score - a.score);
    else scored.sort((a, b) => b.score - a.score);

    const best = scored[0];
    return { modelId: best.modelId, score: best.score, tier: best.tier, reason: 'multi_criteria_optimized' };
  }

  return { select, register, catalogue };
}

export default createModelOptimizer;
