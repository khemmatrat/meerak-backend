import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminKey } from '@/lib/server/merchantAdmin';
import { listRecentEvents } from '@/lib/server/aqondEventBus';

function check(req: NextRequest) {
  const key = req.headers.get('x-admin-key') || req.nextUrl.searchParams.get('admin_key');
  return verifyAdminKey(key);
}

export async function GET(req: NextRequest) {
  if (!check(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const limit = Math.min(500, Number(req.nextUrl.searchParams.get('limit') || 100));
  const orderId = req.nextUrl.searchParams.get('order_id') || '';
  if (orderId) {
    const { getUnifiedOrderTimeline } = await import('@/lib/server/orderTimeline');
    const timeline = await getUnifiedOrderTimeline(orderId);
    return NextResponse.json({ ok: true, ...timeline });
  }
  const events = await listRecentEvents(limit);
  return NextResponse.json({ ok: true, events });
}
