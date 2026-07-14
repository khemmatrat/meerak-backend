import { CANONICAL_DAG_NODES } from '../runtime/types.js';
import { computeCheckpointChecksum } from '../runtime/checkpointManager.js';

export function createPipelineExecutor({ store, checkpointManager, events, observability, mediaEngine, renderEngine, publishEngine }) {
  const defs = new Map(CANONICAL_DAG_NODES.map((n) => [n.id, n]));

  function findWorkflowJobByRuntimeId(runtimeJobId) {
    const table = store._tables?.workflowJobs;
    if (table && table.values) {
      const all = Array.from(table.values());
      const match = all.filter((w) => w.runtime_job_id === runtimeJobId);
      return match[match.length - 1] || null;
    }
    return null;
  }

  async function ensureWorkflowJob(runtimeJobId) {
    const existing = findWorkflowJobByRuntimeId(runtimeJobId);
    if (existing) return existing;
    return store.insertWorkflowJob({
      runtime_job_id: runtimeJobId,
      status: 'running',
      current_node: null,
    });
  }

  async function runNode({ workflowJobId, jobId, nodeId, traceId, attempt = 1 }) {
    const def = defs.get(nodeId);
    if (!def) throw new Error(`execution_graph_unknown_node:${nodeId}`);

    const startedAt = new Date().toISOString();
    await observability.recordNodeStart({ jobId, nodeId, startedAt });
    if (events) {
      await events.emit({
        name: 'aivos.pipeline.stage.started',
        correlationId: jobId,
        traceId,
        source: { agentId: 'pipeline', runtimeJobId: jobId },
        payload: { nodeId, attempt },
      });
    }

    let mediaPayload = null;
    if (nodeId === 'publish' && publishEngine && publishEngine.enabled !== false) {
      mediaPayload = await publishEngine.handle(nodeId, { jobId, traceId });
    } else if (nodeId === 'render' && renderEngine && renderEngine.enabled !== false) {
      mediaPayload = await renderEngine.handle(nodeId, { jobId, traceId });
    } else if (mediaEngine) {
      mediaPayload = await mediaEngine.handle(nodeId, { jobId, traceId });
    }
    const payload = {
      nodeId,
      status: 'completed',
      stub: !mediaPayload,
      attempt,
      completedAt: new Date().toISOString(),
      ...(mediaPayload || {}),
    };
    const checksum = computeCheckpointChecksum({
      workflowJobId,
      nodeId,
      checkpointKey: def.checkpointKey,
      payload,
      attempt,
    });
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
        source: { agentId: 'pipeline', runtimeJobId: jobId },
        payload: { nodeId, checksum },
      });
    }

    return { nodeId, checkpoint };
  }

  async function listLatestCheckpoints(workflowJobId) {
    const rows = await store.listWorkflowCheckpoints(workflowJobId, null);
    // last entry per node_id
    const latest = new Map();
    for (const row of rows) {
      latest.set(row.node_id, row);
    }
    return latest;
  }

  async function executePlan({ runtimeJobId, plan, traceId, retryNodes = [] }) {
    const wfJob = await ensureWorkflowJob(runtimeJobId);
    const nodes = plan?.dag?.nodes || [];
    const latest = await listLatestCheckpoints(wfJob.id);
    const results = [];

    for (const node of nodes) {
      const hasCheckpoint = latest.has(node.id);
      const shouldRetry = retryNodes.includes(node.id);
      if (hasCheckpoint && !shouldRetry) {
        continue;
      }
      await store.updateWorkflowJob(wfJob.id, { current_node: node.id });
      const attempt = shouldRetry && hasCheckpoint ? (latest.get(node.id)?.attempt || 1) + 1 : 1;
      const res = await runNode({ workflowJobId: wfJob.id, jobId: runtimeJobId, nodeId: node.id, traceId, attempt });
      results.push(res);
    }

    await store.updateWorkflowJob(wfJob.id, { status: 'completed', current_node: nodes[nodes.length - 1]?.id || null });
    return { workflowJobId: wfJob.id, results };
  }

  async function resumeFromLastCheckpoint({ runtimeJobId, plan, traceId }) {
    // find workflow job by runtimeJobId? use newest
    let wfJob = findWorkflowJobByRuntimeId(runtimeJobId) || (await ensureWorkflowJob(runtimeJobId));
    const nodes = plan?.dag?.nodes || [];
    const latest = await listLatestCheckpoints(wfJob.id);
    let startIdx = 0;
    if (latest.size > 0) {
      const completedIds = nodes.filter((n) => latest.has(n.id)).map((n) => n.id);
      if (completedIds.length) {
        const lastId = completedIds[completedIds.length - 1];
        startIdx = nodes.findIndex((n) => n.id === lastId) + 1;
      }
    }
    const results = [];
    for (let i = startIdx; i < nodes.length; i += 1) {
      const node = nodes[i];
      await store.updateWorkflowJob(wfJob.id, { current_node: node.id });
      const res = await runNode({ workflowJobId: wfJob.id, jobId: runtimeJobId, nodeId: node.id, traceId, attempt: 1 });
      results.push(res);
    }
    await store.updateWorkflowJob(wfJob.id, { status: 'completed', current_node: nodes[nodes.length - 1]?.id || null });
    return { workflowJobId: wfJob.id, resumed: results, startIdx };
  }

  return {
    executePlan,
    resumeFromLastCheckpoint,
  };
}

export default createPipelineExecutor;
