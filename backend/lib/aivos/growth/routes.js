function ctx(req) {
  return {
    tenantId: req.query.tenantId || req.body?.tenantId || req.user?.tenantId || 'default',
    userId: req.query.userId || req.body?.userId || req.user?.id || 'u1',
  };
}

function envelope(data, meta = {}) {
  return { ok: true, data, meta: { version: '20.5.0', ...meta } };
}

function mapGrowthError(e) {
  const code = e?.code || '';
  if (code === 'MISSION_NOT_FOUND') return 404;
  if (code === 'GROWTH_OWNERSHIP_VIOLATION') return 403;
  if (code === 'RECOMMENDATION_INVALID') return 400;
  if (code === 'GROWTH_LOOP_INVALID_TRANSITION') return 409;
  return 500;
}

function mountGrowthRoutes(app, basePath, { growth, auth }) {
  const p = (path) => `${basePath}${path}`;

  app.get(p('/health'), auth, (_req, res) => {
    res.json({ ok: true, health: growth.health() });
  });

  app.get(p('/metrics'), auth, (req, res) => {
    const { tenantId } = ctx(req);
    res.json(envelope({ metrics: growth.getMetrics({ tenantId }) }));
  });

  app.get(p('/audit'), auth, (req, res) => {
    const { tenantId } = ctx(req);
    res.json(envelope(growth.getAudit({ tenantId })));
  });

  app.get(p('/profile'), auth, (req, res) => {
    res.json(envelope(growth.profile.get(ctx(req))));
  });

  app.put(p('/profile'), auth, (req, res) => {
    res.json(envelope(growth.profile.upsert(ctx(req), req.body || {})));
  });

  app.get(p('/journey'), auth, (req, res) => {
    res.json(envelope(growth.journey.get(ctx(req))));
  });

  app.post(p('/journey/advance'), auth, (req, res) => {
    res.json(envelope(growth.journey.advance(ctx(req), req.body || {})));
  });

  app.post(p('/journey/rollback'), auth, (req, res) => {
    res.json(envelope(growth.journey.rollback(ctx(req))));
  });

  app.get(p('/habits'), auth, (req, res) => {
    res.json(envelope({ habits: growth.habit.list(ctx(req)) }));
  });

  app.post(p('/habits/record'), auth, (req, res) => {
    const c = ctx(req);
    try {
      res.json(envelope(growth.habit.record(c, req.body || {})));
    } catch (e) {
      res.status(mapGrowthError(e)).json({ ok: false, error: e.code || e.message });
    }
  });

  app.get(p('/missions'), auth, (req, res) => {
    const c = ctx(req);
    const status = req.query.status || undefined;
    res.json(envelope({ missions: growth.mission.list(c, { status }) }));
  });

  app.get(p('/missions/:missionId'), auth, (req, res) => {
    const c = ctx(req);
    const mission = growth.mission.get(c, req.params.missionId);
    if (!mission) return res.status(404).json({ ok: false, error: 'MISSION_NOT_FOUND' });
    res.json(envelope({ mission }));
  });

  app.post(p('/missions/start'), auth, (req, res) => {
    const c = ctx(req);
    try {
      const missionId = req.body?.missionId;
      res.json(envelope({ mission: growth.mission.start(c, missionId) }));
    } catch (e) {
      res.status(mapGrowthError(e)).json({ ok: false, error: e.code || e.message });
    }
  });

  app.post(p('/missions/abandon'), auth, (req, res) => {
    const c = ctx(req);
    try {
      res.json(envelope(growth.mission.abandon(c, req.body || {})));
    } catch (e) {
      res.status(mapGrowthError(e)).json({ ok: false, error: e.code || e.message });
    }
  });

  app.post(p('/missions/execute'), auth, async (req, res) => {
    const c = ctx(req);
    try {
      const result = await growth.mission.execute(c, req.body || {});
      res.json(envelope(result));
    } catch (e) {
      res.status(mapGrowthError(e)).json({ ok: false, error: e.code || e.message });
    }
  });

  app.post(p('/missions/complete'), auth, async (req, res) => {
    const c = ctx(req);
    try {
      res.json(envelope(growth.mission.complete(c, req.body || {})));
    } catch (e) {
      res.status(mapGrowthError(e)).json({ ok: false, error: e.code || e.message });
    }
  });

  app.get(p('/rewards'), auth, (req, res) => {
    const c = ctx(req);
    res.json(envelope({
      balance: growth.reward.getBalance(c),
      ledger: growth.reward.list(c),
    }));
  });

  app.get(p('/feed'), auth, (req, res) => {
    const c = ctx(req);
    const page = growth.feed.list(c, { limit: Number(req.query.limit) || 20 });
    res.json(envelope(page, { home: true }));
  });

  app.post(p('/feed/refresh'), auth, (req, res) => {
    res.json(envelope(growth.feed.refresh(ctx(req)), { home: true }));
  });

  app.post(p('/feed/read'), auth, (req, res) => {
    const c = ctx(req);
    const feedItemId = req.body?.feedItemId || req.body?.id;
    res.json(envelope(growth.feed.markRead(c, feedItemId)));
  });

  app.post(p('/feed/dismiss'), auth, (req, res) => {
    const c = ctx(req);
    const feedItemId = req.body?.feedItemId || req.body?.id;
    res.json(envelope(growth.feed.dismiss(c, feedItemId)));
  });

  app.get(p('/recommendations'), auth, (req, res) => {
    res.json(envelope({ recommendations: growth.recommendation.list(ctx(req)) }));
  });

  app.get(p('/brief'), auth, (req, res) => {
    const c = ctx(req);
    const period = req.query.period || 'morning';
    if (period === 'evening') {
      return res.json(envelope(growth.eveningSummary.build(c)));
    }
    res.json(envelope(growth.dailyBrief.build(c)));
  });

  app.get(p('/brief/morning'), auth, (req, res) => {
    res.json(envelope(growth.dailyBrief.build(ctx(req))));
  });

  app.get(p('/brief/evening'), auth, (req, res) => {
    res.json(envelope(growth.eveningSummary.build(ctx(req))));
  });

  app.get(p('/evening'), auth, (req, res) => {
    res.json(envelope(growth.eveningSummary.build(ctx(req))));
  });

  app.get(p('/dashboard'), auth, (req, res) => {
    res.json(envelope(growth.dashboard.compose(ctx(req))));
  });

  app.get(p('/analytics/kpis'), auth, (req, res) => {
    const c = ctx(req);
    res.json(envelope(growth.getKpis(c, { window: req.query.window || '7d' })));
  });

  app.get(p('/churn'), auth, (req, res) => {
    res.json(envelope({ score: growth.churn.score(ctx(req)) }));
  });

  app.get(p('/retention'), auth, (req, res) => {
    res.json(envelope(growth.retention.plan(ctx(req))));
  });

  app.get(p('/coach'), auth, async (req, res) => {
    try {
      res.json(envelope(await growth.coach.advise(ctx(req), req.query || {})));
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post(p('/coach'), auth, async (req, res) => {
    try {
      res.json(envelope(await growth.coach.advise(ctx(req), req.body || {})));
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.get(p('/nba'), auth, (req, res) => {
    res.json(envelope({ recommendations: growth.nba.rank(ctx(req)) }));
  });

  app.post(p('/nba/accept'), auth, (req, res) => {
    res.json(envelope(growth.nba.accept(ctx(req), req.body?.recommendationId)));
  });

  app.get(p('/persona'), auth, (req, res) => {
    res.json(envelope({ persona: growth.personalization.get(ctx(req)) }));
  });

  app.get(p('/notification'), auth, (req, res) => {
    const c = ctx(req);
    res.json(envelope({
      notifications: growth.notification.list(c, { unreadOnly: req.query.unread === '1' }),
    }));
  });

  app.post(p('/notification'), auth, (req, res) => {
    res.json(envelope(growth.notification.push(ctx(req), req.body || {})));
  });

  app.get(p('/notification/preferences'), auth, (req, res) => {
    res.json(envelope({ preferences: growth.notification.getPreferences(ctx(req)) }));
  });

  app.put(p('/notification/preferences'), auth, (req, res) => {
    res.json(envelope(growth.notification.setPreferences(ctx(req), req.body || {})));
  });

  app.get(p('/readiness'), auth, (_req, res) => {
    res.json(envelope(growth.readiness()));
  });

  app.post(p('/retention/job'), auth, (req, res) => {
    const { tenantId } = ctx(req);
    res.json(envelope(growth.retentionJob.run({ tenantId: tenantId !== 'default' ? tenantId : undefined })));
  });

  app.get(p('/loyalty'), auth, (req, res) => {
    res.json(envelope({ loyalty: growth.loyalty.get(ctx(req)) }));
  });

  app.get(p('/gamification'), auth, (req, res) => {
    res.json(envelope({ gamification: growth.gamification.snapshot(ctx(req)) }));
  });

  app.post(p('/referral/create'), auth, (req, res) => {
    res.json(envelope(growth.referral.create(ctx(req))));
  });

  app.get(p('/referral'), auth, (req, res) => {
    res.json(envelope({ referrals: growth.referral.list(ctx(req)) }));
  });

  app.get(p('/community'), auth, (req, res) => {
    const c = ctx(req);
    res.json(envelope(growth.community.feed(c, { limit: Number(req.query.limit) || 20 })));
  });

  app.post(p('/community'), auth, (req, res) => {
    const c = ctx(req);
    res.json(envelope(growth.community.post(c, req.body || {})));
  });

  app.post(p('/campaign/plan'), auth, (req, res) => {
    res.json(envelope(growth.campaign.plan(ctx(req), req.body || {})));
  });

  app.post(p('/engagement/morning'), auth, async (req, res) => {
    res.json(envelope(await growth.engagementLoop.runMorning(ctx(req))));
  });

  app.post(p('/engagement/evening'), auth, async (req, res) => {
    res.json(envelope(await growth.engagementLoop.runEvening(ctx(req))));
  });

  app.post(p('/engagement/day'), auth, async (req, res) => {
    res.json(envelope(await growth.engagementLoop.runFullDay(ctx(req), req.body || {})));
  });
}

export function registerGrowthRoutes(app, { growth, authenticateToken, growthEnabled } = {}) {
  const auth = authenticateToken || ((_q, _s, n) => n());

  if (!growthEnabled || !growth?.enabled) {
    app.use('/api/aivos/growth', (_req, res) => {
      res.status(503).json({
        error: 'aivos_growth_disabled',
        hint: 'Set AIVOS_GROWTH_ENABLED=1',
      });
    });
    return { enabled: false };
  }

  mountGrowthRoutes(app, '/api/aivos/growth', { growth, auth });
  mountGrowthRoutes(app, '/api/aivos/growth/v1', { growth, auth });

  return { enabled: true };
}
