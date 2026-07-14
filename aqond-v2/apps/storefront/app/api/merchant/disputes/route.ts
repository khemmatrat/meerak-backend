import { NextRequest, NextResponse } from 'next/server';
import { getDisputeSummary } from '@/lib/server/merchantDisputes';
import {
  ESCROW_POLICY,
  FOOD_DISPUTE_TYPES,
  MARKETPLACE_DISPUTE_TYPES,
  MISSING_ITEMS_POLICY,
  WRONG_ORDER_CONSUMED_POLICY,
} from '@/lib/disputePolicy';
import { shopMeta, getOwnerDashboard } from '@/lib/server/merchantShops';

export async function GET(req: NextRequest) {
  const merchantId = req.nextUrl.searchParams.get('merchant_id');
  if (!merchantId) {
    return NextResponse.json({ error: 'merchant_id required' }, { status: 400 });
  }

  const summary = await getDisputeSummary(merchantId);
  const dashboard = await getOwnerDashboard('guest');
  const meta = shopMeta(merchantId, dashboard.accessible_shops);
  const isFood = meta.is_food;

  return NextResponse.json({
    merchant_id: merchantId,
    order_type: isFood ? 'food' : 'marketplace',
    summary: {
      total: summary.total,
      open_count: summary.open_count,
      held_total_micro: summary.held_total_micro,
    },
    cases: summary.cases,
    policies: {
      escrow: ESCROW_POLICY,
      missing_items: MISSING_ITEMS_POLICY,
      wrong_order_consumed: WRONG_ORDER_CONSUMED_POLICY,
      categories: isFood ? FOOD_DISPUTE_TYPES : MARKETPLACE_DISPUTE_TYPES,
    },
  });
}
