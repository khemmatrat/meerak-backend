function ensureSubscriptions(store) {
  if (store?.kind !== 'memory') return null;
  if (!store._tables.tenantSubscriptions) store._tables.tenantSubscriptions = new Map();
  return store._tables.tenantSubscriptions;
}

export function createTenantSubscription({ store, billingEngine } = {}) {
  const map = () => ensureSubscriptions(store);

  return {
    bind(tenantId, { plan, userId, billingProfile = null } = {}) {
      const table = map();
      if (!table) throw new Error('tenant_subscription_requires_memory_store');
      const row = {
        tenantId,
        plan: plan || 'standard',
        userId,
        billingProfile,
        status: 'active',
        bound_at: new Date().toISOString(),
      };
      table.set(tenantId, row);
      return { ...row };
    },

    get(tenantId) {
      return map()?.get(tenantId) || null;
    },

    async verifyEntitlement(tenantId, { userId } = {}) {
      const sub = this.get(tenantId);
      if (!sub) {
        const err = new Error('tenant_subscription_not_found');
        err.code = 'TENANT_SUBSCRIPTION_NOT_FOUND';
        throw err;
      }
      if (billingEngine?.enabled && userId) {
        await billingEngine.checkEntitlement?.({ userId, requiredTier: sub.plan === 'free' ? 'free' : 'standard' });
      }
      return { ok: true, subscription: sub };
    },
  };
}
