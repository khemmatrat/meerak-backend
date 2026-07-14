import fs from 'fs/promises';
import path from 'path';
import type { DeliveryMode } from './foodDelivery';
import { quoteFoodDelivery } from './foodDelivery';
import { getRestaurantById } from './localFood';
import {
  effectiveMinOrderFromPromos,
  hasFreeDeliveryPromo,
  listMerchantPromotions,
  menuDiscountPercent,
} from './merchantPromotions';
import {
  svcAddFoodCartItem,
  svcClearFoodCart,
  svcGetFoodCart,
  svcSetFoodDeliveryMode,
  shouldUseLocalFoodFallback,
} from '@/lib/server/foodSvcClient';
import { enrichFoodCartItem, foodItemImageUrl } from '@/lib/foodVisual';
import type { FoodCartOptionLine } from '@/lib/foodOptions';
import { lineUnitMicro, optionsSignature } from '@/lib/foodOptions';

const CART_FILE = path.join(process.cwd(), '.data', 'dev', 'food-carts.json');

export type FoodCartItem = {
  item_id: string;
  merchant_id: string;
  title: string;
  description?: string;
  image_url?: string;
  qty: number;
  unit_price_micro: number;
  options?: FoodCartOptionLine[];
};

export type FoodCartShop = {
  merchant_id: string;
  merchant_name: string;
  emoji?: string;
  cuisine?: string;
  rating?: number;
  distance_km?: number;
  zone_id?: string;
  items: FoodCartItem[];
  subtotal_micro: number;
  min_order_micro: number;
  /** Amount still needed to reach minimum (0 when met). */
  shortfall_micro: number;
  meets_minimum: boolean;
  delivery_charged_micro: number;
};

export type FoodCart = {
  items: FoodCartItem[];
  shops: FoodCartShop[];
  shop_count: number;
  count: number;
  subtotal_micro: number;
  delivery_fee_micro: number;
  delivery_mode: DeliveryMode;
  delivery_quote?: ReturnType<typeof quoteFoodDelivery>;
  total_micro: number;
  meets_minimum: boolean;
  eta_label?: string;
  /** @deprecated single-shop compat */
  merchant_id?: string;
  merchant_name?: string;
  eta?: { label: string; prep_min: number; travel_min: number };
  min_order_micro?: number;
};

type RawCart = {
  delivery_mode?: DeliveryMode;
  items: FoodCartItem[];
  merchant_id?: string;
};

type CartStore = Record<string, RawCart>;

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

function migrateRaw(raw: RawCart): RawCart {
  if (!raw.items?.length) return { delivery_mode: raw.delivery_mode || 'normal', items: [] };
  const legacyMerchant = raw.merchant_id;
  const items = raw.items.map((it) => ({
    ...it,
    merchant_id: it.merchant_id || legacyMerchant || 'unknown',
  }));
  return { delivery_mode: raw.delivery_mode || 'normal', items };
}

function effectiveMinOrder(
  minOrder: number,
  shopCount: number,
  batchEligible: boolean,
): number {
  if (shopCount > 1 && batchEligible) {
    return Math.min(minOrder, 6500);
  }
  return minOrder;
}

/** Apply merchant promos on top of food-svc cart (delivery quote stays in food-svc). */
async function enrichFoodCartWithPromos(cart: FoodCart): Promise<FoodCart> {
  const merchantIds = [...new Set((cart.items || []).map((i) => i.merchant_id))];
  const batchEligible = !!cart.delivery_quote?.batch_eligible;

  const shops = await Promise.all(
    (cart.shops || []).map(async (sh) => {
      const promos = await listMerchantPromotions(sh.merchant_id);
      const shopItems = (sh.items || []).map((it) => {
        const pct = menuDiscountPercent(promos, it.item_id);
        if (!pct) return enrichFoodCartItem(it);
        const unit = Math.round((it.unit_price_micro * (100 - pct)) / 100);
        return enrichFoodCartItem({ ...it, unit_price_micro: unit });
      });
      const subtotal = shopItems.reduce(
        (s, it) => s + lineUnitMicro(it.unit_price_micro, it.options) * (it.qty || 1),
        0,
      );
      const minOrder = effectiveMinOrderFromPromos(
        effectiveMinOrder(sh.min_order_micro || 0, merchantIds.length, batchEligible),
        promos,
      );
      const meets = subtotal >= minOrder;
      let deliveryCharged = sh.delivery_charged_micro || 0;
      if (hasFreeDeliveryPromo(promos)) deliveryCharged = 0;
      return {
        ...sh,
        items: shopItems,
        subtotal_micro: subtotal,
        min_order_micro: minOrder,
        shortfall_micro: meets ? 0 : minOrder - subtotal,
        meets_minimum: meets,
        delivery_charged_micro: deliveryCharged,
      };
    }),
  );

  const subtotal = shops.reduce((s, sh) => s + sh.subtotal_micro, 0);
  const deliveryFee = shops.reduce((s, sh) => s + sh.delivery_charged_micro, 0);
  const meetsAll = shops.every((s) => s.meets_minimum) && (cart.items?.length || 0) > 0;
  const first = shops[0];

  return {
    ...cart,
    items: (cart.items || []).map((it) =>
      enrichFoodCartItem({
        ...it,
        image_url: it.image_url || foodItemImageUrl(it.item_id, it.title),
      }),
    ),
    shops,
    shop_count: shops.length,
    subtotal_micro: subtotal,
    delivery_fee_micro: deliveryFee,
    total_micro: subtotal + deliveryFee,
    meets_minimum: meetsAll,
    merchant_id: first?.merchant_id,
    merchant_name: shops.length > 1 ? `${shops.length} ร้าน` : first?.merchant_name,
    min_order_micro: first?.min_order_micro,
  };
}

