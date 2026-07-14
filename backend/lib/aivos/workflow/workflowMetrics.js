export function createWorkflowMetrics() {
  const runs = [];
  const popularity = new Map();

  return {
    record({ workflowId, success, latencyMs = 0, cost = 0 }) {
      runs.push({ workflowId, success, latencyMs, cost, at: new Date().toISOString() });
      popularity.set(workflowId, (popularity.get(workflowId) || 0) + 1);
      return { workflowId, success, latencyMs, cost };
    },

    getMetrics({ workflowId } = {}) {
      const scoped = workflowId ? runs.filter((r) => r.workflowId === workflowId) : runs;
      const total = scoped.length;
      const successes = scoped.filter((r) => r.success).length;
      const failures = total - successes;
      const latencySum = scoped.reduce((s, r) => s + r.latencyMs, 0);
      const costSum = scoped.reduce((s, r) => s + r.cost, 0);
      const templatePopularity = Object.fromEntries(popularity.entries());
      return {
        executionCount: total,
        successRate:    total ? successes / total : 0,
        failureRate:    total ? failures / total : 0,
        avgLatencyMs:   total ? latencySum / total : 0,
        totalCost:      costSum,
        templatePopularity,
      };
    },
  };
}
