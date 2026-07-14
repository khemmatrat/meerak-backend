/**
 * Sprint 34 — Recommendation Engine delegates to proactive Jarvis briefs
 */

import { buildJarvisProactiveBrief } from '../jarvis/proactiveAssistant.js';

export function createRecommendationEngine(deps = {}) {
  return {
    async getRecommendations(ctx = {}) {
      if (process.env.AIVOS_JARVIS_PROACTIVE === '1') {
        const brief = await buildJarvisProactiveBrief({ ...deps, ...ctx });
        return {
          stub: Boolean(brief.stub),
          surface: ctx.surface || 'home',
          items: brief.proactive || [],
          brief,
        };
      }
      return {
        stub: true,
        surface: ctx.surface || 'home',
        items: [],
      };
    },
  };
}
