import { assertGrowthWriteOwner } from '../domain/ownershipMatrix.js';

export function createGrowthProfile({ storage, metrics, audit } = {}) {
  const owner = 'growth.profile';
  const table = storage.tables.profiles;

  function userKey(tenantId, userId) {
    return storage.key(tenantId, userId);
  }

  return {
    get({ tenantId, userId }) {
      const row = storage.get(table, userKey(tenantId, userId));
      return row || {
        tenantId,
        userId,
        lifecycleStage: 'new',
        persona: 'general',
        goals: [],
        preferences: {},
        engagementScore: 0,
        updatedAt: null,
      };
    },

    upsert({ tenantId, userId }, patch = {}) {
      assertGrowthWriteOwner(owner, table);
      const current = this.get({ tenantId, userId });
      const next = {
        ...current,
        ...patch,
        tenantId,
        userId,
        goals: patch.goals ?? current.goals,
        preferences: { ...current.preferences, ...(patch.preferences || {}) },
        updatedAt: storage.now(),
      };
      storage.put(table, userKey(tenantId, userId), next);
      metrics?.record?.({ tenantId, action: 'profile.upsert', success: true });
      audit?.record?.({ action: 'profile.upsert', tenantId, diff: { userId } });
      return next;
    },

    getSegment({ tenantId, userId }) {
      const p = this.get({ tenantId, userId });
      if (p.engagementScore >= 70) return 'power';
      if (p.engagementScore >= 40) return 'active';
      return 'casual';
    },

    getEngagementScore({ tenantId, userId }) {
      return this.get({ tenantId, userId }).engagementScore;
    },
  };
}
