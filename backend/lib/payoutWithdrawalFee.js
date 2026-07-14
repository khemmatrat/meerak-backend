/**
 * Outbound wallet withdrawal fee for payout_requests only.
 * Not used for deposits, job fees, commissions, or other ledger legs.
 *
 * Source of truth: normalized `withdrawal_fee_policy` (payout_config) merged with
 * legacy withdrawal_fee_standard_thb / withdrawal_fee_instant_thb when lanes are absent.
 */

const DEFAULT_PROCESSOR_COST_ESTIMATE_THB = 30;
const DEFAULT_TRUEMONEY_PERCENT = 3.6;

const DEFAULT_ETA_TH = {
  bank_transfer: 'รอบโอนถัดไป',
  promptpay: 'รอบโอนถัดไป',
  truemoney: 'ตามรอบ TrueMoney',
  provider_batch: 'รอบโอนมาตรฐาน',
  provider_instant: 'ถอนด่วน',
};

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function num(x, fallback) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function legacyFee(primary, secondary, defaultThb) {
  if (primary != null && Number.isFinite(Number(primary))) return Number(primary);
  if (secondary != null && Number.isFinite(Number(secondary))) return Number(secondary);
  return defaultThb;
}

/**
 * Merge one fee lane from raw policy over computed defaults (legacy-guided).
 */
function mergeFlatLane(raw, laneName, fallbackFeeThb, defaultEta) {
  const src = raw && typeof raw[laneName] === 'object' && raw[laneName] !== null ? raw[laneName] : {};
  const mode = String(src.mode || 'flat').toLowerCase() === 'percent' ? 'percent' : 'flat';
  if (mode === 'percent') {
    const percent = num(src.percent, DEFAULT_TRUEMONEY_PERCENT);
    const min_fee_thb = src.min_fee_thb != null && Number.isFinite(Number(src.min_fee_thb)) ? Number(src.min_fee_thb) : 0;
    const max_fee_thb =
      src.max_fee_thb === null || src.max_fee_thb === undefined ? null : num(src.max_fee_thb, null);
    return {
      mode: 'percent',
      percent,
      min_fee_thb,
      max_fee_thb,
      eta_label_th: typeof src.eta_label_th === 'string' ? src.eta_label_th : defaultEta,
    };
  }
  const fee_thb = num(src.fee_thb, fallbackFeeThb);
  return {
    mode: 'flat',
    fee_thb,
    eta_label_th: typeof src.eta_label_th === 'string' ? src.eta_label_th : defaultEta,
  };
}

function mergeTruemoneyLane(raw, fallbackStdFlatThb, defaultEta) {
  const src = raw && typeof raw.truemoney === 'object' && raw.truemoney !== null ? raw.truemoney : {};
  const mode = String(src.mode || 'percent').toLowerCase();
  if (mode === 'flat') {
    return {
      mode: 'flat',
      fee_thb: num(src.fee_thb, fallbackStdFlatThb),
      eta_label_th: typeof src.eta_label_th === 'string' ? src.eta_label_th : defaultEta,
    };
  }
  return {
    mode: 'percent',
    percent: num(src.percent, DEFAULT_TRUEMONEY_PERCENT),
    min_fee_thb: src.min_fee_thb != null && Number.isFinite(Number(src.min_fee_thb)) ? Number(src.min_fee_thb) : 0,
    max_fee_thb: src.max_fee_thb === null || src.max_fee_thb === undefined ? null : num(src.max_fee_thb, null),
    eta_label_th: typeof src.eta_label_th === 'string' ? src.eta_label_th : defaultEta,
  };
}

/**
 * @param {unknown} rawPolicy - JSON from payout_config.withdrawal_fee_policy
 * @param {object} [legacy]
 * @param {number} [legacy.feeStandardThb]
 * @param {number} [legacy.feeInstantThb]
 * @param {number} [legacy.withdrawal_fee_standard_thb]
 * @param {number} [legacy.withdrawal_fee_instant_thb]
 */
