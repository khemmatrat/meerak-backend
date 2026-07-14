/**
 * Phase 19 – Enterprise Integration & API Gateway
 * Tests INT01–INT16
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createHash } from 'crypto';
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
process.env.AIVOS_INTEGRATION_ENABLED     = '1';
process.env.AIVOS_API_GATEWAY_ENABLED       = '1';
process.env.AIVOS_WEBHOOK_ENABLED         = '1';
process.env.AIVOS_OAUTH_ENABLED           = '1';
process.env.AIVOS_CONNECTOR_MAX_RETRIES   = '2';

import { createRuntime } from '../lib/aivos/runtime/index.js';
import {
  isIntegrationEnabled,
  isApiGatewayEnabled,
  isWebhookEnabled,
  isOAuthEnabled,
  INTEGRATION_PHASE,
  validateManifest,
} from '../lib/aivos/integration/index.js';
import { connectorMaxRetries } from '../lib/aivos/integration/config.js';
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

function webhookSignature(payload, secret) {
  return createHash('sha256').update(`${secret}:${JSON.stringify(payload)}`).digest('hex');
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
    forceNew: true,
    growthEngine: mockGrowth,
    authenticateToken: (_q, _s, n) => n(),
    ...overrides,
  });
  return app;
}

async function ensureTenant(rt, tenantId, ownerId = 'u1') {
  if (!rt.tenants.registry.find(tenantId)) {
    await rt.tenants.create({ id: tenantId, name: tenantId, plan: 'premium' }, { ownerId });
  }
}

async function installAndEnable(rt, connectorId, tenantId, secret = 'sk-test') {
  await ensureTenant(rt, tenantId);
  const tpl = rt.integrations.getTemplate(connectorId);
  await rt.integrations.install(tpl, { tenantId, userId: 'u1', secret });
  rt.integrations.registry.enable(connectorId, { tenantId });
  return tpl;
}

test('INT01 config feature flags and phase', () => {
  assert.equal(isIntegrationEnabled(), true);
  assert.equal(isApiGatewayEnabled(), true);
  assert.equal(isWebhookEnabled(), true);
  assert.equal(isOAuthEnabled(), true);
  assert.equal(connectorMaxRetries(), 2);
  const rt = makeRuntime();
  assert.equal(rt.integrations.phase, INTEGRATION_PHASE);
});

test('INT02 manifest normalization includes oauth and tenant scope', () => {
  const tpl = makeRuntime().integrations.getTemplate('conn-stripe');
  assert.equal(tpl.provider, 'stripe');
  assert.ok(tpl.permissions.includes('payment.read'));
  assert.equal(tpl.tenantScoped, true);
});

test('INT03 validator accepts connector and rejects invalid semver', () => {
  const tpl = makeRuntime().integrations.getTemplate('conn-openai');
  const valid = validateManifest(tpl);
  assert.equal(valid.ok, true);
  const invalid = validateManifest({ id: 'x', name: 'X', version: 'bad' });
  assert.equal(invalid.ok, false);
});

test('INT04 registry register find list tenant isolation', async () => {
  const rt = makeRuntime();
  const tpl = rt.integrations.getTemplate('conn-slack');
  await ensureTenant(rt, 't-a');
  await ensureTenant(rt, 't-b');
  await rt.integrations.install(tpl, { tenantId: 't-a', secret: 'sk-a' });
  assert.ok(rt.integrations.registry.find('conn-slack', { tenantId: 't-a' }));
  assert.equal(rt.integrations.registry.find('conn-slack', { tenantId: 't-b' }), null);
});

test('INT05 installer install enable uninstall', async () => {
  const rt = makeRuntime();
  await ensureTenant(rt, 'inst');
  const tpl = rt.integrations.getTemplate('conn-discord');
  const row = await rt.integrations.install(tpl, { tenantId: 'inst', secret: 'sk-discord' });
  assert.equal(row.installed, true);
  rt.integrations.registry.enable('conn-discord', { tenantId: 'inst' });
  const cred = rt.integrations.vault.get('conn-discord', { tenantId: 'inst' });
  assert.ok(cred.secret);
  assert.ok(cred.masked.includes('*'));
  await rt.integrations.uninstall('conn-discord', { tenantId: 'inst' });
  assert.equal(rt.integrations.registry.find('conn-discord', { tenantId: 'inst' }), null);
});

test('INT06 dependency resolver detects missing tenant', async () => {
  const rt = makeRuntime();
  const tpl = rt.integrations.getTemplate('conn-crm');
  const check = await rt.integrations.dependency.resolve(tpl, { tenantId: null });
  assert.equal(check.ok, false);
  assert.ok(check.gaps.some((g) => g.kind === 'tenant'));
});

test('INT07 oauth authorize and refresh token', async () => {
  const rt = makeRuntime();
  await installAndEnable(rt, 'conn-shopify', 'oauth-t', 'sk-shop');
  const auth = await rt.integrations.oauth.authorize({
    connectorId: 'conn-shopify',
    tenantId: 'oauth-t',
    provider: 'shopify',
    scopes: ['read_products'],
    code: 'auth-code-1',
  });
  assert.equal(auth.ok, true);
  const refreshed = await rt.integrations.oauth.refresh({ connectorId: 'conn-shopify', tenantId: 'oauth-t' });
  assert.equal(refreshed.ok, true);
  assert.ok(refreshed.expires_at);
});

test('INT08 webhook receive signature replay and dispatch', async () => {
  const rt = makeRuntime();
  const payload = { event: 'payment.succeeded', amount: 100 };
  const secret = 'whsec_test';
  const sig = webhookSignature(payload, secret);
  const received = await rt.integrations.webhook.receive({
    connectorId: 'conn-stripe',
    tenantId: 'wh-t',
    payload,
    signature: sig,
    secret,
    eventId: 'evt-001',
  });
  assert.equal(received.ok, true);
  await assert.rejects(
    async () => rt.integrations.webhook.receive({
      connectorId: 'conn-stripe',
      tenantId: 'wh-t',
      payload,
      signature: sig,
      secret,
      eventId: 'evt-001',
    }),
    { code: 'WEBHOOK_REPLAY_DETECTED' },
  );
  const dispatched = await rt.integrations.webhook.dispatch({
    connectorId: 'conn-stripe',
    tenantId: 'wh-t',
    url: 'https://example.com/hook',
    payload,
    secret,
  });
  assert.equal(dispatched.ok, true);
});

test('INT09 runtime integration exposes runtime.integrations execute call', async () => {
  const rt = makeRuntime();
  assert.ok(rt.integrations);
  await installAndEnable(rt, 'conn-erp', 'rt-t', 'sk-erp');
  const call = await rt.integrations.call('conn-erp', { tenantId: 'rt-t', method: 'POST', path: '/sync' });
  assert.equal(call.ok, true);
  assert.equal(call.provider, 'erp');
});

test('INT10 metrics and audit record connector events', async () => {
  const rt = makeRuntime();
  await installAndEnable(rt, 'conn-gmail', 'met-t', 'sk-gmail');
  rt.integrations.metrics.record({ connectorId: 'conn-gmail', tenantId: 'met-t', action: 'call', success: true, latencyMs: 4 });
  const stats = rt.integrations.getMetrics({ connectorId: 'conn-gmail', tenantId: 'met-t' });
  assert.ok(stats.totalEvents >= 1);
  assert.ok(rt.integrations.audit.list({ connectorId: 'conn-gmail' }).length >= 1);
});

test('INT11 HTTP integration routes connectors install metrics health', async () => {
  const dir = join(__dir, '../lib/aivos/integration');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const src = readFileSync(join(dir, f), 'utf8');
    assert.ok(!/from\s+['"][^'"]*kernel[^'"]*['"]/i.test(src), `integration/${f} must not import Kernel`);
  }

  await withServer(makeApp(), async (port) => {
    const catalog = await fetch(`http://127.0.0.1:${port}/api/aivos/integration/connectors`).then((r) => r.json());
    assert.equal(catalog.ok, true);
    assert.ok(catalog.catalog.length >= 16);

    await fetch(`http://127.0.0.1:${port}/api/aivos/tenants/create`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id: 'http-int', name: 'HTTP INT', plan: 'premium', ownerId: 'u1' }),
    });

    const install = await fetch(`http://127.0.0.1:${port}/api/aivos/integration/install`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ connectorId: 'conn-slack', tenantId: 'http-int', secret: 'sk-http', apiKey: 'aivos_test' }),
    });
    assert.equal(install.status, 201);

    const health = await fetch(`http://127.0.0.1:${port}/api/aivos/integration/health?tenantId=http-int`).then((r) => r.json());
    assert.equal(health.ok, true);

    const metrics = await fetch(`http://127.0.0.1:${port}/api/aivos/integration/metrics?tenantId=http-int`).then((r) => r.json());
    assert.equal(metrics.ok, true);
    assert.ok(metrics.metrics.totalEvents >= 1);
  });
});

test('INT12 install oauth execute workflow automation publish chain', async () => {
  const rt = makeRuntime();
  await rt.tenants.provision({ id: 'int12', name: 'INT12', plan: 'premium', ownerId: 'u12' }, {
    ownerId: 'u12',
    installApps: ['app-food-ai'],
    settings: { deliveryZone: 'Phuket' },
  });
  await installAndEnable(rt, 'conn-logistics', 'int12', 'sk-logistics');

  const flow = await rt.integrations.flow.run({
    connectorId: 'conn-logistics',
    tenantId: 'int12',
    userId: 'u12',
    input: { deliveryZone: 'Phuket' },
  });

  assert.equal(flow.execution.ok, true);
  assert.ok(flow.layers.find((l) => l.id === 'connector' && l.ok));
  assert.ok(flow.layers.find((l) => l.id === 'workflow' && l.ok));
  assert.ok(flow.layers.find((l) => l.id === 'automation' && l.ok));
  assert.ok(flow.execution.appResult?.ok);
  assert.ok(flow.execution.chain?.includes('publish') || flow.execution.chain?.includes('pipeline'));
});

test('INT13 multi-tenant oauth isolation', async () => {
  const rt = makeRuntime();
  await installAndEnable(rt, 'conn-facebook', 'ten-a', 'sk-a');
  await installAndEnable(rt, 'conn-facebook', 'ten-b', 'sk-b');
  await rt.integrations.oauth.authorize({
    connectorId: 'conn-facebook',
    tenantId: 'ten-a',
    provider: 'facebook',
    scopes: ['pages_manage_posts'],
    code: 'code-a',
  });
  assert.throws(
    () => rt.integrations.oauth.getToken('conn-facebook', { tenantId: 'ten-a', actorTenantId: 'ten-b' }),
    { code: 'OAUTH_TENANT_MISMATCH' },
  );
  assert.equal(rt.integrations.oauth.listForTenant('ten-a').length, 1);
  assert.equal(rt.integrations.oauth.listForTenant('ten-b').length, 0);
});

test('INT14 connector upgrade rollback execute old version', async () => {
  const rt = makeRuntime();
  await rt.tenants.provision({ id: 'up-t', name: 'Up T', plan: 'premium', ownerId: 'u1' }, {
    ownerId: 'u1',
    installApps: ['app-food-ai'],
    settings: { deliveryZone: 'Test' },
  });
  const tpl = await installAndEnable(rt, 'conn-logistics', 'up-t', 'sk-log');
  const v2 = { ...tpl, version: '1.1.0', description: 'logistics v2' };
  const v3 = { ...tpl, version: '1.2.0', description: 'logistics v3' };
  rt.integrations.upgrade('conn-logistics', v2, { tenantId: 'up-t' });
  rt.integrations.upgrade('conn-logistics', v3, { tenantId: 'up-t' });
  assert.equal(rt.integrations.registry.find('conn-logistics', { tenantId: 'up-t' }).manifest.version, '1.2.0');

  const rolled = rt.integrations.rollback('conn-logistics', { tenantId: 'up-t' });
  assert.equal(rolled.manifest.version, '1.1.0');

  const exec = await rt.integrations.execute('conn-logistics', {
    tenantId: 'up-t',
    userId: 'u1',
    input: { trackingId: 'TRK-1' },
  });
  assert.equal(exec.ok, true);
  assert.equal(rt.integrations.registry.find('conn-logistics', { tenantId: 'up-t' }).manifest.version, '1.1.0');
});

test('INT15 webhook retry dead letter queue recovery', async () => {
  const rt = makeRuntime();
  const payload = { event: 'fail' };
  const secret = 'whsec_dlq';
  const sig = webhookSignature(payload, secret);
  await rt.integrations.webhook.receive({
    connectorId: 'conn-stripe',
    tenantId: 'dlq-t',
    payload,
    signature: sig,
    secret,
    eventId: 'evt-dlq-1',
  });

  let attempts = 0;
  await rt.integrations.webhook.processQueue({
    handler: async () => {
      attempts += 1;
      throw new Error('downstream_fail');
    },
  });
  await rt.integrations.webhook.processQueue({
    handler: async () => { throw new Error('downstream_fail'); },
  });
  assert.ok(rt.integrations.webhook.dlqSize() >= 1);

  const recovered = rt.integrations.webhook.recoverFromDlq({ limit: 1 });
  assert.equal(recovered.recovered, 1);

  const final = await rt.integrations.webhook.processQueue({
    handler: async () => ({ ok: true }),
  });
  assert.ok(final.processed >= 1);
});

test('INT16 end-to-end connector application workflow tenant billing revenue audit', async () => {
  const credits = { 'e2e-user': 10 };
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
  await rt.tenants.provision({ id: 'e2e-tenant', name: 'E2E', plan: 'premium', ownerId: 'e2e-user' }, {
    ownerId: 'e2e-user',
    installApps: ['app-food-ai'],
    settings: { deliveryZone: 'Sukhumvit' },
  });
  await installAndEnable(rt, 'conn-logistics', 'e2e-tenant', 'sk-e2e');

  const result = await rt.integrations.execute('conn-logistics', {
    tenantId: 'e2e-tenant',
    userId: 'e2e-user',
    input: { deliveryZone: 'Sukhumvit' },
  });

  assert.equal(result.ok, true);
  assert.ok(result.appResult?.ok);
  assert.ok(result.billing);
  assert.ok(result.revenue);
  assert.ok(rt.integrations.audit.list({ connectorId: 'conn-logistics', tenantId: 'e2e-tenant' }).length >= 1);
  assert.ok(rt.tenants.getMetrics({ tenantId: 'e2e-tenant' }).totalEvents >= 0);
  assert.ok(rt.integrations.getHealth({ tenantId: 'e2e-tenant' }).totalConnectors >= 1);
});
