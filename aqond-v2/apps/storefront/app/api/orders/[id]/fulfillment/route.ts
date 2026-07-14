import { NextRequest, NextResponse } from 'next/server';
import { updateMerchantFulfillment } from '@/lib/server/merchantOrders';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  try {
    const data = await updateMerchantFulfillment(id, body.status, {
      note: body.note,
      tracking_no: body.tracking_no,
      actor: body.actor,
    });
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'fulfillment_failed';
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
