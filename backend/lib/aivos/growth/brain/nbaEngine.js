import { isNbaEnabled } from '../config.js';
import { emitGrowthEvent } from '../growthEmit.js';
import { coach as ruleBasedCoach } from './personalAICoach.js';

function nbaScore(rec, personaBoost = 1) {
  const priority = Number(rec.priority) || 0;
  const confidence = Number(rec.confidence) || 0.5;
  return (priority * 0.6 + confidence * 100 * 0.4) * personaBoost;
}

export function createNbaEngine({ recommendation, personalization, mission, events, metrics } = {}) {
  return {
    rank(ctx) {
      if (!isNbaEnabled()) return [];

      const recs = recommendation?.list?.(ctx) || [];
      const missions = mission?.list?.(ctx, { status: 'active' }) || [];
      const advice = ruleBasedCoach(
        { persona: personalization?.get?.(ctx)?.persona },
        {},
      );

      const fromRecs = recs.map((r) => ({
        ...r,
        nbaScore: nbaScore(r, personalization?.boostScore?.(ctx, { type: r.type }) / 50 || 1),
        source: r.source || 'growth.recommendation',
      }));

      const fromMissions = missions.map((m) => ({
        id: `nba-mission-${m.missionId}`,
        type: 'mission.start',
        priority: m.priority || 50,
        confidence: 0.85,
        reason: m.title,
        source: 'growth.mission',
        action: { type: 'mission', targetId: m.missionId },
        nbaScore: nbaScore(
          { priority: m.priority, confidence: 0.85 },
          personalization?.boostScore?.(ctx, { kind: 'mission' }) / 50 || 1,
        ),
      }));

      let ranked = [...fromRecs, ...fromMissions]
        .sort((a, b) => (b.nbaScore || 0) - (a.nbaScore || 0))
        .slice(0, 10);

      if (advice.nextBestAction && ranked.length) {
        ranked[0] = { ...ranked[0], coachHint: advice.nextBestAction };
      }

      metrics?.record?.({ tenantId: ctx.tenantId, action: 'nba.presented', success: true });
      void emitGrowthEvent(events, 'growth.nba.presented', { count: ranked.length }, ctx);
      return ranked;
    },

    accept(ctx, recommendationId) {
      metrics?.record?.({ tenantId: ctx.tenantId, action: 'nba.executed', success: true });
      void emitGrowthEvent(events, 'growth.nba.executed', { recommendationId }, ctx);
      void emitGrowthEvent(events, 'growth.recommendation.accepted', { id: recommendationId }, ctx);
      return { ok: true, recommendationId };
    },
  };
}
