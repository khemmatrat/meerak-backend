import { NextRequest, NextResponse } from 'next/server';
import { assertMerchantAccess, merchantUserId } from '@/lib/server/merchantAuth';
import { fetchOrderForDispatch } from '@/lib/server/merchantOrders';
import { getPackingProof, savePackingProof } from '@/lib/server/packingProof';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id: orderId } = await ctx.params;
  const merchantId = req.nextUrl.searchParams.get('merchant_id') || '';
  if (!merchantId) {
    return NextResponse.json({ error: 'merchant_id required' }, { status: 400 });
  }

  const userId = merchantUserId(req);
  const access = await assertMerchantAccess(userId, merchantId);
  if (!access.ok) return access.response;

  const order = await fetchOrderForDispatch(orderId);
  if (!order || order.merchant_id !== merchantId) {
    return NextResponse.json({ error: 'order_not_found' }, { status: 404 });
  }

  const proof = await getPackingProof(orderId);
  return NextResponse.json({ order_id: orderId, proof, has_packing_proof: !!proof });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id: orderId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const merchantId = String(body.merchant_id || req.nextUrl.searchParams.get('merchant_id') || '');
  const imageDataUrl = String(body.image_data_url || body.photo_url || '');

  if (!merchantId) {
    return NextResponse.json({ error: 'merchant_id required' }, { status: 400 });
  }
  if (!imageDataUrl.startsWith('data:image/')) {
    return NextResponse.json({ error: 'image_data_url required' }, { status: 400 });
  }

  const userId = merchantUserId(req);
  const access = await assertMerchantAccess(userId, merchantId);
  if (!access.ok) return access.response;

  const order = await fetchOrderForDispatch(orderId);
  if (!order || order.merchant_id !== merchantId) {
    return NextResponse.json({ error: 'order_not_found' }, { status: 404 });
  }
  if (order.order_type && order.order_type !== 'food') {
    return NextResponse.json({ error: 'packing_proof_food_only' }, { status: 400 });
  }

  try {
    const proof = await savePackingProof({
      orderId,
      merchantId,
      imageDataUrl,
      uploadedBy: body.actor || userId || 'merchant',
    });
    return NextResponse.json({ ok: true, proof, has_packing_proof: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'packing_proof_failed';
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
