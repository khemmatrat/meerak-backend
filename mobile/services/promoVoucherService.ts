import { api } from "./api";

export type UserPromoVoucher = {
  id: string;
  userId: string;
  bannerId: string;
  promoCode: string;
  maxDiscountBaht: number;
  remainingBaht: number;
  claimedAt: string;
  expiresAt: string | null;
  discountMode?: "fixed_baht" | "percent";
  discountPercent?: number | null;
  firstPaidJobOnly?: boolean;
  /** ว่าง = ทุกหมวด — ตรงกับ jobs.category */
  allowedJobCategories?: string[] | null;
  /** false = แอดมินระงับรับ/ใช้โค้ด (แบนเนอร์ยังโชว์ได้) */
  promoClaimsEnabled?: boolean;
};

export function isVoucherAllowedForJobCategory(v: UserPromoVoucher, jobCategory: string | undefined): boolean {
  const list = v.allowedJobCategories;
  if (!list || list.length === 0) return true;
  const jc = String(jobCategory || "")
    .trim()
    .toLowerCase();
  return list.some((c) => String(c || "").trim().toLowerCase() === jc);
}

/** ต้องสอดคล้องกับ backend computePromoDiscountThb */
export function computeAppliedPromoDiscountThb(jobPrice: number, v: UserPromoVoucher): number {
  const price = Math.max(0, Math.round(jobPrice * 100) / 100);
  const rem = Math.max(0, v.remainingBaht);
  const cap = Math.max(0, v.maxDiscountBaht);
  if (rem <= 0 || price <= 0) return 0;
  if (v.discountMode === "percent" && v.discountPercent != null && v.discountPercent > 0) {
    const pct = Math.min(100, Math.max(0, v.discountPercent));
    const raw = Math.round(((price * pct) / 100) * 100) / 100;
    return Math.min(rem, cap, raw, price);
  }
  return Math.min(rem, cap, price);
}

/** POST /api/vouchers/claim — หลังกดรับจากแบนเนอร์ */
export async function claimPromoVoucherFromBanner(code: string): Promise<{
  voucher: UserPromoVoucher;
  message?: string;
}> {
  const { data } = await api.post<{ voucher: UserPromoVoucher; message?: string }>("/vouchers/claim", {
    code: code.trim(),
  });
  return data;
}

/** GET /api/vouchers/my — ต้องล็อกอิน */
export async function fetchMyPromoVouchers(): Promise<UserPromoVoucher[]> {
  const { data } = await api.get<{ vouchers: UserPromoVoucher[] }>("/vouchers/my");
  return data?.vouchers ?? [];
}

/** POST /api/vouchers/use — หลังชำระเงินสำเร็จเท่านั้น (หักกองทุน + ledger) */
export async function usePromoVoucherOnPayment(params: {
  voucherId: string;
  amountThb: number;
  jobId: string;
}): Promise<{ used: number; remainingBaht: number; ledger_id?: string }> {
  const { data } = await api.post<{
    used: number;
    remainingBaht: number;
    ledger_id?: string;
  }>("/vouchers/use", {
    voucherId: params.voucherId,
    amount: Math.round(params.amountThb * 100) / 100,
    jobId: params.jobId,
  });
  return data;
}
