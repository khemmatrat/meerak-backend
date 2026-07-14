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
  const params = new URLSearchParams();
  params.set('tab', 'product');
  const q = sp.get('q');
  if (q) params.set('q', q);
  if (sp.get('category')) params.set('category', sp.get('category')!);
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
      return NextResponse.json({ products: [], count: 0, source: 'fallback', facets: {} });
    }

    const products = await enrichProductsWithImages(
      data.hits.map((h: any) => ({
        id: h.entity_id,
        title: h.title,
        price_micro: h.price_micro,
        category: h.category,
        image_url: undefined,
      })),
    );

    return NextResponse.json({
      products,
      count: data.count || products.length,
      facets: data.facets,
      source: 'search-svc',
      latency_ms: data.latency_ms,
    });
  } catch (e: any) {
    return NextResponse.json({ products: [], count: 0, source: 'error', detail: e.message }, { status: 502 });
  }
}
