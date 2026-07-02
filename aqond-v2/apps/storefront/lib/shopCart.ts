'use client';

import type { AuthState } from '@/lib/bff';
import { bffGet } from '@/lib/bff';
import { GUEST_OWNER_KEY } from '@/lib/cartOwner';

export const CART_CACHE_KEY = 'aqond-shop-cart-cache';
export const CART_UPDATED_EVENT = 'aqond:cart-updated';

export type ShopCartSummary = {
  items: Array<{
    product_id: string;
    title?: string;
    qty: number;
    unit_price_micro: number;
    line_micro: number;
    merchant_id?: string;
  }>;
  count: number;
  item_qty_total: number;
  total_micro: number;
};

export function emptyCartSummary(): ShopCartSummary {
  return { items: [], count: 0, item_qty_total: 0, total_micro: 0 };
}

export function readCartCache(): ShopCartSummary | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(CART_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ShopCartSummary;
  } catch {
    return null;
  }
}

export function writeCartCache(cart: ShopCartSummary) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(CART_CACHE_KEY, JSON.stringify(cart));
  } catch {
    /* quota */
  }
}

export function dispatchCartUpdated(cart: ShopCartSummary) {
  writeCartCache(cart);
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CART_UPDATED_EVENT, { detail: cart }));
}

export async function fetchShopCart(ownerId: string, auth?: AuthState | null): Promise<ShopCartSummary> {
  const data = await bffGet<ShopCartSummary>(`/v1/cart?owner_id=${encodeURIComponent(ownerId)}`, auth);
  const cart: ShopCartSummary = {
    items: (data.items || []).map((it) => ({
      ...it,
      line_micro: it.line_micro ?? (it.unit_price_micro || 0) * (it.qty || 1),
    })),
    count: data.count ?? (data.items || []).length,
    item_qty_total: data.item_qty_total ?? (data.items || []).reduce((s, it) => s + (it.qty || 1), 0),
    total_micro: data.total_micro ?? 0,
  };
  dispatchCartUpdated(cart);
  return cart;
}

export async function mergeGuestCartOnLogin(
  userId: string,
): Promise<{ cart: ShopCartSummary; mergedLines: number } | null> {
  if (typeof window === 'undefined') return null;
  const guestId = localStorage.getItem(GUEST_OWNER_KEY);
  if (!guestId || guestId === userId || !guestId.startsWith('guest-')) return null;
  const res = await fetch('/api/cart/merge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guest_id: guestId, user_id: userId }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { cart?: ShopCartSummary; merged_lines?: number };
  localStorage.removeItem(GUEST_OWNER_KEY);
  if (json.cart) dispatchCartUpdated(json.cart);
  if (!json.cart) return null;
  return { cart: json.cart, mergedLines: json.merged_lines ?? 0 };
}
