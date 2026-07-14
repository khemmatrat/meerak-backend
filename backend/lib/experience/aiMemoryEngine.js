/**
 * AI Memory Engine — Sprint 32 (delegates to conversationMemory)
 * Extends user_ai_preferences.context_json — no core schema changes.
 */

import {
  buildMemorySummary,
  mergeConversationTurn,
  normalizeJarvisMemory,
  isJarvisMemoryEnabled,
} from '../jarvis/conversationMemory.js';

export function createAiMemoryEngine(deps = {}) {
  const { pool } = deps;

  return {
    enabled: isJarvisMemoryEnabled(),

    async getMemory(ctx = {}) {
      const contextJson = ctx.contextJson || {};
      const memory = normalizeJarvisMemory(contextJson);
      const summary = buildMemorySummary(contextJson, ctx.session || {});
      return {
        stub: !pool,
        enabled: isJarvisMemoryEnabled(),
        userId: ctx.userId || null,
        jarvis_memory: memory,
        summary,
        favorites: {
          products: memory.medium.product_affinities.filter((a) => a.type === 'product').map((a) => a.id),
          merchants: memory.medium.product_affinities.filter((a) => a.type === 'restaurant').map((a) => a.id),
          restaurants: memory.medium.product_affinities.filter((a) => a.type === 'restaurant').map((a) => a.id),
          jobs: [],
          categories: memory.long.affinities.filter((a) => a.type === 'category').map((a) => a.id),
          payment: null,
          language: contextJson.language_profile?.detected_lang || ctx.language || 'th',
          services: [],
          aiTools: [],
        },
      };
    },

    async mergeTurn(input = {}) {
      if (!isJarvisMemoryEnabled()) {
        return { ok: true, skipped: true, reason: 'disabled' };
      }
      const contextJson = input.contextJson || {};
      const jarvisMemory = mergeConversationTurn({
        contextJson,
        userMessage: input.userMessage,
        jarvisReply: input.jarvisReply,
        action: input.action,
        session: input.session,
        experienceProfile: input.experienceProfile,
      });
      return {
        ok: true,
        jarvis_memory: jarvisMemory,
        context_patch: { jarvis_memory: jarvisMemory },
      };
    },

    buildSummary: buildMemorySummary,
  };
}
