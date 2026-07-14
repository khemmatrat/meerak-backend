import type { ShopAiPostback } from './types';

const CHEAPEST_RE = /ถูก(ที่)?สุด|ราคาต่ำ|ตัวถูก|ที่สุดตอนนี้|compare|เปรียบเทียบ/;
const SELECT_RE = /^(เลือก|เอา|สั่ง)\s+/i;
const QTY_ONLY_RE = /^(\d{1,2})$/;

export type ParsedIntent =
  | { kind: 'search'; query: string }
  | { kind: 'cheapest'; query: string }
  | { kind: 'select_product'; productId: string }
  | { kind: 'set_qty'; qty: number }
  | { kind: 'checkout' }
  | { kind: 'show_cart' }
  | { kind: 'help' };

export function parsePostback(data: string): ShopAiPostback | null {
  try {
    const params = new URLSearchParams(data);
    const action = params.get('action');
    if (!action) return null;
    return {
      action: action as ShopAiPostback['action'],
      product_id: params.get('product_id') || undefined,
      value: params.get('value') || undefined,
    };
  } catch {
    return null;
  }
}

export function parseIntent(message: string, postback?: ShopAiPostback | null): ParsedIntent {
  if (postback) {
    if (postback.action === 'checkout') return { kind: 'checkout' };
    if (postback.action === 'select' && postback.product_id) {
      return { kind: 'select_product', productId: postback.product_id };
    }
    if (postback.action === 'qty') {
      const n = Number(postback.value || postback.product_id);
      if (Number.isFinite(n) && n >= 1) return { kind: 'set_qty', qty: Math.min(99, Math.floor(n)) };
    }
    if (postback.action === 'custom_qty') return { kind: 'help' };
  }

  const msg = message.trim();
  const lower = msg.toLowerCase();

  if (!msg || /^(สวัสดี|hello|hi|help|ช่วย)/i.test(msg)) return { kind: 'help' };
  if (/^(ดูตะกร้า|ตะกร้า|cart)$/i.test(msg)) return { kind: 'show_cart' };
  if (/^(สั่งซื้อ|checkout|จ่ายเงิน)$/i.test(msg)) return { kind: 'checkout' };

  const qtyMatch = msg.match(QTY_ONLY_RE);
  if (qtyMatch) return { kind: 'set_qty', qty: Math.min(99, parseInt(qtyMatch[1], 10)) };

  if (CHEAPEST_RE.test(lower)) {
    const query = msg.replace(CHEAPEST_RE, '').replace(/^(เอา|สั่ง|หา)\s*/i, '').trim();
    return { kind: 'cheapest', query: query || msg };
  }

  if (SELECT_RE.test(msg) && msg.includes('prod-')) {
    const id = msg.match(/prod-[a-z0-9-]+/i)?.[0];
    if (id) return { kind: 'select_product', productId: id };
  }

  const query = msg.replace(/^(หา|อยากได้|ขอ|สั่ง|ซื้อ)\s*/i, '').trim();
  return { kind: 'search', query: query || msg };
}