async function summarize(ownerId: string, raw: RawCart): Promise<FoodCart> {
  const cart = migrateRaw(raw);
  const items = cart.items || [];
  const mode = cart.delivery_mode || 'normal';

  const merchantIds = [...new Set(items.map((i) => i.merchant_id))];
  const restaurants = (
    await Promise.all(merchantIds.map((id) => getRestaurantById(id)))
  ).filter(Boolean) as NonNullable<Awaited<ReturnType<typeof getRestaurantById>>>[];

  const quote = restaurants.length
    ? quoteFoodDelivery(restaurants, mode)
    : undefined;

  const shops: FoodCartShop[] = await Promise.all(
    merchantIds.map(async (mid) => {
      const shopItems = items
        .filter((i) => i.merchant_id === mid)
        .map((it) =>
          enrichFoodCartItem({
            ...it,
            image_url: it.image_url || foodItemImageUrl(it.item_id, it.title),
          }),
        );
      const promos = await listMerchantPromotions(mid);
      const shopItemsWithPromo = shopItems.map((it) => {
        const pct = menuDiscountPercent(promos, it.item_id);
        if (!pct) return it;
        const unit = Math.round((it.unit_price_micro * (100 - pct)) / 100);
        return { ...it, unit_price_micro: unit };
      });
      const subtotal = shopItemsWithPromo.reduce(
        (s, it) => s + lineUnitMicro(it.unit_price_micro, it.options) * (it.qty || 1),
        0,
      );
      const restaurant = restaurants.find((r) => r.id === mid);
      const baseMin = restaurant?.min_order_micro || 0;
      const minOrder = effectiveMinOrderFromPromos(
        effectiveMinOrder(baseMin, merchantIds.length, !!quote?.batch_eligible),
        promos,
      );
      const meets = subtotal >= minOrder;
      const line = quote?.per_shop.find((p) => p.merchant_id === mid);
      let deliveryCharged = line?.charged_micro || 0;
      if (hasFreeDeliveryPromo(promos)) deliveryCharged = 0;
      return {
        merchant_id: mid,
        merchant_name: restaurant?.name || mid,
        emoji: restaurant?.emoji,
        cuisine: restaurant?.cuisine,
        rating: restaurant?.rating,
        distance_km: restaurant?.distance_km,
        zone_id: restaurant?.zone_id,
        items: shopItemsWithPromo,
        subtotal_micro: subtotal,
        min_order_micro: minOrder,
        shortfall_micro: meets ? 0 : minOrder - subtotal,
        meets_minimum: meets,
        delivery_charged_micro: deliveryCharged,
      };
    }),
  );

  const subtotal = shops.reduce((s, sh) => s + sh.subtotal_micro, 0);
  const deliveryFee = shops.reduce((s, sh) => s + sh.delivery_charged_micro, 0);
  const meetsAll = shops.every((s) => s.meets_minimum);
  const first = shops[0];

  return {
    items: items.map((it) =>
      enrichFoodCartItem({
        ...it,
        image_url: it.image_url || foodItemImageUrl(it.item_id, it.title),
      }),
    ),
    shops,
    shop_count: shops.length,
    count: items.reduce((n, it) => n + (it.qty || 1), 0),
    subtotal_micro: subtotal,
    delivery_fee_micro: deliveryFee,
    delivery_mode: mode,
    delivery_quote: quote,
    total_micro: subtotal + deliveryFee,
    meets_minimum: meetsAll && items.length > 0,
    eta_label: quote?.eta_label,
    merchant_id: first?.merchant_id,
    merchant_name: shops.length > 1 ? `${shops.length} ร้าน` : first?.merchant_name,
    eta: quote?.eta_label
      ? { label: quote.eta_label, prep_min: 0, travel_min: 0 }
      : undefined,
    min_order_micro: first?.min_order_micro,
  };
}

