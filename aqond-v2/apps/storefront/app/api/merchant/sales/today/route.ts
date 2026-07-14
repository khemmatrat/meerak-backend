import { NextRequest, NextResponse } from 'next/server';
import { getTodaySales } from '@/lib/server/merchantOrders';

export async function GET(req: NextRequest) {
  const merchantId = req.nextUrl.searchParams.get('merchant_id');
  if (!merchantId) {
    return NextResponse.json({ error: 'merchant_id required' }, { status: 400 });
  }
  const data = await getTodaySales(merchantId);
  return NextResponse.json(data);
}
