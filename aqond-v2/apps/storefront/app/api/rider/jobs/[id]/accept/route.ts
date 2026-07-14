import { NextRequest, NextResponse } from 'next/server';
import { acceptDispatchJob } from '@/lib/server/dispatchSvc';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const riderId = body.rider_id || req.headers.get('x-rider-id') || '';
  if (!riderId) {
    return NextResponse.json({ error: 'rider_id required' }, { status: 400 });
  }
  const data = await acceptDispatchJob(id, riderId, upstreamAuthFromRequest(req));
  if (!data) {
    return NextResponse.json({ error: 'dispatch_unavailable' }, { status: 503 });
  }
  return NextResponse.json(data);
}
