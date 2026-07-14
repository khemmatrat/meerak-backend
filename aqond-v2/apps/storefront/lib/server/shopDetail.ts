import { bffGet } from '@/lib/bff';
import { getProductImageUrl } from '@/lib/server/listingMediaStore';
import { listMerchantCatalogProducts } from '@/lib/server/merchantCatalog';
import { getShopOps } from '@/lib/server/merchantShopOps';
import { listPosts, localMediaPlaybackUrl } from '@/lib/server/studioStore';
import { followerCount } from '@/lib/server/shopFollowStore';
import { resolveMerchantLive } from '@/lib/server/pdpStudioBridge';
import fs from 'fs/promises';
import path from 'path';

const AFFILIATE_FILE = path.join(process.cwd(), '.data', 'studio', 'affiliate.json');
const DEV_CATALOG = path.join(process.cwd(), '.data', 'dev', 'catalog.json');

export type ShopProductCard = {
  id: string;
  title: string;
  price_micro: number;
  category?: string;
  image_url?: string;
  discount_pct: number;
  list_price_micro?: number;
  sold_count: number;
  rating: number;
  sold_out?: boolean;
  free_shipping: boolean;
};

export type ShopVideo = {
  id: string;
  url: string;
  poster?: string;
  caption?: string;
  product_id?: string;
  product_title?: string;
  price_micro?: number;
  category?: string;
};

export type ShopReview = {
  id: string;
  product_id: string;
  product_title: string;
  body: string;
  rating: number;
  created_at?: string;
};

export type ShopCategory = {
  id: string;
  label: string;
  count: number;
};

export type ShopPromoCode = {
  code: string;
  discount_pct: number;
  label: string;
  theme: 'pink' | 'blue' | 'orange';
};

function productDiscount(id: string, priceMicro: number) {
  const pct = 10 + (id.charCodeAt(id.length - 1) % 58);
  return {
    discount_pct: pct,
    list_price_micro: Math.round((priceMicro * (100 + pct)) / 100),
  };
}

function productSold(id: string) {
  const n = id.charCodeAt(0) + id.charCodeAt(id.length - 1) * 7;
  if (n % 5 === 0) return 3000 + (n % 2000);
  return Math.max(12, n % 500);
}

function productRating(id: string) {
  return 4.5 + (id.charCodeAt(1) % 5) / 10;
}

async function merchantProductIds(merchantId: string): Promise<Set<string>> {
  try {
    const raw = JSON.parse(await fs.readFile(AFFILIATE_FILE, 'utf8')) as {
      links?: Array<{ merchant_id?: string; product_id?: string }>;
    };
    return new Set(
      (raw.links || [])
        .filter((l) => l.merchant_id === merchantId && l.product_id)
        .map((l) => l.product_id as string),
    );
  } catch {
    return new Set();
  }
}

