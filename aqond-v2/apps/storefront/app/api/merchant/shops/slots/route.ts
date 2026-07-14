import { NextRequest, NextResponse } from 'next/server';
import { getOwnerDashboard, purchaseShopSlot, SLOT_PRICE_BAHT } from '@/lib/server/merchantShops';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const ownerId = body.owner_id || 'guest';
  const result = await purchaseShopSlot(ownerId);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  const dashboard = await getOwnerDashboard(ownerId);
  return NextResponse.json({
    ok: true,
    message: `ซื้อสล็อตร้านเพิ่มแล้ว (฿${SLOT_PRICE_BAHT} ถาวร)`,
    usage: dashboard.usage,
    extra_slots: result.profile.extra_slots,
  });
}
