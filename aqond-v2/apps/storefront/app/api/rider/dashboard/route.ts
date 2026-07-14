import { NextRequest, NextResponse } from 'next/server';
import { allowLocalOrders } from '@/lib/server-env';
import { getRiderDashboard } from '@/lib/server/riderDashboard';

export async function GET(req: NextRequest) {
  const riderId = req.nextUrl.searchParams.get('rider_id') || '';
  if (!riderId) {
    return NextResponse.json({ error: 'rider_id required' }, { status: 400 });
  }
  if (!allowLocalOrders()) {
    return NextResponse.json({ error: 'dashboard_unavailable' }, { status: 503 });
  }
  const dash = await getRiderDashboard(riderId);
  return NextResponse.json({ ok: true, ...dash });
}
