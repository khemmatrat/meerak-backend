import { NextRequest, NextResponse } from 'next/server';
import { listMerchantAudit } from '@/lib/server/merchantAudit';

export async function GET(req: NextRequest) {
  const merchantId = req.nextUrl.searchParams.get('merchant_id');
  if (!merchantId) {
    return NextResponse.json({ error: 'merchant_id required' }, { status: 400 });
  }
  const events = await listMerchantAudit(merchantId);
  return NextResponse.json({ merchant_id: merchantId, events });
}
