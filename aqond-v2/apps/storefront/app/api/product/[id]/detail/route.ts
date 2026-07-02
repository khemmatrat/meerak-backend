import { NextRequest, NextResponse } from 'next/server';
import { bffGet } from '@/lib/bff';
import { catalogApi } from '@/lib/server-env';
import { getProductImageUrl } from '@/lib/server/listingMediaStore';
import { findCatalogProductById, listMerchantCatalogProducts } from '@/lib/server/merchantCatalog';
import { resolveStorefrontProduct } from '@/lib/server/resolveStorefrontProduct';
import { loadHomeProducts } from '@/lib/server/homeProducts';
import { getShopOps } from '@/lib/server/merchantShopOps';
import { pickImageUrl } from '@/lib/productVisual';
import {
  aiReviewSummary,
  parseDiscount,
  parsePdpMedia,
  parsePdpVariants,
  reviewFilterTags,
  shippingEtaDays,
  type PdpMedia,
  type PdpProduct,
} from '@/lib/pdpMeta';
import { resolveMerchantLive, resolveProductStudioVideo } from '@/lib/server/pdpStudioBridge';
import { readDevProductStock } from '@/lib/server/localCatalogStock';

async function fetchCatalogProduct(id: string) {
  try {
    const res = await fetch(catalogApi(`/v1/products/${id}`), { cache: 'no-store' });
    if (res.ok) return res.json();
  } catch {
    /* ignore */
  }
  return null;
}