async function readLocalFoodCart(ownerId: string): Promise<FoodCart> {
  const store = await readStore();
  return summarize(ownerId, store[ownerId] || { items: [] });
}

export async function getFoodCart(ownerId: string): Promise<FoodCart> {
  if (shouldUseLocalFoodFallback()) {
    const local = await readLocalFoodCart(ownerId);
    if (local.count > 0) return enrichFoodCartWithPromos(local);
  }
  const svc = await svcGetFoodCart(ownerId);
  if (svc) return enrichFoodCartWithPromos(svc);
  if (!shouldUseLocalFoodFallback()) {
    return summarize(ownerId, { items: [] });
  }
  return enrichFoodCartWithPromos(await readLocalFoodCart(ownerId));
}

export async function setFoodDeliveryMode(ownerId: string, mode: DeliveryMode) {
  const svc = await svcSetFoodDeliveryMode(ownerId, mode);
  if (svc) return enrichFoodCartWithPromos(svc);
  if (!shouldUseLocalFoodFallback()) {
    throw new Error('food_svc_unavailable');
  }
  const store = await readStore();
  const cart = migrateRaw(store[ownerId] || { items: [] });
  cart.delivery_mode = mode;
  store[ownerId] = cart;
  await writeStore(store);
  return summarize(ownerId, cart);
}

export async function addFoodCartItem(
  ownerId: string,
  input: {
    merchant_id: string;
    item_id: string;
    title: string;
    description?: string;
    image_url?: string;
    qty?: number;
    unit_price_micro: number;
    options?: FoodCartOptionLine[];
  },
) {
  if (!shouldUseLocalFoodFallback()) {
    const svc = await svcAddFoodCartItem(ownerId, input);
    if (svc) return enrichFoodCartWithPromos(svc);
    throw new Error('food_svc_unavailable');
  }
  const store = await readStore();
  const cart = migrateRaw(store[ownerId] || { items: [], delivery_mode: 'normal' });
  const qty = input.qty || 1;
  const sig = optionsSignature(input.options);

  const hit = cart.items.find(
    (c) =>
      c.item_id === input.item_id
      && c.merchant_id === input.merchant_id
      && optionsSignature(c.options) === sig,
  );
  if (hit) {
    hit.qty += qty;
    hit.title = input.title || hit.title;
    hit.description = input.description || hit.description;
    hit.image_url = input.image_url || hit.image_url;
    if (input.options?.length) hit.options = input.options;
  } else {
    cart.items.push({
      item_id: input.item_id,
      merchant_id: input.merchant_id,
      title: input.title,
      description: input.description,
      image_url: input.image_url || foodItemImageUrl(input.item_id, input.title),
      qty,
      unit_price_micro: input.unit_price_micro,
      options: input.options?.length ? input.options : undefined,
    });
  }

  store[ownerId] = cart;
  await writeStore(store);
  return summarize(ownerId, cart);
}

export async function setFoodCartItemQty(
  ownerId: string,
  input: {
    merchant_id: string;
    item_id: string;
    options?: FoodCartOptionLine[];
    qty: number;
  },
) {
  if (!shouldUseLocalFoodFallback()) {
    throw new Error('food_svc_qty_unsupported');
  }
  const store = await readStore();
  const cart = migrateRaw(store[ownerId] || { items: [], delivery_mode: 'normal' });
  const sig = optionsSignature(input.options);
  const idx = cart.items.findIndex(
    (c) =>
      c.item_id === input.item_id
      && c.merchant_id === input.merchant_id
      && optionsSignature(c.options) === sig,
  );
  if (idx < 0) {
    return summarize(ownerId, cart);
  }
  if (input.qty <= 0) {
    cart.items.splice(idx, 1);
  } else {
    cart.items[idx].qty = input.qty;
  }
  store[ownerId] = cart;
  await writeStore(store);
  return summarize(ownerId, cart);
}

export async function clearFoodCart(ownerId: string) {
  const svc = await svcClearFoodCart(ownerId);
  if (svc) return enrichFoodCartWithPromos(svc);
  if (!shouldUseLocalFoodFallback()) {
    return summarize(ownerId, { items: [] });
  }
  const store = await readStore();
  delete store[ownerId];
  await writeStore(store);
  return summarize(ownerId, { items: [] });
}
