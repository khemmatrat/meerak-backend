/**
 * Progressive KYC — same rules as mobile/utils/kycProgressiveGate.ts
 * Payout: full KYC required. High-value job (provider): fee ≥ threshold requires full KYC.
 */

export const HIGH_VALUE_JOB_THRESHOLD_THB = Number(
  process.env.KYC_HIGH_VALUE_JOB_THB ||
  process.env.VITE_KYC_HIGH_VALUE_JOB_THB ||
  5000,
);

/** @param {unknown} v */
function round2(v) {
  return Math.round((Number(v) + Number.EPSILON) * 100) / 100;
}

/** @param {unknown} kycStatus */
function isApprovedStatus(kycStatus) {
  const s = String(kycStatus || '').toLowerCase();
  return s === 'approved' || s === 'verified';
}

/** @param {unknown} kycLevel */
function isFullLevel(kycLevel) {
  const s = String(kycLevel || '').toLowerCase();
  return s === 'level_2' || s === 'full' || s === '2';
}

/**
 * @param {{ kyc_status?: string | null, kyc_next_reverify_at?: string | Date | null } | null | undefined} userRow
 */
export function needsReverifyFromUserRow(userRow) {
  if (!userRow) return false;
  const st = String(userRow.kyc_status || '').toLowerCase();
  if (!(st === 'verified' || st === 'approved')) return false;
  const next = userRow.kyc_next_reverify_at
    ? new Date(userRow.kyc_next_reverify_at)
    : null;
  if (!next || Number.isNaN(next.getTime())) return false;
  return next <= new Date();
}

/**
 * @param {{ kyc_status?: string | null, kyc_level?: string | null, kyc_next_reverify_at?: string | Date | null } | null | undefined} userRow
 */
export function isKycCompleteForSensitiveActions(userRow) {
  if (!userRow) return false;
  if (needsReverifyFromUserRow(userRow)) return false;
  if (!isApprovedStatus(userRow.kyc_status)) return false;
  return isFullLevel(userRow.kyc_level);
}

/**
 * @param {{ kyc_status?: string | null, kyc_level?: string | null, kyc_next_reverify_at?: string | Date | null } | null | undefined} userRow
 * @returns {{ status: number, body: Record<string, unknown> } | null}
 */
export function assertPayoutKyc(userRow) {
  if (isKycCompleteForSensitiveActions(userRow)) return null;
  return {
    status: 403,
    body: {
      error:
        'ต้องยืนยันตัวตน (KYC) ครบถึงจะถอนเงินได้ — กรุณาทำ KYC ให้ครบก่อน',
      code: 'KYC_REQUIRED_FOR_PAYOUT',
    },
  };
}

/**
 * @param {{ kyc_status?: string | null, kyc_level?: string | null, kyc_next_reverify_at?: string | Date | null } | null | undefined} userRow
 * @param {number} jobFeeThb — ค่าจ้างฐาน (เช่น job.price หรือ proposed_job_fee_thb)
 * @returns {{ status: number, body: Record<string, unknown> } | null}
 */
export function assertHighValueJobKyc(userRow, jobFeeThb) {
  const p = round2(jobFeeThb);
  if (!Number.isFinite(p) || p < HIGH_VALUE_JOB_THRESHOLD_THB) return null;
  if (isKycCompleteForSensitiveActions(userRow)) return null;
  return {
    status: 403,
    body: {
      error: `งานมูลค่า ${p} บาทขึ้นไปต้องยืนยันตัวตน (KYC) ก่อนรับงาน`,
      code: 'KYC_REQUIRED_FOR_HIGH_VALUE_JOB',
      threshold_thb: HIGH_VALUE_JOB_THRESHOLD_THB,
    },
  };
}
