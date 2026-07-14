/**
 * Sprint 32 — Conversation Memory (storefront tier; mirrors backend)
 */

export const JARVIS_MEMORY_VERSION = 1;
const MEDIUM_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SHORT_TTL_MS = 15 * 60 * 1000;
const MAX_MEDIUM_INTENTS = 20;
const MAX_AFFINITIES = 30;
const MAX_TURNS_SHORT = 12;

export type JarvisMemoryTurn = { role: 'user' | 'jarvis'; text: string; at: string };

export type JarvisMemoryState = {
  v: number;
  medium: {
    updated_at: string | null;
    intents: Array<{ intent: string; at: string; snippet?: string }>;
    dismissed_briefs: string[];
    product_affinities: Array<{ type: string; id: string; at: string }>;
  };
  long: {
    updated_at: string | null;
    tags: Record<string, string>;
    affinities: Array<{ type: string; id: string; at: string }>;
    business_context?: string | null;
  };
};

export function isJarvisMemoryEnabled(): boolean {
  return (
    process.env.JARVIS_MEMORY === '1' ||
    process.env.NEXT_PUBLIC_JARVIS_MEMORY === '1'
  );
}

function nowIso() {
  return new Date().toISOString();
}

function isExpired(iso: string | null | undefined, ttlMs: number) {
  if (!iso) return true;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > ttlMs;
}

export function emptyJarvisMemory(): JarvisMemoryState {
  return {
    v: JARVIS_MEMORY_VERSION,
    medium: { updated_at: null, intents: [], dismissed_briefs: [], product_affinities: [] },
    long: { updated_at: null, tags: {}, affinities: [], business_context: null },
  };
}

export function normalizeJarvisMemory(contextJson: Record<string, unknown> = {}): JarvisMemoryState {
  const raw = contextJson?.jarvis_memory as JarvisMemoryState | undefined;
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
      business_context: raw.long?.business_context ?? null,
    },
  };
}

