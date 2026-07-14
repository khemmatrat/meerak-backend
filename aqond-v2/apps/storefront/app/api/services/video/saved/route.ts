import { NextRequest, NextResponse } from 'next/server';
import { proxyVideoSaved } from '@/lib/server/videoProxy';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

export async function GET(req: NextRequest) {
  const auth = upstreamAuthFromRequest(req);
  const out = await proxyVideoSaved(auth);
  if (!out.ok) {
    return NextResponse.json({ videos: [] }, { status: out.status === 500 ? 502 : out.status });
  }
  return NextResponse.json(out.data);
}
