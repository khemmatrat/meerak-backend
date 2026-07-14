export function createSemanticSearch({ store, embeddingIndex, metrics, cache } = {}) {
  function keywordScore(query, text) {
    const qTokens = new Set(String(query).toLowerCase().split(/\W+/).filter(Boolean));
    const dTokens = String(text).toLowerCase().split(/\W+/).filter(Boolean);
    if (!qTokens.size) return 0;
    let hits = 0;
    for (const t of dTokens) if (qTokens.has(t)) hits += 1;
    return hits / qTokens.size;
  }

  return {
    search({ query, capability, limit = 10, hybridWeight = 0.5 } = {}) {
      const started = Date.now();
      const cacheKey = `search:${query}:${capability || ''}:${limit}`;
      const cached = cache?.get(cacheKey);
      if (cached) {
        metrics?.recordQuery?.({ latencyMs: Date.now() - started, hit: true, recall: cached.results.length });
        return { ...cached, cached: true };
      }

      const queryVec = embeddingIndex.embed(query);
      const docs = store.listDocuments();
      const entities = store.listEntities();
      const vectors = store.listVectors();

      const docScores = docs.map((doc) => {
        const text = `${doc.title} ${doc.body}`;
        const kw = keywordScore(query, text);
        const vecRow = vectors.find((v) => v.document_id === doc.id);
        const emb = vecRow ? embeddingIndex.cosine(queryVec, vecRow.vector) : 0;
        const score = hybridWeight * kw + (1 - hybridWeight) * emb;
        return { kind: 'document', id: doc.id, title: doc.title, score, capability: doc.metadata?.capability };
      });

      const entityScores = entities.map((entity) => {
        const text = `${entity.name} ${entity.type} ${entity.category}`;
        const kw = keywordScore(query, text);
        const vecRow = vectors.find((v) => v.entity_id === entity.id);
        const emb = vecRow ? embeddingIndex.cosine(queryVec, vecRow.vector) : 0;
        let score = hybridWeight * kw + (1 - hybridWeight) * emb;
        if (capability && entity.capabilities?.includes(capability)) score += 0.15;
        return { kind: 'entity', id: entity.id, name: entity.name, type: entity.type, score, capabilities: entity.capabilities };
      });

      let results = [...docScores, ...entityScores]
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      if (capability) {
        results = results.filter((r) => !r.capabilities || r.capabilities.includes(capability) || r.capability === capability);
      }

      const payload = { query, results, count: results.length, hybridWeight };
      cache?.set(cacheKey, payload);
      metrics?.recordQuery?.({ latencyMs: Date.now() - started, hit: false, recall: results.length });
      return payload;
    },
  };
}
