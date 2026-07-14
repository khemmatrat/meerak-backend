export function registerWorkflowRoutes(app, { workflows, authenticateToken, workflowEnabled } = {}) {
  const auth = authenticateToken || ((_q, _s, n) => n());

  if (!workflowEnabled || !workflows?.enabled) {
    app.use('/api/aivos/workflows', (_req, res) => {
      res.status(503).json({ error: 'aivos_workflow_disabled', hint: 'Set AIVOS_WORKFLOW_ENABLED=1' });
    });
    return { enabled: false };
  }

  app.get('/api/aivos/workflows/list', auth, (_req, res) => {
    res.json({ ok: true, workflows: workflows.registry.listWorkflows() });
  });

  app.get('/api/aivos/workflows/templates', auth, (_req, res) => {
    res.json({ ok: true, templates: workflows.listTemplates() });
  });

  app.get('/api/aivos/workflows/library', auth, (_req, res) => {
    res.json({ ok: true, library: workflows.library.list() });
  });

  app.post('/api/aivos/workflows/register', auth, (req, res) => {
    try {
      const manifest = req.body?.manifest || req.body;
      const row = workflows.register(manifest);
      res.status(201).json({ ok: true, workflow: row });
    } catch (e) {
      res.status(mapWorkflowError(e)).json({ error: e.code || e.message, details: e.details || null });
    }
  });

  app.post('/api/aivos/workflows/validate', auth, (req, res) => {
    const manifest = req.body?.manifest || req.body;
    const result = workflows.validate(manifest);
    res.json({ ok: result.ok, ...result });
  });

  app.post('/api/aivos/workflows/compile', auth, async (req, res) => {
    try {
      const manifest = req.body?.manifest || workflows.registry.findWorkflow(req.body?.workflowId)?.manifest;
      if (!manifest) return res.status(400).json({ error: 'manifest_required' });
      const compiled = await workflows.compile(manifest, req.body?.options || {});
      res.json({ ok: true, compiled });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/aivos/workflows/execute', auth, async (req, res) => {
    try {
      const { workflowId, input, manifest } = req.body || {};
      const wfManifest = manifest || workflows.registry.findWorkflow(workflowId)?.manifest;
      if (!wfManifest) return res.status(404).json({ error: 'workflow_not_found' });
      const result = await workflows.execute({ manifest: wfManifest, input, userId: req.user?.id });
      res.status(201).json({ ok: true, ...result });
    } catch (e) {
      res.status(mapWorkflowError(e)).json({ error: e.code || e.message, details: e.details || null });
    }
  });

  app.post('/api/aivos/workflows/enable', auth, (req, res) => {
    try {
      const { workflowId } = req.body || {};
      const row = workflows.registry.enableWorkflow(workflowId);
      res.json({ ok: true, workflow: row });
    } catch (e) {
      res.status(404).json({ error: e.message });
    }
  });

  app.post('/api/aivos/workflows/disable', auth, (req, res) => {
    try {
      const { workflowId } = req.body || {};
      const row = workflows.registry.disableWorkflow(workflowId);
      res.json({ ok: true, workflow: row });
    } catch (e) {
      res.status(404).json({ error: e.message });
    }
  });

  app.post('/api/aivos/workflows/rollback', auth, (req, res) => {
    try {
      const { workflowId } = req.body || {};
      const result = workflows.rollback(workflowId);
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/aivos/workflows/resume', auth, async (req, res) => {
    try {
      const { executionId } = req.body || {};
      if (!executionId) return res.status(400).json({ error: 'executionId_required' });
      const result = await workflows.resume(executionId);
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(mapWorkflowError(e)).json({ error: e.code || e.message });
    }
  });

  app.get('/api/aivos/workflows/metrics', auth, (req, res) => {
    const workflowId = req.query.workflowId || undefined;
    res.json({ ok: true, metrics: workflows.getMetrics({ workflowId }) });
  });

  return { enabled: true };
}

function mapWorkflowError(err) {
  const code = err?.code || '';
  if (code === 'WORKFLOW_DEPENDENCY_GAP' || code === 'WORKFLOW_MANIFEST_INVALID') return 422;
  if (code === 'WORKFLOW_NOT_FOUND' || code === 'WORKFLOW_EXECUTION_NOT_FOUND') return 404;
  return 500;
}
