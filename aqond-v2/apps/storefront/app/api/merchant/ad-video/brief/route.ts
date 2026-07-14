import { NextRequest, NextResponse } from 'next/server';
import { fetchAdBriefFromAiCore } from '@/lib/server/merchantAdVideoPipeline';
import { proxyMerchantAd } from '@/lib/server/merchantAdProxy';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const merchantId = String(body.merchant_id || '');

    const proxied = await proxyMerchantAd<{ brief: Awaited<ReturnType<typeof fetchAdBriefFromAiCore>> }>(
      '/api/aivos/merchant-ad/brief',
      { method: 'POST', body: JSON.stringify(body) },
    );
    if (proxied.ok && proxied.data.brief) {
      return NextResponse.json({ brief: proxied.data.brief, _source: 'aivos' });
    }

    const brief = await fetchAdBriefFromAiCore({
      merchant_id: merchantId,
      merchant_name: String(body.merchant_name || ''),
      product_title: String(body.product_title || 'สินค้า'),
      product_id: String(body.product_id || ''),
      category_style: String(body.category_style || 'general'),
      mood: String(body.mood || 'premium'),
      audience: String(body.audience || 'all'),
      hook: String(body.hook || 'quality'),
      visual_notes: String(body.visual_notes || ''),
    });
    return NextResponse.json({ brief, _source: 'storefront_fallback' });
  } catch (e) {
    console.error('[ad-video brief]', e);
    return NextResponse.json({ error: 'brief_failed' }, { status: 500 });
  }
}
