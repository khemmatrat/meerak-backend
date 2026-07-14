import { isCoachEnabled } from '../config.js';
import { coach as ruleBasedCoach } from './personalAICoach.js';

export function createCoachEngine({ profile, personalization, orchestrator, nba } = {}) {
  return {
    async advise(ctx, context = {}) {
      if (!isCoachEnabled()) {
        return { ok: false, reason: 'coach_disabled' };
      }

      const prof = profile?.get?.(ctx) || {};
      const persona = personalization?.get?.(ctx) || {};
      const baseline = ruleBasedCoach({ ...prof, persona: persona.persona || prof.persona }, context);

      if (orchestrator?.enabled && context.useOrchestrator !== false) {
        try {
          const result = await orchestrator.execute({
            userId: ctx.userId,
            tenantId: ctx.tenantId,
            intent: context.question || baseline.nextBestAction,
            context: {
              growthCoach: true,
              persona: persona.persona,
              insight: baseline.insight,
            },
          });
          if (result?.ok !== false) {
            return {
              ok: true,
              insight: baseline.insight,
              nextBestAction: context.question ? String(result.summary || baseline.nextBestAction) : baseline.nextBestAction,
              orchestratorRunId: result.runId || result.id || null,
              delegated: true,
              persona: persona.persona || prof.persona,
              generatedAt: new Date().toISOString(),
            };
          }
        } catch {
          /* fall through to rule-based */
        }
      }

      const topNba = nba?.rank?.(ctx)?.[0];
      return {
        ok: true,
        ...baseline,
        nextBestAction: topNba?.reason || baseline.nextBestAction,
        recommendationId: topNba?.id || null,
        delegated: false,
      };
    },
  };
}
