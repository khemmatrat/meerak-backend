/**
 * Growth Decision Engine — promotion / campaign decisions (Sprint 30a stub)
 * Wraps growthEngine — does not replace it.
 */

import { getPersonalizedHomeHints } from '../growthEngine.js';

export function createGrowthDecisionEngine(_deps = {}) {
  return {
    async getDecisions(ctx = {}) {
      if (ctx.pool && ctx.userId) {
        try {
          const hints = await getPersonalizedHomeHints(ctx.pool, ctx.userId, {
            surface: ctx.surface,
          });
          return { stub: false, hints };
        } catch {
          /* fall through */
        }
      }
      return { stub: true, promotions: [], banner: null };
    },
  };
}
