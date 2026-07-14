export function createAgentCoordinator({ supervisor, conflictResolver, timeline, metrics, recovery } = {}) {
  async function executeNode(node, ctx) {
    const memory = ctx.memory;
    const conversation = ctx.conversation;
    const started = Date.now();
    const executeFn = async () => {
      if (node.type === 'pipeline') {
        return {
          agentId:    node.agentId,
          skillId:    null,
          capability: node.capability,
          output:     { pipelineNode: node.pipelineNode, status: 'completed' },
          confidence: 1,
          priority:   1,
        };
      }
      const prior = memory.getContext();
      const output = {
        agentId:    node.agentId,
        skillId:    node.skillId,
        capability: node.capability,
        output:     { generated: true, capability: node.capability, context: prior },
        confidence: 0.85 + Math.random() * 0.1,
        priority:   0,
      };
      conversation.post({
        from:    node.agentId,
        to:      'orchestrator',
        content: `Completed ${node.capability}`,
        meta:    { nodeId: node.id },
      });
      return output;
    };

    const monitored = await supervisor.monitor(node.agentId, executeFn, {
      runId: ctx.runId,
      timeoutMs: ctx.timeoutMs || 5000,
      maxRetries: ctx.maxRetries || 1,
    });

    const latencyMs = Date.now() - started;
    const result = monitored.result;
    memory.setOutput(node.id, result);
    memory.mergeContext({ [node.capability]: result.output });
    if (result.output?.artifact) memory.addArtifact(result.output.artifact);

    timeline.recordStep(ctx.runId, {
      nodeId:     node.id,
      agentId:    node.agentId,
      capability: node.capability,
      latencyMs,
      status:     'completed',
    });

    await recovery.checkpoint(ctx.runId, {
      nodeId:  node.id,
      payload: { memory: memory.snapshot(), lastNodeId: node.id },
    });

    ctx.lastNodeId = node.id;
    return { ...result, latencyMs };
  }

  return {
    async executePlan(plan, ctx = {}) {
      const results = [];
      const outputsByKey = {};

      const groups = [];
      let currentGroup = [];
      for (const node of plan.nodes) {
        if (node.parallelGroup != null) {
          if (currentGroup.length && currentGroup[0].parallelGroup !== node.parallelGroup) {
            groups.push(currentGroup);
            currentGroup = [];
          }
          currentGroup.push(node);
        } else {
          if (currentGroup.length) {
            groups.push(currentGroup);
            currentGroup = [];
          }
          groups.push([node]);
        }
      }
      if (currentGroup.length) groups.push(currentGroup);

      for (const group of groups) {
        const groupResults = group.length > 1
          ? await Promise.all(group.map((node) => executeNode(node, ctx)))
          : [await executeNode(group[0], ctx)];
        for (const r of groupResults) {
          results.push(r);
          const key = r.capability;
          if (!outputsByKey[key]) outputsByKey[key] = [];
          outputsByKey[key].push(r);
        }
      }

      const merged = conflictResolver.mergeOutputs(outputsByKey);
      ctx.memory.mergeContext({ mergedOutputs: merged });
      return { results, merged };
    },

    mergeOutputs(results = []) {
      const outputsByKey = {};
      for (const r of results) {
        const key = r.capability || r.agentId;
        if (!outputsByKey[key]) outputsByKey[key] = [];
        outputsByKey[key].push(r);
      }
      return conflictResolver.mergeOutputs(outputsByKey);
    },
  };
}
