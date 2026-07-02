import { NextRequest, NextResponse } from 'next/server';
import { mergeLocalCarts } from '@/lib/server/localCart';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const guestId = String(body.guest_id || '');
    const userId = String(body.user_id || '');
    if (!guestId || !userId || guestId === userId) {
      return NextResponse.json({ error: 'invalid_merge' }, { status: 400 });
    }
    const result = await mergeLocalCarts(guestId, userId);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'cart_merge_failed' },
      { status: 400 },
    );
  }
}
