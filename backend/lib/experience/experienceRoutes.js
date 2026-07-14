/**
 * Experience API routes — Sprint 30a stubs
 * BFF storefront proxies to /api/experience/*
 */

import { randomUUID } from 'crypto';
import { createExperienceRuntime } from './index.js';
import {
  loadExperienceProfile,
  markTourComplete,
  profileToClient,
  upsertExperienceProfile,
} from './experienceProfileStore.js';
import { getFtxDashboard } from './experienceAnalytics.js';
import { buildJarvisProactiveBrief } from '../jarvis/proactiveAssistant.js';
import { ingestJarvisExperienceEvent, isJarvisProactiveEnabled } from '../jarvis/jarvisEventBridge.js';

export function attachExperienceRoutes(app, deps = {}) {
  const { pool, optionalAuth, adminAuthMiddleware } = deps;
  const runtime = createExperienceRuntime({ pool, growthEngine: deps.growthEngine });

  const { experienceEngine, featureGateEngine } = runtime;

  async function buildSnapshotCtx(req) {
    const userId = req.user?.id || req.query.userId || null;
    const guestId = req.query.guestId || req.headers['x-guest-id'] || null;
    const profileRow = await loadExperienceProfile(pool, { userId, guestId });
    const profile = profileToClient(profileRow);
    const lifecycleStage = profile?.lifecycleStage || (userId ? 'new_user' : 'visitor');

    const intents = profile?.primaryIntent
      ? await runtime.intentEngine.resolveIntents({
          selections: [profile.primaryIntent, ...(profile.secondaryIntents || [])],
          primarySelection: profile.primaryIntent,
        })
      : null;

    if (intents && profile?.intentGraph?.moduleOrder) {
      intents.moduleOrder = profile.intentGraph.moduleOrder;
    }

    return {
      userId,
      guestId,
      surface: req.query.surface || 'home',
      pool,
      lifecycleStage,
      wizardCompletedAt: profile?.wizardCompletedAt || null,
      tourCompletedAt: profile?.tourCompletedAt || null,
      profile,
      intents,
    };
  }

  app.get('/api/experience/flags', (_req, res) => {
    res.json({ ok: true, flags: featureGateEngine.getAll() });
  });

  /** Rollout status — funnel counts for staging/prod monitoring (Sprint 30f) */
  app.get('/api/experience/rollout', async (_req, res) => {
    try {
      const kill = process.env.AIVOS_EXPERIENCE_KILL === '1';
      const flags = featureGateEngine.getAll();
      let funnel = [];
      if (pool && !kill) {
        const r = await pool.query(
          `SELECT event_type, COUNT(*)::int AS n
           FROM commerce.experience_events
           WHERE created_at > NOW() - INTERVAL '7 days'
           GROUP BY event_type
           ORDER BY n DESC
           LIMIT 30`,
        );
        funnel = r.rows;
      }
      res.json({
        ok: true,
        version: '30f',
        kill_switch: kill,
        live: flags.experience_engine && !kill,
        flags,
        funnel,
      });
    } catch (e) {
      console.error('experience rollout error:', e);
      res.status(500).json({ error: 'experience_rollout_failed' });
    }
  });

  app.get('/api/experience/state', optionalAuth || ((_r, _s, n) => n()), async (req, res) => {
    try {
      const ctx = await buildSnapshotCtx(req);
      const snapshot = await experienceEngine.getSnapshot(ctx);
      res.json({
        ok: true,
        ...snapshot,
        profile: ctx.profile,
      });
    } catch (e) {
      console.error('experience state error:', e);
      res.status(500).json({ error: 'experience_state_failed' });
    }
  });

  app.post('/api/experience/preferences', optionalAuth || ((_r, _s, n) => n()), async (req, res) => {
    try {
      const body = req.body || {};
      const userId = req.user?.id || body.user_id || null;
      if (!userId && !body.guest_id) {
        return res.status(400).json({ error: 'user_id or guest_id required' });
      }

      const selections = body.interests || body.selections || [];
      const primary = body.primary_interest || selections[0] || null;
      const intents = await runtime.intentEngine.resolveIntents({
        selections,
        primarySelection: primary,
        referralSource: body.referral_source,
      });

      let profile = null;
      if (pool && userId) {
        profile = await upsertExperienceProfile(pool, {
          user_id: userId,
          guest_id: body.guest_id,
          primary_intent: intents.primary || primary,
          secondary_intents: intents.secondary || selections.slice(1),
          hidden_intents: intents.hidden || [],
          intent_graph: { surfaces: intents.surfaces, moduleOrder: intents.moduleOrder },
          birth_date: body.birth_date,
          email: body.email,
          referral_code: body.referral_code,
          country: body.country,
          language: body.language,
          referral_source: body.referral_source,
          complete_wizard: Boolean(body.complete_wizard),
          wizard_completed_at: body.wizard_completed_at,
          context: body.context || {},
        });
      }

      res.json({
        ok: true,
        stub: !pool,
        intents,
        profile: profileToClient(profile),
        redirectPath: resolveIntentRedirect(intents.primary || primary),
      });
    } catch (e) {
      console.error('experience preferences error:', e);
      res.status(500).json({ error: 'experience_preferences_failed' });
    }
  });

  app.post('/api/experience/tour', optionalAuth || ((_r, _s, n) => n()), async (req, res) => {
    try {
      const body = req.body || {};
      const userId = req.user?.id || body.user_id || null;
      const skipped = Boolean(body.skipped);

      let profile = null;
      if (pool && userId) {
        profile = await markTourComplete(pool, { userId, skipped });
      }

      res.json({
        ok: true,
        stub: !pool,
        profile: profileToClient(profile),
        skipped,
      });
    } catch (e) {
      console.error('experience tour error:', e);
      res.status(500).json({ error: 'experience_tour_failed' });
    }
  });

  app.post('/api/experience/events', optionalAuth || ((_r, _s, n) => n()), async (req, res) => {
    try {
      const body = req.body || {};
      const eventType = body.event_type || body.type;
      if (!eventType) return res.status(400).json({ error: 'event_type required' });

      const id = randomUUID();
      const userId = req.user?.id || body.user_id || null;
      const guestId = body.guest_id || null;

      if (pool) {
        await pool.query(
          `INSERT INTO commerce.experience_events (id, user_id, guest_id, event_type, payload)
           VALUES ($1, $2, $3, $4, $5::jsonb)`,
          [id, userId, guestId, eventType, JSON.stringify(body.payload || body)],
        );
      }

      await experienceEngine.recordEvent({ id, eventType, userId, guestId });
      if (userId && pool && isJarvisProactiveEnabled()) {
        void ingestJarvisExperienceEvent(pool, userId, eventType, body.payload || body);
      }
      res.json({ ok: true, id, stub: !pool });
    } catch (e) {
      console.error('experience events error:', e);
      res.status(500).json({ error: 'experience_events_failed' });
    }
  });

  /** Jarvis AI OS — proactive brief (Sprint 34) */
  app.get('/api/experience/jarvis-brief', optionalAuth || ((_r, _s, n) => n()), async (req, res) => {
    try {
      const userId = req.user?.id || req.query.userId || null;
      const surface = req.query.surface || 'home';
      if (!featureGateEngine.isEnabled('jarvis_proactive') || !isJarvisProactiveEnabled()) {
        return res.json({
          ok: true,
          enabled: false,
          proactive: [],
          stub: true,
        });
      }
      const brief = await buildJarvisProactiveBrief({
        pool,
        userId,
        surface,
        runtime,
        acceptLanguage: req.headers['accept-language'],
      });
      res.json(brief);
    } catch (e) {
      console.error('experience jarvis-brief error:', e);
      res.status(500).json({ error: 'jarvis_brief_failed' });
    }
  });

  /** Sprint 30e — Admin FTX analytics dashboard */
  if (adminAuthMiddleware) {
    app.get('/api/admin/ftx/dashboard', adminAuthMiddleware, async (req, res) => {
      try {
        const rangeDays = req.query.rangeDays || req.query.days || '30';
        const dashboard = await getFtxDashboard(pool, { rangeDays });
        res.json(dashboard);
      } catch (e) {
        console.error('admin ftx dashboard error:', e);
        res.status(500).json({ error: 'ftx_dashboard_failed' });
      }
    });
  }
}

/** Map wizard primary interest → storefront route */
export function resolveIntentRedirect(primary) {
  const key = String(primary || '').toLowerCase();
  const routes = {
    food_merchant: '/m/merchant/shops',
    marketplace_seller: '/m/merchant/shops',
    store: '/m/sell',
    food_order: '/m/food',
    rider: '/m/rider/signup',
    marketplace: '/m/home',
    talent: '/m/services/booking',
    services: '/m/services',
    hire: '/m/services',
    videos: '/m/feed',
    feeds: '/m/feed',
    courses: '/m/pro',
    ai_ads: '/m/merchant/ad-studio',
    product_images: '/m/studio',
    resume: '/m/services/create',
    travel: '/m/services',
    customer: '/m/home',
    other: '/m/home',
  };
  for (const [needle, href] of Object.entries(routes)) {
    if (key.includes(needle)) return href;
  }
  return '/m/home';
}
