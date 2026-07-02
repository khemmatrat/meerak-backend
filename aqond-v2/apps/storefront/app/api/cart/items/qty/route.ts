import { NextRequest, NextResponse } from 'next/server';
import { setShopCartItemQty } from '@/lib/server/localCart';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const owner = String(body.owner_id || '');
    if (!owner) {
      return NextResponse.json({ error: 'owner_id_required' }, { status: 400 });
    }
    const productId = String(body.product_id || '');
    const qty = Number(body.qty);
    if (!productId || Number.isNaN(qty)) {
      return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    }
    const cart = await setShopCartItemQty(owner, productId, qty);
    return NextResponse.json(cart);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'cart_qty_failed' },
      { status: 400 },
    );
  }
}
