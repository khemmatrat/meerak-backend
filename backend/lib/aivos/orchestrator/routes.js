export function registerOrchestratorRoutes(app, { orchestrator, authenticateToken, orchestratorEnabled } = {}) {
  const auth = authenticateToken || ((_q, _s, n) => n());

  if (!orchestratorEnabled || !orchestrator?.enabled) {
    app.use('/api/aivos/orchestrator', (_req, res) => {
      res.status(503).json({ error: 'aivos_orchestrator_disabled', hint: 'Set AIVOS_ORCHESTRATOR_ENABLED=1' });
    });
    return { enabled: false };
  }

  app.post('/api/aivos/orchestrator/execute', auth, async (req, res) => {
    try {
      const { capabilities, intent } = req.body || {};
      const result = await orchestrator.execute({
        capabilities,
        intent: intent || {},
        userId: req.user?.id || null,
      });
      res.status(201).json({ ok: true, ...result });
    } catch (e) {
      res.status(mapOrchestratorError(e)).json({ error: e.code || e.message, details: e.details || null });
    }
  });

  app.get('/api/aivos/orchestrator/timeline', auth, (req, res) => {
    const runId = req.query.runId;
    if (!runId) return res.status(400).json({ error: 'runId_required' });
    const timeline = orchestrator.getTimeline(runId);
    if (!timeline) return res.status(404).json({ error: 'timeline_not_found' });
    res.json({ ok: true, timeline });
  });

  app.get('/api/aivos/orchestrator/agents', auth, (_req, res) => {
    res.json({ ok: true, agents: orchestrator.listAgents() });
  });

  app.get('/api/aivos/orchestrator/metrics', auth, (req, res) => {
    const runId = req.query.runId || undefined;
    res.json({ ok: true, metrics: orchestrator.getMetrics({ runId }) });
  });

  app.post('/api/aivos/orchestrator/resume', auth, async (req, res) => {
    try {
      const { runId } = req.body || {};
      if (!runId) return res.status(400).json({ error: 'runId_required' });
      const result = await orchestrator.resume(runId);
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(mapOrchestratorError(e)).json({ error: e.code || e.message });
    }
  });

  app.post('/api/aivos/orchestrator/cancel', auth, async (req, res) => {
    try {
      const { runId } = req.body || {};
      if (!runId) return res.status(400).json({ error: 'runId_required' });
      const result = await orchestrator.cancel(runId);
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(mapOrchestratorError(e)).json({ error: e.code || e.message });
    }
  });

  return { enabled: true };
}

function mapOrchestratorError(err) {
  const code = err?.code || '';
  if (code === 'ORCHESTRATION_CAPABILITY_GAP') return 422;
  if (code === 'ORCHESTRATION_RUN_NOT_FOUND') return 404;
  if (code === 'AGENT_TIMEOUT' || code === 'AGENT_SUPERVISOR_FAILED') return 504;
  return 500;
}
