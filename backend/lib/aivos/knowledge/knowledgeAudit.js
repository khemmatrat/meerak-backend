export function createKnowledgeAudit({ governance, store } = {}) {
  const local = [];

  return {
    async record({ action, entityId, entityType = 'knowledge', diff = {} } = {}) {
      const row = {
        action,
        entity_id:   entityId,
        entity_type: entityType,
        diff,
        at:          new Date().toISOString(),
      };
      local.push(row);
      if (governance?.enabled && governance.auditVersionChange) {
        await governance.auditVersionChange({
          entityType,
          entityId,
          action,
          diff,
        }).catch(() => {});
      }
      return row;
    },

    list({ entityId } = {}) {
      return local.filter((r) => !entityId || r.entity_id === entityId);
    },

    summary() {
      return { total: local.length, actions: [...new Set(local.map((r) => r.action))] };
    },
  };
}
