const TITLE_HINTS: [RegExp, string][] = [
  [/รองเท้า|วิ่ง|กีฬา|fitness|yoga|basketball/i, 'sports'],
  [/เสื้อ|กางเกง|แฟชั่|dress|clothing/i, 'fashion'],
  [/ครีม|ลิป|beauty|สกิน|แต่งหน้า/i, 'beauty'],
  [/หูฟัง|usb|gadget|phone|bluetooth|hdmi/i, 'electronics'],
  [/กาแฟ|matcha|snack|food|อาหาร|ข้าว/i, 'food'],
  [/หมอน|kitchen|home|บ้าน|decor/i, 'home'],
];

export function guessCategory(text?: string): string {
  if (!text) return 'general';
  for (const [re, cat] of TITLE_HINTS) {
    if (re.test(text)) return cat;
  }
  return 'general';
}

function parsePriceThb(text: string): number | null {
  const m = text.match(/(\d{2,5})\s*(?:บาท|thb|฿)/i) || text.match(/(?:ราคา|price)\s*[:：]?\s*(\d{2,5})/i);
  if (m) return Math.min(99999, parseInt(m[1], 10));
  return null;
}

function pickTitle(vision: string, hint: string): string {
  if (hint.trim()) return hint.trim().slice(0, 80);
  const line = vision.split(/[.。\n]/).find((s) => s.trim().length > 3);
  return (line || vision || 'สินค้าใหม่').trim().slice(0, 80);
}

export type ProductDraft = {
  title: string;
  description: string;
  category: string;
  price_thb: number;
  inventory: number;
  seo_tags?: string[];
};

export function rulesDraftFromHint(hint: string): ProductDraft {
  const text = hint.trim();
  const category = guessCategory(text);
  const price = parsePriceThb(text) || 199;
  return {
    title: text.slice(0, 80) || 'สินค้าใหม่',
    description: text ? `${text} — สินค้าคุณภาพ จัดส่งเร็ว` : 'สินค้าคุณภาพ จัดส่งเร็ว',
    category,
    price_thb: price,
    inventory: 10,
    seo_tags: [category, 'th', 'marketplace'],
  };
}

export function rulesDraftFromVision(vision: string, hint: string): ProductDraft {
  const combined = `${vision} ${hint}`.trim();
  const category = guessCategory(combined);
  const price = parsePriceThb(combined) || parsePriceThb(hint) || 199;
  const title = pickTitle(vision, hint);
  return {
    title,
    description: vision.slice(0, 400) || `${title} — สินค้าคุณภาพ จัดส่งเร็ว`,
    category,
    price_thb: price,
    inventory: 10,
    seo_tags: [category, 'ai-vision', 'th'],
  };
}

export async function tryVisionDescribe(
  imageBase64: string,
  hint: string,
  timeoutMs = 45000,
): Promise<{ vision: string; latency_ms: number } | null> {
  const { aiCoreApi, aiCoreKey } = await import('@/lib/server-env');
  const key = aiCoreKey();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) headers['X-AI-Core-Api-Key'] = key;

  try {
    const res = await fetch(aiCoreApi('/v1/vision/describe'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        image_base64: imageBase64.replace(/^data:image\/\w+;base64,/, ''),
        merchant_hint: hint || 'identify product for Thai marketplace listing',
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.vision_description) return null;
    return { vision: data.vision_description, latency_ms: data.latency_ms || 0 };
  } catch {
    return null;
  }
}
