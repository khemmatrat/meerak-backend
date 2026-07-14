import {
  coinsToVideoTokens,
  creditCoins,
  findLedgerByReference,
  getCoinWallet,
  listCoinLedger,
  videoTokenRate,
  type CoinLedgerEntry,
  type CoinWallet,
} from '@/lib/server/coinWalletStore';
import { listReviewsForAuthor } from '@/lib/server/reviewStore';

export type CoinWalletView = CoinWallet & {
  video_tokens_available: number;
  video_token_rate: number;
  recent_ledger: CoinLedgerEntry[];
};

export async function getCoinWalletView(userId: string): Promise<CoinWalletView> {
  await syncReviewCoinsToWallet(userId);
  const [wallet, recent_ledger] = await Promise.all([
    getCoinWallet(userId),
    listCoinLedger(userId, 8),
  ]);
  return {
    ...wallet,
    video_tokens_available: coinsToVideoTokens(wallet.balance),
    video_token_rate: videoTokenRate(),
    recent_ledger,
  };
}

/** Backfill coin credits from historical reviews (idempotent). */
export async function syncReviewCoinsToWallet(userId: string) {
  const reviews = await listReviewsForAuthor(userId);
  for (const review of reviews) {
    const coins = review.coins_earned || 0;
    if (coins <= 0) continue;
    const existing = await findLedgerByReference(userId, 'review', review.id);
    if (existing) continue;
    await creditCoins({
      user_id: userId,
      amount: coins,
      type: 'review_reward',
      reference_id: review.id,
      reference_type: 'review',
      label_th: `รีวิวสินค้า +${coins} Coins`,
    });
  }
}

export async function awardReviewCoins(input: {
  user_id: string;
  review_id: string;
  amount: number;
  product_title?: string;
}) {
  const existing = await findLedgerByReference(input.user_id, 'review', input.review_id);
  if (existing) {
    const wallet = await getCoinWallet(input.user_id);
    return { wallet, entry: existing, duplicate: true };
  }

  const label = input.product_title
    ? `รีวิว "${input.product_title}" +${input.amount} Coins`
    : `รีวิวสินค้า +${input.amount} Coins`;

  const result = await creditCoins({
    user_id: input.user_id,
    amount: input.amount,
    type: 'review_reward',
    reference_id: input.review_id,
    reference_type: 'review',
    label_th: label,
  });
  return { ...result, duplicate: false };
}
