import { NextRequest, NextResponse } from 'next/server';
import { assertMerchantAccess, merchantUserId } from '@/lib/server/merchantAuth';
import { fetchOrderForDispatch } from '@/lib/server/merchantOrders';
import {
  buildOrderPickupQrPayload,
  encodeOrderPickupQr,
  orderPickupQrImageUrl,
} from '@/lib/server/merchantOrderQr';

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
  if (order.order_type && order.order_type !== 'food') {
    return NextResponse.json({ error: 'pickup_qr_food_only' }, { status: 400 });
  }

  const payload = buildOrderPickupQrPayload(orderId, merchantId);
  const encoded = encodeOrderPickupQr(payload);
  const size = Number(req.nextUrl.searchParams.get('size') || 220);

  return NextResponse.json({
    order_id: orderId,
    merchant_id: merchantId,
    payload,
    encoded,
    qr_image_url: orderPickupQrImageUrl(encoded, size),
    expires_at: new Date(payload.exp).toISOString(),
  });
}
