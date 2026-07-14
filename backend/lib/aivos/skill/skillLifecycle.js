import { VERTICAL_SKILL_TEMPLATES } from './skillTemplate.js';

function now() {
  return new Date().toISOString();
}

export function createSkillLifecycle({
  registry,
  dependency,
  loader,
  marketplace,
  governance,
  events,
} = {}) {
  async function emit(name, payload) {
    if (events?.emit) {
      await events.emit({
        name,
        correlationId: payload.id || 'skill',
        source:        { runtimeJobId: null },
        payload,
      }).catch(() => {});
    }
  }

  async function audit(action, row, diff = {}) {
    if (governance?.enabled && governance?.auditVersionChange) {
      await governance.auditVersionChange({
        entityType:    'vertical_skill',
        entityId:      row.id,
        entityVersion: row.version,
        action,
        diff,
      }).catch(() => {});
    }
  }

  async function installMarketplaceDeps(manifest, userId) {
    const installed = [];
    if (!marketplace?.enabled) return installed;
    for (const packageId of manifest.requiredMarketplacePackages || []) {
      try {
        const row = await marketplace.install({ packageId, type: 'plugin', userId });
        installed.push(row);
      } catch (e) {
        if (e.code !== 'MARKETPLACE_NOT_INSTALLED') {
          const existing = (await marketplace.listInstalled()).find((p) => p.package_id === packageId);
          if (existing) installed.push(existing);
          else throw e;
        }
      }
    }
    return installed;
  }

  return {
    async install(manifest, { userId } = {}) {
      const check = await dependency.resolve(manifest, { userId, strictInstalled: false });
      if (!check.ok) {
        const err = new Error('skill_dependency_gap');
        err.code = 'SKILL_DEPENDENCY_GAP';
        err.details = check.gaps;
        throw err;
      }

      await installMarketplaceDeps(manifest, userId);
      const row = registry.registerSkill(manifest, { state: 'installed', installed_at: now() });
      await emit('aivos.skill.installed', { id: manifest.id, version: manifest.version });
      await audit('install', row);
      return row;
    },

    async enable(skillId) {
      const row = registry.findSkill(skillId);
      if (!row) {
        const err = new Error('skill_not_found');
        err.code = 'SKILL_NOT_FOUND';
        throw err;
      }
      const check = await dependency.resolve(row.manifest, { strictInstalled: true });
      if (!check.ok) {
        const err = new Error('skill_dependency_gap');
        err.code = 'SKILL_DEPENDENCY_GAP';
        err.details = check.gaps;
        throw err;
      }
      await loader.loadSkill(row);
      const enabled = registry.enableSkill(skillId);
      enabled.loaded = true;
      registry.updateSkill(skillId, { loaded: true });
      if (marketplace?.enabled) {
        for (const packageId of row.manifest.requiredMarketplacePackages || []) {
          await marketplace.enable({ packageId, type: 'plugin' }).catch(() => {});
        }
      }
      await emit('aivos.skill.enabled', { id: skillId });
      await audit('enable', enabled);
      return enabled;
    },

    async disable(skillId) {
      const row = registry.findSkill(skillId);
      if (!row) throw new Error('skill_not_found');
      await loader.unloadSkill(skillId);
      const disabled = registry.disableSkill(skillId);
      if (marketplace?.enabled) {
        for (const packageId of row.manifest.requiredMarketplacePackages || []) {
          await marketplace.disable({ packageId, type: 'plugin' }).catch(() => {});
        }
      }
      await emit('aivos.skill.disabled', { id: skillId });
      await audit('disable', disabled);
      return disabled;
    },

    async upgrade(skillId, version) {
      const row = registry.findSkill(skillId);
      if (!row) throw new Error('skill_not_found');
      const prev = row.version;
      const nextManifest = { ...row.manifest, version: version || row.version };
      row.manifest = nextManifest;
      row.version = nextManifest.version;
      row.version_history.push({ version: nextManifest.version, at: now(), action: 'upgrade', previous: prev });
      registry.updateSkill(skillId, row);
      if (row.enabled) await loader.reloadSkill(row);
      if (marketplace?.enabled) {
        for (const packageId of row.manifest.requiredMarketplacePackages || []) {
          await marketplace.upgrade({ packageId, type: 'plugin', version: nextManifest.version }).catch(() => {});
        }
      }
      await emit('aivos.skill.upgraded', { id: skillId, version: nextManifest.version, previous: prev });
      await audit('upgrade', row, { previous: prev });
      return registry.findSkill(skillId);
    },

    async rollback(skillId) {
      const row = registry.findSkill(skillId);
      if (!row) throw new Error('skill_not_found');
      const history = row.version_history.filter((h) => h.action === 'register' || h.action === 'upgrade' || h.action === 'install');
      if (history.length < 2) throw new Error('skill_no_rollback_target');
      const prev = history[history.length - 2].version;
      row.version = prev;
      row.manifest = { ...row.manifest, version: prev };
      row.version_history.push({ version: prev, at: now(), action: 'rollback' });
      registry.updateSkill(skillId, row);
      if (row.enabled) await loader.reloadSkill(row);
      if (marketplace?.enabled) {
        for (const packageId of row.manifest.requiredMarketplacePackages || []) {
          await marketplace.rollback({ packageId, type: 'plugin' }).catch(() => {});
        }
      }
      await emit('aivos.skill.rollback', { id: skillId, version: prev });
      await audit('rollback', row, { rolledBackTo: prev });
      return registry.findSkill(skillId);
    },

    async uninstall(skillId) {
      const row = registry.findSkill(skillId);
      if (!row) throw new Error('skill_not_found');
      await loader.unloadSkill(skillId);
      if (marketplace?.enabled) {
        for (const packageId of row.manifest.requiredMarketplacePackages || []) {
          await marketplace.remove({ packageId, type: 'plugin' }).catch(() => {});
        }
      }
      registry.removeSkill(skillId);
      await emit('aivos.skill.uninstalled', { id: skillId });
      return { id: skillId, uninstalled: true };
    },

    templates: () => VERTICAL_SKILL_TEMPLATES,
  };
}
