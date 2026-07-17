import { NextRequest, NextResponse } from 'next/server';
import { escalateClaim } from '@/lib/server/claimSettlement';

export async function POST(
  req: NextRequest,
  ctx: { params: { id: string } },
) {
  const body = await req.json().catch(() => ({}));
  const result = await escalateClaim(ctx.params.id, body.actor || 'admin', body.note);
  if (!result) return NextResponse.json({ error: 'case_not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, case: result });
}
