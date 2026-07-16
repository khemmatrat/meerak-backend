import { NextRequest, NextResponse } from 'next/server';
import { acceptDispatchJob } from '@/lib/server/dispatchSvc';
import { checkRiderFaceActionServer } from '@/lib/server/riderFaceGate';
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
  if (userId) {
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

  const data = await acceptDispatchJob(id, riderId, upstreamAuthFromRequest(req));
  if (!data) {
    return NextResponse.json({ error: 'dispatch_unavailable' }, { status: 503 });
  }
  if ('error' in data && data.error === 'insufficient_credit') {
    return NextResponse.json(data, { status: 402 });
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
    if (!cod.ok) codWarning = cod.data as Record<string, unknown>;
  }

  return NextResponse.json({ ...data, ...(codWarning ? { cod_warning: codWarning } : {}) });
}
