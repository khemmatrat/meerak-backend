/**
 * Template Optimizer – tunes template parameters (aspect ratio, resolution,
 * intro/outro toggle, branding overlay) for maximum engagement.
 *
 * Parameters are adjusted using gradient-free hill climbing over observed KPIs.
 */
export function createTemplateOptimizer(deps = {}) {
  const creativeLearning = deps.creativeLearning || null;

  /** Current parameter configuration per templateId. */
  const configs = new Map();

  const DEFAULTS = {
    aspectRatio: '16:9',
    introDuration: 3,
    outroDuration: 3,
    watermark: false,
    captionStyle: 'default',
  };

  function getConfig(templateId) {
    return configs.get(templateId) || { ...DEFAULTS, templateId };
  }

  /**
   * Suggest parameter adjustments for a template based on KPI deltas.
   * @param {string} templateId
   * @param {{ ctr, avg_watch_seconds, hook_score, retention_30s }} kpis
   * @returns {{ templateId, suggestions: object, confidence }}
   */
  function suggest(templateId, kpis = {}) {
    const current = getConfig(templateId);
    const suggestions = {};

    // Low hook score → shorter intro
    if ((kpis.hook_score || 0) < 0.3 && current.introDuration > 2) {
      suggestions.introDuration = Math.max(1, current.introDuration - 1);
    }

    // High retention → try enabling captions if not set
    if ((kpis.retention_30s || 0) > 0.5 && current.captionStyle === 'default') {
      suggestions.captionStyle = 'bold_white';
    }

    // Low avg watch time → try shorter outro
    if ((kpis.avg_watch_seconds || 0) < 20 && current.outroDuration > 2) {
      suggestions.outroDuration = Math.max(1, current.outroDuration - 1);
    }

    const confidence = Object.keys(suggestions).length > 0 ? 0.7 : 0.0;
    return { templateId, current, suggestions, confidence };
  }

  /** Apply a suggestion to a template config. */
  function apply(templateId, suggestions = {}) {
    const current = getConfig(templateId);
    const updated = { ...current, ...suggestions, updatedAt: new Date().toISOString() };
    configs.set(templateId, updated);
    return updated;
  }

  return { getConfig, suggest, apply };
}

export default createTemplateOptimizer;
