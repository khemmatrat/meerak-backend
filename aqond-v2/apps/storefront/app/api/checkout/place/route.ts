import { NextRequest, NextResponse } from 'next/server';
import { allowLocalOrders, bffApi, kongBase } from '@/lib/server-env';
import { saveLocalOrder, attachTracking, findOrderByIdempotencyKey, updateOrderPaymentRefs } from '@/lib/server/orderStore';
import { registerLocalPaymentIntent } from '@/lib/server/localPaymentIntentStore';
import { clearLocalCart } from '@/lib/server/localCart';
import { decrementDevProductStock } from '@/lib/server/localCatalogStock';
import { appendAqondEvent } from '@/lib/server/aqondEventBus';
import { recordAffiliateConversion } from '@/lib/server/affiliateStats';
import { resolvePromoDiscount } from '@/lib/server/couponClient';
import type { PaymentMethodId } from '@/lib/payment';

type CheckoutBody = {
  buyer_id: string;
  merchant_id: string;
  method: string;
  amount_micro: number;
  currency?: string;
  idempotency_key?: string;
  recipient?: string;
  shipping_address?: string;
  address_id?: string;
  postal_code?: string;
  phone?: string;
  handoff_note?: string;
  shipping_micro?: number;
  carrier_id?: string;
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

function normalizeMethod(method: string): PaymentMethodId {
  const allowed: PaymentMethodId[] = ['cod', 'card', 'promptpay', 'bank_transfer', 'truemoney'];
  return allowed.includes(method as PaymentMethodId) ? (method as PaymentMethodId) : 'cod';
}

type PaysoExtras = {
  qr_code_url?: string;
  payso_reference_id?: string;
  intent_id?: string;
  status?: string;
};

function buildPaymentAction(
  method: PaymentMethodId,
  orderId: string,
  totalMicro: number,
  extras?: PaysoExtras,
) {
  if (method === 'cod') return null;
  const amount = (totalMicro / 100).toFixed(2);
  const suffix = orderId.slice(-8).toUpperCase();
  switch (method) {
    case 'promptpay':
      if (extras?.qr_code_url || extras?.payso_reference_id) {
        return {
          type: 'qr' as const,
          title: 'PromptPay QR (PaySo)',
          ref: extras.payso_reference_id || `PP-${suffix}`,
          amount,
          hint: 'สแกนจ่ายผ่านแอปธนาคาร — QR ออกโดย Pay Solutions (PaySo)',
          qr_image_url: extras.qr_code_url,
          intent_id: extras.intent_id,
          payso_reference_id: extras.payso_reference_id,
          source: 'payso' as const,
        };
      }
      return {
        type: 'qr' as const,
        title: 'สแกน QR / PromptPay',
        ref: `PP-${suffix}`,
        amount,
        hint: 'เปิดแอปธนาคาร → สแกนจ่าย → ยืนยันอัตโนมัติ',
        source: 'stub' as const,
      };
    case 'bank_transfer':
      return {
        type: 'bank' as const,
        title: 'โอนผ่านธนาคาร',
        ref: `TRF-${suffix}`,
        amount,
        hint: 'KBANK 045-1-23456-7 · SCB 123-456789-0 · แนบสลิปในแอป (demo)',
      };
    case 'truemoney':
      return {
        type: 'truemoney' as const,
        title: 'TrueMoney Wallet',
        ref: `TM-${suffix}`,
        amount,
        hint: 'เปิดแอป TrueMoney → ชำระบิล → ใส่รหัสอ้างอิง',
      };
    case 'card':
      return {
        type: 'card' as const,
        title: 'บัตรเครดิต / เดบิต',
        ref: `3DS-${suffix}`,
        amount,
        hint: 'เปิดหน้าชำระบัตร 3D Secure (demo)',
      };
    default:
      return null;
  }
}

function localPaymentIntentId(orderId: string): string {
  return `lint-${orderId}`;
}

async function registerStubPaymentIntent(
  orderId: string,
  buyerId: string,
  totalMicro: number,
  action: NonNullable<ReturnType<typeof buildPaymentAction>>,
) {
  if (action.source !== 'stub' && !action.payso_reference_id) return;
  const paysoRef = action.payso_reference_id || action.ref;
  await registerLocalPaymentIntent({
    intent_id: action.intent_id || localPaymentIntentId(orderId),
    payso_reference_id: paysoRef,
    order_ids: [orderId],
    buyer_id: buyerId,
    amount_micro: totalMicro,
  });
}

function checkoutMethodForSvc(method: PaymentMethodId): string {
  if (method === 'promptpay' || method === 'truemoney' || method === 'bank_transfer') return 'promptpay';
  if (method === 'card') return 'card';
  return 'cod';
}

async function createShippingLabel(orderId: string, body: CheckoutBody, totalMicro: number) {
  if (body.order_type === 'food' || body.carrier_id === 'aqond-rider') return null;
  try {
    const res = await fetch(`${kongBase()}/api/v1/shipping/v1/shipping/label`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Aqond-Region': 'TH' },
      body: JSON.stringify({
        order_id: orderId,
        merchant_id: body.merchant_id,
        carrier_id: body.carrier_id || 'flash-th',
        from_region: 'TH',
        to_region: 'TH',
        weight_grams: 500,
        item_micro: totalMicro,
        product_id: body.items[0]?.product_id,
        currency: body.currency || 'THB',
      }),
    });
    const label = await res.json().catch(() => ({}));
    if (res.ok && label.tracking_no) {
      if (allowLocalOrders()) {
        await attachTracking(orderId, label.tracking_no, label.carrier_id || body.carrier_id || 'flash-th');
      }
      return label;
    }
  } catch {
    /* optional */
  }
  return null;
}

