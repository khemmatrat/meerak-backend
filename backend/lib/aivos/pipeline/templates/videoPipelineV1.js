import { CANONICAL_DAG_NODES } from '../../runtime/types.js';

/**
 * Generic video pipeline template (15 canonical nodes).
 * No product-specific logic; Runtime binds skills per plan.
 */
export function getVideoPipelineTemplate() {
  const nodes = CANONICAL_DAG_NODES.map((n) => ({
    id: n.id,
    checkpointKey: n.checkpointKey,
    maxRetries: n.maxRetries,
  }));
  const edges = [];
  for (let i = 1; i < nodes.length; i += 1) {
    edges.push({ from: nodes[i - 1].id, to: nodes[i].id });
  }
  return { id: 'videoPipelineV1', nodes, edges };
}

export default getVideoPipelineTemplate;
