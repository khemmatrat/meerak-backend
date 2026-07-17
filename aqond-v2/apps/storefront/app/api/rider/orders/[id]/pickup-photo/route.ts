import { NextRequest, NextResponse } from 'next/server';
import { localAdvanceDispatchPhase } from '@/lib/server/localDispatch';
import { completePickupVerification, savePickupProofPhoto } from '@/lib/server/pickupVerification';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id: orderId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const riderId = String(body.rider_id || req.headers.get('x-rider-id') || '');
  const jobId = String(body.job_id || '');
  const imageDataUrl = String(body.image_data_url || body.photo_url || '');

  if (!imageDataUrl.startsWith('data:image/')) {
    return NextResponse.json({ error: 'image_data_url required' }, { status: 400 });
  }

  const saved = await savePickupProofPhoto({
    orderId,
    riderId: riderId || undefined,
    imageDataUrl,
    deviceId: body.device_id ? String(body.device_id) : undefined,
    gpsLat: body.gps_lat != null ? Number(body.gps_lat) : undefined,
    gpsLng: body.gps_lng != null ? Number(body.gps_lng) : undefined,
    accuracy: body.accuracy != null ? Number(body.accuracy) : undefined,
  });

  if (!saved.ok) {
    return NextResponse.json({ error: saved.code }, { status: 409 });
  }

  const completed = await completePickupVerification({
    orderId,
    riderId: riderId || undefined,
    jobId: jobId || undefined,
  });
  if (!completed.ok) {
    return NextResponse.json({ error: completed.code, record: saved.record }, { status: 409 });
  }

  if (jobId) {
    await localAdvanceDispatchPhase(jobId, {
      phase: 'pickup_photo',
      rider_id: riderId || undefined,
      photo_url: saved.record.pickup_photo_url,
      lat: body.gps_lat,
      lng: body.gps_lng,
    });
    await localAdvanceDispatchPhase(jobId, {
      phase: 'rider_picked_up',
      rider_id: riderId || undefined,
      lat: body.gps_lat,
      lng: body.gps_lng,
    });
  }

  return NextResponse.json({
    ok: true,
    order_id: orderId,
    record: completed.record,
    pickup_photo_url: saved.record.pickup_photo_url,
  });
}
