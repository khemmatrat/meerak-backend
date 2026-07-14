import {
  isGrowthEnabled,
  isRetentionEnabled,
  GROWTH_PHASE,
  GROWTH_SDK_VERSION,
} from './config.js';
import { createGrowthStorage } from './growthStorage.js';
import { validateManifest, normalizeManifest, MANIFEST_FIELDS } from './growthManifest.js';
import { createGrowthProfile } from './profile/growthProfile.js';
import { createJourneyEngine } from './journey/journeyEngine.js';
import { createHabitEngine } from './habit/habitEngine.js';
import { createLoopStateMachine } from './habit/loopStateMachine.js';
import { createMissionEngine } from './mission/missionEngine.js';
import { createMissionScheduler } from './mission/missionScheduler.js';
import { createRewardEngine } from './reward/rewardEngine.js';
import { createLoyaltyEngine } from './loyalty/loyaltyEngine.js';
import { createFeedEngine } from './feed/feedEngine.js';
import { createFeedRankingEngine } from './feed/feedRankingEngine.js';
import { createRecommendationEngine } from './recommendation/recommendationEngine.js';
import { createDailyBriefEngine } from './brief/dailyBriefEngine.js';
import { createEveningSummaryEngine } from './brief/eveningSummaryEngine.js';
import { createNotificationEngine } from './notification/notificationEngine.js';
import { createPersonalizationEngine } from './brain/personalizationEngine.js';
import { createCoachEngine } from './brain/coachEngine.js';
import { createNbaEngine } from './brain/nbaEngine.js';
import { createDashboardComposer } from './dashboard/growthDashboard.js';
import { createKpiEngine } from './analytics/kpiEngine.js';
import { createChurnEngine, createRetentionPlanner } from './churn/churnEngine.js';
import { createEngagementLoop } from './engagementLoop.js';
import { createGrowthMetrics } from './analytics/growthMetrics.js';
import { createGrowthAudit } from './analytics/growthAudit.js';
import { createGrowthEventBridge } from './eventBridge.js';
import { createGrowthIntegrationHub } from './integration/index.js';
import { createReferralEngine } from './referral/referralEngine.js';
import { createGamificationEngine } from './gamification/gamificationEngine.js';
import { createCommunityEngine } from './community/communityEngine.js';
import { createCampaignPlanner } from './campaign/campaignPlanner.js';
import { createRetentionScheduler } from './retention/retentionScheduler.js';
import { getGrowthProductionChecklist, GROWTH_RC_TAG } from './production/growthReadiness.js';
import { OWNERSHIP_MATRIX, assertGrowthWriteOwner } from './domain/ownershipMatrix.js';

function disabledStub() {
  return {
    enabled: false,
    phase: GROWTH_PHASE,
    profile: { get: async () => ({ ok: false }), upsert: async () => ({ ok: false }) },
    journey: { get: async () => ({ ok: false }), advance: async () => ({ ok: false }) },
    habit: { list: async () => [], record: async () => ({ ok: false }) },
    mission: { list: async () => [], complete: async () => ({ ok: false }) },
    reward: { getBalance: async () => 0 },
    feed: { list: async () => ({ items: [] }) },
    recommendation: { list: async () => [] },
    getMetrics: () => ({}),
    health: () => ({ ok: false, status: 'disabled' }),
  };
}

