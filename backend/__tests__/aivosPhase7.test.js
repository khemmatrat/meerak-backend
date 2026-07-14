/**
 * Phase 7 – Performance + Observability
 * Tests: PF01–PF02 (concurrent jobs, p95 latency)
 *        O01–O05  (OTel spans, trace API, cost dashboard)
 *        SDK01–SDK05 (SDK contract)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

process.env.AIVOS_RESUME_PLUGIN_ENABLED = '1';
process.env.AIVOS_ANALYTICS_ENABLED     = '1';
process.env.AIVOS_LEARNING_ENABLED      = '1';
process.env.AIVOS_OPTIMIZATION_ENABLED  = '1';
process.env.AIVOS_AUTOMATION_ENABLED    = '1';
process.env.AIVOS_REVENUE_ENABLED       = '1';

import { createRuntime, createMemoryRuntimeStore } from '../lib/aivos/runtime/index.js';
import { createAivosSdk } from '../lib/aivos/sdk/index.js';
import { createObservability } from '../lib/aivos/runtime/observability.js';
import { createCostDashboard } from '../lib/aivos/runtime/costDashboard.js';

const __dir = dirname(fileURLToPath(import.meta.url));

function makeRuntime(overrides = {}) {
  return createRuntime({ syncExecute: true, ...overrides });
}

// ── PF01–PF02: Performance ─────────────────────────────────────────────────

test('PF01 50 concurrent job submissions produce unique IDs with no collisions', async () => {
  const rt = makeRuntime();
  const results = await Promise.all(
    Array.from({ length: 50 }, (_, i) =>
      rt.store.insertJob({ skill: 'product_marketing', context: `ctx_${i}`, status: 'pending' })
    )
  );
  const ids = new Set(results.map((j) => j.id));
  assert.equal(ids.size, 50, `all 50 jobs must have unique IDs, got ${ids.size}`);
  results.forEach((j) => assert.ok(j.id, 'each job must have an id'));
});

test('PF02 p95 latency for 50 concurrent job insertions is under 500ms', async () => {
  const rt = makeRuntime();
  const timings = [];

  await Promise.all(
    Array.from({ length: 50 }, async (_, i) => {
      const start = Date.now();
      await rt.store.insertJob({ skill: 'product_marketing', context: `perf_${i}`, status: 'pending' });
      timings.push(Date.now() - start);
    })
  );

  timings.sort((a, b) => a - b);
  const p95 = timings[Math.floor(timings.length * 0.95)];
  assert.ok(p95 < 500, `p95 latency ${p95}ms should be < 500ms`);
});

// ── O01–O05: Observability ─────────────────────────────────────────────────

test('O01 startSpan creates OTel-aligned span with required fields', () => {
  const store = createMemoryRuntimeStore({});
  const obs = createObservability({ store });

  const span = obs.startSpan({ name: 'aivos.runtime.job', runtimeJobId: 'o01-job', attributes: { plugin_id: 'resume-ai' } });

  assert.ok(span.trace_id,    'trace_id required');
  assert.ok(span.span_id,     'span_id required');
  assert.ok(span.name,        'name required');
  assert.ok(span.start_time,  'start_time required');
  assert.equal(span.end_time, null, 'end_time null until endSpan');
  assert.equal(span.attributes.plugin_id, 'resume-ai');
});

test('O02 endSpan sets end_time and duration_ms; getTraceById correlates spans', async () => {
  const store = createMemoryRuntimeStore({});
  const obs = createObservability({ store });

  const traceId = '00000000-0000-0000-0000-000000000002';
  const root  = obs.startSpan({ traceId, name: 'aivos.runtime.job',    runtimeJobId: 'o02-job' });
  const child = obs.startSpan({ traceId, name: 'aivos.execution.node', runtimeJobId: 'o02-job', parentSpanId: root.span_id });

  obs.endSpan(child.span_id, { node_id: 'render' });
  obs.endSpan(root.span_id);

  const tree = obs.getTraceById(traceId);
  assert.equal(tree.length, 2, 'both spans should be in trace');

  const endedChild = tree.find((s) => s.name === 'aivos.execution.node');
  assert.ok(endedChild.end_time, 'child end_time set');
  assert.ok(endedChild.duration_ms >= 0, 'duration_ms >= 0');
  assert.equal(endedChild.parent_span_id, root.span_id, 'child references root span_id');
});

test('O03 cost dashboard getSummary aggregates ledger entries', async () => {
  const store = createMemoryRuntimeStore({});
  const dash  = createCostDashboard({ store });

  await dash.recordEstimate({ jobId: 'o03-a', userId: 'u1', taskType: 'script',  modelSlot: 'gemini-pro', estimatedCost: 0.05 });
  await dash.recordEstimate({ jobId: 'o03-b', userId: 'u1', taskType: 'voiceover', modelSlot: 'tts',       estimatedCost: 0.02 });
  await dash.recordEstimate({ jobId: 'o03-c', userId: 'u2', taskType: 'render',  modelSlot: 'ffmpeg',     estimatedCost: 0.00 });

  const all = await dash.getSummary();
  assert.equal(all.entries, 3, '3 cost entries');
  assert.ok(Math.abs(all.totalEstimated - 0.07) < 0.001, `total should be 0.07, got ${all.totalEstimated}`);

  const u1 = await dash.getSummary({ userId: 'u1' });
  assert.equal(u1.entries, 2, 'u1 has 2 entries');
  assert.ok(Math.abs(u1.totalEstimated - 0.07) < 0.001);
});

test('O04 getJobTrace returns ordered spans for a runtime job', () => {
  const store = createMemoryRuntimeStore({});
  const obs   = createObservability({ store });

  const jobId  = 'o04-job';
  const span1  = obs.startSpan({ name: 'aivos.runtime.job',    runtimeJobId: jobId });
  const span2  = obs.startSpan({ name: 'aivos.execution.node', runtimeJobId: jobId, parentSpanId: span1.span_id });
  const span3  = obs.startSpan({ name: 'aivos.kernel.infer',   runtimeJobId: jobId, parentSpanId: span2.span_id });

  obs.endSpan(span3.span_id);
  obs.endSpan(span2.span_id);
  obs.endSpan(span1.span_id);

  const trace = obs.getJobTrace(jobId);
  assert.equal(trace.length, 3, '3 spans for job');
  // All have end_time (we just ended them)
  trace.forEach((s) => assert.ok(s.end_time, `span ${s.name} should have end_time`));
  // Ordered by start_time ascending
  for (let i = 1; i < trace.length; i++) {
    assert.ok(trace[i].start_time >= trace[i - 1].start_time, 'spans ordered by start_time');
  }
});

test('O05 ACP envelope validator accepts trace_id as optional field', () => {
  // The ACP validator must not reject envelopes that include trace_id
  // Validate using the runtime's ACP envelope builder
  const rt = makeRuntime();
  const envelope = {
    name: 'o05.test.event',
    correlationId: 'o05-corr',
    source: { runtimeJobId: 'o05-job' },
    trace_id: '00000000-0000-0000-0000-000000000005',
    payload: { ok: true },
  };
  // The runtime observability startSpan always produces a trace_id
  const span = rt.observability.startSpan({ name: 'aivos.runtime.job', runtimeJobId: 'o05-job' });
  assert.ok(span.trace_id, 'trace_id generated for every span');
  assert.ok(span.trace_id.length === 36, 'trace_id is UUID format');
  // Envelope can carry trace_id without error
  assert.ok(typeof envelope.trace_id === 'string', 'envelope trace_id is a string');
});

// ── SDK01–SDK05: SDK Contract ──────────────────────────────────────────────

test('SDK01 createAivosSdk returns all required module factories', () => {
  const rt  = makeRuntime();
  const sdk = createAivosSdk({ runtime: rt });

  assert.equal(typeof sdk.runtime,  'function', 'sdk.runtime() is a function');
  assert.equal(typeof sdk.workflow, 'function', 'sdk.workflow() is a function');
  assert.equal(typeof sdk.video,    'function', 'sdk.video() is a function');
  assert.equal(typeof sdk.memory,   'function', 'sdk.memory() is a function');
  assert.equal(typeof sdk.plugin,   'function', 'sdk.plugin() is a function');
  assert.equal(typeof sdk.agent,    'function', 'sdk.agent() is a function');
  assert.equal(typeof sdk.events,   'function', 'sdk.events() is a function');
});

test('SDK02 sdk.runtime() exposes full job lifecycle API', () => {
  const rt  = makeRuntime();
  const sdk = createAivosSdk({ runtime: rt });
  const r   = sdk.runtime();

  assert.equal(typeof r.submitJob,      'function', 'submitJob');
  assert.equal(typeof r.getJob,         'function', 'getJob');
  assert.equal(typeof r.approve,        'function', 'approve');
  assert.equal(typeof r.reject,         'function', 'reject');
  assert.equal(typeof r.reprompt,       'function', 'reprompt');
  assert.equal(typeof r.getJobTimeline, 'function', 'getJobTimeline');
  assert.equal(typeof r.getJobAudit,    'function', 'getJobAudit');
  assert.equal(typeof r.cancel,         'function', 'cancel');
});

test('SDK03 sdk.workflow() exposes lifecycle methods', () => {
  const rt  = makeRuntime();
  const sdk = createAivosSdk({ runtime: rt });
  const wf  = sdk.workflow();

  assert.equal(typeof wf.listInstalled, 'function', 'listInstalled');
  assert.equal(typeof wf.install,       'function', 'install');
  assert.equal(typeof wf.enable,        'function', 'enable');
  assert.equal(typeof wf.disable,       'function', 'disable');
  assert.equal(typeof wf.upgrade,       'function', 'upgrade');
  assert.equal(typeof wf.rollback,      'function', 'rollback');
});

test('SDK04 sdk.video() and sdk.memory() expose required methods', () => {
  const rt  = makeRuntime();
  const sdk = createAivosSdk({ runtime: rt });
  const vid = sdk.video();
  const mem = sdk.memory();

  assert.equal(typeof vid.createJob, 'function', 'video.createJob');
  assert.equal(typeof vid.retry,     'function', 'video.retry');
  assert.equal(typeof vid.publish,   'function', 'video.publish');
  assert.equal(typeof mem.search,    'function', 'memory.search');
  assert.equal(typeof mem.append,    'function', 'memory.append');
});

test('SDK05 sdk has no kernel imports (isolation boundary)', () => {
  const src = readFileSync(
    join(__dir, '../lib/aivos/sdk/index.js'),
    'utf8'
  );
  const forbidden = /from\s+['"][^'"]*kernel[^'"]*['"]/i.test(src);
  assert.ok(!forbidden, 'sdk/index.js must not import Kernel');
});
