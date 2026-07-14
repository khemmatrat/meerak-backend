import { foodApi } from '@/lib/server-env';
import { upstreamAuthHeaders, type UpstreamAuth } from '@/lib/server/upstreamAuth';
import type { FoodRestaurant, FoodMenuItem } from './localFood';
import type { FoodCart } from './localFoodCart';
import type { DeliveryMode } from './foodDelivery';

const TIMEOUT_MS = 4000;

function localDevFallback(): boolean {
  return (
    process.env.AQOND_LOCAL_DEV === '1' ||
    process.env.NEXT_PUBLIC_AQOND_LOCAL_DEV === '1'
  );
}

async function foodFetch<T>(path: string, init?: RequestInit, auth?: UpstreamAuth): Promise<T | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(foodApi(path), {
      ...init,
      cache: 'no-store',
      signal: ctrl.signal,
      headers: {
        ...upstreamAuthHeaders(auth),
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function svcListNearbyRestaurants(sort?: 'distance' | 'rating') {
  const q = sort === 'rating' ? '?sort=rating' : '';
  return foodFetch<{ restaurants: FoodRestaurant[] }>(`/v1/food/nearby${q}`);
}

export async function svcGetRestaurantMenu(merchantId: string) {
  return foodFetch<{
    restaurant: FoodRestaurant & { eta?: unknown };
    menu: FoodMenuItem[];
  }>(`/v1/food/menu?merchant_id=${encodeURIComponent(merchantId)}`);
}

export async function svcGetRestaurantById(merchantId: string) {
  const data = await svcGetRestaurantMenu(merchantId);
  return data?.restaurant ?? null;
}

export async function svcGetFoodCart(ownerId: string) {
  return foodFetch<FoodCart>(`/v1/food/cart?owner_id=${encodeURIComponent(ownerId)}`);
}

export async function svcAddFoodCartItem(
  ownerId: string,
  input: {
    merchant_id: string;
    item_id: string;
    title: string;
    description?: string;
    image_url?: string;
    qty?: number;
    unit_price_micro: number;
    options?: { option_id: string; label: string; price_micro?: number }[];
  },
  auth?: UpstreamAuth,
) {
  return foodFetch<FoodCart>('/v1/food/cart/items', {
    method: 'POST',
    body: JSON.stringify({ owner_id: ownerId, ...input, qty: input.qty || 1 }),
  }, { ...auth, userId: auth?.userId || ownerId });
}

export async function svcSetFoodDeliveryMode(ownerId: string, mode: DeliveryMode, auth?: UpstreamAuth) {
  return foodFetch<FoodCart>('/v1/food/cart/delivery-mode', {
    method: 'POST',
    body: JSON.stringify({ owner_id: ownerId, delivery_mode: mode }),
  }, { ...auth, userId: auth?.userId || ownerId });
}

export async function svcClearFoodCart(ownerId: string, auth?: UpstreamAuth) {
  return foodFetch<FoodCart>('/v1/food/cart/clear', {
    method: 'POST',
    body: JSON.stringify({ owner_id: ownerId }),
  }, { ...auth, userId: auth?.userId || ownerId });
}

export async function svcAddMerchantMenuItem(input: {
  merchant_id: string;
  title: string;
  description?: string;
  price_micro: number;
  spicy?: boolean;
  popular?: boolean;
  options?: unknown[];
}, auth?: UpstreamAuth) {
  return foodFetch<{ ok: boolean; item: FoodMenuItem }>('/v1/food/menu/items', {
    method: 'POST',
    body: JSON.stringify(input),
  }, auth);
}

export async function svcRemoveMerchantMenuItem(merchantId: string, itemId: string, auth?: UpstreamAuth) {
  return foodFetch<{ ok: boolean }>(
    `/v1/food/menu?merchant_id=${encodeURIComponent(merchantId)}&item_id=${encodeURIComponent(itemId)}`,
    { method: 'DELETE' },
    auth,
  );
}

/** True when food-svc is unreachable and JSON fallback is allowed. */
export function shouldUseLocalFoodFallback(): boolean {
  return localDevFallback();
}
