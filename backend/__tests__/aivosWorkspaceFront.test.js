import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fetch from 'node-fetch';
import { registerWorkspaceRoutes } from '../lib/aivos/workspaceRoutes.js';
import { createRuntime } from '../lib/aivos/runtime/index.js';

function startApp() {
  process.env.AIVOS_RUNTIME_ENABLED = '1';
  process.env.AIVOS_KERNEL_ENABLED = '1';
  process.env.AIVOS_RESUME_PLUGIN_ENABLED = '1';
  process.env.AIVOS_WORKSPACE_ENABLED = '1';
  const app = express();
  app.use(express.json());
  registerWorkspaceRoutes(app, { runtimeEnabled: true, workspaceEnabled: true });
  const server = app.listen(0);
  return { app, server, port: server.address().port };
}

test('F01 capability-driven plugin selection creates job', async () => {
  const { server, port } = startApp();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/aivos/workspace/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ capability: 'video.talent_intro', intent: { role: 'Biz', goals: 'Workspace' } }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.ok(body.job?.pluginId || body.job?.plugin_id || body.job?.plan);
  } finally {
    server.close();
  }
});

test('F02 real-time events available for job progress', async () => {
  const runtime = createRuntime({ syncExecute: true, forceResumePlugin: true });
  const job = await runtime.taskRuntime.submitJob({ pluginId: 'resume-ai', intent: { role: 'PM', goals: 'Events' } });
  const events = await runtime.events.listByJob(job.id);
  assert.ok(events.some((e) => e.name?.startsWith('aivos.pipeline.stage.')));
});

test('F03 drafts and history are retrievable', async () => {
  const { server, port } = startApp();
  try {
    const draftRes = await fetch(`http://127.0.0.1:${port}/api/aivos/workspace/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ capability: 'video.talent_intro', intent: { role: 'Draft', goals: 'Save' }, draft: true }),
    });
    assert.equal(draftRes.status, 201);
    const hist = await fetch(`http://127.0.0.1:${port}/api/aivos/workspace/jobs/history`).then((r) => r.json());
    assert.ok((hist.jobs || []).length >= 1);
  } finally {
    server.close();
  }
});

test('F04 resume from checkpoints via workspace route', async () => {
  const runtime = createRuntime({ syncExecute: true, forceResumePlugin: true });
  const plan = { dag: runtime.pipeline.template };
  // create partial checkpoints
  const wfJob = await runtime.store.insertWorkflowJob({ runtime_job_id: 'job-f04', status: 'running', current_node: null });
  for (const node of plan.dag.nodes.slice(0, 5)) {
    await runtime.checkpointManager.appendCheckpoint({
      workflow_job_id: wfJob.id,
      node_id: node.id,
      checkpoint_key: node.checkpointKey,
      payload: { nodeId: node.id, status: 'completed', stub: true },
      attempt: 1,
    });
  }
  const resumed = await runtime.pipeline.executor.resumeFromLastCheckpoint({ runtimeJobId: 'job-f04', plan });
  const checkpoints = runtime.store._tables.workflowCheckpoints.filter((c) => c.workflow_job_id === resumed.workflowJobId);
  assert.ok(checkpoints.length >= plan.dag.nodes.length);
});
