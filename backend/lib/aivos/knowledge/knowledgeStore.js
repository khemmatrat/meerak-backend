import { randomUUID } from 'crypto';

function ensureTables(store) {
  if (store?.kind !== 'memory') return null;
  const t = store._tables;
  if (!t.knowledgeDocuments) t.knowledgeDocuments = new Map();
  if (!t.knowledgeEntities) t.knowledgeEntities = new Map();
  if (!t.knowledgeVectors) t.knowledgeVectors = new Map();
  if (!t.knowledgeMetadata) t.knowledgeMetadata = new Map();
  if (!t.knowledgeVersions) t.knowledgeVersions = new Map();
  return t;
}

export function createKnowledgeStore({ store } = {}) {
  const tables = () => ensureTables(store);

  return {
    insertDocument({ id, title, body, format = 'text', metadata = {}, version = 1 } = {}) {
      const t = tables();
      if (!t) throw new Error('knowledge_store_requires_memory_store');
      const docId = id || randomUUID();
      const row = {
        id: docId,
        title: title || '',
        body: body || '',
        format,
        metadata: { ...metadata },
        version,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      t.knowledgeDocuments.set(docId, row);
      return { ...row };
    },

    getDocument(id) {
      const row = tables()?.knowledgeDocuments.get(id);
      return row ? { ...row } : null;
    },

    listDocuments() {
      return [...(tables()?.knowledgeDocuments.values() || [])].map((d) => ({ ...d }));
    },

    insertEntity({ id, type, name, category, hierarchy = [], metadata = {}, capabilities = [] } = {}) {
      const t = tables();
      if (!t) throw new Error('knowledge_store_requires_memory_store');
      const entityId = id || randomUUID();
      const row = {
        id: entityId,
        type,
        name,
        category: category || type,
        hierarchy: [...hierarchy],
        metadata: { ...metadata },
        capabilities: [...capabilities],
        cross_refs: [],
        created_at: new Date().toISOString(),
      };
      t.knowledgeEntities.set(entityId, row);
      return { ...row };
    },

    getEntity(id) {
      const row = tables()?.knowledgeEntities.get(id);
      return row ? { ...row } : null;
    },

    listEntities({ type } = {}) {
      return [...(tables()?.knowledgeEntities.values() || [])]
        .filter((e) => !type || e.type === type)
        .map((e) => ({ ...e }));
    },

    upsertVector({ id, entityId, documentId, vector, model = 'aivos-hash-v1' } = {}) {
      const t = tables();
      const vecId = id || randomUUID();
      const row = { id: vecId, entity_id: entityId, document_id: documentId, vector: [...vector], model, at: new Date().toISOString() };
      t.knowledgeVectors.set(vecId, row);
      return { ...row };
    },

    listVectors() {
      return [...(tables()?.knowledgeVectors.values() || [])].map((v) => ({ ...v }));
    },

    setMetadata(key, value) {
      const t = tables();
      t.knowledgeMetadata.set(key, { key, value, at: new Date().toISOString() });
      return { key, value };
    },

    getMetadata(key) {
      return tables()?.knowledgeMetadata.get(key)?.value ?? null;
    },

    saveVersion({ entityId, version, blob, hash }) {
      const t = tables();
      const key = `${entityId}::${version}`;
      const row = { entity_id: entityId, version, blob, hash, saved_at: new Date().toISOString() };
      t.knowledgeVersions.set(key, row);
      return { ...row };
    },

    listVersions(entityId) {
      return [...(tables()?.knowledgeVersions.values() || [])]
        .filter((v) => v.entity_id === entityId)
        .sort((a, b) => String(a.version).localeCompare(String(b.version)));
    },

    stats() {
      const t = tables();
      if (!t) return { documents: 0, entities: 0, vectors: 0, versions: 0 };
      return {
        documents: t.knowledgeDocuments.size,
        entities:  t.knowledgeEntities.size,
        vectors:   t.knowledgeVectors.size,
        versions:  t.knowledgeVersions.size,
      };
    },
  };
}
