import { NextRequest, NextResponse } from 'next/server';
import { addMerchantMenuItem, getRestaurantMenu, removeMerchantMenuItem } from '@/lib/server/localFood';
import { assertMerchantAccess, merchantUserId } from '@/lib/server/merchantAuth';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

export async function GET(req: NextRequest) {
  const merchantId = req.nextUrl.searchParams.get('merchant_id');
  if (!merchantId) {
    return NextResponse.json({ error: 'merchant_id required' }, { status: 400 });
  }
  const access = await assertMerchantAccess(merchantUserId(req), merchantId);
  if (!access.ok) return access.response;
  const data = await getRestaurantMenu(merchantId);
  if (!data) {
    return NextResponse.json({ error: 'merchant_not_found', menu: [] }, { status: 404 });
  }
  return NextResponse.json({ restaurant: data.restaurant, menu: data.menu });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.merchant_id || !body.title?.trim()) {
    return NextResponse.json({ error: 'merchant_id and title required' }, { status: 400 });
  }
  const access = await assertMerchantAccess(merchantUserId(req), body.merchant_id);
  if (!access.ok) return access.response;
  const auth = upstreamAuthFromRequest(req);
  const priceMicro = Number(body.price_micro);
  if (!Number.isFinite(priceMicro) || priceMicro < 100) {
    return NextResponse.json({ error: 'price_micro invalid (min 100 = ฿1)' }, { status: 400 });
  }
  try {
    const item = await addMerchantMenuItem({
      merchant_id: body.merchant_id,
      title: body.title,
      description: body.description,
      price_micro: Math.round(priceMicro),
      spicy: !!body.spicy,
      popular: !!body.popular,
      options: body.options,
    }, auth);
    return NextResponse.json({ ok: true, item });
  } catch {
    return NextResponse.json({ error: 'food_svc_unavailable' }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest) {
  const merchantId = req.nextUrl.searchParams.get('merchant_id');
  const itemId = req.nextUrl.searchParams.get('item_id');
  if (!merchantId || !itemId) {
    return NextResponse.json({ error: 'merchant_id and item_id required' }, { status: 400 });
  }
  const access = await assertMerchantAccess(merchantUserId(req), merchantId);
  if (!access.ok) return access.response;
  const ok = await removeMerchantMenuItem(merchantId, itemId, upstreamAuthFromRequest(req));
  if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
