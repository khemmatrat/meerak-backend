/**
 * Phase 17 – AI Business Application Framework
 * Tests APP01–APP16
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFileSync, readdirSync } from 'fs';
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

import { createRuntime } from '../lib/aivos/runtime/index.js';
import {
  createApplicationEngine,
  APPLICATION_PHASE,
  validateManifest,
} from '../lib/aivos/application/index.js';
import { registerAivosRoutes } from '../lib/aivos/index.js';

const __dir = dirname(fileURLToPath(import.meta.url));

const mockGrowth = {
  getGrowthStatus: async (userId) => ({
    userId,
    ai_video_credits: 10,
    tier: 'premium',
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
    forceNew: true,
    growthEngine: mockGrowth,
    authenticateToken: (_q, _s, n) => n(),
    ...overrides,
  });
  return app;
}

test('APP01 manifest normalization includes bundles and tenant scope', () => {
  const tpl = makeRuntime().applications.getTemplate('app-food-ai');
  assert.equal(tpl.id, 'app-food-ai');
  assert.ok(tpl.skillBundle.includes('ai-food'));
  assert.ok(tpl.workflowBundle.includes('wf-food-delivery'));
  assert.equal(tpl.tenantScoped, true);
});

test('APP02 validator accepts catalog app and rejects invalid manifest', () => {
  const tpl = makeRuntime().applications.getTemplate('app-trip-ai');
  const valid = validateManifest(tpl);
  assert.equal(valid.ok, true);
  const invalid = validateManifest({ id: '', name: 'X' });
  assert.equal(invalid.ok, false);
});

test('APP03 registry register find list with tenant isolation', async () => {
  const rt = makeRuntime();
  const tpl = rt.applications.getTemplate('app-food-ai');
  await rt.applications.install(tpl, { tenantId: 'tenant-a' });
  assert.ok(rt.applications.registry.find('app-food-ai', { tenantId: 'tenant-a' }));
  assert.equal(rt.applications.registry.find('app-food-ai', { tenantId: 'tenant-b' }), null);
  assert.equal(rt.applications.registry.list({ tenantId: 'tenant-a' }).length, 1);
});

test('APP04 catalog lists ten built-in business applications', () => {
  const rt = makeRuntime();
  const catalog = rt.applications.catalog.list();
  assert.equal(catalog.length, 10);
  assert.ok(catalog.some((a) => a.id === 'app-video-marketing-ai'));
});

test('APP05 installer installs skill workflow and knowledge bundles', async () => {
  const rt = makeRuntime();
  const tpl = rt.applications.getTemplate('app-food-ai');
  const result = await rt.applications.install(tpl, { tenantId: 't1', userId: 'u1' });
  assert.ok(result.installed);
  assert.ok(result.installed.skills.includes('ai-food'));
  assert.ok(result.installed.workflows.includes('wf-food-delivery'));
  assert.ok(rt.skills.registry.findSkill('ai-food'));
});

test('APP06 lifecycle enable disable upgrade rollback', async () => {
  const rt = makeRuntime();
  const tpl = rt.applications.getTemplate('app-hotel-ai');
  await rt.applications.install(tpl, { tenantId: 't1' });
  rt.applications.enable('app-hotel-ai', { tenantId: 't1' });
  assert.equal(rt.applications.registry.find('app-hotel-ai', { tenantId: 't1' }).enabled, true);
  rt.applications.disable('app-hotel-ai', { tenantId: 't1' });
  assert.equal(rt.applications.registry.find('app-hotel-ai', { tenantId: 't1' }).enabled, false);
  const v2 = { ...tpl, version: '1.1.0', description: 'hotel v2' };
  rt.applications.upgrade('app-hotel-ai', v2, { tenantId: 't1' });
  assert.equal(rt.applications.registry.find('app-hotel-ai', { tenantId: 't1' }).manifest.version, '1.1.0');
});

test('APP07 dependency resolver detects missing tenant', async () => {
  const rt = makeRuntime();
  const tpl = rt.applications.getTemplate('app-trip-ai');
  const check = await rt.applications.dependency.resolve(tpl, { tenantId: null });
  assert.equal(check.ok, false);
  assert.ok(check.gaps.some((g) => g.kind === 'tenant'));
});

test('APP08 application runtime executes primary workflow', async () => {
  const rt = makeRuntime();
  const tpl = rt.applications.getTemplate('app-food-ai');
  await rt.applications.provision(tpl, { tenantId: 't-run', userId: 'u1', config: { deliveryZone: 'Siam' } });
  const result = await rt.applications.execute('app-food-ai', {
    tenantId: 't-run',
    userId:   'u1',
    input:    { deliveryZone: 'Siam' },
  });
  assert.equal(result.appId, 'app-food-ai');
  assert.equal(result.workflowId, 'wf-food-delivery');
  assert.equal(result.ok, true);
});

test('APP09 provisioning installs bundles settings and enables app', async () => {
  const rt = makeRuntime();
  const tpl = rt.applications.getTemplate('app-restaurant-ai');
  const result = await rt.applications.provision(tpl, {
    tenantId: 't-prov',
    config:   { cuisine: 'Thai' },
  });
  assert.equal(result.provisioned, true);
  assert.equal(result.settings.cuisine, 'Thai');
  assert.equal(rt.applications.registry.find('app-restaurant-ai', { tenantId: 't-prov' }).enabled, true);
});

test('APP10 metrics and audit record install and execute events', async () => {
  const rt = makeRuntime();
  assert.ok(rt.applications);
  assert.equal(rt.applications.phase, APPLICATION_PHASE);
  const tpl = rt.applications.getTemplate('app-food-ai');
  await rt.applications.provision(tpl, { tenantId: 't-met', userId: 'u1' });
  rt.applications.metrics.record({ appId: 'app-food-ai', tenantId: 't-met', action: 'execute', success: true, latencyMs: 5 });
  const stats = rt.applications.getMetrics({ appId: 'app-food-ai', tenantId: 't-met' });
  assert.ok(stats.totalEvents >= 1);
  assert.ok(rt.applications.audit.list({ appId: 'app-food-ai' }).length >= 1);
});

test('APP11 HTTP application routes catalog install execute metrics', async () => {
  const dir = join(__dir, '../lib/aivos/application');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const src = readFileSync(join(dir, f), 'utf8');
    assert.ok(!/from\s+['"][^'"]*kernel[^'"]*['"]/i.test(src), `application/${f} must not import Kernel`);
  }

  await withServer(makeApp(), async (port) => {
    const catalog = await fetch(`http://127.0.0.1:${port}/api/aivos/apps/catalog`).then((r) => r.json());
    assert.equal(catalog.ok, true);
    assert.equal(catalog.catalog.length, 10);

    const install = await fetch(`http://127.0.0.1:${port}/api/aivos/apps/install`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ appId: 'app-food-ai', tenantId: 'http-tenant' }),
    });
    assert.equal(install.status, 201);

    await fetch(`http://127.0.0.1:${port}/api/aivos/apps/enable`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ appId: 'app-food-ai', tenantId: 'http-tenant' }),
    });

    const exec = await fetch(`http://127.0.0.1:${port}/api/aivos/apps/execute`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ appId: 'app-food-ai', tenantId: 'http-tenant', input: { deliveryZone: 'Ari' } }),
    });
    assert.equal(exec.status, 201);

    const metrics = await fetch(`http://127.0.0.1:${port}/api/aivos/apps/metrics`).then((r) => r.json());
    assert.equal(metrics.ok, true);
    assert.ok(metrics.metrics.totalEvents >= 1);
  });
});

test('APP12 full install execute uninstall lifecycle', async () => {
  const rt = makeRuntime();
  const tpl = rt.applications.getTemplate('app-food-ai');
  await rt.applications.install(tpl, { tenantId: 'full', userId: 'u1' });
  rt.applications.enable('app-food-ai', { tenantId: 'full' });
  const run = await rt.applications.execute('app-food-ai', {
    tenantId: 'full',
    userId:   'u1',
    input:    { deliveryZone: 'Silom' },
  });
  assert.equal(run.ok, true);
  const removed = await rt.applications.uninstall('app-food-ai', { tenantId: 'full' });
  assert.equal(removed.uninstalled, true);
  assert.equal(rt.applications.registry.find('app-food-ai', { tenantId: 'full' }), null);
});

test('APP13 cross-tenant isolation tenant A cannot read tenant B', async () => {
  const rt = makeRuntime();
  const tpl = rt.applications.getTemplate('app-food-ai');

  await rt.applications.provision(tpl, { tenantId: 'tenant-a', config: { deliveryZone: 'ZoneA' } });
  await rt.applications.provision(tpl, { tenantId: 'tenant-b', config: { deliveryZone: 'ZoneB' } });

  assert.equal(rt.applications.settings.get('app-food-ai', { tenantId: 'tenant-a' }).deliveryZone, 'ZoneA');
  assert.equal(rt.applications.settings.get('app-food-ai', { tenantId: 'tenant-b' }).deliveryZone, 'ZoneB');
  assert.notEqual(
    rt.applications.settings.get('app-food-ai', { tenantId: 'tenant-a' }).deliveryZone,
    'ZoneB',
  );

  assert.equal(rt.applications.registry.find('app-food-ai', { tenantId: 'tenant-a' }).tenantId, 'tenant-a');
  assert.equal(rt.applications.registry.list({ tenantId: 'tenant-a' }).length, 1);
  assert.equal(rt.applications.registry.list({ tenantId: 'tenant-b' }).length, 1);
  assert.equal(rt.applications.registry.find('app-food-ai', { tenantId: 'tenant-a' }).tenantId, 'tenant-a');
  assert.equal(rt.applications.registry.find('app-food-ai', { tenantId: 'tenant-b' }).tenantId, 'tenant-b');

  const rtIsolated = makeRuntime();
  const tplOnlyA = rtIsolated.applications.getTemplate('app-food-ai');
  await rtIsolated.applications.provision(tplOnlyA, { tenantId: 'tenant-a', config: { deliveryZone: 'PrivateA' } });
  await assert.rejects(
    () => rtIsolated.applications.execute('app-food-ai', { tenantId: 'tenant-b', userId: 'u1', input: {} }),
    (e) => e.code === 'APPLICATION_NOT_ENABLED',
  );

  rt.applications.metrics.record({ appId: 'app-food-ai', tenantId: 'tenant-a', action: 'execute', success: true, latencyMs: 1 });
  assert.equal(rt.applications.getMetrics({ appId: 'app-food-ai', tenantId: 'tenant-b' }).totalEvents, 0);

  const auditA = rt.applications.audit.list({ appId: 'app-food-ai', tenantId: 'tenant-a' });
  const auditB = rt.applications.audit.list({ appId: 'app-food-ai', tenantId: 'tenant-b' });
  assert.ok(auditA.length >= 1);
  assert.ok(auditB.length >= 1);
  assert.ok(auditA.every((e) => e.tenant_id === 'tenant-a'));
  assert.ok(auditB.every((e) => e.tenant_id === 'tenant-b'));
});

test('APP14 upgrade to v3 rollback to v2 then execute', async () => {
  const rt = makeRuntime();
  const tpl = rt.applications.getTemplate('app-trip-ai');
  const tenantId = 'ver-tenant';

  await rt.applications.install(tpl, { tenantId });
  rt.applications.enable('app-trip-ai', { tenantId });

  const v2 = { ...tpl, version: '1.1.0', description: 'trip v2' };
  const v3 = { ...tpl, version: '1.2.0', description: 'trip v3' };
  rt.applications.upgrade('app-trip-ai', v2, { tenantId });
  rt.applications.upgrade('app-trip-ai', v3, { tenantId });
  assert.equal(rt.applications.registry.find('app-trip-ai', { tenantId }).manifest.version, '1.2.0');

  const rolled = rt.applications.rollback('app-trip-ai', { tenantId });
  assert.equal(rolled.manifest.version, '1.1.0');
  assert.equal(rt.applications.registry.find('app-trip-ai', { tenantId }).manifest.version, '1.1.0');

  const run = await rt.applications.execute('app-trip-ai', {
    tenantId,
    userId: 'u1',
    input:  { destination: 'Bangkok' },
  });
  assert.equal(run.ok, true);
  assert.equal(run.workflowId, 'wf-trip-planner');
});

test('APP15 marketplace install provision execute chain', async () => {
  const rt = makeRuntime();
  const tpl = rt.applications.getTemplate('app-resume-ai');

  const pkg = await rt.marketplace.install({ packageId: 'resume-ai', type: 'plugin', userId: 'u1' });
  assert.ok(pkg);

  const result = await rt.applications.provision(tpl, {
    tenantId: 'mp-tenant',
    userId:   'u1',
    config:   { role: 'Engineer', goals: 'Lead' },
  });
  assert.equal(result.provisioned, true);
  assert.ok(
    result.install.installed.marketplace.length >= 1
    || result.install.installed.skills.includes('ai-resume'),
  );

  const installed = await rt.marketplace.listInstalled();
  assert.ok(installed.some((p) => p.package_id === 'resume-ai'));

  const exec = await rt.applications.execute('app-resume-ai', {
    tenantId: 'mp-tenant',
    userId:   'u1',
    input:    { role: 'Engineer', goals: 'Lead' },
  });
  assert.equal(exec.ok, true);
  assert.equal(exec.workflowId, 'wf-resume');
});

test('APP16 billing integration execute meters credits and records revenue', async () => {
  const credits = { 'bill-user': 10 };
  const growthEngine = {
    getGrowthStatus: async (userId) => ({
      userId,
      ai_video_credits: credits[userId] ?? 10,
      tier: 'premium',
    }),
    deductCredits(userId, amount) {
      credits[userId] = (credits[userId] ?? 10) - amount;
    },
  };

  const rt = makeRuntime({ growthEngine });
  const tpl = rt.applications.getTemplate('app-food-ai');
  await rt.applications.provision(tpl, { tenantId: 'bill-tenant', userId: 'bill-user' });

  const before = (await rt.billingEngine.getStatus('bill-user')).credits;
  const exec = await rt.applications.execute('app-food-ai', {
    tenantId: 'bill-tenant',
    userId:   'bill-user',
    input:    { deliveryZone: 'BillingZone' },
  });

  assert.equal(exec.ok, true);
  assert.ok(exec.creditCheck?.ok);
  assert.ok(exec.billing);
  assert.ok(exec.billing.charged >= 1);

  const usage = rt.billingEngine.getJobUsage(exec.billing.jobId);
  assert.ok(usage.total >= 1);
  assert.equal(usage.entries.length, 1);

  assert.ok(exec.revenue);
  assert.ok(exec.revenue.amount >= 0);
  const rev = rt.revenueEngine.aiService.revenue({ serviceId: 'app-food-ai', customerId: 'bill-user' });
  assert.ok(rev.entryCount >= 1);

  const after = (await rt.billingEngine.getStatus('bill-user')).credits;
  assert.ok(credits['bill-user'] < before);
  assert.equal(after, credits['bill-user']);
});
