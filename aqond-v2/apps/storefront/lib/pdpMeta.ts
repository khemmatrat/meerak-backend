export type PdpMedia = { type: 'image' | 'video'; url: string; label?: string };

export type PdpVariant = {
  id: string;
  label: string;
  value: string;
  image_url?: string;
  price_micro: number;
  sku?: string;
};

export type PdpProduct = {
  id: string;
  title: string;
  description?: string;
  category?: string;
  merchant_id?: string;
  store_id?: string;
  price_micro: number;
  list_price_micro?: number;
  sold_count?: number;
  metadata?: Record<string, unknown>;
};

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

const COLOR_SWATCHES = ['#1f2937', '#ec4899', '#f8fafc', '#a855f7', '#059669', '#f59e0b'];

export function parsePdpMedia(product: PdpProduct, fallbackImage?: string): PdpMedia[] {
  const meta = product.metadata || {};
  const out: PdpMedia[] = [];
  const seen = new Set<string>();

  const push = (type: PdpMedia['type'], url?: string, label?: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({ type, url, label });
  };

  push('image', fallbackImage);
  push('image', meta.image_url as string);
  for (const img of asArray<{ url?: string }>(meta.images)) {
    push('image', img.url);
  }
  for (const u of asArray<string>(meta.image_uris)) {
    push('image', u);
  }
  push('video', meta.video_url as string, 'วิดีโอสินค้า');
  push('video', meta.product_video_url as string, 'วิดีโอสินค้า');

  if (!out.length) {
    push('image', fallbackImage);
  }
  return out;
}

export function parsePdpVariants(
  product: PdpProduct,
  catalogVariants: Array<{ id: string; sku?: string; price_micro?: number; option_label?: string; option_value?: string }>,
  media: PdpMedia[],
): PdpVariant[] {
  const meta = product.metadata || {};
  const fromMeta = asArray<{
    id?: string;
    label?: string;
    value?: string;
    color?: string;
    image_url?: string;
    price_micro?: number;
  }>(meta.variant_options);

  if (fromMeta.length) {
    return fromMeta.map((v, i) => ({
      id: v.id || `var-${i}`,
      label: v.label || 'สี',
      value: v.value || v.color || `ตัวเลือก ${i + 1}`,
      image_url: v.image_url || media[i + 1]?.url || media[0]?.url,
      price_micro: v.price_micro || product.price_micro,
    }));
  }

  if (catalogVariants.length > 1) {
    return catalogVariants.map((v, i) => ({
      id: v.id || `${product.id}-var-${i}`,
      label: v.option_label || 'ตัวเลือก',
      value: v.option_value || v.sku || `ตัวเลือก ${i + 1}`,
      image_url: media[i]?.url || media[0]?.url,
      price_micro: v.price_micro || product.price_micro,
      sku: v.sku,
    }));
  }

  const colorCount = Math.min(Math.max(media.length, 1), 4);
  return Array.from({ length: colorCount }, (_, i) => ({
    id: `${product.id}-color-${i}`,
    label: 'สี',
    value: ['ดำ', 'ชมพู', 'ขาว', 'ม่วง'][i] || `สี ${i + 1}`,
    image_url: media[i]?.url || media[0]?.url,
    price_micro: catalogVariants[0]?.price_micro || product.price_micro,
    sku: catalogVariants[0]?.sku,
  })).map((v, i) => ({ ...v, swatch: COLOR_SWATCHES[i] } as PdpVariant & { swatch?: string }));
}

export function parseDiscount(product: PdpProduct) {
  const meta = product.metadata || {};
  const list = Number(meta.list_price_micro || meta.original_price_micro || 0);
  const price = product.price_micro;
  if (list > price) {
    const pct = Math.round(((list - price) / list) * 100);
    return { list_price_micro: list, discount_pct: pct, label: `ลด ${pct}%` };
  }
  const pct = Number(meta.discount_percent || meta.discount_pct || 0);
  if (pct > 0) {
    return {
      list_price_micro: Math.round(price / (1 - pct / 100)),
      discount_pct: pct,
      label: `ส่วนลด ${pct}%`,
    };
  }
  return { list_price_micro: undefined, discount_pct: 0, label: '' };
}

export function shippingEtaDays(min = 2, max = 4) {
  const now = new Date();
  const fmt = (d: Date) =>
    d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  const a = new Date(now);
  a.setDate(a.getDate() + min);
  const b = new Date(now);
  b.setDate(b.getDate() + max);
  return { from: fmt(a), to: fmt(b), label: `${fmt(a)} - ${fmt(b)}` };
}

export function reviewFilterTags(reviews: Array<{ body?: string; rating?: number }>) {
  const tags = [
    { label: 'จัดส่งเร็ว', re: /เร็ว|fast|delivery/i },
    { label: 'ใช้งานง่าย', re: /ง่าย|easy/i },
    { label: 'คุณภาพดี', re: /ดี|quality|คุณภาพ/i },
    { label: 'แพ็กดี', re: /แพ็ก|pack/i },
  ];
  return tags
    .map((t) => ({
      label: t.label,
      count: reviews.filter((r) => t.re.test(String(r.body || ''))).length,
    }))
    .filter((t) => t.count > 0)
    .slice(0, 6);
}

export function aiReviewSummary(reviews: Array<{ body?: string }>, title: string): string[] {
  const bodies = reviews.map((r) => String(r.body || '')).join(' ');
  const out: string[] = [];
  if (/เร็ว|fast/i.test(bodies)) out.push('จัดส่งรวดเร็ว');
  if (/ง่าย|easy|ใช้/i.test(bodies)) out.push('ใช้งานง่าย');
  if (/ดี|quality|คุณภาพ/i.test(bodies)) out.push('คุณภาพดีตามราคา');
  if (!out.length) {
    out.push(`สินค้า${title.slice(0, 24)}ได้รับความนิยมใน marketplace`);
    out.push('ร้านผ่านการตรวจสอบความน่าเชื่อถือ');
  }
  return out.slice(0, 3);
}
