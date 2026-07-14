import { NextRequest, NextResponse } from 'next/server';
import { buildShopDetail } from '@/lib/server/shopDetail';
import { isFollowingShop } from '@/lib/server/shopFollowStore';

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const shopId = ctx.params.id;
  const userId = req.nextUrl.searchParams.get('user_id') || '';

  try {
    const detail = await buildShopDetail(shopId);
    if ('redirect' in detail) {
      return NextResponse.json({ redirect: detail.redirect });
    }

    const following = userId ? await isFollowingShop(userId, shopId) : false;
    return NextResponse.json({ ...detail, following });
  } catch (e) {
    console.error('[shop detail]', e);
    return NextResponse.json({ error: 'shop_load_failed' }, { status: 500 });
  }
}
