function ensureBackups(store) {
  if (store?.kind !== 'memory') return null;
  if (!store._tables.tenantBackups) store._tables.tenantBackups = new Map();
  return store._tables.tenantBackups;
}

export function createTenantBackup({ store, migration } = {}) {
  const map = () => ensureBackups(store);

  return {
    create(tenantId) {
      const bundle = migration.export(tenantId);
      const backupId = `bak-${tenantId}-${Date.now()}`;
      const row = { backupId, tenantId, bundle, created_at: new Date().toISOString() };
      map()?.set(backupId, row);
      return { backupId, tenantId, created_at: row.created_at };
    },

    list(tenantId) {
      return [...(map()?.values() || [])].filter((b) => b.tenantId === tenantId);
    },

    get(backupId) {
      return map()?.get(backupId) || null;
    },

    async restore(backupId, { newTenantId, applications } = {}) {
      const row = this.get(backupId);
      if (!row) throw new Error('tenant_backup_not_found');
      const result = await migration.import(row.bundle, { newTenantId: newTenantId || row.tenantId, applications });
      return { backupId, restored: true, ...result };
    },
  };
}
