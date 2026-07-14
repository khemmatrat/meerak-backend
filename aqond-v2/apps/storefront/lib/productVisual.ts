import { merchantDisplayName } from '@/lib/checkoutVisual';

export const CAT_EMOJI: Record<string, string> = {
  fashion: '👗',
  beauty: '💄',
  electronics: '🎧',
  food: '🍜',
  home: '🏠',
  sports: '⚽',
  general: '📦',
};

const TITLE_HINTS: [RegExp, string][] = [
  [/รองเท้า|วิ่ง|กีฬา|fitness|yoga|basketball|บasket/i, 'sports'],
  [/เสื้อ|กางเกง|แฟชั่|dress|clothing/i, 'fashion'],
  [/ครีม|ลิป|beauty|สกิน|แต่งหน้า/i, 'beauty'],
  [/หูฟัง|usb|gadget|phone|bluetooth|hdmi/i, 'electronics'],
  [/กาแฟ|matcha|snack|food|อาหาร|ข้าว/i, 'food'],
  [/หมอน|kitchen|home|บ้าน|decor/i, 'home'],
];

export function guessCategory(title?: string): string {
  if (!title) return 'general';
  for (const [re, cat] of TITLE_HINTS) {
    if (re.test(title)) return cat;
  }
  return 'general';
}

export function productEmoji(category?: string, title?: string): string {
  const cat = category && CAT_EMOJI[category] ? category : guessCategory(title);
  return CAT_EMOJI[cat] || CAT_EMOJI.general;
}

export type ProductMeta = {
  id?: string;
  external_id?: string;
  title?: string;
  category?: string;
  image_url?: string;
  image_uris?: string[];
  images?: { url?: string }[];
};

function catalogImageUrl(p?: ProductMeta): string | undefined {
  if (!p) return undefined;
  if (p.image_url) return p.image_url;
  if (p.image_uris?.[0]) return p.image_uris[0];
  return p.images?.[0]?.url;
}

export function pickImageUrl(p?: ProductMeta | Record<string, unknown> | null): string | undefined {
  if (!p) return undefined;
  const meta = (p as any).metadata as ProductMeta | undefined;
  return catalogImageUrl(p as ProductMeta) || catalogImageUrl(meta);
}

function findCatalogProduct(catalog: ProductMeta[], productId?: string, title?: string) {
  if (productId) {
    const byId = catalog.find((p) => p.id === productId || p.external_id === productId);
    if (byId) return byId;
  }
  if (title) {
    const norm = title.trim().toLowerCase();
    return catalog.find((p) => (p.title || '').trim().toLowerCase() === norm);
  }
  return undefined;
}

export function enrichCartItem(
  item: { product_id?: string; title?: string; image_url?: string; category?: string; merchant_id?: string; merchant_hint?: string },
  catalog: ProductMeta[],
) {
  const hit = findCatalogProduct(catalog, item.product_id, item.title);
  const merchantId = item.merchant_id || (hit as any)?.merchant_hint || (hit as any)?.merchant_id;
  return {
    ...item,
    title: item.title && item.title !== 'test' ? item.title : hit?.title || item.title,
    category: item.category || hit?.category || guessCategory(item.title),
    image_url: item.image_url || catalogImageUrl(hit),
    merchant_id: merchantId,
    merchant_name: merchantDisplayName(merchantId),
  };
}