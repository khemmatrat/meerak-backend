import { NextRequest, NextResponse } from 'next/server';
import { searchApi } from '@/lib/server-env';
import { enrichProductsWithImages } from '@/lib/server/listingMediaStore';

const SORT_MAP: Record<string, string> = {
  relevant: 'relevant',
  bestseller: 'best_selling',
  rating: 'rating',
  price: 'price_asc',
  price_desc: 'price_desc',
};

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const tab = sp.get('tab') || 'product';
  const params = new URLSearchParams();
  params.set('tab', tab);
  const q = sp.get('q');
  if (q) params.set('q', q);
  if (sp.get('category')) params.set('category', sp.get('category')!);
  if (sp.get('cuisine')) params.set('category', sp.get('cuisine')!);
  if (sp.get('cod') === '1') params.set('cod', '1');
  if (sp.get('ship_from')) params.set('ship_from', sp.get('ship_from')!);
  if (sp.get('price_min')) params.set('price_min', sp.get('price_min')!);
  if (sp.get('price_max')) params.set('price_max', sp.get('price_max')!);
  params.set('sort', SORT_MAP[sp.get('sort') || 'relevant'] || 'relevant');
  if (sp.get('user_id')) params.set('user_id', sp.get('user_id')!);
  params.set('limit', sp.get('limit') || '40');

  try {
    const res = await fetch(`${searchApi('/v1/search')}?${params}`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(data.hits)) {
      return NextResponse.json({ tab, hits: [], count: 0, source: 'fallback', facets: {} });
    }

    let hits = data.hits;
    if (tab === 'product') {
      hits = await enrichProductsWithImages(
        data.hits.map((h: Record<string, unknown>) => ({
          id: h.entity_id,
          title: h.title,
          price_micro: h.price_micro,
          category: h.category,
          image_url: undefined,
          rating: h.rating,
        })),
      );
    }

    return NextResponse.json({
      tab,
      hits,
      count: data.count || hits.length,
      facets: data.facets,
      source: 'search-svc',
      latency_ms: data.latency_ms,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { tab, hits: [], count: 0, source: 'error', detail: e instanceof Error ? e.message : 'search_failed' },
      { status: 502 },
    );
  }
}
