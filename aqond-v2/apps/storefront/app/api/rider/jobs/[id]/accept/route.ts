import { NextRequest, NextResponse } from 'next/server';
import { acceptDispatchJob, rejectDispatchJob } from '@/lib/server/dispatchSvc';
import { checkRiderFaceActionServer } from '@/lib/server/riderFaceGate';
import { shouldSkipRiderFaceVerify } from '@/lib/server/riderDevLab';
import { proxyRiderCodReserve } from '@/lib/server/riderCodProxy';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const riderId = body.rider_id || req.headers.get('x-rider-id') || '';
  if (!riderId) {
    return NextResponse.json({ error: 'rider_id required' }, { status: 400 });
  }

  const auth = upstreamAuthFromRequest(req);
  const userId = auth.userId || body.user_id || '';
  if (userId && !shouldSkipRiderFaceVerify()) {
    const faceCheck = await checkRiderFaceActionServer(
      {
        rider_id: riderId,
        action: 'accept_job',
        face_session_token: body.face_session_token || body.faceSessionToken,
        device_fingerprint: body.device_fingerprint || body.deviceFingerprint,
        lat: body.lat != null ? Number(body.lat) : undefined,
        lng: body.lng != null ? Number(body.lng) : undefined,
        job_type: body.job_type || body.jobType,
        payment_method: body.payment_method || body.paymentMethod,
        amount_micro: body.amount_micro ?? body.amountMicro,
      },
      { ...auth, userId },
    );
    if (!faceCheck.ok) {
      return NextResponse.json(faceCheck, { status: 403 });
    }
  }

  const riderVehicle = body.vehicle || body.rider_vehicle || req.headers.get('x-rider-vehicle') || undefined;
  const data = await acceptDispatchJob(id, riderId, upstreamAuthFromRequest(req), riderVehicle);
  if (!data) {
    return NextResponse.json({ error: 'dispatch_unavailable' }, { status: 503 });
  }
  if ('error' in data && data.error === 'insufficient_credit') {
    return NextResponse.json(data, { status: 402 });
  }
  if ('error' in data && data.error === 'vehicle_job_type_mismatch') {
    return NextResponse.json(
      { ...data, message: (data as { message?: string }).message || 'ยานพาหนะของคุณไม่รองรับงานประเภทนี้' },
      { status: 409 },
    );
  }
  if ('error' in data && data.error === 'cod_limit_exceeded') {
    return NextResponse.json(data, { status: 409 });
  }

  // COD tier-cap reservation (PROVISIONAL) — storefront accepts via dispatch-svc;
  // backend hold lives in riderCodLedger (Postgres ledger, not JSON store).
  let codWarning: Record<string, unknown> | null = null;
  const pm = String(body.payment_method || body.paymentMethod || (data as { job?: { payment_method?: string } }).job?.payment_method || '').toLowerCase();
  const amtMicro = Number(
    body.amount_micro ?? body.amountMicro ?? (data as { job?: { amount_micro?: number } }).job?.amount_micro ?? 0,
  );
  if (userId && (pm === 'cod' || !pm) && amtMicro > 0) {
    const cod = await proxyRiderCodReserve(auth, id, {
      amount_micro: amtMicro,
      payment_method: pm || 'cod',
      order_id: (data as { job?: { order_id?: string } }).job?.order_id,
    });
    if (!cod.ok) {
      const codData = cod.data as Record<string, unknown>;
      if (codData?.code === 'cod_limit_exceeded') {
        await rejectDispatchJob(id, riderId, 'cod_limit_exceeded', auth);
        return NextResponse.json(
          {
            error: 'cod_limit_exceeded',
            message: 'เกินเพดาน COD ที่รับได้ — ยกเลิกการรับงานแล้ว',
            ...codData,
          },
          { status: 409 },
        );
      }
      codWarning = codData;
    }
  }

  return NextResponse.json({ ...data, ...(codWarning ? { cod_warning: codWarning } : {}) });
}
