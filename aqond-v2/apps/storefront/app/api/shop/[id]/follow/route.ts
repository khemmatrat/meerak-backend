import { NextRequest, NextResponse } from 'next/server';
import { isFollowingShop, toggleShopFollow } from '@/lib/server/shopFollowStore';

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const shopId = ctx.params.id;
  const userId = req.nextUrl.searchParams.get('user_id') || '';
  if (!userId) {
    return NextResponse.json({ following: false });
  }
  const following = await isFollowingShop(userId, shopId);
  return NextResponse.json({ following });
}

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const shopId = ctx.params.id;
  let userId = '';
  try {
    const body = await req.json();
    userId = String(body.user_id || '');
  } catch {
    /* empty */
  }
  if (!userId || userId === 'guest') {
    return NextResponse.json({ error: 'login_required' }, { status: 401 });
  }
  const result = await toggleShopFollow(userId, shopId);
  return NextResponse.json(result);
}
