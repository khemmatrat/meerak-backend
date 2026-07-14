import { NextRequest, NextResponse } from 'next/server';
import { recordAffiliateClick } from '@/lib/server/affiliateStats';
import { kongFetch } from '@/lib/server/kongFetch';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const creatorId = body.creator_id;
  const productId = body.product_id;
  if (!creatorId || !productId) {
    return NextResponse.json({ error: 'creator_id and product_id required' }, { status: 400 });
  }

  await recordAffiliateClick(creatorId, productId);

  await kongFetch('/api/v1/rec/v1/signals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: body.buyer_id || 'guest',
      post_id: body.post_id || productId,
      signal: 'affiliate_click',
      value: 1,
      metadata: { creator_id: creatorId, product_id: productId },
    }),
  });

  return NextResponse.json({ ok: true });
}
