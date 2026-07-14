import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminKey } from '@/lib/server/merchantAdmin';
import { getUnifiedOrderTimeline } from '@/lib/server/orderTimeline';

type Ctx = { params: Promise<{ orderId: string }> };

function check(req: NextRequest) {
  const key = req.headers.get('x-admin-key') || req.nextUrl.searchParams.get('admin_key');
  return verifyAdminKey(key);
}

export async function GET(req: NextRequest, ctx: Ctx) {
  if (!check(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { orderId } = await ctx.params;
  const timeline = await getUnifiedOrderTimeline(orderId);
  return NextResponse.json({ ok: true, ...timeline });
}
