/**
 * ช่องทางชำระเงิน/เติมเงินที่เปิด — GET /api/settings/payment-channels (สอดคล้อง ENV + circuit breaker ฝั่งเซิร์ฟเวอร์)
 */
import { api } from "./api";

export type PaymentChannelsAvailability = {
  updated_at: string;
  local_gateway: string;
  local_gateway_label: string;
  stripe_card_enabled: boolean;
  wallet: {
    payso_qr_enabled: boolean;
    manual_slip_enabled: boolean;
  };
  job_checkout: {
    payment_gateway_available: boolean;
    promptpay_local_enabled: boolean;
    stripe_card_enabled: boolean;
  };
  messages: {
    th: { payso_qr: string | null; payment_gateway: string | null };
    en: { payso_qr: string | null; payment_gateway: string | null };
  };
};

let cached: { data: PaymentChannelsAvailability; at: number } | null = null;
const TTL_MS = 60_000;

export async function fetchPaymentChannels(options?: {
  force?: boolean;
}): Promise<PaymentChannelsAvailability> {
  if (!options?.force && cached && Date.now() - cached.at < TTL_MS) {
    return cached.data;
  }
  const { data } = await api.get<PaymentChannelsAvailability>("/settings/payment-channels");
  cached = { data, at: Date.now() };
  return data;
}

export function clearPaymentChannelsCache() {
  cached = null;
}
