import { NextRequest, NextResponse } from 'next/server';
import { getAdVideoQuota } from '@/lib/server/merchantAdVideoStore';
import { extendQuota } from '@/lib/server/merchantAdTokens';
import { proxyMerchantAd } from '@/lib/server/merchantAdProxy';

export async function GET(req: NextRequest) {
  const merchantId = req.nextUrl.searchParams.get('merchant_id') || '';
  if (!merchantId) {
    return NextResponse.json({ error: 'merchant_id required' }, { status: 400 });
  }

  const proxied = await proxyMerchantAd<{ quota: Awaited<ReturnType<typeof extendQuota>> }>(
    `/api/aivos/merchant-ad/quota?merchant_id=${encodeURIComponent(merchantId)}`,
  );
  if (proxied.ok) {
    return NextResponse.json(proxied.data.quota || proxied.data);
  }

  const weekly = await getAdVideoQuota(merchantId);
  const quota = await extendQuota(merchantId, weekly);
  return NextResponse.json({ ...quota, _source: 'storefront_fallback' });
}
