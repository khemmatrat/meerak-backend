export type JarvisFeedContext = {
  post_id?: string;
  media_id?: string;
  caption?: string;
  product_id?: string;
  product_title?: string;
  price_micro?: number;
  category?: string;
  author_id?: string;
  is_food?: boolean;
  food_merchant_id?: string;
  food_merchant_name?: string;
};

export type JarvisFoodItem = {
  id: string;
  title: string;
  price_micro: number;
  merchant_id?: string;
  popular?: boolean;
};

export type JarvisProduct = {
  id: string;
  title?: string;
  name?: string;
  price_micro?: number;
  category?: string;
  merchant_hint?: string;
};

export type JarvisSession = {
  last_search?: JarvisProduct[];
  last_food?: JarvisFoodItem[];
  selected_product_id?: string;
  selected_food_item_id?: string;
  food_merchant_id?: string;
  selected_variant_value?: string;
  feed_context?: JarvisFeedContext;
  active_orders?: Array<{ order_id: string; status: string; status_label?: string; track_href?: string }>;
  track_order_id?: string;
  track_href?: string;
  turns?: Array<{ role: 'user' | 'jarvis'; text: string; at: string }>;
  memory_summary?: string;
  language_profile?: Record<string, unknown>;
  jarvis_persona?: {
    enabled: boolean;
    product: string;
    product_name: string;
    regional: string;
    honorific: string;
    tone: string;
    formality: string;
    prompt_section: string;
  };
};

export type JarvisMessage = {
  id: string;
  role: 'user' | 'jarvis';
  text: string;
  products?: JarvisProduct[];
  compare?: JarvisProduct[];
  food_items?: JarvisFoodItem[];
  food_merchant_name?: string;
  food_eta_label?: string;
  track_order_id?: string;
  mode?: string;
};

const SESSION_KEY = 'aqond_jarvis_session';
const SHORT_TTL_MS = 15 * 60 * 1000;

function pruneStaleTurns(session: JarvisSession): JarvisSession {
  const turns = session.turns;
  if (!turns?.length) return session;
  const fresh = turns.filter((t) => {
    if (!t.at) return false;
    const age = Date.now() - Date.parse(t.at);
    return Number.isFinite(age) && age <= SHORT_TTL_MS;
  });
  if (fresh.length === turns.length) return session;
  return { ...session, turns: fresh };
}

export function loadJarvisSession(): JarvisSession {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const parsed = raw ? (JSON.parse(raw) as JarvisSession) : {};
    return pruneStaleTurns(parsed);
  } catch {
    return {};
  }
}

export function saveJarvisSession(session: JarvisSession) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* quota */
  }
}

export function patchJarvisSession(patch: Partial<JarvisSession>) {
  const next = { ...loadJarvisSession(), ...patch };
  saveJarvisSession(next);
  return next;
}

export function newMsgId() {
  return `jm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
