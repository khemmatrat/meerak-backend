/** Aligned with backend merchant hub fee policy */

export function resolveMerchantHubPercent(
  policy: Record<string, unknown> | undefined,
  flatKey: string,
  tierKey: string,
  vipTier?: string | null,
): number {
  const useVip = policy?.use_vip_tier_overrides === true;
  const tier = (vipTier || "none").toString().toLowerCase().trim();
  if (useVip) {
    const byTier = policy?.[tierKey] as
      | Record<string, number>
      | null
      | undefined;
    if (
      byTier &&
      byTier[tier] != null &&
      byTier[tier] !== ("" as unknown as number)
    ) {
      const n = Number(byTier[tier]);
      if (Number.isFinite(n)) return Math.max(0, Math.min(100, n));
    }
  }
  const flat = Number(policy?.[flatKey]);
  if (Number.isFinite(flat)) return Math.max(0, Math.min(100, flat));
  return 5;
}

export function calcBeautyEmployerTotal(quotedPrice: number, feePercent = 5) {
  const fee = Math.round(quotedPrice * (feePercent / 100) * 100) / 100;
  const total = Math.round((quotedPrice + fee) * 100) / 100;
  return { quotedPrice, employerServiceFee: fee, employerTotal: total };
}
export function calcBeautyTransportTotal(
  distanceKm: number,
  ratePerKm: number,
  baseFare = 45,
) {
  const km = Math.max(0, distanceKm);
  const rate = Math.max(0, ratePerKm);
  return Math.round((baseFare + km * rate) * 100) / 100;
}

export function calcBeautyProviderPreview(
  serviceSubtotal: number,
  transportTotal: number,
  policy?: {
    service_sourcing_percent?: number;
    service_commission_percent?: number;
    transport_platform_fee_percent?: number;
  },
) {
  const svc = Math.max(0, serviceSubtotal);
  const tr = Math.max(0, transportTotal);
  const sourcingRate = (policy?.service_sourcing_percent ?? 8) / 100;
  const commissionRate = (policy?.service_commission_percent ?? 28) / 100;
  const transportRate = (policy?.transport_platform_fee_percent ?? 3) / 100;
  const sourcingFee = Math.round(svc * sourcingRate * 100) / 100;
  const serviceCommission = Math.round(svc * commissionRate * 100) / 100;
  const transportPlatformFee = Math.round(tr * transportRate * 100) / 100;
  const talentPayout =
    Math.round(
      (svc - sourcingFee - serviceCommission + (tr - transportPlatformFee)) *
        100,
    ) / 100;
  return {
    sourcingFee,
    serviceCommission,
    transportPlatformFee,
    talentPayout,
  };
}
