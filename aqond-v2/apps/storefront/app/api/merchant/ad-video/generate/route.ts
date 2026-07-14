import { NextRequest, NextResponse } from 'next/server';

import {

  createAdVideoJob,

  getAdVideoJob,

  getAdVideoQuota,

  saveAdVideoJob,

} from '@/lib/server/merchantAdVideoStore';

import { runAdVideoGeneration } from '@/lib/server/merchantAdVideoPipeline';

import { proxyMerchantAd } from '@/lib/server/merchantAdProxy';

import {

  deductTokensLocal,

  extendQuota,

  TOKENS_PER_VIDEO,

} from '@/lib/server/merchantAdTokens';



function shopType(merchantId: string): 'marketplace' | 'food' {

  return String(merchantId).startsWith('food-') ? 'food' : 'marketplace';

}



function estimateLocalSec(shots: number) {

  return shots * 4 + 20;

}



export async function POST(req: NextRequest) {

  try {

    const body = await req.json();

    const merchantId = String(body.merchant_id || '');

    const ownerId = String(body.owner_id || 'guest');

    if (!merchantId) {

      return NextResponse.json({ error: 'merchant_id required' }, { status: 400 });

    }

    if (!body.brief?.shots?.length) {

      return NextResponse.json({ error: 'brief_required' }, { status: 400 });

    }



    const storefrontBase = (process.env.STOREFRONT_INTERNAL_URL || 'http://127.0.0.1:3003').replace(/\/$/, '');

    const proxyBody = { ...body };

    if (typeof proxyBody.product_image_url === 'string' && proxyBody.product_image_url.startsWith('/')) {

      proxyBody.product_image_url = `${storefrontBase}${proxyBody.product_image_url}`;

    }



    const proxied = await proxyMerchantAd<{ job: unknown; quota: unknown; async?: boolean }>(

      '/api/aivos/merchant-ad/generate',

      { method: 'POST', body: JSON.stringify(proxyBody) },

    );

    if (proxied.ok) {

      const job = (proxied.data as { job?: Record<string, unknown> }).job;

      const quota = (proxied.data as { quota?: unknown }).quota;

      const j = job as { output_video_url?: string; output_poster_url?: string };

      const base = process.env.MEERAK_BACKEND_URL || 'http://127.0.0.1:3001';

      if (j?.output_video_url?.startsWith('/api/aivos/')) {

        j.output_video_url = `${base.replace(/\/$/, '')}${j.output_video_url}`;

      }

      if (j?.output_poster_url?.startsWith('/api/aivos/')) {

        j.output_poster_url = `${base.replace(/\/$/, '')}${j.output_poster_url}`;

      }

      return NextResponse.json({ job, quota, async: true, _source: 'aivos' }, { status: 202 });

    }



    const allowKenburns = process.env.MERCHANT_AD_ALLOW_KENBURNS_FALLBACK === '1';

    if (!allowKenburns) {

      return NextResponse.json(

        {

          error: proxied.status === 402 ? 'insufficient_tokens' : 'aivos_unavailable',

          hint: 'ระบบ AI วิดีโอ (Grok) ไม่พร้อม — restart backend แล้วลองใหม่',

          detail: proxied.status || 'connection_failed',

        },

        { status: proxied.status === 402 ? 402 : 503 },

      );

    }



    const weekly = await getAdVideoQuota(merchantId);

    const quota = await extendQuota(merchantId, weekly);

    if (!quota.can_generate) {

      return NextResponse.json({ error: 'insufficient_tokens', quota }, { status: 402 });

    }

    const useTokens = weekly.remaining <= 0;

    const shotCount = body.brief.shots.length;



    const job = createAdVideoJob({

      merchant_id: merchantId,

      owner_id: ownerId,

      shop_type: shopType(merchantId),

      product_id: body.product_id ? String(body.product_id) : undefined,

      product_title: String(body.product_title || body.brief.title || 'สินค้า'),

      product_image_url: body.product_image_url ? String(body.product_image_url) : undefined,

      brief: body.brief,

      guide: body.guide || {},

    });

    job.status = 'generating';

    job.progress_pct = 2;

    (job as { estimated_sec?: number }).estimated_sec = estimateLocalSec(shotCount);

    await saveAdVideoJob(job);



    void runAdVideoGeneration(job.id)

      .then(async (completed) => {

        if (completed.status === 'completed' && useTokens) {

          await deductTokensLocal(merchantId, TOKENS_PER_VIDEO);

        }

      })

      .catch(async () => {

        const j = await getAdVideoJob(job.id);

        if (j && j.status === 'generating') {

          j.status = 'failed';

          j.error = 'render_failed';

          await saveAdVideoJob(j);

        }

      });



    return NextResponse.json(

      {

        job,

        quota,

        async: true,

        _source: 'storefront_fallback',

      },

      { status: 202 },

    );

  } catch (e) {

    console.error('[ad-video generate]', e);

    return NextResponse.json({ error: 'generate_failed' }, { status: 500 });

  }

}

