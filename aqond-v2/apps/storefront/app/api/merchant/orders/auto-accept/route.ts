import { NextRequest, NextResponse } from 'next/server';
import { getShopOps } from '@/lib/server/merchantShopOps';
import { listMerchantOrders, updateMerchantFulfillment } from '@/lib/server/merchantOrders';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const merchantId = body.merchant_id;
  if (!merchantId) {
    return NextResponse.json({ error: 'merchant_id required' }, { status: 400 });
  }

  const ops = await getShopOps(merchantId);
  if (!ops.auto_accept_orders) {
    return NextResponse.json({ ok: true, accepted: [], message: 'auto_accept off' });
  }

  const { orders } = await listMerchantOrders(merchantId);
  const pending = orders.filter((o) => ['pending_accept', 'pending_ship'].includes(o.fulfillment_status || ''));
  const accepted: string[] = [];

  for (const o of pending) {
    try {
      await updateMerchantFulfillment(o.order_id, 'accepted', { actor: 'auto_accept' });
      accepted.push(o.order_id);
    } catch {
      /* skip */
    }
  }

  return NextResponse.json({ ok: true, accepted, count: accepted.length });
}
