import { NextRequest, NextResponse } from 'next/server';
import { merchantOpsApi } from '@/lib/server/merchantOpsClient';
import { kongBase } from '@/lib/server-env';

export async function GET(req: NextRequest) {
  const merchantId = req.nextUrl.searchParams.get('merchant_id');
  if (!merchantId) {
    return NextResponse.json({ error: 'merchant_id required' }, { status: 400 });
  }
  try {
    const res = await fetch(
      merchantOpsApi(`/v1/merchant-ops/dashboard?merchant_id=${encodeURIComponent(merchantId)}`),
      { cache: 'no-store', headers: { 'X-Aqond-Region': 'TH' } },
    );
    const data = await res.json().catch(() => ({}));
    if (res.ok) return NextResponse.json(data);
  } catch {
    /* fall through */
  }

  try {
    const res = await fetch(
      `${kongBase()}/api/v1/order/v1/orders/merchant?merchant_id=${encodeURIComponent(merchantId)}&limit=50`,
      { cache: 'no-store', headers: { 'X-Aqond-Region': 'TH' } },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: 'merchant_ops_unavailable' }, { status: 503 });
    }
    const orders = (data.orders || []) as Array<{ fulfillment_status?: string }>;
    const pending = orders.filter((o) =>
      ['pending_accept', 'pending_ship'].includes(o.fulfillment_status || ''),
    ).length;
    const preparing = orders.filter((o) => o.fulfillment_status === 'preparing').length;
    const ready = orders.filter((o) => o.fulfillment_status === 'ready').length;
    return NextResponse.json({
      merchant_id: merchantId,
      pending_orders: pending,
      preparing_orders: preparing,
      ready_orders: ready,
      sla_breaches: 0,
      source: 'order-svc-fallback',
    });
  } catch {
    return NextResponse.json({ error: 'merchant_ops_unavailable' }, { status: 503 });
  }
}
