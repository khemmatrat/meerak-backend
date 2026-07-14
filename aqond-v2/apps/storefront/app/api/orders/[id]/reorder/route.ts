import { NextRequest, NextResponse } from 'next/server';
import { fetchOrderDetail } from '@/lib/server/orderDetail';

type Params = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Params) {
  const body = await req.json().catch(() => ({}));
  const buyerId = body.buyer_id || req.nextUrl.searchParams.get('buyer_id') || '';
  const order = await fetchOrderDetail(params.id, buyerId);
  if (!order) {
    return NextResponse.json({ error: 'order_not_found' }, { status: 404 });
  }
  if (buyerId && order.buyer_id && order.buyer_id !== buyerId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const items = (order.items || []).map((it) => ({
    product_id: it.product_id || '',
    title: it.title || it.product_id || 'สินค้า',
    qty: it.qty || 1,
    unit_price_micro: it.unit_price_micro || 0,
  }));
  if (!items.length) {
    return NextResponse.json({ error: 'no_items_to_reorder' }, { status: 400 });
  }
  const isFood =
    order.order_type === 'food' ||
    String(order.merchant_id || '').startsWith('food-') ||
    items.some((it) => String(it.product_id).startsWith('food-'));
  return NextResponse.json({
    ok: true,
    order_id: order.order_id,
    merchant_id: order.merchant_id,
    merchant_name: order.merchant_name,
    order_type: isFood ? 'food' : 'marketplace',
    items,
    redirect: isFood ? '/m/food/cart' : '/m/checkout',
    cart_key: `reorder-${order.order_id}`,
  });
}
