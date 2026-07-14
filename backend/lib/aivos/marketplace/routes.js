export function registerMarketplaceRoutes(app, { marketplace, authenticateToken, marketplaceEnabled } = {}) {
  const auth = authenticateToken || ((_q, _s, n) => n());

  if (!marketplaceEnabled || !marketplace?.enabled) {
    app.use('/api/aivos/marketplace', (_req, res) => {
      res.status(503).json({ error: 'aivos_marketplace_disabled', hint: 'Set AIVOS_MARKETPLACE_ENABLED=1' });
    });
    return { enabled: false };
  }

  app.get('/api/aivos/marketplace/plugins', auth, (_req, res) => {
    res.json({ ok: true, plugins: marketplace.listPlugins() });
  });

  app.get('/api/aivos/marketplace/workflows', auth, (_req, res) => {
    res.json({ ok: true, workflows: marketplace.listWorkflows() });
  });

  app.get('/api/aivos/marketplace/installed', auth, async (_req, res) => {
    const installed = await marketplace.listInstalled();
    res.json({ ok: true, installed });
  });

  app.post('/api/aivos/marketplace/install', auth, async (req, res) => {
    try {
      const { packageId, type, version } = req.body || {};
      if (!packageId) return res.status(400).json({ error: 'packageId_required' });
      const result = await marketplace.install({ packageId, type: type || 'plugin', version });
      res.status(201).json({ ok: true, package: result });
    } catch (e) {
      res.status(mapMarketplaceError(e)).json({ error: e.code || e.message, details: e.details || null });
    }
  });

  app.post('/api/aivos/marketplace/enable', auth, async (req, res) => {
    try {
      const { packageId, type } = req.body || {};
      const result = await marketplace.enable({ packageId, type: type || 'plugin' });
      res.json({ ok: true, package: result });
    } catch (e) {
      res.status(mapMarketplaceError(e)).json({ error: e.code || e.message });
    }
  });

  app.post('/api/aivos/marketplace/disable', auth, async (req, res) => {
    try {
      const { packageId, type } = req.body || {};
      const result = await marketplace.disable({ packageId, type: type || 'plugin' });
      res.json({ ok: true, package: result });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/aivos/marketplace/upgrade', auth, async (req, res) => {
    try {
      const { packageId, type, version } = req.body || {};
      const result = await marketplace.upgrade({ packageId, type: type || 'plugin', version });
      res.json({ ok: true, package: result });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/aivos/marketplace/rollback', auth, async (req, res) => {
    try {
      const { packageId, type } = req.body || {};
      const result = await marketplace.rollback({ packageId, type: type || 'plugin' });
      res.json({ ok: true, package: result });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/aivos/marketplace/:type/:id', auth, async (req, res) => {
    try {
      const result = await marketplace.remove({ packageId: req.params.id, type: req.params.type });
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(404).json({ error: e.message });
    }
  });

  return { enabled: true };
}

function mapMarketplaceError(err) {
  const code = err?.code || '';
  if (code === 'CAPABILITY_GAP') return 422;
  if (code === 'MARKETPLACE_PACKAGE_NOT_FOUND') return 404;
  if (code === 'MARKETPLACE_NOT_INSTALLED') return 404;
  return 500;
}
