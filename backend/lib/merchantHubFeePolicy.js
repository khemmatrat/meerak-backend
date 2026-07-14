/**
 * Merchant Hub Booking — fee policy resolution (DB-driven, optional VIP tier overrides).
 */

export const MERCHANT_HUB_VIP_TIERS = ['none', 'silver', 'gold', 'platinum'];

export function normalizeVipTier(tier) {
  const t = (tier || 'none').toString().toLowerCase().trim();
  return MERCHANT_HUB_VIP_TIERS.includes(t) ? t : 'none';
}

/** Resolve percent from flat field or tier override map (values 0–100). */
export function resolvePolicyPercent(policy, flatKey, tierKey, vipTier, options = {}) {
  const useVip = policy?.use_vip_tier_overrides === true && options.ignoreTier !== true;
  const tier = normalizeVipTier(vipTier);
  if (useVip && tierKey) {
    const byTier = policy?.[tierKey];
    if (byTier && typeof byTier === 'object' && byTier[tier] != null && byTier[tier] !== '') {
      const n = Number(byTier[tier]);
      if (Number.isFinite(n)) return Math.max(0, Math.min(100, n)) / 100;
    }
  }
  const flat = Number(policy?.[flatKey]);
  if (Number.isFinite(flat)) return Math.max(0, Math.min(100, flat)) / 100;
  return 0;
}

export function clampPercent(n) {
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n));
}

export function validateMerchantHubPolicyPatch(_cur, next) {
  const pctKeys = [
    'employer_service_fee_percent',
    'service_sourcing_percent',
    'service_commission_percent',
    'transport_platform_fee_percent',
    'no_show_fee_percent',
    'no_show_fee_platform_share',
    'no_show_fee_provider_share',
  ];
  for (const k of pctKeys) {
    if (next[k] != null && (next[k] < 0 || next[k] > 100)) {
      throw Object.assign(new Error(`${k} ต้องอยู่ระหว่าง 0–100`), { code: 'VALIDATION' });
    }
  }
  const minR = Number(next.transport_rate_min_km);
  const maxR = Number(next.transport_rate_max_km);
  if (Number.isFinite(minR) && Number.isFinite(maxR) && minR > maxR) {
    throw Object.assign(new Error('อัตราต่ำสุด/กม. ต้องไม่เกินอัตราสูงสุด'), { code: 'VALIDATION' });
  }
  const tierKeys = [
    'employer_service_fee_by_tier',
    'service_sourcing_by_tier',
    'service_commission_by_tier',
    'transport_platform_fee_by_tier',
  ];
  for (const tk of tierKeys) {
    const m = next[tk];
    if (!m || typeof m !== 'object') continue;
    for (const tier of MERCHANT_HUB_VIP_TIERS) {
      if (m[tier] == null || m[tier] === '') continue;
      const v = Number(m[tier]);
      if (!Number.isFinite(v) || v < 0 || v > 100) {
        throw Object.assign(new Error(`${tk}.${tier} ต้องอยู่ระหว่าง 0–100`), { code: 'VALIDATION' });
      }
    }
  }
}
