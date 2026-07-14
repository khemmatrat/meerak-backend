import { DEFAULT_CACHE_MAX, DEFAULT_CACHE_TTL_MS } from './config.js';

export function createKnowledgeCache({ maxSize = DEFAULT_CACHE_MAX, ttlMs = DEFAULT_CACHE_TTL_MS } = {}) {
  const map = new Map();
  const embeddingCache = new Map();
  let hits = 0;
  let misses = 0;

  function evictIfNeeded() {
    if (map.size <= maxSize) return;
    const oldest = map.keys().next().value;
    map.delete(oldest);
  }

  return {
    get(key) {
      const row = map.get(key);
      if (!row) {
        misses += 1;
        return null;
      }
      if (Date.now() - row.at > ttlMs) {
        map.delete(key);
        misses += 1;
        return null;
      }
      map.delete(key);
      map.set(key, row);
      hits += 1;
      return row.value;
    },

    set(key, value) {
      if (map.has(key)) map.delete(key);
      while (map.size >= maxSize) {
        const oldest = map.keys().next().value;
        map.delete(oldest);
      }
      map.set(key, { value, at: Date.now() });
      return value;
    },

    getEmbedding(key) {
      const row = embeddingCache.get(key);
      if (!row || Date.now() - row.at > ttlMs) {
        embeddingCache.delete(key);
        return null;
      }
      hits += 1;
      return row.value;
    },

    setEmbedding(key, vector) {
      if (embeddingCache.size > maxSize) {
        embeddingCache.delete(embeddingCache.keys().next().value);
      }
      embeddingCache.set(key, { value: vector, at: Date.now() });
      return vector;
    },

    stats() {
      return {
        size:           map.size,
        embeddingSize:  embeddingCache.size,
        hits,
        misses,
        hitRate:        hits + misses ? hits / (hits + misses) : 0,
      };
    },

    clear() {
      map.clear();
      embeddingCache.clear();
    },
  };
}
