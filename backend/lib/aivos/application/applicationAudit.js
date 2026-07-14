export function createApplicationAudit({ governance } = {}) {
  const log = [];

  return {
    async record({ action, appId, tenantId = 'default', diff = {} } = {}) {
      const row = { action, app_id: appId, tenant_id: tenantId, diff, at: new Date().toISOString() };
      log.push(row);
      if (governance?.enabled && governance.auditVersionChange) {
        await governance.auditVersionChange({
          entityType: 'business_application',
          entityId:   appId,
          action,
          diff:       { ...diff, tenantId },
        }).catch(() => {});
      }
      return row;
    },

    list({ appId, tenantId } = {}) {
      return log.filter((r) =>
        (!appId || r.app_id === appId) && (!tenantId || r.tenant_id === tenantId));
    },

    summary() {
      return { total: log.length, actions: [...new Set(log.map((r) => r.action))] };
    },
  };
}
