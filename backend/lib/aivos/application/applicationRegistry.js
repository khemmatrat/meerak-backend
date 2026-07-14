function ensureApps(store) {
  if (store?.kind !== 'memory') return null;
  if (!store._tables.applicationRegistry) store._tables.applicationRegistry = new Map();
  return store._tables.applicationRegistry;
}

function now() {
  return new Date().toISOString();
}

export function createApplicationRegistry({ store } = {}) {
  const map = () => ensureApps(store);

  return {
    register(manifest, { tenantId = 'default' } = {}) {
      const table = map();
      if (!table) throw new Error('application_registry_requires_memory_store');
      const key = manifest.tenantScoped === false ? manifest.id : `${tenantId}::${manifest.id}`;
      const row = {
        key,
        id: manifest.id,
        tenantId,
        manifest,
        enabled: false,
        installed: false,
        state: 'registered',
        version: manifest.version,
        version_history: [{ version: manifest.version, at: now(), action: 'register' }],
        registered_at: now(),
      };
      table.set(key, row);
      return { ...row, manifest: { ...manifest } };
    },

    remove(appId, { tenantId = 'default' } = {}) {
      const table = map();
      const key = `${tenantId}::${appId}`;
      const row = table?.get(key) || table?.get(appId);
      if (!row) {
        const err = new Error('application_not_found');
        err.code = 'APPLICATION_NOT_FOUND';
        throw err;
      }
      table.delete(row.key);
      return { id: appId, removed: true };
    },

    find(appId, { tenantId = 'default' } = {}) {
      const table = map();
      return table?.get(`${tenantId}::${appId}`) || table?.get(appId) || null;
    },

    list({ tenantId, enabled, installed } = {}) {
      return [...(map()?.values() || [])]
        .filter((a) => !tenantId || a.tenantId === tenantId)
        .filter((a) => enabled == null || a.enabled === enabled)
        .filter((a) => installed == null || a.installed === installed)
        .map((a) => ({ ...a, manifest: { ...a.manifest } }));
    },

    enable(appId, { tenantId = 'default' } = {}) {
      const row = this.find(appId, { tenantId });
      if (!row) throw new Error('application_not_found');
      row.enabled = true;
      row.state = 'enabled';
      row.enabled_at = now();
      map().set(row.key, row);
      return { ...row, manifest: { ...row.manifest } };
    },

    disable(appId, { tenantId = 'default' } = {}) {
      const row = this.find(appId, { tenantId });
      if (!row) throw new Error('application_not_found');
      row.enabled = false;
      row.state = 'disabled';
      map().set(row.key, row);
      return { ...row, manifest: { ...row.manifest } };
    },

    update(appId, patch, { tenantId = 'default' } = {}) {
      const row = this.find(appId, { tenantId });
      if (!row) throw new Error('application_not_found');
      Object.assign(row, patch);
      map().set(row.key, row);
      return { ...row, manifest: { ...row.manifest } };
    },
  };
}
