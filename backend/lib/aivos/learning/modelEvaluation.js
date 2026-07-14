import { randomUUID } from 'crypto';

/**
 * Model Evaluation – tracks output quality per model over time.
 * Feeds into Policy Learning to adjust model selection priorities.
 */
export function createModelEvaluation(deps = {}) {
  const evals = [];

  function evaluate({ modelId, jobId, taskType, qualityScore, latencyMs = 0, cost = 0, approved = true }) {
    const entry = { id: randomUUID(), modelId, jobId, taskType, qualityScore, latencyMs, cost, approved, ts: new Date().toISOString() };
    evals.push(entry);
    return entry;
  }

  function report(modelId) {
    const rows = evals.filter((e) => e.modelId === modelId);
    if (!rows.length) return null;
    const avgQuality = rows.reduce((s, e) => s + (e.qualityScore || 0), 0) / rows.length;
    const approvalRate = rows.filter((e) => e.approved).length / rows.length;
    return { modelId, count: rows.length, avgQuality, approvalRate };
  }

  function list(filter = {}) {
    return evals.filter((e) => {
      if (filter.modelId && e.modelId !== filter.modelId) return false;
      if (filter.taskType && e.taskType !== filter.taskType) return false;
      return true;
    });
  }

  return { evaluate, report, list };
}

export default createModelEvaluation;
