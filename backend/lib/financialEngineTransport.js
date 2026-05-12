/**
 * Transport Hub — intercity / relay pricing (extends Match Job flow).
 * Does not modify formulas inside financialEngine.js; imports employer outflow only.
 */

import { PAYMENT_MARKUP_RATE } from './financialEngine.js';
import {
  calcEmployerOutflowWithMarkupRate,
  getTransportMatchMarkupRate,
  getInboundMdrDecimalForGatewayAndChannel,
  getLocalGatewayFromEnv,
  normalizePaymentChannel,
  LOCAL_GATEWAY_KSHER,
  LOCAL_GATEWAY_PAYSO,
} from './paymentProviderGate.js';

const round2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

/** Env key — default false */
export const ENV_TRANSPORT_INTERCITY_PRICING = 'TRANSPORT_INTERCITY_PRICING_ENABLED';

/** Comma-separated user UUIDs — when non-empty, ONLY these users get intercity engine (beta / staged rollout) */
export const ENV_TRANSPORT_INTERCITY_BETA_USERS = 'TRANSPORT_INTERCITY_PRICING_BETA_USER_IDS';

/** Tunable formula (THB) — override via env without code change */
export const ENV_INTERCITY_THB_PER_KM = 'TRANSPORT_INTERCITY_THB_PER_KM';
export const ENV_INTERCITY_BASE_SURCHARGE_THB = 'TRANSPORT_INTERCITY_BASE_SURCHARGE_THB';
export const ENV_INTERCITY_FLOOR_JOB_FEE_THB = 'TRANSPORT_INTERCITY_FLOOR_JOB_FEE_THB';

export const INTERCITY_DEFAULTS = {
  THB_PER_KM: 15,
  BASE_SURCHARGE_THB: 500,
  FLOOR_JOB_FEE_THB: 800,
};

const VEHICLE_MULTIPLIER = {
  standard: 1,
  saver: 0.7,
  premium: 1.4,
  luxury: 1.85,
  motorcycle_standard: 0.55,
  motorcycle_saver: 0.4,
  motorcycle_premium: 0.75,
  tricycle_standard: 0.5,
  tricycle_premium: 0.85,
};

export function getVehicleMultiplierForTransport(vehicleId) {
  const k = String(vehicleId || 'standard').toLowerCase().trim();
  const m = VEHICLE_MULTIPLIER[k];
  return Number.isFinite(m) ? m : 1;
}

