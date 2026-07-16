import { NextRequest, NextResponse } from 'next/server';
import { allowLocalDev, dispatchApi, meerakBackendBase } from '@/lib/server-env';
import { localGetRiderByUserId, localRiderToProfile } from '@/lib/server/localDispatchRiders';
import { upstreamAuthFromRequest, upstreamAuthHeaders } from '@/lib/server/upstreamAuth';

async function fetchKycPortrait(auth: ReturnType<typeof upstreamAuthFromRequest>, userId: string) {
  try {
    const base = meerakBackendBase();
    const res = await fetch(`${base}/api/rider-os/kyc/portrait`, {
      headers: upstreamAuthHeaders({ ...auth, userId }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return data.portrait_url || null;
  } catch {
    return null;
  }
}

/** GET dispatch rider profile by user_id (for partner hub status). */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('user_id') || '';
  if (!userId) {
    return NextResponse.json({ error: 'user_id required' }, { status: 400 });
  }
  const auth = upstreamAuthFromRequest(req);
  try {
    const q = new URLSearchParams({ user_id: userId });
    const res = await fetch(`${dispatchApi('/v1/dispatch/riders/me')}?${q}`, {
      cache: 'no-store',
      headers: upstreamAuthHeaders({ ...auth, userId: auth.userId || userId }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.rider_id) {
      const portrait = await fetchKycPortrait(auth, userId);
      return NextResponse.json(
        { ...data, profile_photo_url: portrait || data.profile_photo_url || null },
        { status: res.status },
      );
    }
  } catch {
    /* fall through to local */
  }

  if (allowLocalDev()) {
    const local = await localGetRiderByUserId(userId);
    if (local) {
      const portrait = (await fetchKycPortrait(auth, userId)) || local.profile_photo_url || null;
      return NextResponse.json({ ...localRiderToProfile(local), profile_photo_url: portrait });
    }
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({ error: 'dispatch_unavailable' }, { status: 503 });
}
