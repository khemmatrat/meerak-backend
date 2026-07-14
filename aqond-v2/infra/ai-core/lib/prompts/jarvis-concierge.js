/** Jarvis shopping concierge — voice/text multi-step buying + food + order track */
import { jarvisConciergePromptLocalized } from './jarvis/index.js';

export function jarvisConciergePrompt(context) {
  const localized = jarvisConciergePromptLocalized(context);
  if (localized) return localized;

  const feed = context.feed_context || context.session?.feed_context || null;
  const orders = context.session?.active_orders || [];
  const feedHint = feed
    ? `User is watching a video feed clip. Caption: "${feed.caption || ""}". Linked product: ${feed.product_title || feed.product_id || "unknown"} (id=${feed.product_id || ""}, price_micro=${feed.price_micro || 0}, category=${feed.category || ""}, is_food=${!!feed.is_food}). Prefer recommending/buying from this clip when user asks about the video.`
    : "";
  const orderHint = orders.length
    ? `Active orders: ${JSON.stringify(orders.slice(0, 5))}. When user asks "ออเดอร์อยู่ไหน" / "ส่งถึงไหน" use track_order with order_id.`
    : "";
  return `You are Jarvis, a Thai shopping concierge for AQOND. Address user as "เจ้านาย".
Respond JSON only:
{
  "reply_th": "...",
  "action": "search|compare|select_variant|place_order|feed_food_order|feed_food_add|feed_food_menu|track_order|none",
  "search_query": "",
  "sort_by": "price_asc|rating|sales",
  "selected_product_id": "",
  "selected_food_item_id": "",
  "food_merchant_id": "",
  "selected_variant_value": "",
  "track_order_id": "",
  "should_place_order": false,
  "should_add_food": false,
  "should_food_order": false,
  "qty": 1
}

${feedHint}
${orderHint}

User: ${context.user_message || ""}
Session: ${JSON.stringify(context.session || {})}`;
}

export function ruleBasedJarvis(context) {
  const msg = String(context.user_message || "").toLowerCase();
  const session = context.session || {};
  const orders = session.active_orders || [];

  if (/ออเดอร์|ส่งถึง|อยู่ไหน|ติดตาม|track/.test(msg) && orders.length) {
    const oid = orders[0].order_id || orders[0].id;
    return {
      reply_th: `ออเดอร์ #${String(oid).slice(-8)} สถานะ ${orders[0].status_label || orders[0].status || "กำลังดำเนินการ"} ครับเจ้านาย`,
      action: "track_order",
      track_order_id: oid,
      source: "rules",
    };
  }

  if (/หิว|อาหาร|ส่งอาหาร|เมนู/.test(msg) && session.feed_context?.is_food) {
    if (/สั่งเลย|จัดมา|เอาเลย/.test(msg)) {
      return {
        reply_th: "รับทราบครับเจ้านาย กำลังสั่งอาหารจากคลิปให้ครับ",
        action: "feed_food_order",
        food_merchant_id: session.feed_context.food_merchant_id,
        should_food_order: true,
        source: "rules",
      };
    }
    if (/ใส่รถเข็น|เพิ่ม/.test(msg)) {
      return {
        reply_th: "ใส่เมนูจากคลิปลงรถเข็นอาหารให้ครับเจ้านาย",
        action: "feed_food_add",
        food_merchant_id: session.feed_context.food_merchant_id,
        should_add_food: true,
        source: "rules",
      };
    }
    return {
      reply_th: "กำลังดูเมนูจากคลิปที่เจ้านายดูอยู่ครับ",
      action: "feed_food_menu",
      food_merchant_id: session.feed_context.food_merchant_id,
      source: "rules",
    };
  }

  if (/ซื้อ|สั่ง|เอา/.test(msg) && session.selected_product_id) {
    return {
      reply_th: "รับทราบครับเจ้านาย กำลังสั่งซื้อให้ครับ",
      action: "place_order",
      selected_product_id: session.selected_product_id,
      should_place_order: true,
      qty: 1,
      source: "rules",
    };
  }
  if (/ถูก|ราคา|compare/.test(msg)) {
    return {
      reply_th: "รอสักครู่ครับเจ้านาย กำลังเปรียบเทียบราคาให้",
      action: "compare",
      sort_by: "price_asc",
      source: "rules",
    };
  }
  if (/สี|ขนาด|variant/.test(msg)) {
    const color = msg.match(/(เหลือง|แดง|น้ำเงิน|เขียว|ขาว|ดำ)/)?.[1] || "";
    return {
      reply_th: color ? `เลือกตัวเลือกสี${color}ให้เจ้านายครับ` : "เลือกตัวเลือกให้เจ้านายครับ",
      action: "select_variant",
      selected_variant_value: color,
      source: "rules",
    };
  }
  return {
    reply_th: "รอสักครู่ครับเจ้านาย กำลังค้นหาสินค้าให้",
    action: "search",
    search_query: context.user_message || "สินค้า",
    sort_by: "price_asc",
    source: "rules",
  };
}
