import type { TtProduct } from '@/components/mobile/TtProductGrid';

/** Normalize for Thai + Latin product title matching. */
function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, '');
}

/**
 * Match product title to query — exact substring first, then light fuzzy (S002 step 2).
 */
export function matchProductQuery(title: string | undefined, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  const t = (title || '').toLowerCase();
  const ql = q.toLowerCase();
  if (t.includes(ql)) return true;

  const tn = norm(title || '');
  const qn = norm(q);
  if (tn.includes(qn)) return true;

  // Drop last char — common typo / incomplete typing
  if (qn.length >= 3 && tn.includes(qn.slice(0, -1))) return true;

  // Token match — each word fragment in query appears in title
  const tokens = ql.split(/\s+/).filter((w) => w.length >= 2);
  if (tokens.length > 1 && tokens.every((w) => t.includes(w))) return true;

  return false;
}

export function filterCatalogProducts(products: TtProduct[], query: string, category?: string) {
  let list = products;
  if (category) list = list.filter((p) => p.category === category);
  const q = query.trim();
  if (!q) return list;
  return list.filter((p) => matchProductQuery(String(p.title || ''), q));
}

export const SEARCH_SUGGESTED_QUERIES = ['ครีมกันแดด', 'แฟชั่น', 'อิเล็กทรอนิกส์', 'สินค้าใหม่'];
