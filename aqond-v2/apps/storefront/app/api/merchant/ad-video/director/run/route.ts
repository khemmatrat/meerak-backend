import { NextRequest, NextResponse } from 'next/server';

import { absolutizeDirectorImageUrls, absolutizeDirectorJobUrls } from '@/lib/server/merchantAdDirectorBody';
import { tryLocalDirectorRun } from '@/lib/server/merchantAdDirectorLocal';
import { proxyMerchantAd } from '@/lib/server/merchantAdProxy';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const merchantId = String(body.merchant_id || '');
    if (!merchantId) {
      return NextResponse.json({ error: 'merchant_id required' }, { status: 400 });
    }

    const proxyBody = absolutizeDirectorImageUrls(body);
    const proxied = await proxyMerchantAd<{
      job?: Record<string, unknown>;
      quota?: unknown;
      async?: boolean;
    }>('/api/aivos/merchant-ad/director/run', {
      method: 'POST',
      body: JSON.stringify(proxyBody),
    });

    if (proxied.ok) {
      const data = proxied.data;
      const job = data.job ? absolutizeDirectorJobUrls(data.job) : data.job;
      return NextResponse.json(
        { ...data, job, async: true, _source: 'aivos' },
        { status: 202 },
      );
    }

    try {
      const local = tryLocalDirectorRun(proxyBody);
      if (local?.job) {
        const job = absolutizeDirectorJobUrls(local.job as Record<string, unknown>);
        return NextResponse.json(
          { ...local, job, async: true, _source: 'director-cli' },
          { status: 202 },
        );
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'director_run_failed';
      if (msg.includes('validation') || msg.includes('VALIDATION')) {
        return NextResponse.json(
          { error: 'validation_failed', hint: 'ข้อมูลไม่ผ่านการตรวจสอบ — ดูรายการในตัวอย่าง' },
          { status: 400 },
        );
      }
      if (msg.includes('token') || msg.includes('QUOTA') || msg.includes('402')) {
        return NextResponse.json({ error: 'insufficient_tokens', hint: 'โทเค็นไม่พอ' }, { status: 402 });
      }
    }

    const status = proxied.status || 503;
    return NextResponse.json(
      {
        error:
          status === 402
            ? 'insufficient_tokens'
            : status === 400
              ? 'validation_failed'
              : 'aivos_unavailable',
        hint:
          status === 402
            ? 'โทเค็นไม่พอ — กรุณาเติมเงิน'
            : 'ระบบ AI Director ไม่พร้อม — restart backend (port 3001) แล้วลองใหม่',
        detail: status,
      },
      { status: status === 402 ? 402 : status === 400 ? 400 : 503 },
    );
  } catch (e) {
    console.error('[ad-video director/run]', e);
    return NextResponse.json({ error: 'director_run_failed' }, { status: 500 });
  }
}
