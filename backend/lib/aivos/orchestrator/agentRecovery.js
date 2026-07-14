export function createAgentRecovery({ checkpointManager, store } = {}) {
  function ensureRuns(storeRef) {
    if (storeRef?.kind !== 'memory') return null;
    if (!storeRef._tables.orchestratorRuns) storeRef._tables.orchestratorRuns = new Map();
    return storeRef._tables.orchestratorRuns;
  }

  return {
    async checkpoint(runId, { nodeId, payload, attempt = 1 } = {}) {
      if (!checkpointManager?.appendCheckpoint) {
        return { runId, nodeId, stub: true };
      }
      return checkpointManager.appendCheckpoint({
        workflowJobId: runId,
        nodeId:          nodeId || 'orchestrator',
        checkpointKey:   'orchestrator_state',
        payload,
        attempt,
      });
    },

    async resume(runId, { runs } = {}) {
      const table = ensureRuns(store);
      const run = table?.get(runId) || runs?.get?.(runId);
      if (!run) {
        const err = new Error('orchestration_run_not_found');
        err.code = 'ORCHESTRATION_RUN_NOT_FOUND';
        throw err;
      }
      const checkpoints = checkpointManager
        ? await checkpointManager.listCheckpoints(runId, 'orchestrator')
        : [];
      const latest = checkpoints.length ? checkpoints[checkpoints.length - 1] : null;
      if (latest?.payload?.memory) {
        run.memory.restore(latest.payload.memory);
      }
      run.status = 'resumed';
      run.resumeFromNodeId = latest?.node_id || run.lastNodeId || null;
      return { runId, status: 'resumed', resumeFromNodeId: run.resumeFromNodeId, checkpoint: latest };
    },

    async rollback(runId, { runs } = {}) {
      const table = ensureRuns(store);
      const run = table?.get(runId) || runs?.get?.(runId);
      if (!run) throw new Error('orchestration_run_not_found');
      const checkpoints = checkpointManager
        ? await checkpointManager.listCheckpoints(runId, 'orchestrator')
        : [];
      if (checkpoints.length < 2) throw new Error('orchestration_no_rollback_target');
      const target = checkpoints[checkpoints.length - 2];
      if (target?.payload?.memory) run.memory.restore(target.payload.memory);
      run.status = 'rolled_back';
      return { runId, status: 'rolled_back', checkpoint: target };
    },
  };
}
