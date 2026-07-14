import { allowLocalOrders, bffApi, kongBase } from '@/lib/server-env';
import { listOrdersForBuyer } from '@/lib/server/orderStore';

export type OrderDetail = {
  order_id: string;
  buyer_id?: string;
  merchant_id?: string;
  merchant_name?: string;
  status?: string;
  fulfillment_status?: string;
  amount_micro?: number;
  discount_micro?: number;
  method?: string;
  items?: Array<{
    product_id?: string;
    title?: string;
    qty?: number;
    unit_price_micro?: number;
  }>;
  payso_reference_id?: string;
  payment_status?: string;
  created_at?: string;
  order_type?: string;
  [key: string]: unknown;
};

function fromRecord(o: Record<string, unknown>): OrderDetail {
  const meta = (o.metadata || {}) as Record<string, unknown>;
  const pick = (k: string) => o[k] ?? meta[k];
  return {
    order_id: String(o.order_id || o.id || ''),
    buyer_id: pick('buyer_id') as string | undefined,
    merchant_id: o.merchant_id as string | undefined,
    merchant_name: pick('merchant_name') as string | undefined,
    status: o.status as string | undefined,
    fulfillment_status: (o.fulfillment_status || pick('fulfillment_status')) as string | undefined,
    amount_micro: Number(o.amount_micro ?? o.total_micro ?? 0),
    discount_micro: Number(pick('discount_micro') || 0),
    method: (pick('method') || pick('payment_method')) as string | undefined,
    items: (pick('items') as OrderDetail['items']) || [],
    payso_reference_id: (pick('payso_reference_id') || meta.payso_reference_id) as string | undefined,
    payment_status: (pick('payment_status') || meta.payment_status) as string | undefined,
    created_at: o.created_at as string | undefined,
    order_type: pick('order_type') as string | undefined,
  };
}

export function orderApi(path: string): string {
  return `${kongBase()}/api/v1/order${path}`;
}

export async function fetchOrderDetail(orderId: string, buyerId?: string): Promise<OrderDetail | null> {
  try {
    const res = await fetch(orderApi(`/v1/orders/${encodeURIComponent(orderId)}`), {
      cache: 'no-store',
      headers: { 'X-Aqond-Region': 'TH' },
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.order_id) return fromRecord(data as Record<string, unknown>);
  } catch {
    /* fallback */
  }

  if (buyerId) {
    try {
      const res = await fetch(`${bffApi('/v1/orders')}?buyer_id=${encodeURIComponent(buyerId)}`, {
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const hit = ((data.orders || []) as Record<string, unknown>[]).find(
          (o) => String(o.order_id || o.id) === orderId,
        );
        if (hit) return fromRecord(hit);
      }
    } catch {
      /* ignore */
    }
  }

  if (allowLocalOrders() && buyerId) {
    const local = await listOrdersForBuyer(buyerId);
    const hit = local.find((o) => o.order_id === orderId);
    if (hit) {
      return fromRecord({
        order_id: hit.order_id,
        status: hit.status,
        amount_micro: hit.amount_micro,
        discount_micro: hit.discount_micro,
        method: hit.method,
        items: hit.items,
        merchant_id: hit.merchant_id,
        merchant_name: hit.merchant_name,
        order_type: hit.order_type,
        created_at: hit.created_at,
      });
    }
  }
  return null;
}
