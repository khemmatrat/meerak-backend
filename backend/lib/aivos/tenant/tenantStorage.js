function ensureStorage(store) {
  if (store?.kind !== 'memory') return null;
  if (!store._tables.tenantStorage) store._tables.tenantStorage = new Map();
  return store._tables.tenantStorage;
}

export function createTenantStorage({ store, isolation } = {}) {
  const map = () => ensureStorage(store);

  function nsKey(tenantId, key) {
    return isolation?.scopeKey?.(tenantId, key) || `${tenantId}::${key}`;
  }

  return {
    put(tenantId, key, value) {
      const table = map();
      if (!table) throw new Error('tenant_storage_requires_memory_store');
      const row = { tenantId, key, value, updated_at: new Date().toISOString() };
      table.set(nsKey(tenantId, key), row);
      return { ...row };
    },

    get(tenantId, key) {
      return map()?.get(nsKey(tenantId, key))?.value ?? null;
    },

    list(tenantId) {
      const prefix = `${tenantId}::`;
      return [...(map()?.entries() || [])]
        .filter(([k]) => k.startsWith(prefix))
        .map(([, row]) => ({ ...row }));
    },

    remove(tenantId, key) {
      map()?.delete(nsKey(tenantId, key));
      return { tenantId, key, removed: true };
    },

    clear(tenantId) {
      const prefix = `${tenantId}::`;
      for (const k of [...(map()?.keys() || [])]) {
        if (k.startsWith(prefix)) map().delete(k);
      }
      return { tenantId, cleared: true };
    },
  };
}
