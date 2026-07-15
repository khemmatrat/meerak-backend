/** Local persistence for AQOND OS Chat — sessions, message history, favorites, cart. */

const SESSIONS_KEY = "aqond_os_chat_sessions_v1";
const MESSAGES_KEY_PREFIX = "aqond_os_chat_msgs_v1:";
const FAV_SESSIONS_KEY = "aqond_os_fav_sessions_v1";
const FAV_PRODUCTS_KEY = "aqond_os_fav_products_v1";
const CART_KEY = "aqond_os_cart_v1";
const MAX_MSGS_PER_SESSION = 80;

export type OsChatSession = {
  id: string;
  title: string;
  updatedAt: number;
  preview?: string;
  lastProductQuery?: string | null;
};

export type OsStoredChatMsg = {
  id: string;
  role: "user" | "ai";
  text: string;
  cards?: Array<{
    type: string;
    data: Record<string, unknown>;
  }>;
  searchPath?: string;
};

export type OsFavProduct = {
  id: string;
  title: string;
  price?: number;
  image?: string;
  open_path?: string;
};

export type OsCartItem = {
  id: string;
  title: string;
  price: number;
  qty: number;
  image?: string;
  open_path?: string;
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota */
  }
}

export function loadSessions(): OsChatSession[] {
  return readJson<OsChatSession[]>(SESSIONS_KEY, []);
}

export function saveSessions(sessions: OsChatSession[]) {
  writeJson(SESSIONS_KEY, sessions.slice(0, 40));
}

export function upsertSession(partial: {
  id: string;
  title?: string;
  preview?: string;
  lastProductQuery?: string | null;
}): OsChatSession[] {
  const list = loadSessions();
  const existing = list.find((s) => s.id === partial.id);
  const title = (partial.title || existing?.title || "AQOND Assistant Chat").slice(
    0,
    80,
  );
  const next: OsChatSession = {
    id: partial.id,
    title,
    preview: partial.preview ?? existing?.preview,
    lastProductQuery:
      partial.lastProductQuery !== undefined
        ? partial.lastProductQuery
        : (existing?.lastProductQuery ?? null),
    updatedAt: Date.now(),
  };
  const filtered = list.filter((s) => s.id !== partial.id);
  const sessions = [next, ...filtered].slice(0, 40);
  saveSessions(sessions);
  return sessions;
}

export function loadSessionMessages(sessionId: string): OsStoredChatMsg[] {
  if (!sessionId) return [];
  return readJson<OsStoredChatMsg[]>(MESSAGES_KEY_PREFIX + sessionId, []);
}

export function saveSessionMessages(
  sessionId: string,
  messages: OsStoredChatMsg[],
): void {
  if (!sessionId) return;
  writeJson(
    MESSAGES_KEY_PREFIX + sessionId,
    messages.slice(-MAX_MSGS_PER_SESSION),
  );
}

export function clearSessionMessages(sessionId: string): void {
  try {
    localStorage.removeItem(MESSAGES_KEY_PREFIX + sessionId);
  } catch {
    /* ignore */
  }
}

export function loadFavoriteSessionIds(): string[] {
  return readJson<string[]>(FAV_SESSIONS_KEY, []);
}

export function toggleFavoriteSession(sessionId: string): string[] {
  const cur = loadFavoriteSessionIds();
  const next = cur.includes(sessionId)
    ? cur.filter((id) => id !== sessionId)
    : [sessionId, ...cur];
  writeJson(FAV_SESSIONS_KEY, next);
  return next;
}

export function loadFavoriteProducts(): OsFavProduct[] {
  return readJson<OsFavProduct[]>(FAV_PRODUCTS_KEY, []);
}

export function toggleFavoriteProduct(product: OsFavProduct): OsFavProduct[] {
  const cur = loadFavoriteProducts();
  const exists = cur.some((p) => p.id === product.id);
  const next = exists
    ? cur.filter((p) => p.id !== product.id)
    : [product, ...cur].slice(0, 30);
  writeJson(FAV_PRODUCTS_KEY, next);
  return next;
}

export function loadCart(): OsCartItem[] {
  return readJson<OsCartItem[]>(CART_KEY, []);
}

export function saveCart(items: OsCartItem[]) {
  writeJson(CART_KEY, items);
}

export function addToCart(
  item: Omit<OsCartItem, "qty"> & { qty?: number },
): OsCartItem[] {
  const cart = loadCart();
  const existing = cart.find((c) => c.id === item.id);
  let next: OsCartItem[];
  if (existing) {
    next = cart.map((c) =>
      c.id === item.id ? { ...c, qty: c.qty + (item.qty || 1) } : c,
    );
  } else {
    next = [{ ...item, qty: item.qty || 1 }, ...cart];
  }
  saveCart(next);
  return next;
}

export function clearCart(): OsCartItem[] {
  saveCart([]);
  return [];
}

export function cartCount(items?: OsCartItem[]): number {
  return (items || loadCart()).reduce((n, i) => n + i.qty, 0);
}
