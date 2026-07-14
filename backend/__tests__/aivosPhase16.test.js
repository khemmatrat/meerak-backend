/**
 * Phase 16 – Business Workflow Template Engine
 * Tests WF01–WF16
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

import { createRuntime } from '../lib/aivos/runtime/index.js';
import {
  createWorkflowEngine,
  WORKFLOW_PHASE,
  validateManifest,
} from '../lib/aivos/workflow/index.js';
import { getSkillTemplate } from '../lib/aivos/skill/index.js';
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

async function enableSkill(rt, id) {
  const tpl = getSkillTemplate(id);
  if (!tpl) return;
  await rt.skills.install(tpl);
  await rt.skills.enable(id);
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
    forceNew: true,
    growthEngine: mockGrowth,
    authenticateToken: (_q, _s, n) => n(),
    ...overrides,
  });
  return app;
}

test('WF01 manifest validation accepts valid template and rejects invalid', () => {
  const tpl = makeRuntime().workflows.getTemplate('wf-commerce');
  const valid = validateManifest(tpl);
  assert.equal(valid.ok, true);
  const invalid = validateManifest({ id: '', name: 'X' });
  assert.equal(invalid.ok, false);
});

test('WF02 registry register find list enable disable', () => {
  const rt = makeRuntime();
  const tpl = rt.workflows.getTemplate('wf-commerce');
  rt.workflows.register(tpl);
  assert.ok(rt.workflows.registry.findWorkflow('wf-commerce'));
  assert.equal(rt.workflows.registry.listWorkflows().length, 1);
  rt.workflows.registry.enableWorkflow('wf-commerce');
  assert.equal(rt.workflows.registry.findWorkflow('wf-commerce').enabled, true);
  rt.workflows.registry.disableWorkflow('wf-commerce');
  assert.equal(rt.workflows.registry.findWorkflow('wf-commerce').enabled, false);
});

test('WF03 library lists built-in workflow templates', () => {
  const rt = makeRuntime();
  const library = rt.workflows.library.list();
  assert.ok(library.length >= 10);
  assert.ok(library.some((t) => t.id === 'wf-resume'));
  assert.ok(library.some((t) => t.id === 'wf-video-marketing'));
});

test('WF04 composer builds sequential and parallel graphs', () => {
  const rt = makeRuntime();
  const a = rt.workflows.getTemplate('wf-trip-planner');
  const b = rt.workflows.getTemplate('wf-hotel-booking');
  const seq = rt.workflows.composer.compose({ templates: [a, b], mode: 'sequential' });
  assert.ok(seq.nodes.length >= 2);
  assert.ok(seq.edges.length >= 1);
  const par = rt.workflows.composer.compose({ templates: [a, b], mode: 'parallel' });
  assert.equal(par.mode, 'parallel');
});

test('WF05 compiler produces executable pipeline plan', async () => {
  const rt = makeRuntime();
  const tpl = rt.workflows.getTemplate('wf-commerce');
  const compiled = await rt.workflows.compile(tpl, { intent: { productName: 'Widget' } });
  assert.equal(compiled.workflowId, 'wf-commerce');
  assert.ok(compiled.dag?.nodes?.length >= 1);
  assert.ok(compiled.capabilities.includes('marketplace_generation'));
});

test('WF06 resolver detects missing skill dependency', async () => {
  const rt = makeRuntime();
  const tpl = { ...rt.workflows.getTemplate('wf-trip-planner') };
  const check = await rt.workflows.resolver.resolve(tpl);
  assert.equal(check.ok, false);
  assert.ok(check.gaps.some((g) => g.kind === 'skill'));
});

test('WF07 variable interpolation resolves input and system scopes', () => {
  const rt = makeRuntime();
  const tpl = rt.workflows.getTemplate('wf-hotel-booking');
  const ctx = rt.workflows.variables.buildContext({
    input:  { city: 'Bangkok' },
    system: { userId: 'u1' },
  });
  const resolved = rt.workflows.variables.resolve(tpl, ctx);
  assert.equal(resolved.city, 'Bangkok');
  const text = rt.workflows.variables.interpolate('Hotel in {{input.city}} for {{system.userId}}', ctx);
  assert.ok(text.includes('Bangkok'));
});

test('WF08 executor runs workflow through orchestrator and pipeline', async () => {
  const rt = makeRuntime();
  await enableSkill(rt, 'ai-food');
  const tpl = rt.workflows.getTemplate('wf-food-delivery');
  rt.workflows.register(tpl);
  rt.workflows.registry.enableWorkflow('wf-food-delivery');
  const result = await rt.workflows.execute({ manifest: tpl, input: { deliveryZone: 'Sukhumvit' }, userId: 'u1' });
  assert.equal(result.ok, true);
  assert.ok(result.outputs.delivery_menu);
  assert.ok(result.latencyMs >= 0);
});

test('WF09 versioning snapshot diff and rollback', () => {
  const rt = makeRuntime();
  const tpl = rt.workflows.getTemplate('wf-commerce');
  rt.workflows.versioning.snapshot('wf-commerce', tpl);
  const updated = { ...tpl, description: 'Updated commerce workflow' };
  rt.workflows.versioning.snapshot('wf-commerce', updated);
  const diff = rt.workflows.versioning.diff('wf-commerce', '1');
  assert.equal(diff.match, false);
  const rolled = rt.workflows.versioning.rollback('wf-commerce');
  assert.equal(rolled.version, '1');
});

test('WF10 runtime integration exposes runtime.workflows', () => {
  const rt = makeRuntime();
  assert.ok(rt.workflows);
  assert.equal(rt.workflows.enabled, true);
  assert.equal(rt.workflows.phase, WORKFLOW_PHASE);
  const saved = process.env.AIVOS_WORKFLOW_ENABLED;
  process.env.AIVOS_WORKFLOW_ENABLED = '0';
  const disabled = createWorkflowEngine({ runtime: makeRuntime({ forceNew: true }) });
  assert.equal(disabled.enabled, false);
  process.env.AIVOS_WORKFLOW_ENABLED = saved;
});

test('WF11 HTTP workflow routes list compile execute metrics', async () => {
  const dir = join(__dir, '../lib/aivos/workflow');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const src = readFileSync(join(dir, f), 'utf8');
    assert.ok(!/from\s+['"][^'"]*kernel[^'"]*['"]/i.test(src), `workflow/${f} must not import Kernel`);
  }

  await withServer(makeApp(), async (port) => {
    const list = await fetch(`http://127.0.0.1:${port}/api/aivos/workflows/library`).then((r) => r.json());
    assert.equal(list.ok, true);
    assert.ok(list.library.length >= 10);

    const tpl = list.library.find((t) => t.id === 'wf-commerce');
    await fetch(`http://127.0.0.1:${port}/api/aivos/skills/install`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ manifest: getSkillTemplate('ai-marketplace') }),
    });
    await fetch(`http://127.0.0.1:${port}/api/aivos/skills/enable`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ skillId: 'ai-marketplace' }),
    });
    await fetch(`http://127.0.0.1:${port}/api/aivos/workflows/register`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ manifest: tpl }),
    });

    await fetch(`http://127.0.0.1:${port}/api/aivos/knowledge/ingest`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ title: 'catalog', body: 'marketplace product catalog listings', format: 'text' }),
    });

    const compiled = await fetch(`http://127.0.0.1:${port}/api/aivos/workflows/compile`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ workflowId: 'wf-commerce' }),
    }).then((r) => r.json());
    assert.equal(compiled.ok, true);

    const exec = await fetch(`http://127.0.0.1:${port}/api/aivos/workflows/execute`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ workflowId: 'wf-commerce', input: { productName: 'Chair' } }),
    });
    assert.equal(exec.status, 201);

    const metrics = await fetch(`http://127.0.0.1:${port}/api/aivos/workflows/metrics`).then((r) => r.json());
    assert.equal(metrics.ok, true);
    assert.ok(metrics.metrics.executionCount >= 1);
  });
});

test('WF12 multi-template composition executes merged workflow graph', async () => {
  const rt = makeRuntime();
  await enableSkill(rt, 'ai-trip');
  await enableSkill(rt, 'ai-hotel');
  const a = rt.workflows.getTemplate('wf-trip-planner');
  const b = rt.workflows.getTemplate('wf-hotel-booking');
  const composed = rt.workflows.composer.compose({ templates: [a, b], mode: 'sequential' });
  assert.ok(composed.templates.includes('wf-trip-planner'));
  assert.ok(composed.templates.includes('wf-hotel-booking'));
  const mergedManifest = {
    ...a,
    id: 'wf-composed-trip-hotel',
    name: 'Composed Trip Hotel',
    requiredCapabilities: [...new Set([...(a.requiredCapabilities || []), ...(b.requiredCapabilities || [])])],
    outputs: [...new Set([...(a.outputs || []), ...(b.outputs || [])])],
  };
  rt.workflows.register(mergedManifest);
  const result = await rt.workflows.execute({
    manifest: mergedManifest,
    input:    { destination: 'Chiang Mai', city: 'Chiang Mai' },
    userId:   'u1',
  });
  assert.equal(result.ok, true);
  assert.ok(result.outputs.itinerary || result.outputs.hotel_listing);
});

test('WF13 workflow resume from checkpoint skips completed nodes', async () => {
  const rt = makeRuntime();
  await enableSkill(rt, 'ai-trip');
  const tpl = rt.workflows.getTemplate('wf-trip-planner');
  rt.workflows.register(tpl);

  const paused = await rt.workflows.execute({
    manifest: tpl,
    input:    { destination: 'Phuket' },
    userId:   'u1',
    maxNodesBeforePause: 2,
  });
  assert.equal(paused.status, 'paused');
  assert.equal(paused.completedNodeIds.length, 2);
  assert.equal(paused.executedThisRun.length, 2);

  const resumed = await rt.workflows.resume(paused.executionId);
  assert.equal(resumed.status, 'completed');
  assert.ok(resumed.completedNodeIds.length > paused.completedNodeIds.length);
  for (const nodeId of paused.completedNodeIds) {
    assert.ok(!resumed.executedThisRun.includes(nodeId), `must not re-execute ${nodeId}`);
  }
});

test('WF14 workflow rollback restores version 2 and executes it', async () => {
  const rt = makeRuntime();
  await enableSkill(rt, 'ai-marketplace');
  const base = { ...rt.workflows.getTemplate('wf-commerce'), id: 'wf-rollback-test' };
  rt.workflows.register(base);
  rt.workflows.versioning.snapshot('wf-rollback-test', { ...base, description: 'version-1-body' });
  rt.workflows.versioning.snapshot('wf-rollback-test', { ...base, description: 'version-2-body' });
  rt.workflows.versioning.snapshot('wf-rollback-test', { ...base, description: 'version-3-body' });

  const rolled = rt.workflows.rollback('wf-rollback-test');
  assert.equal(rolled.version, '2');
  assert.equal(rolled.manifest.description, 'version-2-body');

  await rt.knowledge.ingestDocument({ title: 'catalog', body: 'product catalog marketplace listings', format: 'text' });

  const result = await rt.workflows.execute({
    manifest: rolled.manifest,
    input:    { productName: 'Rollback Chair' },
    userId:   'u1',
  });
  assert.equal(result.ok, true);
  assert.equal(rolled.manifest.description, 'version-2-body');
  assert.ok(result.outputs.commerce_listing);
});

test('WF15 nested workflow preserves variables checkpoint and audit', async () => {
  const rt = makeRuntime();
  await enableSkill(rt, 'ai-trip');
  await enableSkill(rt, 'ai-food');
  const child = rt.workflows.getTemplate('wf-food-delivery');
  const parent = {
    ...rt.workflows.getTemplate('wf-trip-planner'),
    id:               'wf-parent-nested',
    name:             'Parent Nested Workflow',
    nestedWorkflows:  ['wf-food-delivery'],
    outputs:          ['itinerary', 'delivery_menu'],
  };
  rt.workflows.register(child);
  rt.workflows.register(parent);

  const result = await rt.workflows.execute({
    manifest: parent,
    input:    { destination: 'Krabi', deliveryZone: 'Ao Nang' },
    userId:   'u1',
  });
  assert.equal(result.ok, true);
  assert.ok(result.nestedResults?.length >= 1);
  assert.ok(result.variables['nested:wf-food-delivery']);
  assert.ok(result.completedNodeIds.length >= 2);

  const audits = rt.workflows.audit.listExecutions({ workflowId: 'wf-parent-nested' });
  assert.ok(audits.length >= 1);
  const cp = await rt.checkpointManager.latestCheckpoint(result.executionId, 'workflow');
  assert.ok(cp?.payload?.variables);
  assert.ok(cp?.payload?.completedNodeIds?.length >= 1);
});

test('WF16 skill workflow orchestrator pipeline render publish chain', async () => {
  const rt = makeRuntime();
  await enableSkill(rt, 'ai-trip');
  const tpl = rt.workflows.getTemplate('wf-trip-planner');
  rt.workflows.register(tpl);

  const result = await rt.workflows.execute({
    manifest: tpl,
    input:    { destination: 'Bangkok' },
    userId:   'u1',
  });
  assert.equal(result.ok, true);
  assert.ok(result.chain.includes('workflow'));
  assert.ok(result.chain.includes('skill'));
  assert.ok(result.chain.includes('orchestrator'));
  assert.ok(result.chain.includes('pipeline'));
  assert.ok(result.chain.includes('render'));
  assert.ok(result.chain.includes('publish'));
  assert.ok(result.orchResult?.results?.some((r) => r.capability === 'render'));
  assert.ok(result.orchResult?.results?.some((r) => r.capability === 'publish'));
});
