/**
 * Phase 12 – QA Integration Layer
 * Tests QA01–QA12
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

import { createRuntime } from '../lib/aivos/runtime/index.js';
import { createQaEngine, isQaEnabled, QA_PHASE } from '../lib/aivos/qa/index.js';
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
    forceNew: true,
    growthEngine: mockGrowth,
    authenticateToken: (_q, _s, n) => n(),
    ...overrides,
  });
  return app;
}

test('QA01 qa disabled returns stub with enabled=false', () => {
  const saved = process.env.AIVOS_QA_ENABLED;
  process.env.AIVOS_QA_ENABLED = '0';
  const qa = createQaEngine({ runtime: makeRuntime() });
  assert.equal(qa.enabled, false);
  assert.equal(qa.probeLayers().ok, false);
  process.env.AIVOS_QA_ENABLED = saved;
});

test('QA02 isQaEnabled respects AIVOS_QA_ENABLED flag', () => {
  const saved = process.env.AIVOS_QA_ENABLED;
  process.env.AIVOS_QA_ENABLED = '1';
  assert.equal(isQaEnabled(), true);
  process.env.AIVOS_QA_ENABLED = '0';
  assert.equal(isQaEnabled(), false);
  process.env.AIVOS_QA_ENABLED = saved;
});

test('QA03 layer probe reports all runtime layers healthy', () => {
  const rt = makeRuntime();
  const qa = createQaEngine({ runtime: rt });
  const result = qa.probeLayers();
  assert.equal(result.ok, true);
  assert.equal(result.passCount, result.total);
  assert.ok(result.layers.some((l) => l.id === 'runtime' && l.ok));
  assert.ok(result.layers.some((l) => l.id === 'revenue' && l.ok));
});

test('QA04 layer probe fails when marketplace disabled', () => {
  const saved = process.env.AIVOS_MARKETPLACE_ENABLED;
  process.env.AIVOS_MARKETPLACE_ENABLED = '0';
  const rt = makeRuntime({ forceNew: true });
  const qa = createQaEngine({ runtime: rt });
  const result = qa.probeLayers();
  assert.equal(result.ok, false);
  const mp = result.layers.find((l) => l.id === 'marketplace');
  assert.equal(mp.ok, false);
  process.env.AIVOS_MARKETPLACE_ENABLED = saved;
});

test('QA05 feedback loop probe reports closed loop', () => {
  const rt = makeRuntime();
  const qa = createQaEngine({ runtime: rt });
  const result = qa.probeFeedback();
  assert.equal(result.closed, true);
  assert.equal(result.passCount, result.total);
  assert.ok(result.steps.some((s) => s.step === 'optimization' && s.ok));
});

test('QA06 feedback loop open when learning disabled', () => {
  const saved = process.env.AIVOS_LEARNING_ENABLED;
  process.env.AIVOS_LEARNING_ENABLED = '0';
  const rt = makeRuntime({ forceNew: true });
  const qa = createQaEngine({ runtime: rt });
  const result = qa.probeFeedback();
  assert.equal(result.closed, false);
  process.env.AIVOS_LEARNING_ENABLED = saved;
});

test('QA07 route catalog lists public API routes including qa endpoints', () => {
  const qa = createQaEngine({ runtime: makeRuntime() });
  const routes = qa.listRoutes();
  assert.ok(routes.length >= 10);
  assert.ok(routes.some((r) => r.path === '/api/aivos/qa/health'));
  assert.ok(routes.some((r) => r.path === '/api/aivos/runtime/jobs' && r.method === 'POST'));
  assert.equal(qa.routeCount(), routes.length);
});

test('QA08 QA_PHASE constant is 12', () => {
  assert.equal(QA_PHASE, 12);
  const qa = createQaEngine({ runtime: makeRuntime() });
  assert.equal(qa.phase, 12);
});

test('QA09 HTTP qa health returns 200 when subsystems healthy', async () => {
  await withServer(makeApp(), async (port) => {
    const res  = await fetch(`http://127.0.0.1:${port}/api/aivos/qa/health`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.phase, 12);
    assert.ok(body.layers?.ok);
    assert.equal(body.feedback?.closed, true);
  });
});

test('QA10 HTTP qa layers endpoint returns layer matrix', async () => {
  await withServer(makeApp(), async (port) => {
    const res  = await fetch(`http://127.0.0.1:${port}/api/aivos/qa/layers`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.ok(Array.isArray(body.layers));
    assert.equal(body.passCount, body.total);
  });
});

test('QA11 HTTP qa feedback-loop endpoint returns step status', async () => {
  await withServer(makeApp(), async (port) => {
    const res  = await fetch(`http://127.0.0.1:${port}/api/aivos/qa/feedback-loop`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.closed, true);
    assert.ok(body.steps.some((s) => s.step === 'governance' && s.ok));
  });
});

test('QA12 qa module has no Kernel imports', () => {
  const dir = join(__dir, '../lib/aivos/qa');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const src = readFileSync(join(dir, f), 'utf8');
    assert.ok(!/from\s+['"][^'"]*kernel[^'"]*['"]/i.test(src), `qa/${f} must not import Kernel`);
  }
});
