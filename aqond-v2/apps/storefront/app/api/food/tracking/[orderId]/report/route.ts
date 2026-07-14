import { NextRequest, NextResponse } from 'next/server';
import { submitDeliveryReport } from '@/lib/server/riderTracking';

export async function POST(
  req: NextRequest,
  ctx: { params: { orderId: string } },
) {
  const body = await req.json();
  const tracking = await submitDeliveryReport(ctx.params.orderId, {
    type: body.type || 'other',
    note: body.note,
  });
  if (!tracking) {
    return NextResponse.json({ error: 'tracking_not_found' }, { status: 404 });
  }
  return NextResponse.json(tracking);
}
