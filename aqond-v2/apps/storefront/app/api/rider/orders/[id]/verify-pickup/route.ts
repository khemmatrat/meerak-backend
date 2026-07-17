import { NextRequest, NextResponse } from 'next/server';
import { localAdvanceDispatchPhase } from '@/lib/server/localDispatch';
import { verifyPickupQr } from '@/lib/server/pickupVerification';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id: orderId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const qrRaw = String(body.qr_payload || body.qr_raw || body.encoded || '');
  const riderId = String(body.rider_id || req.headers.get('x-rider-id') || '');
  const jobId = String(body.job_id || '');

  if (!qrRaw) {
    return NextResponse.json({ result: 'FAILED', error: 'qr_payload required' }, { status: 400 });
  }

  const outcome = await verifyPickupQr({
    orderId,
    qrRaw,
    riderId: riderId || undefined,
    deviceId: body.device_id ? String(body.device_id) : undefined,
    gpsLat: body.gps_lat != null ? Number(body.gps_lat) : undefined,
    gpsLng: body.gps_lng != null ? Number(body.gps_lng) : undefined,
    accuracy: body.accuracy != null ? Number(body.accuracy) : undefined,
    jobMerchantId: body.merchant_id ? String(body.merchant_id) : undefined,
  });

  if (outcome.result !== 'SUCCESS') {
    const result =
      outcome.result === 'WRONG_ORDER' || outcome.result === 'WRONG_MERCHANT'
        ? 'FAILED'
        : outcome.result;
    const status =
      outcome.result === 'EXPIRED' || outcome.result === 'INVALID_SIGNATURE' ? 400 : 409;
    return NextResponse.json(
      { result, detail: outcome.result, order_id: orderId, record: outcome.record || null },
      { status },
    );
  }

  if (jobId) {
    await localAdvanceDispatchPhase(jobId, {
      phase: 'qr_verified',
      rider_id: riderId || undefined,
      lat: body.gps_lat,
      lng: body.gps_lng,
    });
  }

  return NextResponse.json({
    result: 'SUCCESS',
    order_id: orderId,
    record: outcome.record,
  });
}
