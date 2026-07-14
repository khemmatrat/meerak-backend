function ensureIdentity(store) {
  if (store?.kind !== 'memory') return null;
  if (!store._tables.tenantIdentity) store._tables.tenantIdentity = new Map();
  return store._tables.tenantIdentity;
}

export function createTenantIdentity({ store } = {}) {
  const map = () => ensureIdentity(store);

  return {
    bind({ userId, tenantId, role = 'member' } = {}) {
      const table = map();
      if (!table) throw new Error('tenant_identity_requires_memory_store');
      const key = `${userId}::${tenantId}`;
      const row = { userId, tenantId, role, bound_at: new Date().toISOString() };
      table.set(key, row);
      return { ...row };
    },

    resolve(userId) {
      const table = map();
      if (!table) return [];
      return [...table.values()].filter((r) => r.userId === userId);
    },

    resolveTenant(userId) {
      const bindings = this.resolve(userId);
      return bindings[0]?.tenantId || null;
    },

    listForTenant(tenantId) {
      return [...(map()?.values() || [])].filter((r) => r.tenantId === tenantId);
    },

    unbind(userId, tenantId) {
      map()?.delete(`${userId}::${tenantId}`);
      return { userId, tenantId, unbound: true };
    },
  };
}
