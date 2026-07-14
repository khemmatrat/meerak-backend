export function createTenantMetrics() {
  const events = [];

  return {
    record({ tenantId, action, success = true, latencyMs = 0 }) {
      events.push({ tenantId, action, success, latencyMs, at: new Date().toISOString() });
      return { tenantId, action, success };
    },

    getStats({ tenantId } = {}) {
      const scoped = events.filter((e) => !tenantId || e.tenantId === tenantId);
      const total = scoped.length;
      const successes = scoped.filter((e) => e.success).length;
      const latencySum = scoped.reduce((s, e) => s + e.latencyMs, 0);
      const byAction = {};
      for (const e of scoped) byAction[e.action] = (byAction[e.action] || 0) + 1;
      return {
        totalEvents: total,
        successRate: total ? successes / total : 0,
        avgLatencyMs: total ? latencySum / total : 0,
        byAction,
      };
    },
  };
}
