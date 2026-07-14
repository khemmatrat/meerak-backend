/**
 * Phase 9 – Workflow Marketplace
 * Tests MK01–MK12
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

import { createRuntime } from '../lib/aivos/runtime/index.js';
import { createMarketplaceEngine, isMarketplaceEnabled } from '../lib/aivos/marketplace/index.js';
import { createAivosSdk } from '../lib/aivos/sdk/index.js';
import { registerAivosRoutes } from '../lib/aivos/index.js';

const __dir = dirname(fileURLToPath(import.meta.url));

function makeRuntime(overrides = {}) {
  return createRuntime({ syncExecute: true, ...overrides });
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

test('MK01 marketplace disabled returns stub with enabled=false', () => {
  const saved = process.env.AIVOS_MARKETPLACE_ENABLED;
  process.env.AIVOS_MARKETPLACE_ENABLED = '0';
  const rt = makeRuntime();
  assert.equal(rt.marketplace.enabled, false);
  process.env.AIVOS_MARKETPLACE_ENABLED = saved;
});

test('MK02 catalog lists resume-ai plugin', () => {
  const rt = makeRuntime();
  const plugins = rt.marketplace.listPlugins();
  assert.ok(plugins.some((p) => p.package_id === 'resume-ai'));
});

test('MK03 catalog lists video-pipeline-v1 workflow', () => {
  const rt = makeRuntime();
  const workflows = rt.marketplace.listWorkflows();
  assert.ok(workflows.some((w) => w.package_id === 'video-pipeline-v1'));
});

test('MK04 install resume-ai plugin succeeds', async () => {
  const rt = makeRuntime();
  const pkg = await rt.marketplace.install({ packageId: 'resume-ai', type: 'plugin' });
  assert.equal(pkg.state, 'installed');
  assert.equal(pkg.package_id, 'resume-ai');
});

test('MK05 install fails with CAPABILITY_GAP when required plugin missing', async () => {
  const saved = process.env.AIVOS_RESUME_PLUGIN_ENABLED;
  process.env.AIVOS_RESUME_PLUGIN_ENABLED = '0';
  const rt = makeRuntime({ forceResumePlugin: false, seed: { pluginRegistry: [], skillRegistry: [], promptRegistry: [], policyRules: [], brandDna: [] } });
  await assert.rejects(
    () => rt.marketplace.install({ packageId: 'video-pipeline-v1', type: 'workflow' }),
    (e) => e.code === 'CAPABILITY_GAP'
  );
  process.env.AIVOS_RESUME_PLUGIN_ENABLED = saved;
});

test('MK06 enable registers plugin in runtime registry', async () => {
  const rt = makeRuntime();
  await rt.marketplace.install({ packageId: 'resume-ai', type: 'plugin' });
  const enabled = await rt.marketplace.enable({ packageId: 'resume-ai', type: 'plugin' });
  assert.equal(enabled.state, 'enabled');
  const plugin = await rt.registry.getPlugin('resume-ai');
  assert.ok(plugin);
  assert.equal(plugin.enabled, true);
});

test('MK07 disable sets plugin enabled=false', async () => {
  const rt = makeRuntime();
  await rt.marketplace.install({ packageId: 'resume-ai', type: 'plugin' });
  await rt.marketplace.enable({ packageId: 'resume-ai', type: 'plugin' });
  await rt.marketplace.disable({ packageId: 'resume-ai', type: 'plugin' });
  const plugin = await rt.registry.getPlugin('resume-ai');
  assert.equal(plugin.enabled, false);
});

test('MK08 upgrade pins new version in history', async () => {
  const rt = makeRuntime();
  await rt.marketplace.install({ packageId: 'resume-ai', type: 'plugin', version: '1.0.0' });
  const upgraded = await rt.marketplace.upgrade({ packageId: 'resume-ai', type: 'plugin', version: '2.0.0' });
  assert.equal(upgraded.version, '2.0.0');
  assert.ok(upgraded.version_history.some((h) => h.action === 'upgrade'));
});

test('MK09 rollback restores previous version', async () => {
  const rt = makeRuntime();
  await rt.marketplace.install({ packageId: 'resume-ai', type: 'plugin', version: '1.0.0' });
  await rt.marketplace.upgrade({ packageId: 'resume-ai', type: 'plugin', version: '2.0.0' });
  const rolled = await rt.marketplace.rollback({ packageId: 'resume-ai', type: 'plugin' });
  assert.equal(rolled.version, '1.0.0');
});

test('MK10 HTTP GET /api/aivos/marketplace/plugins returns catalog', async () => {
  const app = express();
  app.use(express.json());
  registerAivosRoutes(app, { runtimeEnabled: true, marketplaceEnabled: true, authenticateToken: (_q, _s, n) => n() });
  await withServer(app, async (port) => {
    const res  = await fetch(`http://127.0.0.1:${port}/api/aivos/marketplace/plugins`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.ok(body.plugins.some((p) => p.package_id === 'resume-ai'));
  });
});

test('MK11 SDK workflow.install delegates to marketplace engine', async () => {
  const rt  = makeRuntime();
  const sdk = createAivosSdk({ runtime: rt });
  const pkg = await sdk.workflow().install('resume-ai', '1.0.0');
  assert.equal(pkg.package_id, 'resume-ai');
});

test('MK12 marketplace module has no Kernel imports', () => {
  const dir = join(__dir, '../lib/aivos/marketplace');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const src = readFileSync(join(dir, f), 'utf8');
    assert.ok(!/from\s+['"][^'"]*kernel[^'"]*['"]/i.test(src), `marketplace/${f} must not import Kernel`);
  }
});
