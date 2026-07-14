/**
 * ประมาณการค่าธรรมเนียม + ราคา VIP จาก backend (payout_config) — sync กับ Admin Financial Dashboard
 */
import { api } from "./api";

export type FeeRatesPayload = {
  platform_fee: Record<string, number>;
  commission_match_board: Record<string, number>;
  commission_booking: Record<string, number>;
  handling_fee_percent?: number;
  payment_markup_percent?: number;
  /** Per-tier sourcing / handling for Match+Board (optional — falls back to handling_fee_percent) */
  sourcing_fee_match_board?: Record<string, number>;
};

export type VipTierPayload = {
  quotaPerMonth: number;
  discountPercent: number;
  priceMonthly: number;
};

export type FeeEstimatesResponse = {
  fee_rates: FeeRatesPayload;
  vip_tiers: Record<string, VipTierPayload>;
  withdrawal_min_jobs: number;
  withdrawal_min_balance_thb: number;
  withdrawal_fee_standard_thb: number;
  withdrawal_fee_instant_thb: number;
  help?: { th?: string; en?: string };
};

let cached: { data: FeeEstimatesResponse; at: number } | null = null;
const TTL_MS = 120_000;

export async function fetchFeeEstimates(options?: { force?: boolean }): Promise<FeeEstimatesResponse> {
  if (!options?.force && cached && Date.now() - cached.at < TTL_MS) {
    return cached.data;
  }
  const { data } = await api.get<FeeEstimatesResponse>("/app/fee-estimates");
  cached = { data, at: Date.now() };
  return data;
}

export function clearFeeEstimatesCache() {
  cached = null;
}

const TAX_ON_SOURCING_COMMISSION = 0.03;

export function normalizeFeeTier(tier: string | null | undefined): string {
  const t = (tier || "none").toString().toLowerCase().trim();
  return ["silver", "gold", "platinum"].includes(t) ? t : "none";
}

/** Match job — ประมาณการฝั่ง Talent (Sourcing + Commission + Tax) จาก fee_rates เดียวกับ Admin Dashboard */
export function estimateMatchTalentBreakdown(
  jobFee: number,
  providerTier: string | null | undefined,
  feeRates: FeeRatesPayload
): {
  sourcingFee: number;
  commission: number;
  taxService: number;
  talentNet: number;
  sourcingPct: number;
  commissionPct: number;
} {
  const tier = normalizeFeeTier(providerTier);
  const srcMap = feeRates.sourcing_fee_match_board;
  const sourcingPct = Number(
    srcMap?.[tier] ?? srcMap?.none ?? feeRates.handling_fee_percent ?? 8
  );
  const commissionPct = Number(
    feeRates.commission_match_board?.[tier] ?? feeRates.commission_match_board?.none ?? 24
  );
  const sr = sourcingPct / 100;
  const cr = commissionPct / 100;
  const sourcingFee = Math.round(jobFee * sr * 100) / 100;
  const commission = Math.round(jobFee * cr * 100) / 100;
  const taxService = Math.round((sourcingFee + commission) * TAX_ON_SOURCING_COMMISSION * 100) / 100;
  const talentNet = Math.round((jobFee - sourcingFee - commission - taxService) * 100) / 100;
  return { sourcingFee, commission, taxService, talentNet, sourcingPct, commissionPct };
}
