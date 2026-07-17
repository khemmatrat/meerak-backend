import { NextRequest, NextResponse } from 'next/server';
import { settleClaim } from '@/lib/server/claimSettlement';

export async function POST(
  req: NextRequest,
  ctx: { params: { id: string } },
) {
  const body = await req.json().catch(() => ({}));
  const result = await settleClaim({
    case_id: ctx.params.id,
    actor: body.actor || 'admin',
    refund_micro: body.refund_micro != null ? Number(body.refund_micro) : undefined,
    partial: !!body.partial,
    note: body.note,
  });
  if (!result) return NextResponse.json({ error: 'case_not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, case: result });
}
