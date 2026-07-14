import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { markLocalPaymentIntentCaptured } from '@/lib/server/localPaymentIntentStore';
import { readOrdersByIds } from '@/lib/server/orderStore';

/** Dev/E2E handler — only mounted via app/api/dev/* (stripped from production build). */
export async function handleSimulatePaysoCapture(req: NextRequest) {
  let body: { ref?: string; order_ids?: string[]; buyer_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const ref = body.ref?.trim();
  if (!ref) {
    return NextResponse.json({ error: 'ref required' }, { status: 400 });
  }

  const orderIds = (body.order_ids || []).filter(Boolean);
  if (orderIds.length) {
    const orders = await readOrdersByIds(orderIds);
    if (!orders.length) {
      return NextResponse.json({ error: 'order_not_found' }, { status: 404 });
    }
    if (body.buyer_id && orders.some((o) => o.buyer_id !== body.buyer_id)) {
      return NextResponse.json({ error: 'buyer_mismatch' }, { status: 403 });
    }
    if (orders.some((o) => o.payso_reference_id && o.payso_reference_id !== ref)) {
      return NextResponse.json({ error: 'ref_mismatch' }, { status: 400 });
    }
  }

  const captured = await markLocalPaymentIntentCaptured(ref, 'e2e-simulate');
  if (!captured) {
    return NextResponse.json({ error: 'intent_not_found' }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    ref: captured.payso_reference_id,
    intent_id: captured.intent_id,
    status: captured.status,
  });
}
