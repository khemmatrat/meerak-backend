import { CANONICAL_DAG_NODES, RUNTIME_JOB_STATUS } from './types.js';

export function createExecutionGraph({ store, checkpointManager, events, observability }) {
  const nodeDefs = new Map(CANONICAL_DAG_NODES.map((n) => [n.id, n]));

  async function runNode({ workflowJobId, jobId, nodeId, traceId, attempt = 1 }) {
    const def = nodeDefs.get(nodeId);
    if (!def) throw new Error(`execution_graph_unknown_node:${nodeId}`);

    const startedAt = new Date().toISOString();
    await observability.recordNodeStart({ jobId, nodeId, startedAt });
    if (events) {
      await events.emit({
        name: 'aivos.pipeline.stage.started',
        correlationId: jobId,
        traceId,
        source: { agentId: 'execution-graph', skillId: null, runtimeJobId: jobId },
        payload: { nodeId, attempt },
      });
    }

    const payload = {
      nodeId,
      status: 'completed',
      stub: true,
      completedAt: new Date().toISOString(),
    };
    const checkpoint = await checkpointManager.appendCheckpoint({
      workflowJobId,
      nodeId,
      checkpointKey: def.checkpointKey,
      payload,
      attempt,
    });

    await observability.recordNodeComplete({
      jobId,
      nodeId,
      completedAt: payload.completedAt,
      checkpointId: checkpoint.id,
    });

    if (events) {
      await events.emit({
        name: 'aivos.pipeline.stage.completed',
        correlationId: jobId,
        traceId,
        source: { agentId: 'execution-graph', skillId: null, runtimeJobId: jobId },
        payload: { nodeId, checksum: checkpoint.checksum },
      });
    }

    return { nodeId, checkpoint, payload };
  }

  return {
    getCanonicalNodes() {
      return CANONICAL_DAG_NODES.slice();
    },
    async executePlan({ jobId, plan, traceId }) {
      const wfJob = await store.insertWorkflowJob({
        runtime_job_id: jobId,
        status: 'running',
        current_node: null,
      });

    const nodes = plan?.dag?.nodes || CANONICAL_DAG_NODES;
      const results = [];
      for (const node of nodes) {
        await store.updateWorkflowJob(wfJob.id, { current_node: node.id });
        const result = await runNode({
          workflowJobId: wfJob.id,
          jobId,
          nodeId: node.id,
          traceId,
        });
        results.push(result);
      }

      await store.updateWorkflowJob(wfJob.id, { status: 'completed', current_node: 'publish' });
      return { workflowJobId: wfJob.id, results, status: RUNTIME_JOB_STATUS.PREVIEW };
    },
  };
}
