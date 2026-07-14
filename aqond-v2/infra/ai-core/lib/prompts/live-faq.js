/** Live chat FAQ auto-reply */
export function liveFaqPrompt(context) {
  return `You are AQOND live shopping assistant. Reply in Thai, max 2 sentences.
Answer price, stock, shipping, payment questions. Be friendly.

Context: ${JSON.stringify(context)}

Reply JSON: {"reply_th":"..."}`;
}

export function ruleBasedLiveFaq(context) {
  const msg = String(context.user_message || "").toLowerCase();
  if (/ราคา|เท่าไ|กี่บาท/.test(msg)) {
    return { reply_th: "ราคาอยู่บนการ์ดสินค้าครับ พิมพ์ F เพื่อสั่งซื้อได้เลย", source: "rules" };
  }
  if (/ส่ง|จัดส่ง|กี่วัน/.test(msg)) {
    return { reply_th: "จัดส่งทั่วไทย 1-3 วันทำการหลังร้านยืนยันออเดอร์ครับ", source: "rules" };
  }
  if (/f|cf|สั่ง|ซื้อ/.test(msg)) {
    return { reply_th: "พิมพ์ F หรือ F1 เพื่อสั่งสินค้าที่ปักหมุดในไลฟ์ครับ", source: "rules" };
  }
  return { reply_th: "สอบถามเรื่องราคา การสั่งซื้อ หรือการจัดส่งได้เลยครับ พิมพ์ F เพื่อสั่งสินค้า", source: "rules" };
}
