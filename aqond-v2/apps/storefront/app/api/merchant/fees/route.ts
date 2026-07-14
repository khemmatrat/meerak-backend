import { NextRequest, NextResponse } from 'next/server';
import { allowLocalDev } from '@/lib/server-env';
import { merchantOpsAvailable, merchantOpsFetch } from '@/lib/server/merchantOpsClient';
import { getMerchantFeeSummary } from '@/lib/server/merchantFeeEngine';

export async function GET(req: NextRequest) {
  const merchantId = req.nextUrl.searchParams.get('merchant_id');
  if (!merchantId) {
    return NextResponse.json({ error: 'merchant_id required' }, { status: 400 });
  }

  if (merchantOpsAvailable()) {
    const remote = await merchantOpsFetch<Record<string, unknown>>(
      `/v1/merchant-ops/fees?merchant_id=${encodeURIComponent(merchantId)}`,
    );
    if (remote?.merchant_id) {
      return NextResponse.json(remote);
    }
  }

  if (!allowLocalDev()) {
    return NextResponse.json({ error: 'merchant_fees_unavailable' }, { status: 503 });
  }
  const summary = await getMerchantFeeSummary(merchantId);
  return NextResponse.json({ ...summary, source: 'local-dev' });
}
