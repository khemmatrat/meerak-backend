export function createCostDashboard({ store }) {
  return {
    async recordEstimate({ jobId, userId, taskType, modelSlot, estimatedCost }) {
      return store.appendCostLedger({
        job_id: jobId,
        user_id: userId,
        task_type: taskType,
        model_slot: modelSlot,
        estimated_cost: estimatedCost,
      });
    },
    async getSummary({ userId } = {}) {
      if (store.kind === 'memory') {
        const rows = store._tables.costLedger.filter((r) => !userId || r.user_id === userId);
        const total = rows.reduce((sum, r) => sum + Number(r.estimated_cost || 0), 0);
        return { totalEstimated: total, entries: rows.length };
      }
      return { totalEstimated: 0, entries: 0 };
    },
  };
}
