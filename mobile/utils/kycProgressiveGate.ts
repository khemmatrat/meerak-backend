import { KYCLevel } from "../types";

/** งานมูลค่าสูง (บาท) — ต้อง KYC ครบก่อนรับงาน (provider) */
export const HIGH_VALUE_JOB_THRESHOLD_THB = Number(
  import.meta.env.VITE_KYC_HIGH_VALUE_JOB_THB ?? 5000,
);

const APPROVED_STATUSES = new Set(["approved", "verified"]);

export function isFullKycLevel(level: unknown): boolean {
  if (level === KYCLevel.FULL || level === 2) return true;
  const s = String(level ?? "")
    .toLowerCase()
    .trim();
  return s === "level_2" || s === "full" || s === "2";
}

export type KycGateInput = {
  kycStatus?: string | null;
  kycLevel?: string | number | null;
  needsReverify?: boolean;
};

export function isKycVerifiedFull(input: KycGateInput): boolean {
  if (input.needsReverify) return false;
  const st = String(input.kycStatus ?? "")
    .toLowerCase()
    .trim();
  if (!APPROVED_STATUSES.has(st)) return false;
  return isFullKycLevel(input.kycLevel);
}

export function shouldRequireKycForWithdraw(input: KycGateInput): boolean {
  return !isKycVerifiedFull(input);
}

export function shouldRequireKycForHighValueJob(
  jobFeeThb: number,
  input: KycGateInput,
): boolean {
  if (
    !Number.isFinite(jobFeeThb) ||
    jobFeeThb < HIGH_VALUE_JOB_THRESHOLD_THB
  ) {
    return false;
  }
  return !isKycVerifiedFull(input);
}
