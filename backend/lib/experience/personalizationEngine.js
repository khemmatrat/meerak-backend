/**
 * Personalization Engine — home module ordering (Sprint 30a stub)
 * Sits below Experience Engine; reads intents + lifecycle.
 */

export function createPersonalizationEngine(_deps = {}) {
  return {
    async getHomeLayout(ctx = {}) {
      const intents = ctx.intents || {};
      const stage = ctx.lifecycle?.stage || 'visitor';
      const order = intents.moduleOrder
        || ctx.profile?.intentGraph?.moduleOrder
        || [
        { id: 'discover', rank: 1 },
        { id: 'market', rank: 2 },
        { id: 'food', rank: 3 },
      ];

      return {
        stub: true,
        stage,
        modules: order,
        showFtxOverlay: stage === 'visitor' && !ctx.wizardCompletedAt,
        showWizard: Boolean(ctx.userId) && !ctx.wizardCompletedAt,
        showTour: stage === 'new_user' && Boolean(ctx.wizardCompletedAt) && !ctx.tourCompletedAt,
        promotions: [],
      };
    },
  };
}
