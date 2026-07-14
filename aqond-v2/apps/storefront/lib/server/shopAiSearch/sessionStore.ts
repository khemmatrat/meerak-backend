import fs from 'fs/promises';
import path from 'path';
import type { ShopAiCartLine, ShopAiSession } from './types';
import { getProductById } from './productQuery';

const DATA_FILE = path.join(process.cwd(), '.data', 'shop-ai-search', 'sessions.json');
const TTL_MS = 24 * 60 * 60 * 1000;

type Store = Record<string, ShopAiSession>;

async function readStore(): Promise<Store> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(raw) as Store;
  } catch {
    return {};
  }
}

async function writeStore(store: Store) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(store, null, 2));
}

function freshSession(userKey: string): ShopAiSession {
  return {
    user_key: userKey,
    phase: 'idle',
    cart: [],
    updated_at: new Date().toISOString(),
  };
}

export function resolveUserKey(lineUserId?: string, userId?: string): string {
  const line = lineUserId?.trim();
  const uid = userId?.trim();
  if (line) return `line:${line}`;
  if (uid) return `uid:${uid}`;
  return 'guest:anonymous';
}

export async function loadSession(userKey: string): Promise<ShopAiSession> {
  const store = await readStore();
  const hit = store[userKey];
  if (!hit) return freshSession(userKey);
  const age = Date.now() - Date.parse(hit.updated_at);
  if (!Number.isFinite(age) || age > TTL_MS) return freshSession(userKey);
  return hit;
}

export async function saveSession(session: ShopAiSession): Promise<ShopAiSession> {
  const store = await readStore();
  const next = { ...session, updated_at: new Date().toISOString() };
  store[session.user_key] = next;
  await writeStore(store);
  return next;
}

export async function addToCart(
  session: ShopAiSession,
  productId: string,
  qty: number,
): Promise<{ session: ShopAiSession; line: ShopAiCartLine } | { error: string }> {
  const product = await getProductById(productId);
  if (!product) return { error: 'product_not_found' };
  if (qty < 1 || qty > 99) return { error: 'invalid_qty' };

  const unit = product.price_micro;
  const line: ShopAiCartLine = {
    product_id: product.id,
    title: product.title,
    qty,
    unit_price_micro: unit,
    merchant_id: product.merchant_id,
    merchant_name: product.merchant_name,
    line_micro: unit * qty,
  };

  const cart = [...session.cart];
  const hit = cart.find((c) => c.product_id === product.id);
  if (hit) {
    hit.qty += qty;
    hit.unit_price_micro = unit;
    hit.line_micro = hit.unit_price_micro * hit.qty;
    hit.title = product.title;
    hit.merchant_name = product.merchant_name;
  } else {
    cart.push(line);
  }

  return {
    session: {
      ...session,
      cart,
      phase: 'cart_ready',
      selected_product_id: product.id,
    },
    line: hit || line,
  };
}

export function cartSubtotalMicro(cart: ShopAiCartLine[]): number {
  return cart.reduce((s, it) => s + it.line_micro, 0);
}
