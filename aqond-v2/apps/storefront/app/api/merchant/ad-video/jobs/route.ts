import { NextRequest, NextResponse } from 'next/server';
import { getAdVideoQuota, listAdVideoJobs } from '@/lib/server/merchantAdVideoStore';
import { extendQuota } from '@/lib/server/merchantAdTokens';
import { proxyMerchantAd } from '@/lib/server/merchantAdProxy';
import { getJobProductLink } from '@/lib/server/merchantAdJobProductLinks';

async function mergeJobProductLinks<T extends { id: string; product_id?: string; product_title?: string }>(
  jobs: T[],
): Promise<T[]> {
  return Promise.all(
    jobs.map(async (j) => {
      if (j.product_id) return j;
      const link = await getJobProductLink(j.id);
      if (!link) return j;
      return { ...j, product_id: link.product_id, product_title: link.product_title || j.product_title };
    }),
  );
}

export async function GET(req: NextRequest) {
  const merchantId = req.nextUrl.searchParams.get('merchant_id') || '';
  if (!merchantId) {
    return NextResponse.json({ error: 'merchant_id required' }, { status: 400 });
  }

  const proxied = await proxyMerchantAd<{ jobs: unknown[]; quota: unknown }>(
    `/api/aivos/merchant-ad/jobs?merchant_id=${encodeURIComponent(merchantId)}`,
  );
  if (proxied.ok) {
    const base = process.env.MEERAK_BACKEND_URL || 'http://127.0.0.1:3001';
    const jobs = await mergeJobProductLinks(
      ((proxied.data.jobs || []) as Array<{ id: string; output_video_url?: string; output_poster_url?: string; product_id?: string; product_title?: string }>).map(
        (j) => {
          if (j.output_video_url?.startsWith('/api/aivos/')) {
            j.output_video_url = `${base.replace(/\/$/, '')}${j.output_video_url}`;
          }
          if (j.output_poster_url?.startsWith('/api/aivos/')) {
            j.output_poster_url = `${base.replace(/\/$/, '')}${j.output_poster_url}`;
          }
          return j;
        },
      ),
    );
    return NextResponse.json({ jobs, quota: proxied.data.quota, _source: 'aivos' });
  }

  const jobs = await mergeJobProductLinks(await listAdVideoJobs(merchantId));
  const weekly = await getAdVideoQuota(merchantId);
  const quota = await extendQuota(merchantId, weekly);
  return NextResponse.json({ jobs, quota, _source: 'storefront_fallback' });
}
