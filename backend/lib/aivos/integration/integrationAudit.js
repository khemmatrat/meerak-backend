export function createIntegrationAudit({ governance } = {}) {
  const log = [];

  return {
    async record({ action, connectorId, tenantId = 'default', diff = {} } = {}) {
      const row = { action, connector_id: connectorId, tenant_id: tenantId, diff, at: new Date().toISOString() };
      log.push(row);
      if (governance?.enabled && governance.auditVersionChange) {
        await governance.auditVersionChange({
          entityType: 'enterprise_connector',
          entityId: connectorId,
          action,
          diff: { ...diff, tenantId },
        }).catch(() => {});
      }
      return row;
    },

    list({ connectorId, tenantId } = {}) {
      return log.filter((r) =>
        (!connectorId || r.connector_id === connectorId) && (!tenantId || r.tenant_id === tenantId));
    },

    summary() {
      return { total: log.length, actions: [...new Set(log.map((r) => r.action))] };
    },
  };
}
