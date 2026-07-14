import { NextRequest, NextResponse } from 'next/server';
import { proxyCreateMatchJob, proxyMatchJobsList } from '@/lib/server/matchJobProxy';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get('category') || undefined;
  const search = req.nextUrl.searchParams.get('search') || undefined;
  const auth = upstreamAuthFromRequest(req);
  const out = await proxyMatchJobsList({ category, search }, auth);
  if (!out.ok) return NextResponse.json([], { status: out.status === 500 ? 502 : 200 });
  return NextResponse.json(out.jobs);
}

export async function POST(req: NextRequest) {
  const auth = upstreamAuthFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const out = await proxyCreateMatchJob(body as Record<string, unknown>, auth);
  if (!out.ok) {
    return NextResponse.json(out.data, { status: out.status === 500 ? 502 : out.status });
  }
  return NextResponse.json(out.data);
}
