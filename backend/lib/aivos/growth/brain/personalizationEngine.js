import { isPersonalAiEnabled } from '../config.js';
import { assertGrowthWriteOwner } from '../domain/ownershipMatrix.js';

const DEFAULT_WEIGHTS = Object.freeze({
  food: { mission: 0.9, feed: 0.8, marketplace: 0.3 },
  marketplace: { mission: 0.8, feed: 0.9, marketplace: 1.0 },
  resume: { mission: 0.85, feed: 0.7, content: 0.9 },
  general: { mission: 0.7, feed: 0.7, marketplace: 0.5 },
});

export function createPersonalizationEngine({ storage, profile, metrics } = {}) {
  const owner = 'growth.personalization';
  const table = 'growth_persona';

  function userKey(tenantId, userId) {
    return storage.key(tenantId, userId);
  }

  return {
    get(ctx) {
      const stored = storage.get(table, userKey(ctx.tenantId, ctx.userId));
      const prof = profile?.get?.(ctx) || {};
      const persona = prof.persona || 'general';
      return stored || {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        persona,
        weights: DEFAULT_WEIGHTS[persona] || DEFAULT_WEIGHTS.general,
        signals: [],
        updatedAt: null,
      };
    },

    learn(ctx, signal = {}) {
      if (!isPersonalAiEnabled()) return { ok: false, reason: 'personal_ai_disabled' };
      assertGrowthWriteOwner(owner, table);
      const current = this.get(ctx);
      const signals = [...current.signals, { ...signal, at: storage.now() }].slice(-50);
      const persona = signal.vertical || current.persona;
      const next = {
        ...current,
        persona,
        weights: DEFAULT_WEIGHTS[persona] || current.weights,
        signals,
        updatedAt: storage.now(),
      };
      storage.put(table, userKey(ctx.tenantId, ctx.userId), next);
      metrics?.record?.({ tenantId: ctx.tenantId, action: 'persona.updated', success: true });
      return { ok: true, persona: next };
    },

    boostScore(ctx, item = {}) {
      const { weights, persona } = this.get(ctx);
      const kind = item.kind || item.type || 'general';
      const w = weights[kind] ?? weights.mission ?? 0.5;
      return (Number(item.priority) || 50) * w;
    },
  };
}
