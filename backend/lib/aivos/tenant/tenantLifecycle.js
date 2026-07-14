export function createTenantLifecycle({
  registry,
  workspace,
  storage,
  quota,
  subscription,
  identity,
  isolation,
  audit,
} = {}) {
  return {
    async create(manifest, { ownerId, settings = {} } = {}) {
      const row = registry.register({ ...manifest, ownerId: ownerId || manifest.ownerId });
      workspace.create(manifest.id, { name: manifest.name, settings });
      quota.init(manifest.id);
      subscription.bind(manifest.id, { plan: manifest.plan, userId: ownerId });
      if (ownerId) identity.bind({ userId: ownerId, tenantId: manifest.id, role: 'owner' });
      audit.record({ action: 'create', tenantId: manifest.id, diff: { plan: manifest.plan } });
      return row;
    },

    suspend(tenantId) {
      isolation.assertAccess(tenantId, { action: 'suspend' });
      const row = registry.update(tenantId, { state: 'suspended' });
      audit.record({ action: 'suspend', tenantId });
      return row;
    },

    restore(tenantId) {
      const row = registry.find(tenantId);
      if (!row) throw new Error('tenant_not_found');
      const updated = registry.update(tenantId, { state: 'active' });
      audit.record({ action: 'restore', tenantId });
      return updated;
    },

    delete(tenantId) {
      isolation.assertAccess(tenantId, { action: 'delete' });
      const row = registry.update(tenantId, { state: 'deleted', deleted_at: new Date().toISOString() });
      workspace.remove(tenantId);
      storage.clear(tenantId);
      audit.record({ action: 'delete', tenantId });
      return row;
    },

    purge(tenantId) {
      registry.remove(tenantId);
      workspace.remove(tenantId);
      storage.clear(tenantId);
      audit.record({ action: 'purge', tenantId });
      return { tenantId, purged: true };
    },
  };
}
