import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime } from '../lib/aivos/runtime/index.js';

process.env.AIVOS_RUNTIME_ENABLED = '1';
process.env.AIVOS_KERNEL_ENABLED = '1';
process.env.AIVOS_RESUME_PLUGIN_ENABLED = '1';

function makeRuntime() {
  return createRuntime({ syncExecute: true, forceResumePlugin: true });
}

function checkpointsFor(store, workflowJobId, nodeId) {
  return store._tables.workflowCheckpoints.filter(
    (c) => c.workflow_job_id === workflowJobId && (!nodeId || c.node_id === nodeId),
  );
}

test('M01 media nodes produce artifacts in checkpoints', async () => {
  const runtime = makeRuntime();
  const { executor, template } = runtime.pipeline;
  const plan = { dag: template };
  const res = await executor.executePlan({ runtimeJobId: 'job-m01', plan, traceId: 'trace-m01' });
  const cps = checkpointsFor(runtime.store, res.workflowJobId, 'image');
  assert.ok(cps.length >= 1);
  const payload = cps[cps.length - 1].payload;
  assert.ok(payload.artifact?.uri?.startsWith('image://'));
});

test('M02 resume keeps prior media artifacts', async () => {
  const runtime = makeRuntime();
  const { executor, template } = runtime.pipeline;
  const plan = { dag: template };
  const first = await executor.executePlan({ runtimeJobId: 'job-m02', plan, traceId: 'trace-m02' });
  const seeded = checkpointsFor(runtime.store, first.workflowJobId, 'image');
  assert.ok(seeded.length >= 1);
  const resumed = await executor.resumeFromLastCheckpoint({ runtimeJobId: 'job-m02', plan, traceId: 'trace-m02' });
  const cps = checkpointsFor(runtime.store, resumed.workflowJobId, 'image');
  assert.ok(cps.length >= seeded.length);
});
