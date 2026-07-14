import crypto from 'node:crypto';

import {
  activateAdCampaign,
  compareAdCampaigns,
  createAdCampaign,
  createBoostVideoCampaign,
  exportAdCampaignInsights,
  findCampaignCreative,
  getAdCampaign,
  getAdCampaignInsights,
  getAdCampaignInsightsV2,
  getAdsAudienceEstimate,
  getFirstCampaignCreative,
  isAdsBridgeConfigured,
  listAdCampaigns,
  recordAdClick,
  recordAdRenderEvent,
  reserveAdPlacements,
  recordAdBillableSpend,
  seedHouseAds,
  setAdCampaignLifecycle,
  setAdsBridgeRedis,
  updateAdCreativeMetadata,
} from './adsBridgeClient.js';
import {
  AD_CAMPAIGN_PACKAGES,
  chargeAdCampaignWallet,
  getEscrowBySocialCampaignId,
  holdAdCampaignEscrow,
  linkEscrowSocialCampaignId,
  logNonBillableRenderEvent,
  microToThb,
  objectiveToSurfaces,
  releaseAdCampaignEscrow,
} from './adsCampaignBilling.js';
import {
  isDeliverableCreative,
  processCreativeMetadata,
  runRenderPreflight,
} from './adsCreativeProcessing.js';
import { transcodeAdVideoCreative } from './adsCreativeTranscode.js';
import {
  mergeAdsIntoMarketplaceList,
  mergeAdsIntoStoryList,
  mergeAdsIntoVideoFeed,
  viewerCacheKey,
} from './adsFeedMerge.js';
import { creditRenderFailureIfNeeded } from './adsRenderRefund.js';
import { processBillableRenderEvent } from './adsBillableEvents.js';
import { assessClickFraud, recordFraudBlock } from './adsFraudSignals.js';
import { computePacingCaps, hourlyPacingMultiplier } from './adsPacing.js';
import { isFeedInjectionEnabled, isAsyncTranscodeEnabled, isBetaAutoModerateEnabled, getRolloutConfig, validateCampaignSpendRollout } from './adsRollout.js';
import { registerPromoAssetRoute, rewriteSponsoredMediaUrls, toPromoAssetUrl } from './adsMediaProxy.js';
import {
  isBillableRenderEvent,
  isFailedRenderEvent,
  RENDER_EVENT_TYPES,
  trackRenderFail,
} from './adsRenderTelemetry.js';
import {
  refreshAdSlotsAsync,
  resolveAdSlots,
} from './adsSlotCache.js';
import {
  buildAdsTargetingSignals,
  resolveSocialCoreIdentity,
} from './adsTargetingSignals.js';
import { normalizeTargetingRules } from './adsTargetingNormalize.js';
import { recordClickWithAttribution, setOutcomeAttributionDeps } from './adsOutcomeAttribution.js';
import { estimateAdsAudience } from './adsAudienceEstimate.js';
import { sponsoredSlotToPromoBanner } from './adsFeedMerge.js';
import { processAdsOutboxBatch } from './adsOutboxConsumer.js';
import { listOutcomeBillableLog, disputeOutcomeBillable } from './adsOutcomeBilling.js';
import {
  buildOptimizationReport,
  computeCreativeQualityScore,
  getRecentOptimizationAction,
  ensurePrimaryCreativeVariant,
} from './adsOptimization.js';
import { releaseEscrowOnLifecycle } from './adsEscrowLifecycle.js';
import { getCampaignAudienceEngagement } from './adsAudienceEngagement.js';
import { getAdsCohortRetention } from './adsCohortRetention.js';
import { getRealtimeCounters, bumpRealtimeCounter } from './adsRealtimeCounters.js';
import { insightsToCsv } from './adsExportCsv.js';
import { listCampaignVariants, registerCreativeVariant, recordVariantImpression, recordVariantClick, applyAbSplitToSlots, pickAbCreativeId, isSyntheticVariantCreativeId, syncVariantCreativeToSocialCore } from './adsCreativeVariants.js';
import { enrichDailySeriesEscrow } from './adsInsightsEnrichment.js';
import { annotateCompareWinners } from './adsCompareWinners.js';

const BOOST_PACKAGES = {
  starter: { budgetMicro: '50000000', cpmMicro: '6000000', label: 'Starter 50 THB equiv' },
  growth: { budgetMicro: '150000000', cpmMicro: '8000000', label: 'Growth' },
  pro: { budgetMicro: '500000000', cpmMicro: '12000000', label: 'Pro' },
};

