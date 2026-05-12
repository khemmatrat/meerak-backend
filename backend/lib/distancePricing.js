/**
 * Dynamic distance pricing for Transport Hub — local on-demand trips.
 * Persisted in system_settings (key transport_distance_pricing); no Node restart.
 */

const round2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

/** @type {const} */
export const DISTANCE_PRICING_SETTINGS_KEY = 'transport_distance_pricing';

/** Legacy mobile default: max(100, km*25) ≈ base 0 + 25/km, min 100 */
export const DISTANCE_PRICING_DEFAULTS = {
  base_fare_thb: 0,
  price_per_km_thb: 25,
  minimum_fare_thb: 100,
};

/** Same semantic as mobile/utils/transportRegions CROSS_REGION_MIN_BASE_THB */
export const CROSS_REGION_MIN_BASE_THB = 320;

/**
 * @param {unknown} raw
 * @returns {{ base_fare_thb: number, price_per_km_thb: number, minimum_fare_thb: number }}
 */
export function clampDistancePricingConfig(raw) {
  const nb = Number(raw?.base_fare_thb);
  const nk = Number(raw?.price_per_km_thb);
  const nm = Number(raw?.minimum_fare_thb);
  const base = Number.isFinite(nb)
    ? Math.max(0, Math.min(50000, nb))
    : DISTANCE_PRICING_DEFAULTS.base_fare_thb;
  const perKm = Number.isFinite(nk)
    ? Math.max(0, Math.min(500, nk))
    : DISTANCE_PRICING_DEFAULTS.price_per_km_thb;
  const minFare = Number.isFinite(nm)
    ? Math.max(0, Math.min(500000, nm))
    : DISTANCE_PRICING_DEFAULTS.minimum_fare_thb;
  return {
    base_fare_thb: round2(base),
    price_per_km_thb: round2(perKm),
    minimum_fare_thb: round2(minFare),
  };
}

/**
 * Linear job-fee base before vehicle multiplier: max(minimum, base + km * per_km).
 * @param {number} distanceKm
 * @param {ReturnType<typeof clampDistancePricingConfig>} config
 */
export function computeLocalOnDemandLinearBaseThb(distanceKm, config) {
  const c = clampDistancePricingConfig(config);
  const d = Math.max(0, Number(distanceKm) || 0);
  const linear = round2(c.base_fare_thb + d * c.price_per_km_thb);
  return Math.max(c.minimum_fare_thb, linear);
}

/**
 * @param {import('pg').Pool} pool
 * @returns {Promise<{ base_fare_thb: number, price_per_km_thb: number, minimum_fare_thb: number, updated_at: string | null }>}
 */
export async function getDistancePricingFromPool(pool) {
  try {
    const r = await pool.query(
      `SELECT value, updated_at FROM system_settings WHERE key = $1 LIMIT 1`,
      [DISTANCE_PRICING_SETTINGS_KEY]
    );
    const row = r.rows?.[0];
    if (row?.value) {
      const j = JSON.parse(String(row.value));
      return { ...clampDistancePricingConfig(j), updated_at: row.updated_at ? String(row.updated_at) : null };
    }
  } catch (e) {
    console.warn('[distancePricing] load:', e?.message || e);
  }
  return { ...clampDistancePricingConfig({}), updated_at: null };
}

/**
 * @param {import('pg').Pool} pool
 * @param {Partial<{ base_fare_thb: unknown, price_per_km_thb: unknown, minimum_fare_thb: unknown }>} patch
 */
export async function mergeDistancePricingPatch(pool, patch) {
  const cur = await getDistancePricingFromPool(pool);
  const pick = (v, fallback) => {
    const n = Number(v);
    return v != null && v !== '' && Number.isFinite(n) ? n : fallback;
  };
  const next = clampDistancePricingConfig({
    base_fare_thb: pick(patch.base_fare_thb, cur.base_fare_thb),
    price_per_km_thb: pick(patch.price_per_km_thb, cur.price_per_km_thb),
    minimum_fare_thb: pick(patch.minimum_fare_thb, cur.minimum_fare_thb),
  });
  const payload = JSON.stringify(next);
  await pool.query(
    `INSERT INTO system_settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [DISTANCE_PRICING_SETTINGS_KEY, payload]
  );
  const r2 = await pool.query(
    `SELECT updated_at FROM system_settings WHERE key = $1 LIMIT 1`,
    [DISTANCE_PRICING_SETTINGS_KEY]
  );
  return { ...next, updated_at: r2.rows?.[0]?.updated_at ? String(r2.rows[0].updated_at) : new Date().toISOString() };
}
