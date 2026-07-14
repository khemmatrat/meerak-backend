import { NextRequest, NextResponse } from 'next/server';
import { aiCoreApi, aiCoreKey } from '@/lib/server-env';
import { enrichFeedContextForFood } from '@/lib/server/foodFeedBridge';
import { loadJarvisActiveOrders } from '@/lib/server/jarvisContext';
import {
  detectLanguageIntelligence,
  isJarvisLangIntelEnabled,
} from '@/lib/server/languageIntelligence';
import {
  buildMemorySummary,
  isJarvisMemoryEnabled,
  mergeConversationTurn,
  mergeShortTurns,
} from '@/lib/server/conversationMemory';
import { isJarvisPersonaEnabled, resolveJarvisPersona } from '@/lib/server/personaEngine';
import { resolveStorefrontVoiceProfile, isStorefrontJarvisVoiceEnabled } from '@/lib/server/voiceIntelligence';
import { getUserAiPreferences, saveUserAiPreferences } from '@/lib/server/aiTier3Store';
import {
  runLocalJarvis,
  type JarvisFeedContext,
  type JarvisSession,
} from '@/lib/server/localJarvis';
import { finishJarvisObserve, startJarvisObserve, jarvisHealthResponse, jarvisGuardianEnforceGate } from '@/lib/server/guardianTap';
import { newCorrelationId, newTraceId, defaultAgentId } from '@aqond/guardian-sdk';

export const maxDuration = 120;

