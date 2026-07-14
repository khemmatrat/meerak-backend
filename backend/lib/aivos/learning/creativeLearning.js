import { randomUUID } from 'crypto';

/**
 * Creative Learning – learns which templates, styles, and formats
 * produce the best engagement (CTR, watch time, completion, hook score).
 */
export function createCreativeLearning(deps = {}) {
  /** templateId -> PerformanceEntry[] */
  const templatePerf = new Map();
  /** styleId -> PerformanceEntry[] */
  const stylePerf = new Map();
  /** Ranked recommendations */
  const recommendations = [];

  function _avg(entries, field) {
    if (!entries.length) return 0;
    return entries.reduce((s, e) => s + (e[field] || 0), 0) / entries.length;
  }

  /**
   * Record template/style performance from a published job's KPIs.
   */
  function record({ templateId = null, styleId = null, kpis = {}, jobId }) {
    const entry = { id: randomUUID(), jobId, kpis, ts: new Date().toISOString() };
    if (templateId) {
      if (!templatePerf.has(templateId)) templatePerf.set(templateId, []);
      templatePerf.get(templateId).push({ ...entry, templateId });
    }
    if (styleId) {
      if (!stylePerf.has(styleId)) stylePerf.set(styleId, []);
      stylePerf.get(styleId).push({ ...entry, styleId });
    }
  }

  /**
   * Evaluate a template's performance for feedback loop.
   * Returns a proposal if the template ranks well or poorly.
   */
  function evaluateTemplate(templateId, kpis = {}) {
    record({ templateId, kpis, jobId: 'eval' });
    const entries = templatePerf.get(templateId) || [];
    if (entries.length < 2) return null;

    const avgCtr = _avg(entries.map((e) => e.kpis), 'ctr');
    const avgHook = _avg(entries.map((e) => e.kpis), 'hook_score');
    const composite = avgCtr * 0.4 + avgHook * 0.6;

    if (composite > 0.6) {
      return { action: 'promote', templateId, composite, reason: 'high_engagement' };
    }
    if (composite < 0.2 && entries.length >= 5) {
      return { action: 'deprecate', templateId, composite, reason: 'low_engagement' };
    }
    return null;
  }

  /** Rank templates by composite engagement score. */
  function rankTemplates(n = 5) {
    const ranked = [];
    for (const [templateId, entries] of templatePerf) {
      const avgCtr = _avg(entries.map((e) => e.kpis), 'ctr');
      const avgHook = _avg(entries.map((e) => e.kpis), 'hook_score');
      ranked.push({ templateId, composite: avgCtr * 0.4 + avgHook * 0.6, sampleSize: entries.length });
    }
    return ranked.sort((a, b) => b.composite - a.composite).slice(0, n);
  }

  /** Rank styles by composite score. */
  function rankStyles(n = 5) {
    const ranked = [];
    for (const [styleId, entries] of stylePerf) {
      const avgCtr = _avg(entries.map((e) => e.kpis), 'ctr');
      const avgWatch = _avg(entries.map((e) => e.kpis), 'avg_watch_seconds');
      ranked.push({ styleId, composite: avgCtr * 0.5 + Math.min(avgWatch / 60, 1) * 0.5, sampleSize: entries.length });
    }
    return ranked.sort((a, b) => b.composite - a.composite).slice(0, n);
  }

  return { record, evaluateTemplate, rankTemplates, rankStyles };
}

export default createCreativeLearning;
