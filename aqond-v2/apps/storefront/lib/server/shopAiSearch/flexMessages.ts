import { formatCatalogPrice } from '@/lib/format';
import type { ShopAiCartLine, ShopAiLinePayload, ShopAiProduct } from './types';
import { cartSubtotalMicro } from './sessionStore';

const PLACEHOLDER_IMG = 'https://developers-resource.landpress.line.me/fx/img/01_1_cafe.png';

function priceLabel(micro: number) {
  return formatCatalogPrice(micro);
}

function productBubble(p: ShopAiProduct) {
  return {
    type: 'bubble',
    size: 'micro',
    hero: {
      type: 'image',
      url: p.image_url || PLACEHOLDER_IMG,
      size: 'full',
      aspectRatio: '1:1',
      aspectMode: 'cover',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        { type: 'text', text: p.title, weight: 'bold', size: 'sm', wrap: true },
        { type: 'text', text: priceLabel(p.price_micro), size: 'sm', color: '#E85D04' },
        { type: 'text', text: p.merchant_name, size: 'xs', color: '#888888', wrap: true },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          style: 'primary',
          height: 'sm',
          action: {
            type: 'postback',
            label: 'เลือก',
            data: `action=select&product_id=${encodeURIComponent(p.id)}`,
          },
        },
      ],
    },
  };
}

/** Step 1 — product carousel from DB results. */
export function productCarousel(products: ShopAiProduct[], altPrefix = 'สินค้าแนะนำ'): ShopAiLinePayload {
  const bubbles = products.slice(0, 10).map(productBubble);
  return {
    messages: [
      {
        type: 'flex',
        altText: `${altPrefix} ${products.length} รายการ`,
        contents: { type: 'carousel', contents: bubbles },
      },
    ],
  };
}

/** Step 2 — single cheapest product highlight. */
export function cheapestProductCard(product: ShopAiProduct): ShopAiLinePayload {
  return {
    messages: [
      { type: 'text', text: `ตัวที่ถูกที่สุดตอนนี้: "${product.title}" — ${priceLabel(product.price_micro)} จาก ${product.merchant_name}` },
      productCarousel([product], 'สินค้าที่ถูกที่สุด'),
    ],
  };
}

/** Step 3 — quantity quick replies 1–10. */
export function qtyQuickReply(product: ShopAiProduct): ShopAiLinePayload {
  const items = Array.from({ length: 10 }, (_, i) => {
    const n = i + 1;
    return {
      type: 'action' as const,
      action: {
        type: 'postback' as const,
        label: String(n),
        data: `action=qty&product_id=${encodeURIComponent(product.id)}&value=${n}`,
      },
    };
  });
  items.push({
    type: 'action',
    action: {
      type: 'message',
      label: 'พิมพ์จำนวนเอง',
      text: 'พิมพ์จำนวนเป็นตัวเลข เช่น 3',
    },
  });
  return {
    messages: [
      {
        type: 'text',
        text: `เลือก "${product.title}" แล้ว — ต้องการกี่ชิ้นครับ? (${priceLabel(product.price_micro)} / ชิ้น)`,
      },
    ],
    quickReply: { items },
  };
}

/** Step 4 — cart summary with checkout postback (gated upstream). */
export function cartSummary(cart: ShopAiCartLine[], shippingMicro = 0): ShopAiLinePayload {
  const subtotal = cartSubtotalMicro(cart);
  const total = subtotal + shippingMicro;
  const rows = cart.map((it) => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      {
        type: 'text',
        text: `${it.title} × ${it.qty}`,
        size: 'sm',
        wrap: true,
        flex: 4,
      },
      {
        type: 'text',
        text: priceLabel(it.line_micro),
        size: 'sm',
        align: 'end',
        flex: 2,
      },
    ],
  }));

  const merchants = [...new Set(cart.map((c) => c.merchant_name))].join(', ');

  return {
    messages: [
      {
        type: 'flex',
        altText: `สรุปตะกร้า ${priceLabel(total)}`,
        contents: {
          type: 'bubble',
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            contents: [
              { type: 'text', text: 'สรุปตะกร้า', weight: 'bold', size: 'lg' },
              { type: 'text', text: `ร้าน: ${merchants}`, size: 'xs', color: '#888888', wrap: true },
              ...rows,
              { type: 'separator', margin: 'md' },
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'ยอดสินค้า', size: 'sm', color: '#888888' },
                  { type: 'text', text: priceLabel(subtotal), size: 'sm', align: 'end' },
                ],
              },
              ...(shippingMicro > 0
                ? [{
                    type: 'box',
                    layout: 'horizontal',
                    contents: [
                      { type: 'text', text: 'ค่าส่ง', size: 'sm', color: '#888888' },
                      { type: 'text', text: priceLabel(shippingMicro), size: 'sm', align: 'end' },
                    ],
                  }]
                : []),
              {
                type: 'box',
                layout: 'horizontal',
                margin: 'md',
                contents: [
                  { type: 'text', text: 'รวมทั้งหมด', weight: 'bold', size: 'md' },
                  { type: 'text', text: priceLabel(total), weight: 'bold', size: 'md', align: 'end', color: '#E85D04' },
                ],
              },
            ],
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: [
              {
                type: 'button',
                style: 'primary',
                action: {
                  type: 'postback',
                  label: 'สั่งซื้อ',
                  data: 'action=checkout',
                },
              },
            ],
          },
        },
      },
    ],
  };
}

export function helpMessage(): ShopAiLinePayload {
  return {
    messages: [
      {
        type: 'text',
        text: 'สวัสดีครับ — พิมพ์ชื่อสินค้าเพื่อค้นหา เช่น "น้ำยาล้างจาน" หรือ "เอาลีปอนเอฟที่ถูกที่สุด" แล้วเลือกจำนวน ระบบจะสรุปตะกร้าให้ก่อนสั่งซื้อ',
      },
    ],
  };
}
