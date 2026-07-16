import { NextRequest, NextResponse } from 'next/server';
import { allowLocalDev, meerakBackendBase } from '@/lib/server-env';
import { localSetRiderPortrait } from '@/lib/server/localDispatchRiders';
import { upstreamAuthFromRequest, upstreamAuthHeaders } from '@/lib/server/upstreamAuth';

export async function POST(req: NextRequest) {
  const auth = upstreamAuthFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const base = meerakBackendBase();
  const res = await fetch(`${base}/api/rider-os/kyc/submit`, {
    method: 'POST',
    headers: upstreamAuthHeaders(auth),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const data = await res.json().catch(() => ({}));

  if (res.ok && allowLocalDev() && body.selfiePhotoUrl && body.rider_id) {
    await localSetRiderPortrait(String(body.rider_id), String(body.selfiePhotoUrl)).catch(() => null);
  } else if (res.ok && allowLocalDev() && body.selfiePhotoUrl && auth.userId) {
    const { localGetRiderByUserId } = await import('@/lib/server/localDispatchRiders');
    const local = await localGetRiderByUserId(auth.userId);
    if (local) {
      await localSetRiderPortrait(local.rider_id, String(body.selfiePhotoUrl)).catch(() => null);
    }
  }

  return NextResponse.json(data, { status: res.status });
}