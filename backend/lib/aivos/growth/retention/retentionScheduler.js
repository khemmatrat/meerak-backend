import { isRetentionEnabled } from '../config.js';
import { emitGrowthEvent } from '../growthEmit.js';
import { RETENTION_POLICIES, isExpired } from './retentionPolicies.js';

function parseTs(value) {
  if (!value) return null;
  if (typeof value === 'number') return value;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? null : ts;
}

export function createRetentionScheduler({ storage, events, audit } = {}) {
  const purgedLog = [];

  function recordPurged(dataClass, count, tenantId) {
    if (!count) return;
    const row = { dataClass, count, tenantId: tenantId || 'all', at: new Date().toISOString() };
    purgedLog.push(row);
    void emitGrowthEvent(events, 'growth.data.purged', { dataClass, count, tenantId: row.tenantId }, { tenantId: row.tenantId });
    audit?.record?.({ action: 'retention.purge', tenantId: row.tenantId, diff: { dataClass, count } });
  }

  function purgeNotifications({ tenantId, now = Date.now() } = {}) {
    const { table, ttlMs, dataClass } = RETENTION_POLICIES.notifications;
    let count = 0;
    const storeTable = storage.store?._tables?.[table];
    if (!storeTable) return 0;

    for (const [key, queue] of storeTable.entries()) {
      if (tenantId && !key.startsWith(`${tenantId}::`)) continue;
      if (!Array.isArray(queue)) continue;
      const kept = queue.filter((n) => {
        const ts = parseTs(n.timestamp || n.sentAt || n.createdAt);
        if (ts && isExpired(ts, ttlMs, now)) {
          count += 1;
          return false;
        }
        return true;
      });
      if (kept.length !== queue.length) {
        if (kept.length) storeTable.set(key, kept);
        else storeTable.delete(key);
      }
    }
    recordPurged(dataClass, count, tenantId);
    return count;
  }

  function purgeFeedCache({ tenantId, now = Date.now() } = {}) {
    const { table, ttlMs, dataClass } = RETENTION_POLICIES.feedCache;
    let count = 0;
    const storeTable = storage.store?._tables?.[table];
    if (!storeTable) return 0;

    for (const [key, row] of storeTable.entries()) {
      if (tenantId && !key.startsWith(`${tenantId}::`)) continue;
      const ts = parseTs(row?.refreshedAt || row?.cachedAt || row?.createdAt);
      if (ts && isExpired(ts, ttlMs, now)) {
        storeTable.delete(key);
        count += 1;
      }
    }
    recordPurged(dataClass, count, tenantId);
    return count;
  }

  function purgeMissionHistory({ tenantId, now = Date.now() } = {}) {
    const { table, ttlMs, dataClass } = RETENTION_POLICIES.missionHistory;
    let count = 0;
    const storeTable = storage.store?._tables?.[table];
    if (!storeTable) return 0;

    for (const [key, missions] of storeTable.entries()) {
      if (tenantId && !key.startsWith(`${tenantId}::`)) continue;
      if (!Array.isArray(missions)) continue;
      const kept = missions.filter((m) => {
        if (m.status !== 'completed' && m.status !== 'expired') return true;
        const ts = parseTs(m.completedAt || m.abandonedAt || m.expiredAt || m.createdAt);
        if (ts && isExpired(ts, ttlMs, now)) {
          count += 1;
          return false;
        }
        return true;
      });
      if (kept.length !== missions.length) {
        if (kept.length) storeTable.set(key, kept);
        else storeTable.delete(key);
      }
    }
    recordPurged(dataClass, count, tenantId);
    return count;
  }

  function purgeChurnScores({ tenantId, now = Date.now() } = {}) {
    const { table, ttlMs, dataClass } = RETENTION_POLICIES.churnScore;
    let count = 0;
    const storeTable = storage.store?._tables?.[table];
    if (!storeTable) return 0;

    for (const [key, row] of storeTable.entries()) {
      if (tenantId && !key.startsWith(`${tenantId}::`)) continue;
      const ts = parseTs(row?.scoredAt);
      if (ts && isExpired(ts, ttlMs, now)) {
        storeTable.delete(key);
        count += 1;
      }
    }
    recordPurged(dataClass, count, tenantId);
    return count;
  }

  return {
    policies: RETENTION_POLICIES,

    run(opts = {}) {
      if (!isRetentionEnabled()) return { ok: false, reason: 'retention_disabled' };

      const results = {
        notifications: purgeNotifications(opts),
        feedCache: purgeFeedCache(opts),
        missionHistory: purgeMissionHistory(opts),
        churnScore: purgeChurnScores(opts),
      };
      const total = Object.values(results).reduce((a, b) => a + b, 0);
      return { ok: true, results, total, job: 'growth.retention.job' };
    },

    onTenantPurged({ tenantId }) {
      if (!tenantId) return { ok: false, reason: 'tenant_required' };
      const tables = new Set(Object.values(RETENTION_POLICIES).map((p) => p.table));
      let count = 0;
      for (const tableName of tables) {
        const storeTable = storage.store?._tables?.[tableName];
        if (!storeTable) continue;
        for (const key of [...storeTable.keys()]) {
          if (key.startsWith(`${tenantId}::`)) {
            storeTable.delete(key);
            count += 1;
          }
        }
      }
      recordPurged('tenantCascade', count, tenantId);
      return { ok: true, purged: count, tenantId };
    },

    onUserDeleted({ tenantId, userId }) {
      if (!tenantId || !userId) return { ok: false, reason: 'ctx_required' };
      const prefix = `${tenantId}::${userId}`;
      let count = 0;
      for (const { table } of Object.values(RETENTION_POLICIES)) {
        const storeTable = storage.store?._tables?.[table];
        if (!storeTable) continue;
        for (const key of [...storeTable.keys()]) {
          if (key === prefix || key.startsWith(`${prefix}::`)) {
            storeTable.delete(key);
            count += 1;
          }
        }
      }
      const profileTable = storage.store?._tables?.growth_profiles;
      if (profileTable?.has(prefix)) {
        profileTable.delete(prefix);
        count += 1;
      }
      recordPurged('userCascade', count, tenantId);
      return { ok: true, purged: count, tenantId, userId };
    },

    purgedLog() {
      return [...purgedLog];
    },
  };
}
