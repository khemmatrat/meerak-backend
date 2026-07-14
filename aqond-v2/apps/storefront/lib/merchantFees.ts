/** นโยบายค่าเช่าและค่าธรรมเนียมร้าน (อาหาร + marketplace) */

export const FEE_POLICY = {
  /** ยอดสะสมในปีแรกต่ำกว่านี้ → ไม่เก็บค่าเช่า */
  year1_free_rent_until_micro: 1_000_000, // ฿10,000
  /** เกินยอดนี้ต่อเดือน → ค่าเช่า ฿1,500 */
  tier_low_monthly_micro: 2_500_000, // ฿25,000
  /** เกินยอดนี้ต่อเดือน → ค่าเช่า ฿3,000 */
  tier_high_monthly_micro: 5_000_000, // ฿50,000
  rent_low_total_micro: 150_000, // ฿1,500
  rent_high_total_micro: 300_000, // ฿3,000
  rent_low_daily_micro: 10_000, // ฿100/วัน
  rent_high_daily_micro: 20_000, // ฿200/วัน
  rent_deduction_days: 15,
  service_fee_bps: 300, // 3%
} as const;

export type RentTier = 'none' | 'low' | 'high';

export type DailyFeeBreakdown = {
  date: string;
  month_index: number;
  gross_revenue_micro: number;
  service_fee_micro: number;
  rent_fee_micro: number;
  total_fee_micro: number;
  net_revenue_micro: number;
  rent_tier: RentTier;
  rent_waived: boolean;
  first_month_free: boolean;
  lines: { type: 'service_fee' | 'shop_rent'; label: string; amount_micro: number }[];
};

export function rentTierForMonthlyRevenue(monthlyRevenueMicro: number): RentTier {
  if (monthlyRevenueMicro > FEE_POLICY.tier_high_monthly_micro) return 'high';
  if (monthlyRevenueMicro > FEE_POLICY.tier_low_monthly_micro) return 'low';
  return 'none';
}

export function rentDailyRateMicro(tier: RentTier): number {
  if (tier === 'high') return FEE_POLICY.rent_high_daily_micro;
  if (tier === 'low') return FEE_POLICY.rent_low_daily_micro;
  return 0;
}

export function rentMonthlyCapMicro(tier: RentTier): number {
  if (tier === 'high') return FEE_POLICY.rent_high_total_micro;
  if (tier === 'low') return FEE_POLICY.rent_low_total_micro;
  return 0;
}

export function serviceFeeMicro(revenueMicro: number, monthIndex: number): number {
  if (monthIndex <= 1 || revenueMicro <= 0) return 0;
  return Math.round((revenueMicro * FEE_POLICY.service_fee_bps) / 10_000);
}

export function computeDailyFees(input: {
  date: string;
  monthIndex: number;
  dailyRevenueMicro: number;
  monthlyRevenueMicro: number;
  cumulativeRevenueMicro: number;
  rentChargedThisMonthMicro: number;
  rentDaysChargedThisMonth: number;
  isFirstYear: boolean;
}): DailyFeeBreakdown {
  const firstMonthFree = input.monthIndex <= 1;
  const year1RentWaived =
    input.isFirstYear &&
    input.cumulativeRevenueMicro < FEE_POLICY.year1_free_rent_until_micro;

  const serviceFee = firstMonthFree
    ? 0
    : serviceFeeMicro(input.dailyRevenueMicro, input.monthIndex);

  let rentFee = 0;
  let rentTier: RentTier = 'none';
  const rentWaived = firstMonthFree || year1RentWaived || input.monthIndex <= 1;

  if (!rentWaived && input.monthIndex >= 2) {
    rentTier = rentTierForMonthlyRevenue(input.monthlyRevenueMicro);
    const cap = rentMonthlyCapMicro(rentTier);
    const dailyRate = rentDailyRateMicro(rentTier);
    if (
      cap > 0 &&
      dailyRate > 0 &&
      input.rentDaysChargedThisMonth < FEE_POLICY.rent_deduction_days &&
      input.rentChargedThisMonthMicro < cap
    ) {
      rentFee = Math.min(dailyRate, cap - input.rentChargedThisMonthMicro);
    }
  }

  const lines: DailyFeeBreakdown['lines'] = [];
  if (serviceFee > 0) {
    lines.push({
      type: 'service_fee',
      label: 'ค่าธรรมเนียมบริการ 3%',
      amount_micro: serviceFee,
    });
  }
  if (rentFee > 0) {
    lines.push({
      type: 'shop_rent',
      label: `หักค่าเช่าร้าน ${rentFee / 100} บาท`,
      amount_micro: rentFee,
    });
  }

  const totalFee = serviceFee + rentFee;
  return {
    date: input.date,
    month_index: input.monthIndex,
    gross_revenue_micro: input.dailyRevenueMicro,
    service_fee_micro: serviceFee,
    rent_fee_micro: rentFee,
    total_fee_micro: totalFee,
    net_revenue_micro: Math.max(0, input.dailyRevenueMicro - totalFee),
    rent_tier: rentTier,
    rent_waived: rentWaived,
    first_month_free: firstMonthFree,
    lines,
  };
}

export function feePolicySummaryTh(): string[] {
  return [
    'เดือนแรก: ไม่หักค่าบริการและค่าเช่า (เก็บพฤติกรรมรายได้)',
    'ปีแรก: ค่าเช่าฟรีจนกว่ายอดสะสมจะถึง ฿10,000',
    'เดือนที่ 2 ขึ้นไป: ค่าธรรมเนียมบริการ 3% ของรายได้รายวัน',
    'ยอดขายเกิน ฿25,000/เดือน: หักค่าเช่า ฿100/วัน สูงสุด 15 วัน (รวม ฿1,500)',
    'ยอดขายเกิน ฿50,000/เดือน: หักค่าเช่า ฿200/วัน สูงสุด 15 วัน (รวม ฿3,000)',
  ];
}