async function fetchVariants(productId: string) {
  try {
    const res = await fetch(`${catalogApi('/v1/variants')}?product_id=${encodeURIComponent(productId)}`, {
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      return data.variants || [];
    }
  } catch {
    /* ignore */
  }
  return [];
}

async function enrichFromLocalCatalog(id: string, product: PdpProduct): Promise<PdpProduct> {
  const local = await findCatalogProductById(id);
  if (!local) return product;
  const meta = { ...(product.metadata || {}), ...(local.metadata || {}) };
  if (local.product_video_url) {
    meta.product_video_url = local.product_video_url;
    meta.video_url = local.product_video_url;
  }
  if (local.image_url && !meta.image_url) meta.image_url = local.image_url;
  return {
    ...product,
    title: product.title || local.title,
    description: product.description || local.description,
    category: product.category || local.category,
    merchant_id: product.merchant_id || local.merchant_id,
    price_micro: product.price_micro || local.price_micro,
    metadata: meta,
  };
}

async function loadProductBase(id: string): Promise<PdpProduct | null> {
  let prod: any = null;
  try {
    const data = await bffGet<any>(`/v1/product?id=${encodeURIComponent(id)}`);
    prod = data?.product;
    if (prod) {
      return enrichFromLocalCatalog(id, {
        id,
        title: data.i18n?.title || prod.title || prod.name || '',
        description: data.i18n?.description || prod.description,
        category: prod.category,
        merchant_id: prod.merchant_id || prod.store_id,
        store_id: prod.store_id,
        price_micro: data.price?.price_micro || prod.price_micro || 0,
        sold_count: prod.sold_count,
        metadata: prod.metadata,
      });
    }
  } catch {
    /* ignore */
  }

  const direct = await fetchCatalogProduct(id);
  if (direct) {
    return enrichFromLocalCatalog(id, {
      id,
      title: direct.title || '',
      description: direct.description,
      category: direct.category,
      merchant_id: direct.merchant_id,
      store_id: direct.store_id,
      price_micro: direct.price_micro || 0,
      metadata: direct.metadata,
    });
  }

  try {
    const home = await bffGet<any>('/v1/home');
    const hit = (home.products?.products || []).find((p: any) => p.id === id);
    if (hit) {
      return enrichFromLocalCatalog(id, {
        id,
        title: hit.title || hit.name,
        description: hit.description,
        category: hit.category,
        merchant_id: hit.merchant_id || hit.store_id,
        price_micro: hit.price_micro || 0,
        metadata: hit.metadata,
      });
    }
  } catch {
    /* ignore */
  }

  const local = await resolveStorefrontProduct(id);
  if (local) {
    return enrichFromLocalCatalog(id, {
      id,
      title: local.title,
      description: 'description' in local ? local.description : undefined,
      category: local.category,
      merchant_id: local.merchant_id,
      price_micro: local.price_micro,
      metadata: 'metadata' in local ? local.metadata : undefined,
    });
  }
  return null;
}

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  const id = ctx.params.id;
  const product = await loadProductBase(id);
  if (!product?.title) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const listingImage = (await getProductImageUrl(id)) || pickImageUrl(product);
  const catalogVariants = await fetchVariants(id);
  let media = parsePdpMedia(product, listingImage);
  const studioVideo = await resolveProductStudioVideo(id, product.merchant_id);
  if (studioVideo && !media.some((m) => m.type === 'video')) {
    media = [
      ...media,
      { type: 'video' as const, url: studioVideo.url, label: 'วิดีโอสินค้า' },
    ];
  } else if (studioVideo) {
    media = media.map((m) =>
      m.type === 'video' ? { ...m, url: studioVideo.url, label: m.label || 'วิดีโอสินค้า' } : m,
    );
  }
  const variants = parsePdpVariants(product, catalogVariants, media);
  const discount = parseDiscount(product);
  const meta = product.metadata || {};
  const freeShipping = meta.free_shipping !== false;

  let reviews: any[] = [];
  let reviewSummary = { avg_rating: 0, count: 0 };
  try {
    const rv = await bffGet<any>(`/v1/reviews?product_id=${encodeURIComponent(id)}`);
    reviews = rv.reviews || [];
    if (reviews.length) {
      const sum = reviews.reduce((a: number, r: any) => a + (r.rating || 5), 0);
      reviewSummary = { avg_rating: sum / reviews.length, count: reviews.length };
    }
  } catch {
    /* optional */
  }

  const merchantId = product.merchant_id || 'demo-merchant';
  let shopProducts: any[] = [];
  let shopName = merchantId;
  try {
    shopProducts = await listMerchantCatalogProducts(merchantId);
    const ops = await getShopOps(merchantId);
    const home = await bffGet<any>('/v1/home').catch(() => null);
    const hit = (home?.products?.products || []).find((p: any) => p.merchant_id === merchantId);
    if (hit?.merchant_name) shopName = hit.merchant_name;
    shopProducts = shopProducts.map((p) => ({
      ...p,
      sold_out: ops.sold_out_item_ids?.includes(p.id),
    }));
  } catch {
    /* ignore */
  }

  const related = shopProducts.filter((p) => p.id !== id).slice(0, 8);
  let recommendations: any[] = [];
  try {
    recommendations = (await loadHomeProducts())
      .filter((p) => p.id !== id && p.category === product.category)
      .slice(0, 8);
  } catch {
    recommendations = related.slice(0, 8);
  }

  const live = resolveMerchantLive({
    merchantId,
    shopName,
    listingImage: listingImage || media[0]?.url,
    studioVideo,
    meta,
  });

  const video = studioVideo || media.find((m) => m.type === 'video')
    ? {
        url: studioVideo?.url || media.find((m) => m.type === 'video')!.url,
        poster: studioVideo?.poster_url || listingImage || media.find((m) => m.type === 'image')?.url,
        media_id: studioVideo?.media_id,
        has_file: true,
      }
    : {
        url: '',
        poster: listingImage || media[0]?.url,
        has_file: false,
      };

  const soldCount =
    Number(product.sold_count || meta.sold_count || 0) ||
    Math.max(12, (reviewSummary.count || 1) * 17);

  const inventory = await readDevProductStock(id);

  return NextResponse.json({
    product: {
      ...product,
      image_url: listingImage || media[0]?.url,
      sold_count: soldCount,
      inventory: inventory ?? undefined,
      stock: inventory ?? undefined,
    },
    media,
    variants,
    discount,
    promo: {
      coupon_label: (meta.coupon_label as string) || 'ส่วนลดร้านค้า',
      coupon_pct: Number(meta.coupon_pct || discount.discount_pct || 10),
      vip_price_micro: Number(meta.vip_price_micro || 0) || undefined,
    },
    shipping: {
      free: freeShipping,
      ...shippingEtaDays(2, 4),
      late_discount_thb: 30,
    },
    shop: {
      id: merchantId,
      name: shopName,
      rating: Number(meta.shop_rating || 4.8),
      product_count: shopProducts.length || related.length,
      response_rate: Number(meta.chat_response_rate || 85),
      province: (meta.shop_province as string) || 'ประเทศไทย',
    },
    reviews: {
      ...reviewSummary,
      items: reviews.slice(0, 20),
      filter_tags: reviewFilterTags(reviews),
      ai_summary: aiReviewSummary(reviews, product.title),
    },
    related,
    recommendations: recommendations.length ? recommendations : related,
    live,
    video,
    attributes: [
      { label: 'หมวดหมู่', value: product.category || 'ทั่วไป' },
      { label: 'สภาพ', value: (meta.condition as string) || 'ใหม่' },
      { label: 'การรับประกัน', value: (meta.warranty as string) || 'ตามเงื่อนไขร้าน' },
    ],
  });
}
