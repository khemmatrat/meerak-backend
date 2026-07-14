import { sha256Artifact } from '../governance/versioning.js';

function ensureVersions(store) {
  if (store?.kind !== 'memory') return null;
  if (!store._tables.connectorVersions) store._tables.connectorVersions = new Map();
  return store._tables.connectorVersions;
}

export function createConnectorInstaller({
  registry,
  dependency,
  marketplace,
  vault,
  audit,
  store,
} = {}) {
  const versions = () => ensureVersions(store);

  function snapshot(manifest, tenantId) {
    const table = versions();
    if (!table) return { stub: true };
    const existing = [...table.values()].filter((v) => v.connector_id === manifest.id && v.tenant_id === tenantId);
    const version = existing.length ? String(Number(existing[existing.length - 1].version) + 1) : '1';
    const hash = sha256Artifact(manifest);
    const row = { connector_id: manifest.id, tenant_id: tenantId, version, manifest, hash, saved_at: new Date().toISOString() };
    table.set(`${manifest.id}::${tenantId}::${version}`, row);
    return row;
  }

  return {
    async install(manifest, { tenantId = 'default', userId = null, secret = null } = {}) {
      const check = await dependency.resolve(manifest, { tenantId, userId });
      if (!check.ok) {
        const err = new Error('connector_dependency_gap');
        err.code = 'CONNECTOR_DEPENDENCY_GAP';
        err.details = check.gaps;
        throw err;
      }

      for (const packageId of manifest.dependencies?.marketplace || []) {
        if (marketplace?.enabled) {
          try {
            await marketplace.install({ packageId, type: 'plugin', userId });
          } catch {
            /* reuse existing */
          }
        }
      }

      const row = registry.register(manifest, { tenantId });
      registry.update(manifest.id, { installed: true, state: 'installed', installed_at: new Date().toISOString() }, { tenantId });
      if (secret && vault) vault.store({ connectorId: manifest.id, tenantId, secret });
      snapshot(manifest, tenantId);
      audit?.record?.({ action: 'install', connectorId: manifest.id, tenantId });
      return { ...row, installed: true };
    },

    async uninstall(connectorId, { tenantId = 'default' } = {}) {
      if (vault) vault.revoke(connectorId, { tenantId });
      registry.remove(connectorId, { tenantId });
      audit?.record?.({ action: 'uninstall', connectorId, tenantId });
      return { id: connectorId, uninstalled: true, tenantId };
    },

    upgrade(connectorId, nextManifest, { tenantId = 'default' } = {}) {
      const row = registry.find(connectorId, { tenantId });
      if (!row) throw new Error('connector_not_found');
      row.manifest = nextManifest;
      row.version = nextManifest.version;
      row.version_history.push({ version: nextManifest.version, at: new Date().toISOString(), action: 'upgrade' });
      registry.update(connectorId, row, { tenantId });
      snapshot(nextManifest, tenantId);
      audit?.record?.({ action: 'upgrade', connectorId, tenantId, diff: { version: nextManifest.version } });
      return row;
    },

    rollback(connectorId, { tenantId = 'default' } = {}) {
      const table = versions();
      const list = [...(table?.values() || [])].filter((v) => v.connector_id === connectorId && v.tenant_id === tenantId);
      if (list.length < 2) {
        const err = new Error('connector_no_rollback_target');
        err.code = 'CONNECTOR_NO_ROLLBACK_TARGET';
        throw err;
      }
      const target = list[list.length - 2];
      registry.update(connectorId, { manifest: target.manifest, version: target.version }, { tenantId });
      audit?.record?.({ action: 'rollback', connectorId, tenantId, diff: { version: target.version } });
      return { connectorId, version: target.version, manifest: target.manifest };
    },
  };
}
