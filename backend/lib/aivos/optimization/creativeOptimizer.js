/**
 * Creative Optimizer – recommends best template and creative style
 * based on creative learning rankings and trend detection.
 */
export function createCreativeOptimizer(deps = {}) {
  const creativeLearning = deps.creativeLearning || null;
  const trendDetection = deps.trendDetection || null;

  const overrides = new Map();

  /**
   * Recommend the best template for a given context.
   * @param {{ platform?, audience?, taskType? }} context
   * @returns {{ templateId, styleId, confidence, reason }}
   */
  function recommend(context = {}) {
    if (overrides.has('template')) return overrides.get('template');

    if (creativeLearning) {
      const ranked = creativeLearning.rankTemplates(3);
      if (ranked.length > 0 && ranked[0].sampleSize >= 2) {
        return { templateId: ranked[0].templateId, styleId: null, confidence: Math.min(ranked[0].composite, 1), reason: 'learning_ranked' };
      }
    }

    // Platform-specific defaults
    const platformDefaults = { tiktok: 'vertical', youtube: 'default', instagram: 'square', facebook: 'default' };
    const templateId = platformDefaults[context.platform] || 'default';
    return { templateId, styleId: null, confidence: 0.5, reason: 'platform_default' };
  }

  /** Recommend rising creative style based on trend detection. */
  function trendingStyle() {
    if (!trendDetection) return null;
    const rising = trendDetection.rising();
    const relevant = rising.find((t) => t.metric.startsWith('style.') || t.metric.startsWith('template.'));
    if (relevant) return { metric: relevant.metric, slope: relevant.slope };
    return null;
  }

  function override(key, value) { overrides.set(key, value); }

  return { recommend, trendingStyle, override };
}

export default createCreativeOptimizer;