export function normalizeWithdrawalFeePolicy(rawPolicy, legacy = {}) {
  const std = legacyFee(legacy.feeStandardThb, legacy.withdrawal_fee_standard_thb, 35);
  const inst = legacyFee(legacy.feeInstantThb, legacy.withdrawal_fee_instant_thb, 50);

  let raw = rawPolicy;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = {};
    }
  }
  if (!raw || typeof raw !== 'object') raw = {};

  const processor_cost_estimate_thb = num(
    raw.processor_cost_estimate_thb,
    DEFAULT_PROCESSOR_COST_ESTIMATE_THB,
  );

  return {
    bank_transfer: mergeFlatLane(raw, 'bank_transfer', std, DEFAULT_ETA_TH.bank_transfer),
    promptpay: mergeFlatLane(raw, 'promptpay', std, DEFAULT_ETA_TH.promptpay),
    truemoney: mergeTruemoneyLane(raw, std, DEFAULT_ETA_TH.truemoney),
    provider_batch: mergeFlatLane(raw, 'provider_batch', std, DEFAULT_ETA_TH.provider_batch),
    provider_instant: mergeFlatLane(raw, 'provider_instant', inst, DEFAULT_ETA_TH.provider_instant),
    processor_cost_estimate_thb: round2(processor_cost_estimate_thb),
  };
}

/**
 * @param {object} p
 * @param {boolean} p.isProvider
 * @param {boolean} p.instantPayout
 * @param {string} [p.channelRaw] - bank_details.channel
 */
export function resolveWithdrawalFeeLaneKey({ isProvider, instantPayout, channelRaw }) {
  if (isProvider) return instantPayout ? 'provider_instant' : 'provider_batch';
  const ch = String(channelRaw || '')
    .toLowerCase()
    .trim();
  if (ch === 'truemoney') return 'truemoney';
  if (ch === 'bank_transfer') return 'bank_transfer';
  return 'promptpay';
}

function feeFromLane(laneCfg, payoutAmountThb, flatFallbackThb) {
  const amt = Math.max(0, round2(payoutAmountThb || 0));
  const mode = String(laneCfg?.mode || 'flat').toLowerCase();
  if (mode === 'percent') {
    const pct = num(laneCfg.percent, DEFAULT_TRUEMONEY_PERCENT);
    let fee = round2((amt * pct) / 100);
    const minF = laneCfg.min_fee_thb != null ? num(laneCfg.min_fee_thb, 0) : 0;
    if (fee < minF) fee = round2(minF);
    if (laneCfg.max_fee_thb != null && Number.isFinite(Number(laneCfg.max_fee_thb))) {
      fee = Math.min(fee, round2(Number(laneCfg.max_fee_thb)));
    }
    return round2(fee);
  }
  return round2(num(laneCfg?.fee_thb, flatFallbackThb));
}

/**
 * @param {object} p
 * @param {number} p.payoutAmountThb - ยอดโอนถึงผู้ถอน (ก่อนหัก fee จากกระเป๋าเป็น amount + fee)
 * @param {string} [p.channelRaw]
 * @param {boolean} p.isProvider
 * @param {boolean} p.instantPayout
 * @param {ReturnType<typeof normalizeWithdrawalFeePolicy>} [p.policy]
 * @param {number} [p.feeStandardThb] - legacy fallback when policy not supplied
 * @param {number} [p.feeInstantThb] - legacy fallback when policy not supplied
 */
