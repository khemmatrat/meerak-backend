import { NextRequest, NextResponse } from 'next/server';
import { countUnreadMerchantReturns } from '@/lib/server/merchantReturnInbox';
import { listMerchantReturnSummaries } from '@/lib/server/returnService';

export const dynamic = 'force-dynamic';

/** Merchant inbox — return/refund requests from buyers. */
export async function GET(req: NextRequest) {
  const merchantId = req.nextUrl.searchParams.get('merchant_id') || '';
  if (!merchantId) {
    return NextResponse.json({ ok: false, error: 'merchant_id_required' }, { status: 400 });
  }

  const [returns, unread_count] = await Promise.all([
    listMerchantReturnSummaries(merchantId),
    countUnreadMerchantReturns(merchantId),
  ]);

  return NextResponse.json({
    ok: true,
    merchant_id: merchantId,
    returns,
    count: returns.length,
    unread_count,
  });
}
