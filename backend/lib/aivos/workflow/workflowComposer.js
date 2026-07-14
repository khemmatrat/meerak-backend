export function createWorkflowComposer({ pipeline } = {}) {
  function linearEdges(nodes) {
    const edges = [];
    for (let i = 1; i < nodes.length; i += 1) {
      edges.push({ from: nodes[i - 1].id, to: nodes[i].id, type: 'sequential' });
    }
    return edges;
  }

  return {
    compose({ templates = [], mode = 'sequential', condition = null } = {}) {
      if (!templates.length) throw new Error('compose_requires_templates');

      const nodes = [];
      templates.forEach((tpl, index) => {
        nodes.push({
          id:           `wf-node-${index + 1}-${tpl.id}`,
          workflowId:   tpl.id,
          skill:        tpl.skill,
          capabilities: tpl.requiredCapabilities || [],
          mode:         index === 0 ? 'start' : mode,
          parallelGroup: mode === 'parallel' ? 'pg-1' : null,
          condition:    mode === 'conditional' ? condition : null,
        });
      });

      if (pipeline?.template?.nodes) {
        const tail = pipeline.template.nodes.slice(-2).map((n, offset) => ({
          id:           `pipeline-${n.id}`,
          workflowId:   null,
          pipelineNode: n.id,
          mode:         'pipeline',
          parallelGroup: null,
        }));
        nodes.push(...tail);
      }

      const edges = mode === 'parallel'
        ? templates.slice(1).map((tpl, i) => ({ from: nodes[0].id, to: nodes[i + 1].id, type: 'parallel' }))
        : linearEdges(nodes);

      return {
        id:      `composed-${Date.now()}`,
        mode,
        nodes,
        edges,
        merge:   mode === 'merge' ? { strategy: 'concat_outputs' } : null,
        templates: templates.map((t) => t.id),
      };
    },
  };
}
