export type ShippingRate = {
  carrier_id: string;
  name: string;
  shipping_micro: number;
  cod_supported?: boolean;
};

export async function fetchShippingQuote(weightGrams = 500): Promise<ShippingRate[]> {
  try {
    const res = await fetch('/api/shipping/v1/shipping/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_region: 'TH', to_region: 'TH', weight_grams: weightGrams }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return defaultRates();
    return (data.rates || []).map((r: any) => ({
      carrier_id: r.carrier_id || r.id,
      name: r.name,
      shipping_micro: r.shipping_micro ?? r.ShippingMic ?? 0,
      cod_supported: r.cod_supported ?? r.COD,
    }));
  } catch {
    return defaultRates();
  }
}

function defaultRates(): ShippingRate[] {
  return [
    { carrier_id: 'flash-th', name: 'Flash Express', shipping_micro: 3900, cod_supported: true },
    { carrier_id: 'kerry-th', name: 'Kerry', shipping_micro: 4500, cod_supported: true },
  ];
}

import type { PaymentMethodId } from '@/lib/payment';

export type PaymentAction = {
  type: 'qr' | 'bank' | 'truemoney' | 'card';
  title: string;
  ref: string;
  amount: string;
  hint: string;
  /** PaySo QR image URL or data URL */
  qr_image_url?: string;
  intent_id?: string;
  source?: 'payso' | 'stub';
  payso_reference_id?: string;
};

export type PlaceOrderInput = {
  buyer_id: string;
  merchant_id: string;
  method: PaymentMethodId;
  amount_micro: number;
  shipping_micro?: number;
  carrier_id?: string;
  currency?: string;
  idempotency_key?: string;
  recipient?: string;
  shipping_address?: string;
  address_id?: string;
  postal_code?: string;
  phone?: string;
  handoff_note?: string;
  creator_id?: string;
  promo_code?: string;
  promo_codes?: string[];
  items: {
    product_id: string;
    variant_id?: string;
    title?: string;
    qty: number;
    unit_price_micro: number;
  }[];
  order_type?: 'food' | 'marketplace';
  merchant_name?: string;
  delivery_eta_label?: string;
};

export async function createSavedAddress(
  auth: { userId: string; token?: string } | null,
  input: { recipient: string; line1: string; postal_code: string; phone: string; city?: string },
): Promise<string> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch('/api/bff/v1/account/address', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(auth?.userId ? { 'X-User-Id': auth.userId } : {}),
        ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
      },
      body: JSON.stringify({
        owner_id: auth?.userId,
        recipient: input.recipient,
        line1: input.line1,
        city: input.city || 'กรุงเทพมหานคร',
        postal_code: input.postal_code,
        phone: input.phone,
        country: 'TH',
        is_default: true,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.address_id) {
      throw new Error(data.error || data.detail || data.errors?.join?.(', ') || 'บันทึกที่อยู่ไม่สำเร็จ');
    }
    return String(data.address_id);
  } finally {
    window.clearTimeout(timer);
  }
}

export async function placeOrder(input: PlaceOrderInput) {
  const res = await fetch('/api/checkout/place', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = data.error || '';
    if (code === 'checkout_unavailable' && data.note) {
      throw new Error('บันทึกออเดอร์ในโหมดทดสอบไม่สำเร็จ — ลองใหม่อีกครั้ง');
    }
    if (code === 'checkout_unavailable') {
      throw new Error('ระบบสั่งซื้อไม่พร้อม — เปิด AQOND_LOCAL_DEV หรือ restart storefront');
    }
    throw new Error(data.detail || data.hint || data.error || data.note || 'สั่งซื้อไม่สำเร็จ');
  }
  return data;
}
