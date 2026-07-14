import { bffGet } from './bff';
import type { AuthState } from './bff';
import { getCreatorId, parseCreatorTag } from './affiliate';
import { productEmoji } from './productVisual';

/** Fixed viewer for seeded feed-svc timeline (see seed-feed-videos.ps1). */
export const FEED_DEMO_VIEWER_ID = 'aqond-feed-demo';

export function getFeedViewerId(auth?: AuthState | null): string {
  if (auth?.userId) return auth.userId;
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('aqond_feed_viewer_id');
    if (stored) return stored;
    localStorage.setItem('aqond_feed_viewer_id', FEED_DEMO_VIEWER_ID);
    return FEED_DEMO_VIEWER_ID;
  }
  return FEED_DEMO_VIEWER_ID;
}

export type FeedPost = {
  id: string;
  postId?: string;
  mediaId?: string;
  caption: string;
  authorId?: string;
  productId?: string;
  productTitle?: string;
  priceMicro?: number;
  category?: string;
  merchantId?: string;
  manifestUrl?: string;
  posterEmoji?: string;
  source?: 'feed-svc' | 'local' | 'demo';
};

export type FeedSource = 'feed' | 'local' | 'mixed' | 'demo' | 'empty';

const PRODUCT_TAG = /\[product:([^\]]+)\]/i;
const CREATOR_TAG = /\[creator:([^\]]+)\]/gi;

export function parseProductTag(caption?: string): string | undefined {
  const m = caption?.match(PRODUCT_TAG);
  return m?.[1];
}

export function captionText(caption?: string): string {
  return (caption || '')
    .replace(PRODUCT_TAG, '')
    .replace(CREATOR_TAG, '')
    .trim() || 'วิดีโอแนะนำสินค้า';
}

function mapRawItem(raw: any): FeedPost {
  const id = raw.post_id || raw.id || raw.media_id || `post-${Math.random().toString(36).slice(2)}`;
  const caption = raw.caption || raw.title || '';
  return {
    id,
    postId: raw.post_id || raw.id,
    mediaId: raw.media_id,
    caption,
    authorId: raw.author_id || parseCreatorTag(caption),
    productId: parseProductTag(caption) || raw.product_id,
    manifestUrl: raw.playback_url,
    posterEmoji: '🎬',
    source: raw.source || 'feed-svc',
  };
}

function demoPostsFromCatalog(products: any[], creatorId: string): FeedPost[] {
  return (products || []).slice(0, 8).map((p, i) => ({
    id: `demo-${p.id || i}`,
    caption: `[product:${p.id}][creator:${creatorId}] ${p.title || p.name || 'สินค้าแนะนำ'}`,
    authorId: creatorId,
    productId: p.id,
    productTitle: p.title || p.name,
    priceMicro: p.price_micro,
    category: p.category,
    merchantId: p.merchant_hint || 'demo-merchant',
    posterEmoji: productEmoji(p.category, p.title || p.name),
    source: 'demo',
  }));
}

function attachCatalog(posts: FeedPost[], catalog: any[]): FeedPost[] {
  return posts.map((post, idx) => {
    const pid = post.productId || catalog[idx % Math.max(catalog.length, 1)]?.id;
    const hit = catalog.find((p) => p.id === pid) || catalog[idx % Math.max(catalog.length, 1)];
    if (!hit) return post;
    return {
      ...post,
      productId: hit.id,
      productTitle: hit.title || hit.name,
      priceMicro: hit.price_micro,
      category: hit.category,
      merchantId: hit.merchant_hint || post.merchantId || 'demo-merchant',
      posterEmoji: productEmoji(hit.category, hit.title || hit.name),
    };
  });
}

export async function fetchMobileFeed(
  kind: 'for-you' | 'following',
  auth?: AuthState | null,
): Promise<{ posts: FeedPost[]; nextCursor?: string; source: FeedSource }> {
  const userId = getFeedViewerId(auth);

  let catalog: any[] = [];
  try {
    const home = await bffGet<any>('/v1/home', auth);
    catalog = home.products?.products || [];
  } catch {
    catalog = [];
  }

  try {
    const res = await fetch(
      `/api/studio/feed?kind=${kind}&user_id=${encodeURIComponent(userId)}`,
      { cache: 'no-store' },
    );
    if (res.ok) {
      const data = await res.json();
      const rawItems = data.items || [];
      if (rawItems.length > 0) {
        let posts = attachCatalog(rawItems.map(mapRawItem), catalog);
        posts = posts.map((p) => ({
          ...p,
          manifestUrl:
            p.manifestUrl
            || (p.mediaId ? `/api/studio/stream/${p.mediaId}` : undefined),
        }));
        const feedSource: FeedSource =
          data.source === 'feed' ? 'feed'
          : data.source === 'mixed' ? 'mixed'
          : data.source === 'local' ? 'local'
          : 'feed';
        return {
          posts,
          nextCursor: data.next_cursor,
          source: feedSource,
        };
      }
    }
  } catch {
    /* fall through */
  }

  if (catalog.length > 0) {
    return {
      posts: demoPostsFromCatalog(catalog, userId),
      source: 'demo',
    };
  }

  return { posts: [], source: 'empty' };
}
