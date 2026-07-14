import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { syncProductToMarketplace } from '@/lib/server/marketplaceSync';

const DEV_CATALOG = path.join(process.cwd(), '.data', 'dev', 'catalog.json');
const AFFILIATE_FILE = path.join(process.cwd(), '.data', 'studio', 'affiliate.json');

export type MerchantCatalogProduct = {
  id: string;
  title: string;
  price_micro: number;
  merchant_id: string;
  category?: string;
  description?: string;
  benefits?: string;
  size_guide?: string;
  stock?: number;
  image_url?: string;
  seo_tags?: string[];
  product_code?: string;
  product_video_url?: string;
  has_video?: boolean;
  created_at?: string;
  source?: string;
  metadata?: Record<string, unknown>;
};

type CatalogRow = Record<string, unknown>;

export function formatProductCode(id: string) {
  return id.replace(/^prod-/, '').slice(0, 12).toUpperCase();
}

async function readDevCatalog(): Promise<{ products: CatalogRow[] }> {
  try {
    return JSON.parse(await fs.readFile(DEV_CATALOG, 'utf8'));
  } catch {
    return { products: [] };
  }
}

async function writeDevCatalog(catalog: { products: CatalogRow[] }) {
  await fs.mkdir(path.dirname(DEV_CATALOG), { recursive: true });
  await fs.writeFile(DEV_CATALOG, JSON.stringify(catalog, null, 2));
}

function buildMetadata(input: {
  image_url?: string;
  product_video_url?: string;
  poster_url?: string;
  job_id?: string;
  prev?: Record<string, unknown>;
}) {
  const meta: Record<string, unknown> = { ...(input.prev || {}) };
  if (input.image_url) {
    meta.image_url = input.image_url;
    const images = Array.isArray(meta.images) ? [...(meta.images as unknown[])] : [];
    if (!images.some((img) => (img as { url?: string })?.url === input.image_url)) {
      images.unshift({ url: input.image_url, primary: true });
    }
    meta.images = images;
  }
  if (input.product_video_url) {
    meta.product_video_url = input.product_video_url;
    meta.video_url = input.product_video_url;
  }
  if (input.poster_url) meta.video_poster_url = input.poster_url;
  if (input.job_id) meta.ad_video_job_id = input.job_id;
  return meta;
}

function rowToProduct(p: CatalogRow, merchantId: string): MerchantCatalogProduct {
  const mid = String(p.merchant_hint || p.merchant_id || 'demo-merchant');
  const meta = (p.metadata || {}) as Record<string, unknown>;
  const imageUrl = p.image_url
    ? String(p.image_url)
    : meta.image_url
      ? String(meta.image_url)
      : undefined;
  const videoUrl = meta.product_video_url
    ? String(meta.product_video_url)
    : meta.video_url
      ? String(meta.video_url)
      : undefined;
  return {
    id: String(p.id),
    title: String(p.title || p.id),
    price_micro: Number(p.price_micro) || 19900,
    merchant_id: mid,
    category: p.category ? String(p.category) : undefined,
    description: p.description ? String(p.description) : undefined,
    benefits: p.benefits ? String(p.benefits) : undefined,
    size_guide: p.size_guide ? String(p.size_guide) : undefined,
    stock: typeof p.inventory === 'number' ? p.inventory : typeof p.stock === 'number' ? p.stock : undefined,
    image_url: imageUrl,
    seo_tags: Array.isArray(p.seo_tags) ? (p.seo_tags as string[]) : undefined,
    product_code: formatProductCode(String(p.id)),
    product_video_url: videoUrl,
    has_video: Boolean(videoUrl),
    created_at: p.created_at ? String(p.created_at) : undefined,
    source: p.source ? String(p.source) : undefined,
    metadata: buildMetadata({ image_url: imageUrl, product_video_url: videoUrl, prev: meta }),
  };
}

export async function findCatalogProductById(productId: string): Promise<MerchantCatalogProduct | null> {
  const catalog = await readDevCatalog();
  const row = catalog.products.find((p) => String(p.id) === productId);
  if (row) {
    const mid = String(row.merchant_hint || row.merchant_id || 'demo-merchant');
    return rowToProduct(row, mid);
  }

  try {
    const raw = JSON.parse(await fs.readFile(AFFILIATE_FILE, 'utf8'));
    const link = (raw.links || []).find((l: { product_id?: string }) => l.product_id === productId);
    if (link) {
      const mid = link.merchant_id || 'demo-merchant';
      return {
        id: link.product_id,
        title: link.title || link.product_id,
        price_micro: link.price_micro || 19900,
        merchant_id: mid,
        category: link.category,
        product_code: formatProductCode(link.product_id),
        source: 'affiliate',
      };
    }
  } catch {
    /* no affiliate file */
  }

  return null;
}

export async function getMerchantCatalogProduct(
  merchantId: string,
  productId: string,
): Promise<MerchantCatalogProduct | null> {
  const hit = await findCatalogProductById(productId);
  if (hit && hit.merchant_id === merchantId) return hit;
  const products = await listMerchantCatalogProducts(merchantId);
  return products.find((p) => p.id === productId) || null;
}

