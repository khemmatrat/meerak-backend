import { NextRequest, NextResponse } from 'next/server';

import { absolutizeDirectorImageUrls } from '@/lib/server/merchantAdDirectorBody';
import { tryLocalDirectorPlan } from '@/lib/server/merchantAdDirectorLocal';
import { proxyMerchantAd } from '@/lib/server/merchantAdProxy';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const merchantId = String(body.merchant_id || '');
    if (!merchantId) {
      return NextResponse.json({ error: 'merchant_id required' }, { status: 400 });
    }

    const proxyBody = absolutizeDirectorImageUrls(body);
    const proxied = await proxyMerchantAd<Record<string, unknown>>(
      '/api/aivos/merchant-ad/director/plan',
      { method: 'POST', body: JSON.stringify(proxyBody) },
    );

    if (proxied.ok) {
      return NextResponse.json({ ...proxied.data, _source: 'aivos' });
    }

    const local = tryLocalDirectorPlan(proxyBody);
    if (local) {
      return NextResponse.json({ ...local, _source: 'director-cli' });
    }

    return NextResponse.json(
      {
        error: proxied.status === 400 ? 'validation_failed' : 'aivos_unavailable',
        hint: 'ระบบ AI Director ไม่พร้อม — restart backend (port 3001) แล้วลองใหม่',
        detail: proxied.status || 'connection_failed',
      },
      { status: proxied.status === 400 ? 400 : 503 },
    );
  } catch (e) {
    console.error('[ad-video director/plan]', e);
    return NextResponse.json({ error: 'plan_failed' }, { status: 500 });
  }
}
