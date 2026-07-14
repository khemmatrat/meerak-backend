import { assertGrowthWriteOwner } from '../domain/ownershipMatrix.js';
import { emitGrowthEvent } from '../growthEmit.js';
import { validateRecommendation, normalizeIngressEvent } from './recommendationSchema.js';
import { createAdapterRegistry, ingressFromAdapter } from './adapters/index.js';

function recId() {
  return `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createRecommendationEngine({ storage, metrics, audit, events } = {}) {
  const owner = 'growth.recommendation';
  const table = storage.tables.recommendations;
  const adapters = createAdapterRegistry();

  adapters.register('learning.model', { source: 'learning.model' });
  adapters.register('workflow.history', { source: 'workflow.history' });
  adapters.register('revenue.forecast', { source: 'revenue.forecast' });

  function userKey(tenantId, userId) {
    return storage.key(tenantId, userId);
  }

  function saveList(tenantId, userId, list) {
    assertGrowthWriteOwner(owner, table);
    storage.put(table, userKey(tenantId, userId), list);
  }

  return {
    adapters,

    validate: validateRecommendation,

    ingress(adapterName, event) {
      const result = ingressFromAdapter(adapterName, event);
      if (!result.ok) return result;
      return this.upsert(result.recommendation);
    },

    upsert(rec) {
      const v = validateRecommendation(rec);
      if (!v.ok) {
        const err = new Error('recommendation_invalid');
        err.code = 'RECOMMENDATION_INVALID';
        err.details = v.errors;
        throw err;
      }
      const { tenantId, userId } = v.recommendation;
      const list = storage.get(table, userKey(tenantId, userId)) || [];
      const idx = list.findIndex((r) => r.id === v.recommendation.id);
      const next = idx >= 0
        ? list.map((r, i) => (i === idx ? v.recommendation : r))
        : [...list, v.recommendation];
      saveList(tenantId, userId, next);
      void emitGrowthEvent(events, 'growth.recommendation.created', { id: v.recommendation.id }, { tenantId, userId });
      return { ok: true, recommendation: v.recommendation };
    },

    list({ tenantId, userId }) {
      const list = storage.get(table, userKey(tenantId, userId)) || [];
      const now = Date.now();
      return list
        .filter((r) => !r.expiresAt || Date.parse(r.expiresAt) > now)
        .sort((a, b) => (b.priority || 0) - (a.priority || 0));
    },

    aggregateForNba({ tenantId, userId }) {
      return this.list({ tenantId, userId }).slice(0, 10);
    },

    seedDefaults({ tenantId, userId }) {
      const expires = new Date(Date.now() + 7 * 86400000).toISOString();
      const sample = normalizeIngressEvent({
        id: recId(),
        type: 'mission.start',
        priority: 75,
        confidence: 0.8,
        reason: 'Start your daily mission',
        source: 'growth.brain',
        action: { type: 'mission', targetId: 'daily-check-in' },
        tenantId,
        userId,
        metadata: { title: 'Today\'s mission' },
      });
      return this.upsert(sample);
    },
  };
}