type JarvisBody = {
  user_message?: string;
  session?: JarvisSession;
  feed_context?: JarvisFeedContext | null;
  buyer_id?: string;
  surface?: string;
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as JarvisBody;
  const userMessage = (body.user_message || '').trim();
  const buyerId = body.buyer_id || req.headers.get('x-user-id') || 'guest';
  const observe = startJarvisObserve({
    req,
    buyerId,
    userMessage,
    surface: body.surface,
  });
  let session: JarvisSession = body.session || {};
  let feedContext = body.feed_context || session.feed_context || null;
  if (feedContext) {
    feedContext = await enrichFeedContextForFood(feedContext);
  }

  const activeOrders = await loadJarvisActiveOrders(buyerId);
  session = { ...session, active_orders: activeOrders };

  let languageProfile = session.language_profile;
  if (isJarvisLangIntelEnabled()) {
    const prefs =
      buyerId !== 'guest' ? await getUserAiPreferences(buyerId).catch(() => null) : null;
    languageProfile = detectLanguageIntelligence({
      message: userMessage,
      acceptLanguage: req.headers.get('accept-language'),
      storedProfile: (prefs?.context_json?.language_profile as Record<string, unknown>) || languageProfile,
      jarvisLocale: prefs?.jarvis_locale,
    });
    session = {
      ...session,
      language_profile: languageProfile,
      jarvis_locale: languageProfile.detected_lang,
    };
    if (buyerId !== 'guest') {
      void saveUserAiPreferences(buyerId, {
        jarvis_locale: languageProfile.detected_lang,
        context_json: { language_profile: languageProfile },
      }).catch(() => {});
    }
  }

  if (!userMessage) {
    return finishJarvisObserve(
      { error: 'user_message required' },
      observe,
      {
        mode: 'validation',
        action: 'none',
        status: 400,
        error: 'user_message required',
        buyerId,
        userMessage,
        surface: body.surface,
      },
    );
  }

  const enforceDenied = await jarvisGuardianEnforceGate({
    observe,
    buyerId,
    userMessage,
    surface: body.surface,
    action: (session as { jarvis_action?: string }).jarvis_action || 'none',
  });
  if (enforceDenied) return enforceDenied;

  let memorySummary = '';
  let contextJson: Record<string, unknown> = {};
  if (isJarvisMemoryEnabled()) {
    const prefs =
      buyerId !== 'guest' ? await getUserAiPreferences(buyerId).catch(() => null) : null;
    contextJson = (prefs?.context_json as Record<string, unknown>) || {};
    memorySummary = buildMemorySummary(contextJson, session as Record<string, unknown>);
    session = { ...session, memory_summary: memorySummary };
  }

  let jarvisPersona = session.jarvis_persona as ReturnType<typeof resolveJarvisPersona> | undefined;
  if (isJarvisPersonaEnabled()) {
    jarvisPersona = resolveJarvisPersona({
      session: session as Record<string, unknown>,
      feedContext,
      languageProfile: (languageProfile || {}) as Record<string, unknown>,
      contextJson,
      surface: body.surface || null,
    });
    session = { ...session, jarvis_persona: jarvisPersona };
  }

  const voiceProfile = isStorefrontJarvisVoiceEnabled()
    ? resolveStorefrontVoiceProfile({
        languageProfile: (languageProfile || {}) as Record<string, unknown>,
        jarvisPersona: jarvisPersona as Record<string, unknown> | undefined,
      })
    : null;

  const key = aiCoreKey();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) headers['X-AI-Core-Api-Key'] = key;

  try {
    const res = await fetch(aiCoreApi('/v1/jarvis/concierge'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        user_message: userMessage,
        session,
        feed_context: feedContext,
        accept_language: req.headers.get('accept-language'),
        language_profile: languageProfile,
        language_intel_enabled: isJarvisLangIntelEnabled(),
        memory_summary: memorySummary,
        jarvis_memory_enabled: isJarvisMemoryEnabled(),
        jarvis_persona: jarvisPersona,
        jarvis_persona_enabled: isJarvisPersonaEnabled(),
        voice_profile: voiceProfile,
        jarvis_voice_enabled: voiceProfile?.enabled,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(90_000),
    });
    if (res.ok) {
      const data = await res.json();
      const patch: Partial<JarvisSession> = { active_orders: activeOrders };
      if (data.products?.length) patch.last_search = data.products;
      if (data.jarvis?.selected_product_id) patch.selected_product_id = data.jarvis.selected_product_id;
      if (data.jarvis?.selected_variant_value) {
        patch.selected_variant_value = data.jarvis.selected_variant_value;
      }
      if (data.jarvis?.track_order_id) patch.track_order_id = data.jarvis.track_order_id;

      const jarvisReply = data.jarvis?.reply_th || '';
      if (isJarvisMemoryEnabled()) {
        patch.turns = mergeShortTurns(
          { ...session, ...patch } as Record<string, unknown>,
          userMessage,
          jarvisReply,
        );
        if (buyerId !== 'guest') {
          const jarvisMemory = mergeConversationTurn({
            contextJson,
            userMessage,
            jarvisReply,
            action: data.jarvis?.action || 'none',
            session: { ...session, ...patch },
          });
          void saveUserAiPreferences(buyerId, {
            context_json: { jarvis_memory: jarvisMemory },
          }).catch(() => {});
        }
      }

      return finishJarvisObserve(
        {
          ...data,
          mode: 'ai-core',
          language_profile: languageProfile,
          memory_summary: memorySummary,
          jarvis_persona: jarvisPersona,
          voice_profile: voiceProfile,
          session_patch: patch,
          active_orders: activeOrders,
        },
        observe,
        {
          mode: 'ai-core',
          action: data.jarvis?.action || 'none',
          buyerId,
          userMessage,
          surface: body.surface,
        },
      );
    }
  } catch {
    /* fall through to local */
  }

  const local = await runLocalJarvis(userMessage, session, feedContext);
  const jarvisReply = local.jarvis?.reply_th || '';
  const localPatch = { ...local.session_patch, active_orders: activeOrders, language_profile: languageProfile };
  if (isJarvisMemoryEnabled()) {
    localPatch.turns = mergeShortTurns(
      { ...session, ...localPatch } as Record<string, unknown>,
      userMessage,
      jarvisReply,
    );
    if (buyerId !== 'guest') {
      const jarvisMemory = mergeConversationTurn({
        contextJson,
        userMessage,
        jarvisReply,
        action: local.jarvis?.action || 'none',
        session: { ...session, ...localPatch },
      });
      void saveUserAiPreferences(buyerId, {
        context_json: { jarvis_memory: jarvisMemory },
      }).catch(() => {});
    }
  }
  return finishJarvisObserve(
    {
      ...local,
      mode: 'local',
      language_profile: languageProfile,
      memory_summary: memorySummary,
      jarvis_persona: jarvisPersona,
      voice_profile: voiceProfile,
      active_orders: activeOrders,
      session_patch: localPatch,
    },
    observe,
    {
      mode: 'local',
      action: local.jarvis?.action || 'none',
      buyerId,
      userMessage,
      surface: body.surface,
    },
  );
}

export async function GET(req: NextRequest) {
  const traceId = req.headers.get('x-trace-id') || newTraceId();
  const correlationId = req.headers.get('x-correlation-id') || newCorrelationId('jarvis-health');
  const agentId = defaultAgentId();
  const key = aiCoreKey();
  const headers: Record<string, string> = {};
  if (key) headers['X-AI-Core-Api-Key'] = key;
  try {
    const res = await fetch(aiCoreApi('/health'), { headers, cache: 'no-store', signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const h = await res.json();
      return jarvisHealthResponse({ ok: true, mode: 'ai-core', ollama: h.ollama }, {
        traceId,
        correlationId,
        agentId,
      });
    }
  } catch {
    /* local */
  }
  return jarvisHealthResponse(
    {
      ok: true,
      mode: 'local',
      hint: 'ai-core offline — Jarvis ใช้ rules + catalog local',
    },
    { traceId, correlationId, agentId },
  );
}
