/**
 * ค่าธรรมเนียมที่ไม่ใช่ payout threshold — ใบรับรองรายได้, snapshot MDR เติมเงิน (Payso/Ksher/Stripe)
 * Backend: GET /api/payouts/settings
 */
import { api } from "./api";

export type PayoutSettingsResponse = {
  certified_statement: {
    fee_thb: number;
    min_thb: number;
    max_thb: number;
  };
  wallet_deposit: {
    local_gateway: string;
    local_gateway_label?: string;
    match_markup_percent?: number;
    stripe_card_enabled?: boolean;
    mdr_inbound_percent?: Record<string, number | undefined>;
    stripe_card_fixed_fee_domestic_thb?: number;
  };
  help?: { th?: string; en?: string };
};

let cached: { data: PayoutSettingsResponse; at: number } | null = null;
const TTL_MS = 120_000;

export async function fetchPayoutSettings(options?: { force?: boolean }): Promise<PayoutSettingsResponse> {
  if (!options?.force && cached && Date.now() - cached.at < TTL_MS) {
    return cached.data;
  }
  const { data } = await api.get<PayoutSettingsResponse>("/payouts/settings");
  cached = { data, at: Date.now() };
  return data;
}

export function clearPayoutSettingsCache() {
  cached = null;
}
