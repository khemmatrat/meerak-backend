import { buildLocalHomePayload } from '@/lib/server/localCatalog';
import { catalogApi } from '@/lib/server-env';
import type { ShopAiProduct } from './types';

function normalizeRow(p: Record<string, unknown>): ShopAiProduct | null {
  const id = String(p.id || '');
  if (!id) return null;
  const merchantId = String(p.merchant_id || p.merchant_hint || 'demo-merchant');
  return {
    id,
    title: String(p.title || p.name || id),
    price_micro: Number(p.price_micro) || 0,
    merchant_id: merchantId,
    merchant_name: String(p.merchant_name || p.merchant_hint || merchantId),
    category: p.category ? String(p.category) : undefined,
    image_url: p.image_url ? String(p.image_url) : undefined,
  };
}

async function loadPublishedProducts(): Promise<ShopAiProduct[]> {
  try {
    const res = await fetch(catalogApi('/v1/products?status=published&limit=200'), { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data.products)) {
      const rows = data.products.map((p: Record<string, unknown>) => normalizeRow(p)).filter(Boolean) as ShopAiProduct[];
      if (rows.length) return rows;
    }
  } catch {
    /* fallback */
  }
  const home = await buildLocalHomePayload();
  return (home.products?.products || [])
    .map((p) =>
      normalizeRow({
        id: p.id,
        title: p.title || p.name,
        price_micro: p.price_micro,
        merchant_hint: p.merchant_hint,
        category: p.category,
        image_url: p.image_url,
      }),
    )
    .filter(Boolean) as ShopAiProduct[];
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1)
    .slice(0, 12);
}

function scoreProduct(p: ShopAiProduct, tokens: string[]): number {
  const hay = `${p.title} ${p.category || ''} ${p.merchant_name}`.toLowerCase();
  let score = 0;
  for (const t of tokens) {
    if (hay.includes(t)) score += t.length > 4 ? 3 : 2;
  }
  return score;
}

/** Step 1 — search catalog (DB-backed, not LLM-invented products). */
export async function searchProducts(query: string, limit = 10): Promise<ShopAiProduct[]> {
  const tokens = tokenize(query);
  const catalog = await loadPublishedProducts();
  if (!tokens.length) return catalog.slice(0, limit);

  const ranked = catalog
    .map((p) => ({ p, score: scoreProduct(p, tokens) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.p.price_micro - b.p.price_micro)
    .map((x) => x.p);

  if (ranked.length) return ranked.slice(0, limit);

  const q = query.toLowerCase().trim();
  const loose = catalog.filter((p) => {
    const hay = `${p.title} ${p.category || ''}`.toLowerCase();
    return hay.includes(q) || tokens.some((t) => hay.includes(t));
  });
  return (loose.length ? loose : catalog).slice(0, limit);
}

/** Step 2 — cheapest match via DB sort (re-query, not session price memory). */
export async function findCheapest(query: string, pool?: ShopAiProduct[]): Promise<ShopAiProduct | null> {
  const tokens = tokenize(query);
  const base = pool?.length ? pool : await searchProducts(query, 50);
  if (!base.length) return null;

  const filtered = tokens.length
    ? base.filter((p) => {
        const hay = p.title.toLowerCase();
        return tokens.some((t) => hay.includes(t));
      })
    : base;

  const candidates = filtered.length ? filtered : base;
  return [...candidates].sort((a, b) => a.price_micro - b.price_micro)[0] || null;
}

/** Re-fetch authoritative price before cart write. */
export async function getProductById(productId: string): Promise<ShopAiProduct | null> {
  const catalog = await loadPublishedProducts();
  return catalog.find((p) => p.id === productId) || null;
}
