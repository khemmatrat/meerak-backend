export function registerApplicationRoutes(app, { applications, authenticateToken, applicationEnabled } = {}) {
  const auth = authenticateToken || ((_q, _s, n) => n());

  if (!applicationEnabled || !applications?.enabled) {
    app.use('/api/aivos/apps', (_req, res) => {
      res.status(503).json({ error: 'aivos_application_disabled', hint: 'Set AIVOS_APPLICATION_ENABLED=1' });
    });
    return { enabled: false };
  }

  app.get('/api/aivos/apps/list', auth, (req, res) => {
    const tenantId = req.query.tenantId || req.user?.tenantId || 'default';
    res.json({ ok: true, applications: applications.registry.list({ tenantId }) });
  });

  app.get('/api/aivos/apps/catalog', auth, (_req, res) => {
    res.json({ ok: true, catalog: applications.catalog.list() });
  });

  app.post('/api/aivos/apps/validate', auth, (req, res) => {
    const manifest = req.body?.manifest || req.body;
    const result = applications.validate(manifest);
    res.json({ ok: result.ok, ...result });
  });

  app.post('/api/aivos/apps/install', auth, async (req, res) => {
    try {
      const manifest = req.body?.manifest || applications.getTemplate(req.body?.appId);
      const tenantId = req.body?.tenantId || req.user?.tenantId || 'default';
      const v = applications.validate(manifest);
      if (!v.ok) return res.status(400).json({ ok: false, errors: v.errors });
      const result = await applications.install(v.manifest, { tenantId, userId: req.user?.id });
      applications.metrics.record({ appId: v.manifest.id, tenantId, action: 'install', success: true });
      res.status(201).json({ ok: true, application: result });
    } catch (e) {
      res.status(mapAppError(e)).json({ error: e.code || e.message, details: e.details || null });
    }
  });

  app.post('/api/aivos/apps/uninstall', auth, async (req, res) => {
    try {
      const { appId, tenantId } = req.body || {};
      const result = await applications.uninstall(appId, { tenantId: tenantId || 'default' });
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(404).json({ error: e.message });
    }
  });

  app.post('/api/aivos/apps/enable', auth, (req, res) => {
    try {
      const { appId, tenantId } = req.body || {};
      res.json({ ok: true, application: applications.enable(appId, { tenantId: tenantId || 'default' }) });
    } catch (e) {
      res.status(404).json({ error: e.message });
    }
  });

  app.post('/api/aivos/apps/disable', auth, (req, res) => {
    try {
      const { appId, tenantId } = req.body || {};
      res.json({ ok: true, application: applications.disable(appId, { tenantId: tenantId || 'default' }) });
    } catch (e) {
      res.status(404).json({ error: e.message });
    }
  });

  app.post('/api/aivos/apps/provision', auth, async (req, res) => {
    try {
      const manifest = req.body?.manifest || applications.getTemplate(req.body?.appId);
      const tenantId = req.body?.tenantId || 'default';
      const result = await applications.provision(manifest, { tenantId, userId: req.user?.id, config: req.body?.config || {} });
      res.status(201).json({ ok: true, ...result });
    } catch (e) {
      res.status(mapAppError(e)).json({ error: e.code || e.message, details: e.details || null });
    }
  });

  app.post('/api/aivos/apps/execute', auth, async (req, res) => {
    try {
      const { appId, tenantId, input } = req.body || {};
      const started = Date.now();
      const result = await applications.execute(appId, {
        tenantId: tenantId || 'default',
        userId:   req.user?.id,
        input:    input || {},
      });
      applications.metrics.record({
        appId,
        tenantId: tenantId || 'default',
        action:   'execute',
        success:  true,
        latencyMs: Date.now() - started,
      });
      res.status(201).json({ ok: true, ...result });
    } catch (e) {
      res.status(mapAppError(e)).json({ error: e.code || e.message });
    }
  });

  app.post('/api/aivos/apps/rollback', auth, (req, res) => {
    try {
      const { appId, tenantId } = req.body || {};
      const result = applications.rollback(appId, { tenantId: tenantId || 'default' });
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/aivos/apps/metrics', auth, (req, res) => {
    res.json({
      ok: true,
      metrics: applications.getMetrics({
        appId:    req.query.appId || undefined,
        tenantId: req.query.tenantId || undefined,
      }),
      audit: applications.audit.summary(),
    });
  });

  return { enabled: true };
}

function mapAppError(err) {
  const code = err?.code || '';
  if (code === 'APPLICATION_DEPENDENCY_GAP') return 422;
  if (code === 'APPLICATION_NOT_ENABLED' || code === 'APPLICATION_NOT_FOUND') return 404;
  if (code === 'APPLICATION_WORKFLOW_NOT_FOUND') return 404;
  return 500;
}
