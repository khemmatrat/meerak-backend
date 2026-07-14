import { isDashboardEnabled } from '../config.js';

export function createDashboardComposer({
  profile,
  journey,
  mission,
  reward,
  loyalty,
  habit,
  feed,
  kpi,
  loop,
  nba,
} = {}) {
  return {
    compose(ctx) {
      if (!isDashboardEnabled()) {
        return { ok: false, reason: 'dashboard_disabled' };
      }

      const missions = mission?.list?.(ctx) || [];
      const active = missions.filter((m) => m.status === 'active');
      const completed = missions.filter((m) => m.status === 'completed');
      const kpis = kpi?.getSnapshot?.(ctx, { window: '7d' }) || { kpis: {} };

      return {
        ok: true,
        dashboard: {
          profile: profile?.get?.(ctx),
          journey: journey?.get?.(ctx),
          loop: loop?.get?.(ctx),
          missions: { active: active.length, completed: completed.length, items: active.slice(0, 5) },
          reward: { balance: reward?.getBalance?.(ctx) ?? 0 },
          loyalty: loyalty?.get?.(ctx),
          habit: habit?.list?.(ctx)?.[0] || null,
          feedPreview: (feed?.list?.(ctx, { limit: 5 })?.items) || [],
          nba: nba?.rank?.(ctx)?.slice(0, 3) || [],
          kpis: kpis.kpis,
          kpiWindow: kpis.window,
          asOf: new Date().toISOString(),
        },
        meta: { screen: 'Dashboard', version: '20.3.0' },
      };
    },
  };
}
