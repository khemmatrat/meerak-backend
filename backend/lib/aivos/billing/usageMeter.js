export function createUsageMeter({ costDashboard, getPluginProfile } = {}) {
  return {
    getMultiplier(pluginId) {
      const profile = getPluginProfile?.(pluginId) || {};
      return Number(profile.credit_multiplier ?? 1);
    },

    async meter({ jobId, userId, pluginId, baseCredits = 1 } = {}) {
      const multiplier = this.getMultiplier(pluginId);
      const charged = baseCredits * multiplier;
      if (costDashboard?.recordEstimate) {
        await costDashboard.recordEstimate({
          jobId,
          userId,
          taskType:     'plugin_usage',
          modelSlot:    pluginId,
          estimatedCost: charged,
        });
      }
      return { jobId, userId, pluginId, baseCredits, multiplier, charged };
    },

    getJobUsage(store, jobId) {
      if (store?.kind !== 'memory') return { entries: [], total: 0 };
      const entries = store._tables.costLedger.filter((r) => r.job_id === jobId);
      const total = entries.reduce((s, r) => s + Number(r.estimated_cost || 0), 0);
      return { entries, total };
    },
  };
}
