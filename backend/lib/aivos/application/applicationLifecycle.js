import { sha256Artifact } from '../governance/versioning.js';

function ensureVersions(store) {
  if (store?.kind !== 'memory') return null;
  if (!store._tables.applicationVersions) store._tables.applicationVersions = new Map();
  return store._tables.applicationVersions;
}

export function createApplicationLifecycle({
  registry,
  installer,
  dependency,
  settings,
  governance,
  audit,
  store,
} = {}) {
  const versions = () => ensureVersions(store);

  function snapshot(manifest, tenantId) {
    const table = versions();
    if (!table) return { stub: true };
    const existing = [...table.values()].filter((v) => v.app_id === manifest.id && v.tenant_id === tenantId);
    const version = existing.length ? String(Number(existing[existing.length - 1].version) + 1) : '1';
    const hash = sha256Artifact(manifest);
    const row = { app_id: manifest.id, tenant_id: tenantId, version, manifest, hash, saved_at: new Date().toISOString() };
    table.set(`${manifest.id}::${tenantId}::${version}`, row);
    if (governance?.enabled) {
      governance.auditVersionChange?.({
        entityType: 'business_application',
        entityId: manifest.id,
        entityVersion: version,
        action: 'snapshot',
        diff: { hash, tenantId },
      }).catch(() => {});
    }
    return row;
  }

  return {
    async install(manifest, opts = {}) {
      const check = await dependency.resolve(manifest, opts);
      if (!check.ok) {
        const err = new Error('application_dependency_gap');
        err.code = 'APPLICATION_DEPENDENCY_GAP';
        err.details = check.gaps;
        throw err;
      }
      const result = await installer.install(manifest, opts);
      snapshot(manifest, opts.tenantId || 'default');
      audit.record({ action: 'install', appId: manifest.id, tenantId: opts.tenantId });
      return result;
    },

    async uninstall(appId, opts = {}) {
      const result = await installer.uninstall(appId, opts);
      settings.set(appId, {}, opts);
      audit.record({ action: 'uninstall', appId, tenantId: opts.tenantId });
      return result;
    },

    enable(appId, opts = {}) {
      const row = registry.enable(appId, opts);
      audit.record({ action: 'enable', appId, tenantId: opts.tenantId });
      return row;
    },

    disable(appId, opts = {}) {
      const row = registry.disable(appId, opts);
      audit.record({ action: 'disable', appId, tenantId: opts.tenantId });
      return row;
    },

    upgrade(appId, nextManifest, opts = {}) {
      const row = registry.find(appId, opts);
      if (!row) throw new Error('application_not_found');
      row.manifest = nextManifest;
      row.version = nextManifest.version;
      row.version_history.push({ version: nextManifest.version, at: new Date().toISOString(), action: 'upgrade' });
      registry.update(appId, row, opts);
      snapshot(nextManifest, opts.tenantId || 'default');
      audit.record({ action: 'upgrade', appId, tenantId: opts.tenantId, diff: { version: nextManifest.version } });
      return row;
    },

    rollback(appId, opts = {}) {
      const tenantId = opts.tenantId || 'default';
      const table = versions();
      const list = [...(table?.values() || [])].filter((v) => v.app_id === appId && v.tenant_id === tenantId);
      if (list.length < 2) throw new Error('application_no_rollback_target');
      const target = list[list.length - 2];
      registry.update(appId, { manifest: target.manifest, version: target.version }, opts);
      audit.record({ action: 'rollback', appId, tenantId, diff: { version: target.version } });
      return { appId, version: target.version, manifest: target.manifest };
    },
  };
}
