import { assertGrowthWriteOwner } from '../domain/ownershipMatrix.js';
import { createFeedRankingEngine } from './feedRankingEngine.js';

function feedItemId() {
  return `feed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createFeedEngine({ storage, metrics, mission, recommendation, ranker } = {}) {
  const owner = 'growth.feed';
  const table = storage.tables.feed;
  const feedRanker = ranker || createFeedRankingEngine();

  function userKey(tenantId, userId) {
    return storage.key(tenantId, userId);
  }

  function materialize({ tenantId, userId }) {
    const items = [];
    const missions = mission?.list?.({ tenantId, userId }, { status: 'active' }) || [];
    for (const m of missions.slice(0, 3)) {
      items.push({
        id: feedItemId(),
        kind: 'mission',
        title: m.title,
        body: 'Complete today\'s mission',
        priority: m.priority || 50,
        urgency: m.priority || 50,
        mission: 1,
        freshness: 1,
        sourceRef: m.missionId,
        metadata: { missionId: m.missionId },
        createdAt: storage.now(),
      });
    }

    const recs = recommendation?.list?.({ tenantId, userId }) || [];
    for (const r of recs.slice(0, 5)) {
      items.push({
        id: feedItemId(),
        kind: 'recommendation',
        title: r.metadata?.title || r.reason,
        body: r.reason,
        priority: r.priority || 40,
        urgency: r.priority || 40,
        preference: (r.confidence || 0.5) * 100,
        freshness: 0.9,
        sourceRef: r.id,
        sourceEventId: r.correlationId,
        metadata: { recommendationId: r.id, type: r.type },
        createdAt: r.createdAt || storage.now(),
      });
    }

    return feedRanker.rank(items);
  }

  function persist(tenantId, userId, items) {
    assertGrowthWriteOwner(owner, table);
    storage.put(table, userKey(tenantId, userId), { items, refreshedAt: storage.now() });
    return items;
  }

  return {
    list({ tenantId, userId }, { limit = 20, forceRefresh = false } = {}) {
      if (!forceRefresh) {
        const cached = storage.get(table, userKey(tenantId, userId));
        if (cached?.items?.length) {
          metrics?.record?.({ tenantId, action: 'feed.impression', success: true });
          return { items: cached.items.slice(0, limit), meta: { home: true, count: cached.items.length } };
        }
      }
      const ranked = persist(tenantId, userId, materialize({ tenantId, userId }));
      metrics?.record?.({ tenantId, action: 'feed.impression', success: true });
      return { items: ranked.slice(0, limit), meta: { home: true, count: ranked.length } };
    },

    refresh({ tenantId, userId }) {
      storage.delete(table, userKey(tenantId, userId));
      return this.list({ tenantId, userId }, { forceRefresh: true });
    },

    markRead({ tenantId, userId }, feedItemId) {
      const key = userKey(tenantId, userId);
      const cached = storage.get(table, key);
      if (!cached?.items) return { ok: true };
      const items = cached.items.map((i) => (i.id === feedItemId ? { ...i, read: true } : i));
      storage.put(table, key, { ...cached, items });
      metrics?.record?.({ tenantId, action: 'feed.click', success: true });
      return { ok: true, feedItemId };
    },

    dismiss({ tenantId, userId }, feedItemId) {
      const key = userKey(tenantId, userId);
      const cached = storage.get(table, key);
      if (!cached?.items) return { ok: true };
      const items = cached.items.filter((i) => i.id !== feedItemId);
      storage.put(table, key, { ...cached, items, refreshedAt: storage.now() });
      return { ok: true, feedItemId };
    },

    ranker: feedRanker,
  };
}
