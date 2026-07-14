import {
  getGoldLottoConfig,
  updateGoldLottoConfig,
  syncTicketPool,
  freezeTicketPool,
  runGoldLottoDraw,
  publishGoldLottoResults,
  listPublicWinners,
  getUserTicketStats,
  getUserPrizeWins,
  submitWinnerDeliveryAddress,
  confirmWinnerDeliveryReceipt,
  getPublicCampaignSummary,
  getLiveDrawPayload,
  adminListWinners,
  adminUpdateWinner,
  adminListDrawRuns,
  tryAutoDraw,
} from './goldLottoService.js';

export function attachGoldLottoRoutes(app, deps) {
  const { pool, authenticateToken, adminAuthMiddleware } = deps;

  app.get('/api/gold-lotto/campaign', async (_req, res) => {
    try {
      const data = await getPublicCampaignSummary(pool);
      res.json({ ok: true, ...data });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.get('/api/gold-lotto/winners', async (req, res) => {
    try {
      const config = await getGoldLottoConfig(pool);
      const winners = await listPublicWinners(pool, req.query.campaignId || config.campaign_id);
      res.json({ ok: true, winners });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.get('/api/gold-lotto/me', authenticateToken, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'unauthorized' });
      const config = await getGoldLottoConfig(pool);
      const stats = await getUserTicketStats(pool, userId, config.campaign_id);
      res.json({ ok: true, ...stats });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.get('/api/gold-lotto/my-prize', authenticateToken, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'unauthorized' });
      const config = await getGoldLottoConfig(pool);
      const wins = await getUserPrizeWins(pool, userId, config.campaign_id);
      res.json({ ok: true, wins });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.post('/api/gold-lotto/my-prize/delivery', authenticateToken, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'unauthorized' });
      const winner = await submitWinnerDeliveryAddress(pool, userId, req.body || {});
      res.json({ ok: true, winner });
    } catch (e) {
      if (e?.code === 'GOLD_LOTTO_CONSENT_REQUIRED') return res.status(400).json({ error: 'consent_required' });
      if (e?.code === 'GOLD_LOTTO_ADDRESS_INCOMPLETE') return res.status(400).json({ error: 'address_incomplete' });
      if (e?.code === 'GOLD_LOTTO_WINNER_NOT_FOUND') return res.status(404).json({ error: 'not_found' });
      if (e?.code === 'GOLD_LOTTO_DELIVERY_LOCKED') return res.status(400).json({ error: 'delivery_locked' });
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.post('/api/gold-lotto/my-prize/confirm-receipt', authenticateToken, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'unauthorized' });
      const winnerId = req.body?.winnerId;
      if (!winnerId) return res.status(400).json({ error: 'winner_id_required' });
      const winner = await confirmWinnerDeliveryReceipt(pool, userId, winnerId);
      res.json({ ok: true, winner });
    } catch (e) {
      if (e?.code === 'GOLD_LOTTO_WINNER_NOT_FOUND') return res.status(404).json({ error: 'not_found' });
      if (e?.code === 'GOLD_LOTTO_NOT_DELIVERED') return res.status(400).json({ error: 'not_delivered_yet' });
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.get('/api/gold-lotto/draw/:campaignId/live', async (req, res) => {
    try {
      const config = await getGoldLottoConfig(pool);
      if (!config.public_results_enabled) {
        return res.status(403).json({ error: 'not_published' });
      }
      const payload = await getLiveDrawPayload(pool, req.params.campaignId);
      res.json({ ok: true, ...payload });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.get('/api/admin/gold-lotto/config', adminAuthMiddleware, async (_req, res) => {
    try {
      const config = await getGoldLottoConfig(pool);
      const summary = await getPublicCampaignSummary(pool);
      res.json({ ok: true, config, campaign: summary.campaign });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.patch('/api/admin/gold-lotto/config', adminAuthMiddleware, async (req, res) => {
    try {
      const config = await updateGoldLottoConfig(pool, req.body || {});
      const summary = await getPublicCampaignSummary(pool);
      res.json({ ok: true, config, campaign: summary.campaign });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.post('/api/admin/gold-lotto/sync-tickets', adminAuthMiddleware, async (req, res) => {
    try {
      const result = await syncTicketPool(pool, { campaignId: req.body?.campaignId });
      res.json({ ok: true, ...result });
    } catch (e) {
      if (e?.code === 'GOLD_LOTTO_FROZEN') return res.status(400).json({ error: 'campaign_frozen' });
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.post('/api/admin/gold-lotto/freeze', adminAuthMiddleware, async (req, res) => {
    try {
      const result = await freezeTicketPool(pool, { campaignId: req.body?.campaignId });
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.post('/api/admin/gold-lotto/run-draw', adminAuthMiddleware, async (req, res) => {
    try {
      const result = await runGoldLottoDraw(pool, {
        campaignId: req.body?.campaignId,
        triggerType: 'manual',
        adminId: req.adminUser?.id || 'admin',
      });
      res.json({ ok: true, ...result });
    } catch (e) {
      if (e?.code === 'GOLD_LOTTO_NOT_FROZEN') return res.status(400).json({ error: 'campaign_not_frozen' });
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.post('/api/admin/gold-lotto/publish', adminAuthMiddleware, async (req, res) => {
    try {
      const result = await publishGoldLottoResults(pool, { campaignId: req.body?.campaignId });
      res.json({ ok: true, ...result });
    } catch (e) {
      if (e?.code === 'GOLD_LOTTO_NOT_DRAWN') return res.status(400).json({ error: 'campaign_not_drawn' });
      if (e?.code === 'GOLD_LOTTO_NO_WINNERS') return res.status(400).json({ error: 'no_winners' });
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.get('/api/admin/gold-lotto/winners', adminAuthMiddleware, async (req, res) => {
    try {
      const config = await getGoldLottoConfig(pool);
      const winners = await adminListWinners(pool, req.query.campaignId || config.campaign_id);
      res.json({ ok: true, winners });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.patch('/api/admin/gold-lotto/winners/:id', adminAuthMiddleware, async (req, res) => {
    try {
      const winner = await adminUpdateWinner(pool, req.params.id, req.body || {});
      if (!winner) return res.status(404).json({ error: 'not_found' });
      res.json({ ok: true, winner });
    } catch (e) {
      if (e?.code === 'GOLD_LOTTO_INVALID_DELIVERY_STATUS') {
        return res.status(400).json({ error: 'invalid_delivery_status' });
      }
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.get('/api/admin/gold-lotto/draw-runs', adminAuthMiddleware, async (req, res) => {
    try {
      const config = await getGoldLottoConfig(pool);
      const runs = await adminListDrawRuns(pool, req.query.campaignId || config.campaign_id);
      res.json({ ok: true, runs });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.post('/api/admin/gold-lotto/try-auto-draw', adminAuthMiddleware, async (_req, res) => {
    try {
      const result = await tryAutoDraw(pool);
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });
}
