/**
 * Phase 13 – AI Skill SDK & Vertical Business Framework
 * Tests SK01–SK12
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

process.env.AIVOS_RESUME_PLUGIN_ENABLED  = '1';
process.env.AIVOS_RUNTIME_ENABLED        = '1';
process.env.AIVOS_RENDER_ENABLED         = '1';
process.env.AIVOS_PUBLISH_ENABLED        = '1';
process.env.AIVOS_ANALYTICS_ENABLED      = '1';
process.env.AIVOS_LEARNING_ENABLED       = '1';
process.env.AIVOS_OPTIMIZATION_ENABLED   = '1';
process.env.AIVOS_AUTOMATION_ENABLED     = '1';
process.env.AIVOS_REVENUE_ENABLED        = '1';
process.env.AIVOS_MARKETPLACE_ENABLED    = '1';
process.env.AIVOS_BILLING_ENABLED        = '1';
process.env.AIVOS_GOVERNANCE_ENABLED     = '1';
process.env.AIVOS_QA_ENABLED             = '1';
process.env.AIVOS_SKILL_ENABLED          = '1';

import { createRuntime } from '../lib/aivos/runtime/index.js';
import {
  createSkillEngine,
  isSkillEnabled,
  SKILL_PHASE,
  validateManifest,
  getSkillTemplate,
  generateSkillScaffold,
} from '../lib/aivos/skill/index.js';
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
    forceNew: true,
    growthEngine: mockGrowth,
    authenticateToken: (_q, _s, n) => n(),
    ...overrides,
  });
  return app;
}

test('SK01 manifest validation accepts valid template and rejects invalid', () => {
  const tpl = getSkillTemplate('ai-food');
  const valid = validateManifest(tpl);
  assert.equal(valid.ok, true);
  assert.equal(valid.manifest.id, 'ai-food');

  const invalid = validateManifest({ id: '', name: 'X' });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.length >= 2);
});

test('SK02 registry register list find remove', () => {
  const rt = makeRuntime();
  const reg = rt.skills.registry;
  const tpl = getSkillTemplate('ai-hotel');
  reg.registerSkill(tpl);
  assert.ok(reg.findSkill('ai-hotel'));
  assert.equal(reg.listSkills().length, 1);
  reg.removeSkill('ai-hotel');
  assert.equal(reg.findSkill('ai-hotel'), null);
});

test('SK03 capability discovery maps vertical capability to runtime skills', async () => {
  const rt = makeRuntime();
  const tpl = getSkillTemplate('ai-food');
  await rt.skills.install(tpl);
  await rt.skills.enable('ai-food');
  const lookup = rt.skills.capability.lookup('food_generation');
  assert.ok(lookup.runtimeCapabilities.includes('menu.generate'));
  assert.ok(lookup.matchedSkills.includes('ai-food'));
  assert.equal(lookup.runtimeDriven, true);
});

test('SK04 dependency validation rejects missing plugin', async () => {
  const rt = makeRuntime();
  const manifest = {
    ...getSkillTemplate('ai-resume'),
    requiredPlugins: ['missing-plugin'],
  };
  const check = await rt.skills.resolveDeps(manifest);
  assert.equal(check.ok, false);
  assert.ok(check.gaps.some((g) => g.kind === 'plugin' && g.id === 'missing-plugin'));
});

test('SK05 loader load and unload without runtime restart', async () => {
  const rt = makeRuntime();
  const tpl = getSkillTemplate('ai-trip');
  const installed = await rt.skills.install(tpl);
  const loaded = await rt.skills.loadSkill(installed);
  assert.equal(loaded.loaded, true);
  assert.ok(rt.skills.loader.isLoaded('ai-trip'));
  const runtimeSkill = await rt.store.getSkill('ai-trip');
  assert.ok(runtimeSkill);
  const unloaded = await rt.skills.unloadSkill('ai-trip');
  assert.equal(unloaded.loaded, false);
  assert.equal(await rt.store.getSkill('ai-trip'), null);
});

test('SK06 reload refreshes runtime skill registration', async () => {
  const rt = makeRuntime();
  const tpl = getSkillTemplate('ai-insurance');
  const installed = await rt.skills.install(tpl);
  await rt.skills.enable('ai-insurance');
  const reloaded = await rt.skills.reloadSkill(installed);
  assert.equal(reloaded.loaded, true);
  assert.ok(rt.skills.loader.isLoaded('ai-insurance'));
});

test('SK07 install registers vertical skill via lifecycle', async () => {
  const rt = makeRuntime();
  const tpl = getSkillTemplate('ai-food');
  const row = await rt.skills.install(tpl);
  assert.equal(row.state, 'installed');
  assert.equal(row.manifest.id, 'ai-food');
  assert.ok(rt.skills.registry.findSkill('ai-food'));
});

test('SK08 upgrade bumps skill version', async () => {
  const rt = makeRuntime();
  const tpl = getSkillTemplate('ai-restaurant');
  await rt.skills.install(tpl);
  await rt.skills.enable('ai-restaurant');
  const upgraded = await rt.skills.upgrade('ai-restaurant', '1.1.0');
  assert.equal(upgraded.version, '1.1.0');
  assert.equal(upgraded.manifest.version, '1.1.0');
});

test('SK09 rollback restores previous version', async () => {
  const rt = makeRuntime();
  const tpl = getSkillTemplate('ai-hotel');
  await rt.skills.install(tpl);
  await rt.skills.upgrade('ai-hotel', '1.1.0');
  const rolled = await rt.skills.rollback('ai-hotel');
  assert.equal(rolled.version, '1.0.0');
});

test('SK10 scaffold generator produces manifest and skeleton files', () => {
  const scaffold = generateSkillScaffold({ id: 'ai-custom-shop', name: 'AI Custom Shop', vertical: 'marketplace' });
  assert.equal(scaffold.manifest.id, 'ai-custom-shop');
  assert.ok(scaffold.manifest.capabilities.includes('marketplace_generation'));
  assert.equal(scaffold.files.length, 3);
  assert.ok(scaffold.files.some((f) => f.path.endsWith('manifest.json')));
});

test('SK11 runtime integration exposes runtime.skills engine', () => {
  const rt = makeRuntime();
  assert.ok(rt.skills);
  assert.equal(rt.skills.enabled, true);
  assert.equal(rt.skills.phase, SKILL_PHASE);
  assert.ok(typeof rt.skills.discover === 'function');
  const saved = process.env.AIVOS_SKILL_ENABLED;
  process.env.AIVOS_SKILL_ENABLED = '0';
  const disabled = createSkillEngine({ runtime: makeRuntime({ forceNew: true }) });
  assert.equal(disabled.enabled, false);
  process.env.AIVOS_SKILL_ENABLED = saved;
});

test('SK12 HTTP skill routes list install validate and capabilities', async () => {
  const dir = join(__dir, '../lib/aivos/skill');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const src = readFileSync(join(dir, f), 'utf8');
    assert.ok(!/from\s+['"][^'"]*kernel[^'"]*['"]/i.test(src), `skill/${f} must not import Kernel`);
  }

  await withServer(makeApp(), async (port) => {
    const list = await fetch(`http://127.0.0.1:${port}/api/aivos/skills/list`).then((r) => r.json());
    assert.equal(list.ok, true);
    assert.ok(Array.isArray(list.templates));

    const tpl = getSkillTemplate('ai-trip');
    const validate = await fetch(`http://127.0.0.1:${port}/api/aivos/skills/validate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(tpl),
    }).then((r) => r.json());
    assert.equal(validate.ok, true);

    const caps = await fetch(`http://127.0.0.1:${port}/api/aivos/skills/capabilities`).then((r) => r.json());
    assert.equal(caps.ok, true);
    assert.ok(caps.capabilities.some((c) => c.id === 'travel_generation'));

    const install = await fetch(`http://127.0.0.1:${port}/api/aivos/skills/install`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ manifest: tpl }),
    });
    assert.equal(install.status, 201);
  });
});
