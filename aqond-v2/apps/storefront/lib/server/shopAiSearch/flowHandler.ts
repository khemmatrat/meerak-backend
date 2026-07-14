import { CHECKOUT_DISABLED_MESSAGE, isShopAiCheckoutEnabled } from './flags';
import {
  cartSummary,
  cheapestProductCard,
  helpMessage,
  productCarousel,
  qtyQuickReply,
} from './flexMessages';
import { parseIntent, parsePostback } from './intent';
import { findCheapest, getProductById, searchProducts } from './productQuery';
import { addToCart, loadSession, resolveUserKey, saveSession } from './sessionStore';
import type { ShopAiFlowResult, ShopAiPostback, ShopAiSession } from './types';

export type ShopAiFlowInput = {
  line_user_id?: string;
  user_id?: string;
  message?: string;
  postback_data?: string;
};

async function afterSelect(session: ShopAiSession, productId: string): Promise<ShopAiFlowResult> {
  const product = await getProductById(productId);
  if (!product) {
    return {
      ok: false,
      step: 'select',
      session,
      line: { messages: [{ type: 'text', text: 'ไม่พบสินค้านี้ในระบบ กรุณาค้นหาใหม่ครับ' }] },
      error: 'product_not_found',
    };
  }
  const next: ShopAiSession = {
    ...session,
    phase: 'qty_pending',
    selected_product_id: product.id,
  };
  const saved = await saveSession(next);
  return {
    ok: true,
    step: 'qty',
    session: saved,
    line: qtyQuickReply(product),
  };
}

export async function runShopAiFlow(input: ShopAiFlowInput): Promise<ShopAiFlowResult> {
  const userKey = resolveUserKey(input.line_user_id, input.user_id);
  let session = await loadSession(userKey);
  const postback: ShopAiPostback | null = input.postback_data
    ? parsePostback(input.postback_data)
    : null;
  const intent = parseIntent(input.message || '', postback);

  if (intent.kind === 'checkout') {
    if (!isShopAiCheckoutEnabled()) {
      return {
        ok: false,
        step: 'checkout_blocked',
        session,
        line: { messages: [{ type: 'text', text: CHECKOUT_DISABLED_MESSAGE }] },
        error: 'checkout_disabled',
      };
    }
    return {
      ok: false,
      step: 'checkout_blocked',
      session,
      line: { messages: [{ type: 'text', text: 'checkout not implemented in this build' }] },
      error: 'checkout_not_implemented',
    };
  }

  if (intent.kind === 'help') {
    return { ok: true, step: 'help', session, line: helpMessage() };
  }

  if (intent.kind === 'show_cart') {
    if (!session.cart.length) {
      return {
        ok: true,
        step: 'cart_summary',
        session,
        line: { messages: [{ type: 'text', text: 'ตะกร้ายังว่างอยู่ครับ — ลองค้นหาสินค้าก่อนได้เลย' }] },
      };
    }
    return { ok: true, step: 'cart_summary', session, line: cartSummary(session.cart) };
  }

  if (intent.kind === 'set_qty') {
    const productId = session.selected_product_id;
    if (!productId || session.phase !== 'qty_pending') {
      return {
        ok: false,
        step: 'qty',
        session,
        line: { messages: [{ type: 'text', text: 'กรุณาเลือกสินค้าก่อน แล้วระบุจำนวนครับ' }] },
        error: 'no_selected_product',
      };
    }
    const added = await addToCart(session, productId, intent.qty);
    if ('error' in added) {
      return {
        ok: false,
        step: 'qty',
        session,
        line: { messages: [{ type: 'text', text: 'ไม่สามารถเพิ่มลงตะกร้าได้ กรุณาลองใหม่ครับ' }] },
        error: added.error,
      };
    }
    const saved = await saveSession(added.session);
    return {
      ok: true,
      step: 'cart_summary',
      session: saved,
      line: {
        messages: [
          { type: 'text', text: `เพิ่ม "${added.line.title}" × ${intent.qty} ลงตะกร้าแล้วครับ` },
          ...cartSummary(saved.cart).messages,
        ],
      },
    };
  }

  if (intent.kind === 'select_product') {
    return afterSelect(session, intent.productId);
  }

  if (postback?.action === 'select' && postback.product_id) {
    return afterSelect(session, postback.product_id);
  }

  if (intent.kind === 'cheapest') {
    const pool = session.last_search?.length ? session.last_search : undefined;
    const hit = await findCheapest(intent.query, pool);
    if (!hit) {
      return {
        ok: false,
        step: 'refine',
        session,
        line: { messages: [{ type: 'text', text: 'ยังไม่พบสินค้าที่ตรงคำค้น ลองพิมพ์ชื่อสินค้าให้ชัดขึ้นครับ' }] },
        error: 'not_found',
      };
    }
    const next = await saveSession({
      ...session,
      phase: 'selected',
      last_query: intent.query,
      selected_product_id: hit.id,
      last_search: pool || [hit],
    });
    return {
      ok: true,
      step: 'refine',
      session: next,
      line: cheapestProductCard(hit),
    };
  }

  if (intent.kind === 'search') {
    const products = await searchProducts(intent.query, 10);
    if (!products.length) {
      return {
        ok: false,
        step: 'search',
        session,
        line: { messages: [{ type: 'text', text: 'ขออภัยครับ ยังไม่พบสินค้าที่ตรงคำค้น — ลองพิมพ์ชื่ออื่นดูได้ครับ' }] },
        error: 'not_found',
      };
    }
    const next = await saveSession({
      ...session,
      phase: 'searched',
      last_query: intent.query,
      last_search: products,
    });
    return {
      ok: true,
      step: 'search',
      session: next,
      line: {
        messages: [
          { type: 'text', text: `พบ ${products.length} รายการสำหรับ "${intent.query}" — เลือกสินค้าหรือพิมพ์ "ที่ถูกที่สุด" ได้ครับ` },
          ...productCarousel(products).messages,
        ],
      },
    };
  }

  return { ok: true, step: 'help', session, line: helpMessage() };
}
