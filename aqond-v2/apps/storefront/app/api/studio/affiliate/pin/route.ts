import { NextRequest, NextResponse } from 'next/server';
import { kongJson } from '@/lib/server/kongFetch';
import { upsertAffiliateLink } from '@/lib/server/studioStore';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    creator_id: creatorId,
    product_id: productId,
    merchant_id: merchantId = 'demo-merchant',
    title = 'สินค้า',
    price_micro: priceMicro,
    category,
    commission_bps: commissionBps = 500,
  } = body || {};

  if (!creatorId || !productId) {
    return NextResponse.json({ error: 'creator_id and product_id required' }, { status: 400 });
  }

  let syncedRecsys = false;
  let linkId: string | undefined;

  const remote = await kongJson<any>('/api/v1/recsys/v1/affiliate/links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creator_id: creatorId,
      product_id: productId,
      merchant_id: merchantId,
      commission_bps: commissionBps,
    }),
  });
  if (remote) {
    syncedRecsys = true;
    linkId = remote.id || remote.link_id;
  }

  const link = await upsertAffiliateLink({
    creator_id: creatorId,
    product_id: productId,
    merchant_id: merchantId,
    title,
    price_micro: priceMicro,
    category,
    commission_bps: commissionBps,
    synced_recsys: syncedRecsys,
    link_id: linkId,
  });

  return NextResponse.json({
    ok: true,
    link,
    synced_recsys: syncedRecsys,
    mode: syncedRecsys ? 'recsys' : 'local',
  });
}