export function attachAdsRoutes(app, deps) {
  registerPromoAssetRoute(app);

  const {
    pool,
    redisClient,
    authenticateToken,
    optionalAuth,
    adminAuthMiddleware,
    resolveUserIdToUuid,
    uploadMulter,
    uploadToS3,
  } = deps;

  setAdsBridgeRedis(redisClient);
  setOutcomeAttributionDeps({ redis: redisClient });

  async function reserveWithViewerContext(viewerId, sessionId, body) {
    const scId = await resolveSocialCoreIdentity(pool, viewerId);
    const signals = await buildAdsTargetingSignals(pool, viewerId);
    return reserveAdPlacements({
      ...body,
      viewerIdentityId: scId || undefined,
      meerakViewerId: viewerId || undefined,
      sessionId,
      signals,
      viewerProvince: signals.geographyIso || undefined,
    });
  }

  async function fetchVideoFeedSlots(viewerId, sessionId, count = 3) {
    if (!isAdsBridgeConfigured()) return { slots: [] };
    return reserveWithViewerContext(viewerId, sessionId, { surface: 'VIDEO_FEED', count });
  }

  async function fetchStoryViewerSlots(viewerId, sessionId, count = 2) {
    if (!isAdsBridgeConfigured()) return { slots: [] };
    return reserveWithViewerContext(viewerId, sessionId, { surface: 'STORY_VIEWER', count });
  }

  async function fetchMarketplaceSlots(viewerId, sessionId, count = 2) {
    if (!isAdsBridgeConfigured()) return { slots: [] };
    return reserveWithViewerContext(viewerId, sessionId, { surface: 'MARKETPLACE', count });
  }

  async function fetchSearchSlots(viewerId, sessionId, count = 1) {
    if (!isAdsBridgeConfigured()) return { slots: [] };
    return reserveWithViewerContext(viewerId, sessionId, { surface: 'SEARCH_RESULTS', count });
  }

  async function fetchProfilePromoSlot(viewerId, sessionId) {
    if (!isAdsBridgeConfigured()) return { slots: [] };
    return reserveWithViewerContext(viewerId, sessionId, { surface: 'PROVIDER_PROFILE_PROMO', count: 1 });
  }

  function rewriteMarketplaceProviders(items) {
    if (!Array.isArray(items)) return items || [];
    return items.map((item) => {
      if (item?.mixKind !== 'sponsored') return item;
      const avatar_url = toPromoAssetUrl(item.avatar_url) || item.avatar_url;
      const portfolio_urls = (item.portfolio_urls || []).map(
        (u) => toPromoAssetUrl(u) || u,
      );
      const ad = item.ad
        ? {
            ...item.ad,
            playbackUrl: toPromoAssetUrl(item.ad.playbackUrl) || item.ad.playbackUrl,
            posterUrl: toPromoAssetUrl(item.ad.posterUrl) || item.ad.posterUrl,
            fallbackImageUrl: toPromoAssetUrl(item.ad.fallbackImageUrl) || item.ad.fallbackImageUrl,
            imageUrl: toPromoAssetUrl(item.ad.imageUrl) || item.ad.imageUrl,
          }
        : item.ad;
      return { ...item, avatar_url, portfolio_urls, ad };
    });
  }

  async function deliverAdSlots(slots) {
    const list = Array.isArray(slots) ? slots : [];
    if (!list.length) return [];
    const split = await applyAbSplitToSlots(pool, list).catch(() => list);
    return split.filter((s) => isDeliverableCreative(s.metadata || {}));
  }

  app.injectAdsIntoVideoFeed = async (videos, req, userId) => {
    if (!isAdsBridgeConfigured() || !isFeedInjectionEnabled()) return videos;
    const sessionId =
      String(req.headers['x-session-id'] || req.query.sessionId || '').slice(0, 64) ||
      'default';
    const vKey = viewerCacheKey(userId, sessionId);
    const rawSlots = await resolveAdSlots(redisClient, vKey, 'VIDEO_FEED', sessionId, () =>
      fetchVideoFeedSlots(userId, sessionId, 3),
    );
    const slots = await deliverAdSlots(rawSlots);
    if (redisClient) {
      refreshAdSlotsAsync(redisClient, vKey, 'VIDEO_FEED', sessionId, () =>
        fetchVideoFeedSlots(userId, sessionId, 3),
      );
    }
    return rewriteSponsoredMediaUrls(mergeAdsIntoVideoFeed(videos || [], slots));
  };

  app.injectAdsIntoProviders = async (providers, req, userId) => {
    if (!isAdsBridgeConfigured() || !isFeedInjectionEnabled()) return providers;
    const sessionId =
      String(req.headers['x-session-id'] || req.query.sessionId || '').slice(0, 64) ||
      'default';
    const vKey = viewerCacheKey(userId, sessionId);
    const rawSlots = await resolveAdSlots(redisClient, vKey, 'MARKETPLACE', sessionId, () =>
      fetchMarketplaceSlots(userId, sessionId, 2),
    );
    const slots = await deliverAdSlots(rawSlots);
    if (redisClient) {
      refreshAdSlotsAsync(redisClient, vKey, 'MARKETPLACE', sessionId, () =>
        fetchMarketplaceSlots(userId, sessionId, 2),
      );
    }
    return rewriteMarketplaceProviders(mergeAdsIntoMarketplaceList(providers || [], slots));
  };

  app.injectAdsIntoStories = async (stories, req, viewerId) => {
    if (!isAdsBridgeConfigured() || !isFeedInjectionEnabled()) return stories;
    const sessionId =
      String(req.headers['x-session-id'] || req.query.sessionId || '').slice(0, 64) ||
      'default';
    const vKey = viewerCacheKey(viewerId, sessionId);
    const rawSlots = await resolveAdSlots(redisClient, vKey, 'STORY_VIEWER', sessionId, () =>
      fetchStoryViewerSlots(viewerId, sessionId, 2),
    );
    const slots = await deliverAdSlots(rawSlots);
    if (redisClient) {
      refreshAdSlotsAsync(redisClient, vKey, 'STORY_VIEWER', sessionId, () =>
        fetchStoryViewerSlots(viewerId, sessionId, 2),
      );
    }
    const merged = mergeAdsIntoStoryList(stories, slots);
    return merged.map((s) => {
      if (s?.mixKind !== 'sponsored') return s;
      return {
        ...s,
        media_url: toPromoAssetUrl(s.media_url) || s.media_url,
      };
    });
  };

  app.post('/api/ads/click', optionalAuth, async (req, res) => {
    try {
      if (!isAdsBridgeConfigured()) {
        return res.status(503).json({ error: 'ads_not_configured' });
      }
      const { publicImpressionId, campaignId, advertiserUserId } = req.body || {};
      if (!publicImpressionId) {
        return res.status(400).json({ error: 'publicImpressionId required' });
      }
      const userId = req.user?.id
        ? await resolveUserIdToUuid(req.user.id).catch(() => null)
        : null;
      const sessionId =
        String(req.headers['x-session-id'] || req.body?.sessionId || '').slice(0, 64) || null;
      const fraud = await assessClickFraud(redisClient, {
        userId,
        sessionId,
        ip: req.ip || req.headers['x-forwarded-for'],
        publicImpressionId,
        viewerUserId: userId,
        advertiserUserId,
      });
      if (!fraud.allowed) {
        await recordFraudBlock(redisClient, {
          reason: fraud.reason,
          score: fraud.score,
          publicImpressionId,
          userId,
          sessionId,
          ip: req.ip || req.headers['x-forwarded-for'],
        });
        return res.status(429).json({ error: fraud.reason || 'click_blocked', fraudScore: fraud.score });
      }
      const scId = userId ? await resolveSocialCoreIdentity(pool, userId) : null;
      const out = await recordClickWithAttribution(pool, {
        publicImpressionId,
        meerakUserId: userId,
        campaignId: req.body?.campaignId,
        creativeId: req.body?.creativeId,
        surface: req.body?.surface || 'VIDEO_FEED',
      });
      if (req.body?.campaignId) {
        await bumpRealtimeCounter(redisClient, req.body.campaignId, 'clicks');
        if (req.body?.creativeId) {
          await recordVariantClick(pool, req.body.campaignId, req.body.creativeId);
        }
      }
      if (!out?.publicClickId && scId) {
        const fallback = await recordAdClick({
          publicImpressionId,
          viewerIdentityId: scId || undefined,
          meerakViewerId: userId || undefined,
        });
        res.json({ ...fallback, fraudScore: fraud.score });
        return;
      }
      res.json({ ...out, fraudScore: fraud.score });
    } catch (e) {
      console.error('POST /api/ads/click:', e);
      res.status(502).json({ error: e.message || 'ads_click_failed' });
    }
  });

  app.post('/api/ads/conversion', optionalAuth, async (req, res) => {
    // Outcome billing is server-side only (booking/order hooks) — block client self-billing.
    return res.status(403).json({
      error: 'client_conversion_disabled',
      message: 'Outcome billing is attributed server-side only. Do not POST from mobile client.',
    });
  });

  app.post('/api/ads/render-event', optionalAuth, async (req, res) => {
    const client = await pool.connect();
    try {
      const body = req.body || {};
      const { publicImpressionId, eventType, creativeId, campaignId, surface, reason, cpmMicro } =
        body;
      if (!publicImpressionId || !eventType) {
        return res.status(400).json({ error: 'publicImpressionId and eventType required' });
      }
      if (!RENDER_EVENT_TYPES.has(eventType)) {
        return res.status(400).json({ error: 'invalid eventType' });
      }

      const userId = req.user?.id
        ? await resolveUserIdToUuid(req.user.id).catch(() => null)
        : null;
      const scId = userId ? await resolveSocialCoreIdentity(pool, userId) : null;
      const billable = isBillableRenderEvent(eventType);
      const esc =
        campaignId && (await getEscrowBySocialCampaignId(pool, campaignId).catch(() => null));
      const outcomeOnlyBilling = esc?.billing_model === 'OUTCOME_ONLY';

      let bridgeResult = null;
      let creditResult;
      let billableResult;
      if (isAdsBridgeConfigured()) {
        try {
          bridgeResult = await recordAdRenderEvent({
            publicImpressionId,
            eventType,
            creativeId,
            campaignId,
            surface: surface || 'VIDEO_FEED',
            reason,
            billable,
            viewerIdentityId: scId || undefined,
            meerakViewerId: userId || undefined,
          });
        } catch (bridgeErr) {
          console.warn('POST /api/ads/render-event bridge:', bridgeErr?.message || bridgeErr);
        }
      }
      if (campaignId && eventType === 'ad_rendered') {
        await bumpRealtimeCounter(redisClient, campaignId, 'impressions');
        if (creativeId) {
          await recordVariantImpression(pool, campaignId, creativeId);
        }
      }

      if (billable && !outcomeOnlyBilling && creativeId && campaignId) {
        const pacing = computePacingCaps(
          body.totalBudgetMicro || body.budgetMicro || '0',
          cpmMicro || body.nominalCpmMicro || '8000000',
        );
        const hourlyImpressionCap =
          pacing.dailyImpressionCap != null
            ? Math.max(1, Math.ceil(pacing.dailyImpressionCap / 24))
            : null;
        billableResult = await processBillableRenderEvent(client, redisClient, {
          eventType,
          publicImpressionId,
          creativeId,
          campaignId,
          cpmMicro: cpmMicro || body.nominalCpmMicro,
          userId,
          dailyImpressionCap: body.dailyImpressionCap ?? pacing.dailyImpressionCap,
          hourlyImpressionCap,
        });
      }

      if (isFailedRenderEvent(eventType) && creativeId) {
        const { count } = await trackRenderFail(redisClient, creativeId);
        if (userId) {
          await logNonBillableRenderEvent(client, {
            userId,
            creativeId,
            campaignId,
            reason,
            eventType,
          });
        }
        const credit = await creditRenderFailureIfNeeded(pool, {
          campaignId,
          creativeId,
          failCount: count,
          reason,
          viewerUserId: userId,
        });
        creditResult = credit;
        if (count >= 5) {
          console.warn(
            `[ads] creative ${creativeId} render failures=${count} credit=${credit.credited}`,
          );
        }
      }

      res.json({
        ok: true,
        eventType,
        billable,
        billableResult,
        bridge: bridgeResult,
        credit: creditResult,
        pacingMultiplier: hourlyPacingMultiplier(),
      });
    } catch (e) {
      console.error('POST /api/ads/render-event:', e);
      res.status(500).json({ error: e.message || 'render_event_failed' });
    } finally {
      client.release();
    }
  });

  app.get('/api/ads/packages', authenticateToken, (_req, res) => {
    res.json({
      packages: Object.entries(AD_CAMPAIGN_PACKAGES).map(([key, v]) => ({
        key,
        ...v,
        budgetThb: microToThb(v.budgetMicro),
      })),
      boostPackages: Object.entries(BOOST_PACKAGES).map(([key, v]) => ({
        key,
        ...v,
        budgetThb: microToThb(v.budgetMicro),
      })),
      rollout: getRolloutConfig(),
    });
  });

  app.get('/api/ads/campaigns', authenticateToken, async (req, res) => {
    try {
      if (!isAdsBridgeConfigured()) {
        return res.json({ campaigns: [], configured: false });
      }
      const userId = await resolveUserIdToUuid(req.user?.id);
      if (!userId) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
      const scId = await resolveSocialCoreIdentity(pool, userId);
      const data = await listAdCampaigns(parseInt(req.query.limit, 10) || 50, scId || userId);
      res.json({ ...data, configured: true });
    } catch (e) {
      console.error('GET /api/ads/campaigns:', e);
      res.status(502).json({ error: e.message, campaigns: [] });
    }
  });

  app.get('/api/ads/campaigns/:id', authenticateToken, async (req, res) => {
    try {
      if (!isAdsBridgeConfigured()) return res.status(503).json({ error: 'ads_not_configured' });
      const data = await getAdCampaign(req.params.id);
      res.json(data);
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  app.get('/api/ads/campaigns/:id/insights', authenticateToken, async (req, res) => {
    try {
      if (!isAdsBridgeConfigured()) return res.status(503).json({ error: 'ads_not_configured' });
      const data = await getAdCampaignInsights(req.params.id);
      res.json(data);
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  app.get('/api/ads/campaigns/:id/insights/v2', authenticateToken, async (req, res) => {
    try {
      if (!isAdsBridgeConfigured()) return res.status(503).json({ error: 'ads_not_configured' });
      const range = String(req.query.range || '7d');
      const rangeDays = parseInt(String(range).replace(/\D/g, ''), 10) || 30;
      const data = await getAdCampaignInsightsV2(req.params.id, range);
      const esc = await getEscrowBySocialCampaignId(pool, req.params.id).catch(() => null);
      const geoBreakdown =
        Array.isArray(data.geoBreakdown) && data.geoBreakdown.length
          ? data.geoBreakdown
          : await pool
              .query(
                `SELECT COALESCE(u.province, 'ไม่ระบุ') AS province, COUNT(*)::int AS clicks
                 FROM ad_click_attribution a
                 LEFT JOIN users u ON u.id = a.meerak_user_id
                 WHERE a.campaign_id = $1 AND a.clicked_at > NOW() - INTERVAL '30 days'
                 GROUP BY 1 ORDER BY clicks DESC LIMIT 10`,
                [req.params.id],
              )
              .then((r) => r.rows)
              .catch(() => []);
      const engagementDetail = await getCampaignAudienceEngagement(pool, req.params.id, {
        rangeDays,
      }).catch(() => null);
      const cohortRetention = await getAdsCohortRetention(pool, {
        campaignId: req.params.id,
        rangeDays: Math.max(rangeDays, 30),
      }).catch(() => null);
      const audienceEngagement = await pool
        .query(
          `SELECT COALESCE(u.role, 'unknown') AS role, COUNT(*)::int AS clicks
           FROM ad_click_attribution a
           JOIN users u ON u.id = a.meerak_user_id
           WHERE a.campaign_id = $1 AND a.clicked_at > NOW() - INTERVAL '30 days'
           GROUP BY 1`,
          [req.params.id],
        )
        .then((r) => r.rows)
        .catch(() => []);
      res.json({
        ...data,
        dailySeries: esc
          ? await enrichDailySeriesEscrow(pool, req.params.id, data.dailySeries, esc)
          : data.dailySeries,
        geoBreakdown,
        audienceEngagement,
        audienceEngagementV2: engagementDetail,
        cohortRetention,
        escrow: esc
          ? {
              escrowMicro: String(esc.escrow_micro),
              spentMicro: String(esc.spent_micro),
              remainingMicro: String(BigInt(esc.escrow_micro) - BigInt(esc.spent_micro)),
              status: esc.status,
              billingModel: esc.billing_model,
              outcomeCostMicro: String(esc.outcome_cost_micro),
            }
          : null,
      });
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  app.get('/api/ads/campaigns/compare', authenticateToken, async (req, res) => {
    try {
      if (!isAdsBridgeConfigured()) return res.status(503).json({ error: 'ads_not_configured' });
      const ids = String(req.query.ids || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const data = await compareAdCampaigns(ids);
      res.json(annotateCompareWinners(data));
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  app.get('/api/ads/campaigns/:id/export', authenticateToken, async (req, res) => {
    try {
      if (!isAdsBridgeConfigured()) return res.status(503).json({ error: 'ads_not_configured' });
      const range = String(req.query.range || '30d');
      const format = String(req.query.format || 'json').toLowerCase();
      const data = await exportAdCampaignInsights(req.params.id, range);
      const esc = await getEscrowBySocialCampaignId(pool, req.params.id).catch(() => null);
      const cohortRetention = await getAdsCohortRetention(pool, {
        campaignId: req.params.id,
        rangeDays: 90,
      }).catch(() => null);
      const dailySeries = esc
        ? await enrichDailySeriesEscrow(pool, req.params.id, data.dailySeries, esc)
        : data.dailySeries;
      const payload = { ...data, dailySeries, cohortRetention };
      if (format === 'csv') {
        const csv = insightsToCsv(payload);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="ads-${req.params.id}-${range}.csv"`);
        return res.send(csv);
      }
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="ads-${req.params.id}-${range}.json"`);
      res.json(payload);
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  app.get('/api/ads/campaigns/:id/realtime', authenticateToken, async (req, res) => {
    try {
      const uid = await resolveUserIdToUuid(req.user?.id || req.userId);
      if (!uid) return res.status(401).json({ error: 'unauthorized' });
      const camp = await getAdCampaign(req.params.id).catch(() => null);
      const owner = camp?.campaign?.advertiser || camp?.advertiser;
      if (owner && String(owner) !== String(uid)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const counters = await getRealtimeCounters(redisClient, req.params.id);
      res.json({ campaignId: req.params.id, ...counters, pollIntervalSec: 30 });
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  app.get('/api/ads/campaigns/:id/variants', authenticateToken, async (req, res) => {
    try {
      const uid = await resolveUserIdToUuid(req.user?.id || req.userId);
      if (!uid) return res.status(401).json({ error: 'unauthorized' });
      const variants = await listCampaignVariants(pool, req.params.id);
      res.json({ variants, abActive: variants.length >= 2 });
    } catch (e) {
      res.status(502).json({ error: e.message, variants: [] });
    }
  });

  app.get('/api/ads/campaigns/:id/variants/preview', authenticateToken, async (req, res) => {
    try {
      const uid = await resolveUserIdToUuid(req.user?.id || req.userId);
      if (!uid) return res.status(401).json({ error: 'unauthorized' });
      const camp = await getAdCampaign(req.params.id).catch(() => null);
      const owner = camp?.campaign?.advertiser || camp?.advertiser;
      if (owner && String(owner) !== String(uid)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const defaultCreativeId = getFirstCampaignCreative(camp)?.id || null;
      const n = Math.min(Math.max(parseInt(req.query.n, 10) || 40, 1), 200);
      const counts = {};
      for (let i = 0; i < n; i += 1) {
        const pick = await pickAbCreativeId(pool, req.params.id, defaultCreativeId);
        const key = pick.variantKey || 'A';
        counts[key] = (counts[key] || 0) + 1;
      }
      const variants = await listCampaignVariants(pool, req.params.id);
      res.json({
        campaignId: req.params.id,
        simulations: n,
        distribution: counts,
        abActive: variants.length >= 2,
        variants: variants.map((v) => ({
          variantKey: v.variant_key,
          creativeId: v.creative_id,
          impressions: v.impressions,
        })),
      });
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  app.post('/api/ads/campaigns/:id/variants', authenticateToken, async (req, res) => {
    try {
      const uid = await resolveUserIdToUuid(req.user?.id || req.userId);
      if (!uid) return res.status(401).json({ error: 'unauthorized' });
      const camp = await getAdCampaign(req.params.id).catch(() => null);
      const owner = camp?.campaign?.advertiser || camp?.advertiser;
      if (owner && String(owner) !== String(uid)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const variantKey = String(req.body?.variantKey || 'B').toUpperCase().slice(0, 8);
      let creativeId = req.body?.creativeId;
      let metadata = req.body?.metadata || {};
      if (typeof metadata === 'string') {
        try {
          metadata = JSON.parse(metadata);
        } catch {
          metadata = {};
        }
      }
      if (!creativeId && (metadata.playbackUrl || metadata.imageUrl || metadata.thumbnailUrl)) {
        creativeId = `${req.params.id}-variant-${variantKey}`;
      }
      if (!creativeId) {
        return res.status(400).json({ error: 'creativeId or media metadata required' });
      }
      const enriched = await processCreativeMetadata({
        ...metadata,
        headline: req.body?.headline || metadata.headline,
      });

      const primary = getFirstCampaignCreative(camp);
      let syncedToSocialCore = false;
      if (isSyntheticVariantCreativeId(creativeId)) {
        if (!isAdsBridgeConfigured()) {
          return res.status(503).json({ error: 'ads_not_configured' });
        }
        try {
          const sync = await syncVariantCreativeToSocialCore({
            campaignId: req.params.id,
            variantKey,
            headline: req.body?.headline || enriched.headline || primary?.headline,
            body: req.body?.body || enriched.body || primary?.body,
            metadata: enriched,
            primaryCreative: primary,
            requireModeration: !isBetaAutoModerateEnabled(),
          });
          creativeId = sync.creativeId;
          syncedToSocialCore = true;
        } catch (e) {
          return res.status(502).json({ error: e.message || 'variant_sync_failed' });
        }
      }

      if (primary?.id) {
        await ensurePrimaryCreativeVariant(pool, {
          campaignId: req.params.id,
          creativeId: primary.id,
        });
      }

      const out = await registerCreativeVariant(pool, {
        campaignId: req.params.id,
        creativeId,
        variantKey,
        qualityScore: req.body?.qualityScore,
        metadata: enriched,
      });
      if (!out.ok) return res.status(400).json(out);
      res.json({ ...out, abActive: true, creativeId, syncedToSocialCore, metadata: enriched });
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  app.get('/api/ads/audience/estimate', authenticateToken, async (req, res) => {
    try {
      const provinces = String(req.query.provinces || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const surfaces = String(req.query.surfaces || 'VIDEO_FEED')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const local = await estimateAdsAudience(pool, { provinces, surfaces });
      let remote = null;
      if (isAdsBridgeConfigured()) {
        remote = await getAdsAudienceEstimate({ provinces: provinces.join(','), surfaces: surfaces.join(',') }).catch(
          () => null,
        );
      }
      res.json({ ...local, platform: remote });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/ads/placements/search', optionalAuth, async (req, res) => {
    try {
      if (!isAdsBridgeConfigured() || !isFeedInjectionEnabled()) {
        return res.json({ promo: null, configured: false });
      }
      const userId = req.user?.id ? await resolveUserIdToUuid(req.user.id).catch(() => null) : null;
      const sessionId =
        String(req.headers['x-session-id'] || req.query.sessionId || '').slice(0, 64) || 'default';
      const raw = await fetchSearchSlots(userId, sessionId, 1);
      const slots = (raw?.slots || raw || []).filter((s) => isDeliverableCreative(s.metadata || {}));
      const slot = slots[0];
      if (!slot) return res.json({ promo: null, configured: true });
      const promo = sponsoredSlotToPromoBanner(slot);
      promo.ad = {
        ...promo.ad,
        imageUrl: toPromoAssetUrl(promo.ad?.imageUrl) || promo.ad?.imageUrl,
      };
      res.json({ promo, configured: true });
    } catch (e) {
      res.status(502).json({ error: e.message, promo: null });
    }
  });

  app.get('/api/ads/placements/profile', optionalAuth, async (req, res) => {
    try {
      if (!isAdsBridgeConfigured() || !isFeedInjectionEnabled()) {
        return res.json({ promo: null, configured: false });
      }
      const userId = req.user?.id ? await resolveUserIdToUuid(req.user.id).catch(() => null) : null;
      const sessionId =
        String(req.headers['x-session-id'] || req.query.sessionId || '').slice(0, 64) || 'default';
      const raw = await fetchProfilePromoSlot(userId, sessionId);
      const slots = (raw?.slots || raw || []).filter((s) => isDeliverableCreative(s.metadata || {}));
      const slot = slots[0];
      if (!slot) return res.json({ promo: null, configured: true });
      const promo = sponsoredSlotToPromoBanner(slot);
      promo.ad = {
        ...promo.ad,
        imageUrl: toPromoAssetUrl(promo.ad?.imageUrl) || promo.ad?.imageUrl,
      };
      res.json({ promo, configured: true });
    } catch (e) {
      res.status(502).json({ error: e.message, promo: null });
    }
  });

  app.post('/api/ads/outbox/process', async (req, res) => {
    try {
      const out = await processAdsOutboxBatch(pool, { limit: parseInt(req.query.limit, 10) || 100 });
      res.json(out);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/ads/campaigns/:id/outcomes', authenticateToken, async (req, res) => {
    try {
      const uid = await resolveUserIdToUuid(req.user?.id || req.userId);
      if (!uid) return res.status(401).json({ error: 'unauthorized' });
      const camp = await getAdCampaign(req.params.id).catch(() => null);
      const owner = camp?.campaign?.advertiser || camp?.advertiser;
      if (owner && String(owner) !== String(uid)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const outcomes = await listOutcomeBillableLog(pool, {
        campaignId: req.params.id,
        limit: parseInt(req.query.limit, 10) || 50,
      });
      res.json({ outcomes });
    } catch (e) {
      res.status(500).json({ error: e.message, outcomes: [] });
    }
  });

  app.post('/api/ads/outcomes/:id/dispute', authenticateToken, async (req, res) => {
    try {
      const uid = await resolveUserIdToUuid(req.user?.id || req.userId);
      if (!uid) return res.status(401).json({ error: 'unauthorized' });
      const row = await disputeOutcomeBillable(pool, {
        outcomeId: req.params.id,
        userId: uid,
        reason: req.body?.reason || 'advertiser_dispute',
      });
      if (!row) return res.status(404).json({ error: 'outcome_not_found_or_not_owned' });
      res.json({ success: true, outcome: row });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/ads/campaigns/:id/optimization', authenticateToken, async (req, res) => {
    try {
      if (!isAdsBridgeConfigured()) return res.status(503).json({ error: 'ads_not_configured' });
      const uid = await resolveUserIdToUuid(req.user?.id || req.userId);
      if (!uid) return res.status(401).json({ error: 'unauthorized' });
      const camp = await getAdCampaign(req.params.id).catch(() => null);
      const owner = camp?.campaign?.advertiser || camp?.advertiser;
      if (owner && String(owner) !== String(uid)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const range = String(req.query.range || '30d');
      const [insights, esc] = await Promise.all([
        getAdCampaignInsightsV2(req.params.id, range),
        getEscrowBySocialCampaignId(pool, req.params.id).catch(() => null),
      ]);
      const creative = getFirstCampaignCreative(camp);
      const creativeMeta = creative?.metadata || {};
      const qualityScore = computeCreativeQualityScore(creativeMeta);
      if (creative?.id && qualityScore !== creativeMeta.qualityScore) {
        await updateAdCreativeMetadata(creative.id, { ...creativeMeta, qualityScore }).catch(() => null);
        await ensurePrimaryCreativeVariant(pool, {
          campaignId: req.params.id,
          creativeId: creative.id,
          qualityScore,
        });
      }
      const escrow = esc
        ? {
            escrowMicro: String(esc.escrow_micro),
            spentMicro: String(esc.spent_micro),
            remainingMicro: String(BigInt(esc.escrow_micro) - BigInt(esc.spent_micro)),
            billingModel: esc.billing_model,
            outcomeCostMicro: String(esc.outcome_cost_micro),
          }
        : null;
      const report = buildOptimizationReport({
        insights: { ...insights, campaignId: req.params.id },
        creativeMeta: { ...creativeMeta, qualityScore },
        escrow,
        objective: camp?.campaign?.objective || camp?.objective,
        variants: await listCampaignVariants(pool, req.params.id).catch(() => []),
      });
      const recentWarn = await getRecentOptimizationAction(pool, req.params.id, 'warn_low_cvr', 48);
      const recentPause = await getRecentOptimizationAction(pool, req.params.id, 'auto_paused', 168);
      res.json({
        ...report,
        alerts: {
          lowCvrWarningAt: recentWarn?.created_at || null,
          autoPausedAt: recentPause?.created_at || null,
          autoPausedReason: recentPause?.reason || null,
        },
      });
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  app.patch('/api/ads/campaigns/:id/lifecycle', authenticateToken, async (req, res) => {
    try {
      const state = req.body?.lifecycleState;
      if (!['ACTIVE', 'PAUSED', 'ARCHIVED'].includes(state)) {
        return res.status(400).json({ error: 'invalid lifecycleState' });
      }
      if (state === 'ACTIVE' && isAdsBridgeConfigured()) {
        const camp = await getAdCampaign(req.params.id).catch(() => null);
        const creative = getFirstCampaignCreative(camp);
        if (creative?.moderationState === 'PENDING') {
          return res.status(422).json({
            error: 'creative_pending_moderation',
            message: 'รอทีมงานอนุมัติ creative ก่อนเปิดแคมเปญ',
          });
        }
        if (creative?.moderationState === 'REJECTED') {
          return res.status(422).json({
            error: 'creative_rejected',
            message: 'Creative ไม่ผ่านการตรวจ — อัปโหลดใหม่หรือสร้างแคมเปญใหม่',
          });
        }
        const meta = { ...(creative?.metadata || {}), ...(camp?.campaign?.metadata || {}) };
        const alreadyReady =
          meta.processingStatus === 'READY' && meta.renderPreflightStatus === 'PASS';
        if (!alreadyReady) {
          const preflight = await runRenderPreflight(meta);
          if (preflight.renderPreflightStatus !== 'PASS') {
            return res.status(422).json({
              error: 'creative_not_ready',
              reason: preflight.reason || 'render_preflight_failed',
              processingStatus: meta.processingStatus || 'UNKNOWN',
              message: 'สื่อโฆษณายังไม่พร้อมแสดง — ตรวจไฟล์หรืออัปโหลดใหม่',
            });
          }
        }
      }
      const out = await setAdCampaignLifecycle(req.params.id, state);
      if (['PAUSED', 'ARCHIVED'].includes(state) && isAdsBridgeConfigured()) {
        try {
          await releaseEscrowOnLifecycle(pool, {
            socialCampaignId: req.params.id,
            lifecycleState: state,
          });
        } catch (e) {
          console.warn('[ads] escrow release on lifecycle:', e?.message);
        }
      }
      res.json(out);
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  app.post('/api/ads/campaigns', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
      if (!isAdsBridgeConfigured()) {
        return res.status(503).json({ error: 'ระบบโฆษณายังไม่พร้อม — ตั้งค่า SOCIAL_CORE_API_URL' });
      }
      const userId = await resolveUserIdToUuid(req.user?.id);
      if (!userId) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });

      const body = req.body || {};
      const objective = String(body.objective || 'TRAFFIC').toUpperCase();
      const pack = String(body.package || 'starter').toLowerCase();
      const pkg = AD_CAMPAIGN_PACKAGES[pack] || AD_CAMPAIGN_PACKAGES.starter;
      const budgetMicro = String(body.budgetMicro || body.totalBudgetMicro || pkg.budgetMicro);
      const budgetThb = microToThb(budgetMicro);
      const allowedSurfaces = body.allowedSurfaces?.length
        ? body.allowedSurfaces
        : objectiveToSurfaces(objective);

      const rollout = validateCampaignSpendRollout(budgetThb);
      if (!rollout.allowed) {
        return res.status(403).json({
          error: rollout.reason,
          rollout,
          message:
            rollout.reason === 'beta_spend_cap_exceeded'
              ? `ช่วง Beta จำกัดงบสูงสุด ${rollout.maxThb} บาทต่อแคมเปญ`
              : `ช่วง Internal จำกัดงบสูงสุด ${rollout.maxThb} บาทต่อแคมเปญ`,
        });
      }

      const campaignRef = `ads-${crypto.randomUUID()}`;
      const billingModel = body.billingModel || pkg.billingModel || 'OUTCOME_ONLY';

      await client.query('BEGIN');
      const charge =
        billingModel === 'OUTCOME_ONLY'
          ? await holdAdCampaignEscrow(client, {
              userId,
              amountThb: budgetThb,
              campaignRef,
              outcomeCostMicro: pkg.outcomeCostMicro,
              metadata: { objective, package: pack, billing_model: billingModel },
            })
          : await chargeAdCampaignWallet(client, {
              userId,
              amountThb: budgetThb,
              campaignRef,
              metadata: { objective, package: pack, billing_model: billingModel },
            });
      if (!charge.ok) {
        await client.query('ROLLBACK');
        return res.status(402).json({
          error: 'ยอดในกระเป๋าไม่พอ',
          required: charge.required,
          balance: charge.balance,
        });
      }

      const scId = await resolveSocialCoreIdentity(pool, userId);
      const u = await client.query(`SELECT full_name, email FROM users WHERE id = $1::uuid`, [userId]);
      const displayName = u.rows?.[0]?.full_name || u.rows?.[0]?.email || 'Advertiser';

      const creativeMeta = body.metadata || {};
      if (body.playbackUrl) creativeMeta.playbackUrl = body.playbackUrl;
      if (body.thumbnailUrl) creativeMeta.thumbnailUrl = body.thumbnailUrl;
      if (body.imageUrl) creativeMeta.imageUrl = body.imageUrl;
      if (body.contentKind) creativeMeta.contentKind = body.contentKind;
      if (body.contentId) creativeMeta.contentId = body.contentId;
      if (body.processingStatus) creativeMeta.processingStatus = body.processingStatus;
      if (body.renderPreflightStatus) creativeMeta.renderPreflightStatus = body.renderPreflightStatus;
      if (body.processingReason) creativeMeta.processingReason = body.processingReason;
      if (body.renderPreflightReason) creativeMeta.renderPreflightReason = body.renderPreflightReason;

      const hasMediaUrl =
        creativeMeta.playbackUrl || creativeMeta.imageUrl || creativeMeta.thumbnailUrl;
      if (!hasMediaUrl) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'creative_required',
          message: 'กรุณาอัปโหลดรูปหรือวิดีโอก่อนสร้างแคมเปญ',
        });
      }

      const enrichedMeta =
        creativeMeta.processingStatus === 'READY' &&
        creativeMeta.renderPreflightStatus === 'PASS'
          ? creativeMeta
          : await processCreativeMetadata(creativeMeta);
      const pacing = computePacingCaps(budgetMicro, body.cpmMicro || pkg.cpmMicro);

      const normalizedTargeting = normalizeTargetingRules(body.targetingRules || {});

      const autoModerate = isBetaAutoModerateEnabled();

      const campaign = await createAdCampaign({
        ownerUserId: scId || userId,
        displayName,
        title: String(body.title || 'แคมเปญโฆษณา').slice(0, 240),
        dailyBudgetMicro: budgetMicro,
        totalBudgetMicro: budgetMicro,
        nominalCpmMicro: String(body.cpmMicro || pkg.cpmMicro),
        dailyImpressionCap: pacing.dailyImpressionCap,
        allowedSurfaces,
        objective,
        targetingRules: normalizedTargeting,
        scheduledStartAt: body.scheduledStartAt || null,
        scheduledEndAt: body.scheduledEndAt || null,
        requireModeration: !autoModerate,
        startAsDraft: false,
        headline: String(body.headline || body.title || 'โฆษณา').slice(0, 280),
        body: String(body.body || body.description || ''),
        destinationUrl: String(body.destinationUrl || '/'),
        promotedProviderUserId: body.promotedProviderUserId || userId,
        metadata: enrichedMeta,
        campaignMetadata: {
          meerakCampaignRef: campaignRef,
          billingLedgerId: charge.ledgerId,
          billingModel,
          outcomeCostMicro: pkg.outcomeCostMicro || '50000',
          objective,
          processingStatus: enrichedMeta.processingStatus,
          renderPreflightStatus: enrichedMeta.renderPreflightStatus,
          dailyImpressionCap: pacing.dailyImpressionCap,
          estimatedTotalImpressions: pacing.totalImpressions,
        },
      });

      await linkEscrowSocialCampaignId(client, campaignRef, campaign.campaignId).catch(() => null);

      let activated = false;
      if (enrichedMeta.processingStatus === 'READY' && enrichedMeta.renderPreflightStatus === 'PASS') {
        await activateAdCampaign(campaign.campaignId).catch(() => null);
        activated = true;
      }
      await client.query('COMMIT');

      await ensurePrimaryCreativeVariant(pool, {
        campaignId: campaign.campaignId,
        creativeId: campaign.creativeId,
        qualityScore: computeCreativeQualityScore(enrichedMeta),
      }).catch(() => null);

      res.json({
        success: true,
        campaignId: campaign.campaignId,
        creativeId: campaign.creativeId,
        charged: charge.chargedThb || charge.heldThb,
        held: charge.heldThb,
        billingModel,
        ledgerId: charge.ledgerId,
        escrowId: charge.escrowId,
        moderationState: campaign.moderationState,
        processingStatus: enrichedMeta.processingStatus,
        renderPreflightStatus: enrichedMeta.renderPreflightStatus,
        activated,
        betaAutoModerate: autoModerate,
        message: (() => {
          if (!activated) {
            return 'สร้างแคมเปญแล้ว — สื่อยังไม่พร้อมแสดง กรุณาอัปโหลดไฟล์ใหม่หรือรอการประมวลผล';
          }
          const approved =
            autoModerate || String(campaign.moderationState || '').toUpperCase() === 'APPROVED';
          if (approved && billingModel === 'OUTCOME_ONLY') {
            return autoModerate
              ? 'สร้างแคมเปญแล้ว — Creative อนุมัติอัตโนมัติ (Beta) · จ่ายเฉพาะเมื่อมี outcome จริง ครั้งละ 0.05 บาท'
              : 'สร้างแคมเปญแล้ว — จ่ายเฉพาะเมื่อมีลูกค้าจอง/สั่งซื้อจริง ครั้งละ 0.05 บาท';
          }
          if (approved) {
            return 'สร้างแคมเปญแล้ว — พร้อมแสดงโฆษณา';
          }
          return 'สร้างแคมเปญแล้ว — รอการอนุมัติ creative ก่อนแสดงโฆษณา';
        })(),
      });
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      console.error('POST /api/ads/campaigns:', e);
      const msg = String(e?.message || '');
      const code = e?.code || '';
      if (
        code === 'ENOSPC' ||
        msg.includes('ENOSPC') ||
        msg.includes('No space left on device') ||
        msg.includes('disk full') ||
        msg.includes('SQLITE_FULL')
      ) {
        return res.status(507).json({
          error: 'disk_full',
          message: 'พื้นที่ดิสก์เซิร์ฟเวอร์เต็ม — เคลียร์พื้นที่แล้วลองใหม่',
        });
      }
      if (e?.status === 503 || msg === 'ads_not_configured') {
        return res.status(503).json({
          error: 'ads_not_configured',
          message: 'ระบบโฆษณายังไม่พร้อม — ตรวจ SOCIAL_CORE_API_URL',
        });
      }
      if (e?.status >= 400 && e?.status < 500) {
        return res.status(502).json({
          error: 'social_core_rejected',
          message: msg || 'Social Core ปฏิเสธการสร้างแคมเปญ',
          details: e?.data || null,
        });
      }
      if (msg.includes('insufficient') || msg.includes('ad_campaign_escrow')) {
        return res.status(500).json({
          error: 'escrow_failed',
          message: 'ไม่สามารถ hold escrow ได้ — ตรวจ migration 253 และ wallet',
        });
      }
      res.status(500).json({
        error: msg || 'campaign_create_failed',
        message: msg || 'สร้างแคมเปญไม่สำเร็จ',
      });
    } finally {
      client.release();
    }
  });

  if (uploadMulter && uploadToS3) {
    app.post('/api/ads/creative/upload', authenticateToken, uploadMulter.single('media'), async (req, res) => {
      try {
        if (!req.file?.buffer) {
          return res.status(400).json({ error: 'ไม่พบไฟล์ media' });
        }
        const isVideo = (req.file.mimetype || '').startsWith('video/');
        let uploaded;
        let contentKind;
        let playbackUrl;
        let imageUrl;
        let thumbnailUrl;
        let posterUrl = null;
        let transcodeResult = null;

        if (isVideo) {
          if (isAsyncTranscodeEnabled()) {
            const folder = 'public/ads/videos/raw';
            uploaded = await uploadToS3(req.file.buffer, {
              folder,
              filename: `${Date.now()}-${req.file.originalname || 'creative'}`,
              contentType: req.file.mimetype,
            });
            contentKind = 'TALENT_VIDEO';
            playbackUrl = uploaded.url;
            const { enqueueAdsCreativeTranscode } = await import('./queues.js');
            const job = await enqueueAdsCreativeTranscode({
              sourceUrl: uploaded.url,
              contentKind,
              requestedBy: req.user?.id,
            });
            const meta = await processCreativeMetadata({
              contentKind,
              playbackUrl,
              processingStatus: 'PROCESSING',
              processingReason: 'async_transcode_queued',
            });
            return res.json({
              url: uploaded.url,
              contentKind,
              playbackUrl,
              processingStatus: meta.processingStatus,
              processingReason: meta.processingReason,
              renderPreflightStatus: meta.renderPreflightStatus,
              asyncTranscode: true,
              transcodeJobId: job?.jobId || null,
            });
          }

          try {
            transcodeResult = await transcodeAdVideoCreative(req.file.buffer, {
              uploadToS3,
              originalName: req.file.originalname || 'creative.mp4',
            });
          } catch (transcodeErr) {
            console.warn('POST /api/ads/creative/upload transcode failed:', transcodeErr?.message || transcodeErr);
            transcodeResult = { skipped: true, reason: transcodeErr?.code || 'transcode_failed' };
          }
          if (!transcodeResult.skipped && transcodeResult.playbackUrl) {
            playbackUrl = transcodeResult.playbackUrl;
            posterUrl = transcodeResult.posterUrl || null;
            imageUrl = transcodeResult.posterUrl || undefined;
            thumbnailUrl = transcodeResult.posterUrl || undefined;
            uploaded = { url: transcodeResult.playbackUrl };
            contentKind = 'TALENT_VIDEO';
          } else {
            const folder = 'public/ads/videos';
            uploaded = await uploadToS3(req.file.buffer, {
              folder,
              filename: `${Date.now()}-${req.file.originalname || 'creative'}`,
              contentType: req.file.mimetype,
            });
            contentKind = 'TALENT_VIDEO';
            playbackUrl = uploaded.url;
          }
        } else {
          const folder = 'public/ads/images';
          uploaded = await uploadToS3(req.file.buffer, {
            folder,
            filename: `${Date.now()}-${req.file.originalname || 'creative'}`,
            contentType: req.file.mimetype,
          });
          contentKind = 'IMAGE';
          imageUrl = uploaded.url;
          thumbnailUrl = uploaded.url;
        }

        const meta = await processCreativeMetadata({
          contentKind,
          playbackUrl: isVideo ? playbackUrl : undefined,
          imageUrl: !isVideo ? imageUrl : imageUrl,
          thumbnailUrl: thumbnailUrl,
          posterUrl,
        });
        res.json({
          url: uploaded.url,
          contentKind,
          playbackUrl: isVideo ? playbackUrl : undefined,
          imageUrl: !isVideo ? imageUrl : imageUrl,
          thumbnailUrl,
          posterUrl: meta.posterUrl || posterUrl || null,
          processingStatus: meta.processingStatus,
          processingReason: meta.processingReason || null,
          renderPreflightStatus: meta.renderPreflightStatus,
          renderPreflightReason: meta.renderPreflightReason || null,
          transcodeSkipped: isVideo ? transcodeResult?.skipped === true : undefined,
          transcodeSkipReason: isVideo ? transcodeResult?.reason || null : undefined,
        });
      } catch (e) {
        console.error('POST /api/ads/creative/upload:', e);
        const code = e?.code || '';
        if (code === 'ENOSPC' || String(e?.message || '').includes('ENOSPC')) {
          return res.status(507).json({
            error: 'disk_full',
            message: 'พื้นที่ดิสก์เซิร์ฟเวอร์เต็ม — ลองอัปโหลดรูป JPG/PNG แทนวิดีโอ หรือเคลียร์พื้นที่แล้วลองใหม่',
          });
        }
        res.status(500).json({ error: e.message || 'upload_failed' });
      }
    });
  }

  app.post('/api/videos/:id/boost', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
      if (!isAdsBridgeConfigured()) {
        return res.status(503).json({ error: 'ระบบโฆษณายังไม่พร้อม — ตั้งค่า SOCIAL_CORE_API_URL' });
      }
      const userId = await resolveUserIdToUuid(req.user?.id);
      if (!userId) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });

      const videoId = req.params.id;
      const pack = String(req.body?.package || 'starter').toLowerCase();
      const pkg = BOOST_PACKAGES[pack] || BOOST_PACKAGES.starter;
      const budgetMicro = BigInt(req.body?.budgetMicro || pkg.budgetMicro);
      const budgetThb = Number(budgetMicro) / 1_000_000;

      const rollout = validateCampaignSpendRollout(budgetThb);
      if (!rollout.allowed) {
        return res.status(403).json({
          error: rollout.reason,
          rollout,
          message:
            rollout.reason === 'beta_spend_cap_exceeded'
              ? `ช่วง Beta จำกัดงบสูงสุด ${rollout.maxThb} บาทต่อแคมเปญ`
              : `ช่วง Internal จำกัดงบสูงสุด ${rollout.maxThb} บาทต่อแคมเปญ`,
        });
      }

      const v = await client.query(
        `SELECT id, talent_id, video_url, thumbnail_url, title, description, duration_seconds
         FROM talent_videos WHERE id = $1::uuid AND talent_id = $2::uuid`,
        [videoId, userId],
      );
      if (!v.rows?.[0]) {
        return res.status(404).json({ error: 'ไม่พบคลิปหรือไม่ใช่เจ้าของ' });
      }
      const row = v.rows[0];
      const campaignRef = `boost-${videoId}-${Date.now()}`;

      await client.query('BEGIN');
      const charge = await chargeAdCampaignWallet(client, {
        userId,
        amountThb: budgetThb,
        campaignRef,
        metadata: { boost_video_id: videoId, package: pack },
      });
      if (!charge.ok) {
        await client.query('ROLLBACK');
        return res.status(402).json({ error: 'ยอดในกระเป๋าไม่พอ', required: budgetThb, balance: charge.balance });
      }
      await client.query('COMMIT');

      const scId = await resolveSocialCoreIdentity(pool, userId);
      const u = await pool.query(`SELECT full_name, email FROM users WHERE id = $1::uuid`, [userId]);
      const displayName = u.rows?.[0]?.full_name || u.rows?.[0]?.email || 'Talent';

      const campaign = await createBoostVideoCampaign({
        ownerUserId: scId || userId,
        displayName,
        talentVideoId: String(row.id),
        videoUrl: row.video_url,
        thumbnailUrl: row.thumbnail_url || undefined,
        title: row.title || undefined,
        description: row.description || undefined,
        talentId: String(row.talent_id),
        durationSec: row.duration_seconds || undefined,
        budgetMicro: budgetMicro.toString(),
        cpmMicro: pkg.cpmMicro,
        allowedSurfaces: ['VIDEO_FEED'],
      });

      res.json({
        success: true,
        campaignId: campaign.campaignId,
        creativeId: campaign.creativeId,
        charged: budgetThb,
        ledgerId: charge.ledgerId,
        message: 'เริ่มโปรโมตคลิปแล้ว — จะแสดงใน Video Feed ตาม targeting',
      });
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      console.error('POST /api/videos/:id/boost:', e);
      res.status(500).json({ error: e.message || 'boost_failed' });
    } finally {
      client.release();
    }
  });

  app.post('/api/admin/ads/creatives/:id/reprocess', adminAuthMiddleware, async (req, res) => {
    try {
      const body = req.body || {};
      let meta = {
        contentKind: body.contentKind,
        playbackUrl: body.playbackUrl,
        imageUrl: body.imageUrl,
        thumbnailUrl: body.thumbnailUrl,
        posterUrl: body.posterUrl,
      };
      if (!meta.playbackUrl && !meta.imageUrl && isAdsBridgeConfigured()) {
        const camp = body.campaignId
          ? await getAdCampaign(body.campaignId).catch(() => null)
          : null;
        const creative = findCampaignCreative(camp, req.params.id);
        if (creative?.metadata) {
          meta = { ...creative.metadata, ...meta };
        }
      }
      const enriched = await processCreativeMetadata(meta);
      let ssot = null;
      if (isAdsBridgeConfigured()) {
        try {
          ssot = await updateAdCreativeMetadata(req.params.id, enriched);
        } catch (ssotErr) {
          console.warn('reprocess SSOT push failed:', ssotErr?.message || ssotErr);
        }
      }
      res.json({
        creativeId: req.params.id,
        ...enriched,
        deliverable: isDeliverableCreative(enriched),
        ssotUpdated: !!ssot,
        ssot,
      });
    } catch (e) {
      console.error('POST /api/admin/ads/creatives/:id/reprocess:', e);
      res.status(500).json({ error: e.message || 'reprocess_failed' });
    }
  });

  app.get('/api/admin/ads/campaigns', adminAuthMiddleware, async (req, res) => {
    try {
      if (!isAdsBridgeConfigured()) {
        return res.json({ campaigns: [], configured: false });
      }
      const data = await listAdCampaigns(parseInt(req.query.limit, 10) || 50);
      res.json({ ...data, configured: true });
    } catch (e) {
      console.error('GET /api/admin/ads/campaigns:', e);
      res.status(502).json({ error: e.message, campaigns: [] });
    }
  });

  app.patch('/api/admin/ads/campaigns/:id/lifecycle', adminAuthMiddleware, async (req, res) => {
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

  app.post('/api/admin/ads/seed-house', adminAuthMiddleware, async (req, res) => {
    try {
      const platformId =
        req.body?.platformOwnerUserId ||
        process.env.PLATFORM_ADS_OWNER_USER_ID ||
        (await resolveUserIdToUuid(req.user?.id));
      if (!platformId) {
        return res.status(400).json({ error: 'platformOwnerUserId required' });
      }
      const out = await seedHouseAds(platformId);
      res.json(out);
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });
}

export { BOOST_PACKAGES, AD_CAMPAIGN_PACKAGES };
