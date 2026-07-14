import { NextRequest, NextResponse } from 'next/server';
import { proxyAdvanceJobsList, proxyCreateAdvanceJob } from '@/lib/server/advanceJobProxy';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const auth = upstreamAuthFromRequest(req);
  const out = await proxyAdvanceJobsList(
    {
      status: sp.get('status') || undefined,
      category: sp.get('category') || undefined,
      target_province: sp.get('target_province') || undefined,
      employment_type: sp.get('employment_type') || undefined,
      min_budget: sp.get('min_budget') || undefined,
      max_budget: sp.get('max_budget') || undefined,
      min_duration: sp.get('min_duration') || undefined,
      max_duration: sp.get('max_duration') || undefined,
      q: sp.get('q') || undefined,
      page: sp.get('page') || undefined,
      limit: sp.get('limit') || undefined,
      sort: sp.get('sort') || undefined,
    },
    auth,
  );
  if (!out.ok) {
    return NextResponse.json(
      { success: false, jobs: [], total: 0, page: 1, limit: 50 },
      { status: out.status === 500 ? 502 : out.status },
    );
  }
  return NextResponse.json(out.data);
}

export async function POST(req: NextRequest) {
  const auth = upstreamAuthFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const out = await proxyCreateAdvanceJob(body as Record<string, unknown>, auth);
  if (!out.ok) {
    return NextResponse.json(out.data, { status: out.status === 500 ? 502 : out.status });
  }
  return NextResponse.json(out.data);
}
