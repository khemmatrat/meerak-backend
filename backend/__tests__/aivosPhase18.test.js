/**
 * Phase 18 – Multi-Tenant SaaS Platform
 * Tests TEN01–TEN16
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
process.env.AIVOS_TENANT_ENABLED          = '1';

import { createRuntime } from '../lib/aivos/runtime/index.js';
import { validateManifest, TENANT_PHASE } from '../lib/aivos/tenant/index.js';
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
    tenantEnabled: true,
    forceNew: true,
    growthEngine: mockGrowth,
    authenticateToken: (_q, _s, n) => n(),
    ...overrides,
  });
  return app;
}

const sampleManifest = {
  id: 'acme-corp',
  name: 'Acme Corp',
  plan: 'premium',
  ownerId: 'owner-1',
};

test('TEN01 registry register find list', async () => {
  const rt = makeRuntime();
  assert.ok(rt.tenants);
  assert.equal(rt.tenants.phase, TENANT_PHASE);
  const v = validateManifest(sampleManifest);
  assert.equal(v.ok, true);
  await rt.tenants.create(v.manifest, { ownerId: 'owner-1' });
  assert.ok(rt.tenants.registry.find('acme-corp'));
  assert.equal(rt.tenants.registry.list().length, 1);
});

test('TEN02 provision creates workspace storage subscription quotas', async () => {
  const rt = makeRuntime();
  const v = validateManifest({ id: 'prov-tenant', name: 'Prov Tenant', plan: 'standard' });
  const result = await rt.tenants.provision(v.manifest, {
    ownerId: 'u1',
    settings: { locale: 'th' },
  });
  assert.equal(result.provisioned, true);
  assert.equal(result.workspace.settings.locale, 'th');
  assert.ok(result.subscription);
  assert.ok(result.quotas);
});

test('TEN03 isolation blocks cross-tenant access', async () => {
  const rt = makeRuntime();
  await rt.tenants.create({ id: 'iso-a', name: 'ISO A', plan: 'standard' }, { ownerId: 'u-a' });
  await rt.tenants.create({ id: 'iso-b', name: 'ISO B', plan: 'standard' }, { ownerId: 'u-b' });
  rt.tenants.storage.put('iso-a', 'secret', 'data-a');
  rt.tenants.storage.put('iso-b', 'secret', 'data-b');
  assert.equal(rt.tenants.storage.get('iso-a', 'secret'), 'data-a');
  assert.equal(rt.tenants.storage.get('iso-b', 'secret'), 'data-b');
  assert.notEqual(rt.tenants.storage.get('iso-a', 'secret'), rt.tenants.storage.get('iso-b', 'secret'));
  await assert.rejects(
    async () => rt.tenants.isolation.assertAccess('iso-a', { actorTenantId: 'iso-b', action: 'read' }),
    { code: 'TENANT_ISOLATION_VIOLATION' },
  );
});

test('TEN04 identity maps users to tenants', async () => {
  const rt = makeRuntime();
  await rt.tenants.create({ id: 'id-tenant', name: 'ID Tenant', plan: 'standard' }, { ownerId: 'user-42' });
  assert.equal(rt.tenants.identity.resolveTenant('user-42'), 'id-tenant');
  rt.tenants.identity.bind({ userId: 'member-1', tenantId: 'id-tenant', role: 'member' });
  assert.equal(rt.tenants.identity.listForTenant('id-tenant').length, 2);
});

test('TEN05 workspace get update per tenant', async () => {
  const rt = makeRuntime();
  await rt.tenants.create({ id: 'ws-tenant', name: 'WS Tenant', plan: 'standard' });
  const ws = rt.tenants.workspace.update('ws-tenant', { settings: { theme: 'dark' } });
  assert.equal(ws.settings.theme, 'dark');
  assert.equal(rt.tenants.workspace.get('ws-tenant').name, 'WS Tenant');
});

test('TEN06 quota check consume and rate limit', async () => {
  const rt = makeRuntime();
  await rt.tenants.create({ id: 'quota-tenant', name: 'Quota', plan: 'free' });
  rt.tenants.quota.init('quota-tenant', { executions_day: 2, api_rpm: 1 });
  rt.tenants.quota.consume('quota-tenant', { resource: 'executions_day', amount: 1 });
  assert.ok(rt.tenants.quota.check('quota-tenant', { resource: 'executions_day', amount: 1 }).ok);
  rt.tenants.quota.checkRateLimit('quota-tenant');
  await assert.rejects(
    async () => rt.tenants.quota.checkRateLimit('quota-tenant'),
    { code: 'TENANT_RATE_LIMIT_EXCEEDED' },
  );
});

test('TEN07 subscription binds billing entitlement', async () => {
  const rt = makeRuntime();
  await rt.tenants.create({ id: 'sub-tenant', name: 'Sub', plan: 'premium' }, { ownerId: 'bill-user' });
  const sub = rt.tenants.subscription.get('sub-tenant');
  assert.equal(sub.plan, 'premium');
  const check = await rt.tenants.subscription.verifyEntitlement('sub-tenant', { userId: 'bill-user' });
  assert.equal(check.ok, true);
});

test('TEN08 lifecycle suspend restore delete', async () => {
  const rt = makeRuntime();
  await rt.tenants.create({ id: 'life-tenant', name: 'Life', plan: 'standard' });
  rt.tenants.suspend('life-tenant');
  assert.equal(rt.tenants.registry.find('life-tenant').state, 'suspended');
  await assert.rejects(
    async () => rt.tenants.isolation.assertAccess('life-tenant', { action: 'execute' }),
    { code: 'TENANT_SUSPENDED' },
  );
  rt.tenants.restore('life-tenant');
  assert.equal(rt.tenants.registry.find('life-tenant').state, 'active');
  rt.tenants.delete('life-tenant');
  assert.equal(rt.tenants.registry.find('life-tenant').state, 'deleted');
});

test('TEN09 backup create and restore to new tenant', async () => {
  const rt = makeRuntime();
  await rt.tenants.create({ id: 'bak-src', name: 'Backup Src', plan: 'standard' }, { ownerId: 'u1' });
  rt.tenants.storage.put('bak-src', 'config', { key: 'value' });
  const bak = rt.tenants.backup.create('bak-src');
  assert.ok(bak.backupId);
  const restored = await rt.tenants.backup.restore(bak.backupId, { newTenantId: 'bak-dst' });
  assert.equal(restored.tenantId, 'bak-dst');
  assert.deepEqual(rt.tenants.storage.get('bak-dst', 'config'), { key: 'value' });
});

test('TEN10 metrics and audit record tenant events', async () => {
  const rt = makeRuntime();
  await rt.tenants.create({ id: 'met-tenant', name: 'Metrics', plan: 'standard' });
  rt.tenants.metrics.record({ tenantId: 'met-tenant', action: 'create', success: true, latencyMs: 3 });
  const stats = rt.tenants.getMetrics({ tenantId: 'met-tenant' });
  assert.ok(stats.totalEvents >= 1);
  assert.ok(rt.tenants.audit.list({ tenantId: 'met-tenant' }).length >= 1);
});

test('TEN11 HTTP tenant routes create provision metrics', async () => {
  const dir = join(__dir, '../lib/aivos/tenant');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const src = readFileSync(join(dir, f), 'utf8');
    assert.ok(!/from\s+['"][^'"]*kernel[^'"]*['"]/i.test(src), `tenant/${f} must not import Kernel`);
  }

  await withServer(makeApp(), async (port) => {
    const create = await fetch(`http://127.0.0.1:${port}/api/aivos/tenants/create`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id: 'http-tenant', name: 'HTTP Tenant', plan: 'standard', ownerId: 'u1' }),
    });
    assert.equal(create.status, 201);

    const provision = await fetch(`http://127.0.0.1:${port}/api/aivos/tenants/provision`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        id: 'http-prov',
        name: 'HTTP Prov',
        plan: 'standard',
        ownerId: 'u1',
        installApps: ['app-food-ai'],
        settings: { deliveryZone: 'Sukhumvit' },
      }),
    });
    assert.equal(provision.status, 201);

    const metrics = await fetch(`http://127.0.0.1:${port}/api/aivos/tenants/metrics?tenantId=http-prov`).then((r) => r.json());
    assert.equal(metrics.ok, true);
    assert.ok(metrics.metrics.totalEvents >= 1);
  });
});

test('TEN12 full tenant create install app execute delete', async () => {
  const rt = makeRuntime();
  const manifest = { id: 'full-tenant', name: 'Full Tenant', plan: 'premium', ownerId: 'u-full' };
  await rt.tenants.provision(manifest, {
    ownerId: 'u-full',
    installApps: ['app-food-ai'],
    settings: { deliveryZone: 'Silom' },
  });
  assert.ok(rt.applications.registry.find('app-food-ai', { tenantId: 'full-tenant' }));

  const run = await rt.tenants.executeApp('app-food-ai', {
    tenantId: 'full-tenant',
    userId:   'u-full',
    input:    { deliveryZone: 'Silom' },
  });
  assert.equal(run.ok, true);
  assert.equal(run.workflowId, 'wf-food-delivery');

  await rt.tenants.deprovision('full-tenant');
  assert.equal(rt.tenants.registry.find('full-tenant').state, 'deleted');
  assert.equal(rt.applications.registry.find('app-food-ai', { tenantId: 'full-tenant' }), null);
});

test('TEN13 cross-tenant isolation blocks knowledge workflow application memory billing', async () => {
  const rt = makeRuntime();
  await rt.tenants.provision({ id: 'ten-a', name: 'Tenant A', plan: 'premium', ownerId: 'user-a' }, {
    ownerId: 'user-a',
    installApps: ['app-food-ai'],
    settings: { deliveryZone: 'ZoneA' },
  });
  await rt.tenants.provision({ id: 'ten-b', name: 'Tenant B', plan: 'premium', ownerId: 'user-b' }, {
    ownerId: 'user-b',
    installApps: ['app-food-ai'],
    settings: { deliveryZone: 'ZoneB' },
  });

  rt.tenants.storage.put('ten-a', 'knowledge:resume', { topic: 'resume', body: 'Tenant A knowledge' });
  rt.tenants.storage.put('ten-b', 'knowledge:resume', { topic: 'resume', body: 'Tenant B knowledge' });
  rt.tenants.storage.put('ten-a', 'workflow:wf-food-delivery', { id: 'wf-food-delivery', tenantId: 'ten-a' });
  rt.tenants.storage.put('ten-b', 'workflow:wf-food-delivery', { id: 'wf-food-delivery', tenantId: 'ten-b' });
  rt.tenants.storage.put('ten-a', 'memory:session', { data: 'memory-a' });
  rt.tenants.storage.put('ten-b', 'memory:session', { data: 'memory-b' });

  assert.throws(
    () => rt.tenants.isolation.guardResource('ten-a', 'ten-b', 'knowledge'),
    { code: 'TENANT_MISMATCH' },
  );
  assert.throws(
    () => rt.tenants.isolation.guardResource('ten-b', 'ten-a', 'workflow'),
    { code: 'TENANT_MISMATCH' },
  );
  assert.notEqual(
    rt.tenants.storage.get('ten-a', 'memory:session').data,
    rt.tenants.storage.get('ten-b', 'memory:session').data,
  );
  assert.equal(rt.applications.registry.find('app-food-ai', { tenantId: 'ten-a' }).tenantId, 'ten-a');
  assert.equal(rt.applications.registry.find('app-food-ai', { tenantId: 'ten-b' }).tenantId, 'ten-b');

  await assert.rejects(
    async () => rt.tenants.executeApp('app-food-ai', {
      tenantId: 'ten-b',
      userId: 'user-a',
      actorTenantId: 'ten-a',
      input: { deliveryZone: 'Hack' },
    }),
    { code: 'TENANT_MISMATCH' },
  );

  await rt.tenants.executeApp('app-food-ai', {
    tenantId: 'ten-a',
    userId: 'user-a',
    input: { deliveryZone: 'ZoneA' },
  });
  const billingA = rt.tenants.storage.list('ten-a').filter((i) => i.key.startsWith('billing:'));
  const billingB = rt.tenants.storage.list('ten-b').filter((i) => i.key.startsWith('billing:'));
  assert.ok(billingA.length >= 1);
  assert.equal(billingB.length, 0);
});

test('TEN14 tenant backup restore full disaster recovery', async () => {
  const rt = makeRuntime();
  const manifest = { id: 'dr-tenant', name: 'DR Tenant', plan: 'premium', ownerId: 'dr-user' };
  await rt.tenants.provision(manifest, {
    ownerId: 'dr-user',
    installApps: ['app-food-ai'],
    settings: { deliveryZone: 'Silom' },
  });

  rt.tenants.storage.put('dr-tenant', 'knowledge:food', { body: 'DR knowledge corpus' });
  rt.tenants.storage.put('dr-tenant', 'workflow:wf-food-delivery', { id: 'wf-food-delivery', version: '1.0.0' });
  rt.tenants.storage.put('dr-tenant', 'memory:checkpoint', { step: 3 });

  const bak = rt.tenants.backup.create('dr-tenant');
  assert.ok(bak.backupId);

  await rt.tenants.purge('dr-tenant');
  assert.equal(rt.tenants.registry.find('dr-tenant'), null);
  assert.equal(rt.applications.registry.find('app-food-ai', { tenantId: 'dr-tenant' }), null);

  const restored = await rt.tenants.backup.restore(bak.backupId, {
    newTenantId: 'dr-tenant',
    applications: rt.applications,
  });
  assert.equal(restored.tenantId, 'dr-tenant');
  assert.ok(rt.tenants.registry.find('dr-tenant'));
  assert.ok(rt.applications.registry.find('app-food-ai', { tenantId: 'dr-tenant' }));
  assert.deepEqual(rt.tenants.storage.get('dr-tenant', 'knowledge:food'), { body: 'DR knowledge corpus' });
  assert.equal(rt.tenants.storage.get('dr-tenant', 'workflow:wf-food-delivery').id, 'wf-food-delivery');
  assert.equal(rt.tenants.storage.get('dr-tenant', 'memory:checkpoint').step, 3);
  assert.ok(rt.tenants.audit.list({ tenantId: 'dr-tenant' }).length >= 1);
});

test('TEN15 tenant migration across workspaces and regions', async () => {
  const rt = makeRuntime();
  await rt.tenants.provision({ id: 'mig-src', name: 'Mig Src', plan: 'standard', region: 'region-a', ownerId: 'mig-u' }, {
    ownerId: 'mig-u',
    installApps: ['app-food-ai'],
    settings: { deliveryZone: 'Siam' },
  });
  rt.tenants.storage.put('mig-src', 'knowledge:food', { body: 'food kb' });
  rt.tenants.storage.put('mig-src', 'workflow:wf-food-delivery', { id: 'wf-food-delivery' });
  rt.tenants.storage.put('mig-src', 'billing:job-1', { charged: 1 });

  const ws1 = await rt.tenants.migration.migrate('mig-src', {
    targetTenantId: 'mig-ws2',
    targetWorkspace: 'workspace2',
    targetRegion: 'region-a',
  });
  assert.equal(ws1.targetWorkspace, 'workspace2');
  assert.ok(rt.tenants.registry.find('mig-ws2'));
  assert.ok(rt.applications.registry.find('app-food-ai', { tenantId: 'mig-ws2' }));

  rt.tenants.storage.put('mig-ws2', 'billing:job-2', { charged: 2 });
  const ws2 = await rt.tenants.migration.migrate('mig-ws2', {
    targetTenantId: 'mig-ws3',
    targetWorkspace: 'workspace3',
    targetRegion: 'region-b',
  });
  assert.equal(ws2.targetRegion, 'region-b');
  assert.equal(rt.tenants.workspace.get('mig-ws3').name, 'workspace3');
  assert.deepEqual(rt.tenants.storage.get('mig-ws3', 'knowledge:food'), { body: 'food kb' });
  assert.ok(rt.tenants.storage.list('mig-ws3').some((i) => i.key.startsWith('workflow:')));
  assert.ok(rt.tenants.storage.list('mig-ws3').some((i) => i.key.startsWith('billing:')));
  assert.ok(rt.tenants.audit.list({ tenantId: 'mig-ws3' }).length >= 1);
  assert.equal(rt.tenants.registry.find('mig-ws3').manifest.region, 'region-b');
});

test('TEN16 full SaaS flow create provision resume execute revenue billing audit', async () => {
  const credits = { 'saas-user': 10 };
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
  const manifest = { id: 'saas-tenant', name: 'SaaS Tenant', plan: 'premium', ownerId: 'saas-user' };
  await rt.tenants.provision(manifest, {
    ownerId: 'saas-user',
    installApps: ['app-trip-ai'],
    settings: { destination: 'Bangkok' },
  });
  assert.ok(rt.tenants.workspace.get('saas-tenant'));

  const flow = await rt.tenants.runSaaSFlow({
    tenantId: 'saas-tenant',
    appId:    'app-trip-ai',
    userId:   'saas-user',
    input:    { destination: 'Bangkok' },
  });

  assert.equal(flow.execution.ok, true);
  assert.ok(flow.layers.find((l) => l.id === 'workflow' && l.ok));
  assert.ok(flow.layers.find((l) => l.id === 'pipeline' && l.ok));
  assert.ok(flow.layers.find((l) => l.id === 'orchestrator' && l.ok));
  assert.ok(flow.layers.find((l) => l.id === 'billing' && l.ok));
  assert.ok(flow.layers.find((l) => l.id === 'quota' && l.ok));
  assert.ok(flow.layers.find((l) => l.id === 'audit' && l.ok));
  assert.ok(flow.layers.find((l) => l.id === 'analytics' && l.ok));
  assert.ok(flow.layers.find((l) => l.id === 'learning' && l.ok));
  assert.ok(flow.layers.find((l) => l.id === 'revenue' && l.ok));
  assert.ok(flow.execution.chain?.includes('render') || flow.execution.chain?.includes('publish'));
  assert.ok(rt.tenants.storage.get('saas-tenant', 'memory:saas:last_run'));
  assert.ok(credits['saas-user'] < 10);
});
