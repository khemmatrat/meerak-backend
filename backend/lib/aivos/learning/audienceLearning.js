import { randomUUID } from 'crypto';

/**
 * Audience Learning – learns what content resonates with different audience segments.
 * Stores per-platform, per-segment performance signals.
 */
export function createAudienceLearning(deps = {}) {
  /** segmentId -> { kpiSamples[], topTemplates, topPrompts } */
  const segments = new Map();

  function record({ segmentId, platform, templateId = null, kpis = {}, jobId }) {
    if (!segments.has(segmentId)) {
      segments.set(segmentId, { segmentId, samples: [], topTemplates: {}, topPrompts: {} });
    }
    const seg = segments.get(segmentId);
    seg.samples.push({ jobId, platform, templateId, kpis, ts: new Date().toISOString() });
    if (templateId) {
      if (!seg.topTemplates[templateId]) seg.topTemplates[templateId] = [];
      seg.topTemplates[templateId].push(kpis.hook_score || 0);
    }
    return seg;
  }

  function getInsights(segmentId) {
    const seg = segments.get(segmentId);
    if (!seg) return null;
    const topTemplate = Object.entries(seg.topTemplates)
      .map(([t, scores]) => ({ templateId: t, avgScore: scores.reduce((s, v) => s + v, 0) / scores.length }))
      .sort((a, b) => b.avgScore - a.avgScore)[0] || null;
    return { segmentId, sampleCount: seg.samples.length, topTemplate };
  }

  function listSegments() { return [...segments.keys()]; }

  return { record, getInsights, listSegments };
}

export default createAudienceLearning;
