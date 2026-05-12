/** sessionStorage key — ช่องทางที่เลือกจากหน้า PaymentMethodSelect */
export const MEERAK_PAYMENT_CHANNEL_KEY = "meerak_payment_channel";

export type StoredPaymentChannelId =
  | "promptpay"
  | "truemoney"
  | "shopeepay"
  | "stripe";

export function readStoredPaymentChannel(): StoredPaymentChannelId | null {
  try {
    const raw = sessionStorage.getItem(MEERAK_PAYMENT_CHANNEL_KEY);
    if (
      raw === "promptpay" ||
      raw === "truemoney" ||
      raw === "shopeepay" ||
      raw === "stripe"
    ) {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return null;
}
