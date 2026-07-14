'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { FeedPost } from '@/lib/feed';
import type { JarvisFeedContext } from '@/lib/jarvis/session';

const FEED_FOOD_MERCHANT: Record<string, string> = {
  'prod-matcha': 'food-cafe-1',
  'prod-snack': 'food-street-1',
};

function guessFoodMerchant(post: FeedPost): string | undefined {
  if (post.productId && FEED_FOOD_MERCHANT[post.productId]) {
    return FEED_FOOD_MERCHANT[post.productId];
  }
  const hay = `${post.productTitle || ''} ${post.caption || ''}`.toLowerCase();
  if (/matcha|มัทฉะ|latte/.test(hay)) return 'food-cafe-1';
  if (/ขนม|snack|กรอบ/.test(hay)) return 'food-street-1';
  if (/ก๋วยเตี๋ยว|เส้น/.test(hay)) return 'food-street-1';
  if (post.category === 'food') return 'food-thai-1';
  return undefined;
}

type Ctx = {
  feedContext: JarvisFeedContext | null;
  setFeedContext: (ctx: JarvisFeedContext | null) => void;
};

const JarvisFeedCtx = createContext<Ctx | null>(null);

export function feedPostToContext(post: FeedPost): JarvisFeedContext {
  const foodMerchantId = guessFoodMerchant(post);
  return {
    post_id: post.postId || post.id,
    media_id: post.mediaId,
    caption: post.caption,
    product_id: post.productId,
    product_title: post.productTitle,
    price_micro: post.priceMicro,
    category: post.category,
    author_id: post.authorId,
    is_food: !!foodMerchantId,
    food_merchant_id: foodMerchantId,
  };
}

export function JarvisFeedProvider({ children }: { children: ReactNode }) {
  const [feedContext, setFeedContext] = useState<JarvisFeedContext | null>(null);
  const value = useMemo(() => ({ feedContext, setFeedContext }), [feedContext]);
  return <JarvisFeedCtx.Provider value={value}>{children}</JarvisFeedCtx.Provider>;
}

export function useJarvisFeed() {
  const ctx = useContext(JarvisFeedCtx);
  if (!ctx) {
    return { feedContext: null as JarvisFeedContext | null, setFeedContext: () => {} };
  }
  return ctx;
}
