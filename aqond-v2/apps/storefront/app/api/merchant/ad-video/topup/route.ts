import { NextRequest, NextResponse } from 'next/server';
import { getAdVideoQuota } from '@/lib/server/merchantAdVideoStore';
import { extendQuota, topUpTokensLocal } from '@/lib/server/merchantAdTokens';
import { proxyMerchantAd } from '@/lib/server/merchantAdProxy';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const merchantId = String(body.merchant_id || body.merchantId || '');
    if (!merchantId) {
      return NextResponse.json({ error: 'merchant_id required' }, { status: 400 });
    }

    const proxied = await proxyMerchantAd<{ tokens_added: number; balance: number; quota: unknown }>(
      '/api/aivos/merchant-ad/tokens/topup',
      { method: 'POST', body: JSON.stringify(body) },
    );
    if (proxied.ok) {
      return NextResponse.json({ ok: true, ...proxied.data });
    }

    const result = await topUpTokensLocal(merchantId, {
      packageId: body.package_id || body.packageId,
      customThb: body.custom_thb ?? body.customThb,
    });
    const weekly = await getAdVideoQuota(merchantId);
    const quota = await extendQuota(merchantId, weekly);
    return NextResponse.json({
      ok: true,
      ...result,
      quota,
      _source: 'storefront_fallback',
      hint: 'โหมดทดสอบ — ชำระเงินจริงจะเชื่อม wallet/Pay ใน production',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'topup_failed';
    const status = msg === 'min_topup_99' ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