function readEnvNumber(key, fallback) {
  const v = process.env[key];
  if (v == null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * @returns {{ thbPerKm: number, baseSurchargeThb: number, floorJobFeeThb: number }}
 */
export function getIntercityFormulaFromEnv() {
  return {
    thbPerKm: readEnvNumber(ENV_INTERCITY_THB_PER_KM, INTERCITY_DEFAULTS.THB_PER_KM),
    baseSurchargeThb: readEnvNumber(ENV_INTERCITY_BASE_SURCHARGE_THB, INTERCITY_DEFAULTS.BASE_SURCHARGE_THB),
    floorJobFeeThb: readEnvNumber(ENV_INTERCITY_FLOOR_JOB_FEE_THB, INTERCITY_DEFAULTS.FLOOR_JOB_FEE_THB),
  };
}

/**
 * Intercity charter — job fee = max(floor, distance×rate + surcharge) × vehicle multiplier;
 * customer total = employer outflow with dynamic markup rate (paymentProviderGate).
 *
 * @param {{
 *   distanceKm: number,
 *   vehicleId?: string,
 *   insuranceAmount?: number,
 *   paymentChannel?: string,
 *   paymentGateway?: 'payso'|'ksher',
 * }} args
 * @returns {object}
 */
export function calculateIntercityFee(args) {
  const {
    distanceKm,
    vehicleId,
    insuranceAmount = 0,
    paymentChannel: paymentChannelRaw,
    paymentGateway: paymentGatewayOverride,
  } = args || {};
  const paymentChannel = normalizePaymentChannel(paymentChannelRaw);
  const gwRaw = String(paymentGatewayOverride || '').toLowerCase().trim();
  const gateway =
    gwRaw === 'ksher'
      ? LOCAL_GATEWAY_KSHER
      : gwRaw === 'payso'
        ? LOCAL_GATEWAY_PAYSO
        : getLocalGatewayFromEnv();
  const { thbPerKm, baseSurchargeThb, floorJobFeeThb } = getIntercityFormulaFromEnv();
  const dist = Math.max(0, Number(distanceKm) || 0);
  const distanceChargeThb = round2(dist * thbPerKm);
  const rawBeforeFloorThb = round2(distanceChargeThb + baseSurchargeThb);
  const jobFeeAfterFloorThb = Math.max(floorJobFeeThb, rawBeforeFloorThb);
  const vehicleMultiplier = getVehicleMultiplierForTransport(vehicleId);
  const jobFeeThb = round2(jobFeeAfterFloorThb * vehicleMultiplier);
  const ins = round2(Number(insuranceAmount) || 0);
  const markupRate = getTransportMatchMarkupRate();
  const employer = calcEmployerOutflowWithMarkupRate(jobFeeThb, ins, markupRate);
  const processorMdrRate = getInboundMdrDecimalForGatewayAndChannel(gateway, paymentChannel);

  return {
    distanceKm: dist,
    thbPerKm,
    distanceChargeThb,
    baseSurchargeThb,
    rawBeforeFloorThb,
    floorJobFeeThb,
    jobFeeAfterFloorThb,
    vehicleId: String(vehicleId || 'standard'),
    vehicleMultiplier,
    jobFeeThb,
    insuranceAmount: ins,
    paymentChannel,
    paymentGateway: gateway,
    paymentMarkupThb: employer.paymentMarkup,
    paymentMarkupRate: markupRate,
    paymentMarkupRateLegacyDefault: PAYMENT_MARKUP_RATE,
    /** @deprecated ใช้ processorMdrRate — คงชื่อเดิมเพื่อ backward compat */
    promptPayProcessorMdrRate: processorMdrRate,
    promptPayProcessorMdrPercent: Math.round(processorMdrRate * 10000) / 100,
    processorMdrRate,
    processorMdrPercent: Math.round(processorMdrRate * 10000) / 100,
    finalPrice: employer.finalPrice,
    finalPriceThb: employer.finalPrice,
  };
}

/**
 * Floor job fee (THB) for intercity bids — same formula as listed trip for stored vehicle + distance.
 * @param {object} job — jobs row with payment_details
 * @returns {ReturnType<typeof calculateIntercityFee>|null}
 */
export function getIntercityBidFloorFromJob(job) {
  if (!job || typeof job !== 'object') return null;
  let pd = job.payment_details || {};
  if (typeof pd === 'string') {
    try {
      pd = JSON.parse(pd || '{}');
    } catch {
      pd = {};
    }
  }
  const tc = pd.transport_contract;
  if (!tc || String(tc.job_kind) !== 'intercity_charter') return null;
  const vehicleId = pd.transport_vehicle || 'standard';
  const dist = Number(tc.distance_km) || 0;
  const insuranceAmount = parseFloat(pd.transport_insurance_amount) || 0;
  const paymentChannel = pd.payment_channel || pd.paymentChannel;
  const paymentGateway = pd.payment_gateway || pd.paymentGateway;
  return calculateIntercityFee({
    distanceKm: dist,
    vehicleId,
    insuranceAmount,
    paymentChannel,
    paymentGateway,
  });
}

/**
 * Relay leg — split total job fee between two drivers (placeholder for future booking flow).
 * @param {number} jobFeeThb — pre-markup job fee (provider pool)
 * @param {{ leg1Share?: number }} [opts] — default 0.5
 */
export function calculateRelayRevenueSplit(jobFeeThb, opts = {}) {
  const fee = round2(Number(jobFeeThb) || 0);
  const s = Number(opts.leg1Share);
  const leg1Share = Number.isFinite(s) && s >= 0 && s <= 1 ? s : 0.5;
  return {
    job_fee_thb: fee,
    leg1_thb: round2(fee * leg1Share),
    leg2_thb: round2(fee * (1 - leg1Share)),
  };
}

/**
 * Sync read from process.env only.
 * @returns {boolean}
 */
export function getTransportIntercityPricingEnabledFromEnv() {
  const v = process.env[ENV_TRANSPORT_INTERCITY_PRICING];
  return v === '1' || v === 'true' || v === 'TRUE';
}

/**
 * @returns {Set<string>}
 */
export function parseBetaUserIdsFromEnv() {
  const raw = process.env[ENV_TRANSPORT_INTERCITY_BETA_USERS] || '';
  return new Set(
    raw
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => String(s))
  );
}

/**
 * Global flag: env OR system_settings (async).
 * @param {import('pg').Pool} pool
 * @returns {Promise<boolean>}
 */
export async function getTransportIntercityPricingEnabled(pool) {
  if (getTransportIntercityPricingEnabledFromEnv()) return true;
  if (!pool) return false;
  try {
    const r = await pool.query(
      `SELECT value FROM system_settings WHERE key = 'TRANSPORT_INTERCITY_PRICING_ENABLED' LIMIT 1`
    );
    const row = r.rows?.[0];
    if (!row?.value) return false;
    const s = String(row.value).trim().toLowerCase();
    return s === '1' || s === 'true' || s === '"true"';
  } catch {
    return false;
  }
}

/**
 * Beta rollout: if TRANSPORT_INTERCITY_PRICING_BETA_USER_IDS is non-empty, ONLY those user IDs
 * get intercity pricing. If empty, fall back to global flag (env + system_settings).
 * @param {import('pg').Pool} pool
 * @param {string|null|undefined} userId — jobs.created_by UUID string
 * @returns {Promise<boolean>}
 */
export async function getTransportIntercityPricingEnabledForUser(pool, userId) {
  const beta = parseBetaUserIdsFromEnv();
  const uid = userId != null ? String(userId).trim() : '';
  if (beta.size > 0) {
    return uid !== '' && beta.has(uid);
  }
  return getTransportIntercityPricingEnabled(pool);
}

/**
 * @param {object|null} transportContract
 * @param {{ intercityPricingEnabled?: boolean }} [options]
 */
export function resolveTransportPricingContext(transportContract, options = {}) {
  const enabled = options.intercityPricingEnabled === true;
  const jobKind =
    transportContract && typeof transportContract === 'object' && transportContract.job_kind
      ? String(transportContract.job_kind)
      : 'local_on_demand';

  const useIntercityEngine = enabled && jobKind === 'intercity_charter';

  return {
    useLegacyMatchJobPricing: !useIntercityEngine,
    intercityPricingEnabled: enabled,
    useIntercityEngine,
    jobKind,
  };
}

/** นาทีหลังรับงานที่ยกเลิกได้ฟรี (ดีฟอลต์ 15) */
export function getIntercityCancelGraceMinutes() {
  const n = parseInt(process.env.INTERCITY_CANCEL_GRACE_MINUTES || '15', 10);
  return Math.min(Math.max(Number.isFinite(n) ? n : 15, 1), 120);
}

/**
 * @param {object|null|undefined} job — row จาก jobs (มี payment_details)
 * @returns {boolean}
 */
export function isIntercityCharterJob(job) {
  if (!job || typeof job !== 'object') return false;
  if (String(job.category || '').toLowerCase() !== 'driver') return false;
  let pd = job.payment_details || {};
  if (typeof pd === 'string') {
    try {
      pd = JSON.parse(pd || '{}');
    } catch {
      pd = {};
    }
  }
  const tc = pd.transport_contract;
  return !!(tc && String(tc.job_kind) === 'intercity_charter');
}

/**
 * ค่าจ้างที่ตกลง (ก่อนค่าบริการ 5%) — ใช้คำนวณค่ายกเลิกตาม %
 * @param {object} job
 * @returns {number}
 */
export function getAgreedJobFeeThbFromJob(job) {
  if (!job || typeof job !== 'object') return 0;
  let pd = job.payment_details || {};
  if (typeof pd === 'string') {
    try {
      pd = JSON.parse(pd || '{}');
    } catch {
      pd = {};
    }
  }
  if (pd.agreed_job_fee_thb != null && Number.isFinite(Number(pd.agreed_job_fee_thb))) {
    return round2(Number(pd.agreed_job_fee_thb));
  }
  const floor = getIntercityBidFloorFromJob(job);
  if (floor && floor.jobFeeThb != null) return round2(Number(floor.jobFeeThb));
  const ins = round2(Number(pd.transport_insurance_amount) || 0);
  const fp = round2(Number(job.price) || 0);
  if (fp <= 0) return 0;
  const base = round2(fp / (1 + PAYMENT_MARKUP_RATE));
  return round2(Math.max(0, base - ins));
}

/**
 * นโยบายยกเลิกงานเหมาข้ามจังหวัด (ฝั่งผู้จ้าง)
 * - ภายใน grace นาทีแรกหลังรับงาน: ฟรี
 * - หลัง grace แต่ยังไม่เริ่มเดินทาง/ถึงจุดรับ: 10% (คนขับ 7%, แพลตฟอร์ม 3%)
 * - คนขับเริ่มเดินทางแล้ว: 30% (25% + 5%)
 * - ถึงจุดรับของแล้ว: 50% (45% + 5%)
 *
 * @param {{ job: object, cancelTime?: Date|string, jobStatus?: string }} args
 */
export function calculateCancelFee(args) {
  const { job, cancelTime = new Date(), jobStatus } = args || {};
  const agreed = getAgreedJobFeeThbFromJob(job);
  const t = cancelTime instanceof Date ? cancelTime : new Date(cancelTime);
  const status = String(jobStatus || job?.status || '').toLowerCase().replace(/\s+/g, '_');

  const acceptedAt = job?.accepted_at ? new Date(job.accepted_at) : null;
  if (!acceptedAt || !Number.isFinite(acceptedAt.getTime())) {
    return {
      tier: 'no_accept',
      label: 'no_accept',
      agreedJobFeeThb: agreed,
      totalFeeThb: 0,
      driverAmountThb: 0,
      platformAmountThb: 0,
      free: true,
      reason: 'ยังไม่มีเวลารับงาน',
    };
  }

  const graceMs = getIntercityCancelGraceMinutes() * 60 * 1000;
  if (t.getTime() - acceptedAt.getTime() <= graceMs) {
    return {
      tier: 'grace',
      label: 'grace',
      agreedJobFeeThb: agreed,
      totalFeeThb: 0,
      driverAmountThb: 0,
      platformAmountThb: 0,
      free: true,
      graceMinutes: getIntercityCancelGraceMinutes(),
      reason: `ยกเลิกฟรีภายใน ${getIntercityCancelGraceMinutes()} นาทีหลังรับงาน`,
    };
  }

  let pd = job.payment_details || {};
  if (typeof pd === 'string') {
    try {
      pd = JSON.parse(pd || '{}');
    } catch {
      pd = {};
    }
  }
  const arrivedRaw = job.arrived_at ?? pd.transport_arrived_at;
  const startedRaw = job.started_at ?? pd.transport_started_at;
  const arrivedAt = arrivedRaw ? new Date(arrivedRaw) : null;
  const startedAt = startedRaw ? new Date(startedRaw) : null;
  const tMs = t.getTime();

  const split = (tier, label, totalRate, dShare, pShare) => {
    const totalFeeThb = round2(agreed * totalRate);
    const driverAmountThb = round2(agreed * dShare);
    const platformAmountThb = round2(agreed * pShare);
    return {
      tier,
      label,
      agreedJobFeeThb: agreed,
      totalFeeThb,
      driverAmountThb,
      platformAmountThb,
      free: totalFeeThb <= 0,
      totalRate,
      driverRate: dShare,
      platformRate: pShare,
    };
  };

  if (arrivedAt && Number.isFinite(arrivedAt.getTime()) && arrivedAt.getTime() <= tMs) {
    return { ...split('arrived', 'ถึงจุดรับของ', 0.5, 0.45, 0.05), reason: 'คนขับถึงจุดรับของแล้ว' };
  }
  if (startedAt && Number.isFinite(startedAt.getTime()) && startedAt.getTime() <= tMs) {
    return { ...split('started', 'ออกเดินทางแล้ว', 0.3, 0.25, 0.05), reason: 'คนขับออกเดินทางแล้ว' };
  }
  if (status === 'in_progress') {
    return { ...split('started_status', 'กำลังดำเนินการ', 0.3, 0.25, 0.05), reason: 'สถานะกำลังดำเนินการ' };
  }

  return {
    ...split('pre_start', 'ก่อนเริ่มเดินทาง', 0.1, 0.07, 0.03),
    reason: 'หลังช่วงฟรี แต่ยังไม่เริ่มเดินทางตามระบบ',
  };
}
