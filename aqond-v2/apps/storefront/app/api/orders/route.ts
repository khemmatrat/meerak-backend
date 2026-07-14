import { NextRequest, NextResponse } from 'next/server';
import { allowLocalOrders, bffApi } from '@/lib/server-env';
import { listOrdersForBuyer } from '@/lib/server/orderStore';

function normalizeRemoteOrder(o: Record<string, unknown>) {
  const meta = (o.metadata || {}) as Record<string, unknown>;
  const pick = (key: string) => o[key] ?? meta[key];
  return {
    order_id: o.order_id || o.id,
    id: o.order_id || o.id,
    status: o.status || 'pending',
    amount_micro: o.amount_micro ?? o.total_micro ?? 0,
    total_micro: o.total_micro ?? o.amount_micro ?? 0,
    discount_micro: pick('discount_micro'),
    method: pick('method') || pick('payment_method'),
    items: pick('items') || [],
    recipient: pick('recipient'),
    shipping_address: pick('shipping_address'),
    phone: pick('phone'),
    postal_code: pick('postal_code'),
    handoff_note: pick('handoff_note'),
    tracking_no: pick('tracking_no'),
    carrier_id: pick('carrier_id'),
    merchant_id: o.merchant_id || pick('merchant_id'),
    order_type: pick('order_type'),
    merchant_name: pick('merchant_name'),
    delivery_eta_label: pick('delivery_eta_label'),
    promo_code: pick('promo_code'),
    fulfillment_status: o.fulfillment_status ?? pick('fulfillment_status'),
    payso_reference_id: pick('payso_reference_id'),
    payment_status: pick('payment_status'),
    created_at: o.created_at,
    source: 'order-svc',
  };
}

export async function GET(req: NextRequest) {
  const buyerId = req.nextUrl.searchParams.get('buyer_id') || 'guest';

  let remote: Record<string, unknown>[] = [];
  let remoteOk = false;
  try {
    const res = await fetch(`${bffApi('/v1/orders')}?buyer_id=${encodeURIComponent(buyerId)}`, {
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      remoteOk = true;
      remote = (data.orders || []) as Record<string, unknown>[];
    }
  } catch {
    /* ignore */
  }

  const normalized = remote.map(normalizeRemoteOrder);

  const activeOnly = req.nextUrl.searchParams.get('active') === '1';
  const ACTIVE = new Set([
    'pending', 'pending_payment', 'paid', 'confirmed', 'preparing', 'ready',
    'shipped', 'pending_accept', 'pending_ship', 'accepted',
  ]);

  if (remoteOk && !allowLocalOrders()) {
    const orders = activeOnly
      ? normalized.filter((o) => ACTIVE.has(String(o.status)) || ACTIVE.has(String(o.fulfillment_status)))
      : normalized;
    return NextResponse.json({ buyer_id: buyerId, orders, count: orders.length, active_only: activeOnly });
  }

  const local = await listOrdersForBuyer(buyerId);
  const seen = new Set(normalized.map((o) => String(o.order_id)));
  const merged = [
    ...normalized,
    ...local
      .filter((o) => !seen.has(o.order_id))
      .map((o) => ({
        order_id: o.order_id,
        id: o.order_id,
        status: o.status,
        amount_micro: o.amount_micro,
        total_micro: o.amount_micro,
        discount_micro: o.discount_micro,
        method: o.method,
        items: o.items,
        recipient: o.recipient,
        shipping_address: o.shipping_address,
        phone: o.phone,
        tracking_no: o.tracking_no,
        carrier_id: o.carrier_id,
        merchant_id: o.merchant_id,
        order_type: o.order_type,
        merchant_name: o.merchant_name,
        delivery_eta_label: o.delivery_eta_label,
        fulfillment_status: o.fulfillment_status,
        payment_status: o.payment_status,
        payso_reference_id: o.payso_reference_id,
        payment_intent_id: o.payment_intent_id,
        created_at: o.created_at,
        source: 'local',
      })),
  ];

  return NextResponse.json({ buyer_id: buyerId, orders: merged, count: merged.length });
}
