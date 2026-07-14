export function registerTenantRoutes(app, { tenants, authenticateToken, tenantEnabled } = {}) {
  const auth = authenticateToken || ((_q, _s, n) => n());

  if (!tenantEnabled || !tenants?.enabled) {
    app.use('/api/aivos/tenants', (_req, res) => {
      res.status(503).json({ error: 'aivos_tenant_disabled', hint: 'Set AIVOS_TENANT_ENABLED=1' });
    });
    return { enabled: false };
  }

  app.get('/api/aivos/tenants/list', auth, (req, res) => {
    const { state, plan } = req.query || {};
    res.json({ ok: true, tenants: tenants.registry.list({ state, plan }) });
  });

  app.get('/api/aivos/tenants/metrics', auth, (req, res) => {
    res.json({
      ok: true,
      metrics: tenants.getMetrics({ tenantId: req.query.tenantId || undefined }),
      audit: tenants.audit.summary(),
    });
  });

  app.get('/api/aivos/tenants/:tenantId', auth, (req, res) => {
    try {
      const row = tenants.isolation.assertAccess(req.params.tenantId, {
        actorTenantId: req.user?.tenantId || req.params.tenantId,
        action: 'read',
      });
      res.json({ ok: true, tenant: row });
    } catch (e) {
      res.status(mapTenantError(e)).json({ error: e.code || e.message });
    }
  });

  app.post('/api/aivos/tenants/validate', auth, (req, res) => {
    const result = tenants.validate(req.body?.manifest || req.body);
    res.json({ ok: result.ok, ...result });
  });

  app.post('/api/aivos/tenants/create', auth, async (req, res) => {
    try {
      const v = tenants.validate(req.body?.manifest || req.body);
      if (!v.ok) return res.status(400).json({ ok: false, errors: v.errors });
      const result = await tenants.create(v.manifest, { ownerId: req.user?.id || req.body?.ownerId });
      tenants.metrics.record({ tenantId: v.manifest.id, action: 'create', success: true });
      res.status(201).json({ ok: true, tenant: result });
    } catch (e) {
      res.status(mapTenantError(e)).json({ error: e.code || e.message });
    }
  });

  app.post('/api/aivos/tenants/provision', auth, async (req, res) => {
    try {
      const v = tenants.validate(req.body?.manifest || req.body);
      if (!v.ok) return res.status(400).json({ ok: false, errors: v.errors });
      const result = await tenants.provision(v.manifest, {
        ownerId: req.user?.id || req.body?.ownerId,
        settings: req.body?.settings || {},
        installApps: req.body?.installApps || [],
      });
      tenants.metrics.record({ tenantId: v.manifest.id, action: 'provision', success: true });
      res.status(201).json({ ok: true, ...result });
    } catch (e) {
      res.status(mapTenantError(e)).json({ error: e.code || e.message });
    }
  });

  app.post('/api/aivos/tenants/suspend', auth, (req, res) => {
    try {
      const { tenantId } = req.body || {};
      res.json({ ok: true, tenant: tenants.suspend(tenantId) });
    } catch (e) {
      res.status(mapTenantError(e)).json({ error: e.code || e.message });
    }
  });

  app.post('/api/aivos/tenants/restore', auth, (req, res) => {
    try {
      const { tenantId } = req.body || {};
      res.json({ ok: true, tenant: tenants.restore(tenantId) });
    } catch (e) {
      res.status(mapTenantError(e)).json({ error: e.code || e.message });
    }
  });

  app.post('/api/aivos/tenants/delete', auth, async (req, res) => {
    try {
      const { tenantId } = req.body || {};
      const result = await tenants.deprovision(tenantId);
      res.json({ ok: true, tenant: result });
    } catch (e) {
      res.status(mapTenantError(e)).json({ error: e.code || e.message });
    }
  });

  app.post('/api/aivos/tenants/execute', auth, async (req, res) => {
    try {
      const { tenantId, appId, input } = req.body || {};
      const result = await tenants.executeApp(appId, {
        tenantId,
        userId: req.user?.id,
        input: input || {},
      });
      res.status(201).json({ ok: true, ...result });
    } catch (e) {
      res.status(mapTenantError(e)).json({ error: e.code || e.message, details: e.details || null });
    }
  });

  app.post('/api/aivos/tenants/backup', auth, (req, res) => {
    try {
      const { tenantId } = req.body || {};
      const result = tenants.backup.create(tenantId);
      res.status(201).json({ ok: true, ...result });
    } catch (e) {
      res.status(mapTenantError(e)).json({ error: e.code || e.message });
    }
  });

  app.post('/api/aivos/tenants/backup/restore', auth, (req, res) => {
    try {
      const { backupId, newTenantId } = req.body || {};
      const result = tenants.backup.restore(backupId, { newTenantId });
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(mapTenantError(e)).json({ error: e.code || e.message });
    }
  });

  return { enabled: true };
}

function mapTenantError(err) {
  const code = err?.code || '';
  if (code === 'TENANT_ALREADY_EXISTS') return 409;
  if (code === 'TENANT_NOT_FOUND' || code === 'TENANT_DELETED') return 404;
  if (code === 'TENANT_SUSPENDED' || code === 'TENANT_ISOLATION_VIOLATION' || code === 'TENANT_MISMATCH') return 403;
  if (code === 'TENANT_QUOTA_EXCEEDED' || code === 'TENANT_RATE_LIMIT_EXCEEDED') return 429;
  if (code === 'TENANT_SUBSCRIPTION_NOT_FOUND') return 402;
  if (code === 'APPLICATION_NOT_ENABLED' || code === 'APPLICATION_NOT_FOUND') return 404;
  return 500;
}
