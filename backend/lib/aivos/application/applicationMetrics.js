export function createApplicationMetrics() {
  const events = [];

  return {
    record({ appId, tenantId, action, success = true, latencyMs = 0 }) {
      events.push({ appId, tenantId, action, success, latencyMs, at: new Date().toISOString() });
      return { appId, action, success };
    },

    getStats({ appId, tenantId } = {}) {
      const scoped = events.filter((e) =>
        (!appId || e.appId === appId) && (!tenantId || e.tenantId === tenantId));
      const total = scoped.length;
      const successes = scoped.filter((e) => e.success).length;
      const latencySum = scoped.reduce((s, e) => s + e.latencyMs, 0);
      const popularity = {};
      for (const e of scoped) popularity[e.appId] = (popularity[e.appId] || 0) + 1;
      return {
        totalEvents: total,
        successRate: total ? successes / total : 0,
        avgLatencyMs: total ? latencySum / total : 0,
        popularity,
      };
    },
  };
}