export function computeWithdrawalFeeQuote(p) {
  const {
    payoutAmountThb,
    channelRaw,
    isProvider,
    instantPayout,
    policy: policyInput,
    feeStandardThb = 35,
    feeInstantThb = 50,
  } = p;

  const policy =
    policyInput ||
    normalizeWithdrawalFeePolicy(null, { feeStandardThb, feeInstantThb });

  const laneKey = resolveWithdrawalFeeLaneKey({ isProvider, instantPayout, channelRaw });
  const laneCfg = policy[laneKey];
  const flatFallback = isProvider
    ? instantPayout
      ? num(feeInstantThb, 50)
      : num(feeStandardThb, 35)
    : num(feeStandardThb, 35);

  const fee_thb = feeFromLane(laneCfg, payoutAmountThb, flatFallback);
  const processor_cost_estimate_thb = round2(
    num(policy.processor_cost_estimate_thb, DEFAULT_PROCESSOR_COST_ESTIMATE_THB),
  );
  const platform_margin_amount = round2(Math.max(0, round2(fee_thb - processor_cost_estimate_thb)));
  const net_receive = round2(Math.max(0, payoutAmountThb || 0));
  const total_deduct = round2(net_receive + fee_thb);
  const eta_label_th =
    typeof laneCfg?.eta_label_th === 'string' ? laneCfg.eta_label_th : DEFAULT_ETA_TH[laneKey] || '';

  return {
    fee_lane: laneKey,
    fee_thb,
    processor_cost_estimate_thb,
    platform_margin_amount,
    total_deduct,
    net_receive,
    eta_label_th,
  };
}

/**
 * @param {object} p
 * @param {number} p.amountGrossThb - จำนวนที่ขอถอน (ฐานสำหรับ TrueMoney %)
 * @param {string} [p.channelRaw] - bank_details.channel: promptpay | bank_transfer | truemoney
 * @param {boolean} p.isProvider - users.role === 'provider'
 * @param {boolean} p.instantPayout - เฉพาะ provider: ถอนทันที
 * @param {number} [p.feeStandardThb] - จาก payout_config (admin)
 * @param {number} [p.feeInstantThb] - จาก payout_config (admin)
 * @param {ReturnType<typeof normalizeWithdrawalFeePolicy>} [p.policy] - merged policy (optional)
 * @returns {number}
 */
export function computePayoutWithdrawalFeeThb({
  amountGrossThb,
  channelRaw,
  isProvider,
  instantPayout,
  feeStandardThb = 35,
  feeInstantThb = 50,
  policy: policyInput,
}) {
  const policy =
    policyInput ||
    normalizeWithdrawalFeePolicy(null, { feeStandardThb, feeInstantThb });
  return computeWithdrawalFeeQuote({
    payoutAmountThb: amountGrossThb,
    channelRaw,
    isProvider,
    instantPayout,
    policy,
    feeStandardThb,
    feeInstantThb,
  }).fee_thb;
}

/** @readonly */
export const WITHDRAWAL_FEE_POLICY_LANE_KEYS = Object.freeze([
  'bank_transfer',
  'promptpay',
  'truemoney',
  'provider_batch',
  'provider_instant',
]);

const ADMIN_MAX_PERCENT = 50;
const ETA_LABEL_MAX_LEN = 280;

export class WithdrawalFeePolicyValidationError extends Error {
  constructor(message, code = 'WITHDRAWAL_FEE_POLICY_INVALID') {
    super(message);
    this.name = 'WithdrawalFeePolicyValidationError';
    /** @type {string} */
    this.code = code;
  }
}

function mergeLanePatch(baseLane, patchLane) {
  if (!patchLane || typeof patchLane !== 'object') return baseLane;
  const merged = { ...baseLane };
  for (const pk of ['mode', 'fee_thb', 'percent', 'min_fee_thb', 'max_fee_thb', 'eta_label_th']) {
    if (Object.prototype.hasOwnProperty.call(patchLane, pk)) merged[pk] = patchLane[pk];
  }
  return merged;
}

/**
 * Merge admin PATCH over persisted raw policy + legacy keys, validate, return full policy for storage.
 *
 * @param {unknown} dbRaw - value_json from payout_config or null
 * @param {{ withdrawal_fee_standard_thb: number, withdrawal_fee_instant_thb: number }} legacyNums
 * @param {unknown} patch - partial lane updates + processor_cost_estimate_thb
 */
