function ensureRegistry(store) {
  if (store?.kind !== 'memory') return null;
  if (!store._tables.connectorRegistry) store._tables.connectorRegistry = new Map();
  return store._tables.connectorRegistry;
}

function now() {
  return new Date().toISOString();
}

export function createConnectorRegistry({ store } = {}) {
  const map = () => ensureRegistry(store);

  return {
    register(manifest, { tenantId = 'default' } = {}) {
      const table = map();
      if (!table) throw new Error('connector_registry_requires_memory_store');
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

    remove(connectorId, { tenantId = 'default' } = {}) {
      const table = map();
      const row = table?.get(`${tenantId}::${connectorId}`) || table?.get(connectorId);
      if (!row) {
        const err = new Error('connector_not_found');
        err.code = 'CONNECTOR_NOT_FOUND';
        throw err;
      }
      table.delete(row.key);
      return { id: connectorId, removed: true };
    },

    find(connectorId, { tenantId = 'default' } = {}) {
      return map()?.get(`${tenantId}::${connectorId}`) || map()?.get(connectorId) || null;
    },

    list({ tenantId, enabled, installed } = {}) {
      return [...(map()?.values() || [])]
        .filter((c) => !tenantId || c.tenantId === tenantId)
        .filter((c) => enabled == null || c.enabled === enabled)
        .filter((c) => installed == null || c.installed === installed)
        .map((c) => ({ ...c, manifest: { ...c.manifest } }));
    },

    enable(connectorId, { tenantId = 'default' } = {}) {
      const row = this.find(connectorId, { tenantId });
      if (!row) throw new Error('connector_not_found');
      row.enabled = true;
      row.state = 'enabled';
      row.enabled_at = now();
      map().set(row.key, row);
      return { ...row, manifest: { ...row.manifest } };
    },

    disable(connectorId, { tenantId = 'default' } = {}) {
      const row = this.find(connectorId, { tenantId });
      if (!row) throw new Error('connector_not_found');
      row.enabled = false;
      row.state = 'disabled';
      map().set(row.key, row);
      return { ...row, manifest: { ...row.manifest } };
    },

    update(connectorId, patch, { tenantId = 'default' } = {}) {
      const row = this.find(connectorId, { tenantId });
      if (!row) throw new Error('connector_not_found');
      Object.assign(row, patch);
      map().set(row.key, row);
      return { ...row, manifest: { ...row.manifest } };
    },
  };
}
