import fs from 'fs/promises';
import path from 'path';

const CART_FILE = path.join(process.cwd(), '.data', 'dev', 'carts.json');

export type CartItem = {
  product_id: string;
  title?: string;
  qty: number;
  unit_price_micro: number;
  merchant_id?: string;
  source?: string;
};

export type CartSummary = {
  items: Array<CartItem & { line_micro: number }>;
  count: number;
  item_qty_total: number;
  total_micro: number;
};

type CartStore = Record<string, { items: CartItem[] }>;

async function readStore(): Promise<CartStore> {
  try {
    return JSON.parse(await fs.readFile(CART_FILE, 'utf8'));
  } catch {
    return {};
  }
}

async function writeStore(store: CartStore) {
  await fs.mkdir(path.dirname(CART_FILE), { recursive: true });
  await fs.writeFile(CART_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function enrichItem(it: CartItem) {
  const qty = it.qty || 1;
  const line_micro = (it.unit_price_micro || 0) * qty;
  return { ...it, qty, line_micro };
}

export function summarize(items: CartItem[]): CartSummary {
  const enriched = items.map(enrichItem);
  const item_qty_total = enriched.reduce((s, it) => s + (it.qty || 1), 0);
  const total_micro = enriched.reduce((s, it) => s + it.line_micro, 0);
  return {
    items: enriched,
    count: enriched.length,
    item_qty_total,
    total_micro,
  };
}

export async function getLocalCart(ownerId: string): Promise<CartSummary> {
  const store = await readStore();
  return summarize(store[ownerId]?.items || []);
}

export async function addLocalCartItem(ownerId: string, item: CartItem): Promise<CartSummary> {
  const store = await readStore();
  const cart = store[ownerId]?.items || [];
  const hit = cart.find((c) => c.product_id === item.product_id);
  if (hit) {
    hit.qty += item.qty || 1;
    hit.title = item.title || hit.title;
    hit.unit_price_micro = item.unit_price_micro || hit.unit_price_micro;
  } else {
    cart.push({ ...item, qty: item.qty || 1 });
  }
  store[ownerId] = { items: cart };
  await writeStore(store);
  return summarize(cart);
}

export async function setShopCartItemQty(
  ownerId: string,
  productId: string,
  qty: number,
): Promise<CartSummary> {
  const store = await readStore();
  const cart = store[ownerId]?.items || [];
  const idx = cart.findIndex((c) => c.product_id === productId);
  if (idx < 0) return summarize(cart);
  if (qty <= 0) {
    cart.splice(idx, 1);
  } else {
    cart[idx].qty = qty;
  }
  store[ownerId] = { items: cart };
  await writeStore(store);
  return summarize(cart);
}

export async function mergeLocalCarts(
  guestId: string,
  userId: string,
): Promise<{ cart: CartSummary; merged_lines: number }> {
  const store = await readStore();
  const guestItems = store[guestId]?.items || [];
  const userCart = store[userId]?.items || [];
  if (!guestItems.length) {
    return { cart: summarize(userCart), merged_lines: 0 };
  }
  for (const item of guestItems) {
    const hit = userCart.find((c) => c.product_id === item.product_id);
    if (hit) {
      hit.qty += item.qty || 1;
      hit.title = item.title || hit.title;
    } else {
      userCart.push({ ...item });
    }
  }
  store[userId] = { items: userCart };
  delete store[guestId];
  await writeStore(store);
  return { cart: summarize(userCart), merged_lines: guestItems.length };
}

export async function clearLocalCart(ownerId: string): Promise<CartSummary> {
  const store = await readStore();
  delete store[ownerId];
  await writeStore(store);
  return summarize([]);
}
