import { NextRequest, NextResponse } from 'next/server';
import { getReturnById } from '@/lib/server/returnStore';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

/** B2.7-S001 — Return request detail. */
export async function GET(req: NextRequest, { params }: Params) {
  const buyerId = req.nextUrl.searchParams.get('buyer_id') || '';
  const record = await getReturnById(params.id);
  if (!record) {
    return NextResponse.json({ ok: false, error: 'return_not_found' }, { status: 404 });
  }
  if (buyerId && record.buyer_id !== buyerId) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }
  return NextResponse.json({
    ok: true,
    scenario: 'B2.7-S001',
    return: record,
  });
}
