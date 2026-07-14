export function createAgentMetrics() {
  const runs = [];

  return {
    recordRun({ runId, agents = [], totalLatencyMs = 0, cost = 0, success = true }) {
      const entry = {
        runId,
        agents: agents.map((a) => ({ ...a })),
        totalLatencyMs,
        cost,
        success,
        at: new Date().toISOString(),
      };
      runs.push(entry);
      return entry;
    },

    getMetrics({ runId } = {}) {
      const scoped = runId ? runs.filter((r) => r.runId === runId) : runs;
      const total = scoped.length;
      const successes = scoped.filter((r) => r.success).length;
      const latencySum = scoped.reduce((s, r) => s + (r.totalLatencyMs || 0), 0);
      const costSum = scoped.reduce((s, r) => s + (r.cost || 0), 0);
      const agentContrib = {};
      for (const run of scoped) {
        for (const a of run.agents || []) {
          if (!agentContrib[a.agentId]) agentContrib[a.agentId] = { count: 0, latencyMs: 0 };
          agentContrib[a.agentId].count += 1;
          agentContrib[a.agentId].latencyMs += a.latencyMs || 0;
        }
      }
      return {
        totalRuns:     total,
        successRate:   total ? successes / total : 0,
        avgLatencyMs:  total ? latencySum / total : 0,
        totalCost:     costSum,
        agentContrib,
        runs:          scoped.map((r) => ({ ...r })),
      };
    },
  };
}
