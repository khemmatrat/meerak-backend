import { NextRequest, NextResponse } from 'next/server';
import { listMerchantOrders } from '@/lib/server/merchantOrders';
import { assertMerchantAccess, merchantUserId } from '@/lib/server/merchantAuth';

export async function GET(req: NextRequest) {
  const merchantId = req.nextUrl.searchParams.get('merchant_id');
  if (!merchantId) {
    return NextResponse.json({ error: 'merchant_id required' }, { status: 400 });
  }
  const userId = merchantUserId(req);
  const access = await assertMerchantAccess(userId, merchantId);
  if (!access.ok) return access.response;
  const data = await listMerchantOrders(merchantId);
  return NextResponse.json(data);
}
