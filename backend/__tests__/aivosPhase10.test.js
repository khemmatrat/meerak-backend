/**
 * Phase 10 – Billing Integration (WORKFLOW_MARKETPLACE_SPEC §7)
 * Tests BI01–BI12
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

process.env.AIVOS_RESUME_PLUGIN_ENABLED = '1';
process.env.AIVOS_RUNTIME_ENABLED       = '1';
process.env.AIVOS_MARKETPLACE_ENABLED   = '1';
process.env.AIVOS_BILLING_ENABLED       = '1';

import { createRuntime } from '../lib/aivos/runtime/index.js';
import { createBillingEngine, isBillingEnabled } from '../lib/aivos/billing/index.js';
import { createMarketplaceEngine } from '../lib/aivos/marketplace/index.js';
import { createCostDashboard } from '../lib/aivos/runtime/costDashboard.js';
import { createMemoryRuntimeStore } from '../lib/aivos/runtime/index.js';
import { registerAivosRoutes } from '../lib/aivos/index.js';

const __dir = dirname(fileURLToPath(import.meta.url));

const mockGrowth = {
  getGrowthStatus: async (userId) => ({
    userId,
    ai_video_credits: userId === 'poor-user' ? 0 : 10,
    tier: userId === 'free-user' ? 'free' : 'premium',
  }),
};

function makeRuntime(overrides = {}) {
  return createRuntime({ syncExecute: true, growthEngine: mockGrowth, ...overrides });
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

test('BI01 billing disabled returns stub with enabled=false', () => {
  const saved = process.env.AIVOS_BILLING_ENABLED;
  process.env.AIVOS_BILLING_ENABLED = '0';
  const rt = makeRuntime();
  assert.equal(rt.billingEngine.enabled, false);
  process.env.AIVOS_BILLING_ENABLED = saved;
});

test('BI02 credit check passes when user has sufficient credits', async () => {
  const rt = makeRuntime();
  const result = await rt.billingEngine.checkCredits({ userId: 'u1', pluginId: 'resume-ai' });
  assert.equal(result.ok, true);
  assert.ok(result.available >= result.required);
});

test('BI03 credit check rejects INSUFFICIENT_CREDITS', async () => {
  const rt = makeRuntime();
  await assert.rejects(
    () => rt.billingEngine.checkCredits({ userId: 'poor-user', pluginId: 'resume-ai' }),
    (e) => e.code === 'INSUFFICIENT_CREDITS'
  );
});

test('BI04 plugin credit_multiplier applied to metered charge', () => {
  const store = createMemoryRuntimeStore({});
  const marketplace = createMarketplaceEngine({ store, events: null });
  const billing = createBillingEngine({
    growthEngine: mockGrowth,
    costDashboard: createCostDashboard({ store }),
    marketplace,
    store,
  });
  assert.equal(billing.getMultiplier('resume-ai'), 1);
});

test('BI05 meterUsage records charge in cost ledger', async () => {
  const store = createMemoryRuntimeStore({});
  const marketplace = createMarketplaceEngine({ store, events: null });
  const billing = createBillingEngine({
    growthEngine: mockGrowth,
    costDashboard: createCostDashboard({ store }),
    marketplace,
    store,
  });
  const metered = await billing.meterUsage({ jobId: 'job-bi05', userId: 'u1', pluginId: 'resume-ai' });
  assert.equal(metered.charged, 1);
  const usage = billing.getJobUsage('job-bi05');
  assert.equal(usage.total, 1);
  assert.equal(usage.entries.length, 1);
});

test('BI06 getStatus returns credits and tier from growthEngine', async () => {
  const rt = makeRuntime();
  const status = await rt.billingEngine.getStatus('u1');
  assert.equal(status.credits, 10);
  assert.equal(status.tier, 'premium');
});

test('BI07 entitlement gate rejects free tier for standard requirement', async () => {
  const rt = makeRuntime();
  await assert.rejects(
    () => rt.billingEngine.checkEntitlement({ userId: 'free-user', requiredTier: 'standard' }),
    (e) => e.code === 'ENTITLEMENT_TIER_INSUFFICIENT'
  );
});

test('BI08 marketplace install checks growth entitlements tier', async () => {
  const rt = makeRuntime();
  await rt.marketplace.install({ packageId: 'resume-ai', type: 'plugin', userId: 'u1' });
  await assert.rejects(
    () => rt.marketplace.install({ packageId: 'video-pipeline-v1', type: 'workflow', userId: 'free-user' }),
    (e) => e.code === 'CAPABILITY_GAP'
  );
});

test('BI09 submitJob meters usage after execution', async () => {
  const rt = makeRuntime();
  const job = await rt.taskRuntime.submitJob({ userId: 'u1', pluginId: 'resume-ai', intent: { role: 'Dev', goals: 'Test' } });
  const usage = rt.billingEngine.getJobUsage(job.id);
  assert.ok(usage.total >= 1, 'usage should be metered');
});

test('BI10 submitJob blocked when credits insufficient', async () => {
  const rt = makeRuntime();
  await assert.rejects(
    () => rt.taskRuntime.submitJob({ userId: 'poor-user', pluginId: 'resume-ai', intent: { role: 'Dev', goals: 'Test' } }),
    (e) => e.code === 'INSUFFICIENT_CREDITS'
  );
});

test('BI11 HTTP billing status endpoint returns credits', async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 'u1' }; next(); });
  registerAivosRoutes(app, {
    runtimeEnabled: true,
    marketplaceEnabled: true,
    billingEnabled: true,
    growthEngine: mockGrowth,
    forceNew: true,
    authenticateToken: (_q, _s, n) => n(),
  });
  await withServer(app, async (port) => {
    const res  = await fetch(`http://127.0.0.1:${port}/api/aivos/billing/status?userId=u1`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.credits, 10);
  });
});

test('BI12 billing module has no Kernel imports', () => {
  const dir = join(__dir, '../lib/aivos/billing');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const src = readFileSync(join(dir, f), 'utf8');
    assert.ok(!/from\s+['"][^'"]*kernel[^'"]*['"]/i.test(src), `billing/${f} must not import Kernel`);
  }
});
