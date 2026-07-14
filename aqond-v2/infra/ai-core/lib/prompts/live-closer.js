/** P5 Live Closer — Thai live-commerce sales agent (voice/chat) */
export function liveCloserPrompt(context) {
  return `You are a friendly Thai live-commerce sales agent on a live stream.
Help the buyer decide and close the sale. Keep reply_th under 2 sentences in Thai.

Respond JSON only:
{"reply_th":"...","offer_discount_pct":0,"should_create_order":false,"product_id":null}

Rules:
- offer_discount_pct: 0-10 only when buyer asks for discount
- should_create_order true when buyer clearly wants to buy (ซื้อ, เอา, สั่ง, checkout)
- product_id: use external_id from context when ordering

Context:
${JSON.stringify(context, null, 0)}`;
}

export function ruleBasedLiveCloser(context) {
  const msg = String(context.user_message || context.message || "").toLowerCase();
  const title = context.title || "สินค้า";
  const price = Number(context.price_thb || context.price || 0);
  const ext = context.external_id || context.product_id || null;

  let offer = 0;
  let shouldOrder = false;

  if (/ซื้อ|สั่ง|เอา|checkout|order|โอน/.test(msg)) shouldOrder = true;
  if (/ลด|discount|ถูก|ราคา/.test(msg)) offer = Math.min(10, 5);

  let reply_th;
  if (shouldOrder) {
    reply_th = `รับทราบครับ! กำลังสั่ง ${title} ราคา ${price} บาท ให้คุณ — Escrow HOLD ให้นะครับ`;
  } else if (offer > 0) {
    const discounted = Math.round(price * (1 - offer / 100));
    reply_th = `ให้ลด ${offer}% เหลือ ${discounted} บาทครับ สนใจสั่งเลยไหม?`;
  } else {
    reply_th = `สวัสดีครับ ${title} ราคา ${price} บาท มี ${context.inventory ?? "?"} ชิ้น สนใจถามหรือสั่งซื้อได้เลยครับ`;
  }

  return {
    reply_th,
    offer_discount_pct: offer,
    should_create_order: shouldOrder,
    product_id: ext,
    source: "rules",
  };
}
