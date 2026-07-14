/**
 * Slot-based Talent Booking — fee_rates from payout_config (Profile A).
 */

const DEFAULT_SLOT_FEE_RATES = {
  platform_fee: { none: 8, silver: 6, gold: 5, platinum: 4 },
  commission_match_board: { none: 24, silver: 18, gold: 15, platinum: 12 },
  commission_booking: { none: 32, silver: 18, gold: 15, platinum: 12 },
  booking_sourcing_percent: 8,
  bidding_fee_percent: 9.3,
};

export function normalizeTier(tier) {
  const t = (tier || 'none').toString().toLowerCase().trim();
  return ['silver', 'gold', 'platinum'].includes(t) ? t : 'none';
}

/** Normalize admin fee_rates JSON → slot booking config (percents 0–100). */
export function normalizeSlotFeeRates(raw) {
  let fr = raw;
  if (typeof fr === 'string') {
    try {
      fr = JSON.parse(fr);
    } catch {
      fr = {};
    }
  }
  if (!fr || typeof fr !== 'object') fr = {};
  return {
    platform_fee: {
      ...DEFAULT_SLOT_FEE_RATES.platform_fee,
      ...(fr.platform_fee && typeof fr.platform_fee === 'object' ? fr.platform_fee : {}),
    },
    commission_booking: {
      ...DEFAULT_SLOT_FEE_RATES.commission_booking,
      ...(fr.commission_booking && typeof fr.commission_booking === 'object' ? fr.commission_booking : {}),
    },
    booking_sourcing_percent: Number(fr.booking_sourcing_percent ?? DEFAULT_SLOT_FEE_RATES.booking_sourcing_percent),
    bidding_fee_percent: Number(fr.bidding_fee_percent ?? DEFAULT_SLOT_FEE_RATES.bidding_fee_percent),
  };
}

export async function loadSlotFeeConfig(pool) {
  try {
    const r = await pool.query(`SELECT value_json FROM payout_config WHERE key = 'fee_rates' LIMIT 1`);
    return normalizeSlotFeeRates(r.rows?.[0]?.value_json);
  } catch {
    return normalizeSlotFeeRates(null);
  }
}

/** Tier map value as decimal rate (e.g. 8 → 0.08). */
export function slotTierRate(config, mapKey, tier) {
  const map = config?.[mapKey];
  if (!map || typeof map !== 'object') return 0;
  const t = normalizeTier(tier);
  const pct = Number(map[t] ?? map.none);
  return Number.isFinite(pct) ? pct / 100 : 0;
}
