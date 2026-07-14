import { NextRequest, NextResponse } from 'next/server';
import { allowLocalOrders } from '@/lib/server-env';
import { setRiderOnline } from '@/lib/server/riderPresence';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const riderId = body.rider_id || req.headers.get('x-rider-id') || '';
  if (!riderId) {
    return NextResponse.json({ error: 'rider_id required' }, { status: 400 });
  }
  if (!allowLocalOrders()) {
    return NextResponse.json({ error: 'status_unavailable' }, { status: 503 });
  }
  const online = body.online !== false;
  const presence = await setRiderOnline(riderId, online);
  return NextResponse.json({ ok: true, presence });
}
