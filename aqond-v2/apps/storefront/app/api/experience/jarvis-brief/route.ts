import { NextRequest, NextResponse } from 'next/server';
import { proxyJarvisBrief } from '@/lib/server/experienceProxy';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

export async function GET(req: NextRequest) {
  const auth = upstreamAuthFromRequest(req);
  const userId = req.nextUrl.searchParams.get('userId') || auth.userId || undefined;
  const out = await proxyJarvisBrief({ userId }, auth);
  return NextResponse.json(out.data, { status: out.ok ? 200 : out.status === 500 ? 502 : out.status });
}