export function mergeAndValidateWithdrawalFeePolicyForPersistence(dbRaw, legacyNums, patch) {
  const base = normalizeWithdrawalFeePolicy(dbRaw, legacyNums);
  if (!patch || typeof patch !== 'object') {
    validateWithdrawalFeePolicyNormalized(base);
    return base;
  }
  const merged = { ...base };
  for (const k of WITHDRAWAL_FEE_POLICY_LANE_KEYS) {
    const laneKey = /** @type {(typeof WITHDRAWAL_FEE_POLICY_LANE_KEYS)[number]} */ (k);
    if (patch[laneKey] != null && typeof patch[laneKey] === 'object') {
      merged[laneKey] = mergeLanePatch(base[laneKey], patch[laneKey]);
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'processor_cost_estimate_thb')) {
    const pv = patch.processor_cost_estimate_thb;
    if (pv != null && Number.isFinite(Number(pv))) merged.processor_cost_estimate_thb = round2(Number(pv));
  }
  validateWithdrawalFeePolicyNormalized(merged);
  return merged;
}

/**
 * @param {object} merged - output-shaped policy (lanes + processor_cost_estimate_thb)
 */
export function validateWithdrawalFeePolicyNormalized(merged) {
  if (!merged || typeof merged !== 'object') {
    throw new WithdrawalFeePolicyValidationError('withdrawal_fee_policy must be an object');
  }
  const pc = merged.processor_cost_estimate_thb;
  if (!Number.isFinite(Number(pc)) || Number(pc) < 0) {
    throw new WithdrawalFeePolicyValidationError('processor_cost_estimate_thb must be a finite number ≥ 0');
  }
  for (const lane of WITHDRAWAL_FEE_POLICY_LANE_KEYS) {
    const cfg = merged[lane];
    if (!cfg || typeof cfg !== 'object') {
      throw new WithdrawalFeePolicyValidationError(`withdrawal_fee_policy.${lane} is required`);
    }
    const eta = cfg.eta_label_th;
    if (eta != null && typeof eta === 'string' && eta.length > ETA_LABEL_MAX_LEN) {
      throw new WithdrawalFeePolicyValidationError(`withdrawal_fee_policy.${lane}: eta_label_th too long (max ${ETA_LABEL_MAX_LEN})`);
    }
    const mode = String(cfg.mode || 'flat').toLowerCase();
    if (mode !== 'flat' && mode !== 'percent') {
      throw new WithdrawalFeePolicyValidationError(`withdrawal_fee_policy.${lane}: mode must be flat or percent`);
    }
    if (mode === 'flat') {
      const f = cfg.fee_thb;
      if (!Number.isFinite(Number(f)) || Number(f) < 0) {
        throw new WithdrawalFeePolicyValidationError(`withdrawal_fee_policy.${lane}: fee_thb must be a finite number ≥ 0`);
      }
    } else {
      const pct = Number(cfg.percent);
      if (!Number.isFinite(pct) || pct < 0 || pct > ADMIN_MAX_PERCENT) {
        throw new WithdrawalFeePolicyValidationError(
          `withdrawal_fee_policy.${lane}: percent must be between 0 and ${ADMIN_MAX_PERCENT}`,
        );
      }
      const minf = cfg.min_fee_thb != null ? Number(cfg.min_fee_thb) : 0;
      if (!Number.isFinite(minf) || minf < 0) {
        throw new WithdrawalFeePolicyValidationError(`withdrawal_fee_policy.${lane}: min_fee_thb must be ≥ 0`);
      }
      if (cfg.max_fee_thb != null) {
        const mf = Number(cfg.max_fee_thb);
        if (!Number.isFinite(mf)) {
          throw new WithdrawalFeePolicyValidationError(`withdrawal_fee_policy.${lane}: max_fee_thb must be null or a finite number`);
        }
        if (mf < minf) {
          throw new WithdrawalFeePolicyValidationError(`withdrawal_fee_policy.${lane}: max_fee_thb must be null or ≥ min_fee_thb`);
        }
      }
    }
  }
}
