export function registerQaRoutes(app, { qa, authenticateToken, qaEnabled } = {}) {
  const auth = authenticateToken || ((_q, _s, n) => n());

  if (!qaEnabled || !qa?.enabled) {
    app.use('/api/aivos/qa', (_req, res) => {
      res.status(503).json({ error: 'aivos_qa_disabled', hint: 'Set AIVOS_QA_ENABLED=1' });
    });
    return { enabled: false };
  }

  app.get('/api/aivos/qa/health', auth, (_req, res) => {
    const health = qa.health();
    res.status(health.ok ? 200 : 503).json({ ok: health.ok, ...health });
  });

  app.get('/api/aivos/qa/layers', auth, (_req, res) => {
    res.json({ ok: true, ...qa.probeLayers() });
  });

  app.get('/api/aivos/qa/feedback-loop', auth, (_req, res) => {
    res.json({ ok: true, ...qa.probeFeedback() });
  });

  app.get('/api/aivos/qa/routes', auth, (_req, res) => {
    res.json({ ok: true, routes: qa.listRoutes(), count: qa.routeCount() });
  });

  return { enabled: true };
}
