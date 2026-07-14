/** ใช้เมื่อช่องทาง PromptPay / TrueMoney ยังไม่ได้ต่อ API บนเซิร์ฟเวอร์นี้ */
export function paymentProviderNotConfigured(channel: string): Error & { code: string } {
  const e = new Error(
    `ช่องทาง ${channel} ยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์ — ใช้ Stripe หรือต่อระบบชำระเงินตามที่องค์กรเลือก`
  ) as Error & { code: string };
  e.code = "PAYMENT_PROVIDER_NOT_CONFIGURED";
  return e;
}
