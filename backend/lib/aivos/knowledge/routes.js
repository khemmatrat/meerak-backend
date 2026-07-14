export function registerKnowledgeRoutes(app, { knowledge, authenticateToken, knowledgeEnabled } = {}) {
  const auth = authenticateToken || ((_q, _s, n) => n());

  if (!knowledgeEnabled || !knowledge?.enabled) {
    app.use('/api/aivos/knowledge', (_req, res) => {
      res.status(503).json({ error: 'aivos_knowledge_disabled', hint: 'Set AIVOS_KNOWLEDGE_ENABLED=1' });
    });
    return { enabled: false };
  }

  app.get('/api/aivos/knowledge/search', auth, (req, res) => {
    const { q, capability, limit } = req.query;
    if (!q) return res.status(400).json({ error: 'q_required' });
    const result = knowledge.searchKnowledge({
      query:      q,
      capability: capability || undefined,
      limit:      limit ? Number(limit) : 10,
    });
    res.json({ ok: true, ...result });
  });

  app.get('/api/aivos/knowledge/entity/:id', auth, (req, res) => {
    const entity = knowledge.getEntity(req.params.id);
    if (!entity) return res.status(404).json({ error: 'entity_not_found' });
    res.json({ ok: true, entity });
  });

  app.get('/api/aivos/knowledge/graph', auth, (req, res) => {
    const entityId = req.query.entityId;
    if (!entityId) return res.status(400).json({ error: 'entityId_required' });
    const graph = knowledge.getGraph(entityId, { depth: Number(req.query.depth) || 1 });
    res.json({ ok: true, graph });
  });

  app.post('/api/aivos/knowledge/ingest', auth, async (req, res) => {
    try {
      const { title, body, format, metadata, manifest, source } = req.body || {};
      let result;
      if (source === 'skill_manifest' && manifest) {
        result = await knowledge.ingest.ingestSkillManifest(manifest);
      } else if (source === 'marketplace') {
        result = await knowledge.ingestMarketplace();
      } else {
        result = await knowledge.ingestDocument({ title, body, format, metadata });
      }
      res.status(201).json({ ok: true, result });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/aivos/knowledge/version/:entityId', auth, (req, res) => {
    const versions = knowledge.version.list(req.params.entityId);
    res.json({ ok: true, versions });
  });

  app.post('/api/aivos/knowledge/version/:entityId/rollback', auth, (req, res) => {
    try {
      const result = knowledge.version.rollback(req.params.entityId);
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/aivos/knowledge/stats', auth, (_req, res) => {
    res.json({ ok: true, ...knowledge.stats() });
  });

  return { enabled: true };
}
