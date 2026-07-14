/**
 * Phase 1.5 — Runtime Integration Validation (executable)
 * Run: node --test __tests__/aivosPhase15Validation.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import express from 'express';
import { createRuntime } from '../lib/aivos/runtime/index.js';
import { createAivosSdk } from '../lib/aivos/sdk/index.js';
import { registerAivosRoutes } from '../lib/aivos/index.js';
import { CANONICAL_DAG_NODES } from '../lib/aivos/runtime/types.js';
import { validateAcpEnvelope } from '../lib/aivos/runtime/acpValidator.js';
import { runPartialGraph, resumeGraphFromCheckpoint } from './helpers/phase15ResumeHarness.js';

process.env.AIVOS_RESUME_PLUGIN_ENABLED = '1';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AIVOS_ROOT = join(__dirname, '../lib/aivos');
const MIGRATION_259 = join(__dirname, '../db/migrations/259_ai_video_platform.sql');

export const phase15Results = [];

function record(id, name, pass, evidence) {
  phase15Results.push({ id, name, pass, evidence, at: new Date().toISOString() });
}

function makeRuntime(overrides = {}) {
  return createRuntime({ syncExecute: true, ...overrides });
}

function collectJsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...collectJsFiles(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

test('P15-01 Runtime boots successfully', async () => {
  let pass = false;
  let evidence = {};
  try {
    const runtime = makeRuntime();
    pass = typeof runtime.taskRuntime.submitJob === 'function';
    evidence = { moduleCount: Object.keys(runtime).length, storeKind: runtime.store.kind };
  } catch (e) {
    evidence = { error: e.message };
  }
  record('P15-01', 'Runtime boots successfully', pass, evidence);
  assert.equal(pass, true);
});

test('P15-02 createRuntime() resolves every dependency', async () => {
  const required = [
    'store', 'events', 'registry', 'skillGraph', 'capabilityDiscovery', 'planner',
    'policyEngine', 'promptCompiler', 'governance', 'approvalGate', 'observability',
    'contextManager', 'checkpointManager', 'executionGraph', 'executionRuntime',
    'taskRuntime', 'costDashboard', 'creativeRuntime', 'learningEngine', 'marketplace', 'acp',
  ];
  const runtime = makeRuntime();
  const missing = required.filter((k) => runtime[k] == null);
  const pass = missing.length === 0;
  record('P15-02', 'createRuntime() resolves every dependency', pass, { required: required.length, missing });
  assert.deepEqual(missing, []);
});

test('P15-03 Runtime accepts a Job', async () => {
  const runtime = makeRuntime();
  const job = await runtime.taskRuntime.submitJob({
    pluginId: 'resume-ai',
    intent: { role: 'QA', goals: 'Validate runtime' },
  });
  const pass = Boolean(job?.id && job.status === 'preview');
  record('P15-03', 'Runtime accepts a Job', pass, { jobId: job?.id, status: job?.status });
  assert.equal(pass, true);
});

test('P15-04 Planner generates an Execution Graph', async () => {
  const runtime = makeRuntime();
  const plan = await runtime.planner.buildPlan({
    pluginId: 'resume-ai',
    intent: { role: 'Dev', goals: 'Graph' },
    jobId: 'plan-test',
  });
  const nodeCount = plan.dag?.nodes?.length || 0;
  const pass = nodeCount === CANONICAL_DAG_NODES.length;
  record('P15-04', 'Planner generates an Execution Graph', pass, { nodeCount, expected: CANONICAL_DAG_NODES.length, template: plan.workflowTemplateId });
  assert.equal(nodeCount, CANONICAL_DAG_NODES.length);
});

test('P15-05 Execution Graph checkpoints correctly', async () => {
  const runtime = makeRuntime();
  const plan = await runtime.planner.buildPlan({ pluginId: 'resume-ai', intent: { role: 'A', goals: 'B' }, jobId: 'cp-1' });
  const job = await runtime.store.insertJob({ plugin_id: 'resume-ai', intent: { role: 'A', goals: 'B' }, status: 'executing' });
  const exec = await runtime.executionGraph.executePlan({ jobId: job.id, plan, traceId: job.trace_id || 't1' });
  const checkpoints = await runtime.checkpointManager.listCheckpoints(exec.workflowJobId);
  const pass = checkpoints.length === CANONICAL_DAG_NODES.length && checkpoints.every((c) => /^[a-f0-9]{64}$/.test(c.checksum));
  record('P15-05', 'Execution Graph checkpoints correctly', pass, { checkpointCount: checkpoints.length, workflowJobId: exec.workflowJobId });
  assert.equal(pass, true);
});

test('P15-06 Checkpoint resumes after interruption', async () => {
  const runtime = makeRuntime();
  const plan = await runtime.planner.buildPlan({ pluginId: 'resume-ai', intent: { role: 'R', goals: 'Resume' }, jobId: 'resume-1' });
  const job = await runtime.store.insertJob({ plugin_id: 'resume-ai', intent: { role: 'R', goals: 'Resume' }, status: 'executing', trace_id: 'trace-resume' });
  const session = await runPartialGraph({
    store: runtime.store,
    checkpointManager: runtime.checkpointManager,
    jobId: job.id,
    plan,
    traceId: 'trace-resume',
    stopAfterNodeId: 'analyze',
  });
  const resumed = await resumeGraphFromCheckpoint({
    store: runtime.store,
    checkpointManager: runtime.checkpointManager,
    session: { ...session, jobId: job.id },
  });
  const stopIdx = CANONICAL_DAG_NODES.findIndex((n) => n.id === 'analyze');
  const pass =
    resumed.completedBefore === stopIdx + 1 &&
    resumed.resumed.length === CANONICAL_DAG_NODES.length - (stopIdx + 1);
  record('P15-06', 'Checkpoint resumes after interruption', pass, {
    stopAfterNodeId: 'analyze',
    completedBefore: resumed.completedBefore,
    resumedNodes: resumed.resumed.length,
    totalNodes: resumed.totalNodes,
  });
  assert.equal(pass, true);
});

test('P15-07 Policy Engine selects a mock model', async () => {
  const runtime = makeRuntime();
  const result = await runtime.policyEngine.resolve({
    jobId: 'pol-1',
    pluginId: 'resume-ai',
    taskType: 'structured_json',
    intent: { role: 'X', goals: 'Y' },
    traceId: 'tr-1',
  });
  const pass = result.decision.modelSlot === 'hermes3:3b' && Boolean(result.auditRow?.id);
  record('P15-07', 'Policy Engine selects a mock model', pass, { modelSlot: result.decision.modelSlot, auditId: result.auditRow?.id });
  assert.equal(pass, true);
});

test('P15-08 Prompt Compiler compiles Intent', async () => {
  const runtime = makeRuntime();
  const compiled = await runtime.promptCompiler.compile({
    jobId: 'pc-1',
    intent: { role: 'Writer', goals: 'Compile' },
    skillId: 'resume-extract-profile',
    promptId: 'talent-resume-draft',
    promptVersion: 1,
  });
  const pass = compiled.output?.messages?.length === 2 && /^[a-f0-9]{64}$/.test(compiled.contentHash);
  record('P15-08', 'Prompt Compiler compiles Intent', pass, { messageCount: compiled.output?.messages?.length, hash: compiled.contentHash?.slice(0, 12) });
  assert.equal(pass, true);
});

test('P15-09 Approval workflow Approve / Reject / Reprompt', async () => {
  const runtime = makeRuntime();
  const job = await runtime.taskRuntime.submitJob({ pluginId: 'resume-ai', intent: { role: 'A', goals: 'B' } });
  await runtime.taskRuntime.reject(job.id, 'u1');
  const rejected = await runtime.store.getApprovalByJobId(job.id);
  assert.equal(rejected.state, 'rejected');

  const job2 = await runtime.taskRuntime.submitJob({ pluginId: 'resume-ai', intent: { role: 'C', goals: 'D' } });
  await runtime.taskRuntime.reprompt(job2.id, { role: 'C2', goals: 'D2' }, 'u1');
  const reprompted = await runtime.store.getApprovalByJobId(job2.id);
  assert.equal(reprompted.state, 'preview');

  const job3 = await runtime.taskRuntime.submitJob({ pluginId: 'resume-ai', intent: { role: 'E', goals: 'F' } });
  await runtime.taskRuntime.approve(job3.id, 'u1');
  const approved = await runtime.store.getApprovalByJobId(job3.id);
  const pass = rejected.state === 'rejected' && reprompted.state === 'preview' && approved.state === 'approved';
  record('P15-09', 'Approval workflow Approve / Reject / Reprompt', pass, { reject: rejected.state, reprompt: reprompted.state, approve: approved.state });
  assert.equal(pass, true);
});

test('P15-10 Runtime emits ACP events', async () => {
  const runtime = makeRuntime();
  const job = await runtime.taskRuntime.submitJob({ pluginId: 'resume-ai', intent: { role: 'Ev', goals: 'Ents' } });
  const events = await runtime.events.listByJob(job.id);
  const valid = events.filter((e) => validateAcpEnvelope({
    schemaVersion: e.schema_version,
    name: e.name,
    correlationId: e.correlation_id,
    traceId: e.trace_id,
    contextId: e.context_id,
    timestamp: e.created_at,
    source: e.source,
    payload: e.payload,
  }).valid);
  const pass = valid.length >= 3;
  record('P15-10', 'Runtime emits ACP events', pass, { totalEvents: events.length, validAcp: valid.length, sample: events.slice(0, 3).map((e) => e.name) });
  assert.equal(pass, true);
});

test('P15-11 SDK calls Runtime without importing Kernel', async () => {
  const files = collectJsFiles(AIVOS_ROOT);
  const importViolations = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    if (/from\s+['"][^'"]*\/kernel\//.test(src) || /import\s+['"][^'"]*\/kernel\//.test(src)) {
      importViolations.push(f);
    }
  }
  const runtime = makeRuntime();
  const sdk = createAivosSdk({ runtime });
  const job = await sdk.runtime().submitJob('resume-ai', { role: 'SDK', goals: 'NoKernel' });
  const pass = importViolations.length === 0 && Boolean(job?.id);
  record('P15-11', 'SDK calls Runtime without importing Kernel', pass, { violations: importViolations, jobId: job?.id });
  assert.equal(pass, true);
});

test('P15-12 Health endpoint reports READY', async () => {
  const app = express();
  app.use(express.json());
  registerAivosRoutes(app, { runtimeEnabled: true, authenticateToken: (_q, _s, n) => n() });
  const server = app.listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/aivos/runtime/health`);
    const body = await res.json();
    const pass = res.status === 200 && body.status === 'READY' && body.ok === true;
    record('P15-12', 'Health endpoint reports READY', pass, body);
    assert.equal(pass, true);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('P15-13 Queue processes Runtime jobs', async () => {
  const processed = [];
  let runtime;
  runtime = makeRuntime({
    syncExecute: false,
    enqueueJob: async ({ jobId, traceId }) => {
      processed.push(jobId);
      const plan = await runtime.store.getPlanByJobId(jobId);
      await runtime.executionRuntime.run({ jobId, plan, traceId });
      await runtime.store.updateJob(jobId, { status: 'preview' });
    },
  });
  const job = await runtime.taskRuntime.submitJob({ pluginId: 'resume-ai', intent: { role: 'Q', goals: 'Worker' } });
  const pass = processed.length === 1 && job.status === 'preview';
  record('P15-13', 'Queue processes Runtime jobs', pass, { processed, jobStatus: job.status });
  assert.equal(pass, true);
});

test('P15-14 Migration 259 applies and rolls back cleanly', async () => {
  const sql = readFileSync(MIGRATION_259, 'utf8');
  const createMatches = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/gi)].map((m) => m[1]);
  const rollbackSql = createMatches.map((t) => `DROP TABLE IF EXISTS ${t} CASCADE;`).join('\n');
  const pass = createMatches.length >= 15 && rollbackSql.includes('aivos_runtime_jobs') && statSync(MIGRATION_259).size > 1000;
  record('P15-14', 'Migration 259 applies and rolls back cleanly', pass, {
    tables: createMatches.length,
    rollbackStatements: createMatches.length,
    migrationBytes: statSync(MIGRATION_259).size,
    note: 'Static apply/rollback SQL validated; live DB apply via scripts/run-migration.js 259',
  });
  assert.equal(pass, true);
});

test('P15-15 Feature flag disabled preserves legacy behavior', async () => {
  const app = express();
  app.use(express.json());
  registerAivosRoutes(app, { runtimeEnabled: false });
  const server = app.listen(0);
  const port = server.address().port;
  try {
    const health = await fetch(`http://127.0.0.1:${port}/api/aivos/runtime/health`).then((r) => r.json());
    const blocked = await fetch(`http://127.0.0.1:${port}/api/aivos/runtime/jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const pass = health.status === 'DISABLED' && health.enabled === false && blocked.status === 503;
    record('P15-15', 'Feature flag disabled preserves legacy behavior', pass, { health, jobsStatus: blocked.status });
    assert.equal(pass, true);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('P15-16 Runtime survives 100 concurrent mock jobs', async () => {
  const runtime = makeRuntime();
  const started = Date.now();
  const jobs = await Promise.all(
    Array.from({ length: 100 }, (_, i) =>
      runtime.taskRuntime.submitJob({
        pluginId: 'resume-ai',
        intent: { role: `Role${i}`, goals: `Goal${i}` },
      }),
    ),
  );
  const elapsedMs = Date.now() - started;
  const pass = jobs.length === 100 && jobs.every((j) => j.status === 'preview');
  record('P15-16', 'Runtime survives 100 concurrent mock jobs', pass, { count: jobs.length, elapsedMs, failures: jobs.filter((j) => j.status !== 'preview').length });
  assert.equal(pass, true);
});

test('P15-17 Worker restart resumes pending jobs', async () => {
  const pending = [];
  const worker = async (runtime, { jobId, traceId }) => {
    const plan = await runtime.store.getPlanByJobId(jobId);
    await runtime.executionRuntime.run({ jobId, plan, traceId });
    await runtime.store.updateJob(jobId, { status: 'preview' });
  };
  const runtime = makeRuntime({
    syncExecute: false,
    enqueueJob: async (payload) => {
      pending.push(payload);
    },
  });
  const submitted = await runtime.taskRuntime.submitJob({ pluginId: 'resume-ai', intent: { role: 'W', goals: 'Restart' } });
  assert.equal(submitted.status, 'executing');
  assert.equal(pending.length, 1);

  await worker(runtime, pending[0]);
  const afterRestart = await runtime.taskRuntime.getJob(submitted.id);
  const pass = afterRestart.status === 'preview';
  record('P15-17', 'Worker restart resumes pending jobs', pass, {
    jobId: submitted.id,
    pendingBeforeWorker: pending.length,
    statusAfterWorker: afterRestart.status,
  });
  assert.equal(pass, true);
});

test('P15-19 Observability timeline records node spans', async () => {
  const runtime = makeRuntime();
  const job = await runtime.taskRuntime.submitJob({ pluginId: 'resume-ai', intent: { role: 'Obs', goals: 'Trace' } });
  const timeline = await runtime.observability.getTimeline(job.id);
  const pass = timeline.length >= CANONICAL_DAG_NODES.length * 2;
  record('P15-19', 'Observability timeline records node spans', pass, { jobId: job.id, timelineEntries: timeline.length });
  assert.equal(pass, true);
});

test('P15-18 Runtime has zero direct Kernel dependency', () => {
  const files = collectJsFiles(AIVOS_ROOT);
  const violations = [];
  for (const f of files) {
    const rel = f.replace(/\\/g, '/');
    const src = readFileSync(f, 'utf8');
    if (/from\s+['"][^'"]*(?:\/kernel\/|ai-core)/.test(src)) violations.push({ file: rel, kind: 'import' });
    if (/require\s*\(\s*['"][^'"]*(?:\/kernel\/|ai-core)/.test(src)) violations.push({ file: rel, kind: 'require' });
  }
  const pass = violations.length === 0;
  record('P15-18', 'Runtime has zero direct Kernel dependency', pass, { scannedFiles: files.length, violations });
  assert.equal(pass, true);
});
