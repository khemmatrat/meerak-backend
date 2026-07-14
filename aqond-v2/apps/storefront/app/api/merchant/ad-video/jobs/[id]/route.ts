import { NextRequest, NextResponse } from 'next/server';

import { getAdVideoJob, saveAdVideoJob } from '@/lib/server/merchantAdVideoStore';
import { setJobProductLink } from '@/lib/server/merchantAdJobProductLinks';

import { proxyMerchantAd } from '@/lib/server/merchantAdProxy';



function absolutizeJobUrls(job: Record<string, unknown>) {

  const base = process.env.MEERAK_BACKEND_URL || 'http://127.0.0.1:3001';

  const j = { ...job };

  if (typeof j.output_video_url === 'string' && j.output_video_url.startsWith('/api/aivos/')) {

    j.output_video_url = `${base.replace(/\/$/, '')}${j.output_video_url}`;

  }

  if (typeof j.output_poster_url === 'string' && j.output_poster_url.startsWith('/api/aivos/')) {

    j.output_poster_url = `${base.replace(/\/$/, '')}${j.output_poster_url}`;

  }

  return j;

}



export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  const jobId = ctx.params.id;



  if (jobId.startsWith('mad-')) {

    const proxied = await proxyMerchantAd<{ job: Record<string, unknown> }>(

      `/api/aivos/merchant-ad/jobs/${encodeURIComponent(jobId)}`,

    );

    if (proxied.ok && proxied.data.job) {

      return NextResponse.json({ job: absolutizeJobUrls(proxied.data.job) });

    }

  }



  const job = await getAdVideoJob(jobId);

  if (!job) {

    return NextResponse.json({ error: 'not_found' }, { status: 404 });

  }

  return NextResponse.json({ job });

}

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const jobId = ctx.params.id;
  const body = await req.json().catch(() => ({}));
  const productId = String(body.product_id || body.productId || '');
  const productTitle = body.product_title || body.productTitle;

  if (productId) {
    await setJobProductLink(jobId, {
      product_id: productId,
      product_title: productTitle ? String(productTitle) : undefined,
    });
  }

  const job = await getAdVideoJob(jobId);
  if (!job) {
    return NextResponse.json({
      ok: true,
      job: { id: jobId, product_id: productId || undefined, product_title: productTitle },
    });
  }

  if (productId) job.product_id = productId;
  if (productTitle) job.product_title = String(productTitle);

  await saveAdVideoJob(job);
  return NextResponse.json({ ok: true, job });
}

