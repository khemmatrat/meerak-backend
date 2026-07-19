import { NextRequest, NextResponse } from 'next/server';
import { proxyTalentLegacyRead } from '@/lib/server/talentLegacyReadProxy';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

/** Talent legacy read BFF — same-origin proxy to meerak backend (GET only) */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const segments = (await ctx.params).path || [];
  const auth = upstreamAuthFromRequest(req);
  const upstream = await proxyTalentLegacyRead(segments, req.nextUrl.search, auth);
  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') || 'application/json' },
  });
}