export async function POST(req: NextRequest) {
  if (req.headers.get('x-pv-fail-once') === '1') {
    return NextResponse.json({ error: 'temporary', detail: 'PV retry test' }, { status: 503 });
  }
  const body = (await req.json()) as CheckoutBody;
  if (!body.buyer_id || !body.merchant_id || !body.items?.length) {
    return NextResponse.json({ error: 'buyer_id, merchant_id, items required' }, { status: 400 });
  }

  const method = normalizeMethod(body.method);
  const shippingMicro = body.shipping_micro || 0;
  const context = body.order_type === 'food' ? 'food' : 'marketplace';

  let discountMicro = 0;
  let promoCode: string | undefined;
  const promoCodes = (body.promo_codes?.length ? body.promo_codes : body.promo_code ? [body.promo_code] : [])
    .map((c) => c.trim())
    .filter(Boolean);
  if (promoCodes.length > 1) {
    const { resolvePromoStack } = await import('@/lib/server/couponClient');
    const stack = await resolvePromoStack({
      user_id: body.buyer_id,
      codes: promoCodes,
      subtotal_micro: body.amount_micro,
      delivery_micro: shippingMicro,
    });
    if (!stack.ok) {
      return NextResponse.json({ error: stack.error || 'โค้ดส่วนลดไม่ถูกต้อง' }, { status: 400 });
    }
    discountMicro = stack.discount_micro;
    promoCode = stack.codes?.join('+');
  } else if (promoCodes.length === 1) {
    const promo = await resolvePromoDiscount({
      user_id: body.buyer_id,
      code: promoCodes[0],
      subtotal_micro: body.amount_micro,
      delivery_micro: shippingMicro,
      context,
      payment_method: method,
    });
    if (!promo.ok) {
      return NextResponse.json({ error: promo.error || 'โค้ดส่วนลดไม่ถูกต้อง' }, { status: 400 });
    }
    discountMicro = promo.discount_micro;
    promoCode = promo.code;
  }

  const totalMicro = Math.max(0, body.amount_micro + shippingMicro - discountMicro);
  const paymentStatus = method === 'cod' ? 'cod' : 'pending';

  const checkoutPayload = {
    buyer_id: body.buyer_id,
    merchant_id: body.merchant_id,
    method: checkoutMethodForSvc(method),
    currency: body.currency || 'THB',
    items: body.items.map((it) => ({
      product_id: it.product_id,
      variant_id: it.variant_id || it.product_id,
      title: it.title || '',
      qty: it.qty || 1,
      unit_price_micro: it.unit_price_micro,
    })),
    shipping_micro: shippingMicro,
    coupon_discount_micro: discountMicro,
    promo_code: promoCode,
    order_type: body.order_type || 'marketplace',
    recipient: body.recipient,
    shipping_address: body.shipping_address,
    address_id: body.address_id,
    postal_code: body.postal_code,
    phone: body.phone,
    handoff_note: body.handoff_note,
    carrier_id: body.carrier_id,
    merchant_name: body.merchant_name,
    delivery_eta_label: body.delivery_eta_label,
    idempotency_key: body.idempotency_key || `co-${Date.now()}`,
  };

  let checkoutError = '';
  try {
    const res = await fetch(bffApi('/v1/checkout/place'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Aqond-Region': 'TH' },
      body: JSON.stringify(checkoutPayload),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && (data.order_id || data.status === 'completed')) {
      const orderId = data.order_id || data.id;
      if (orderId) {
        await appendAqondEvent({
          order_id: orderId,
          event_type: 'order.created',
          source: 'order-svc',
          merchant_id: body.merchant_id,
          actor: body.buyer_id,
          payload: { order_type: body.order_type, amount_micro: totalMicro },
        }).catch(() => null);
      }
      const label = orderId ? await createShippingLabel(orderId, body, totalMicro) : null;
      if (body.creator_id && body.items[0]) {
        await recordAffiliateConversion(body.creator_id, body.items[0].product_id, totalMicro).catch(() => null);
      }
      return NextResponse.json({
        ...data,
        order_id: orderId,
        tracking_no: label?.tracking_no,
        carrier_id: label?.carrier_id || body.carrier_id,
        total_micro: totalMicro,
        discount_micro: discountMicro,
        promo_code: promoCode,
        payment_action: orderId
          ? buildPaymentAction(method, orderId, totalMicro, {
              qr_code_url: data.qr_code_url as string | undefined,
              payso_reference_id: data.payso_reference_id as string | undefined,
              intent_id: data.intent_id as string | undefined,
              status: data.status as string | undefined,
            })
          : null,
        source: 'checkout-svc',
      });
    }
    checkoutError = data.error || data.reason || data.detail || `checkout_http_${res.status}`;
  } catch (e: unknown) {
    checkoutError = e instanceof Error ? e.message : 'checkout_unreachable';
  }

  if (!allowLocalOrders()) {
    return NextResponse.json(
      {
        error: 'checkout_unavailable',
        detail: 'ระบบสั่งซื้อไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง',
        reason: checkoutError,
      },
      { status: 503 },
    );
  }

  const idemKey = body.idempotency_key || `co-${Date.now()}`;
  const existing = await findOrderByIdempotencyKey(idemKey);
  if (existing) {
    const action = buildPaymentAction(method, existing.order_id, existing.amount_micro);
    return NextResponse.json({
      ok: true,
      status: existing.status,
      order_id: existing.order_id,
      duplicate: true,
      payment_status: existing.payment_status,
      total_micro: existing.amount_micro,
      payment_action: action,
      source: 'local-idempotent',
    });
  }

  const local = await saveLocalOrder({
    buyer_id: body.buyer_id,
    merchant_id: body.merchant_id,
    amount_micro: totalMicro,
    discount_micro: discountMicro || undefined,
    promo_code: promoCode,
    method,
    payment_status: paymentStatus,
    items: body.items,
    recipient: body.recipient,
    shipping_address: body.shipping_address,
    postal_code: body.postal_code,
    phone: body.phone,
    carrier_id: body.carrier_id,
    order_type: body.order_type,
    merchant_name: body.merchant_name,
    delivery_eta_label: body.delivery_eta_label,
    idempotency_key: idemKey,
  });

  const paymentAction = buildPaymentAction(method, local.order_id, totalMicro);
  if (paymentAction && method !== 'cod') {
    const intentId = paymentAction.intent_id || localPaymentIntentId(local.order_id);
    const paysoRef = paymentAction.payso_reference_id || paymentAction.ref;
    const enrichedAction = {
      ...paymentAction,
      intent_id: intentId,
      payso_reference_id: paysoRef,
      source: paymentAction.source || ('stub' as const),
    };
    await updateOrderPaymentRefs(local.order_id, {
      payso_reference_id: paysoRef,
      payment_intent_id: intentId,
      payment_source: enrichedAction.source,
    });
    if (enrichedAction.source === 'stub') {
      await registerStubPaymentIntent(local.order_id, body.buyer_id, totalMicro, enrichedAction);
    }
  }

  await clearLocalCart(body.buyer_id);
  for (const it of body.items) {
    await decrementDevProductStock(it.product_id, it.qty || 1);
  }

  const label = await createShippingLabel(local.order_id, body, totalMicro);
  if (label?.tracking_no) {
    local.tracking_no = label.tracking_no;
    local.carrier_id = label.carrier_id;
    local.status = 'shipped';
  }

  if (body.creator_id && body.items[0]) {
    await recordAffiliateConversion(body.creator_id, body.items[0].product_id, totalMicro).catch(() => null);
  }

  const finalPaymentAction = buildPaymentAction(method, local.order_id, totalMicro);
  const paymentActionOut =
    finalPaymentAction && method !== 'cod'
      ? {
          ...finalPaymentAction,
          intent_id: finalPaymentAction.intent_id || localPaymentIntentId(local.order_id),
          payso_reference_id: finalPaymentAction.payso_reference_id || finalPaymentAction.ref,
          source: finalPaymentAction.source || ('stub' as const),
        }
      : finalPaymentAction;

  return NextResponse.json({
    ok: true,
    status: paymentStatus === 'pending' ? 'pending_payment' : 'completed',
    order_id: local.order_id,
    tracking_no: local.tracking_no,
    carrier_id: local.carrier_id,
    total_micro: totalMicro,
    discount_micro: discountMicro,
    promo_code: promoCode,
    payment_action: paymentActionOut,
    source: 'local',
    payment_status: local.payment_status,
    note: 'checkout-svc unavailable — order saved locally (dev only)',
    reason: checkoutError,
  });
}
