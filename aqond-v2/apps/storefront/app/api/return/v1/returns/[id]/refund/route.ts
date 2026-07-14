import { NextRequest, NextResponse } from 'next/server';
import { getRefundDetailForReturn } from '@/lib/server/returnService';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

/** B2.7-S002 — OR002 Refund detail for a return request. */
export async function GET(req: NextRequest, { params }: Params) {
  const buyerId = req.nextUrl.searchParams.get('buyer_id') || '';
  try {
    const detail = await getRefundDetailForReturn(params.id, buyerId || undefined);
    if (!detail) {
      return NextResponse.json({ ok: false, error: 'refund_not_found', scenario: 'B2.7-S002' }, { status: 404 });
    }
    return NextResponse.json(
      {
        ok: true,
        scenario: 'B2.7-S002',
        or_id: 'OR002',
        refund: detail,
      },
      {
        headers: {
          'X-Aqond-Return-Core': 'return-core',
          'X-Aqond-Return-Scenario': 'B2.7-S002',
        },
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'refund_detail_failed';
    if (msg === 'forbidden') {
      return NextResponse.json({ ok: false, error: msg }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: msg, scenario: 'B2.7-S002' }, { status: 400 });
  }
}