async function lookupCatalogProduct(productId: string) {
  try {
    const dev = JSON.parse(await fs.readFile(DEV_CATALOG, 'utf8'));
    const hit = (dev.products || []).find((p: { id: string }) => p.id === productId);
    if (hit) {
      return {
        title: hit.title || productId,
        price_micro: hit.price_micro || 19900,
        category: hit.category as string | undefined,
        image_url: hit.image_url as string | undefined,
      };
    }
  } catch {
    /* ignore */
  }
  try {
    const raw = JSON.parse(await fs.readFile(AFFILIATE_FILE, 'utf8'));
    const hit = (raw.links || []).find((l: { product_id?: string }) => l.product_id === productId);
    if (hit) {
      return {
        title: hit.title || productId,
        price_micro: hit.price_micro || 19900,
        category: hit.category as string | undefined,
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function enrichShopVideos(videos: ShopVideo[], products: ShopProductCard[]) {
  for (const v of videos) {
    const shopProduct = v.product_id ? products.find((p) => p.id === v.product_id) : undefined;
    if (shopProduct) {
      v.poster = shopProduct.image_url;
      v.product_title = shopProduct.title;
      v.price_micro = shopProduct.price_micro;
      v.category = shopProduct.category;
      continue;
    }
    if (v.product_id) {
      const hit = await lookupCatalogProduct(v.product_id);
      if (hit) {
        v.product_title = hit.title;
        v.price_micro = hit.price_micro;
        v.category = hit.category;
        if (hit.image_url) v.poster = hit.image_url;
      }
    }
  }
}

async function resolveShopVideos(merchantId: string, productIds: Set<string>): Promise<ShopVideo[]> {
  const posts = await listPosts(80);
  const affiliateIds = await merchantProductIds(merchantId);
  const out: ShopVideo[] = [];
  const seen = new Set<string>();

  const belongsToShop = (p: { product_id?: string }) =>
    !!p.product_id && (productIds.has(p.product_id) || affiliateIds.has(p.product_id));

  for (const p of posts) {
    if (!p.media_id || seen.has(p.media_id)) continue;
    if (productIds.size > 0 && !belongsToShop(p)) continue;
    seen.add(p.media_id);
    out.push({
      id: p.post_id,
      url: localMediaPlaybackUrl(p.media_id),
      caption: p.caption,
      product_id: p.product_id,
    });
    if (out.length >= 12) break;
  }

  if (!out.length) {
    for (const p of posts) {
      if (!p.media_id || seen.has(p.media_id)) continue;
      seen.add(p.media_id);
      out.push({
        id: p.post_id,
        url: localMediaPlaybackUrl(p.media_id),
        caption: p.caption,
        product_id: p.product_id,
      });
      if (out.length >= 6) break;
    }
  }

  return out;
}

async function enrichProducts(merchantId: string): Promise<ShopProductCard[]> {
  const raw = await listMerchantCatalogProducts(merchantId);
  const ops = await getShopOps(merchantId);
  const soldSet = new Set(ops.sold_out_item_ids);

  const cards: ShopProductCard[] = [];
  for (const p of raw) {
    const image_url = await getProductImageUrl(p.id);
    const { discount_pct, list_price_micro } = productDiscount(p.id, p.price_micro);
    cards.push({
      id: p.id,
      title: p.title,
      price_micro: p.price_micro,
      category: p.category || 'ทั่วไป',
      image_url,
      discount_pct,
      list_price_micro,
      sold_count: productSold(p.id),
      rating: productRating(p.id),
      sold_out: soldSet.has(p.id),
      free_shipping: true,
    });
  }
  return cards;
}

async function loadShopReviews(products: ShopProductCard[]): Promise<ShopReview[]> {
  const out: ShopReview[] = [];
  for (const p of products.slice(0, 6)) {
    try {
      const rv = await bffGet<any>(`/v1/reviews?product_id=${encodeURIComponent(p.id)}`);
      for (const r of (rv.reviews || []).slice(0, 3)) {
        out.push({
          id: r.id || `${p.id}-${out.length}`,
          product_id: p.id,
          product_title: p.title,
          body: r.body || 'สินค้าดี จัดส่งเร็ว',
          rating: r.rating || 5,
          created_at: r.created_at,
        });
      }
    } catch {
      /* optional */
    }
  }

  if (!out.length && products.length) {
    const samples = [
      'สินค้าตรงปก จัดส่งเร็วมาก',
      'คุณภาพดีเกินราคา แนะนำเลย',
      'แพ็กของดี ร้านตอบแชทไว',
      'ใช้งานได้ดี ซื้อซ้ำแล้ว',
    ];
    products.slice(0, 4).forEach((p, i) => {
      out.push({
        id: `demo-${p.id}`,
        product_id: p.id,
        product_title: p.title,
        body: samples[i % samples.length],
        rating: 4 + (i % 2),
      });
    });
  }
  return out;
}

function buildCategories(products: ShopProductCard[]): ShopCategory[] {
  const map = new Map<string, number>();
  for (const p of products) {
    const cat = p.category || 'ทั่วไป';
    map.set(cat, (map.get(cat) || 0) + 1);
  }
  return [...map.entries()].map(([label, count]) => ({
    id: label.replace(/\s+/g, '-').toLowerCase(),
    label,
    count,
  }));
}

function buildPromoCodes(shopId: string): ShopPromoCode[] {
  const seed = shopId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const codes = ['INCM304', 'SHOP10', 'MEGA66'];
  const themes: ShopPromoCode['theme'][] = ['pink', 'blue', 'orange'];
  return codes.map((code, i) => ({
    code,
    discount_pct: [20, 10, 20][i],
    label: `ลด ${[20, 10, 20][i]}%`,
    theme: themes[(seed + i) % themes.length],
  }));
}

export async function buildShopDetail(shopId: string) {
  const isFood = String(shopId).startsWith('food-');
  if (isFood) {
    return { redirect: `/m/food/${shopId}` as const };
  }

  let name = shopId;
  let meta: Record<string, unknown> = {};
  try {
    const home = await bffGet<any>('/v1/home');
    const hit = (home.products?.products || []).find((p: any) => p.merchant_id === shopId);
    if (hit?.merchant_name) name = hit.merchant_name;
    if (hit?.metadata) meta = hit.metadata;
  } catch {
    /* fallback */
  }

  if (name === shopId && shopId === 'demo-merchant') {
    name = 'demo-merchant';
  }

  const products = await enrichProducts(shopId);
  const productIds = new Set(products.map((p) => p.id));
  const videos = await resolveShopVideos(shopId, productIds);
  await enrichShopVideos(videos, products);

  const reviews = await loadShopReviews(products);
  const categories = buildCategories(products);
  const promo_codes = buildPromoCodes(shopId);
  const followers = await followerCount(shopId);
  const cover_url = products.find((p) => p.image_url)?.image_url;
  const live = resolveMerchantLive({
    merchantId: shopId,
    shopName: name,
    listingImage: cover_url,
    studioVideo: videos[0]
      ? { url: videos[0].url, media_id: videos[0].id, source: 'merchant' }
      : null,
    meta,
  });

  const avgRating =
    products.length > 0
      ? products.reduce((a, p) => a + p.rating, 0) / products.length
      : Number(meta.shop_rating || 4.8);

  const recommended = [...products].sort((a, b) => b.sold_count - a.sold_count).slice(0, 12);

  const now = new Date();
  const campaignEnd = new Date(now);
  campaignEnd.setDate(campaignEnd.getDate() + 10);
  const fmt = (d: Date) =>
    d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });

  return {
    shop: {
      id: shopId,
      name,
      rating: Number(avgRating.toFixed(1)),
      followers,
      follower_label: followers >= 1000 ? `${(followers / 1000).toFixed(1)}k` : String(followers),
      product_count: products.length,
      response_rate: Number(meta.chat_response_rate || 85),
      province: (meta.shop_province as string) || 'ประเทศไทย',
      cover_url,
      avatar_url: cover_url,
      is_live: live.active,
      live_room_id: live.active ? live.room_id : undefined,
    },
    products,
    recommended,
    videos,
    video_count: videos.length,
    reviews,
    review_summary: {
      avg_rating: reviews.length
        ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length
        : avgRating,
      count: reviews.length || products.length * 3,
    },
    categories,
    promo_codes,
    campaign: {
      title: '6.6 MEGA CAMPAIGN',
      subtitle: 'ดีลพิเศษจากร้านค้า',
      date_range: `${fmt(now)} - ${fmt(campaignEnd)}`,
    },
    live: live.active ? live : null,
  };
}
