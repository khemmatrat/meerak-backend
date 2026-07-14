import { assertGrowthWriteOwner } from '../domain/ownershipMatrix.js';
import { emitGrowthEvent } from '../growthEmit.js';
import { isLoyaltyEnabled } from '../config.js';

export function issueReward(user, mission = {}) {
  const reward = Number(mission.rewardPoints ?? mission.reward ?? 10);
  return {
    xp: reward,
    coins: reward * 2,
    unlocks: mission.unlocks || [],
    points: reward,
  };
}

export function createRewardEngine({ storage, metrics, audit, events, loyalty } = {}) {
  const owner = 'growth.reward';
  const table = storage.tables.rewards;

  function ledgerKey(tenantId, userId) {
    return storage.key(tenantId, userId);
  }

  return {
    getBalance({ tenantId, userId }) {
      const entries = storage.get(table, ledgerKey(tenantId, userId)) || [];
      return entries.reduce((sum, e) => sum + (e.points || 0), 0);
    },

    list({ tenantId, userId }) {
      return storage.get(table, ledgerKey(tenantId, userId)) || [];
    },

    issueReward(ctx, mission) {
      const issued = issueReward({ userId: ctx.userId }, mission);
      const grant = this.grant(ctx, {
        points: issued.points,
        reason: 'mission.complete',
        missionId: mission.missionId,
      });
      if (isLoyaltyEnabled() && loyalty?.apply) {
        loyalty.apply(ctx, { xp: issued.xp, coins: issued.coins });
      }
      return { ...issued, ...grant };
    },

    grant({ tenantId, userId }, { points, reason, missionId } = {}) {
      assertGrowthWriteOwner(owner, table);
      const entry = {
        id: `reward-${Date.now()}`,
        tenantId,
        userId,
        points: Number(points) || 0,
        reason: reason || 'grant',
        missionId: missionId || null,
        grantedAt: storage.now(),
      };
      const ledger = storage.get(table, ledgerKey(tenantId, userId)) || [];
      storage.put(table, ledgerKey(tenantId, userId), [...ledger, entry]);
      metrics?.record?.({ tenantId, action: 'reward.granted', success: true });
      audit?.record?.({ action: 'reward.granted', tenantId, diff: { userId, points: entry.points } });
      void emitGrowthEvent(events, 'growth.reward.granted', { points: entry.points, missionId }, { tenantId, userId });
      return { ok: true, entry, balance: this.getBalance({ tenantId, userId }) };
    },
  };
}
