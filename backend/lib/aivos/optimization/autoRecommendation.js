/**
 * Auto Recommendation Engine – aggregates insights from all optimizers
 * and surfaces a ranked, actionable recommendation list.
 */
export function createAutoRecommendation(deps = {}) {
  const promptOptimizer = deps.promptOptimizer || null;
  const creativeOptimizer = deps.creativeOptimizer || null;
  const costOptimizer = deps.costOptimizer || null;
  const latencyOptimizer = deps.latencyOptimizer || null;
  const publishOptimizer = deps.publishOptimizer || null;

  const log = [];

  /**
   * Generate a consolidated recommendation report.
   * @param {{ platform?, taskType?, currentModel?, kpis? }} context
   * @returns {{ recommendations: object[], generatedAt: string }}
   */
  function generate(context = {}) {
    const recs = [];
    const ts = new Date().toISOString();

    // Prompt recommendations
    if (promptOptimizer) {
      const promptRec = promptOptimizer.select(context.skillId || 'default', context);
      if (promptRec.confidence >= 0.7) {
        recs.push({ category: 'prompt', priority: 'high', action: 'use_prompt', data: promptRec, confidence: promptRec.confidence });
      }
    }

    // Creative recommendations
    if (creativeOptimizer) {
      const creativeRec = creativeOptimizer.recommend(context);
      recs.push({ category: 'creative', priority: 'medium', action: 'use_template', data: creativeRec, confidence: creativeRec.confidence });
      const trending = creativeOptimizer.trendingStyle();
      if (trending) recs.push({ category: 'creative', priority: 'low', action: 'try_trending_style', data: trending, confidence: 0.6 });
    }

    // Cost recommendations
    if (costOptimizer) {
      const costRecs = costOptimizer.listRecommendations();
      for (const cr of costRecs.slice(-1)) {
        for (const s of (cr.suggestions || [])) {
          recs.push({ category: 'cost', priority: s.action === 'model_downgrade' ? 'high' : 'medium', action: s.action, data: s, confidence: 0.75 });
        }
      }
    }

    // Latency recommendations
    if (latencyOptimizer) {
      const { suggestions: latSugg } = latencyOptimizer.suggest(2000);
      for (const ls of latSugg) {
        recs.push({ category: 'latency', priority: 'medium', action: ls.action, data: ls, confidence: 0.7 });
      }
    }

    // Publish recommendations
    if (publishOptimizer) {
      const pubRec = publishOptimizer.recommend(context);
      recs.push({ category: 'publish', priority: 'medium', action: 'optimized_schedule', data: pubRec, confidence: pubRec.confidence });
    }

    // Sort by priority then confidence
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    recs.sort((a, b) => (priorityOrder[a.priority] - priorityOrder[b.priority]) || b.confidence - a.confidence);

    const result = { recommendations: recs, totalCount: recs.length, generatedAt: ts };
    log.push(result);
    return result;
  }

  function history() { return [...log]; }

  return { generate, history };
}

export default createAutoRecommendation;
