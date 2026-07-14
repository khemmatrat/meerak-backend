export function createMemoryApi({ store }) {
  return {
    async get(jobId, layer, key) {
      return store.getWorking(jobId, layer, key);
    },
    async set(jobId, layer, key, value, opts = {}) {
      return store.setWorking(jobId, layer, key, value, opts.ttlSec);
    },
    async appendEpisode(userId, payload) {
      return store.appendEpisode(userId, payload);
    },
    semantic: {
      upsert: (ownerId, input) => store.upsertSemantic({ ownerId, ...input }),
      search: (ownerId, queryText, opts = {}) =>
        store.searchSemantic({ ownerId, query: queryText, namespace: opts.namespace, contentTypes: opts.contentTypes, limit: opts.limit || 5 }),
    },
  };
}
