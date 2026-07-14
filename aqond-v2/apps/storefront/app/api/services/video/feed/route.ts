import { NextRequest, NextResponse } from 'next/server';
import { proxyVideoFeed } from '@/lib/server/videoProxy';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

export async function GET(req: NextRequest) {
  const auth = upstreamAuthFromRequest(req);
  const limit = req.nextUrl.searchParams.get('limit') || undefined;
  const cursor = req.nextUrl.searchParams.get('cursor') || undefined;
  const out = await proxyVideoFeed({ limit, cursor }, auth);
  if (!out.ok) {
    return NextResponse.json(
      { videos: [], nextCursor: null, hasMore: false },
      { status: out.status === 500 ? 502 : out.status },
    );
  }
  return NextResponse.json(out.data);
}
