/** Step 5+ checkout — default OFF until security audit guardrails are complete. */
export function isShopAiCheckoutEnabled(): boolean {
  return process.env.ENABLE_AI_CHECKOUT === '1' || process.env.ENABLE_AI_CHECKOUT === 'true';
}

export const CHECKOUT_DISABLED_MESSAGE =
  'ฟีเจอร์ชำระเงินผ่านแชทยังปิดอยู่ชั่วคราว (ENABLE_AI_CHECKOUT) — ตะกร้าของคุณถูกบันทึกแล้ว กรุณารอการเปิดใช้งานหลังตรวจสอบความปลอดภัย';
