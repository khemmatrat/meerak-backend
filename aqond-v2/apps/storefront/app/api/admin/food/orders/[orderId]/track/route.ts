import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminKey } from '@/lib/server/merchantAdmin';
import { buildTrackOsProjection } from '@/lib/server/trackOsProjection';

type Ctx = { params: Promise<{ orderId: string }> };

function check(req: NextRequest) {
  const key = req.headers.get('x-admin-key') || req.nextUrl.searchParams.get('admin_key');
  return verifyAdminKey(key);
}

export async function GET(req: NextRequest, ctx: Ctx) {
  if (!check(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { orderId } = await ctx.params;
  const projection = await buildTrackOsProjection(orderId);
  if (!projection) {
    return NextResponse.json({ error: 'track_not_found', order_id: orderId }, { status: 404 });
  }
  return NextResponse.json({ ok: true, ...projection });
}
