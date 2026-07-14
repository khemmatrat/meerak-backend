import { isKnowledgeEnabled, KNOWLEDGE_PHASE } from './config.js';
import { createKnowledgeStore } from './knowledgeStore.js';
import { createEntityRegistry, createRelationshipEngine } from './entityRegistry.js';
import { createKnowledgeGraph } from './knowledgeGraph.js';
import { createEmbeddingIndex } from './embeddingIndex.js';
import { createSemanticSearch } from './semanticSearch.js';
import { createMemoryManager } from './memoryManager.js';
import { createKnowledgeIngest } from './knowledgeIngest.js';
import { createKnowledgeVersion } from './knowledgeVersion.js';
import { createKnowledgeSync } from './knowledgeSync.js';
import { createKnowledgeCache } from './knowledgeCache.js';
import { createKnowledgeMetrics } from './knowledgeMetrics.js';
import { createKnowledgeAudit } from './knowledgeAudit.js';

function disabledStub() {
  return {
    enabled: false,
    phase: KNOWLEDGE_PHASE,
    search: () => ({ results: [] }),
    getEntity: () => null,
    getGraph: () => ({ nodes: [], edges: [] }),
    ingest: async () => ({ ok: false }),
    stats: () => ({}),
  };
}

export function createKnowledgeEngine({
  runtime,
  store,
  governance,
  skills,
  marketplace,
  analyticsEngine,
  learningEngine,
  events,
} = {}) {
  if (!isKnowledgeEnabled()) return disabledStub();

  const resolvedStore = store || runtime?.store;
  const knowledgeStore = createKnowledgeStore({ store: resolvedStore });
  const relationshipEngine = createRelationshipEngine({ store: resolvedStore, knowledgeStore });
  const entityRegistry = createEntityRegistry({ store: knowledgeStore });
  const graph = createKnowledgeGraph({ store: knowledgeStore, relationshipEngine });
  const cache = createKnowledgeCache();
  const metrics = createKnowledgeMetrics();
  const embeddingIndex = createEmbeddingIndex({ store: knowledgeStore });
  const version = createKnowledgeVersion({
    store: knowledgeStore,
    governance: governance || runtime?.governance,
  });
  const audit = createKnowledgeAudit({
    governance: governance || runtime?.governance,
    store: resolvedStore,
  });
  const memory = createMemoryManager({ store: resolvedStore });
  const ingest = createKnowledgeIngest({
    store: knowledgeStore,
    embeddingIndex,
    entityRegistry,
    graph,
    version,
  });
  const search = createSemanticSearch({
    store: knowledgeStore,
    embeddingIndex,
    metrics,
    cache,
  });
  const sync = createKnowledgeSync({
    ingest,
    store: knowledgeStore,
    skills: skills || runtime?.skills,
    marketplace: marketplace || runtime?.marketplace,
    analyticsEngine: analyticsEngine || runtime?.analyticsEngine,
    learningEngine: learningEngine || runtime?.learningEngine,
    events: events || runtime?.events,
  });

  const engine = {
    enabled: true,
    phase:   KNOWLEDGE_PHASE,
    store:   knowledgeStore,
    graph,
    entities: entityRegistry,
    relationships: relationshipEngine,
    search,
    ingest,
    version,
    sync,
    memory,
    cache,
    metrics,
    audit,
    embeddingIndex,

    searchKnowledge(opts) {
      return search.search(opts);
    },

    getEntity(id) {
      return entityRegistry.find(id);
    },

    getGraph(entityId, opts) {
      return graph.neighbors(entityId, opts);
    },

    async ingestDocument(opts) {
      const doc = await ingest.ingestDocument(opts);
      await audit.record({ action: 'ingest', entityId: doc.id, entityType: 'document' });
      return doc;
    },

    stats() {
      const storeStats = knowledgeStore.stats();
      const cacheStats = cache.stats();
      metrics.setMemoryUsage(Math.max(1, storeStats.documents * 1024 + storeStats.entities * 512 + storeStats.vectors * 256));
      const metricStats = metrics.getStats();
      return { store: storeStats, metrics: metricStats, cache: cacheStats, audit: audit.summary() };
    },

    async syncAll() {
      return sync.syncAll();
    },

    async ingestMarketplace() {
      return ingest.ingestMarketplaceCatalog(marketplace || runtime?.marketplace);
    },
  };

  if (runtime) runtime.knowledge = engine;
  return engine;
}

export {
  isKnowledgeEnabled,
  KNOWLEDGE_PHASE,
  createKnowledgeStore,
  createKnowledgeGraph,
  createEntityRegistry,
  createRelationshipEngine,
  createSemanticSearch,
  createMemoryManager,
  createKnowledgeCache,
  createKnowledgeMetrics,
};
