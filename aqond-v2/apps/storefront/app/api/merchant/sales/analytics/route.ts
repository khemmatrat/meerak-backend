import { NextRequest, NextResponse } from 'next/server';
import { getMerchantSalesAnalytics } from '@/lib/server/merchantSalesAnalytics';

export async function GET(req: NextRequest) {
  const merchantId = req.nextUrl.searchParams.get('merchant_id');
  if (!merchantId) {
    return NextResponse.json({ error: 'merchant_id required' }, { status: 400 });
  }
  const analytics = await getMerchantSalesAnalytics(merchantId);
  return NextResponse.json(analytics);
}
