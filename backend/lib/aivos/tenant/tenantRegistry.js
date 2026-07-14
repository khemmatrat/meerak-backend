function ensureTenants(store) {
  if (store?.kind !== 'memory') return null;
  if (!store._tables.tenantRegistry) store._tables.tenantRegistry = new Map();
  return store._tables.tenantRegistry;
}

function now() {
  return new Date().toISOString();
}

export function createTenantRegistry({ store } = {}) {
  const map = () => ensureTenants(store);

  return {
    register(manifest) {
      const table = map();
      if (!table) throw new Error('tenant_registry_requires_memory_store');
      if (table.has(manifest.id)) {
        const err = new Error('tenant_already_exists');
        err.code = 'TENANT_ALREADY_EXISTS';
        throw err;
      }
      const row = {
        id: manifest.id,
        manifest,
        state: 'active',
        plan: manifest.plan,
        ownerId: manifest.ownerId,
        created_at: now(),
        updated_at: now(),
      };
      table.set(manifest.id, row);
      return { ...row, manifest: { ...manifest } };
    },

    find(tenantId) {
      return map()?.get(tenantId) || null;
    },

    list({ state, plan } = {}) {
      return [...(map()?.values() || [])]
        .filter((t) => !state || t.state === state)
        .filter((t) => !plan || t.plan === plan)
        .map((t) => ({ ...t, manifest: { ...t.manifest } }));
    },

    update(tenantId, patch = {}) {
      const row = this.find(tenantId);
      if (!row) {
        const err = new Error('tenant_not_found');
        err.code = 'TENANT_NOT_FOUND';
        throw err;
      }
      Object.assign(row, patch, { updated_at: now() });
      map().set(tenantId, row);
      return { ...row, manifest: { ...row.manifest } };
    },

    remove(tenantId) {
      const table = map();
      if (!table?.has(tenantId)) {
        const err = new Error('tenant_not_found');
        err.code = 'TENANT_NOT_FOUND';
        throw err;
      }
      table.delete(tenantId);
      return { id: tenantId, removed: true };
    },
  };
}
