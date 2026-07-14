/**
 * Admin route 2 — Ads operations namespace (/api/ads-admin/*)
 */
import {
  getAdsReportingSummary,
  getAdCampaign,
  getAdCampaignInsights,
  isAdsBridgeConfigured,
  listAdCampaigns,
  listPendingAdCreatives,
  moderateAdCreative,
  setAdCampaignLifecycle,
  seedHouseAds,
} from './adsBridgeClient.js';
import { refundAdCampaignWallet as refundWallet } from './adsCampaignBilling.js';
import { buildAdsReconciliationReport } from './adsReconciliation.js';
import { listRecentFraudBlocks } from './adsFraudSignals.js';
import { getCircuitHealth } from './adsCircuitBreaker.js';
import { getRolloutConfig } from './adsRollout.js';
import { getAdsOutboxStats } from './adsEventOutbox.js';
import { getAdsScaleSchedulerHeartbeat } from './adsScaleScheduler.js';
import { listOutcomeBillableLog, reverseOutcomeBillable, rejectOutcomeDispute } from './adsOutcomeBilling.js';
import { getAdsWarehouseSummary, processAdsOutboxBatch } from './adsOutboxConsumer.js';
import { getAdCampaignInsightsV2 } from './adsBridgeClient.js';
import { getAdsPopulationSummary } from './adsPopulationAdmin.js';
import { getAdsAdminBenchmarks } from './adsAdminBenchmarks.js';
import { runAdsOptimizationBatch } from './adsOptimizationRunner.js';

const ADS_ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'ADS_MANAGER']);

function adsAdminMiddleware(adminAuthMiddleware) {
  return (req, res, next) => {
    adminAuthMiddleware(req, res, (err) => {
      if (err) return next(err);
      const role = String(req.adminUser?.role || '').toUpperCase();
      if (!ADS_ADMIN_ROLES.has(role)) {
        return res.status(403).json({ error: 'Ads admin access required' });
      }
      next();
    });
  };
}

