import { isGrowthEnabled, GROWTH_SDK_VERSION } from '../../growth/config.js';

const DISABLED = Object.freeze({ ok: false, reason: 'growth_disabled' });

function requireCtx(ctx) {
  if (!ctx?.tenantId || !ctx?.userId) {
    const err = new Error('sdk_ctx_required');
    err.code = 'SDK_CTX_REQUIRED';
    throw err;
  }
  return ctx;
}

function disabledNs() {
  const stub = async () => DISABLED;
  return {
    get: stub,
    list: stub,
    upsert: stub,
    complete: stub,
    record: stub,
    refresh: stub,
    start: stub,
    abandon: stub,
    execute: stub,
    markRead: stub,
    dismiss: stub,
    create: stub,
  };
}

export function createGrowthSdk({ runtime, baseUrl = '/api/aivos/growth' } = {}) {
  if (!isGrowthEnabled() || !runtime?.growth?.enabled) {
    return {
      version: GROWTH_SDK_VERSION,
      enabled: false,
      profile: () => disabledNs(),
      feed: () => disabledNs(),
      mission: () => disabledNs(),
      notification: () => disabledNs(),
      loyalty: () => disabledNs(),
      referral: () => disabledNs(),
      analytics: () => disabledNs(),
      recommendation: () => disabledNs(),
      journey: () => disabledNs(),
      habit: () => disabledNs(),
      brief: () => disabledNs(),
      coach: () => disabledNs(),
      nba: () => disabledNs(),
      dashboard: () => disabledNs(),
    };
  }

  const g = runtime.growth;

  return {
    version: GROWTH_SDK_VERSION,
    enabled: true,
    baseUrl,

    profile: () => ({
      get: async (ctx) => {
        requireCtx(ctx);
        return { ok: true, profile: g.profile.get(ctx) };
      },
      upsert: async (ctx, patch) => {
        requireCtx(ctx);
        return { ok: true, profile: g.profile.upsert(ctx, patch) };
      },
      getSegment: async (ctx) => {
        requireCtx(ctx);
        return { ok: true, segment: g.profile.getSegment(ctx) };
      },
      getEngagementScore: async (ctx) => {
        requireCtx(ctx);
        return { ok: true, score: g.profile.getEngagementScore(ctx) };
      },
    }),

    feed: () => ({
      list: async (ctx, opts) => {
        requireCtx(ctx);
        return { ok: true, ...g.feed.list(ctx, opts) };
      },
      refresh: async (ctx) => {
        requireCtx(ctx);
        return { ok: true, ...g.feed.refresh(ctx) };
      },
      markRead: async (ctx, feedItemId) => {
        requireCtx(ctx);
        return { ok: true, ...g.feed.markRead(ctx, feedItemId) };
      },
      dismiss: async (ctx, feedItemId) => {
        requireCtx(ctx);
        return { ok: true, ...g.feed.dismiss(ctx, feedItemId) };
      },
    }),

    mission: () => ({
      list: async (ctx, opts) => {
        requireCtx(ctx);
        return { ok: true, missions: g.mission.list(ctx, opts) };
      },
      get: async (ctx, missionId) => {
        requireCtx(ctx);
        return { ok: true, mission: g.mission.get(ctx, missionId) };
      },
      start: async (ctx, missionId) => {
        requireCtx(ctx);
        return { ok: true, mission: g.mission.start(ctx, missionId) };
      },
      abandon: async (ctx, opts) => {
        requireCtx(ctx);
        return g.mission.abandon(ctx, opts);
      },
      execute: async (ctx, opts) => {
        requireCtx(ctx);
        return g.mission.execute(ctx, opts);
      },
      complete: async (ctx, missionId, evidence) => {
        requireCtx(ctx);
        const body = typeof missionId === 'object'
          ? missionId
          : { missionId, evidence };
        return { ok: true, ...g.mission.complete(ctx, body) };
      },
    }),

    notification: () => ({
      list: async (ctx, opts) => {
        requireCtx(ctx);
        return { ok: true, notifications: g.notification.list(ctx, opts) };
      },
      push: async (ctx, payload) => {
        requireCtx(ctx);
        return g.notification.push(ctx, payload);
      },
      markRead: async (ctx, id) => {
        requireCtx(ctx);
        return g.notification.markRead(ctx, id);
      },
      getPreferences: async (ctx) => {
        requireCtx(ctx);
        return { ok: true, preferences: g.notification.getPreferences(ctx) };
      },
      setPreferences: async (ctx, patch) => {
        requireCtx(ctx);
        return g.notification.setPreferences(ctx, patch);
      },
    }),

    loyalty: () => ({
      get: async (ctx) => {
        requireCtx(ctx);
        return { ok: true, loyalty: g.loyalty.get(ctx) };
      },
      getBalance: async (ctx) => {
        requireCtx(ctx);
        return { ok: true, balance: g.reward.getBalance(ctx) };
      },
      getTier: async (ctx) => {
        requireCtx(ctx);
        const row = g.loyalty.get(ctx);
        return { ok: true, tier: row.level, level: row.level };
      },
      getGamification: async (ctx) => {
        requireCtx(ctx);
        return { ok: true, gamification: g.gamification.snapshot(ctx) };
      },
    }),

    referral: () => ({
      create: async (ctx) => {
        requireCtx(ctx);
        return g.referral.create(ctx);
      },
      list: async (ctx) => {
        requireCtx(ctx);
        return { ok: true, referrals: g.referral.list(ctx) };
      },
    }),

    analytics: () => ({
      getMetrics: async (ctx) => {
        requireCtx(ctx);
        return { ok: true, metrics: g.getMetrics({ tenantId: ctx.tenantId }) };
      },
      getKpis: async (ctx, opts) => {
        requireCtx(ctx);
        return g.getKpis(ctx, opts);
      },
    }),

    recommendation: () => ({
      list: async (ctx) => {
        requireCtx(ctx);
        return { ok: true, recommendations: g.recommendation.list(ctx) };
      },
    }),

    journey: () => ({
      get: async (ctx) => {
        requireCtx(ctx);
        return { ok: true, journey: g.journey.get(ctx) };
      },
      advance: async (ctx, opts) => {
        requireCtx(ctx);
        return { ok: true, journey: g.journey.advance(ctx, opts) };
      },
      rollback: async (ctx) => {
        requireCtx(ctx);
        return { ok: true, journey: g.journey.rollback(ctx) };
      },
    }),

    habit: () => ({
      list: async (ctx) => {
        requireCtx(ctx);
        return { ok: true, habits: g.habit.list(ctx) };
      },
      record: async (ctx, opts) => {
        requireCtx(ctx);
        return { ok: true, ...g.habit.record(ctx, opts) };
      },
    }),

    brief: () => ({
      morning: async (ctx) => {
        requireCtx(ctx);
        return g.dailyBrief.build(ctx);
      },
      evening: async (ctx) => {
        requireCtx(ctx);
        return g.eveningSummary.build(ctx);
      },
    }),

    coach: () => ({
      ask: async (ctx, context) => {
        requireCtx(ctx);
        return g.coach.advise(ctx, context);
      },
    }),

    nba: () => ({
      list: async (ctx) => {
        requireCtx(ctx);
        return { ok: true, recommendations: g.nba.rank(ctx) };
      },
      accept: async (ctx, recommendationId) => {
        requireCtx(ctx);
        return g.nba.accept(ctx, recommendationId);
      },
    }),

    dashboard: () => ({
      get: async (ctx) => g.dashboard.compose(ctx),
    }),
  };
}
