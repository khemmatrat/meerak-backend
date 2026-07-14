export function createTenantAudit({ governance } = {}) {
  const log = [];

  return {
    async record({ action, tenantId, diff = {} } = {}) {
      const row = { action, tenant_id: tenantId, diff, at: new Date().toISOString() };
      log.push(row);
      if (governance?.enabled && governance.auditVersionChange) {
        await governance.auditVersionChange({
          entityType: 'saas_tenant',
          entityId: tenantId,
          action,
          diff,
        }).catch(() => {});
      }
      return row;
    },

    list({ tenantId } = {}) {
      return log.filter((r) => !tenantId || r.tenant_id === tenantId);
    },

    summary() {
      return { total: log.length, actions: [...new Set(log.map((r) => r.action))] };
    },
  };
}
