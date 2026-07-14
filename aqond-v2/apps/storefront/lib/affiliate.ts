import type { AuthState } from './bff';

export type PinnedProduct = {
  productId: string;
  title: string;
  priceMicro?: number;
  merchantId?: string;
  category?: string;
  affiliateLinkId?: string;
  commissionBps?: number;
  pinnedAt: number;
  syncedRecsys?: boolean;
};

const PIN_KEY = 'aqond_pin_basket';

function storageKey(creatorId: string) {
  return `${PIN_KEY}:${creatorId}`;
}

export function getCreatorId(auth?: AuthState | null): string {
  if (auth?.userId) return auth.userId;
  if (typeof window === 'undefined') return 'creator-guest';
  let id = localStorage.getItem('aqond_guest_id');
  if (!id) {
    id = `creator-guest-${Date.now()}`;
    localStorage.setItem('aqond_guest_id', id);
  }
  return id;
}

function mapLink(raw: any): PinnedProduct {
  return {
    productId: raw.product_id || raw.productId,
    title: raw.title,
    priceMicro: raw.price_micro ?? raw.priceMicro,
    merchantId: raw.merchant_id ?? raw.merchantId,
    category: raw.category,
    affiliateLinkId: raw.id || raw.affiliateLinkId,
    commissionBps: raw.commission_bps ?? raw.commissionBps ?? 500,
    pinnedAt: raw.pinnedAt || Date.parse(raw.created_at) || Date.now(),
    syncedRecsys: raw.synced_recsys ?? raw.syncedRecsys,
  };
}

export function loadPinnedProducts(creatorId: string): PinnedProduct[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(creatorId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function cachePinnedProducts(creatorId: string, items: PinnedProduct[]) {
  localStorage.setItem(storageKey(creatorId), JSON.stringify(items));
}

export async function fetchPinnedProducts(creatorId: string): Promise<PinnedProduct[]> {
  try {
    const res = await fetch(`/api/studio/affiliate?creator_id=${encodeURIComponent(creatorId)}`, {
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      const items = (data.links || []).map(mapLink);
      cachePinnedProducts(creatorId, items);
      return items;
    }
  } catch {
    /* use cache */
  }
  return loadPinnedProducts(creatorId);
}

export function isPinned(creatorId: string, productId: string): boolean {
  return loadPinnedProducts(creatorId).some((p) => p.productId === productId);
}

export async function pinToBasket(
  creatorId: string,
  product: {
    id: string;
    title?: string;
    name?: string;
    price_micro?: number;
    merchant_hint?: string;
    category?: string;
  },
): Promise<PinnedProduct> {
  const res = await fetch('/api/studio/affiliate/pin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creator_id: creatorId,
      product_id: product.id,
      merchant_id: product.merchant_hint || 'demo-merchant',
      title: product.title || product.name || product.id,
      price_micro: product.price_micro,
      category: product.category,
      commission_bps: 500,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || data.error || 'ปักตะกร้าไม่สำเร็จ');

  const entry = mapLink(data.link);
  const existing = loadPinnedProducts(creatorId).filter((p) => p.productId !== entry.productId);
  cachePinnedProducts(creatorId, [entry, ...existing]);
  return entry;
}

export async function unpinFromBasket(creatorId: string, productId: string) {
  await fetch('/api/studio/affiliate', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creator_id: creatorId, product_id: productId }),
  });
  cachePinnedProducts(
    creatorId,
    loadPinnedProducts(creatorId).filter((p) => p.productId !== productId),
  );
}

export function pinnedProductsForVideo(creatorId: string): PinnedProduct[] {
  return loadPinnedProducts(creatorId);
}

const CREATOR_KEY = 'aqond_last_creator';

export async function trackAffiliateClick(params: {
  creatorId: string;
  productId: string;
  postId?: string;
  buyerId?: string;
  affiliateLinkId?: string;
}) {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(CREATOR_KEY, params.creatorId);
    } catch {
      /* ignore */
    }
  }
  try {
    await fetch('/api/studio/affiliate/click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creator_id: params.creatorId,
        product_id: params.productId,
        buyer_id: params.buyerId,
        post_id: params.postId,
      }),
    });
  } catch {
    /* best-effort */
  }
}

export function buildAffiliateCaption(base: string, creatorId: string, productId: string) {
  return `[product:${productId}][creator:${creatorId}] ${base}`.trim();
}

export function parseCreatorTag(caption?: string): string | undefined {
  const m = caption?.match(/\[creator:([^\]]+)\]/i);
  return m?.[1];
}

export type StudioHealth = {
  feed_svc: boolean;
  video_svc: boolean;
  recsys_svc: boolean;
  local_fallback: boolean;
};

export async function fetchStudioHealth(): Promise<StudioHealth | null> {
  try {
    const res = await fetch('/api/studio/health', { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
