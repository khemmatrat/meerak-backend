/**
 * Phase 14 – AI Agent Orchestration Engine
 * Tests OR01–OR12
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

import { createRuntime } from '../lib/aivos/runtime/index.js';
import {
  createOrchestratorEngine,
  ORCHESTRATOR_PHASE,
  createAgentMemory,
} from '../lib/aivos/orchestrator/index.js';
import { createAgentConflictResolver } from '../lib/aivos/orchestrator/agentConflictResolver.js';
import { getSkillTemplate } from '../lib/aivos/skill/index.js';
import { DEFAULT_SKILL_CAPABILITIES } from '../lib/aivos/orchestrator/config.js';
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

async function enableVerticalSkills(rt) {
  const ids = ['ai-trip', 'ai-hotel', 'ai-food', 'ai-insurance', 'ai-marketplace'];
  for (const id of ids) {
    const tpl = getSkillTemplate(id);
    if (!tpl) continue;
    await rt.skills.install(tpl);
    await rt.skills.enable(id);
  }
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
    forceNew: true,
    growthEngine: mockGrowth,
    authenticateToken: (_q, _s, n) => n(),
    ...overrides,
  });
  return app;
}

test('OR01 agent registry lists agents synced from enabled skills', async () => {
  const rt = makeRuntime();
  await enableVerticalSkills(rt);
  const agents = rt.orchestrator.registry.listAgents();
  assert.ok(agents.length >= 5);
  assert.ok(agents.some((a) => a.skillId === 'ai-trip'));
});

test('OR02 planner builds execution graph with pipeline tail nodes', async () => {
  const rt = makeRuntime();
  await enableVerticalSkills(rt);
  const plan = rt.orchestrator.planner.buildPlan({ capabilities: DEFAULT_SKILL_CAPABILITIES });
  assert.equal(plan.nodes.length, DEFAULT_SKILL_CAPABILITIES.length + 2);
  assert.ok(plan.nodes.some((n) => n.pipelineNode === 'render'));
  assert.ok(plan.nodes.some((n) => n.pipelineNode === 'publish'));
  assert.ok(plan.edges.length >= plan.nodes.length - 1);
});

test('OR03 router resolves capability without hardcoded skill names', async () => {
  const rt = makeRuntime();
  const missing = rt.orchestrator.router.route('travel_generation');
  assert.equal(missing.ok, false);

  await rt.skills.install(getSkillTemplate('ai-trip'));
  await rt.skills.enable('ai-trip');
  const route = rt.orchestrator.router.route('travel_generation');
  assert.equal(route.ok, true);
  assert.equal(route.skillId, 'ai-trip');
  assert.equal(route.source, 'skill');
});

test('OR04 coordinator executes plan sequentially and merges outputs', async () => {
  const rt = makeRuntime();
  await enableVerticalSkills(rt);
  const plan = rt.orchestrator.planner.buildPlan({ capabilities: ['travel_generation', 'hotel_generation'] });
  const memory = createAgentMemory();
  const { createAgentConversation } = await import('../lib/aivos/orchestrator/agentConversation.js');
  const conversation = createAgentConversation({ memory });
  const { results, merged } = await rt.orchestrator.coordinator.executePlan(plan, {
    runId: 'coord-test',
    memory,
    conversation,
  });
  assert.equal(results.length, 4);
  assert.ok(merged.travel_generation || merged.hotel_generation);
});

test('OR05 shared memory passes context and artifacts across agents', () => {
  const memory = createAgentMemory({ context: { trip: 'Bangkok' } });
  memory.setContext('hotel', 'Sukhumvit');
  memory.addArtifact({ type: 'itinerary', ref: 'art-1' });
  const snap = memory.snapshot();
  assert.equal(snap.context.trip, 'Bangkok');
  assert.equal(snap.context.hotel, 'Sukhumvit');
  assert.equal(snap.artifacts.length, 1);
});

test('OR06 conflict resolver picks winner by confidence and governance', () => {
  const resolver = createAgentConflictResolver({ governance: { enabled: true } });
  const result = resolver.resolve('output', [
    { agentId: 'a1', confidence: 0.5, priority: 0 },
    { agentId: 'a2', confidence: 0.7, priority: 1, governanceApproved: true },
  ]);
  assert.equal(result.winner.agentId, 'a2');
  assert.equal(result.resolved, true);
});

test('OR07 supervisor monitors agent health', async () => {
  const rt = makeRuntime();
  const result = await rt.orchestrator.supervisor.monitor('test-agent', async () => ({ ok: true }), {
    runId: 'sup-test',
    timeoutMs: 2000,
  });
  assert.equal(result.ok, true);
  assert.equal(rt.orchestrator.supervisor.getHealth('test-agent'), 'healthy');
});

test('OR08 timeline records orchestration steps', async () => {
  const rt = makeRuntime();
  await enableVerticalSkills(rt);
  const result = await rt.orchestrator.execute({ capabilities: ['travel_generation', 'hotel_generation'] });
  const timeline = rt.orchestrator.getTimeline(result.runId);
  assert.ok(timeline);
  assert.ok(timeline.steps.length >= 2);
  assert.equal(timeline.status, 'completed');
});

test('OR09 recovery resumes from checkpoint', async () => {
  const rt = makeRuntime();
  await enableVerticalSkills(rt);
  const result = await rt.orchestrator.execute({ capabilities: ['food_generation'] });
  const resumed = await rt.orchestrator.resume(result.runId);
  assert.equal(resumed.status, 'resumed');
  assert.ok(resumed.runId);
});

test('OR10 runtime integration exposes runtime.orchestrator', () => {
  const rt = makeRuntime();
  assert.ok(rt.orchestrator);
  assert.equal(rt.orchestrator.enabled, true);
  assert.equal(rt.orchestrator.phase, ORCHESTRATOR_PHASE);
  const saved = process.env.AIVOS_ORCHESTRATOR_ENABLED;
  process.env.AIVOS_ORCHESTRATOR_ENABLED = '0';
  const disabled = createOrchestratorEngine({ runtime: makeRuntime({ forceNew: true }) });
  assert.equal(disabled.enabled, false);
  process.env.AIVOS_ORCHESTRATOR_ENABLED = saved;
});

test('OR11 HTTP orchestrator routes execute agents metrics timeline', async () => {
  const dir = join(__dir, '../lib/aivos/orchestrator');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const src = readFileSync(join(dir, f), 'utf8');
    assert.ok(!/from\s+['"][^'"]*kernel[^'"]*['"]/i.test(src), `orchestrator/${f} must not import Kernel`);
  }

  await withServer(makeApp(), async (port) => {
    await fetch(`http://127.0.0.1:${port}/api/aivos/skills/install`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ manifest: getSkillTemplate('ai-trip') }),
    });
    await fetch(`http://127.0.0.1:${port}/api/aivos/skills/enable`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ skillId: 'ai-trip' }),
    });

    const agents = await fetch(`http://127.0.0.1:${port}/api/aivos/orchestrator/agents`).then((r) => r.json());
    assert.equal(agents.ok, true);

    const exec = await fetch(`http://127.0.0.1:${port}/api/aivos/orchestrator/execute`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ capabilities: ['travel_generation'] }),
    });
    assert.equal(exec.status, 201);
    const body = await exec.json();
    assert.ok(body.runId);

    const metrics = await fetch(`http://127.0.0.1:${port}/api/aivos/orchestrator/metrics?runId=${body.runId}`).then((r) => r.json());
    assert.equal(metrics.ok, true);
    assert.ok(metrics.metrics.totalRuns >= 1);

    const timeline = await fetch(`http://127.0.0.1:${port}/api/aivos/orchestrator/timeline?runId=${body.runId}`).then((r) => r.json());
    assert.equal(timeline.ok, true);
  });
});

test('OR12 multi-skill execution runs full vertical workflow through render and publish', async () => {
  const rt = makeRuntime();
  await enableVerticalSkills(rt);
  const result = await rt.orchestrator.execute({ capabilities: DEFAULT_SKILL_CAPABILITIES, userId: 'u1' });
  assert.equal(result.ok, true);
  assert.equal(result.results.length, DEFAULT_SKILL_CAPABILITIES.length + 2);
  const caps = result.results.map((r) => r.capability);
  assert.ok(caps.includes('travel_generation'));
  assert.ok(caps.includes('marketplace_generation'));
  assert.ok(caps.includes('render'));
  assert.ok(caps.includes('publish'));
  assert.equal(result.metrics.totalRuns, 1);
  assert.equal(result.metrics.successRate, 1);
});
