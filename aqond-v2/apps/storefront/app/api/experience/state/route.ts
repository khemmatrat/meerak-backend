import { NextRequest, NextResponse } from 'next/server';
import { proxyExperienceState } from '@/lib/server/experienceProxy';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

export async function GET(req: NextRequest) {
  const auth = upstreamAuthFromRequest(req);
  const surface = req.nextUrl.searchParams.get('surface') || 'home';
  const guestId = req.nextUrl.searchParams.get('guestId') || undefined;
  const out = await proxyExperienceState({ surface, guestId }, auth);
  return NextResponse.json(out.data, { status: out.ok ? 200 : out.status === 500 ? 502 : out.status });
}
