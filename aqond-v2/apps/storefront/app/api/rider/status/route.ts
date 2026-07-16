import { NextRequest, NextResponse } from 'next/server';
import { allowLocalOrders } from '@/lib/server-env';
import { setRiderAvailability, setRiderOnline, type RiderAvailability } from '@/lib/server/riderPresence';
import { checkRiderFaceActionServer } from '@/lib/server/riderFaceGate';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const riderId = body.rider_id || req.headers.get('x-rider-id') || '';
  if (!riderId) {
    return NextResponse.json({ error: 'rider_id required' }, { status: 400 });
  }
  if (!allowLocalOrders()) {
    return NextResponse.json({ error: 'status_unavailable' }, { status: 503 });
  }

  const rawAvail = body.availability as RiderAvailability | undefined;
  const goingOnline =
    (rawAvail && rawAvail === 'online') || (rawAvail == null && body.online !== false);

  if (goingOnline) {
    const auth = upstreamAuthFromRequest(req);
    const userId = auth.userId || body.user_id || '';
    if (userId) {
      const faceCheck = await checkRiderFaceActionServer(
        {
          rider_id: riderId,
          action: 'go_online',
          face_session_token: body.face_session_token || body.faceSessionToken,
          device_fingerprint: body.device_fingerprint || body.deviceFingerprint,
          lat: body.lat != null ? Number(body.lat) : undefined,
          lng: body.lng != null ? Number(body.lng) : undefined,
        },
        { ...auth, userId },
      );
      if (!faceCheck.ok) {
        return NextResponse.json(faceCheck, { status: 403 });
      }
    }
  }

  const presence =
    rawAvail && ['online', 'break', 'offline'].includes(rawAvail)
      ? await setRiderAvailability(riderId, rawAvail)
      : await setRiderOnline(riderId, body.online !== false);
  return NextResponse.json({ ok: true, presence });
}
