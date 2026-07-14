import { NextRequest, NextResponse } from 'next/server';
import { allowLocalDev } from '@/lib/server-env';
import { getOwnerProfile, listAccessibleShops } from '@/lib/server/merchantShops';
import { listOrdersForMerchant } from '@/lib/server/orderStore';

/** Sprint 34 — internal commerce signals for Jarvis proactive briefs */
export async function GET(req: NextRequest) {
  if (!allowLocalDev()) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const profile = await getOwnerProfile(userId);
  const shops = listAccessibleShops(profile).filter((s) => s.owner_id === userId);

  let merchantPendingCount = 0;
  for (const shop of shops) {
    const orders = await listOrdersForMerchant(shop.id);
    merchantPendingCount += orders.filter(
      (o) =>
        o.fulfillment_status === 'pending_accept' ||
        o.status === 'pending' ||
        o.status === 'pending_payment',
    ).length;
  }

  const orders = await (await import('@/lib/server/orderStore')).listOrdersForBuyer(userId);
  const cartAbandon = orders.some(
    (o) => o.status === 'pending_payment' || o.payment_status === 'pending',
  );

  return NextResponse.json({
    ok: true,
    merchant_pending_count: merchantPendingCount,
    cart_abandon: cartAbandon,
    shop_count: shops.length,
  });
}
