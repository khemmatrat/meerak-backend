import { captionText, parseProductTag, type FeedPost } from '@/lib/feed';
import { productEmoji } from '@/lib/productVisual';

export type ShopVideoItem = {
  id: string;
  url: string;
  poster?: string;
  caption?: string;
  product_id?: string;
  product_title?: string;
  price_micro?: number;
  category?: string;
};

export function shopVideosToFeedPosts(
  videos: ShopVideoItem[],
  shop: { id: string; name: string },
  products: Array<{
    id: string;
    title: string;
    price_micro: number;
    category?: string;
    image_url?: string;
  }>,
): FeedPost[] {
  return videos.map((v, i) => {
    const pid = v.product_id || parseProductTag(v.caption);
    const product = products.find((p) => p.id === pid);
    const title = v.product_title || product?.title || captionText(v.caption);
    return {
      id: v.id || `shop-vid-${i}`,
      postId: v.id,
      caption: v.caption || `[product:${pid || product?.id || ''}] ${title}`,
      productId: pid || product?.id,
      productTitle: title,
      priceMicro: v.price_micro ?? product?.price_micro,
      category: v.category || product?.category,
      merchantId: shop.id,
      manifestUrl: v.url,
      posterEmoji: productEmoji(product?.category, title),
      source: 'local',
    };
  });
}
