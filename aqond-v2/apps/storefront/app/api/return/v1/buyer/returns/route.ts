import { NextRequest, NextResponse } from 'next/server';
import { demoProductMeta, seedDemoReturnsForBuyer } from '@/lib/server/returnDemoSeed';
import { listBuyerReturnSummaries } from '@/lib/server/returnService';

export const dynamic = 'force-dynamic';

/** Buyer return/refund list for orders hub tab. */
export async function GET(req: NextRequest) {
  const buyerId = req.nextUrl.searchParams.get('buyer_id') || '';
  const seedIfEmpty = req.nextUrl.searchParams.get('seed_if_empty') === '1';
  if (!buyerId) {
    return NextResponse.json({ ok: false, error: 'buyer_id_required' }, { status: 400 });
  }

  if (seedIfEmpty) {
    await seedDemoReturnsForBuyer(buyerId);
  }

  const returns = await listBuyerReturnSummaries(buyerId);
  const enriched = returns.map((row) => {
    const demo = row.order_id.includes('demo-rr') ? demoProductMeta(row.order_id) : null;
    const items = (row.items || []).map((it, idx) => ({
      ...it,
      variation: it.variation || demo?.variation,
      image_url: (it as { image_url?: string }).image_url || demo?.image_url,
    }));
    return { ...row, items };
  });

  return NextResponse.json({
    ok: true,
    scenario: 'B2.7-S002',
    buyer_id: buyerId,
    returns: enriched,
    count: enriched.length,
  });
}
