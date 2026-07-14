/**
 * Phase 20 Sprint 20.1 – Growth Experience Platform
 * Tests GRW01–GRW08, GRW17, GRW20, GRW22
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

process.env.AIVOS_RESUME_PLUGIN_ENABLED   = '1';
process.env.AIVOS_RUNTIME_ENABLED         = '1';
process.env.AIVOS_RENDER_ENABLED          = '1';
process.env.AIVOS_PUBLISH_ENABLED         = '1';
process.env.AIVOS_ANALYTICS_ENABLED       = '1';
process.env.AIVOS_LEARNING_ENABLED        = '1';
process.env.AIVOS_OPTIMIZATION_ENABLED    = '1';
process.env.AIVOS_AUTOMATION_ENABLED      = '1';
process.env.AIVOS_REVENUE_ENABLED         = '1';
process.env.AIVOS_MARKETPLACE_ENABLED     = '1';
process.env.AIVOS_BILLING_ENABLED         = '1';
process.env.AIVOS_GOVERNANCE_ENABLED      = '1';
process.env.AIVOS_QA_ENABLED              = '1';
process.env.AIVOS_SKILL_ENABLED           = '1';
process.env.AIVOS_ORCHESTRATOR_ENABLED    = '1';
process.env.AIVOS_KNOWLEDGE_ENABLED       = '1';
process.env.AIVOS_WORKFLOW_ENABLED        = '1';
process.env.AIVOS_APPLICATION_ENABLED     = '1';
process.env.AIVOS_TENANT_ENABLED          = '1';
process.env.AIVOS_INTEGRATION_ENABLED     = '1';
process.env.AIVOS_GROWTH_ENABLED          = '1';
process.env.AIVOS_GROWTH_DAILY_BRIEF      = '1';
process.env.AIVOS_GROWTH_JOURNEY          = '1';
process.env.AIVOS_GROWTH_LOYALTY          = '1';
process.env.AIVOS_GROWTH_NOTIFICATION     = '1';
process.env.AIVOS_GROWTH_FEED_RANKING     = '1';
process.env.AIVOS_GROWTH_NBA              = '1';
process.env.AIVOS_GROWTH_PERSONAL_AI      = '1';
process.env.AIVOS_GROWTH_COACH            = '1';
process.env.AIVOS_GROWTH_DASHBOARD        = '1';
process.env.AIVOS_GROWTH_KPI              = '1';

import { createRuntime } from '../lib/aivos/runtime/index.js';
import {
  isGrowthEnabled,
  GROWTH_PHASE,
  validateManifest,
  assertGrowthWriteOwner,
  OWNERSHIP_MATRIX,
  validateRecommendation,
  buildDailyBrief,
  buildEveningSummary,
  JourneyState,
  transitionJourney,
  updateLoyalty,
  rankFeed,
  generateMission,
  issueReward,
  coach,
  pushNotification,
  KPI_IDS,
} from '../lib/aivos/growth/index.js';
import { HABIT_STREAK_MILESTONES } from '../lib/aivos/growth/config.js';
import { registerAivosRoutes, createAivosSdk } from '../lib/aivos/index.js';

const __dir = dirname(fileURLToPath(import.meta.url));

const mockBillingGrowth = {
  getGrowthStatus: async (userId) => ({ userId, ai_video_credits: 10, tier: 'premium' }),
};

function makeRuntime(overrides = {}) {
  return createRuntime({ syncExecute: true, growthEngine: mockBillingGrowth, ...overrides });
}

async function withServer(app, fn) {
  const server = app.listen(0);
  const port = server.address().port;
  try {
    return await fn(port);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

function makeApp(overrides = {}) {
  const app = express();
  app.use(express.json());
  registerAivosRoutes(app, {
    runtimeEnabled: true,
    marketplaceEnabled: true,
    billingEnabled: true,
    governanceEnabled: true,
    qaEnabled: true,
    skillEnabled: true,
    orchestratorEnabled: true,
    knowledgeEnabled: true,
    workflowEnabled: true,
    applicationEnabled: true,
    tenantEnabled: true,
    integrationEnabled: true,
    growthEnabled: true,
    forceNew: true,
    growthEngine: mockBillingGrowth,
    authenticateToken: (_q, _s, n) => n(),
    ...overrides,
  });
  return app;
}

const CTX = { tenantId: 't-grw', userId: 'u-grw' };

function scanDirForKernel(dir) {
  const hits = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      hits.push(...scanDirForKernel(full));
      continue;
    }
    if (!name.endsWith('.js')) continue;
    const src = readFileSync(full, 'utf8');
    if (/\bkernel\//.test(src) || /\bfrom ['"].*\/kernel\//.test(src)) {
      hits.push(full);
    }
  }
  return hits;
}

test('GRW01 config feature flags and phase', () => {
  assert.equal(isGrowthEnabled(), true);
  const rt = makeRuntime();
  assert.equal(rt.growth.phase, GROWTH_PHASE);
  assert.equal(rt.growth.enabled, true);
  assert.equal(rt.growth.health().status, 'ready');
});

test('GRW02 manifest normalization and validation', () => {
  const valid = validateManifest({
    id: 'vertical-food',
    name: 'AI Food',
    version: '1.0.0',
    vertical: 'food',
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.manifest.tenantScoped, true);

  const invalid = validateManifest({ id: 'x', name: 'X', version: 'bad' });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.includes('version_semver_required'));
});

test('GRW03 profile upsert and engagement', () => {
  const rt = makeRuntime();
  const profile = rt.growth.profile.upsert(CTX, {
    persona: 'food',
    goals: ['daily-post'],
    engagementScore: 55,
  });
  assert.equal(profile.persona, 'food');
  assert.equal(profile.engagementScore, 55);
  assert.equal(rt.growth.profile.getSegment(CTX), 'active');
});

test('GRW04 journey advance and rollback', () => {
  const rt = makeRuntime();
  const initial = rt.growth.journey.get(CTX);
  assert.equal(initial.stageIndex, 0);

  const advanced = rt.growth.journey.advance(CTX, { reason: 'test' });
  assert.equal(advanced.stageIndex, 1);
  assert.ok(advanced.stageHistory.length >= 1);

  const rolled = rt.growth.journey.rollback(CTX);
  assert.equal(rolled.stageIndex, 0);
});

test('GRW05 habit record and streak milestones', () => {
  const rt = makeRuntime();
  const first = rt.growth.habit.record(CTX, { note: 'day1' });
  assert.equal(first.habit.streak, 1);

  for (let i = 2; i <= 3; i += 1) {
    rt.growth.habit.record(
      { ...CTX, userId: `u-streak-${i}` },
      { note: `sim-${i}` },
    );
  }

  const streakUser = { tenantId: 't-streak', userId: 'u-streak-sim' };
  let habit = rt.growth.habit.get(streakUser);
  for (let day = 0; day < 3; day += 1) {
    const result = rt.growth.habit.record(streakUser, { note: `d${day}` });
    habit = result.habit;
    if (day > 0) {
      const storage = rt.growth.storage;
      const table = storage.tables.habits;
      const key = storage.key(streakUser.tenantId, streakUser.userId);
      const row = storage.get(table, key);
      row.lastCompletedAt = new Date(Date.now() - 86400000).toISOString();
      storage.put(table, key, row);
    }
  }
  const final = rt.growth.habit.record(streakUser, { note: 'today' });
  assert.ok(final.habit.streak >= 2);
  assert.ok(HABIT_STREAK_MILESTONES.includes(3));
});

test('GRW06 mission list and complete grants reward', () => {
  const rt = makeRuntime();
  rt.growth.seedUserContext(CTX);
  const missions = rt.growth.mission.list(CTX, { status: 'active' });
  assert.ok(missions.length >= 1);

  const target = missions[0];
  const result = rt.growth.mission.complete(CTX, { missionId: target.missionId });
  assert.equal(result.mission.status, 'completed');
  assert.ok(result.reward?.balance >= target.rewardPoints);
});

test('GRW07 reward ledger append-only balance', () => {
  const rt = makeRuntime();
  const before = rt.growth.reward.getBalance(CTX);
  rt.growth.reward.grant(CTX, { points: 15, reason: 'test.grant' });
  const after = rt.growth.reward.getBalance(CTX);
  assert.equal(after, before + 15);
  const ledger = rt.growth.reward.list(CTX);
  assert.ok(ledger.some((e) => e.reason === 'test.grant'));
});

test('GRW08 feed work items ranked with home meta', () => {
  const rt = makeRuntime();
  rt.growth.seedUserContext(CTX);
  const feed = rt.growth.feed.list(CTX);
  assert.ok(feed.items.length >= 1);
  assert.equal(feed.meta.home, true);
  for (const item of feed.items) {
    assert.ok(['mission', 'recommendation', 'alert', 'brief', 'reward', 'workflow', 'application'].includes(item.kind));
  }
  const priorities = feed.items.map((i) => i.priority);
  const sorted = [...priorities].sort((a, b) => b - a);
  assert.deepEqual(priorities, sorted);
});

test('GRW17 growth SDK namespaces callable without kernel imports', () => {
  const rt = makeRuntime();
  const sdk = createAivosSdk({ runtime: rt });
  const g = sdk.growth();
  assert.equal(g.enabled, true);

  const namespaces = [
    'profile', 'feed', 'mission', 'notification', 'loyalty', 'referral',
    'analytics', 'recommendation', 'journey', 'habit', 'brief', 'coach', 'nba', 'dashboard',
  ];
  for (const ns of namespaces) {
    assert.equal(typeof g[ns], 'function', `missing sdk.growth.${ns}`);
    assert.ok(g[ns](), `sdk.growth.${ns}() should return namespace`);
  }

  const growthDir = join(__dir, '../lib/aivos/growth');
  const hits = scanDirForKernel(growthDir);
  assert.equal(hits.length, 0, `kernel imports found: ${hits.join(', ')}`);
});

test('GRW20 recommendation schema validation and adapter ingress', () => {
  const rt = makeRuntime();
  const expires = new Date(Date.now() + 86400000).toISOString();
  const valid = validateRecommendation({
    id: 'rec-test',
    type: 'mission.start',
    priority: 80,
    confidence: 0.9,
    reason: 'Start mission',
    source: 'growth.brain',
    action: { type: 'mission', targetId: 'm1' },
    expiresAt: expires,
    tenantId: CTX.tenantId,
    userId: CTX.userId,
    createdAt: new Date().toISOString(),
    correlationId: 'corr-1',
  });
  assert.equal(valid.ok, true);

  const invalid = validateRecommendation({ id: 'x' });
  assert.equal(invalid.ok, false);

  const ingressed = rt.growth.recommendation.ingress('learning.model', {
    tenantId: CTX.tenantId,
    userId: CTX.userId,
    payload: {
      type: 'workflow.run',
      reason: 'Run weekly report',
      action: { type: 'workflow', targetId: 'wf-1' },
      priority: 70,
      confidence: 0.7,
    },
  });
  assert.equal(ingressed.ok, true);

  const nba = rt.growth.recommendation.aggregateForNba(CTX);
  assert.ok(Array.isArray(nba));
});

test('GRW22 domain ownership matrix enforced', () => {
  assert.ok(OWNERSHIP_MATRIX['growth.profile']);
  assert.doesNotThrow(() => assertGrowthWriteOwner('growth.profile', 'growth_profiles'));
  assert.throws(
    () => assertGrowthWriteOwner('growth.profile', 'workflow_runs'),
    (e) => e.code === 'GROWTH_OWNERSHIP_VIOLATION',
  );
  assert.throws(
    () => assertGrowthWriteOwner('unknown.owner', 'growth_profiles'),
    (e) => e.code === 'GROWTH_OWNERSHIP_VIOLATION',
  );
});

test('GRW09 runtime growth attached after integrations', () => {
  const rt = makeRuntime();
  assert.ok(rt.integrations?.enabled);
  assert.ok(rt.growth?.enabled);
  assert.equal(rt.growth.phase, 20);
});

test('GRW10 metrics record growth actions', () => {
  const rt = makeRuntime();
  rt.growth.profile.upsert(CTX, { engagementScore: 20 });
  const metrics = rt.growth.getMetrics({ tenantId: CTX.tenantId });
  assert.ok(metrics['profile.upsert']?.count >= 1);
});

test('GRW11 growth routes health and 503 when disabled', async () => {
  const enabledApp = makeApp();
  await withServer(enabledApp, async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/aivos/growth/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.health.status, 'ready');
  });

  const disabledApp = express();
  disabledApp.use(express.json());
  registerAivosRoutes(disabledApp, {
    runtimeEnabled: true,
    growthEnabled: false,
    forceNew: true,
    growthEngine: mockBillingGrowth,
    authenticateToken: (_q, _s, n) => n(),
  });
  await withServer(disabledApp, async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/aivos/growth/profile`);
    assert.equal(res.status, 503);
  });
});

// ─── Sprint 20.4: GRW12–GRW16 ─────────────────────────────────────────────

const CTX204 = { tenantId: 't-204', userId: 'u-204' };

test('GRW12 profile journey mission reward chain', () => {
  const rt = makeRuntime();
  const ctx = { tenantId: 't-grw12', userId: 'u-grw12' };
  rt.growth.profile.upsert(ctx, { persona: 'food', engagementScore: 15, lifecycleStage: 'activation' });
  const journey = rt.growth.journey.advance(ctx, { reason: 'activation' });
  assert.equal(journey.stageIndex, 1);

  const missions = rt.growth.mission.list(ctx, { status: 'active' });
  assert.ok(missions.length >= 1);
  const target = missions[0];
  const started = rt.growth.mission.start(ctx, target.missionId);
  assert.equal(started.status, 'active');
  assert.ok(started.startedAt);

  const result = rt.growth.mission.complete(ctx, { missionId: target.missionId });
  assert.equal(result.mission.status, 'completed');
  assert.ok(result.reward?.balance >= target.rewardPoints);
  assert.ok(rt.growth.reward.getBalance(ctx) >= target.rewardPoints);
});

test('GRW13 multi-tenant growth data isolation', () => {
  const rt = makeRuntime();
  const t1 = { tenantId: 't-iso-a', userId: 'u-shared' };
  const t2 = { tenantId: 't-iso-b', userId: 'u-shared' };

  rt.growth.profile.upsert(t1, { persona: 'food', engagementScore: 40 });
  rt.growth.profile.upsert(t2, { persona: 'travel', engagementScore: 80 });
  assert.equal(rt.growth.profile.get(t1).persona, 'food');
  assert.equal(rt.growth.profile.get(t2).persona, 'travel');

  rt.growth.mission.assign(t1, { templateId: 'iso-t1', title: 'Tenant A exclusive', rewardPoints: 5 });
  const t2missions = rt.growth.mission.list(t2);
  assert.ok(!t2missions.some((m) => m.title === 'Tenant A exclusive'));

  rt.growth.reward.grant(t1, { points: 11, reason: 'iso.t1' });
  assert.equal(rt.growth.reward.getBalance(t2), rt.growth.reward.getBalance({ tenantId: 'fresh', userId: 'x' }) || 0);
  assert.ok(rt.growth.reward.list(t1).some((e) => e.reason === 'iso.t1'));
  assert.ok(!rt.growth.reward.list(t2).some((e) => e.reason === 'iso.t1'));
});

test('GRW14 journey rollback restores previous stage', async () => {
  const rt = makeRuntime();
  const ctx = { tenantId: 't-grw14', userId: 'u-grw14' };
  rt.growth.journey.advance(ctx);
  rt.growth.journey.advance(ctx);
  assert.equal(rt.growth.journey.get(ctx).stageIndex, 2);

  const rolled = rt.growth.journey.rollback(ctx);
  assert.equal(rolled.stageIndex, 1);
  assert.ok(rolled.stageHistory.some((h) => h.reason === 'rollback'));

  const app = makeApp();
  await withServer(app, async (port) => {
    const res = await fetch(
      `http://127.0.0.1:${port}/api/aivos/growth/journey/rollback?tenantId=${ctx.tenantId}&userId=${ctx.userId}`,
      { method: 'POST' },
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.stageIndex, 0);
  });
});

test('GRW15 churn retention re-engagement', () => {
  const rt = makeRuntime();
  const ctx = { tenantId: 't-grw15', userId: 'u-grw15' };
  rt.growth.profile.upsert(ctx, { engagementScore: 5 });

  const score = rt.growth.churn.score(ctx);
  assert.ok(score.risk >= 0.6, `expected elevated churn risk, got ${score.risk}`);
  assert.ok(score.factors.length >= 1);

  const plan = rt.growth.retention.plan(ctx);
  assert.equal(plan.ok, true);
  assert.ok(plan.actions.some((a) => a.type === 're_engagement'));

  const notifs = rt.growth.notification.list(ctx);
  assert.ok(notifs.some((n) => n.type === 'retention.engage'));
});

test('GRW16 full E2E growth application workflow tenant billing revenue audit', async () => {
  const rt = makeRuntime();
  const ctx = { tenantId: 't-e2e-16', userId: 'u-e2e-16' };

  rt.growth.integration.tenants.onCreated({
    tenantId: ctx.tenantId,
    ownerId: ctx.userId,
    plan: 'pro',
  });
  assert.equal(rt.growth.profile.get(ctx).lifecycleStage, 'onboarding');

  rt.growth.integration.applications.onInstalled({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    appId: 'app-trip-ai',
    appName: 'Trip AI',
  });

  rt.growth.integration.marketplace.onPackageInstalled({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    packageId: 'wf-commerce',
    packageType: 'workflow',
  });

  const missions = rt.growth.mission.list(ctx);
  assert.ok(missions.length >= 2);

  const completed = rt.growth.mission.complete(ctx, { missionId: missions[0].missionId });
  assert.equal(completed.mission.status, 'completed');

  rt.growth.eventBridge.handle('user.login', { ...ctx, correlationId: 'e2e-16-login' });

  assert.ok(rt.billingEngine?.enabled !== false);
  assert.ok(rt.revenueEngine);

  const audit = rt.growth.getAudit({ tenantId: ctx.tenantId });
  assert.ok(audit.entries.length >= 1);

  const sdk = createAivosSdk({ runtime: rt });
  const prof = await sdk.growth().profile().get(ctx);
  assert.equal(prof.ok, true);
  assert.equal(prof.profile.tenantId, ctx.tenantId);

  const app = makeApp();
  await withServer(app, async (port) => {
    const res = await fetch(
      `http://127.0.0.1:${port}/api/aivos/growth/v1/health`,
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.health.sprint, '20.5');
  });
});

// ─── Sprint 20.2: GRW23–GRW31 ─────────────────────────────────────────────

const CTX22 = { tenantId: 't-202', userId: 'u-202' };

test('GRW23 daily brief generation', () => {
  const brief = buildDailyBrief({
    profile: { displayName: 'Alex', persona: 'marketplace' },
    missions: [{ title: 'Post Content' }, { title: 'Engage' }],
    revenue: { today: 120 },
    feed: { top: [{ title: 'New lead' }] },
  });
  assert.match(brief.greeting, /Good Morning Alex/);
  assert.equal(brief.missions.length, 2);
  assert.equal(brief.revenueToday, 120);
  assert.ok(brief.feedHighlights.length >= 1);

  const rt = makeRuntime();
  rt.growth.seedUserContext(CTX22);
  const built = rt.growth.dailyBrief.build(CTX22);
  assert.equal(built.ok, true);
  assert.ok(built.brief.greeting);
});

test('GRW24 journey FSM transitions', () => {
  assert.equal(transitionJourney(JourneyState.ONBOARDING, 'MISSION_COMPLETED'), JourneyState.DISCOVERY);
  assert.equal(transitionJourney(JourneyState.DISCOVERY, 'MISSION_COMPLETED'), JourneyState.FIRST_SUCCESS);

  const rt = makeRuntime();
  const after = rt.growth.journey.onEvent(CTX22, 'MISSION_COMPLETED');
  assert.equal(after.fsmState, JourneyState.DISCOVERY);
});

test('GRW25 loyalty XP leveling', () => {
  const user = updateLoyalty({ xp: 90, coins: 0 }, { xp: 20, coins: 10 });
  assert.equal(user.xp, 110);
  assert.equal(user.coins, 10);
  assert.equal(user.level, 1);

  const rt = makeRuntime();
  const result = rt.growth.loyalty.apply(CTX22, { xp: 150, coins: 30 });
  assert.equal(result.loyalty.level, 1);
});

test('GRW26 feed ranking correctness', () => {
  const items = rankFeed([
    { id: 'a', urgency: 10, revenue: 10, mission: 0, preference: 10, freshness: 0.1 },
    { id: 'b', urgency: 90, revenue: 80, mission: 1, preference: 90, freshness: 1 },
  ]);
  assert.equal(items[0].id, 'b');
  assert.ok(items[0].rankScore >= items[1].rankScore);
});

test('GRW27 mission scheduler', () => {
  const missions = generateMission({
    journey: { fsmState: JourneyState.PRO },
    habit: { streak: 7 },
    revenue: { today: 50 },
  });
  assert.ok(missions.length >= 3);
  assert.ok(missions.some((m) => m.title.includes('advanced') || m.id === 'm-pro'));

  const rt = makeRuntime();
  const scheduled = rt.growth.missionScheduler.generate(CTX22);
  assert.ok(scheduled.length >= 2);
});

test('GRW28 reward issuance', () => {
  const issued = issueReward({}, { rewardPoints: 25 });
  assert.equal(issued.xp, 25);
  assert.equal(issued.coins, 50);

  const rt = makeRuntime();
  rt.growth.seedUserContext(CTX22);
  const missions = rt.growth.mission.list(CTX22);
  const result = rt.growth.mission.complete(CTX22, { missionId: missions[0].missionId });
  assert.ok(result.reward?.balance > 0 || result.reward?.points > 0);
});

test('GRW29 notification priority', () => {
  const note = pushNotification({ type: 'mission.ready', priority: 90, payload: { missionId: 'm1' } });
  assert.equal(note.priority, 90);
  assert.ok(note.timestamp);

  const rt = makeRuntime();
  const pushed = rt.growth.notification.push(CTX22, {
    type: 'reward.granted',
    priority: 85,
    payload: { points: 10 },
  });
  assert.equal(pushed.ok, true);
  const list = rt.growth.notification.list(CTX22);
  assert.ok(list.some((n) => n.priority === 85));
});

test('GRW30 event to growth loop', () => {
  const rt = makeRuntime();
  rt.growth.seedUserContext(CTX22);
  const missions = rt.growth.mission.list(CTX22);
  const handled = rt.growth.eventBridge.handle('mission.completed', {
    tenantId: CTX22.tenantId,
    userId: CTX22.userId,
    missionId: missions[0].missionId,
    correlationId: 'evt-grw30',
  });
  assert.ok(handled.result || handled.issued || handled.ok);
  assert.ok(rt.growth.notification.list(CTX22).length >= 1);
});

test('GRW31 morning to evening cycle', async () => {
  const rt = makeRuntime();
  rt.growth.seedUserContext(CTX22);
  const missions = rt.growth.mission.list(CTX22);
  const day = await rt.growth.engagementLoop.runFullDay(CTX22, {
    missionId: missions[0].missionId,
  });
  assert.equal(day.morning.ok, true);
  assert.ok(day.morning.brief);
  assert.equal(day.evening.ok, true);
  assert.ok(day.evening.summary);
});

test('GRW32 sprint 20.2 health and API routes', async () => {
  const rt = makeRuntime();
  assert.equal(rt.growth.health().sprint, '20.5');
  assert.ok(rt.growth.health().modules.includes('dailyBrief'));

  const app = makeApp();
  await withServer(app, async (port) => {
    const briefRes = await fetch(`http://127.0.0.1:${port}/api/aivos/growth/brief?tenantId=t-202&userId=u-202`);
    assert.equal(briefRes.status, 200);
    const coachRes = await fetch(`http://127.0.0.1:${port}/api/aivos/growth/coach?tenantId=t-202&userId=u-202&persona=marketplace`);
    assert.equal(coachRes.status, 200);
    const coachBody = await coachRes.json();
    assert.match(coachBody.data.nextBestAction, /Upload|product|mission/i);
  });
});

test('GRW coach insight by persona', () => {
  const advice = coach({ persona: 'marketplace' }, {});
  assert.match(advice.insight, /marketplace/i);
  assert.match(advice.nextBestAction, /Upload/i);
});

// ─── Sprint 20.3: GRW33–GRW41 ─────────────────────────────────────────────

const CTX23 = { tenantId: 't-203', userId: 'u-203' };

test('GRW33 dashboard composer snapshot', () => {
  const rt = makeRuntime();
  rt.growth.seedUserContext({ ...CTX23, persona: 'food' });
  const dash = rt.growth.dashboard.compose(CTX23);
  assert.equal(dash.ok, true);
  assert.equal(dash.meta.screen, 'Dashboard');
  assert.ok(dash.dashboard.profile);
  assert.ok(dash.dashboard.kpis);
  assert.ok(Array.isArray(dash.dashboard.nba));
});

test('GRW34 all 15 KPIs computable', () => {
  const rt = makeRuntime();
  rt.growth.seedUserContext(CTX23);
  rt.growth.kpi.ingest(CTX23, 'growth.mission.assigned');
  rt.growth.kpi.ingest(CTX23, 'growth.mission.completed');
  rt.growth.kpi.ingest(CTX23, 'growth.nba.presented');
  rt.growth.kpi.ingest(CTX23, 'growth.nba.executed');
  const snap = rt.growth.getKpis(CTX23, { window: '7d' });
  assert.equal(snap.ok, true);
  for (const id of KPI_IDS) {
    assert.ok(snap.kpis[id] != null, `missing ${id}`);
  }
  assert.equal(KPI_IDS.length, 15);
});

test('GRW35 NBA ranking aggregates missions and recommendations', () => {
  const rt = makeRuntime();
  rt.growth.seedUserContext({ ...CTX23, persona: 'marketplace' });
  const ranked = rt.growth.nba.rank(CTX23);
  assert.ok(ranked.length >= 1);
  assert.ok(ranked[0].nbaScore != null);
  assert.ok(ranked[0].reason || ranked[0].title);
});

test('GRW36 personal AI persona per tenant', () => {
  const rt = makeRuntime();
  rt.growth.personalization.learn(
    { tenantId: 't-food', userId: 'u1' },
    { vertical: 'food', signal: 'preference' },
  );
  const p = rt.growth.personalization.get({ tenantId: 't-food', userId: 'u1' });
  assert.equal(p.persona, 'food');
  assert.ok(p.weights.mission > 0);

  const rt2 = makeRuntime();
  rt2.growth.personalization.learn(
    { tenantId: 't-resume', userId: 'u1' },
    { vertical: 'resume', signal: 'preference' },
  );
  const p2 = rt2.growth.personalization.get({ tenantId: 't-resume', userId: 'u1' });
  assert.equal(p2.persona, 'resume');
  assert.notEqual(p.weights.marketplace, p2.weights.marketplace);
});

test('GRW37 coach AI advise with orchestrator delegate path', async () => {
  const rt = makeRuntime();
  rt.growth.seedUserContext({ ...CTX23, persona: 'marketplace' });
  const advice = await rt.growth.coach.advise(CTX23, { question: 'What should I do today?' });
  assert.equal(advice.ok, true);
  assert.ok(advice.insight);
  assert.ok(advice.nextBestAction);
});

test('GRW38 UI state envelope dashboard API', async () => {
  const app = makeApp();
  await withServer(app, async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/aivos/growth/dashboard?tenantId=t-203&userId=u-203`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.meta.version, '20.5.0');
    assert.ok(body.data.dashboard);
  });
});

test('GRW39 loop FSM all phases reachable', () => {
  const rt = makeRuntime();
  const c = { tenantId: 't-loop', userId: 'u-loop' };
  const phases = ['OPEN', 'BRIEFING', 'MISSIONING', 'EXECUTING', 'REWARDING', 'LEARNING', 'RECOMMENDING', 'REVIEWING', 'IDLE'];
  rt.growth.loop.transition(c, 'OPEN');
  rt.growth.loop.transition(c, 'BRIEFING');
  rt.growth.loop.transition(c, 'MISSIONING');
  rt.growth.loop.transition(c, 'EXECUTING');
  rt.growth.loop.transition(c, 'REWARDING');
  rt.growth.loop.transition(c, 'LEARNING');
  rt.growth.loop.transition(c, 'RECOMMENDING');
  rt.growth.loop.transition(c, 'REVIEWING');
  const final = rt.growth.loop.transition(c, 'IDLE');
  assert.equal(final.phase, 'IDLE');
  assert.ok(phases.includes(final.phase));
});

test('GRW40 churn score and retention plan', () => {
  const rt = makeRuntime();
  rt.growth.seedUserContext(CTX23);
  const score = rt.growth.churn.score(CTX23);
  assert.ok(score.risk >= 0 && score.risk <= 1);
  const plan = rt.growth.retention.plan(CTX23);
  assert.equal(plan.ok, true);
  assert.ok(Array.isArray(plan.actions));
});

test('GRW41 sprint 20.5 production health and readiness', () => {
  const rt = makeRuntime();
  const h = rt.growth.health();
  assert.equal(h.sprint, '20.5');
  assert.equal(h.rc, 'v20.0.0-rc.1');
  assert.ok(h.modules.includes('retentionJob'));

  const ready = rt.growth.readiness({ regressionPass: 399, regressionTotal: 399 });
  assert.equal(ready.sprint, '20.5');
  assert.ok(ready.items.some((i) => i.id === 'retention_job' && i.pass));
});

test('GRW42 mission start abandon execute HTTP routes', async () => {
  const app = makeApp();
  await withServer(app, async (port) => {
    const base = `http://127.0.0.1:${port}/api/aivos/growth`;
    const q = `tenantId=${CTX204.tenantId}&userId=${CTX204.userId}`;

    await fetch(`${base}/profile?${q}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona: 'marketplace' }),
    });

    const listRes = await fetch(`${base}/missions?${q}`);
    const listBody = await listRes.json();
    const mid = listBody.data.missions[0].missionId;

    const startRes = await fetch(`${base}/missions/start?${q}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ missionId: mid }),
    });
    assert.equal(startRes.status, 200);

    const execRes = await fetch(`${base}/missions/execute?${q}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ missionId: mid, input: {} }),
    });
    assert.equal(execRes.status, 200);
    const execBody = await execRes.json();
    assert.equal(execBody.ok, true);

    const abandonRes = await fetch(`${base}/missions/abandon?${q}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ missionId: mid, reason: 'test' }),
    });
    assert.equal(abandonRes.status, 200);
    const abandonBody = await abandonRes.json();
    assert.equal(abandonBody.data.mission.status, 'expired');
  });
});

test('GRW43 feed markRead dismiss and SDK parity', async () => {
  const rt = makeRuntime();
  const ctx = CTX204;
  rt.growth.seedUserContext(ctx);
  const feed = rt.growth.feed.list(ctx);
  const itemId = feed.items[0].id;

  const sdk = createAivosSdk({ runtime: rt });
  await sdk.growth().feed().markRead(ctx, itemId);
  await sdk.growth().feed().dismiss(ctx, itemId);

  const refreshed = rt.growth.feed.list(ctx);
  assert.ok(!refreshed.items.some((i) => i.id === itemId));
});

test('GRW44 integration hub event bridge handlers', () => {
  const rt = makeRuntime();
  const ctx = { tenantId: 't-int', userId: 'u-int' };

  const tenantResult = rt.growth.eventBridge.handle('tenant.created', {
    tenantId: ctx.tenantId,
    ownerId: ctx.userId,
    plan: 'starter',
  });
  assert.equal(tenantResult.ok, true);

  const appResult = rt.growth.eventBridge.handle('application.installed', {
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    appId: 'app-food-ai',
    name: 'Food AI',
  });
  assert.equal(appResult.ok, true);
  assert.ok(rt.growth.mission.list(ctx).some((m) => m.linkedAppId === 'app-food-ai'));

  const mpResult = rt.growth.eventBridge.handle('marketplace.package.installed', {
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    packageId: 'pkg-wf-1',
    packageType: 'workflow',
  });
  assert.equal(mpResult.ok, true);
});

test('GRW45 sprint 20.4 SDK version referral campaign community', async () => {
  const rt = makeRuntime();
  const ctx = CTX204;
  const sdk = createAivosSdk({ runtime: rt });
  const g = sdk.growth();
  assert.equal(g.version, '20.5.0');

  const ref = await g.referral().create(ctx);
  assert.ok(ref.code);
  assert.match(ref.code, /^REF-/);

  const prefs = await g.notification().setPreferences(ctx, { push: false });
  assert.equal(prefs.preferences.push, false);

  const campaign = rt.growth.campaign.plan(ctx, { goal: 'launch' });
  assert.equal(campaign.ok, true);
  assert.ok(campaign.missions.length >= 1);

  const post = rt.growth.community.post(ctx, { title: 'Hello', body: 'World' });
  assert.equal(post.ok, true);
  const commFeed = rt.growth.community.feed(ctx);
  assert.ok(commFeed.items.some((i) => i.title === 'Hello'));
});

// ─── Sprint 20.5: GRW46–GRW50 ─────────────────────────────────────────────

test('GRW46 load test churn batch 10k users under 30s', () => {
  const rt = makeRuntime();
  const start = performance.now();
  for (let i = 0; i < 10000; i += 1) {
    rt.growth.churn.score({ tenantId: `t-load-${i % 100}`, userId: `u-${i}` });
  }
  const elapsed = performance.now() - start;
  assert.ok(elapsed < 30000, `churn batch took ${elapsed.toFixed(0)}ms`);
});

test('GRW47 feed list P95 under 200ms', () => {
  const rt = makeRuntime();
  const timings = [];
  for (let i = 0; i < 100; i += 1) {
    const ctx = { tenantId: 't-perf', userId: `u-perf-${i}` };
    rt.growth.seedUserContext(ctx);
    const t0 = performance.now();
    rt.growth.feed.list(ctx);
    timings.push(performance.now() - t0);
  }
  timings.sort((a, b) => a - b);
  const p95 = timings[Math.floor(timings.length * 0.95)];
  assert.ok(p95 < 200, `feed P95 ${p95.toFixed(2)}ms`);
});

test('GRW48 retention job purges expired feed and notifications', () => {
  const rt = makeRuntime();
  const ctx = { tenantId: 't-ret', userId: 'u-ret' };
  const storage = rt.growth.storage;
  const notifTable = storage.tables.notifications;
  const feedTable = storage.tables.feed;
  const old = new Date(Date.now() - 100 * 86400000).toISOString();

  storage.put(notifTable, storage.key(ctx.tenantId, ctx.userId), [{
    id: 'old-notif',
    type: 'test',
    timestamp: Date.parse(old),
    read: false,
  }]);
  storage.put(feedTable, storage.key(ctx.tenantId, ctx.userId), {
    items: [{ id: 'f1', kind: 'mission', priority: 50 }],
    refreshedAt: old,
  });

  const result = rt.growth.retentionJob.run({ tenantId: ctx.tenantId });
  assert.equal(result.ok, true);
  assert.ok(result.total >= 2);

  const purged = rt.growth.retentionJob.purgedLog();
  assert.ok(purged.some((p) => p.dataClass === 'notifications'));
  assert.ok(purged.some((p) => p.dataClass === 'feedCache'));
});

test('GRW49 growth boundary check script passes', async () => {
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const dir = dirname(fileURLToPath(import.meta.url));
  const script = join(dir, '../scripts/growth-boundary-check.js');
  const proc = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(proc.status, 0, proc.stderr || proc.stdout);
  assert.match(proc.stdout, /growth-boundary-check PASS/);
});

test('GRW50 production RC readiness HTTP and tenant purge', async () => {
  const rt = makeRuntime();
  const ctx = { tenantId: 't-rc', userId: 'u-rc' };
  rt.growth.profile.upsert(ctx, { persona: 'marketplace' });

  const purge = rt.growth.eventBridge.handle('tenant.purged', { tenantId: ctx.tenantId });
  assert.equal(purge.ok, true);

  const app = makeApp();
  await withServer(app, async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/aivos/growth/readiness`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.data.rc, 'v20.0.0-rc.1');
    assert.equal(body.data.sprint, '20.5');
    assert.ok(body.data.items.length >= 8);
  });
});
