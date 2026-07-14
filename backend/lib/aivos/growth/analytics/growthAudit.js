export function createGrowthAudit({ governance } = {}) {
  const local = [];

  return {
    record({ action, tenantId, diff } = {}) {
      const entry = {
        action,
        tenantId,
        diff: diff || {},
        at: new Date().toISOString(),
      };
      local.push(entry);
      governance?.audit?.({ action: `growth.${action}`, tenantId, metadata: diff });
      return entry;
    },

    list({ tenantId, limit = 50 } = {}) {
      return local
        .filter((e) => !tenantId || e.tenantId === tenantId)
        .slice(-limit);
    },

    summary() {
      return { total: local.length };
    },
  };
}
