import { isDailyBriefEnabled } from '../config.js';

export function buildDailyBrief({ profile = {}, missions = [], revenue = {}, feed = {} }) {
  const name = profile.displayName || profile.persona || 'there';
  const missionList = missions.slice(0, 3);
  const feedItems = feed.items || feed.top || [];
  return {
    greeting: `Good Morning ${name}`,
    missions: missionList,
    revenueToday: revenue.today ?? revenue.total ?? 0,
    feedHighlights: feedItems.slice(0, 5),
    nextAction: missionList[0]?.title ? `Start: ${missionList[0].title}` : 'Start Mission',
    generatedAt: new Date().toISOString(),
  };
}

export function createDailyBriefEngine({ profile, mission, feed, revenueEngine, metrics } = {}) {
  return {
    build(ctx) {
      if (!isDailyBriefEnabled()) {
        return { ok: false, reason: 'daily_brief_disabled' };
      }
      const prof = profile?.get?.(ctx) || {};
      const missions = mission?.list?.(ctx, { status: 'active' }) || [];
      const feedPage = feed?.list?.(ctx, { limit: 10 }) || { items: [] };
      let revenue = { today: 0 };
      if (revenueEngine?.enabled) {
        revenue = { today: revenueEngine.aiService?.getDailyTotal?.(ctx.userId) ?? 0 };
      }
      const brief = buildDailyBrief({
        profile: prof,
        missions,
        revenue,
        feed: { items: feedPage.items, top: feedPage.items },
      });
      metrics?.record?.({ tenantId: ctx.tenantId, action: 'brief.generated', success: true });
      return { ok: true, brief };
    },
  };
}
