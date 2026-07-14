import { bffApi } from '@/lib/server-env';
import { buildLocalHomePayload } from '@/lib/server/localCatalog';

export type HomeProduct = {
  id: string;
  title?: string;
  price_micro?: number;
  category?: string;
  merchant_hint?: string;
  image_url?: string;
  created_at?: string;
  source?: string;
  [key: string]: unknown;
};

export type HomeConnectionStatus = 'ready' | 'degraded' | 'unavailable';

export type HomeProductsLoad = {
  products: HomeProduct[];
  status: HomeConnectionStatus;
  remoteOk: boolean;
  remoteCount: number;
  localCount: number;
};

/** สินค้าที่ร้านเพิ่งเผยแพร่จาก Ad Studio — ต้องขึ้นหน้าแรกก่อนเสมอ */
export async function loadHomeProductsWithStatus(opts?: {
  forceEmpty?: boolean;
}): Promise<HomeProductsLoad> {
  if (opts?.forceEmpty) {
    return {
      products: [],
      status: 'unavailable',
      remoteOk: false,
      remoteCount: 0,
      localCount: 0,
    };
  }

  const localPayload = await buildLocalHomePayload();
  const localList = (localPayload.products?.products || []) as HomeProduct[];

  let remoteList: HomeProduct[] = [];
  let remoteOk = false;
  try {
    const res = await fetch(bffApi('/v1/home'), {
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      remoteOk = true;
      const data = await res.json();
      remoteList = (data.products?.products || []) as HomeProduct[];
    }
  } catch {
    /* Kong offline */
  }

  const byId = new Map<string, HomeProduct>();

  // Local catalog wins — สินค้าที่บันทึกจากร้านต้องไม่ถูก Kong ทับ
  for (const p of localList) {
    byId.set(String(p.id), {
      ...p,
      source: String(p.source || 'local-catalog'),
    });
  }

  for (const p of remoteList) {
    const key = String(p.id);
    const prev = byId.get(key);
    if (prev) {
      byId.set(key, {
        ...p,
        ...prev,
        title: prev.title || p.title,
        price_micro: prev.price_micro || p.price_micro,
        image_url: prev.image_url || p.image_url,
        category: prev.category || p.category,
        source: prev.source || p.source,
        created_at: prev.created_at || p.created_at,
      });
    } else {
      byId.set(key, { ...p, source: p.source || 'kong' });
    }
  }

  const ts = (p: HomeProduct) => Date.parse(String(p.created_at || '')) || 0;
  const merchantAd = [...byId.values()]
    .filter((p) => p.source === 'merchant-ad')
    .sort((a, b) => ts(b) - ts(a));
  const rest = [...byId.values()]
    .filter((p) => p.source !== 'merchant-ad')
    .sort((a, b) => ts(b) - ts(a));

  const products = [...merchantAd, ...rest];
  let status: HomeConnectionStatus = 'ready';
  if (products.length === 0) status = 'unavailable';
  else if (!remoteOk) status = 'degraded';

  return {
    products,
    status,
    remoteOk,
    remoteCount: remoteList.length,
    localCount: localList.length,
  };
}

export async function loadHomeProducts(): Promise<HomeProduct[]> {
  const { products } = await loadHomeProductsWithStatus();
  return products;
}

export function splitHomeProducts(products: HomeProduct[]) {
  const fresh = products.filter((p) => p.source === 'merchant-ad');
  const rest = products.filter((p) => p.source !== 'merchant-ad');
  return { fresh, rest, all: [...fresh, ...rest] };
}
