function ensureWorkspaces(store) {
  if (store?.kind !== 'memory') return null;
  if (!store._tables.tenantWorkspaces) store._tables.tenantWorkspaces = new Map();
  return store._tables.tenantWorkspaces;
}

export function createTenantWorkspace({ store } = {}) {
  const map = () => ensureWorkspaces(store);

  return {
    create(tenantId, { name, settings = {} } = {}) {
      const table = map();
      if (!table) throw new Error('tenant_workspace_requires_memory_store');
      const row = {
        tenantId,
        name: name || `workspace-${tenantId}`,
        settings: { ...settings },
        created_at: new Date().toISOString(),
      };
      table.set(tenantId, row);
      return { ...row };
    },

    get(tenantId) {
      return map()?.get(tenantId) || null;
    },

    update(tenantId, patch = {}) {
      const row = this.get(tenantId);
      if (!row) throw new Error('tenant_workspace_not_found');
      if (patch.settings) row.settings = { ...row.settings, ...patch.settings };
      if (patch.name) row.name = patch.name;
      map().set(tenantId, row);
      return { ...row };
    },

    remove(tenantId) {
      map()?.delete(tenantId);
      return { tenantId, removed: true };
    },
  };
}
