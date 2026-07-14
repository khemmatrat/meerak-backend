import { NextRequest, NextResponse } from 'next/server';
import { allowLocalDev } from '@/lib/server-env';
import { merchantOpsAvailable, merchantOpsFetch } from '@/lib/server/merchantOpsClient';
import { getMerchantFeeSummary } from '@/lib/server/merchantFeeEngine';
import { syncMerchantWallet } from '@/lib/server/merchantWallet';

export async function GET(req: NextRequest) {
  const merchantId = req.nextUrl.searchParams.get('merchant_id');
  if (!merchantId) {
    return NextResponse.json({ error: 'merchant_id required' }, { status: 400 });
  }

  if (merchantOpsAvailable()) {
    const remote = await merchantOpsFetch<{ wallet: unknown; fees: unknown; source?: string }>(
      `/v1/merchant-ops/wallet?merchant_id=${encodeURIComponent(merchantId)}`,
    );
    if (remote?.wallet) {
      return NextResponse.json({ wallet: remote.wallet, fees: remote.fees, source: remote.source || 'merchant-ops-pg' });
    }
  }

  if (!allowLocalDev()) {
    return NextResponse.json({ error: 'merchant_wallet_unavailable' }, { status: 503 });
  }
  const fees = await getMerchantFeeSummary(merchantId);
  const wallet = await syncMerchantWallet(merchantId, fees);
  return NextResponse.json({ wallet, fees, source: 'local-dev' });
}
