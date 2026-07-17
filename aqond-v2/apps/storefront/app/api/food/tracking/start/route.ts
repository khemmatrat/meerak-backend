import { NextRequest, NextResponse } from 'next/server';
import { startRiderSession } from '@/lib/server/riderTracking';

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.order_id || !body.merchant_id) {
    return NextResponse.json({ error: 'order_id and merchant_id required' }, { status: 400 });
  }

  const tracking = await startRiderSession({
    order_id: body.order_id,
    buyer_id: body.buyer_id || 'guest',
    merchant_id: body.merchant_id,
    merchant_name: body.merchant_name || 'ร้านอาหาร',
    items_summary: body.items_summary || '',
    address: body.address || '',
    handoff_note: body.handoff_note,
    eta_label: body.eta_label || '',
    payment_method: body.payment_method || 'cod',
    amount_micro: body.amount_micro || 0,
    order_items: body.order_items,
    started_at: body.started_at,
  });

  return NextResponse.json(tracking);
}
