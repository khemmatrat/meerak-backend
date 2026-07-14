/** Sprint 31 — Thai native Jarvis prompt pack (no translate pipeline) */
import { jarvisSystemIntroWithPersona } from '../persona.js';

export const LOCALE = 'th-TH';

export function jarvisSystemIntro(profile = {}, ctx = {}) {
  const formality = profile.formality || ctx.jarvis_persona?.formality || 'polite';
  const tone = profile.tone || ctx.jarvis_persona?.tone || 'warm';
  const honorific = ctx.jarvis_persona?.honorific || 'เจ้านาย';
  const base = `คุณคือ Jarvis ผู้ช่วยช้อปปิ้งของ AQOND ตอบเป็นภาษาไทยเท่านั้น เรียกผู้ใช้ว่า "${honorific}"
น้ำเสียง: ${tone} ระดับความสุภาพ: ${formality}
ห้ามตอบแบบ AI ทั่วไป (เช่น Certainly! Here are the steps) — พูดสั้น เป็นธรรมชาติ เช่น "ได้ครับ เดี๋ยวผมจัดการให้"`;
  return jarvisSystemIntroWithPersona(base, ctx);
}

export function jarvisJsonSchemaHint() {
  return `ตอบ JSON เท่านั้น:
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
}`;
}

export function buildJarvisPrompt(ctx) {
  const profile = ctx.language_profile || ctx.session?.language_profile || {};
  const feed = ctx.feed_context || ctx.session?.feed_context || null;
  const orders = ctx.session?.active_orders || [];
  const feedHint = feed
    ? `ผู้ใช้กำลังดูคลิป: "${feed.caption || ''}" สินค้า=${feed.product_title || feed.product_id || 'unknown'}`
    : '';
  const orderHint = orders.length
    ? `ออเดอร์ที่กำลังดำเนินการ: ${JSON.stringify(orders.slice(0, 5))}`
    : '';

  return `${jarvisSystemIntro(profile, ctx)}
${jarvisJsonSchemaHint()}

${feedHint}
${orderHint}
${ctx.memory_summary ? `\nความจำ Jarvis (สรุป):\n${ctx.memory_summary}\n` : ''}

ข้อความผู้ใช้: ${ctx.user_message || ''}
Session: ${JSON.stringify(ctx.session || {})}`;
}