export function createGrowthEngine({
  runtime,
  store,
  events,
  governance,
  tenants,
  applications,
  workflows,
  integrations,
  orchestrator,
  revenueEngine,
  analyticsEngine,
  creditProvider,
} = {}) {
  if (!isGrowthEnabled()) return disabledStub();

  const resolvedStore = store || runtime?.store;
  const resolvedEvents = events || runtime?.events;
  const resolvedRevenue = revenueEngine || runtime?.revenueEngine;
  const resolvedOrchestrator = orchestrator || runtime?.orchestrator;
  const resolvedApplications = applications || runtime?.applications;
  const resolvedWorkflows = workflows || runtime?.workflows;
  const storage = createGrowthStorage({ store: resolvedStore });
  const baseMetrics = createGrowthMetrics();
  const audit = createGrowthAudit({ governance: governance || runtime?.governance });

  const loyalty = createLoyaltyEngine({ storage, metrics: baseMetrics, audit });
  const reward = createRewardEngine({ storage, metrics: baseMetrics, audit, events: resolvedEvents, loyalty });
  const profile = createGrowthProfile({ storage, metrics: baseMetrics, audit });
  const journey = createJourneyEngine({ storage, metrics: baseMetrics, audit });
  const habit = createHabitEngine({ storage, metrics: baseMetrics, audit, events: resolvedEvents });
  const loop = createLoopStateMachine({ storage });
  const mission = createMissionEngine({
    storage,
    metrics: baseMetrics,
    audit,
    events: resolvedEvents,
    reward,
    applications: resolvedApplications,
    workflows: resolvedWorkflows,
  });
  const recommendation = createRecommendationEngine({ storage, metrics: baseMetrics, audit, events: resolvedEvents });
  const personalization = createPersonalizationEngine({ storage, profile, metrics: baseMetrics });
  const feedRanking = createFeedRankingEngine();
  const feed = createFeedEngine({ storage, metrics: baseMetrics, mission, recommendation, ranker: feedRanking });
  const missionScheduler = createMissionScheduler({ journey, habit, revenueEngine: resolvedRevenue });
  const notification = createNotificationEngine({ storage, metrics: baseMetrics, audit, events: resolvedEvents });
  const kpi = createKpiEngine({
    storage,
    metrics: baseMetrics,
    journey,
    habit,
    mission,
    revenueEngine: resolvedRevenue,
    events: resolvedEvents,
  });

  const metrics = {
    record(opts) {
      baseMetrics.record(opts);
      if (opts?.tenantId && opts?.action) kpi.trackFromMetrics(opts.tenantId, opts.action);
    },
    snapshot: (opts) => baseMetrics.snapshot(opts),
    reset: () => baseMetrics.reset(),
  };

  const coach = createCoachEngine({
    profile,
    personalization,
    orchestrator: resolvedOrchestrator,
  });
  const nba = createNbaEngine({
    recommendation,
    personalization,
    mission,
    events: resolvedEvents,
    metrics,
  });
  const dashboard = createDashboardComposer({
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
  });
  const churn = createChurnEngine({ storage, profile, habit, mission, metrics });
  const retention = createRetentionPlanner({ churn, missionScheduler, notification });

  const dailyBrief = createDailyBriefEngine({ profile, mission, feed, revenueEngine: resolvedRevenue, metrics });
  const eveningSummary = createEveningSummaryEngine({
    mission,
    reward,
    habit,
    missionScheduler,
    metrics,
  });

  const engagementLoop = createEngagementLoop({
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
    events: resolvedEvents,
    metrics,
  });

  const referral = createReferralEngine({ storage, audit });
  const gamification = createGamificationEngine({ loyalty, habit });
  const community = createCommunityEngine({ storage });
  const campaign = createCampaignPlanner({ mission, notification });
  const integration = createGrowthIntegrationHub({
    mission,
    recommendation,
    profile,
    audit,
    events: resolvedEvents,
    kpi,
    personalization,
  });
  const retentionJob = createRetentionScheduler({ storage, events: resolvedEvents, audit });

  const eventBridge = createGrowthEventBridge({
    events: resolvedEvents,
    recommendation,
    mission,
    journey,
    engagementLoop,
    feed,
    notification,
    kpi,
    personalization,
    integration,
    retentionJob,
  });

  const engine = {
    enabled: true,
    phase: GROWTH_PHASE,
    storage,
    profile,
    journey,
    habit,
    loop,
    mission,
    missionScheduler,
    reward,
    loyalty,
    feed,
    feedRanking,
    recommendation,
    personalization,
    coach,
    nba,
    dashboard,
    kpi,
    churn,
    retention,
    dailyBrief,
    eveningSummary,
    notification,
    engagementLoop,
    eventBridge,
    integration,
    retentionJob,
    referral,
    gamification,
    community,
    campaign,
    metrics,
    audit,
    ownership: OWNERSHIP_MATRIX,
    assertWriteOwner: assertGrowthWriteOwner,
    tenants: tenants || runtime?.tenants,
    applications: resolvedApplications,
    workflows: resolvedWorkflows,
    integrations: integrations || runtime?.integrations,
    orchestrator: resolvedOrchestrator,
    analyticsEngine: analyticsEngine || runtime?.analyticsEngine,
    creditProvider: creditProvider || runtime?.creditProvider,

    validateManifest,
    normalizeManifest,

    getMetrics(opts) {
      return metrics.snapshot(opts);
    },

    getKpis(ctx, opts) {
      return kpi.getSnapshot(ctx, opts);
    },

    getAudit(opts) {
      return { entries: audit.list(opts), summary: audit.summary() };
    },

    health() {
      return {
        ok: true,
        status: 'ready',
        phase: GROWTH_PHASE,
        sprint: '20.5',
        rc: GROWTH_RC_TAG,
        sdkVersion: GROWTH_SDK_VERSION,
        modules: [
          'profile', 'journey', 'habit', 'mission', 'reward', 'loyalty', 'feed',
          'recommendation', 'dailyBrief', 'eveningSummary', 'notification',
          'personalization', 'coach', 'nba', 'dashboard', 'kpi', 'churn', 'retention',
          'integration', 'referral', 'gamification', 'community', 'campaign', 'retentionJob',
        ],
      };
    },

    readiness(opts = {}) {
      return getGrowthProductionChecklist({ growth: engine, ...opts });
    },

    seedUserContext({ tenantId, userId, persona = 'marketplace' }) {
      profile.upsert({ tenantId, userId }, {
        lifecycleStage: 'activation',
        engagementScore: 10,
        displayName: 'Founder',
        persona,
      });
      personalization.learn({ tenantId, userId }, { vertical: persona, source: 'seed' });
      recommendation.seedDefaults({ tenantId, userId });
      kpi.ingest({ tenantId, userId }, 'user.login', { source: 'seed' });
      kpi.ingest({ tenantId, userId }, 'tenant.created', { source: 'seed' });
      return { ok: true };
    },
  };

  if (runtime) runtime.growth = engine;
  return engine;
}

export {
  isGrowthEnabled,
  isRetentionEnabled,
  GROWTH_PHASE,
  GROWTH_SDK_VERSION,
  validateManifest,
  normalizeManifest,
  MANIFEST_FIELDS,
  assertGrowthWriteOwner,
  OWNERSHIP_MATRIX,
};
export { getGrowthProductionChecklist, GROWTH_RC_TAG } from './production/growthReadiness.js';
export { RETENTION_POLICIES } from './retention/retentionPolicies.js';
export { createFeedRanker } from './feed/feedRanker.js';
export { createFeedRankingEngine, rankFeed } from './feed/feedRankingEngine.js';
export { buildDailyBrief } from './brief/dailyBriefEngine.js';
export { buildEveningSummary } from './brief/eveningSummaryEngine.js';
export { JourneyState, transitionJourney } from './journey/journeyFSM.js';
export { updateLoyalty } from './loyalty/loyaltyEngine.js';
export { pushNotification } from './notification/notificationEngine.js';
export { generateMission } from './mission/missionScheduler.js';
export { issueReward } from './reward/rewardEngine.js';
export { coach } from './brain/personalAICoach.js';
export { validateRecommendation } from './recommendation/recommendationSchema.js';
export { KPI_IDS } from './config.js';
