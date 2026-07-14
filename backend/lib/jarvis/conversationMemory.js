/**
 * Sprint 32 — Conversation Memory Engine (tiered)
 * Storage: user_ai_preferences.context_json.jarvis_memory — no new DDL
 */

export const JARVIS_MEMORY_VERSION = 1;
const MEDIUM_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_MEDIUM_INTENTS = 20;
const MAX_AFFINITIES = 30;
const MAX_TURNS_SHORT = 12;

export function isJarvisMemoryEnabled() {
  return process.env.AIVOS_JARVIS_MEMORY === '1';
}

function nowIso() {
  return new Date().toISOString();
}

function isExpired(iso, ttlMs) {
  if (!iso) return true;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > ttlMs;
}

export function emptyJarvisMemory() {
  return {
    v: JARVIS_MEMORY_VERSION,
    medium: { updated_at: null, intents: [], dismissed_briefs: [], product_affinities: [] },
    long: { updated_at: null, tags: {}, affinities: [], business_context: null },
  };
}

export function normalizeJarvisMemory(contextJson = {}) {
  const raw = contextJson?.jarvis_memory;
  if (!raw || typeof raw !== 'object') return emptyJarvisMemory();
  const base = emptyJarvisMemory();
  return {
    v: raw.v || JARVIS_MEMORY_VERSION,
    medium: {
      ...base.medium,
      ...(raw.medium || {}),
      intents: Array.isArray(raw.medium?.intents) ? raw.medium.intents : [],
      dismissed_briefs: Array.isArray(raw.medium?.dismissed_briefs) ? raw.medium.dismissed_briefs : [],
      product_affinities: Array.isArray(raw.medium?.product_affinities) ? raw.medium.product_affinities : [],
    },
    long: {
      ...base.long,
      ...(raw.long || {}),
      tags: raw.long?.tags && typeof raw.long.tags === 'object' ? raw.long.tags : {},
      affinities: Array.isArray(raw.long?.affinities) ? raw.long.affinities : [],
    },
  };
}

export function expireMediumTier(memory) {
  const m = normalizeJarvisMemory({ jarvis_memory: memory });
  if (isExpired(m.medium.updated_at, MEDIUM_TTL_MS)) {
    m.medium = {
      updated_at: null,
      intents: [],
      dismissed_briefs: m.medium.dismissed_briefs || [],
      product_affinities: [],
    };
  }
  return m;
}

function inferIntent(action, session = {}) {
  const a = String(action || 'none');
  if (a.includes('food') || session.feed_context?.is_food) return 'food';
  if (a === 'track_order') return 'order_track';
  if (a === 'search' || a === 'compare') return 'marketplace';
  if (a === 'place_order') return 'purchase';
  return 'general';
}

function pushUnique(list, item, keyFn, max) {
  const key = keyFn(item);
  const next = [item, ...list.filter((x) => keyFn(x) !== key)];
  return next.slice(0, max);
}

/**
 * Merge one conversation turn into medium/long tiers.
 */
export function mergeConversationTurn(input = {}) {
  const {
    contextJson = {},
    userMessage = '',
    jarvisReply = '',
    action = 'none',
    session = {},
    experienceProfile = null,
  } = input;

  let memory = expireMediumTier(normalizeJarvisMemory(contextJson));
  const intent = inferIntent(action, session);
  const ts = nowIso();

  memory.medium.updated_at = ts;
  memory.medium.intents = pushUnique(
    memory.medium.intents,
    { intent, at: ts, snippet: String(userMessage).slice(0, 120) },
    (x) => x.intent,
    MAX_MEDIUM_INTENTS,
  );

  if (session.selected_product_id) {
    memory.medium.product_affinities = pushUnique(
      memory.medium.product_affinities,
      { type: 'product', id: session.selected_product_id, at: ts },
      (x) => `${x.type}:${x.id}`,
      MAX_AFFINITIES,
    );
  }
  if (session.food_merchant_id || session.feed_context?.food_merchant_id) {
    const mid = session.food_merchant_id || session.feed_context?.food_merchant_id;
    memory.medium.product_affinities = pushUnique(
      memory.medium.product_affinities,
      { type: 'restaurant', id: mid, at: ts },
      (x) => `${x.type}:${x.id}`,
      MAX_AFFINITIES,
    );
  }

  memory.long.updated_at = ts;
  if (experienceProfile?.primary_intent) {
    memory.long.tags.primary_intent = experienceProfile.primary_intent;
  }
  if (contextJson?.language_profile?.country) {
    memory.long.tags.country = contextJson.language_profile.country;
  }

  const biz = detectBusinessContext(userMessage, jarvisReply);
  if (biz) {
    memory.long.business_context = biz;
    memory.long.tags.business_type = biz;
  }

  if (session.last_search?.[0]?.category) {
    memory.long.affinities = pushUnique(
      memory.long.affinities,
      { type: 'category', id: session.last_search[0].category, at: ts },
      (x) => `${x.type}:${x.id}`,
      MAX_AFFINITIES,
    );
  }

  return memory;
}

