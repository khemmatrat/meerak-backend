export function registerIntegrationRoutes(app, { integrations, authenticateToken, integrationEnabled } = {}) {
  const auth = authenticateToken || ((_q, _s, n) => n());

  if (!integrationEnabled || !integrations?.enabled) {
    app.use('/api/aivos/integration', (_req, res) => {
      res.status(503).json({ error: 'aivos_integration_disabled', hint: 'Set AIVOS_INTEGRATION_ENABLED=1' });
    });
    return { enabled: false };
  }

  app.get('/api/aivos/integration/connectors', auth, (req, res) => {
    const tenantId = req.query.tenantId || req.user?.tenantId || 'default';
    res.json({
      ok: true,
      catalog: integrations.listTemplates(),
      installed: integrations.registry.list({ tenantId }),
    });
  });

  app.get('/api/aivos/integration/metrics', auth, (req, res) => {
    res.json({
      ok: true,
      metrics: integrations.getMetrics({
        connectorId: req.query.connectorId || undefined,
        tenantId: req.query.tenantId || undefined,
      }),
      audit: integrations.audit.summary(),
    });
  });

  app.get('/api/aivos/integration/health', auth, (req, res) => {
    res.json({
      ok: true,
      health: integrations.getHealth({ tenantId: req.query.tenantId || undefined }),
    });
  });

  app.post('/api/aivos/integration/install', auth, async (req, res) => {
    try {
      const manifest = req.body?.manifest || integrations.getTemplate(req.body?.connectorId);
      const tenantId = req.body?.tenantId || req.user?.tenantId || 'default';
      const v = integrations.validate(manifest);
      if (!v.ok) return res.status(400).json({ ok: false, errors: v.errors });
      integrations.gateway.validateRequest({ tenantId, apiKey: req.body?.apiKey, jwt: req.body?.jwt });
      const result = await integrations.install(v.manifest, {
        tenantId,
        userId: req.user?.id,
        secret: req.body?.secret,
      });
      integrations.registry.enable(v.manifest.id, { tenantId });
      integrations.metrics.record({ connectorId: v.manifest.id, tenantId, action: 'install', success: true });
      res.status(201).json({ ok: true, connector: result });
    } catch (e) {
      res.status(mapIntegrationError(e)).json({ error: e.code || e.message, details: e.details || null });
    }
  });

  app.post('/api/aivos/integration/uninstall', auth, async (req, res) => {
    try {
      const { connectorId, tenantId } = req.body || {};
      const result = await integrations.uninstall(connectorId, { tenantId: tenantId || 'default' });
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(404).json({ error: e.message });
    }
  });

  app.post('/api/aivos/integration/upgrade', auth, (req, res) => {
    try {
      const { connectorId, tenantId, manifest } = req.body || {};
      const next = manifest || integrations.getTemplate(connectorId);
      const v = integrations.validate({ ...next, version: req.body?.version || next.version });
      const result = integrations.upgrade(connectorId, v.manifest, { tenantId: tenantId || 'default' });
      res.json({ ok: true, connector: result });
    } catch (e) {
      res.status(mapIntegrationError(e)).json({ error: e.code || e.message });
    }
  });

  app.post('/api/aivos/integration/rollback', auth, (req, res) => {
    try {
      const { connectorId, tenantId } = req.body || {};
      const result = integrations.rollback(connectorId, { tenantId: tenantId || 'default' });
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(400).json({ error: e.code || e.message });
    }
  });

  app.post('/api/aivos/integration/execute', auth, async (req, res) => {
    try {
      const { connectorId, tenantId, input } = req.body || {};
      integrations.gateway.validateRequest({
        tenantId,
        apiKey: req.body?.apiKey,
        jwt: req.body?.jwt,
        actorTenantId: req.user?.tenantId,
      });
      const result = await integrations.execute(connectorId, {
        tenantId: tenantId || 'default',
        userId: req.user?.id,
        input: input || {},
      });
      res.status(201).json({ ok: true, ...result });
    } catch (e) {
      res.status(mapIntegrationError(e)).json({ error: e.code || e.message });
    }
  });

  app.post('/api/aivos/integration/oauth', auth, async (req, res) => {
    try {
      const { connectorId, tenantId, provider, scopes, code } = req.body || {};
      const result = await integrations.oauth.authorize({
        connectorId,
        tenantId: tenantId || 'default',
        provider,
        scopes: scopes || [],
        code,
      });
      res.status(201).json({ ok: true, ...result });
    } catch (e) {
      res.status(mapIntegrationError(e)).json({ error: e.code || e.message });
    }
  });

  app.post('/api/aivos/integration/refresh', auth, async (req, res) => {
    try {
      const { connectorId, tenantId } = req.body || {};
      const result = await integrations.oauth.refresh({ connectorId, tenantId: tenantId || 'default' });
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(mapIntegrationError(e)).json({ error: e.code || e.message });
    }
  });

  app.post('/api/aivos/integration/webhook', auth, async (req, res) => {
    try {
      const { connectorId, tenantId, payload, signature, secret, eventId } = req.body || {};
      const result = await integrations.webhook.receive({
        connectorId,
        tenantId: tenantId || 'default',
        payload: payload || req.body,
        signature,
        secret,
        eventId,
      });
      res.status(201).json({ ok: true, ...result });
    } catch (e) {
      res.status(mapIntegrationError(e)).json({ error: e.code || e.message });
    }
  });

  return { enabled: true };
}

function mapIntegrationError(err) {
  const code = err?.code || '';
  if (code === 'CONNECTOR_DEPENDENCY_GAP') return 422;
  if (code === 'CONNECTOR_NOT_FOUND' || code === 'CONNECTOR_NOT_ENABLED') return 404;
  if (code === 'OAUTH_TENANT_MISMATCH' || code === 'TENANT_MISMATCH') return 403;
  if (code === 'WEBHOOK_SIGNATURE_INVALID' || code === 'WEBHOOK_REPLAY_DETECTED') return 401;
  if (code === 'API_KEY_INVALID' || code === 'JWT_INVALID') return 401;
  if (code === 'GATEWAY_RATE_LIMIT') return 429;
  if (code === 'CONNECTOR_NO_ROLLBACK_TARGET') return 400;
  return 500;
}
