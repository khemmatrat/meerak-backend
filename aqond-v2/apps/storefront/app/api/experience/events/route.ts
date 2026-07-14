import { NextRequest, NextResponse } from 'next/server';
import { proxyExperienceEvent } from '@/lib/server/experienceProxy';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

export async function POST(req: NextRequest) {
  const auth = upstreamAuthFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const out = await proxyExperienceEvent(body as Record<string, unknown>, auth);
  return NextResponse.json(out.data, { status: out.ok ? 200 : out.status === 500 ? 502 : out.status });
}
