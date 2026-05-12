/**
 * FEE STRUCTURE — LOCKED REFERENCE
 * ================================
 * Aligned with backend/lib/financialEngine.js
 * CRITICAL: No modifications without owner authorization.
 * Use for Admin display & Revenue stream labels only.
 */

export const VIP_TIERS = ["none", "silver", "gold", "platinum"] as const;
export type VipTier = (typeof VIP_TIERS)[number];

// ============ MATCH JOB & ADVANCE JOB ============
/** Sourcing: None/Silver 8% | Gold/Platinum 6% */
export const MATCH_SOURCING_RATE: Record<VipTier, number> = {
  none: 0.08,
  silver: 0.08,
  gold: 0.06,
  platinum: 0.06,
};

/** Platform Commission: None 24% | Silver 22% | Gold 20% | Platinum 18% */
export const MATCH_PLATFORM_COMMISSION_RATE: Record<VipTier, number> = {
  none: 0.24,
  silver: 0.22,
  gold: 0.2,
  platinum: 0.18,
};

/** Tax Service: 3% of (Sourcing + Commission) */
export const TAX_SERVICE_RATE = 0.03;

/** Payment Markup: 5% (Employer pays on jobFee + insurance) */
export const PAYMENT_MARKUP_RATE = 0.05;

// ============ BOOKING TALENTS ============
/** Booking Commission: None 32% | Silver 28% | Gold 24% | Platinum 20% */
export const BOOKING_COMMISSION_RATE: Record<VipTier, number> = {
  none: 0.32,
  silver: 0.28,
  gold: 0.24,
  platinum: 0.2,
};

/** Sourcing for Booking: 8% fixed */
export const BOOKING_SOURCING_RATE = 0.08;

/** Bidding Fee: 9.3% on surplus only */
export const BIDDING_FEE_RATE = 0.093;

/** Markup Fee (Employer pays on deposit): None 8% | Silver 7% | Gold 6% | Platinum 5% */
export const BOOKING_MARKUP_RATE: Record<VipTier, number> = {
  none: 0.08,
  silver: 0.07,
  gold: 0.06,
  platinum: 0.05,
};

// ============ LEDGER SUB_CATEGORIES ============
export const SUB_CATEGORIES = [
  "Sourcing",
  "Bidding_Diff",
  "Insurance",
  "Challenge_Compensation",
] as const;
export type SubCategory = (typeof SUB_CATEGORIES)[number];

/** Human-readable labels for sub_category */
export const SUB_CATEGORY_LABELS: Record<string, string> = {
  Sourcing: "Sourcing (ค่าจัดหา)",
  Bidding_Diff: "Bidding Diff (ส่วนต่างประมูล)",
  Insurance: "Insurance (ประกัน)",
  Challenge_Compensation: "Challenge Compensation",
};

/** Get display label for event_type + leg + sub_category */
export function getRevenueStreamLabel(
  eventType: string,
  leg: string | null,
  subCategory?: string | null
): string {
  if (eventType === "booking_fee") {
    if (subCategory && SUB_CATEGORY_LABELS[subCategory]) {
      return SUB_CATEGORY_LABELS[subCategory];
    }
    return "Booking Fee";
  }
  if (eventType === "escrow_held" && leg === "commission") {
    return "Job Commission (Match/Advance)";
  }
  if (eventType === "escrow_held" && leg === "insurance_liability") {
    return "Insurance Liability";
  }
  return eventType.replace(/_/g, " ");
}
