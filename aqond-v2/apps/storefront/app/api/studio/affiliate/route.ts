import { NextRequest, NextResponse } from 'next/server';
import { kongJson } from '@/lib/server/kongFetch';
import { listAffiliateLinks, removeAffiliateLink, upsertAffiliateLink } from '@/lib/server/studioStore';

export async function GET(req: NextRequest) {
  const creatorId = req.nextUrl.searchParams.get('creator_id');
  if (!creatorId) {
    return NextResponse.json({ error: 'creator_id required' }, { status: 400 });
  }
  const links = await listAffiliateLinks(creatorId);
  return NextResponse.json({ links, creator_id: creatorId });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const creatorId = body.creator_id || req.nextUrl.searchParams.get('creator_id');
  const productId = body.product_id || req.nextUrl.searchParams.get('product_id');
  if (!creatorId || !productId) {
    return NextResponse.json({ error: 'creator_id and product_id required' }, { status: 400 });
  }
  await removeAffiliateLink(creatorId, productId);
  return NextResponse.json({ ok: true });
}
