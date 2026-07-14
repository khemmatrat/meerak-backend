import { createHash } from 'crypto';

const DIM = 32;

function tokenize(text = '') {
  return String(text).toLowerCase().split(/\W+/).filter(Boolean);
}

function normalize(vec) {
  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / mag);
}

export function createEmbeddingIndex({ store } = {}) {
  return {
    embed(text) {
      const vec = new Array(DIM).fill(0);
      for (const token of tokenize(text)) {
        const h = parseInt(createHash('sha256').update(token).digest('hex').slice(0, 8), 16);
        vec[h % DIM] += 1;
      }
      return normalize(vec);
    },

    indexDocument(doc) {
      const vector = this.embed(`${doc.title || ''} ${doc.body || ''}`);
      return store.upsertVector({
        documentId: doc.id,
        entityId:   doc.metadata?.entityId || null,
        vector,
      });
    },

    indexEntity(entity) {
      const vector = this.embed(`${entity.name || ''} ${entity.type || ''} ${JSON.stringify(entity.metadata || {})}`);
      return store.upsertVector({
        entityId: entity.id,
        vector,
      });
    },

    cosine(a, b) {
      if (!a?.length || !b?.length) return 0;
      let dot = 0;
      const len = Math.min(a.length, b.length);
      for (let i = 0; i < len; i += 1) dot += a[i] * b[i];
      return dot;
    },
  };
}
