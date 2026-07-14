import { createSkillCapability } from './skillCapability.js';

export function createSkillLoader({ store, registry, capability } = {}) {
  const loaded = new Set();
  const cap = capability || createSkillCapability();

  async function syncRuntimeSkill(manifest) {
    const runtimeCaps = cap.resolveRuntimeCapabilities(manifest.capabilities);
    const skillRow = {
      skill_id:       manifest.id,
      version:        parseInt(manifest.version, 10) || 1,
      agent_id:       `${manifest.id}-agent`,
      capabilities:   runtimeCaps,
      stage_affinity: ['extract', 'analyze', 'generate', 'publish'],
      task_types:     manifest.requiredPolicies.length ? manifest.requiredPolicies : ['writing'],
      enabled:        true,
      manifest,
    };
    if (registry?.registerSkill) {
      await registry.registerSkill(skillRow);
    } else if (store?.kind === 'memory') {
      store._tables.skillRegistry.set(manifest.id, skillRow);
    }
    return skillRow;
  }

  return {
    isLoaded(skillId) {
      return loaded.has(skillId);
    },

    async loadSkill(skillRecord) {
      const manifest = skillRecord?.manifest;
      if (!manifest?.id) {
        const err = new Error('skill_manifest_required');
        err.code = 'SKILL_MANIFEST_REQUIRED';
        throw err;
      }
      const row = await syncRuntimeSkill(manifest);
      loaded.add(manifest.id);
      return { id: manifest.id, loaded: true, runtimeSkill: row };
    },

    async unloadSkill(skillId) {
      if (store?.kind === 'memory') {
        store._tables.skillRegistry.delete(skillId);
      }
      loaded.delete(skillId);
      return { id: skillId, loaded: false };
    },

    async reloadSkill(skillRecord) {
      const id = skillRecord?.manifest?.id || skillRecord?.id;
      if (id) await this.unloadSkill(id);
      return this.loadSkill(skillRecord);
    },

    listLoaded() {
      return [...loaded];
    },
  };
}
