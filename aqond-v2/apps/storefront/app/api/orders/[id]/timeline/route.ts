import { NextRequest, NextResponse } from 'next/server';
import { getUnifiedOrderTimeline } from '@/lib/server/orderTimeline';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: 'order_id required' }, { status: 400 });
  }
  const timeline = await getUnifiedOrderTimeline(id);
  return NextResponse.json({ ok: true, ...timeline });
}
