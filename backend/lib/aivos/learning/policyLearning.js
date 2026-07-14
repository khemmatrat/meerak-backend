import { randomUUID } from 'crypto';

/**
 * Policy Learning – observes model selection outcomes and proposes
 * policy rule adjustments (model tier, token budget, fallback order).
 */
export function createPolicyLearning(deps = {}) {
  /** modelId -> { success, failure, avgLatency, avgCost, avgQuality } */
  const modelStats = new Map();
  const proposals = [];

  function record({ modelId, taskType, success, latencyMs = 0, cost = 0, qualityScore = 0 }) {
    if (!modelStats.has(modelId)) {
      modelStats.set(modelId, { modelId, success: 0, failure: 0, totalLatency: 0, totalCost: 0, totalQuality: 0, count: 0 });
    }
    const s = modelStats.get(modelId);
    s.count += 1;
    if (success) s.success += 1; else s.failure += 1;
    s.totalLatency += latencyMs;
    s.totalCost += cost;
    s.totalQuality += qualityScore;
    return s;
  }

  function getStats(modelId) {
    const s = modelStats.get(modelId);
    if (!s) return null;
    return {
      modelId: s.modelId,
      successRate: s.count ? s.success / s.count : 0,
      avgLatencyMs: s.count ? s.totalLatency / s.count : 0,
      avgCost: s.count ? s.totalCost / s.count : 0,
      avgQuality: s.count ? s.totalQuality / s.count : 0,
      count: s.count,
    };
  }

  function proposeAdjustment(taskType) {
    const stats = [...modelStats.values()].map((s) => getStats(s.modelId));
    const best = stats.filter((s) => s.successRate > 0.8 && s.avgQuality > 0.7)
      .sort((a, b) => b.avgQuality - a.avgQuality)[0];
    if (!best) return null;
    const p = { id: randomUUID(), taskType, action: 'prefer_model', modelId: best.modelId, reason: 'high_quality_success', status: 'pending', created_at: new Date().toISOString() };
    proposals.push(p);
    return p;
  }

  function listStats() { return [...modelStats.values()].map((s) => getStats(s.modelId)); }
  function listProposals() { return [...proposals]; }

  return { record, getStats, proposeAdjustment, listStats, listProposals };
}

export default createPolicyLearning;
