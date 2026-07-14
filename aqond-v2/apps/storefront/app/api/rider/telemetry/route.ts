import { NextRequest, NextResponse } from 'next/server';
import { allowLocalOrders } from '@/lib/server-env';
import { updateRiderTelemetry } from '@/lib/server/riderPresence';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const riderId = body.rider_id || req.headers.get('x-rider-id') || '';
  if (!riderId) {
    return NextResponse.json({ error: 'rider_id required' }, { status: 400 });
  }
  if (!allowLocalOrders()) {
    return NextResponse.json({ error: 'telemetry_unavailable' }, { status: 503 });
  }
  const presence = await updateRiderTelemetry(riderId, {
    lat: body.lat != null ? Number(body.lat) : undefined,
    lng: body.lng != null ? Number(body.lng) : undefined,
    speed_kmh: body.speed_kmh != null ? Number(body.speed_kmh) : undefined,
    battery_pct: body.battery_pct != null ? Number(body.battery_pct) : undefined,
    heading: body.heading != null ? Number(body.heading) : undefined,
    current_job_id: body.current_job_id,
    online: body.online,
  });
  return NextResponse.json({ ok: true, presence });
}
