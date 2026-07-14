function ensureAgentTables(store) {
  if (store?.kind !== 'memory') return null;
  if (!store._tables.orchestratorAgents) store._tables.orchestratorAgents = new Map();
  return store._tables.orchestratorAgents;
}

export function createAgentRegistry({ store, skills } = {}) {
  const table = () => ensureAgentTables(store);

  function syncFromSkills() {
    const agents = table();
    if (!agents || !skills?.registry) return [];
    for (const skill of skills.registry.listSkills({ enabled: true })) {
      agents.set(skill.id, {
        id:           skill.id,
        skillId:      skill.id,
        name:         skill.manifest?.name || skill.id,
        capabilities: skill.manifest?.capabilities || [],
        enabled:      true,
        health:       'healthy',
        source:       'skill',
      });
    }
    return [...agents.values()];
  }

  return {
    registerAgent(agent) {
      const agents = table();
      if (!agents) throw new Error('agent_registry_requires_memory_store');
      const row = {
        id:           agent.id || agent.skillId,
        skillId:      agent.skillId || agent.id,
        name:         agent.name || agent.id,
        capabilities: agent.capabilities || [],
        enabled:      agent.enabled !== false,
        health:       agent.health || 'healthy',
        source:       agent.source || 'manual',
      };
      agents.set(row.id, row);
      return { ...row };
    },

    removeAgent(agentId) {
      const agents = table();
      if (!agents?.has(agentId)) throw new Error('agent_not_found');
      agents.delete(agentId);
      return { id: agentId, removed: true };
    },

    listAgents({ enabled } = {}) {
      syncFromSkills();
      const agents = table();
      if (!agents) return [];
      return [...agents.values()].filter((a) => enabled == null || a.enabled === enabled);
    },

    findAgent(agentId) {
      syncFromSkills();
      return table()?.get(agentId) || null;
    },

    setHealth(agentId, health) {
      const agents = table();
      const row = agents?.get(agentId);
      if (!row) return null;
      row.health = health;
      agents.set(agentId, row);
      return { ...row };
    },
  };
}
