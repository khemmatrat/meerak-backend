import { NextRequest, NextResponse } from 'next/server';
import { updateDispatchLocation } from '@/lib/server/dispatchSvc';
import { allowLocalOrders } from '@/lib/server-env';
import { updateRiderTelemetry } from '@/lib/server/riderPresence';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const riderId = body.rider_id || req.headers.get('x-rider-id') || '';
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'lat/lng required' }, { status: 400 });
  }
  const data = await updateDispatchLocation(id, lat, lng);
  if (!data && allowLocalOrders() && riderId) {
    await updateRiderTelemetry(riderId, {
      lat,
      lng,
      current_job_id: id,
      online: true,
    });
    return NextResponse.json({ ok: true, source: 'local-telemetry' });
  }
  if (!data) {
    return NextResponse.json({ error: 'dispatch_unavailable' }, { status: 503 });
  }
  if (riderId) {
    await updateRiderTelemetry(riderId, { lat, lng, current_job_id: id, online: true }).catch(() => null);
  }
  return NextResponse.json(data);
}
