import { marketplaceItemImageUrl } from '@/lib/marketplaceVisual';
import { awardReviewCoins, getCoinWalletView } from '@/lib/server/coinWalletService';
import { listOrdersForBuyer, type StoredOrder } from '@/lib/server/orderStore';
import { findReviewByOrderProduct, listReviewsForAuthor, saveReview } from '@/lib/server/reviewStore';

export type PendingReviewItem = {
  order_id: string;
  product_id: string;
  merchant_id: string;
  merchant_name: string;
  title: string;
  image_url: string;
  qty: number;
  unit_price_micro: number;
  delivered_at: string;
  review_within_days: number;
  coin_bonus: number;
};

export type BuyerReviewStats = {
  review_count: number;
  coins_balance: number;
  coins_earned: number;
  video_tokens_available: number;
  likes: number;
  views: number;
  pending_count: number;
  max_coins_pending: number;
};

function rateableOrder(order: StoredOrder): boolean {
  if (order.order_type === 'food') return false;
  if (String(order.merchant_id || '').startsWith('food-')) return false;
  return order.status === 'completed' || order.fulfillment_status === 'delivered';
}

export function coinBonusForItem(unitPriceMicro: number): number {
  if (unitPriceMicro >= 5000000) return 5;
  if (unitPriceMicro >= 1000000) return 4;
  return 3;
}

export async function listPendingReviewItems(buyerId: string): Promise<PendingReviewItem[]> {
  const [orders, reviews] = await Promise.all([
    listOrdersForBuyer(buyerId),
    listReviewsForAuthor(buyerId),
  ]);
  const reviewed = new Set(reviews.map((r) => `${r.order_id}:${r.product_id}`));
  const pending: PendingReviewItem[] = [];

  for (const order of orders.filter(rateableOrder)) {
    for (const item of order.items || []) {
      const key = `${order.order_id}:${item.product_id}`;
      if (reviewed.has(key)) continue;
      pending.push({
        order_id: order.order_id,
        product_id: item.product_id,
        merchant_id: order.merchant_id,
        merchant_name: order.merchant_name || order.merchant_id,
        title: item.title || item.product_id,
        image_url: marketplaceItemImageUrl(
          item.product_id,
          item.title,
          order.order_id,
        ),
        qty: item.qty || 1,
        unit_price_micro: item.unit_price_micro || 0,
        delivered_at: order.created_at,
        review_within_days: 30,
        coin_bonus: coinBonusForItem(item.unit_price_micro || 0),
      });
    }
  }

  return pending.sort((a, b) => b.delivered_at.localeCompare(a.delivered_at));
}

export async function getBuyerReviewStats(buyerId: string): Promise<BuyerReviewStats> {
  const [reviews, pending, wallet] = await Promise.all([
    listReviewsForAuthor(buyerId),
    listPendingReviewItems(buyerId),
    getCoinWalletView(buyerId),
  ]);
  return {
    review_count: reviews.length,
    coins_balance: wallet.balance,
    coins_earned: wallet.lifetime_earned,
    video_tokens_available: wallet.video_tokens_available,
    likes: reviews.reduce((n, r) => n + (r.likes || 0), 0),
    views: reviews.reduce((n, r) => n + (r.views || 0), 0),
    pending_count: pending.length,
    max_coins_pending: pending.reduce((n, p) => n + p.coin_bonus, 0),
  };
}

export async function submitBuyerReview(input: {
  product_id: string;
  merchant_id: string;
  author_id: string;
  order_id: string;
  rating: number;
  title?: string;
  body?: string;
}) {
  if (input.rating < 1 || input.rating > 5) throw new Error('invalid_rating');
  const existing = await findReviewByOrderProduct(
    input.order_id,
    input.product_id,
    input.author_id,
  );
  if (existing) throw new Error('review_duplicate');

  const orders = await listOrdersForBuyer(input.author_id);
  const order = orders.find((o) => o.order_id === input.order_id);
  const item = order?.items?.find((it) => it.product_id === input.product_id);
  const coins = coinBonusForItem(item?.unit_price_micro || 0);

  const review = await saveReview({
    ...input,
    title: input.title || (input.rating >= 4 ? 'ประทับใจ' : 'พอใช้ได้'),
    body: input.body || 'สั่งผ่าน AQOND Marketplace',
    coins_earned: coins,
  });

  const coinResult = await awardReviewCoins({
    user_id: input.author_id,
    review_id: review.id,
    amount: coins,
    product_title: item?.title,
  });

  return { review, wallet: coinResult.wallet, coins_awarded: coins };
}
