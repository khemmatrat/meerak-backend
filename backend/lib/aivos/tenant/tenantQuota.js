import { DEFAULT_QUOTAS } from './config.js';

function ensureQuotas(store) {
  if (store?.kind !== 'memory') return null;
  if (!store._tables.tenantQuotas) store._tables.tenantQuotas = new Map();
  if (!store._tables.tenantRateLimits) store._tables.tenantRateLimits = new Map();
  return store._tables;
}

export function createTenantQuota({ store } = {}) {
  const tables = () => ensureQuotas(store);

  return {
    init(tenantId, overrides = {}) {
      const t = tables();
      if (!t) throw new Error('tenant_quota_requires_memory_store');
      const quotas = { ...DEFAULT_QUOTAS, ...overrides };
      t.tenantQuotas.set(tenantId, { tenantId, quotas, usage: { executions_day: 0, storage_mb: 0, apps: 0 } });
      t.tenantRateLimits.set(tenantId, { tenantId, windowStart: Date.now(), count: 0 });
      return { tenantId, quotas };
    },

    get(tenantId) {
      return tables()?.tenantQuotas.get(tenantId) || null;
    },

    check(tenantId, { resource, amount = 1 } = {}) {
      const row = this.get(tenantId);
      if (!row) {
        const err = new Error('tenant_quota_not_found');
        err.code = 'TENANT_QUOTA_NOT_FOUND';
        throw err;
      }
      const limit = row.quotas[resource];
      const used = row.usage[resource] ?? 0;
      if (limit != null && used + amount > limit) {
        const err = new Error('tenant_quota_exceeded');
        err.code = 'TENANT_QUOTA_EXCEEDED';
        err.details = { resource, limit, used };
        throw err;
      }
      return { ok: true, resource, limit, used };
    },

    consume(tenantId, { resource, amount = 1 } = {}) {
      this.check(tenantId, { resource, amount });
      const row = this.get(tenantId);
      row.usage[resource] = (row.usage[resource] ?? 0) + amount;
      tables().tenantQuotas.set(tenantId, row);
      return row.usage;
    },

    checkRateLimit(tenantId) {
      const t = tables();
      const row = t?.tenantRateLimits.get(tenantId);
      const quota = this.get(tenantId);
      if (!row || !quota) return { ok: true };
      const rpm = quota.quotas.api_rpm ?? DEFAULT_QUOTAS.api_rpm;
      const now = Date.now();
      if (now - row.windowStart > 60_000) {
        row.windowStart = now;
        row.count = 0;
      }
      if (row.count >= rpm) {
        const err = new Error('tenant_rate_limit_exceeded');
        err.code = 'TENANT_RATE_LIMIT_EXCEEDED';
        throw err;
      }
      row.count += 1;
      t.tenantRateLimits.set(tenantId, row);
      return { ok: true, remaining: rpm - row.count };
    },
  };
}
