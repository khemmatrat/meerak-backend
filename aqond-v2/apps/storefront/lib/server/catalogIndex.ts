import { buildProductEmbedding } from './productEmbedding';
import { catalogApi, hermesApi, recsysApi, searchApi } from '@/lib/server-env';

type IndexInput = {
  productId: string;
  merchantId: string;
  title: string;
  description?: string;
  category?: string;
  priceMicro: number;
  seoTags?: string[];
  vision?: string;
  imageBase64?: string;
};

export async function hermesOptimize(input: {
  merchantId: string;
  productId: string;
  title: string;
  description?: string;
  category?: string;
}): Promise<{ title: string; description: string; category: string; seo_tags?: string[]; source?: string; score?: number } | null> {
  const key = process.env.AI_CORE_API_KEY || process.env.HERMES_API_KEY || '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) headers['X-Hermes-Api-Key'] = key;

  try {
    const res = await fetch(hermesApi('/v1/listing/optimize'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        merchant_id: input.merchantId,
        product_id: input.productId,
        title: input.title,
        description: input.description || '',
        category: input.category || 'general',
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.optimized) return null;
    const o = data.optimized;
    return {
      title: o.title || input.title,
      description: o.description || input.description || '',
      category: input.category || 'general',
      seo_tags: o.seo_tags,
      source: o.source,
      score: o.score,
    };
  } catch {
    return null;
  }
}

export async function indexProductOnPublish(input: IndexInput): Promise<{ embedding: boolean; search: boolean }> {
  const vector = buildProductEmbedding({
    vision: input.vision,
    title: input.title,
    description: input.description,
    category: input.category,
    imageBase64: input.imageBase64,
  });

  let embedding = false;
  let search = false;

  try {
    const res = await fetch(recsysApi('/v1/embeddings/upsert'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: input.productId, item_type: 'product', vector }),
      signal: AbortSignal.timeout(8000),
    });
    embedding = res.ok;
  } catch {
    /* recsys optional in dev */
  }

  try {
    const res = await fetch(searchApi('/v1/index/upsert'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity_type: 'product',
        entity_id: input.productId,
        shard_key: input.merchantId,
        region: 'TH',
        title: input.title,
        body: [input.description, input.vision].filter(Boolean).join(' '),
        category: input.category || 'general',
        tags: input.seoTags || [],
        price_micro: input.priceMicro,
        status: 'active',
      }),
      signal: AbortSignal.timeout(8000),
    });
    search = res.ok;
  } catch {
    /* search optional in dev */
  }

  return { embedding, search };
}

export async function queryRecsysProducts(vector: number[], k = 12): Promise<{ item_id: string; score: number }[]> {
  try {
    const res = await fetch(recsysApi('/v1/embeddings/query'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vector, item_type: 'product', k }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return [];
    return (data.candidates || []).map((c: any) => ({ item_id: c.item_id, score: c.score }));
  } catch {
    return [];
  }
}

export async function hydrateCatalogProducts(ids: string[]): Promise<any[]> {
  if (!ids.length) return [];
  try {
    const res = await fetch(catalogApi('/v1/products?status=published&limit=200'), { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    const byId = new Map<string, any>((data.products || []).map((p: any) => [p.id, p]));
    return ids.map((id) => byId.get(id)).filter(Boolean);
  } catch {
    return [];
  }
}
