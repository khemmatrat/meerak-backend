/** Client-safe marketplace product thumbnails for order lists. */
const DEMO_RR_IMAGES = [
  'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=200&h=200&fit=crop',
  'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=200&h=200&fit=crop',
  'https://images.unsplash.com/photo-1515823064-d6e0c04616a7?w=200&h=200&fit=crop',
  'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=200&h=200&fit=crop',
];

const TITLE_PATTERNS: Array<{ re: RegExp; url: string }> = [
  { re: /กรรไกร|scissor|hair/i, url: DEMO_RR_IMAGES[0] },
  { re: /โทรศัพท์|phone|5g|v29/i, url: DEMO_RR_IMAGES[1] },
  { re: /matcha|ชา/i, url: DEMO_RR_IMAGES[2] },
  { re: /เสื้อ|shirt|ผ้า/i, url: DEMO_RR_IMAGES[3] },
  { re: /หมูหยอง|pork/i, url: 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=200&h=200&fit=crop' },
  { re: /ครีม|vitamin|skincare/i, url: 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=200&h=200&fit=crop' },
  { re: /หูฟัง|earbud|bluetooth/i, url: 'https://images.unsplash.com/photo-1590658268037-6bf12f032a28?w=200&h=200&fit=crop' },
  { re: /รองเท้า|shoe|sneaker/i, url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=200&h=200&fit=crop' },
  { re: /กระเป๋า|bag/i, url: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=200&h=200&fit=crop' },
];

const FALLBACK =
  'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=200&h=200&fit=crop';

export function marketplaceItemImageUrl(
  productId?: string,
  title?: string,
  orderId?: string,
  imageUrl?: string,
): string {
  if (imageUrl) return imageUrl;
  if (orderId?.includes('demo-rr')) {
    const idx = parseInt(orderId.slice(-1), 10) - 1;
    if (idx >= 0 && idx < DEMO_RR_IMAGES.length) return DEMO_RR_IMAGES[idx];
  }
  const t = title || productId || '';
  for (const { re, url } of TITLE_PATTERNS) {
    if (re.test(t)) return url;
  }
  const seed = (productId || title || 'item').split('').reduce((n, c) => n + c.charCodeAt(0), 0);
  return `${FALLBACK}&sig=${seed % 997}`;
}
