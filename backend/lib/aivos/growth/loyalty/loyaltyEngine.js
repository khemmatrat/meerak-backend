import { isLoyaltyEnabled } from '../config.js';
import { assertGrowthWriteOwner } from '../domain/ownershipMatrix.js';

export function updateLoyalty(user, action = {}) {
  const xp = Number(action.xp) || 0;
  const coins = Number(action.coins) || 0;
  const next = {
    ...user,
    xp: (user.xp || 0) + xp,
    coins: (user.coins || 0) + coins,
  };
  next.level = Math.floor(next.xp / 100);
  return next;
}

export function createLoyaltyEngine({ storage, metrics, audit } = {}) {
  const owner = 'growth.loyalty';
  const table = 'growth_loyalty';

  function userKey(tenantId, userId) {
    return storage.key(tenantId, userId);
  }

  return {
    get(ctx) {
      return storage.get(table, userKey(ctx.tenantId, ctx.userId)) || {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        xp: 0,
        coins: 0,
        level: 0,
      };
    },

    apply(ctx, action) {
      if (!isLoyaltyEnabled()) return { ok: false, reason: 'loyalty_disabled' };
      assertGrowthWriteOwner(owner, table);
      const current = this.get(ctx);
      const next = updateLoyalty(current, action);
      storage.put(table, userKey(ctx.tenantId, ctx.userId), next);
      metrics?.record?.({ tenantId: ctx.tenantId, action: 'loyalty.updated', success: true });
      audit?.record?.({ action: 'loyalty.updated', tenantId: ctx.tenantId, diff: { level: next.level } });
      return { ok: true, loyalty: next };
    },
  };
}
