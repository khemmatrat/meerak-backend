export function createWorkflowCompiler({ planner, pipeline } = {}) {
  return {
    async compile(manifest, { intent = {}, jobId = null, pluginId = null } = {}) {
      const template = pipeline?.template;
      const pipelineNodes = (template?.nodes || []).map((n) => ({
        id: n.id,
        checkpointKey: n.checkpointKey,
        maxRetries: n.maxRetries,
        status: 'pending',
      }));

      let runtimePlan = null;
      const resolvedPlugin = pluginId || manifest.requiredMarketplacePackages?.[0] || 'resume-ai';
      if (planner?.buildPlan) {
        try {
          runtimePlan = await planner.buildPlan({
            pluginId: resolvedPlugin,
            intent:   { ...intent, workflowId: manifest.id },
            jobId:    jobId || `wf-${manifest.id}`,
          });
        } catch (_) {
          runtimePlan = null;
        }
      }

      const dag = runtimePlan?.dag || {
        nodes: pipelineNodes,
        edges: pipelineNodes.slice(1).map((n, i) => ({ from: pipelineNodes[i].id, to: n.id })),
      };

      return {
        workflowId:       manifest.id,
        workflowVersion:  manifest.version,
        pipelineTemplate: manifest.pipelineTemplate,
        pluginId:         resolvedPlugin,
        dag,
        skillBindings:    runtimePlan?.skillBindings || [{ skillId: manifest.skill, nodes: dag.nodes.map((n) => n.id) }],
        capabilities:     manifest.requiredCapabilities,
        outputs:          manifest.outputs,
        compiledAt:       new Date().toISOString(),
      };
    },
  };
}
