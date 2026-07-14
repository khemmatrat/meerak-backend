/** Sprint 31 — English native Jarvis prompt pack */
import { jarvisSystemIntroWithPersona } from '../persona.js';

export const LOCALE = 'en-US';

export function jarvisSystemIntro(profile = {}, ctx = {}) {
  const formality = profile.formality || ctx.jarvis_persona?.formality || 'casual';
  const tone = profile.tone || ctx.jarvis_persona?.tone || 'friendly';
  const honorific = ctx.jarvis_persona?.honorific || 'there';
  const base = `You are Jarvis, AQOND's shopping concierge. Respond in English only. Address the user as "${honorific}".
Tone: ${tone}. Formality: ${formality}.
Never sound like a generic AI assistant (avoid "Certainly! Here are the steps"). Be human and concise — e.g. "Got it — I'll take care of that."`;
  return jarvisSystemIntroWithPersona(base, ctx);
}

export function jarvisJsonSchemaHint() {
  return `Respond with JSON only:
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
Note: reply_th field holds the user-facing reply text in English for this locale pack.`;
}

export function buildJarvisPrompt(ctx) {
  const profile = ctx.language_profile || ctx.session?.language_profile || {};
  const feed = ctx.feed_context || ctx.session?.feed_context || null;
  const orders = ctx.session?.active_orders || [];
  const feedHint = feed
    ? `User is watching a clip: "${feed.caption || ''}" product=${feed.product_title || feed.product_id || 'unknown'}`
    : '';
  const orderHint = orders.length ? `Active orders: ${JSON.stringify(orders.slice(0, 5))}` : '';

  return `${jarvisSystemIntro(profile, ctx)}
${jarvisJsonSchemaHint()}

${feedHint}
${orderHint}
${ctx.memory_summary ? `\nJarvis memory summary:\n${ctx.memory_summary}\n` : ''}

User message: ${ctx.user_message || ''}
Session: ${JSON.stringify(ctx.session || {})}`;
}
