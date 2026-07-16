import { NextRequest, NextResponse } from 'next/server';
import { advanceDispatchPhase } from '@/lib/server/dispatchSvc';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const data = await advanceDispatchPhase(id, body, upstreamAuthFromRequest(req));
  if (!data) {
    return NextResponse.json({ error: 'dispatch_unavailable' }, { status: 503 });
  }
  if ('error' in data && data.error) {
    return NextResponse.json(data, { status: 400 });
  }
  return NextResponse.json(data);
}
