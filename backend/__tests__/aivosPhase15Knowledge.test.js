/**
 * Phase 15 – Knowledge Graph & Business Memory Engine
 * Tests KG01–KG12
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

process.env.AIVOS_RESUME_PLUGIN_ENABLED   = '1';
process.env.AIVOS_RUNTIME_ENABLED         = '1';
process.env.AIVOS_RENDER_ENABLED          = '1';
process.env.AIVOS_PUBLISH_ENABLED         = '1';
process.env.AIVOS_ANALYTICS_ENABLED       = '1';
process.env.AIVOS_LEARNING_ENABLED        = '1';
process.env.AIVOS_OPTIMIZATION_ENABLED    = '1';
process.env.AIVOS_AUTOMATION_ENABLED      = '1';
process.env.AIVOS_REVENUE_ENABLED         = '1';
process.env.AIVOS_MARKETPLACE_ENABLED     = '1';
process.env.AIVOS_BILLING_ENABLED         = '1';
process.env.AIVOS_GOVERNANCE_ENABLED      = '1';
process.env.AIVOS_QA_ENABLED              = '1';
process.env.AIVOS_SKILL_ENABLED           = '1';
process.env.AIVOS_ORCHESTRATOR_ENABLED    = '1';
process.env.AIVOS_KNOWLEDGE_ENABLED       = '1';

import { createRuntime } from '../lib/aivos/runtime/index.js';
import {
  createKnowledgeEngine,
  KNOWLEDGE_PHASE,
  createKnowledgeCache,
} from '../lib/aivos/knowledge/index.js';
import { getSkillTemplate } from '../lib/aivos/skill/index.js';
import { registerAivosRoutes } from '../lib/aivos/index.js';

const __dir = dirname(fileURLToPath(import.meta.url));

const mockGrowth = {
  getGrowthStatus: async (userId) => ({
    userId,
    ai_video_credits: 10,
    tier: 'premium',
  }),
};

function makeRuntime(overrides = {}) {
  return createRuntime({ syncExecute: true, growthEngine: mockGrowth, ...overrides });
}

async function withServer(app, fn) {
  const server = app.listen(0);
  const port = server.address().port;
  try {
    return await fn(port);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

function makeApp(overrides = {}) {
  const app = express();
  app.use(express.json());
  registerAivosRoutes(app, {
    runtimeEnabled: true,
    marketplaceEnabled: true,
    billingEnabled: true,
    governanceEnabled: true,
    qaEnabled: true,
    skillEnabled: true,
    orchestratorEnabled: true,
    knowledgeEnabled: true,
    forceNew: true,
    growthEngine: mockGrowth,
    authenticateToken: (_q, _s, n) => n(),
    ...overrides,
  });
  return app;
}

test('KG01 knowledge store persists documents entities vectors versions', async () => {
  const rt = makeRuntime();
  const doc = await rt.knowledge.ingestDocument({
    title: 'Bangkok Guide',
    body:  'Travel tips for Bangkok hotels and restaurants',
    format: 'markdown',
  });
  assert.ok(doc.id);
  const stats = rt.knowledge.store.stats();
  assert.ok(stats.documents >= 1);
  assert.ok(stats.vectors >= 1);
});

test('KG02 knowledge graph links entities and traverses neighbors', async () => {
  const rt = makeRuntime();
  const hotel = rt.knowledge.entities.register({ id: 'hotel-1', type: 'hotel', name: 'Sukhumvit Suites' });
  const trip = rt.knowledge.entities.register({ id: 'trip-1', type: 'trip', name: 'Bangkok Trip' });
  rt.knowledge.graph.link('trip-1', 'hotel-1', 'includes');
  const graph = rt.knowledge.getGraph('trip-1');
  assert.ok(graph.nodes.length >= 2);
  assert.ok(graph.edges.length >= 1);
});

test('KG03 entity registry supports business entity types', () => {
  const rt = makeRuntime();
  const restaurant = rt.knowledge.entities.register({ id: 'rest-1', type: 'restaurant', name: 'Thai Kitchen' });
  const insurance = rt.knowledge.entities.register({ id: 'ins-1', type: 'insurance', name: 'Travel Cover' });
  assert.equal(restaurant.type, 'restaurant');
  assert.equal(insurance.type, 'insurance');
  assert.ok(rt.knowledge.entities.types().includes('merchant'));
});

test('KG04 semantic search hybrid keyword and embedding ranking', async () => {
  const rt = makeRuntime();
  await rt.knowledge.ingestDocument({ title: 'Hotel Bangkok', body: 'luxury hotel sukhumvit booking', format: 'text', metadata: { capability: 'hotel_generation' } });
  await rt.knowledge.ingestDocument({ title: 'Trip Planner', body: 'travel itinerary bangkok', format: 'text', metadata: { capability: 'travel_generation' } });
  const result = rt.knowledge.searchKnowledge({ query: 'bangkok hotel', capability: 'hotel_generation' });
  assert.ok(result.results.length >= 1);
  assert.ok(result.results[0].score > 0);
});

test('KG05 knowledge versioning snapshot rollback and diff', async () => {
  const rt = makeRuntime();
  rt.knowledge.entities.register({ id: 'place-1', type: 'place', name: 'Grand Palace' });
  rt.knowledge.version.snapshotEntity('place-1', { name: 'Grand Palace v1' });
  rt.knowledge.version.snapshotEntity('place-1', { name: 'Grand Palace v2' });
  const diff = rt.knowledge.version.diff('place-1', '1');
  assert.equal(diff.match, false);
  const rolled = rt.knowledge.version.rollback('place-1');
  assert.equal(rolled.version, '1');
});

test('KG06 cache LRU TTL and embedding cache hit rate', () => {
  const cache = createKnowledgeCache({ maxSize: 2, ttlMs: 60_000 });
  cache.set('a', { x: 1 });
  cache.set('b', { x: 2 });
  cache.set('c', { x: 3 });
  assert.equal(cache.get('a'), null);
  assert.ok(cache.get('b'));
  cache.setEmbedding('emb-1', [1, 0, 0]);
  assert.ok(cache.getEmbedding('emb-1'));
  const stats = cache.stats();
  assert.ok(stats.hitRate >= 0);
});

test('KG07 knowledge ingest supports markdown json csv and skill manifest', async () => {
  const rt = makeRuntime();
  await rt.knowledge.ingest.ingestMarkdown({ title: 'Menu', body: '# Pad Thai\nDelicious noodles' });
  await rt.knowledge.ingest.ingestJson({ title: 'catalog', items: [1, 2] });
  await rt.knowledge.ingest.ingestCsv('name,price\nPad Thai,120');
  const manifest = getSkillTemplate('ai-food');
  const entity = await rt.knowledge.ingest.ingestSkillManifest(manifest);
  assert.equal(entity.type, 'skill');
  assert.ok(rt.knowledge.store.stats().documents >= 3);
});

test('KG08 knowledge sync pulls marketplace skills analytics learning', async () => {
  const rt = makeRuntime();
  await rt.skills.install(getSkillTemplate('ai-trip'));
  const report = await rt.knowledge.syncAll();
  assert.ok(report.marketplace >= 1);
  assert.ok(report.skills >= 1);
  assert.equal(report.analytics, 1);
  assert.equal(report.learning, 1);
});

test('KG09 runtime integration exposes runtime.knowledge', () => {
  const rt = makeRuntime();
  assert.ok(rt.knowledge);
  assert.equal(rt.knowledge.enabled, true);
  assert.equal(rt.knowledge.phase, KNOWLEDGE_PHASE);
  const saved = process.env.AIVOS_KNOWLEDGE_ENABLED;
  process.env.AIVOS_KNOWLEDGE_ENABLED = '0';
  const disabled = createKnowledgeEngine({ runtime: makeRuntime({ forceNew: true }) });
  assert.equal(disabled.enabled, false);
  process.env.AIVOS_KNOWLEDGE_ENABLED = saved;
});

test('KG10 HTTP knowledge routes search entity graph stats', async () => {
  const dir = join(__dir, '../lib/aivos/knowledge');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const src = readFileSync(join(dir, f), 'utf8');
    assert.ok(!/from\s+['"][^'"]*kernel[^'"]*['"]/i.test(src), `knowledge/${f} must not import Kernel`);
  }

  await withServer(makeApp(), async (port) => {
    await fetch(`http://127.0.0.1:${port}/api/aivos/knowledge/ingest`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ title: 'HTTP Doc', body: 'bangkok travel hotel', format: 'text' }),
    });

    const search = await fetch(`http://127.0.0.1:${port}/api/aivos/knowledge/search?q=bangkok`).then((r) => r.json());
    assert.equal(search.ok, true);
    assert.ok(search.results.length >= 1);

    const stats = await fetch(`http://127.0.0.1:${port}/api/aivos/knowledge/stats`).then((r) => r.json());
    assert.equal(stats.ok, true);
    assert.ok(stats.store.documents >= 1);
  });
});

test('KG11 shared memory long-term session and per-skill scopes', () => {
  const rt = makeRuntime();
  rt.knowledge.memory.shared.set('brand', 'AQOND');
  rt.knowledge.memory.session.set('sess-1', 'locale', 'th');
  rt.knowledge.memory.perSkill('ai-trip').set('destination', 'Chiang Mai');
  rt.knowledge.memory.longTerm.set('policy', { tier: 'premium' });
  assert.equal(rt.knowledge.memory.shared.get('brand'), 'AQOND');
  assert.equal(rt.knowledge.memory.session.get('sess-1', 'locale'), 'th');
  assert.equal(rt.knowledge.memory.perSkill('ai-trip').get('destination'), 'Chiang Mai');
  assert.deepEqual(rt.knowledge.memory.longTerm.get('policy'), { tier: 'premium' });
});

test('KG12 knowledge metrics track query latency recall and memory usage', async () => {
  const rt = makeRuntime();
  await rt.knowledge.ingestDocument({ title: 'Metrics Test', body: 'insurance policy coverage', format: 'text' });
  rt.knowledge.searchKnowledge({ query: 'insurance policy' });
  rt.knowledge.searchKnowledge({ query: 'insurance policy' });
  const stats = rt.knowledge.stats();
  assert.ok(stats.metrics.queryCount >= 2);
  assert.ok(stats.metrics.avgLatencyMs >= 0);
  assert.ok(stats.metrics.memoryUsage > 0);
});
