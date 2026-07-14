import { DEFAULT_SKILL_CAPABILITIES, PIPELINE_TAIL_NODES } from './config.js';

export function createAgentPlanner({ router, pipeline } = {}) {
  function buildDependencyEdges(nodes) {
    const edges = [];
    for (let i = 1; i < nodes.length; i += 1) {
      edges.push({ from: nodes[i - 1].id, to: nodes[i].id });
    }
    return edges;
  }

  return {
    buildPlan({ capabilities, intent = {} } = {}) {
      const caps = capabilities?.length ? capabilities : DEFAULT_SKILL_CAPABILITIES;
      const routes = router.routeAll(caps);
      const gaps = routes.filter((r) => !r.ok);
      if (gaps.length) {
        const err = new Error('orchestration_capability_gap');
        err.code = 'ORCHESTRATION_CAPABILITY_GAP';
        err.details = gaps;
        throw err;
      }

      const skillNodes = routes.map((route, index) => ({
        id:            `step-${index + 1}-${route.capability}`,
        capability:    route.capability,
        agentId:       route.agentId,
        skillId:       route.skillId,
        source:        route.source,
        parallelGroup: null,
        dependsOn:     index > 0 ? [`step-${index}-${routes[index - 1].capability}`] : [],
        type:          'skill',
      }));

      const template = pipeline?.template;
      const tailStart = skillNodes.length;
      const pipelineNodes = PIPELINE_TAIL_NODES.map((nodeId, offset) => ({
        id:            `step-${tailStart + offset + 1}-${nodeId}`,
        capability:    nodeId,
        agentId:       `pipeline:${nodeId}`,
        skillId:       null,
        source:        'pipeline',
        pipelineNode:  nodeId,
        parallelGroup: null,
        dependsOn:     offset === 0
          ? [skillNodes[skillNodes.length - 1]?.id].filter(Boolean)
          : [`step-${tailStart + offset}-${PIPELINE_TAIL_NODES[offset - 1]}`],
        type:          'pipeline',
        templateId:    template?.id || 'videoPipelineV1',
      }));

      const nodes = [...skillNodes, ...pipelineNodes];
      return {
        id:           intent.planId || `plan-${Date.now()}`,
        capabilities: caps,
        nodes,
        edges:        buildDependencyEdges(nodes),
        parallelGroups: [],
        dagTemplate:  template?.id || null,
      };
    },

    detectDependencies(plan) {
      return (plan?.edges || []).map((e) => ({ from: e.from, to: e.to }));
    },
  };
}
