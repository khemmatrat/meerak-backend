import {
  getPrbConfig,
  updatePrbModuleConfig,
  buildPrbPublicPayload,
  getWalletEligibility,
  getThAddressProvinces,
  getThAddressChildren,
  runOcrExtract,
  createOrder,
  getActiveOrder,
  getOrderHistory,
  getOrderById,
  confirmOrder,
  disputeOrder,
  adminListOrders,
  adminGetOrder,
  adminUpdateOrder,
  buildFairdeePayload,
} from './prbService.js';

export function attachPrbRoutes(app, deps) {
  const { pool, authenticateToken, adminAuthMiddleware } = deps;

  app.get('/api/prb/config', async (_req, res) => {
    try {
      const config = buildPrbPublicPayload(await getPrbConfig(pool));
      res.set('Cache-Control', 'no-store');
      res.json({ ok: true, config });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.get('/api/prb/eligibility', authenticateToken, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'unauthorized' });
      const data = await getWalletEligibility(pool, userId);
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.get('/api/prb/addresses/provinces', async (_req, res) => {
    try {
      const rows = await getThAddressProvinces(pool);
      res.json({ ok: true, provinces: rows });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.get('/api/prb/addresses/children', async (req, res) => {
    try {
      const parentId = req.query.parentId;
      const rows = await getThAddressChildren(pool, parentId);
      res.json({ ok: true, children: rows });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.post('/api/prb/ocr/extract', authenticateToken, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'unauthorized' });
      const { imageUrl } = req.body || {};
      if (!imageUrl) return res.status(400).json({ error: 'imageUrl_required' });
      const data = await runOcrExtract({ imageUrl, userId });
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.post('/api/prb/orders', authenticateToken, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'unauthorized' });
      const result = await createOrder(pool, userId, req.body || {});
      res.json({ ok: true, ...result });
    } catch (e) {
      if (e?.code === 'PRB_VALIDATION') {
        return res.status(400).json({ error: 'validation_failed', details: e.details });
      }
      if (e?.code === 'PRB_WALLET_LOW') {
        return res.status(402).json({ error: 'insufficient_wallet' });
      }
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.get('/api/prb/orders/active', authenticateToken, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'unauthorized' });
      const order = await getActiveOrder(pool, userId);
      res.json({ ok: true, order });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.get('/api/prb/orders/history', authenticateToken, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'unauthorized' });
      const limit = Math.min(50, parseInt(req.query.limit, 10) || 20);
      const orders = await getOrderHistory(pool, userId, limit);
      res.json({ ok: true, orders });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.get('/api/prb/orders/:id', authenticateToken, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'unauthorized' });
      const order = await getOrderById(pool, userId, req.params.id);
      if (!order) return res.status(404).json({ error: 'not_found' });
      res.json({ ok: true, order });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.post('/api/prb/orders/:id/confirm', authenticateToken, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'unauthorized' });
      const result = await confirmOrder(pool, userId, req.params.id);
      res.json(result);
    } catch (e) {
      if (e?.code === 'PRB_NOT_FOUND') return res.status(404).json({ error: 'not_found' });
      if (e?.code === 'PRB_INVALID_STATUS') return res.status(400).json({ error: 'invalid_status' });
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.post('/api/prb/orders/:id/dispute', authenticateToken, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'unauthorized' });
      const order = await disputeOrder(pool, userId, req.params.id, req.body?.reason);
      res.json({ ok: true, order });
    } catch (e) {
      if (e?.code === 'PRB_DISPUTE_FAILED') return res.status(400).json({ error: 'dispute_failed' });
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.get('/api/admin/prb/config', adminAuthMiddleware, async (_req, res) => {
    try {
      const config = buildPrbPublicPayload(await getPrbConfig(pool));
      res.json({ ok: true, config });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.patch('/api/admin/prb/config', adminAuthMiddleware, async (req, res) => {
    try {
      const config = buildPrbPublicPayload(await updatePrbModuleConfig(pool, req.body || {}));
      res.json({ ok: true, config });
    } catch (e) {
      if (e?.code === 'PRB_CONFIG_INVALID') {
        return res.status(400).json({ error: e.message || 'invalid_config' });
      }
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.get('/api/admin/prb/orders', adminAuthMiddleware, async (req, res) => {
    try {
      const rows = await adminListOrders(pool, {
        status: req.query.status,
        botStatus: req.query.bot_status,
        tab: req.query.tab,
        limit: parseInt(req.query.limit, 10) || 100,
        offset: parseInt(req.query.offset, 10) || 0,
      });
      res.json({ ok: true, orders: rows });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.get('/api/admin/prb/orders/disputes', adminAuthMiddleware, async (req, res) => {
    try {
      const rows = await adminListOrders(pool, { tab: 'disputes' });
      res.json({ ok: true, orders: rows });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.get('/api/admin/prb/orders/:id', adminAuthMiddleware, async (req, res) => {
    try {
      const order = await adminGetOrder(pool, req.params.id);
      if (!order) return res.status(404).json({ error: 'not_found' });
      res.json({ ok: true, order });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.get('/api/admin/prb/orders/:id/fairdee-payload', adminAuthMiddleware, async (req, res) => {
    try {
      const order = await adminGetOrder(pool, req.params.id);
      if (!order) return res.status(404).json({ error: 'not_found' });
      const payload = order.fairdee_payload_json || buildFairdeePayload(order);
      res.json({ ok: true, payload });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.patch('/api/admin/prb/orders/:id', adminAuthMiddleware, async (req, res) => {
    try {
      const order = await adminUpdateOrder(pool, req.params.id, req.body || {});
      if (!order) return res.status(404).json({ error: 'not_found' });
      res.json({ ok: true, order });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.post('/api/admin/prb/orders/:id/fairdee-bot-status', adminAuthMiddleware, async (req, res) => {
    try {
      const { status, error: botError } = req.body || {};
      const order = await adminUpdateOrder(pool, req.params.id, {
        fairdee_bot_status: status,
        fairdee_bot_error: botError || null,
      });
      if (!order) return res.status(404).json({ error: 'not_found' });
      res.json({ ok: true, order });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });
}
