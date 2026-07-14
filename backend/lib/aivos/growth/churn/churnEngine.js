import { assertGrowthWriteOwner } from '../domain/ownershipMatrix.js';

export function createChurnEngine({ storage, profile, habit, mission, metrics } = {}) {
  const table = 'growth_churn_scores';

  function userKey(tenantId, userId) {
    return storage.key(tenantId, userId);
  }

  return {
    score(ctx) {
      const prof = profile?.get?.(ctx) || {};
      const habits = habit?.list?.(ctx) || [];
      const missions = mission?.list?.(ctx) || [];
      const streak = habits[0]?.streak || 0;
      const completed = missions.filter((m) => m.status === 'completed').length;
      const engagement = prof.engagementScore || 0;

      let risk = 0.5;
      if (streak >= 7) risk -= 0.2;
      if (completed >= 3) risk -= 0.15;
      if (engagement >= 50) risk -= 0.1;
      if (streak === 0) risk += 0.2;
      risk = Math.max(0, Math.min(1, risk));

      const row = {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        risk,
        factors: [
          streak < 3 ? 'low_streak' : null,
          engagement < 30 ? 'low_engagement' : null,
          completed === 0 ? 'no_missions' : null,
        ].filter(Boolean),
        scoredAt: storage.now(),
      };

      assertGrowthWriteOwner('growth.churn', table);
      storage.put(table, userKey(ctx.tenantId, ctx.userId), row);
      metrics?.record?.({ tenantId: ctx.tenantId, action: 'churn.scored', success: true });
      return row;
    },
  };
}

export function createRetentionPlanner({ churn, missionScheduler, notification } = {}) {
  return {
    plan(ctx) {
      const score = churn?.score?.(ctx) || { risk: 0.5 };
      const missions = missionScheduler?.generate?.(ctx) || [];
      const actions = [];

      if (score.risk >= 0.6) {
        actions.push({ type: 're_engagement', mission: missions[0] || null });
        notification?.push?.(ctx, {
          type: 'retention.engage',
          priority: 95,
          payload: { risk: score.risk },
        });
      } else {
        actions.push({ type: 'maintain', mission: missions[0] || null });
      }

      return { ok: true, risk: score.risk, actions, factors: score.factors || [] };
    },
  };
}
