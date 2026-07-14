import { createDependencyResolver } from './dependencyResolver.js';
import { createMarketplaceCatalog } from './catalog.js';

function now() {
  return new Date().toISOString();
}

export function createMarketplaceLifecycle({ store, catalog, events, resolver, getBillingEngine, getGovernanceEngine }) {
  const deps = resolver || createDependencyResolver({ store, getBillingEngine });
  const cat  = catalog  || createMarketplaceCatalog({ store });

  async function auditLifecycle(action, row, diff = {}) {
    const governance = getGovernanceEngine?.();
    if (governance?.enabled) {
      await governance.auditMarketplace({
        packageId: row.package_id,
        type:      row.type,
        version:   row.version,
        action,
        diff,
      });
    }
  }

  function tables() {
    return cat.ensureTables(store);
  }

  function packageMap(type) {
    const t = tables();
    if (!t) return null;
    return type === 'workflow' ? t.marketplaceWorkflows : t.marketplacePackages;
  }

  async function emit(name, payload) {
    if (events?.emit) {
      await events.emit({
        name,
        correlationId: payload.package_id || 'marketplace',
        source:        { runtimeJobId: null },
        payload,
      }).catch(() => {});
    }
  }

  return {
    async install({ packageId, type = 'plugin', version, userId } = {}) {
      const meta = cat.getPackage(packageId, type);
      if (!meta) {
        await emit('aivos.marketplace.install.failed', { package_id: packageId, reason: 'package_not_found' });
        const err = new Error('marketplace_package_not_found');
        err.code = 'MARKETPLACE_PACKAGE_NOT_FOUND';
        throw err;
      }

      const check = await deps.resolve({
        requiredPlugins: meta.required_plugins || [],
        requiredSkills:  meta.required_skills  || [],
        userId,
        minTier:         meta.min_tier || null,
      });
      if (!check.ok) {
        await emit('aivos.marketplace.install.failed', { package_id: packageId, capability_gap: check.gaps });
        const err = new Error('capability_gap');
        err.code = 'CAPABILITY_GAP';
        err.details = check.gaps;
        throw err;
      }

      const map = packageMap(type);
      if (!map) throw new Error('marketplace_requires_memory_store');

      const pinnedVersion = version || meta.version;
      const row = {
        package_id:      packageId,
        type,
        version:         pinnedVersion,
        enabled:         false,
        suspended:       false,
        state:           'installed',
        version_history: [{ version: pinnedVersion, at: now(), action: 'install' }],
        required_plugins: meta.required_plugins || [],
        required_skills:  meta.required_skills  || [],
        installed_at:     now(),
      };
      map.set(packageId, row);
      await emit('aivos.marketplace.install.success', { package_id: packageId, version: pinnedVersion });
      await auditLifecycle('install', row, { state: 'installed' });
      return { ...row };
    },

    async enable({ packageId, type = 'plugin' } = {}) {
      const map = packageMap(type);
      const row = map?.get(packageId);
      if (!row) {
        const err = new Error('marketplace_not_installed');
        err.code = 'MARKETPLACE_NOT_INSTALLED';
        throw err;
      }
      if (row.suspended) {
        const err = new Error('marketplace_suspended');
        err.code = 'MARKETPLACE_SUSPENDED';
        throw err;
      }
      row.enabled = true;
      row.state   = 'enabled';
      row.enabled_at = now();

      if (type === 'plugin' && store.kind === 'memory') {
        const meta = cat.getPackage(packageId, 'plugin');
        store._tables.pluginRegistry.set(packageId, {
          plugin_id:       packageId,
          version:         parseInt(row.version, 10) || 1,
          capabilities:    meta?.capabilities || [],
          required_skills: meta?.required_skills || [],
          enabled:         true,
          policy_profile:  { tier: 'standard' },
        });
      }
      await emit('aivos.marketplace.enabled', { package_id: packageId });
      await auditLifecycle('enable', row);
      return { ...row };
    },

    async disable({ packageId, type = 'plugin' } = {}) {
      const map = packageMap(type);
      const row = map?.get(packageId);
      if (!row) throw new Error('marketplace_not_installed');
      row.enabled = false;
      row.state   = 'disabled';
      if (type === 'plugin' && store.kind === 'memory') {
        const existing = store._tables.pluginRegistry.get(packageId);
        if (existing) store._tables.pluginRegistry.set(packageId, { ...existing, enabled: false });
      }
      await emit('aivos.marketplace.disabled', { package_id: packageId });
      await auditLifecycle('disable', row);
      return { ...row };
    },

    async upgrade({ packageId, type = 'plugin', version } = {}) {
      const map = packageMap(type);
      const row = map?.get(packageId);
      if (!row) throw new Error('marketplace_not_installed');
      const prev = row.version;
      row.version = version || row.version;
      row.version_history.push({ version: row.version, at: now(), action: 'upgrade', previous: prev });
      row.state = 'enabled';
      await emit('aivos.marketplace.upgraded', { package_id: packageId, version: row.version, previous: prev });
      await auditLifecycle('upgrade', row, { previous: prev });
      return { ...row };
    },

    async rollback({ packageId, type = 'plugin' } = {}) {
      const map = packageMap(type);
      const row = map?.get(packageId);
      if (!row) throw new Error('marketplace_not_installed');
      const history = row.version_history.filter((h) => h.action === 'install' || h.action === 'upgrade');
      if (history.length < 2) throw new Error('marketplace_no_rollback_target');
      const prev = history[history.length - 2].version;
      row.version = prev;
      row.version_history.push({ version: prev, at: now(), action: 'rollback' });
      await emit('aivos.marketplace.rollback', { package_id: packageId, version: prev });
      await auditLifecycle('rollback', row, { rolledBackTo: prev });
      return { ...row };
    },

    async suspend({ packageId, type = 'plugin' } = {}) {
      const map = packageMap(type);
      const row = map?.get(packageId);
      if (!row) throw new Error('marketplace_not_installed');
      row.suspended = true;
      row.enabled   = false;
      row.state     = 'suspended';
      return { ...row };
    },

    async resume({ packageId, type = 'plugin' } = {}) {
      const map = packageMap(type);
      const row = map?.get(packageId);
      if (!row) throw new Error('marketplace_not_installed');
      row.suspended = false;
      row.state     = 'installed';
      return { ...row };
    },

    async remove({ packageId, type = 'plugin' } = {}) {
      const map = packageMap(type);
      if (!map?.has(packageId)) throw new Error('marketplace_not_installed');
      const row = map.get(packageId);
      row.state = 'deleted';
      row.deleted_at = now();
      map.delete(packageId);
      await emit('aivos.marketplace.deleted', { package_id: packageId });
      return { package_id: packageId, deleted: true };
    },
  };
}
