export function createRuntimeRegistry({ store }) {
  return {
    async getPlugin(pluginId) {
      return store.getPlugin(pluginId);
    },
    async listPlugins() {
      return store.listPlugins({ enabled: true });
    },
    async getSkill(skillId) {
      return store.getSkill(skillId);
    },
    async listSkills() {
      return store.listSkills({ enabled: true });
    },
    async registerSkill(skill) {
      if (store.kind === 'memory') {
        store._tables.skillRegistry.set(skill.skill_id, { ...skill, enabled: skill.enabled !== false });
        return skill;
      }
      throw new Error('runtime_registry_error: registerSkill_requires_admin_path');
    },
  };
}
