import { isDailyBriefEnabled } from '../config.js';

export function buildEveningSummary({ stats = {} }) {
  return {
    completed: stats.completed ?? 0,
    revenue: stats.revenue ?? 0,
    tomorrowMission: stats.nextMission ?? null,
    streak: stats.streak ?? 0,
    summary: stats.completed > 0
      ? `Great work — ${stats.completed} mission(s) completed today.`
      : 'Tomorrow is a fresh start.',
    generatedAt: new Date().toISOString(),
  };
}

export function createEveningSummaryEngine({ mission, reward, habit, missionScheduler, metrics } = {}) {
  return {
    build(ctx) {
      if (!isDailyBriefEnabled()) {
        return { ok: false, reason: 'evening_summary_disabled' };
      }
      const missions = mission?.list?.(ctx) || [];
      const completed = missions.filter((m) => m.status === 'completed').length;
      const balance = reward?.getBalance?.(ctx) ?? 0;
      const habits = habit?.list?.(ctx) || [];
      const streak = habits[0]?.streak ?? 0;
      const scheduled = missionScheduler?.generate?.(ctx) || [];
      const summary = buildEveningSummary({
        stats: {
          completed,
          revenue: balance,
          nextMission: scheduled[0] || null,
          streak,
        },
      });
      metrics?.record?.({ tenantId: ctx.tenantId, action: 'brief.evening', success: true });
      return { ok: true, summary };
    },
  };
}
