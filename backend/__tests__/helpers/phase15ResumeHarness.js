import { CANONICAL_DAG_NODES } from '../../lib/aivos/runtime/types.js';
import { computeCheckpointChecksum } from '../../lib/aivos/runtime/checkpointManager.js';

/**
 * Validation-only harness: simulates interrupted graph execution and resume
 * using public Runtime store + checkpointManager APIs (no Kernel).
 */
export async function runPartialGraph({ store, checkpointManager, jobId, plan, traceId, stopAfterNodeId }) {
  const wfJob = await store.insertWorkflowJob({
    runtime_job_id: jobId,
    status: 'running',
    current_node: null,
  });
  const nodes = plan?.dag?.nodes || [];
  const stopIdx = nodes.findIndex((n) => n.id === stopAfterNodeId);
  if (stopIdx < 0) throw new Error('resume_harness: stop node not found');

  const completed = [];
  for (let i = 0; i <= stopIdx; i += 1) {
    const node = nodes[i];
    const def = CANONICAL_DAG_NODES.find((d) => d.id === node.id);
    await store.updateWorkflowJob(wfJob.id, { current_node: node.id });
    const payload = { nodeId: node.id, status: 'completed', stub: true };
    const checkpoint = await checkpointManager.appendCheckpoint({
      workflowJobId: wfJob.id,
      nodeId: node.id,
      checkpointKey: def.checkpointKey,
      payload,
      attempt: 1,
    });
    completed.push({ nodeId: node.id, checkpoint });
  }
  await store.updateWorkflowJob(wfJob.id, { status: 'interrupted', current_node: stopAfterNodeId });
  return { workflowJobId: wfJob.id, completed, stopAfterNodeId, traceId, nodes };
}

export async function resumeGraphFromCheckpoint({ store, checkpointManager, session }) {
  const { workflowJobId, nodes, stopAfterNodeId, traceId, jobId } = session;
  const stopIdx = nodes.findIndex((n) => n.id === stopAfterNodeId);
  const resumed = [];

  for (let i = stopIdx + 1; i < nodes.length; i += 1) {
    const node = nodes[i];
    const def = CANONICAL_DAG_NODES.find((d) => d.id === node.id);
    const prev = await checkpointManager.latestCheckpoint(workflowJobId, nodes[i - 1]?.id);
    if (i === stopIdx + 1 && !prev) {
      throw new Error('resume_harness: missing prior checkpoint');
    }
    await store.updateWorkflowJob(workflowJobId, { current_node: node.id, status: 'running' });
    const payload = { nodeId: node.id, status: 'completed', stub: true, resumed: true };
    const checkpoint = await checkpointManager.appendCheckpoint({
      workflowJobId,
      nodeId: node.id,
      checkpointKey: def.checkpointKey,
      payload,
      attempt: 1,
    });
    const expected = computeCheckpointChecksum({
      workflowJobId,
      nodeId: node.id,
      checkpointKey: def.checkpointKey,
      payload,
      attempt: 1,
    });
    if (checkpoint.checksum !== expected) {
      throw new Error('resume_harness: checksum mismatch');
    }
    resumed.push({ nodeId: node.id, checkpoint, traceId, jobId });
  }

  await store.updateWorkflowJob(workflowJobId, { status: 'completed', current_node: 'publish' });
  return { workflowJobId, resumed, totalNodes: nodes.length, completedBefore: stopIdx + 1 };
}
