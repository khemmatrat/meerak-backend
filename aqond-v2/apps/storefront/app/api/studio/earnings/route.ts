import { NextRequest, NextResponse } from 'next/server';
import { kongJson } from '@/lib/server/kongFetch';
import { getCreatorEarnings } from '@/lib/server/affiliateStats';

export async function GET(req: NextRequest) {
  const creatorId = req.nextUrl.searchParams.get('creator_id');
  if (!creatorId) {
    return NextResponse.json({ error: 'creator_id required' }, { status: 400 });
  }

  const remote = await kongJson<any>(
    `/api/v1/bff/v1/creator/studio?creator_id=${encodeURIComponent(creatorId)}`,
  );

  const local = await getCreatorEarnings(creatorId);

  if (remote?.revenue) {
    const links = remote.affiliate_links?.length ? remote.affiliate_links : local.affiliate_links;
    return NextResponse.json({
      ...remote,
      affiliate_links: links,
      local_overlay: local.totals,
      source: 'bff',
    });
  }

  return NextResponse.json(local);
}
