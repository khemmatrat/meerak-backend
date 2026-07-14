export function createSkillGraph({ registry }) {
  return {
    async resolve(skillIds = []) {
      const resolved = [];
      const errors = [];
      for (const skillId of skillIds) {
        const skill = await registry.getSkill(skillId);
        if (!skill || skill.enabled === false) {
          errors.push({ skillId, reason: 'skill_not_found' });
          continue;
        }
        resolved.push({
          skillId: skill.skill_id,
          version: skill.version,
          agentId: skill.agent_id,
          stageAffinity: skill.stage_affinity || [],
          promptId: skill.prompt_id,
          promptVersion: skill.prompt_version || 1,
          taskTypes: skill.task_types || [],
          capabilities: skill.capabilities || [],
        });
      }
      if (errors.length) {
        const err = new Error('skill_graph_resolution_failed');
        err.code = 'SKILL_GRAPH_ERROR';
        err.details = errors;
        throw err;
      }
      return resolved;
    },
    bindToNodes(resolvedSkills, dagNodes) {
      const bindings = {};
      for (const node of dagNodes) {
        const match = resolvedSkills.find((s) => (s.stageAffinity || []).includes(node.id));
        if (match) bindings[node.id] = match.skillId;
      }
      return bindings;
    },
  };
}
