import { NextRequest, NextResponse } from 'next/server';
import { proxyUserMatchJobs } from '@/lib/server/matchJobProxy';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId')?.trim();
  if (!userId) return NextResponse.json([]);
  const includeExpired = req.nextUrl.searchParams.get('includeExpired') === 'true';
  const auth = upstreamAuthFromRequest(req);
  const out = await proxyUserMatchJobs(userId, { includeExpired }, auth);
  if (!out.ok) return NextResponse.json([], { status: out.status === 500 ? 502 : 200 });
  return NextResponse.json(out.jobs);
}
