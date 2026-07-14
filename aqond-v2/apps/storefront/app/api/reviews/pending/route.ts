import { NextRequest, NextResponse } from 'next/server';
import { getCoinWalletView } from '@/lib/server/coinWalletService';
import { seedDemoPendingReviews } from '@/lib/server/reviewDemoSeed';
import { getBuyerReviewStats, listPendingReviewItems } from '@/lib/server/reviewService';

export const dynamic = 'force-dynamic';

/** Pending product reviews for buyer (Shopee-style to-rate list). */
export async function GET(req: NextRequest) {
  const buyerId = req.nextUrl.searchParams.get('buyer_id') || '';
  const seedIfEmpty = req.nextUrl.searchParams.get('seed_if_empty') === '1';
  if (!buyerId) {
    return NextResponse.json({ ok: false, error: 'buyer_id_required' }, { status: 400 });
  }

  if (seedIfEmpty) {
    await seedDemoPendingReviews(buyerId);
  }

  const [pending, stats, wallet] = await Promise.all([
    listPendingReviewItems(buyerId),
    getBuyerReviewStats(buyerId),
    getCoinWalletView(buyerId),
  ]);

  return NextResponse.json({
    ok: true,
    buyer_id: buyerId,
    pending,
    stats,
    wallet,
    count: pending.length,
  });
}
