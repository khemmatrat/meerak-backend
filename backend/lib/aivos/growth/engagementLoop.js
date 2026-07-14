import { emitGrowthEvent } from './growthEmit.js';

/**
 * Core engagement loop: Morning Brief → Mission → Execute → Reward → Journey → Feed → Notification → Evening
 */
export function createEngagementLoop({
  dailyBrief,
  eveningSummary,
  missionScheduler,
  mission,
  reward,
  journey,
  loyalty,
  feed,
  notification,
  coach,
  loop,
  events,
  metrics,
} = {}) {
  function onMissionCompleted(ctx, { missionId } = {}) {
    try { loop?.transition?.(ctx, 'EXECUTING'); } catch { /* skip */ }
    const result = mission.complete(ctx, { missionId });
    const issued = reward.issueReward?.(ctx, result.mission) || result.reward;

    if (journey?.onEvent) {
      journey.onEvent(ctx, 'MISSION_COMPLETED');
    }

    loyalty?.apply?.(ctx, {
      xp: issued?.xp || result.mission?.rewardPoints || 10,
      coins: issued?.coins || 0,
    });

    feed?.refresh?.(ctx);

    try { loop?.transition?.(ctx, 'RECOMMENDING'); } catch { /* skip */ }
    try { loop?.transition?.(ctx, 'LEARNING'); } catch { /* skip */ }

    notification?.push?.(ctx, {
      type: 'reward.granted',
      priority: 80,
      payload: { missionId, balance: issued?.balance ?? reward.getBalance(ctx) },
    });

    void emitGrowthEvent(events, 'growth.loop.mission.completed', { missionId }, ctx);
    metrics?.record?.({ tenantId: ctx.tenantId, action: 'loop.mission.completed', success: true });
    return { result, issued };
  }

  return {
    async runMorning(ctx) {
      try { loop?.transition?.(ctx, 'OPEN'); } catch { /* already open */ }
      loop?.transition?.(ctx, 'BRIEFING');
      const brief = dailyBrief?.build?.(ctx);
      missionScheduler?.apply?.(ctx, mission);
      loop?.transition?.(ctx, 'MISSIONING');
      const coachAdvice = coach?.advise?.(ctx);
      void emitGrowthEvent(events, 'growth.brief.generated', { period: 'morning' }, ctx);
      return { ok: true, brief, coach: coachAdvice };
    },

    async runEvening(ctx) {
      loop?.transition?.(ctx, 'REVIEWING');
      const summary = eveningSummary?.build?.(ctx);
      const tomorrow = missionScheduler?.generate?.(ctx) || [];
      loop?.transition?.(ctx, 'IDLE');
      void emitGrowthEvent(events, 'growth.brief.generated', { period: 'evening' }, ctx);
      return { ok: true, summary, tomorrowMission: tomorrow[0] || null };
    },

    onMissionCompleted,

    async runFullDay(ctx, { missionId } = {}) {
      const morning = await this.runMorning(ctx);
      let execution = null;
      if (missionId) {
        execution = await onMissionCompleted(ctx, { missionId });
      }
      const evening = await this.runEvening(ctx);
      return { morning, execution, evening };
    },
  };
}
