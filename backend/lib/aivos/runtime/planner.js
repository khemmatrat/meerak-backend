import { CANONICAL_DAG_NODES } from './types.js';

export function createPlanner({ capabilityDiscovery, skillGraph }) {
  return {
    async buildPlan({ pluginId, intent, jobId }) {
      const discovery = await capabilityDiscovery.discover({
        pluginId,
        intent: { ...intent, _jobId: jobId },
      });
      const skillIds = discovery.plugin.required_skills?.length
        ? discovery.plugin.required_skills
        : discovery.matchedSkills;
      const resolvedSkills = await skillGraph.resolve(skillIds);
      const nodes = CANONICAL_DAG_NODES.map((node) => ({
        id: node.id,
        checkpointKey: node.checkpointKey,
        maxRetries: node.maxRetries,
        status: 'pending',
      }));
      const skillBindings = skillGraph.bindToNodes(resolvedSkills, nodes);
      return {
        workflowTemplateId: 'canonical-video-v1',
        dag: { nodes, edges: buildLinearEdges(nodes) },
        skillBindings,
        resolvedSkills,
        capabilities: discovery.capabilities,
      };
    },
  };
}

function buildLinearEdges(nodes) {
  const edges = [];
  for (let i = 1; i < nodes.length; i += 1) {
    edges.push({ from: nodes[i - 1].id, to: nodes[i].id });
  }
  return edges;
}
