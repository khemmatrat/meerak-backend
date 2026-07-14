import { NextRequest, NextResponse } from 'next/server';
import type { ReturnRequestDraft } from '@aqond/return-core';
import { submitReturnRequest } from '@/lib/server/returnService';
import { listReturnsForOrder } from '@/lib/server/returnStore';

export const dynamic = 'force-dynamic';

/** B2.7-S001 — OR001 Create return request. */
export async function POST(req: NextRequest) {
  let body: Partial<ReturnRequestDraft> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json', scenario: 'B2.7-S001' }, { status: 400 });
  }

  const draft: ReturnRequestDraft = {
    order_id: String(body.order_id || ''),
    buyer_id: String(body.buyer_id || ''),
    merchant_id: String(body.merchant_id || ''),
    reason_code: body.reason_code as ReturnRequestDraft['reason_code'],
    detail: body.detail ? String(body.detail) : undefined,
    return_method: body.return_method as ReturnRequestDraft['return_method'],
  };

  try {
    const record = await submitReturnRequest(draft);
    return NextResponse.json(
      {
        ok: true,
        scenario: 'B2.7-S001',
        or_id: 'OR001',
        return: record,
      },
      {
        status: 201,
        headers: {
          'X-Aqond-Return-Core': 'return-core',
          'X-Aqond-Return-Scenario': 'B2.7-S001',
        },
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'return_request_failed';
    const status =
      msg === 'order_not_found' ? 404
      : msg === 'return_already_active' ? 409
      : msg.startsWith('return_request_invalid') ? 400
      : msg === 'return_request_disabled' ? 503
      : 400;
    return NextResponse.json({ ok: false, error: msg, scenario: 'B2.7-S001' }, { status });
  }
}

export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get('order_id') || '';
  const buyerId = req.nextUrl.searchParams.get('buyer_id') || '';
  if (!orderId) {
    return NextResponse.json({ ok: false, error: 'order_id_required' }, { status: 400 });
  }
  const returns = await listReturnsForOrder(orderId, buyerId || undefined);
  return NextResponse.json({
    ok: true,
    scenario: 'B2.7-S001',
    order_id: orderId,
    returns,
  });
}