export async function listMerchantCatalogProducts(merchantId: string): Promise<MerchantCatalogProduct[]> {
  const byId = new Map<string, MerchantCatalogProduct>();

  try {
    const dev = await readDevCatalog();
    for (const p of dev.products || []) {
      const mid = String(p.merchant_hint || p.merchant_id || 'demo-merchant');
      if (mid !== merchantId) continue;
      if (p.status && String(p.status) !== 'published') continue;
      byId.set(String(p.id), rowToProduct(p, mid));
    }
  } catch {
    /* empty */
  }

  try {
    const raw = JSON.parse(await fs.readFile(AFFILIATE_FILE, 'utf8'));
    for (const l of raw.links || []) {
      const mid = l.merchant_id || 'demo-merchant';
      if (mid !== merchantId) continue;
      if (byId.has(l.product_id)) continue;
      byId.set(l.product_id, {
        id: l.product_id,
        title: l.title || l.product_id,
        price_micro: l.price_micro || 19900,
        merchant_id: mid,
        category: l.category,
        product_code: formatProductCode(l.product_id),
      });
    }
  } catch {
    /* empty */
  }

  if (byId.size === 0 && merchantId === 'demo-merchant') {
    return [
      { id: 'test-prod-1', title: 'Demo Product 1', price_micro: 993900, merchant_id: merchantId, stock: 50, product_code: 'TEST-PROD-1' },
      { id: 'test-prod-2', title: 'Demo Product 2', price_micro: 14900, merchant_id: merchantId, stock: 30, product_code: 'TEST-PROD-2' },
      { id: 'test-prod-3', title: 'Demo Product 3', price_micro: 29900, merchant_id: merchantId, stock: 20, product_code: 'TEST-PROD-3' },
    ];
  }

  return [...byId.values()].sort((a, b) => {
    const ta = Date.parse(a.created_at || '') || 0;
    const tb = Date.parse(b.created_at || '') || 0;
    return tb - ta;
  });
}

export async function saveMerchantCatalogProduct(input: {
  merchantId: string;
  productId?: string;
  title: string;
  description?: string;
  benefits?: string;
  size_guide?: string;
  price_thb: number;
  stock: number;
  category?: string;
  image_url?: string;
  seo_tags?: string[];
  product_video_url?: string;
}): Promise<MerchantCatalogProduct> {
  const catalog = await readDevCatalog();
  const priceMicro = Math.round(input.price_thb * 100);
  const id = input.productId || `prod-${crypto.randomUUID().slice(0, 12)}`;
  const idx = catalog.products.findIndex((p) => String(p.id) === id);

  const prev = idx >= 0 ? catalog.products[idx] : null;
  const prevMeta = (prev?.metadata || {}) as Record<string, unknown>;
  const metadata = buildMetadata({
    image_url: input.image_url,
    product_video_url: input.product_video_url,
    prev: prevMeta,
  });

  const row: CatalogRow = {
    id,
    merchant_id: input.merchantId,
    merchant_hint: input.merchantId,
    title: input.title,
    description: input.description || '',
    benefits: input.benefits || '',
    size_guide: input.size_guide || undefined,
    category: input.category || 'general',
    price_micro: priceMicro,
    inventory: input.stock,
    stock: input.stock,
    seo_tags: input.seo_tags || [],
    image_url: input.image_url || undefined,
    metadata,
    status: 'published',
    updated_at: new Date().toISOString(),
  };

  if (idx >= 0) {
    catalog.products[idx] = { ...prev, ...row };
  } else {
    row.created_at = new Date().toISOString();
    row.source = 'merchant-ad';
    catalog.products.push(row);
  }

  await writeDevCatalog(catalog);
  const saved = rowToProduct(row, input.merchantId);
  await syncProductToMarketplace(saved);
  return saved;
}

export async function attachAdVideoToProduct(input: {
  productId: string;
  merchantId: string;
  videoUrl: string;
  posterUrl?: string;
  jobId?: string;
}) {
  const catalog = await readDevCatalog();
  const idx = catalog.products.findIndex((p) => String(p.id) === input.productId);
  if (idx < 0) return null;

  const prev = catalog.products[idx];
  const metadata = buildMetadata({
    image_url: prev.image_url ? String(prev.image_url) : undefined,
    product_video_url: input.videoUrl,
    poster_url: input.posterUrl,
    job_id: input.jobId,
    prev: (prev.metadata || {}) as Record<string, unknown>,
  });

  catalog.products[idx] = {
    ...prev,
    metadata,
    updated_at: new Date().toISOString(),
  };
  await writeDevCatalog(catalog);

  const mid = String(prev.merchant_hint || prev.merchant_id || input.merchantId);
  const saved = rowToProduct(catalog.products[idx], mid);
  await syncProductToMarketplace(saved);
  return saved;
}
