import { createHash } from 'crypto';

export const WORKFLOW_CHECKPOINT_VERSION = 'aivos_workflow_checkpoint_v1';

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

export function computeCheckpointChecksum({ workflowJobId, nodeId, checkpointKey, payload, attempt }) {
  const input = [
    WORKFLOW_CHECKPOINT_VERSION,
    workflowJobId || '',
    nodeId || '',
    checkpointKey || '',
    String(attempt ?? 1),
    stableStringify(payload || {}),
  ].join('::');
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Checkpoint manager — pattern copied from registrationEvolution/workflowCheckpointRuntime.js
 * without importing that module.
 */
export function createCheckpointManager({ store }) {
  return {
    async appendCheckpoint({ workflowJobId, nodeId, checkpointKey, payload, attempt = 1 }) {
      const checksum = computeCheckpointChecksum({
        workflowJobId,
        nodeId,
        checkpointKey,
        payload,
        attempt,
      });
      return store.appendWorkflowCheckpoint({
        workflow_job_id: workflowJobId,
        node_id: nodeId,
        checkpoint_key: checkpointKey,
        payload,
        checksum,
        attempt,
      });
    },
    async listCheckpoints(workflowJobId, nodeId) {
      return store.listWorkflowCheckpoints(workflowJobId, nodeId);
    },
    async latestCheckpoint(workflowJobId, nodeId) {
      const rows = await store.listWorkflowCheckpoints(workflowJobId, nodeId);
      return rows.length ? rows[rows.length - 1] : null;
    },
  };
}
