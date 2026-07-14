import { NextRequest, NextResponse } from 'next/server';
import {
  publishMerchantAdToStudioFeed,
  type MerchantAdPublishTarget,
} from '@/lib/server/merchantAdPublish';
import { attachAdVideoToProduct, saveMerchantCatalogProduct } from '@/lib/server/merchantCatalog';
import { setJobProductLink } from '@/lib/server/merchantAdJobProductLinks';
import { getAdVideoJob } from '@/lib/server/merchantAdVideoStore';
import { proxyMerchantAd } from '@/lib/server/merchantAdProxy';

async function resolveJobMedia(jobId: string) {
  const local = await getAdVideoJob(jobId);
  if (local?.output_video_url) {
    return { video_url: local.output_video_url, poster_url: local.output_poster_url };
  }
  const proxied = await proxyMerchantAd<{ job: { output_video_url?: string; output_poster_url?: string } }>(
    `/api/aivos/merchant-ad/jobs/${encodeURIComponent(jobId)}`,
  );
  if (proxied.ok && proxied.data.job?.output_video_url) {
    const base = process.env.MEERAK_BACKEND_URL || 'http://127.0.0.1:3001';
    let url = proxied.data.job.output_video_url;
    if (url.startsWith('/api/aivos/')) url = `${base.replace(/\/$/, '')}${url}`;
    let poster = proxied.data.job.output_poster_url;
    if (poster?.startsWith('/api/aivos/')) poster = `${base.replace(/\/$/, '')}${poster}`;
    return { video_url: url, poster_url: poster };
  }
  return null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const jobId = String(body.job_id || body.jobId || '');
  const merchantId = String(body.merchant_id || body.merchantId || '');
  const target = (body.target || 'studio_feed') as MerchantAdPublishTarget;
  const product = body.product;

  if (!jobId || !merchantId) {
    return NextResponse.json({ ok: false, error: 'job_id and merchant_id required' }, { status: 400 });
  }

  let productId = String(body.product_id || body.productId || '');
  if (product && typeof product === 'object' && product.title) {
    const priceThb = Number(product.price_thb ?? product.priceThb);
    if (!Number.isFinite(priceThb) || priceThb <= 0) {
      return NextResponse.json({ ok: false, error: 'price_thb invalid' }, { status: 400 });
    }
    const saved = await saveMerchantCatalogProduct({
      merchantId,
      productId: productId || product.product_id || product.productId || undefined,
      title: String(product.title).trim(),
      description: String(product.description || ''),
      benefits: String(product.benefits || ''),
      size_guide: product.size_guide || product.sizeGuide || undefined,
      price_thb: priceThb,
      stock: Math.max(0, Number(product.stock) || 0),
      category: String(product.category || 'general'),
      image_url: product.image_url || product.imageUrl || undefined,
    });
    productId = saved.id;
    await setJobProductLink(jobId, { product_id: saved.id, product_title: saved.title });
  }

  const result = await publishMerchantAdToStudioFeed({ jobId, merchantId, target, productId: productId || undefined });
  if (!result.ok) {
    const status = result.error === 'job_not_found' ? 404 : result.error === 'job_not_ready' ? 409 : 500;
    return NextResponse.json(result, { status });
  }

  const finalProductId = productId;
  if (finalProductId) {
    const media = await resolveJobMedia(jobId);
    if (media?.video_url) {
      await attachAdVideoToProduct({
        productId: finalProductId,
        merchantId,
        videoUrl: media.video_url,
        posterUrl: media.poster_url,
        jobId,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    ...result,
    product_id: finalProductId || undefined,
    post: { post_id: result.post_id, media_id: result.media_id },
  });
}
