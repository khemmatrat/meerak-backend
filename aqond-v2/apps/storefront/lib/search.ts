import type { TtProduct } from '@/components/mobile/TtProductGrid';

export type SearchFilters = {
  q?: string;
  tab?: 'product' | 'shop' | 'food';
  category?: string;
  cuisine?: string;
  cod?: boolean;
  shipFrom?: string;
  priceMin?: number;
  priceMax?: number;
  sort?: string;
  userId?: string;
};

export type SearchHit = {
  id: string;
  entity_id?: string;
  title: string;
  category?: string;
  price_micro?: number;
  rating?: number;
  sold_count?: number;
  entity_type?: string;
};

async function runSearch(filters: SearchFilters) {
  const params = new URLSearchParams();
  params.set('tab', filters.tab || 'product');
  if (filters.q) params.set('q', filters.q);
  if (filters.category) params.set('category', filters.category);
  if (filters.cuisine) params.set('cuisine', filters.cuisine);
  if (filters.cod) params.set('cod', '1');
  if (filters.shipFrom) params.set('ship_from', filters.shipFrom);
  if (filters.priceMin != null) params.set('price_min', String(filters.priceMin * 100));
  if (filters.priceMax != null) params.set('price_max', String(filters.priceMax * 100));
  if (filters.sort) params.set('sort', filters.sort);
  if (filters.userId) params.set('user_id', filters.userId);
  const res = await fetch(`/api/search?${params}`, { cache: 'no-store' });
  return res.json() as Promise<{ hits: SearchHit[]; count: number; facets?: unknown; source: string; tab: string }>;
}

export async function searchProducts(filters: SearchFilters): Promise<{
  products: TtProduct[];
  facets?: unknown;
  count: number;
  source: string;
}> {
  try {
    const data = await runSearch({ ...filters, tab: 'product' });
    if (Array.isArray(data.hits)) {
      return {
        products: data.hits as TtProduct[],
        facets: data.facets,
        count: data.count || data.hits.length,
        source: data.source || 'search-svc',
      };
    }
  } catch {
    /* fallback */
  }
  return { products: [], count: 0, source: 'fallback' };
}

export async function searchEntities(filters: SearchFilters) {
  try {
    return await runSearch(filters);
  } catch {
    return { hits: [], count: 0, source: 'fallback', tab: filters.tab || 'product' };
  }
}

export const CATEGORY_OPTIONS = [
  { id: '', label: 'ทุกหมวด' },
  { id: 'fashion', label: 'แฟชั่น' },
  { id: 'beauty', label: 'ความงาม' },
  { id: 'electronics', label: 'อิเล็กทรอนิกส์' },
  { id: 'food', label: 'อาหาร' },
  { id: 'home', label: 'บ้าน' },
  { id: 'sports', label: 'กีฬา' },
];

export const SHIP_OPTIONS = [
  { id: '', label: 'ทุกพื้นที่' },
  { id: 'TH', label: 'ไทย' },
  { id: 'CN', label: 'จีน' },
];

export const PRICE_PRESETS = [
  { id: '', label: 'ทุกราคา', min: undefined, max: undefined },
  { id: 'u500', label: 'ต่ำกว่า ฿500', min: undefined, max: 500 },
  { id: '500-1000', label: '฿500–1,000', min: 500, max: 1000 },
  { id: 'o1000', label: '฿1,000+', min: 1000, max: undefined },
];
