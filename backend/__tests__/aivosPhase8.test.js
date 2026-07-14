/**
 * Phase 8 – Production
 * Tests: PR01–PR10 (readiness, openapi, trace/timeline/cost APIs, alerts, smoke)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

process.env.AIVOS_RESUME_PLUGIN_ENABLED = '1';
process.env.AIVOS_RUNTIME_ENABLED       = '1';
process.env.AIVOS_ANALYTICS_ENABLED     = '1';
process.env.AIVOS_LEARNING_ENABLED      = '1';
process.env.AIVOS_OPTIMIZATION_ENABLED  = '1';
process.env.AIVOS_AUTOMATION_ENABLED    = '1';
process.env.AIVOS_REVENUE_ENABLED       = '1';

import { createRuntime } from '../lib/aivos/runtime/index.js';
import { registerAivosRoutes } from '../lib/aivos/index.js';
import { createReadinessCheck, createAlertRules, generateOpenApiSpec, getProductionChecklist, PRODUCTION_PHASE } from '../lib/aivos/production/index.js';

const __dir = dirname(fileURLToPath(import.meta.url));

function makeRuntime(overrides = {}) {
  return createRuntime({ syncExecute: true, ...overrides });
}

function makeApp(overrides = {}) {
  const app = express();
  app.use(express.json());
  registerAivosRoutes(app, { runtimeEnabled: true, authenticateToken: (_q, _s, n) => n(), ...overrides });
  return app;
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

// ── PR01–PR04: Production modules ───────────────────────────────────────────

test('PR01 readiness check passes with full runtime stack', () => {
  const rt = makeRuntime();
  const result = createReadinessCheck({ runtime: rt }).check();
  assert.equal(result.ok, true, 'readiness must pass');
  assert.equal(result.phase, PRODUCTION_PHASE);
  assert.ok(result.checks.length >= 10, 'all subsystem checks present');
});

test('PR02 OpenAPI spec covers all public Runtime routes', () => {
  const spec = generateOpenApiSpec();
  assert.equal(spec.openapi, '3.0.3');
  assert.ok(spec.paths['/runtime/health'], 'health path');
  assert.ok(spec.paths['/runtime/jobs'], 'jobs path');
  assert.ok(spec.paths['/runtime/jobs/{id}/trace'], 'trace path');
  assert.ok(spec.paths['/runtime/jobs/{id}/timeline'], 'timeline path');
  assert.ok(spec.paths['/runtime/jobs/{id}/cost'], 'cost path');
  assert.ok(spec.paths['/production/readiness'], 'readiness path');
  assert.ok(spec.paths['/production/openapi.json'], 'openapi path');
});

test('PR03 alert rules fire on threshold breach and stay silent below threshold', () => {
  const alerts = createAlertRules({ thresholds: { errorRate: 0.05, p95LatencyMs: 500, queueDepth: 10 } });
  const clean  = alerts.evaluate({ errorRate: 0.01, p95LatencyMs: 100, queueDepth: 2 });
  const breach = alerts.evaluate({ errorRate: 0.10, p95LatencyMs: 600, queueDepth: 20 });
  assert.equal(clean.ok, true, 'no alerts below threshold');
  assert.equal(clean.alerts.length, 0);
  assert.equal(breach.ok, false, 'alerts fire above threshold');
  assert.ok(breach.alerts.length >= 3, 'all three rules triggered');
});

test('PR04 production checklist reports complete when runtime enabled', () => {
  const checklist = getProductionChecklist({ runtimeEnabled: true });
  assert.equal(checklist.phase, PRODUCTION_PHASE);
  assert.equal(checklist.complete, true);
  assert.equal(checklist.passCount, checklist.total);
});

// ── PR05–PR10: HTTP smoke tests ───────────────────────────────────────────────

test('PR05 smoke: health endpoint reports phase 8 READY', async () => {
  await withServer(makeApp(), async (port) => {
    const res  = await fetch(`http://127.0.0.1:${port}/api/aivos/runtime/health`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.status, 'READY');
    assert.equal(body.phase, PRODUCTION_PHASE);
  });
});

test('PR06 smoke: readiness endpoint returns 200 with subsystem checks', async () => {
  await withServer(makeApp(), async (port) => {
    const res  = await fetch(`http://127.0.0.1:${port}/api/aivos/production/readiness`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.ok(Array.isArray(body.checks));
  });
});

test('PR07 smoke: openapi.json endpoint serves valid spec', async () => {
  await withServer(makeApp(), async (port) => {
    const res  = await fetch(`http://127.0.0.1:${port}/api/aivos/production/openapi.json`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.openapi, '3.0.3');
    assert.ok(body.paths['/runtime/jobs/{id}/trace']);
  });
});

test('PR08 smoke: trace API returns spans for instrumented job', async () => {
  const rt  = makeRuntime();
  const job = await rt.store.insertJob({ skill: 'test', status: 'pending' });
  rt.observability.startSpan({ name: 'aivos.runtime.job',    runtimeJobId: job.id });
  rt.observability.startSpan({ name: 'aivos.execution.node', runtimeJobId: job.id });

  const spans = rt.observability.getJobTrace(job.id);
  assert.equal(spans.length, 2, 'two spans recorded for job');
  spans.forEach((s) => assert.ok(s.trace_id, 'each span has trace_id'));
});

test('PR09 smoke: disabled runtime returns 503 on job routes', async () => {
  const app = express();
  app.use(express.json());
  registerAivosRoutes(app, { runtimeEnabled: false });
  await withServer(app, async (port) => {
    const health = await fetch(`http://127.0.0.1:${port}/api/aivos/runtime/health`).then((r) => r.json());
    const jobs   = await fetch(`http://127.0.0.1:${port}/api/aivos/runtime/jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(health.status, 'DISABLED');
    assert.equal(jobs.status, 503);
  });
});

test('PR10 production module has no Kernel imports', () => {
  const prodDir = join(__dir, '../lib/aivos/production');
  const files = readdirSync(prodDir).filter((f) => f.endsWith('.js'));
  for (const f of files) {
    const src = readFileSync(join(prodDir, f), 'utf8');
    assert.ok(!/from\s+['"][^'"]*kernel[^'"]*['"]/i.test(src), `production/${f} must not import Kernel`);
  }
});