/** e.g. user said they run a restaurant — remember for proactive greet */
function detectBusinessContext(userMessage, jarvisReply) {
  const m = `${userMessage} ${jarvisReply}`.toLowerCase();
  if (/เปิดร้าน|ร้านอาหาร|food merchant|restaurant owner|jual makanan/.test(m)) return 'food_merchant';
  if (/ขายของ|marketplace seller|online shop/.test(m)) return 'marketplace_seller';
  if (/ไรเดอร์|rider|driver/.test(m)) return 'rider';
  return null;
}

/**
 * Compact summary for LLM prompt (not raw dump).
 */
export function buildMemorySummary(contextJson = {}, session = {}) {
  const memory = expireMediumTier(normalizeJarvisMemory(contextJson));
  const lines = [];

  if (memory.long.business_context === 'food_merchant') {
    lines.push('User previously mentioned they run a food restaurant — do not ask again; reference their shop naturally.');
  } else if (memory.long.business_context === 'marketplace_seller') {
    lines.push('User sells on marketplace — prefer merchant/growth suggestions.');
  } else if (memory.long.business_context === 'rider') {
    lines.push('User is or wants to be a rider — prefer rider/earnings context.');
  }

  if (memory.long.tags.primary_intent) {
    lines.push(`Primary interest: ${memory.long.tags.primary_intent}.`);
  }

  const recentIntents = (memory.medium.intents || []).slice(0, 3).map((i) => i.intent);
  if (recentIntents.length) {
    lines.push(`Recent intents (7d): ${recentIntents.join(', ')}.`);
  }

  const aff = (memory.medium.product_affinities || []).slice(0, 3);
  if (aff.length) {
    lines.push(
      `Recent affinities: ${aff.map((a) => `${a.type}:${a.id}`).join(', ')}.`,
    );
  }

  const turns = Array.isArray(session.turns) ? session.turns.slice(-4) : [];
  if (turns.length) {
    const recap = turns
      .map((t) => `${t.role}: ${String(t.text || '').slice(0, 80)}`)
      .join(' | ');
    lines.push(`Short-term chat (15m): ${recap}`);
  }

  return lines.length ? lines.join('\n') : '';
}

export function mergeShortTurns(session = {}, userMessage = '', jarvisReply = '') {
  const turns = Array.isArray(session.turns) ? [...session.turns] : [];
  const ts = nowIso();
  if (userMessage) turns.push({ role: 'user', text: userMessage, at: ts });
  if (jarvisReply) turns.push({ role: 'jarvis', text: jarvisReply, at: ts });
  return turns.slice(-MAX_TURNS_SHORT);
}

/** Sprint 34 — remember dismissed proactive brief ids (medium tier, 7d) */
export function dismissJarvisBrief(contextJson = {}, briefId = '') {
  const id = String(briefId || '').trim();
  if (!id) return normalizeJarvisMemory(contextJson);
  const memory = expireMediumTier(normalizeJarvisMemory(contextJson));
  const dismissed = [...new Set([...(memory.medium.dismissed_briefs || []), id])];
  memory.medium.dismissed_briefs = dismissed;
  memory.medium.updated_at = nowIso();
  return memory;
}

export function applyMemoryKillSwitch(contextJson = {}) {
  const next = { ...(contextJson || {}) };
  const mem = normalizeJarvisMemory(next);
  mem.medium = emptyJarvisMemory().medium;
  next.jarvis_memory = mem;
  return next;
}
