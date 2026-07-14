/**
 * AQOND Experience Engine — orchestrator (Sprint 30a stub)
 *
 * Stack: Home → FTX → Experience Engine → Personalization → AI Memory
 *        → Recommendation → Growth
 *
 * Products (Food, Market, Jobs, Wallet, Pay, Brain, Courses, …) call this
 * abstraction — not each other directly.
 */

const LAYERS = [
  'home',
  'ftx',
  'experience',
  'personalization',
  'ai_memory',
  'recommendation',
  'growth',
];

export function isExperienceEnabled() {
  return process.env.AIVOS_EXPERIENCE_ENABLED === '1';
}

/**
 * @param {object} deps
 * @param {import('pg').Pool} [deps.pool]
 * @param {object} [deps.intentEngine]
 * @param {object} [deps.lifecycleEngine]
 * @param {object} [deps.personalizationEngine]
 * @param {object} [deps.aiMemoryEngine]
 * @param {object} [deps.recommendationEngine]
 * @param {object} [deps.growthDecisionEngine]
 * @param {object} [deps.featureGateEngine]
 */
export function createExperienceEngine(deps = {}) {
  const enabled = () => isExperienceEnabled();

  return {
    enabled,
    layers: LAYERS,

    /** Full experience snapshot for Home / Jarvis / Director */
    async getSnapshot(ctx = {}) {
      if (!enabled()) {
        return { enabled: false, stub: true, layers: {} };
      }

      const lifecycle = deps.lifecycleEngine
        ? await deps.lifecycleEngine.resolveStage({
            ...ctx,
            lifecycleStage: ctx.lifecycleStage,
          })
        : { stage: 'visitor', stub: true };

      const intents = ctx.intents
        || (deps.intentEngine
          ? await deps.intentEngine.resolveIntents(ctx)
          : { primary: null, secondary: [], hidden: [], stub: true });

      return {
        enabled: true,
        stub: !ctx.profile,
        userId: ctx.userId || null,
        guestId: ctx.guestId || null,
        surface: ctx.surface || 'home',
        lifecycle,
        intents,
        personalization: deps.personalizationEngine
          ? await deps.personalizationEngine.getHomeLayout({ ...ctx, lifecycle, intents })
          : { modules: [], stub: true },
        memory: deps.aiMemoryEngine
          ? await deps.aiMemoryEngine.getMemory(ctx)
          : { stub: true },
        recommendations: deps.recommendationEngine
          ? await deps.recommendationEngine.getRecommendations(ctx)
          : { items: [], stub: true },
        growth: deps.growthDecisionEngine
          ? await deps.growthDecisionEngine.getDecisions(ctx)
          : { promotions: [], stub: true },
        jarvisBrief: { proactive: [], stub: true },
      };
    },

    async recordEvent(_event) {
      return { ok: true, stub: true };
    },
  };
}
