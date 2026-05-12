/**
 * Transport Hub — transport_contract JSON validation / sanitization.
 * Does not affect pricing; financialEngine.js unchanged.
 */

const JOB_KINDS = new Set(['local_on_demand', 'intercity_charter', 'relay_leg']);

function round4(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 10000) / 10000;
}

function sanitizeLatLng(o) {
  if (!o || typeof o !== 'object') return null;
  const lat = Number(o.lat);
  const lng = Number(o.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const out = { lat: round4(lat), lng: round4(lng) };
  if (o.label != null && String(o.label).length > 0) {
    out.label = String(o.label).slice(0, 500);
  }
  return out;
}

function sanitizeQuoteBreakdown(qb) {
  if (qb == null || typeof qb !== 'object') return undefined;
  const out = {};
  const numKeys = [
    'labor_thb',
    'vehicle_hire_thb',
    'tolls_estimate_thb',
    'distance_km',
    'distance_charge_thb',
    'surcharge_thb',
    'floor_job_fee_thb',
    'job_fee_after_floor_thb',
    'vehicle_multiplier',
    'insurance_estimate_thb',
    'payment_markup_thb',
    'final_price_thb',
  ];
  for (const k of numKeys) {
    if (qb[k] == null) continue;
    const v = Number(qb[k]);
    if (Number.isFinite(v) && v >= 0 && v <= 1e9) out[k] = round4(v);
  }
  return Object.keys(out).length ? out : undefined;
}

function sanitizeIntercityCharter(ic) {
  if (ic == null) return null;
  if (typeof ic !== 'object') return null;
  const out = {};
  const qb = sanitizeQuoteBreakdown(ic.quote_breakdown);
  if (qb) out.quote_breakdown = qb;
  if (ic.route_note != null) {
    out.route_note = String(ic.route_note).slice(0, 2000);
  }
  if (ic.pricing_engine != null) {
    out.pricing_engine = String(ic.pricing_engine).slice(0, 48);
  }
  return Object.keys(out).length ? out : null;
}

function sanitizeRelayDetails(rd) {
  if (rd == null) return null;
  if (typeof rd !== 'object') return null;
  const id = rd.next_relay_point_id;
  if (id == null || id === '') return null;
  return { next_relay_point_id: String(id).slice(0, 128) };
}

/** Snapshot from server distance_v1 pricing (optional; stripped if malformed). */
function sanitizeLocalOnDemandPricing(raw) {
  if (raw == null || typeof raw !== 'object') return undefined;
  const numKeys = [
    'base_fare_thb',
    'price_per_km_thb',
    'minimum_fare_thb',
    'distance_km',
    'linear_base_before_cross_thb',
    'base_after_cross_thb',
    'vehicle_multiplier',
    'job_fee_thb',
    'insurance_thb',
    'markup_rate',
    'final_price_thb',
  ];
  const out = {};
  for (const k of numKeys) {
    if (raw[k] == null) continue;
    const v = Number(raw[k]);
    if (Number.isFinite(v) && v >= 0 && v <= 1e9) out[k] = round4(v);
  }
  if (raw.pricing_engine != null) {
    out.pricing_engine = String(raw.pricing_engine).slice(0, 48);
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * @returns {{ ok: true, value: object } | { ok: false, error: string }}
 */
export function sanitizeTransportContract(raw) {
  if (raw == null || typeof raw !== 'object') {
    return { ok: false, error: 'transport_contract must be an object' };
  }

  const job_kind = JOB_KINDS.has(String(raw.job_kind)) ? String(raw.job_kind) : 'local_on_demand';

  const pickup = sanitizeLatLng(raw.pickup);
  const dropoff = sanitizeLatLng(raw.dropoff);
  if (!pickup || !dropoff) {
    return { ok: false, error: 'transport_contract.pickup and dropoff must be valid { lat, lng }' };
  }

  const service_region_id =
    raw.service_region_id != null ? String(raw.service_region_id).slice(0, 64) : 'bangkok';

  const cross_region = Boolean(raw.cross_region);
  const distance_km = (() => {
    const d = Number(raw.distance_km);
    if (!Number.isFinite(d) || d < 0 || d > 20000) return 0;
    return round4(d);
  })();

  const pricing_version =
    raw.pricing_version != null ? String(raw.pricing_version).slice(0, 32) : 'client_v1';

  const value = {
    job_kind,
    service_region_id,
    pickup,
    dropoff,
    cross_region,
    distance_km,
    pricing_version,
  };

  const ic = sanitizeIntercityCharter(raw.intercity_charter);
  if (ic) value.intercity_charter = ic;

  const relayDetails = sanitizeRelayDetails(raw.relay_details);
  if (relayDetails) value.relay_details = relayDetails;

  const ldp = sanitizeLocalOnDemandPricing(raw.local_on_demand_pricing);
  if (ldp) value.local_on_demand_pricing = ldp;

  if (raw.relay != null && typeof raw.relay === 'object') {
    value.relay = raw.relay;
  }

  return { ok: true, value };
}
