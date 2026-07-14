function ensureVerticalSkills(store) {
  if (store?.kind !== 'memory') return null;
  if (!store._tables.verticalSkills) store._tables.verticalSkills = new Map();
  return store._tables.verticalSkills;
}

function now() {
  return new Date().toISOString();
}

export function createSkillRegistry({ store } = {}) {
  const map = () => ensureVerticalSkills(store);

  return {
    registerSkill(manifest, meta = {}) {
      const table = map();
      if (!table) throw new Error('skill_registry_requires_memory_store');
      const row = {
        id:               manifest.id,
        manifest,
        enabled:          false,
        loaded:           false,
        state:            'registered',
        version:          manifest.version,
        version_history:  [{ version: manifest.version, at: now(), action: 'register' }],
        registered_at:    now(),
        ...meta,
      };
      table.set(manifest.id, row);
      return { ...row, manifest: { ...manifest } };
    },

    removeSkill(skillId) {
      const table = map();
      if (!table?.has(skillId)) {
        const err = new Error('skill_not_found');
        err.code = 'SKILL_NOT_FOUND';
        throw err;
      }
      table.delete(skillId);
      return { id: skillId, removed: true };
    },

    listSkills({ enabled } = {}) {
      const table = map();
      if (!table) return [];
      return [...table.values()]
        .filter((s) => enabled == null || s.enabled === enabled)
        .map((s) => ({ ...s, manifest: { ...s.manifest } }));
    },

    findSkill(skillId) {
      const table = map();
      const row = table?.get(skillId);
      return row ? { ...row, manifest: { ...row.manifest } } : null;
    },

    enableSkill(skillId) {
      const row = this.findSkill(skillId);
      if (!row) {
        const err = new Error('skill_not_found');
        err.code = 'SKILL_NOT_FOUND';
        throw err;
      }
      const table = map();
      row.enabled = true;
      row.state = 'enabled';
      row.enabled_at = now();
      table.set(skillId, row);
      return { ...row, manifest: { ...row.manifest } };
    },

    disableSkill(skillId) {
      const row = this.findSkill(skillId);
      if (!row) throw new Error('skill_not_found');
      const table = map();
      row.enabled = false;
      row.loaded = false;
      row.state = 'disabled';
      table.set(skillId, row);
      return { ...row, manifest: { ...row.manifest } };
    },

    updateSkill(skillId, patch) {
      const table = map();
      const row = table?.get(skillId);
      if (!row) throw new Error('skill_not_found');
      Object.assign(row, patch);
      table.set(skillId, row);
      return { ...row, manifest: { ...row.manifest } };
    },
  };
}
