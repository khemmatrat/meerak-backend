import { sha256Artifact } from '../governance/versioning.js';

export function createKnowledgeVersion({ store, governance } = {}) {
  return {
    snapshotEntity(entityId, blob) {
      const versions = store.listVersions(entityId);
      const version = versions.length ? String(Number(versions[versions.length - 1].version) + 1) : '1';
      const hash = sha256Artifact(blob);
      const row = store.saveVersion({ entityId, version, blob, hash });
      if (governance?.enabled) {
        governance.auditVersionChange?.({
          entityType: 'knowledge_entity',
          entityId,
          entityVersion: version,
          action: 'snapshot',
          diff: { hash },
        }).catch(() => {});
      }
      return { ...row, version };
    },

    rollback(entityId) {
      const versions = store.listVersions(entityId);
      if (versions.length < 2) throw new Error('knowledge_no_rollback_target');
      const target = versions[versions.length - 2];
      return { entityId, version: target.version, blob: target.blob, hash: target.hash };
    },

    diff(entityId, baselineVersion) {
      const versions = store.listVersions(entityId);
      const current = versions[versions.length - 1];
      const baseline = versions.find((v) => String(v.version) === String(baselineVersion)) || versions[0];
      const match = current?.hash === baseline?.hash;
      return {
        entityId,
        match,
        current:  current ? { version: current.version, hash: current.hash } : null,
        baseline: baseline ? { version: baseline.version, hash: baseline.hash } : null,
      };
    },

    list(entityId) {
      return store.listVersions(entityId);
    },
  };
}
