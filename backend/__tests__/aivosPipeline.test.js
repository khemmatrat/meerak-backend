import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime } from '../lib/aivos/runtime/index.js';

process.env.AIVOS_KERNEL_ENABLED = '1';

function makeRuntime() {
  return createRuntime({ syncExecute: true });
}

function countCheckpoints(store, workflowJobId) {
  return store._tables?.workflowCheckpoints?.filter((c) => c.workflow_job_id === workflowJobId)?.length || 0;
}

test('P01 pipeline template has 15 nodes and executes with checkpoints', async () => {
  const runtime = makeRuntime();
  const { executor, template } = runtime.pipeline;
  const plan = { dag: template };
  const res = await executor.executePlan({ runtimeJobId: 'job-p01', plan, traceId: 'trace-p01' });
  const checkpoints = countCheckpoints(runtime.store, res.workflowJobId);
  assert.equal(template.nodes.length, 15);
  assert.equal(checkpoints, 15);
});

test('P02 resume continues after partial checkpoints', async () => {
  const runtime = makeRuntime();
  const { executor, template } = runtime.pipeline;
  const plan = { dag: template };
  // create partial checkpoints for first 3 nodes
  const wfJob = await runtime.store.insertWorkflowJob({ runtime_job_id: 'job-p02', status: 'running', current_node: null });
  const firstThree = template.nodes.slice(0, 3);
  for (const node of firstThree) {
    await runtime.checkpointManager.appendCheckpoint({
      workflow_job_id: wfJob.id,
      node_id: node.id,
      checkpoint_key: node.checkpointKey,
      payload: { nodeId: node.id, status: 'completed', stub: true },
      attempt: 1,
    });
  }
  const resumed = await executor.resumeFromLastCheckpoint({ runtimeJobId: 'job-p02', plan, traceId: 'trace-p02' });
  const checkpoints = countCheckpoints(runtime.store, resumed.workflowJobId);
  assert.ok(checkpoints >= template.nodes.length); // original + resumed
});

test('P03 retry re-executes specific node with higher attempt', async () => {
  const runtime = makeRuntime();
  const { executor, template } = runtime.pipeline;
  const plan = { dag: template };
  const res1 = await executor.executePlan({ runtimeJobId: 'job-p03', plan });
  const wfId = res1.workflowJobId;
  const before = runtime.store._tables.workflowCheckpoints.filter((c) => c.workflow_job_id === wfId && c.node_id === 'voice');
  await executor.executePlan({ runtimeJobId: 'job-p03', plan, retryNodes: ['voice'] });
  const after = runtime.store._tables.workflowCheckpoints.filter((c) => c.workflow_job_id === wfId && c.node_id === 'voice');
  assert.ok(after.length > before.length);
  assert.ok(after[after.length - 1].attempt >= 2);
});

test('P04 timeline records start/complete for nodes', async () => {
  const runtime = makeRuntime();
  const { executor, template } = runtime.pipeline;
  const plan = { dag: template };
  await executor.executePlan({ runtimeJobId: 'job-p04', plan });
  const timeline = runtime.store._tables.timeline.filter((t) => t.job_id === 'job-p04');
  assert.ok(timeline.length >= template.nodes.length * 2);
});

test('P05 resume after worker kill completes remaining nodes', async () => {
  const runtime = makeRuntime();
  const { executor, template } = runtime.pipeline;
  const plan = { dag: template };
  const wfJob = await runtime.store.insertWorkflowJob({ runtime_job_id: 'job-p05', status: 'running', current_node: null });
  // checkpoint first 10 nodes
  for (const node of template.nodes.slice(0, 10)) {
    await runtime.checkpointManager.appendCheckpoint({
      workflow_job_id: wfJob.id,
      node_id: node.id,
      checkpoint_key: node.checkpointKey,
      payload: { nodeId: node.id, status: 'completed', stub: true },
      attempt: 1,
    });
  }
  const resumed = await executor.resumeFromLastCheckpoint({ runtimeJobId: 'job-p05', plan });
  const checkpoints = runtime.store._tables.workflowCheckpoints.filter((c) => c.workflow_job_id === resumed.workflowJobId);
  assert.ok(checkpoints.length >= template.nodes.length);
});

test('P06 template edges form linear chain', () => {
  const runtime = makeRuntime();
  const { template } = runtime.pipeline;
  assert.equal(template.edges.length, template.nodes.length - 1);
});

test('P07 pipeline executor emits events for stages', async () => {
  const runtime = makeRuntime();
  const { executor, template } = runtime.pipeline;
  const plan = { dag: template };
  await executor.executePlan({ runtimeJobId: 'job-p07', plan, traceId: 'trace-p07' });
  const events = runtime.store._tables.events.filter((e) => e.correlation_id === 'job-p07');
  const stageEvents = events.filter((e) => e.name?.startsWith('aivos.pipeline.stage.'));
  assert.ok(stageEvents.length >= template.nodes.length * 2);
});
