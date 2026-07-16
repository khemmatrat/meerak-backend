import type { FoodEta, FoodMenuItem, FoodRestaurant } from '@/lib/server/localFood';
import type { FoodCartOptionLine, FoodMenuOption } from '@/lib/foodOptions';
import { formatOptionsSummary, lineUnitMicro } from '@/lib/foodOptions';
import { markCartScope } from '@/lib/cartOwner';
import { placeOrder } from '@/lib/checkout';
import type { PaymentAction } from '@/lib/checkout';
import type { PaymentMethodId } from '@/lib/payment';
import { formatHandoffForOrder } from '@/lib/deliveryHandoff';
import type { DeliveryHandoff } from '@/lib/deliveryHandoff';

export type { FoodRestaurant, FoodMenuItem, FoodEta, FoodMenuOption, FoodCartOptionLine };

export type FoodRestaurantView = FoodRestaurant & { eta: FoodEta };

export type DeliveryMode = 'express' | 'normal' | 'saver';

export const DELIVERY_MODES: Array<{
  id: DeliveryMode;
  label: string;
  hint: string;
}> = [
  { id: 'express', label: 'ส่งด่วน', hint: 'ราคาเต็ม · ถึงเร็วที่สุด' },
  { id: 'normal', label: 'ส่งปกติ', hint: 'ถูกลง ~30% (เช่น ฿20 → ฿14)' },
  { id: 'saver', label: 'ส่งประหยัด', hint: '฿8–12 · รวมออเดอร์ร้านใกล้กัน' },
];

export type FoodCartShopView = {
  merchant_id: string;
  merchant_name: string;
  emoji?: string;
  cuisine?: string;
  rating?: number;
  distance_km?: number;
  zone_id?: string;
  items: Array<{
    item_id: string;
    merchant_id?: string;
    title: string;
    description?: string;
    image_url?: string;
    qty: number;
    unit_price_micro: number;
  }>;
  subtotal_micro: number;
  min_order_micro: number;
  shortfall_micro?: number;
  meets_minimum: boolean;
  delivery_charged_micro: number;
};

export type FoodDeliveryQuoteView = {
  mode: DeliveryMode;
  total_micro: number;
  per_shop: Array<{
    merchant_id: string;
    merchant_name: string;
    express_micro: number;
    charged_micro: number;
  }>;
  shop_count: number;
  batch_eligible: boolean;
  batch_zone?: string;
  rider_estimate_micro: number;
  rider_hint: string;
  eta_extra_min: number;
  eta_label?: string;
};

export type FoodCartView = {
  merchant_id?: string;
  merchant_name?: string;
  items: Array<{
    item_id: string;
    merchant_id?: string;
    title: string;
    description?: string;
    image_url?: string;
    qty: number;
    unit_price_micro: number;
    line_micro?: number;
    options?: FoodCartOptionLine[];
  }>;
  shops?: FoodCartShopView[];
  shop_count?: number;
  count: number;
  subtotal_micro: number;
  delivery_fee_micro: number;
  delivery_mode?: DeliveryMode;
  delivery_quote?: FoodDeliveryQuoteView;
  total_micro: number;
  eta?: { label: string; prep_min?: number; travel_min?: number };
  eta_label?: string;
  min_order_micro?: number;
  meets_minimum?: boolean;
};

export const FOOD_ADDR_KEY = 'aqond-m-food-addr';

export type { DeliveryHandoff };

export type FoodSavedAddr = {
  fullName?: string;
  address?: string;
  postal_code?: string;
  phone?: string;
  handoff?: DeliveryHandoff;
};

