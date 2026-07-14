import { createHash } from 'crypto';
import { MAX_SNAPSHOTS_PER_ENTITY } from './config.js';

function ensureTables(store) {
  if (store.kind !== 'memory') return null;
  if (!store._tables.governancePins) store._tables.governancePins = new Map();
  if (!store._tables.governanceSnapshots) store._tables.governanceSnapshots = new Map();
  return store._tables;
}

export function sha256Artifact(value) {
  return createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
}

export function createVersionPin({ store }) {
  return {
    pin({ entityType, entityId, version, actorId, traceId, payload } = {}) {
      const tables = ensureTables(store);
      if (!tables) return null;
      const key = `${entityType}::${entityId}`;
      const row = {
        entity_type: entityType,
        entity_id:   entityId,
        version,
        actor_id:    actorId || null,
        trace_id:    traceId || null,
        payload:     payload || {},
        pinned_at:   new Date().toISOString(),
      };
      tables.governancePins.set(key, row);
      return { ...row };
    },

    get({ entityType, entityId } = {}) {
      const tables = ensureTables(store);
      if (!tables) return null;
      return tables.governancePins.get(`${entityType}::${entityId}`) || null;
    },

    list({ entityType } = {}) {
      const tables = ensureTables(store);
      if (!tables) return [];
      return [...tables.governancePins.values()].filter((p) => !entityType || p.entity_type === entityType);
    },
  };
}

export function createVersionSnapshot({ store }) {
  return {
    save({ entityType, entityId, version, blob, actorId } = {}) {
      const tables = ensureTables(store);
      if (!tables) return null;
      const key = `${entityType}::${entityId}`;
      const existing = tables.governanceSnapshots.get(key) || [];
      const entry = {
        entity_type: entityType,
        entity_id:   entityId,
        version,
        blob,
        hash:        sha256Artifact(blob),
        actor_id:    actorId || null,
        saved_at:    new Date().toISOString(),
      };
      const next = [...existing, entry].slice(-MAX_SNAPSHOTS_PER_ENTITY);
      tables.governanceSnapshots.set(key, next);
      return { ...entry };
    },

    list({ entityType, entityId } = {}) {
      const tables = ensureTables(store);
      if (!tables) return [];
      if (entityId) return tables.governanceSnapshots.get(`${entityType}::${entityId}`) || [];
      const out = [];
      for (const rows of tables.governanceSnapshots.values()) {
        for (const r of rows) {
          if (!entityType || r.entity_type === entityType) out.push(r);
        }
      }
      return out;
    },

    latest({ entityType, entityId } = {}) {
      const rows = this.list({ entityType, entityId });
      return rows.length ? rows[rows.length - 1] : null;
    },
  };
}
