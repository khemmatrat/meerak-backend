import fs from 'fs/promises';
import path from 'path';
import { listPosts, localMediaPlaybackUrl } from '@/lib/server/studioStore';
import { findCatalogProductById } from '@/lib/server/merchantCatalog';
import { meerakBackendBase } from '@/lib/server-env';

const AFFILIATE_FILE = path.join(process.cwd(), '.data', 'studio', 'affiliate.json');

/** Normalize catalog / backend video URLs for browser playback on PDP. */
export function normalizePdpVideoUrl(url: string): string {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('/api/merchant/ad-video/files/')) return trimmed;
  if (trimmed.startsWith('/api/aivos/')) {
    const base = meerakBackendBase().replace(/\/$/, '');
    return `${base}${trimmed}`;
  }
  if (trimmed.startsWith('/')) return trimmed;
  return trimmed;
}

function catalogPosterUrl(meta: Record<string, unknown> | undefined, imageUrl?: string) {
  const poster = meta?.video_poster_url || meta?.poster_url || meta?.image_url;
  return poster ? String(poster) : imageUrl;
}

export type PdpStudioVideo = {
  url: string;
  media_id: string;
  post_id?: string;
  poster_url?: string;
  source: 'product' | 'merchant' | 'feed';
};

async function affiliateIdsForMerchant(merchantId: string): Promise<Set<string>> {
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

export async function resolveProductStudioVideo(
  productId: string,
  merchantId?: string,
): Promise<PdpStudioVideo | null> {
  const fromCatalog = await findCatalogProductById(productId);
  if (fromCatalog?.product_video_url) {
    const url = normalizePdpVideoUrl(fromCatalog.product_video_url);
    const meta = (fromCatalog.metadata || {}) as Record<string, unknown>;
    return {
      url,
      media_id: `catalog-video-${productId}`,
      poster_url: catalogPosterUrl(meta, fromCatalog.image_url),
      source: 'product',
    };
  }

  const posts = await listPosts(80);

  const byProduct = posts.find((p) => p.product_id === productId && p.media_id);
  if (byProduct?.media_id) {
    return {
      url: normalizePdpVideoUrl(localMediaPlaybackUrl(byProduct.media_id)),
      media_id: byProduct.media_id,
      post_id: byProduct.post_id,
      source: 'product',
    };
  }

  if (merchantId) {
    const productIds = await affiliateIdsForMerchant(merchantId);
    const byMerchant = posts.find(
      (p) => p.media_id && p.product_id && productIds.has(p.product_id),
    );
    if (byMerchant?.media_id) {
      return {
        url: localMediaPlaybackUrl(byMerchant.media_id),
        media_id: byMerchant.media_id,
        post_id: byMerchant.post_id,
        source: 'merchant',
      };
    }
  }

  const captionHit = posts.find(
    (p) => p.media_id && p.caption && p.caption.includes(`[product:${productId}]`),
  );
  if (captionHit?.media_id) {
    return {
      url: localMediaPlaybackUrl(captionHit.media_id),
      media_id: captionHit.media_id,
      post_id: captionHit.post_id,
      source: 'product',
    };
  }

  const any = posts.find((p) => p.media_id);
  if (any?.media_id) {
    return {
      url: localMediaPlaybackUrl(any.media_id),
      media_id: any.media_id,
      post_id: any.post_id,
      source: 'feed',
    };
  }

  return null;
}

export function resolveMerchantLive(input: {
  merchantId: string;
  shopName: string;
  listingImage?: string;
  studioVideo?: PdpStudioVideo | null;
  meta?: Record<string, unknown>;
}) {
  const meta = input.meta || {};
  const liveRoomId = String(meta.live_room_id || meta.live_room || '').trim();
  const explicitLive = meta.shop_is_live === true || meta.is_live === true;
  const studio = input.studioVideo;

  const active = explicitLive || !!liveRoomId || !!studio;
  if (!active) {
    return { active: false as const };
  }

  return {
    active: true as const,
    room_id: liveRoomId || studio?.post_id || `live-${input.merchantId}`,
    preview_url:
      (meta.live_preview_url as string) || input.listingImage || undefined,
    stream_url: studio?.url,
    media_id: studio?.media_id,
    title: input.shopName,
  };
}
