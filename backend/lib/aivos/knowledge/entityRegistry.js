import { ENTITY_TYPES } from './config.js';

function ensureRelationships(store) {
  if (store?.kind !== 'memory') return null;
  if (!store._tables.knowledgeRelationships) store._tables.knowledgeRelationships = new Map();
  return store._tables.knowledgeRelationships;
}

export function createEntityRegistry({ store } = {}) {
  const allowed = new Set(ENTITY_TYPES);

  return {
    register({ id, type, name, category, hierarchy, metadata, capabilities } = {}) {
      if (!allowed.has(type)) {
        const err = new Error('entity_type_invalid');
        err.code = 'ENTITY_TYPE_INVALID';
        throw err;
      }
      return store.insertEntity({ id, type, name, category, hierarchy, metadata, capabilities });
    },

    find(id) {
      return store.getEntity(id);
    },

    list({ type } = {}) {
      return store.listEntities({ type });
    },

    listByCategory(category) {
      return store.listEntities().filter((e) => e.category === category);
    },

    types: () => [...ENTITY_TYPES],
  };
}

export function createRelationshipEngine({ store, knowledgeStore } = {}) {
  const entities = knowledgeStore || store;
  const table = () => ensureRelationships(store);

  return {
    addRelationship({ fromId, toId, type = 'related_to', metadata = {} } = {}) {
      const rels = table();
      if (!rels) throw new Error('relationship_engine_requires_memory_store');
      const id = `${fromId}::${type}::${toId}`;
      const row = { id, from_id: fromId, to_id: toId, type, metadata, created_at: new Date().toISOString() };
      rels.set(id, row);
      const entity = entities.getEntity(fromId);
      if (entity && type === 'cross_ref' && !entity.cross_refs.includes(toId)) {
        entity.cross_refs.push(toId);
      }
      return { ...row };
    },

    listForEntity(entityId) {
      return [...(table()?.values() || [])].filter((r) => r.from_id === entityId || r.to_id === entityId);
    },

    listChildren(parentId) {
      return [...(table()?.values() || [])].filter((r) => r.from_id === parentId && r.type === 'child_of');
    },

    listAll() {
      return [...(table()?.values() || [])].map((r) => ({ ...r }));
    },
  };
}
