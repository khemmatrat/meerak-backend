import { NextRequest, NextResponse } from 'next/server';
import { allowLocalOrders } from '@/lib/server-env';
import { getEscrowDatabase } from '@/lib/server/escrowDbStore';

export const dynamic = 'force-dynamic';

/** Dev-only — clear escrow holds for one order (PV/e2e seed). */
export async function POST(req: NextRequest) {
  if (!allowLocalOrders()) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { order_id?: string };
  if (!body.order_id) {
    return NextResponse.json({ error: 'order_id required' }, { status: 400 });
  }
  const result = getEscrowDatabase()
    .prepare(`DELETE FROM escrow_holds WHERE order_id = ?`)
    .run(body.order_id);
  return NextResponse.json({ ok: true, order_id: body.order_id, deleted: result.changes });
}
