import { NextRequest, NextResponse } from 'next/server';
import { addLocalCartItem } from '@/lib/server/localCart';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const owner = String(body.owner_id || '');
    if (!owner) {
      return NextResponse.json({ error: 'owner_id_required' }, { status: 400 });
    }
    const cart = await addLocalCartItem(owner, {
      product_id: String(body.product_id || ''),
      title: body.title,
      qty: Number(body.qty || 1),
      unit_price_micro: Number(body.unit_price_micro || 0),
      merchant_id: body.merchant_id,
      source: body.source || 'pdp',
    });
    return NextResponse.json(cart);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'cart_add_failed' },
      { status: 400 },
    );
  }
}
