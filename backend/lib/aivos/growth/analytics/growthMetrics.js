export function createGrowthMetrics() {
  const counters = new Map();

  function key(tenantId, action) {
    return `${tenantId || 'global'}::${action}`;
  }

  return {
    record({ tenantId, action, success = true, latencyMs } = {}) {
      const k = key(tenantId, action);
      const row = counters.get(k) || { count: 0, success: 0, failure: 0, latencyMs: [] };
      row.count += 1;
      if (success) row.success += 1;
      else row.failure += 1;
      if (latencyMs != null) row.latencyMs.push(latencyMs);
      counters.set(k, row);
    },

    snapshot({ tenantId } = {}) {
      const out = {};
      for (const [k, v] of counters.entries()) {
        if (tenantId && !k.startsWith(`${tenantId}::`)) continue;
        const action = k.split('::').slice(1).join('::');
        out[action] = { ...v };
      }
      return out;
    },

    reset() {
      counters.clear();
    },
  };
}
