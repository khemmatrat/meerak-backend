import { sha256Artifact } from '../governance/versioning.js';

function ensureVersions(store) {
  if (store?.kind !== 'memory') return null;
  if (!store._tables.workflowVersions) store._tables.workflowVersions = new Map();
  return store._tables.workflowVersions;
}

export function createWorkflowVersioning({ store, governance } = {}) {
  const table = () => ensureVersions(store);

  return {
    snapshot(workflowId, manifest) {
      const versions = table();
      if (!versions) return { workflowId, stub: true };
      const existing = [...versions.values()].filter((v) => v.workflow_id === workflowId);
      const version = existing.length ? String(Number(existing[existing.length - 1].version) + 1) : '1';
      const hash = sha256Artifact(manifest);
      const row = { workflow_id: workflowId, version, manifest, hash, saved_at: new Date().toISOString() };
      versions.set(`${workflowId}::${version}`, row);
      if (governance?.enabled) {
        governance.auditVersionChange?.({
          entityType: 'workflow_template',
          entityId:   workflowId,
          entityVersion: version,
          action:     'snapshot',
          diff:       { hash },
        }).catch(() => {});
      }
      return { ...row };
    },

    pin(workflowId, version) {
      if (governance?.enabled && governance.pinVersion) {
        return governance.pinVersion({ entityType: 'workflow', entityId: workflowId, version });
      }
      return { workflowId, version, pinned: true };
    },

    diff(workflowId, baselineVersion) {
      const versions = [...(table()?.values() || [])].filter((v) => v.workflow_id === workflowId);
      const current = versions[versions.length - 1];
      const baseline = versions.find((v) => String(v.version) === String(baselineVersion)) || versions[0];
      return {
        workflowId,
        match: current?.hash === baseline?.hash,
        current:  current ? { version: current.version, hash: current.hash } : null,
        baseline: baseline ? { version: baseline.version, hash: baseline.hash } : null,
      };
    },

    rollback(workflowId) {
      const versions = [...(table()?.values() || [])].filter((v) => v.workflow_id === workflowId);
      if (versions.length < 2) throw new Error('workflow_no_rollback_target');
      const target = versions[versions.length - 2];
      return {
        workflowId,
        version:  target.version,
        manifest: { ...target.manifest, version: target.manifest?.version || target.version },
        hash:     target.hash,
      };
    },

    getManifest(workflowId, version) {
      const versions = [...(table()?.values() || [])].filter((v) => v.workflow_id === workflowId);
      const row = versions.find((v) => String(v.version) === String(version));
      return row ? { ...row.manifest } : null;
    },

    list(workflowId) {
      return [...(table()?.values() || [])].filter((v) => v.workflow_id === workflowId);
    },
  };
}