export function expireMediumTier(memory: JarvisMemoryState): JarvisMemoryState {
  const m = { ...memory, medium: { ...memory.medium }, long: { ...memory.long } };
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

function inferIntent(action: string, session: Record<string, unknown>) {
  const feed = session.feed_context as { is_food?: boolean } | undefined;
  if (action.includes('food') || feed?.is_food) return 'food';
  if (action === 'track_order') return 'order_track';
  if (action === 'search' || action === 'compare') return 'marketplace';
  if (action === 'place_order') return 'purchase';
  return 'general';
}

function pushUnique<T>(list: T[], item: T, keyFn: (x: T) => string, max: number) {
  const key = keyFn(item);
  return [item, ...list.filter((x) => keyFn(x) !== key)].slice(0, max);
}

export function mergeConversationTurn(input: {
  contextJson?: Record<string, unknown>;
  userMessage?: string;
  jarvisReply?: string;
  action?: string;
  session?: Record<string, unknown>;
  experiencePrimaryIntent?: string | null;
}): JarvisMemoryState {
  const { contextJson = {}, userMessage = '', jarvisReply = '', action = 'none', session = {} } = input;
  let memory = expireMediumTier(normalizeJarvisMemory(contextJson));
  const intent = inferIntent(action, session);
  const ts = nowIso();

  memory = {
    ...memory,
    medium: {
      ...memory.medium,
      updated_at: ts,
      intents: pushUnique(
        memory.medium.intents,
        { intent, at: ts, snippet: userMessage.slice(0, 120) },
        (x) => x.intent,
        MAX_MEDIUM_INTENTS,
      ),
    },
    long: { ...memory.long, updated_at: ts, tags: { ...memory.long.tags } },
  };

  const productId = session.selected_product_id as string | undefined;
  if (productId) {
    memory.medium.product_affinities = pushUnique(
      memory.medium.product_affinities,
      { type: 'product', id: productId, at: ts },
      (x) => `${x.type}:${x.id}`,
      MAX_AFFINITIES,
    );
  }

  const feed = session.feed_context as { food_merchant_id?: string } | undefined;
  const merchantId = (session.food_merchant_id as string) || feed?.food_merchant_id;
  if (merchantId) {
    memory.medium.product_affinities = pushUnique(
      memory.medium.product_affinities,
      { type: 'restaurant', id: merchantId, at: ts },
      (x) => `${x.type}:${x.id}`,
      MAX_AFFINITIES,
    );
  }

  if (input.experiencePrimaryIntent) {
    memory.long.tags.primary_intent = input.experiencePrimaryIntent;
  }
  const langProfile = contextJson.language_profile as { country?: string } | undefined;
  if (langProfile?.country) memory.long.tags.country = langProfile.country;

  const biz = detectBusinessContext(userMessage, jarvisReply);
  if (biz) {
    memory.long.business_context = biz;
    memory.long.tags.business_type = biz;
  }

  const lastSearch = session.last_search as Array<{ category?: string }> | undefined;
  if (lastSearch?.[0]?.category) {
    memory.long.affinities = pushUnique(
      memory.long.affinities,
      { type: 'category', id: lastSearch[0].category, at: ts },
      (x) => `${x.type}:${x.id}`,
      MAX_AFFINITIES,
    );
  }

  return memory;
}

function detectBusinessContext(userMessage: string, jarvisReply: string) {
  const m = `${userMessage} ${jarvisReply}`.toLowerCase();
  if (/เปิดร้าน|ร้านอาหาร|food merchant|restaurant/.test(m)) return 'food_merchant';
  if (/ขายของ|marketplace seller|online shop/.test(m)) return 'marketplace_seller';
  if (/ไรเดอร์|rider/.test(m)) return 'rider';
  return null;
}

export function buildMemorySummary(
  contextJson: Record<string, unknown> = {},
  session: Record<string, unknown> = {},
): string {
  const memory = expireMediumTier(normalizeJarvisMemory(contextJson));
  const lines: string[] = [];

  if (memory.long.business_context === 'food_merchant') {
    lines.push(
      'ผู้ใช้เคยบอกว่าเปิดร้านอาหาร — อย่าถามซ้ำ พูดถึงร้านแบบเป็นธรรมชาติ',
    );
  } else if (memory.long.business_context === 'marketplace_seller') {
    lines.push('User sells on marketplace — suggest growth/merchant tools.');
  } else if (memory.long.business_context === 'rider') {
    lines.push('User is interested in rider work — prefer rider context.');
  }

  if (memory.long.tags.primary_intent) {
    lines.push(`Primary interest: ${memory.long.tags.primary_intent}.`);
  }

  const recent = memory.medium.intents.slice(0, 3).map((i) => i.intent);
  if (recent.length) lines.push(`Recent intents: ${recent.join(', ')}.`);

  const turns = (session.turns as JarvisMemoryTurn[] | undefined)?.slice(-4) || [];
  if (turns.length) {
    lines.push(
      `Recent chat: ${turns.map((t) => `${t.role}: ${t.text.slice(0, 60)}`).join(' | ')}`,
    );
  }

  return lines.join('\n');
}

export function mergeShortTurns(
  session: Record<string, unknown>,
  userMessage: string,
  jarvisReply: string,
): JarvisMemoryTurn[] {
  const turns = Array.isArray(session.turns) ? [...(session.turns as JarvisMemoryTurn[])] : [];
  const ts = nowIso();
  if (userMessage) turns.push({ role: 'user', text: userMessage, at: ts });
  if (jarvisReply) turns.push({ role: 'jarvis', text: jarvisReply, at: ts });
  return turns.slice(-MAX_TURNS_SHORT);
}

/** Client short-memory TTL — drop stale turns on load */
export function pruneShortSession(session: Record<string, unknown>): Record<string, unknown> {
  const turns = session.turns as JarvisMemoryTurn[] | undefined;
  if (!turns?.length) return session;
  const fresh = turns.filter((t) => t.at && !isExpired(t.at, SHORT_TTL_MS));
  if (fresh.length === turns.length) return session;
  return { ...session, turns: fresh };
}

export const SHORT_SESSION_TTL_MS = SHORT_TTL_MS;