export function attachAdsAdminRoutes(app, deps) {
  const { pool, adminAuthMiddleware, resolveUserIdToUuid, redisClient } = deps;
  const guard = adsAdminMiddleware(adminAuthMiddleware);

  app.get('/api/ads-admin/health', guard, (_req, res) => {
    res.json({ ok: true, configured: isAdsBridgeConfigured() });
  });

  app.get('/api/ads-admin/summary', guard, async (req, res) => {
    try {
      if (!isAdsBridgeConfigured()) {
        return res.json({ configured: false, summary: null });
      }
      const rangeDays = parseInt(req.query.rangeDays || req.query.range || '7', 10) || 7;
      const summary = await getAdsReportingSummary(rangeDays);
      res.json({ configured: true, summary });
    } catch (e) {
      console.error('GET /api/ads-admin/summary:', e);
      res.status(502).json({ error: e.message });
    }
  });

  app.get('/api/ads-admin/campaigns', guard, async (req, res) => {
    try {
      if (!isAdsBridgeConfigured()) return res.json({ campaigns: [], configured: false });
      const data = await listAdCampaigns(parseInt(req.query.limit, 10) || 100);
      res.json({ ...data, configured: true });
    } catch (e) {
      res.status(502).json({ error: e.message, campaigns: [] });
    }
  });

  app.get('/api/ads-admin/campaigns/:id', guard, async (req, res) => {
    try {
      const data = await getAdCampaign(req.params.id);
      res.json(data);
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  app.get('/api/ads-admin/campaigns/:id/insights', guard, async (req, res) => {
    try {
      const data = await getAdCampaignInsights(req.params.id);
      res.json(data);
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  app.patch('/api/ads-admin/campaigns/:id/lifecycle', guard, async (req, res) => {
    try {
      const state = req.body?.lifecycleState;
      if (!['ACTIVE', 'PAUSED', 'ARCHIVED'].includes(state)) {
        return res.status(400).json({ error: 'invalid lifecycleState' });
      }
      const out = await setAdCampaignLifecycle(req.params.id, state);
      res.json(out);
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  app.get('/api/ads-admin/creatives/pending', guard, async (req, res) => {
    try {
      if (!isAdsBridgeConfigured()) return res.json({ creatives: [], configured: false });
      const data = await listPendingAdCreatives(parseInt(req.query.limit, 10) || 50);
      res.json({ ...data, configured: true });
    } catch (e) {
      res.status(502).json({ error: e.message, creatives: [] });
    }
  });

  app.patch('/api/ads-admin/creatives/:id/moderation', guard, async (req, res) => {
    const client = await pool.connect();
    try {
      const moderationState = req.body?.moderationState;
      if (!['APPROVED', 'REJECTED'].includes(moderationState)) {
        return res.status(400).json({ error: 'invalid moderationState' });
      }
      const out = await moderateAdCreative(
        req.params.id,
        moderationState,
        req.body?.moderationNote,
      );

      if (moderationState === 'REJECTED' && req.body?.refundUserId && req.body?.refundAmountThb) {
        await client.query('BEGIN');
        await refundWallet(client, {
          userId: req.body.refundUserId,
          amountThb: Number(req.body.refundAmountThb),
          originalLedgerId: req.body.originalLedgerId,
          reason: 'creative_rejected',
        });
        await client.query('COMMIT');
      }

      res.json(out);
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      res.status(502).json({ error: e.message });
    } finally {
      client.release();
    }
  });

  app.get('/api/ads-admin/billing/ledger', guard, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
      const r = await pool.query(
        `SELECT id, event_type, payment_id, amount, currency, status, user_id, metadata, created_at
         FROM payment_ledger_audit
         WHERE event_type LIKE 'ad_%'
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit],
      );
      res.json({ entries: r.rows });
    } catch (e) {
      res.status(502).json({ error: e.message, entries: [] });
    }
  });

  app.get('/api/ads-admin/billing/reconciliation', guard, async (req, res) => {
    try {
      const rangeDays = parseInt(req.query.rangeDays || '7', 10) || 7;
      const report = await buildAdsReconciliationReport(pool, { rangeDays });
      res.json({ report });
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  app.get('/api/ads-admin/fraud/recent', guard, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
      const blocks = await listRecentFraudBlocks(redisClient, limit);
      res.json({ blocks });
    } catch (e) {
      res.status(502).json({ error: e.message, blocks: [] });
    }
  });

  app.get('/api/ads-admin/scale/health', guard, async (req, res) => {
    try {
      const { getBullQueueStats } = await import('./queues.js');
      const [circuit, outbox, queues, reconRaw, warehouse] = await Promise.all([
        getCircuitHealth(redisClient),
        getAdsOutboxStats(pool),
        getBullQueueStats(),
        redisClient?.get('ads:recon:last').catch(() => null),
        getAdsWarehouseSummary(pool),
      ]);
      let lastRecon = null;
      if (reconRaw) {
        try {
          lastRecon = JSON.parse(reconRaw);
        } catch {
          lastRecon = null;
        }
      }
      res.json({
        rollout: getRolloutConfig(),
        circuit,
        outbox,
        warehouse,
        queues: queues?.adsCreativeTranscodeQueue || queues,
        scheduler: getAdsScaleSchedulerHeartbeat(),
        lastRecon,
      });
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  app.get('/api/ads-admin/outcomes', guard, async (req, res) => {
    try {
      const campaignId = req.query.campaignId || null;
      const limit = parseInt(req.query.limit, 10) || 50;
      const status = req.query.status || null;
      const outcomes = await listOutcomeBillableLog(pool, { campaignId, limit, status });
      res.json({ outcomes });
    } catch (e) {
      res.status(502).json({ error: e.message, outcomes: [] });
    }
  });

  app.post('/api/ads-admin/outcomes/:id/reverse', guard, async (req, res) => {
    try {
      const adminId = await resolveUserIdToUuid(req.adminUser?.id);
      const out = await reverseOutcomeBillable(pool, {
        outcomeId: req.params.id,
        adminUserId: adminId,
        note: req.body?.note || req.body?.reason,
      });
      if (!out.reversed) return res.status(404).json(out);
      res.json(out);
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  app.post('/api/ads-admin/outcomes/:id/reject', guard, async (req, res) => {
    try {
      const adminId = await resolveUserIdToUuid(req.adminUser?.id);
      const row = await rejectOutcomeDispute(pool, {
        outcomeId: req.params.id,
        adminUserId: adminId,
        note: req.body?.note || req.body?.reason,
      });
      if (!row) return res.status(404).json({ error: 'not_found_or_not_disputed' });
      res.json({ rejected: true, outcome: row });
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  app.get('/api/ads-admin/population', guard, async (req, res) => {
    try {
      const rangeDays = parseInt(req.query.rangeDays, 10) || 7;
      const summary = await getAdsPopulationSummary(pool, { rangeDays });
      res.json(summary);
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  app.get('/api/ads-admin/benchmarks', guard, async (req, res) => {
    try {
      const range = String(req.query.range || '30d');
      const data = await getAdsAdminBenchmarks(range);
      res.json(data);
    } catch (e) {
      res.status(502).json({ error: e.message, benchmarks: [] });
    }
  });

  app.post('/api/ads-admin/optimization/run', guard, async (req, res) => {
    try {
      const dryRun = req.body?.dryRun === true || req.query.dryRun === '1';
      const limit = parseInt(req.body?.limit ?? req.query.limit, 10) || 40;
      const out = await runAdsOptimizationBatch(pool, { limit, dryRun });
      res.json(out);
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  app.get('/api/ads-admin/optimization/log', guard, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
      const campaignId = req.query.campaignId || null;
      const r = await pool.query(
        `SELECT * FROM ad_campaign_optimization_log
         WHERE ($1::text IS NULL OR campaign_id = $1)
         ORDER BY created_at DESC LIMIT $2`,
        [campaignId, limit],
      );
      res.json({ logs: r.rows });
    } catch (e) {
      res.status(502).json({ error: e.message, logs: [] });
    }
  });

  app.post('/api/ads-admin/outbox/process', guard, async (req, res) => {
    try {
      const out = await processAdsOutboxBatch(pool, { limit: parseInt(req.query.limit, 10) || 200 });
      res.json(out);
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  app.get('/api/ads-admin/campaigns/:id/insights/v2', guard, async (req, res) => {
    try {
      const range = String(req.query.range || '7d');
      const data = await getAdCampaignInsightsV2(req.params.id, range);
      res.json(data);
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  app.post('/api/ads-admin/seed-house', guard, async (req, res) => {
    try {
      const platformId =
        req.body?.platformOwnerUserId ||
        process.env.PLATFORM_ADS_OWNER_USER_ID ||
        (await resolveUserIdToUuid(req.adminUser?.id));
      if (!platformId) return res.status(400).json({ error: 'platformOwnerUserId required' });
      const out = await seedHouseAds(platformId);
      res.json(out);
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  /** Summary for admin route 1 (nexus-admin-core) */
  app.get('/api/admin/ads/summary', adminAuthMiddleware, async (req, res) => {
    try {
      if (!isAdsBridgeConfigured()) {
        return res.json({ configured: false, summary: null });
      }
      const range = String(req.query.range || '7d');
      const rangeDays = range.endsWith('d') ? parseInt(range, 10) || 7 : parseInt(range, 10) || 7;
      const summary = await getAdsReportingSummary(rangeDays);
      res.json({ configured: true, summary });
    } catch (e) {
      console.error('GET /api/admin/ads/summary:', e);
      res.status(502).json({ error: e.message });
    }
  });
}
