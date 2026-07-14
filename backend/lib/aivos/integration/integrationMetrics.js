export function createIntegrationMetrics() {
  const events = [];

  return {
    record({ connectorId, tenantId, action, success = true, latencyMs = 0, retries = 0 }) {
      events.push({ connectorId, tenantId, action, success, latencyMs, retries, at: new Date().toISOString() });
      return { connectorId, action, success };
    },

    getStats({ connectorId, tenantId, provider } = {}) {
      let scoped = events;
      if (connectorId) scoped = scoped.filter((e) => e.connectorId === connectorId);
      if (tenantId) scoped = scoped.filter((e) => e.tenantId === tenantId);
      const total = scoped.length;
      const successes = scoped.filter((e) => e.success).length;
      const errors = total - successes;
      const latencySum = scoped.reduce((s, e) => s + e.latencyMs, 0);
      const retrySum = scoped.reduce((s, e) => s + e.retries, 0);
      const byProvider = {};
      for (const e of scoped) byProvider[e.connectorId] = (byProvider[e.connectorId] || 0) + 1;
      return {
        totalEvents: total,
        successRate: total ? successes / total : 0,
        errorRate: total ? errors / total : 0,
        avgLatencyMs: total ? latencySum / total : 0,
        totalRetries: retrySum,
        availability: total ? successes / total : 1,
        byConnector: byProvider,
      };
    },
  };
}
