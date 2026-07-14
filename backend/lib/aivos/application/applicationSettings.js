function ensureSettings(store) {
  if (store?.kind !== 'memory') return null;
  if (!store._tables.applicationSettings) store._tables.applicationSettings = new Map();
  return store._tables.applicationSettings;
}

export function createApplicationSettings({ store } = {}) {
  const table = () => ensureSettings(store);

  return {
    key(appId, tenantId = 'default') {
      return `${tenantId}::${appId}`;
    },

    get(appId, { tenantId = 'default' } = {}) {
      return table()?.get(this.key(appId, tenantId))?.values || null;
    },

    set(appId, values, { tenantId = 'default' } = {}) {
      const t = table();
      if (!t) throw new Error('application_settings_requires_memory_store');
      const row = {
        appId,
        tenantId,
        values: { ...values },
        updated_at: new Date().toISOString(),
      };
      t.set(this.key(appId, tenantId), row);
      return { ...row };
    },

    applyTemplate(manifest, input = {}) {
      const out = {};
      for (const [key, schema] of Object.entries(manifest.settingsTemplate || {})) {
        out[key] = input[key] ?? schema.default ?? null;
      }
      return out;
    },
  };
}