export function loadFoodSavedAddr(owner: string): FoodSavedAddr {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(`${FOOD_ADDR_KEY}:${owner}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveFoodSavedAddr(owner: string, data: FoodSavedAddr) {
  try {
    localStorage.setItem(`${FOOD_ADDR_KEY}:${owner}`, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export async function placeFoodExpressOrder(opts: {
  ownerId: string;
  merchantId: string;
  merchantName: string;
  items: Array<{
    item_id: string;
    title: string;
    qty: number;
    unit_price_micro: number;
    options?: FoodCartOptionLine[];
  }>;
  subtotalMicro: number;
  deliveryFeeMicro: number;
  etaLabel?: string;
  deliveryMode?: DeliveryMode;
  shopCount?: number;
  paymentMethod?: PaymentMethodId;
  promoCode?: string;
  promoCodes?: string[];
  address?: FoodSavedAddr;
  address_id?: string;
  postal_code?: string;
}) {
  const addr = opts.address || loadFoodSavedAddr(opts.ownerId);
  const fullName = addr.fullName?.trim() || 'เจ้านาย';
  const address = addr.address?.trim() || '';
  const phone = addr.phone?.trim() || '';
  const postalCode = opts.postal_code?.trim() || addr.postal_code?.trim() || '';
  if (!opts.address_id && (!address || !phone)) {
    throw new Error('กรุณากรอกที่อยู่จัดส่งและเบอร์โทร');
  }
  const handoffText = addr.handoff ? formatHandoffForOrder(addr.handoff) : '';
  let shippingAddress = address;
  if (handoffText) shippingAddress += ` | วิธีรับ: ${handoffText}`;
  if (opts.deliveryMode) shippingAddress += ` [${opts.deliveryMode}]`;
  const trackingAddress = handoffText ? `${address} · ${handoffText}` : address;

  const merchantLabel = opts.shopCount && opts.shopCount > 1
    ? `${opts.shopCount} ร้าน (${opts.merchantName})`
    : opts.merchantName;

  const result = await placeOrder({
    buyer_id: opts.ownerId,
    merchant_id: opts.merchantId,
    method: opts.paymentMethod || 'cod',
    amount_micro: opts.subtotalMicro,
    shipping_micro: opts.deliveryFeeMicro,
    promo_codes: opts.promoCodes?.length ? opts.promoCodes : opts.promoCode ? [opts.promoCode] : undefined,
    promo_code: opts.promoCode,
    carrier_id: 'aqond-rider',
    currency: 'THB',
    idempotency_key: `food-${Date.now()}`,
    recipient: fullName,
    shipping_address: shippingAddress || undefined,
    address_id: opts.address_id,
    postal_code: postalCode || '10110',
    phone,
    order_type: 'food',
    merchant_name: merchantLabel,
    delivery_eta_label: opts.etaLabel,
    handoff_note: handoffText || undefined,
    items: opts.items.map((it) => ({
      product_id: it.item_id,
      title: it.options?.length
        ? `${it.title} (${formatOptionsSummary(it.options)})`
        : it.title,
      qty: it.qty,
      unit_price_micro: it.unit_price_micro,
    })),
  });

  const orderId = result.order_id || result.id;
  // Dispatch job is created at checkout (local dev) or via dispatch-svc when merchant advances fulfillment.

  return {
    orderId,
    addressUsed: { fullName, address, phone },
    paymentAction: result.payment_action as PaymentAction | null | undefined,
    totalMicro: result.total_micro as number | undefined,
    discountMicro: result.discount_micro as number | undefined,
  };
}

export async function fetchNearbyFood(auth?: { userId?: string } | null) {
  const res = await fetch('/api/bff/v1/food/nearby', { cache: 'no-store' });
  if (!res.ok) throw new Error('food_nearby_failed');
  return res.json() as Promise<{ restaurants: FoodRestaurantView[] }>;
}

export async function fetchFoodMenu(merchantId: string) {
  const res = await fetch(`/api/bff/v1/food/menu?merchant_id=${encodeURIComponent(merchantId)}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('food_menu_failed');
  return res.json() as Promise<{ restaurant: FoodRestaurantView; menu: FoodMenuItem[] }>;
}

export async function fetchFoodCart(ownerId: string) {
  const res = await fetch(`/api/bff/v1/food/cart?owner_id=${encodeURIComponent(ownerId)}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('food_cart_failed');
  return res.json() as Promise<FoodCartView>;
}

export async function setFoodDeliveryModeApi(ownerId: string, mode: DeliveryMode) {
  const res = await fetch('/api/bff/v1/food/cart/delivery-mode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ owner_id: ownerId, delivery_mode: mode }),
  });
  if (!res.ok) throw new Error('delivery_mode_failed');
  return res.json() as Promise<FoodCartView>;
}

export async function addFoodToCart(
  ownerId: string,
  body: {
    merchant_id: string;
    item_id: string;
    title: string;
    description?: string;
    image_url?: string;
    unit_price_micro: number;
    qty?: number;
    options?: FoodCartOptionLine[];
  },
) {
  markCartScope('food');
  const res = await fetch('/api/bff/v1/food/cart/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ owner_id: ownerId, ...body }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || 'food_cart_add_failed') as Error & { code?: string };
    err.code = data.error;
    throw err;
  }
  return data as FoodCartView;
}

export async function updateFoodCartQty(
  ownerId: string,
  body: {
    merchant_id: string;
    item_id: string;
    options?: FoodCartOptionLine[];
    qty: number;
  },
) {
  const res = await fetch('/api/bff/v1/food/cart/items/qty', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ owner_id: ownerId, ...body }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'food_cart_qty_failed');
  return data as FoodCartView;
}

export async function clearFoodCartApi(ownerId: string) {
  const res = await fetch('/api/bff/v1/food/cart/clear', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ owner_id: ownerId }),
  });
  if (!res.ok) throw new Error('food_cart_clear_failed');
  return res.json() as Promise<FoodCartView>;
}

export function etaShort(eta?: FoodEta | { label?: string }) {
  if (!eta) return '—';
  if ('label' in eta && eta.label) return eta.label;
  return (eta as FoodEta).label;
}
