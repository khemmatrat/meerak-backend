import { NextRequest, NextResponse } from 'next/server';
import { listBuyerChatThreads } from '@/lib/server/shopChatStore';
import { listOrdersForBuyer } from '@/lib/server/orderStore';

export async function GET(req: NextRequest) {
  const buyerId = req.nextUrl.searchParams.get('buyer_id') || 'guest';
  try {
    const threads = await listBuyerChatThreads(buyerId);
    const orders = buyerId !== 'guest' ? await listOrdersForBuyer(buyerId) : [];
    const shopIds = new Set(threads.map((t) => t.shop_id));
    const fromOrders = orders
      .filter((o) => o.merchant_id && !shopIds.has(o.merchant_id))
      .map((o) => ({
        shop_id: o.merchant_id,
        merchant_name: o.merchant_name || o.merchant_id,
        last_order_at: o.created_at,
      }));
    const seen = new Set<string>();
    const suggestions = fromOrders.filter((o) => {
      if (seen.has(o.shop_id)) return false;
      seen.add(o.shop_id);
      return true;
    });
    return NextResponse.json({ threads, suggestions });
  } catch (e) {
    console.error('[shop-chat inbox]', e);
    return NextResponse.json({ error: 'inbox_load_failed' }, { status: 500 });
  }
}
