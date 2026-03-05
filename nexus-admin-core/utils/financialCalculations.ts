/**
 * Financial calculations — คำนวณค่าคอมมิชชั่น, หนี้สินเงินประกัน, Market Cap, % การถือหุ้น
 */

/**
 * คำนวณอัตราค่าคอมมิชชั่นตามจำนวนงานที่ทำเสร็จ (tier)
 */
export function calculateCommission(completedJobsCount: number): number {
  if (completedJobsCount >= 100) return 0.05;
  if (completedJobsCount >= 50) return 0.07;
  if (completedJobsCount >= 20) return 0.08;
  if (completedJobsCount >= 10) return 0.1;
  return 0.12;
}

/**
 * คำนวณค่าคอมมิชชั่น (จำนวนเงิน)
 */
export function calculateCommissionAmount(
  jobAmount: number,
  completedJobsCount: number
): number {
  const rate = calculateCommission(completedJobsCount);
  return Math.round(jobAmount * rate * 100) / 100;
}

/**
 * หนี้สินเงินประกันที่ต้องจ่ายคืน = ผลรวมเงินประกันที่สถานะ pending_release หรือ active (ที่ถึงกำหนดปล่อย)
 */
export function calculateGuaranteeLiability(
  entries: { amount: number; status: string; due_release_at?: string }[]
): number {
  const now = new Date().toISOString();
  return entries
    .filter(
      (e) =>
        e.status === "pending_release" ||
        (e.status === "active" && e.due_release_at && e.due_release_at <= now)
    )
    .reduce((s, e) => s + e.amount, 0);
}

/**
 * Market Cap (จากมูลค่าหุ้น × จำนวนหุ้นทั้งหมด หรือจาก valuation ล่าสุด)
 */
export function calculateMarketCap(
  shareValue: number,
  totalShares: number
): number {
  return Math.round(shareValue * totalShares * 100) / 100;
}

/**
 * % การถือหุ้น = (หุ้นของนักลงทุน / หุ้นทั้งหมด) × 100
 */
export function calculateOwnershipPercentage(
  investorShares: number,
  totalShares: number
): number {
  if (totalShares <= 0) return 0;
  return Math.round((investorShares / totalShares) * 10000) / 100;
}

/**
 * มูลค่าหุ้นต่อหน่วย = Market Cap / หุ้นทั้งหมด
 */
export function calculateShareValue(
  marketCap: number,
  totalShares: number
): number {
  if (totalShares <= 0) return 0;
  return Math.round((marketCap / totalShares) * 100) / 100;
}

/**
 * อัตรากำไร (Profit Margin %) = (กำไรสุทธิ / รายได้รวม) × 100
 */
export function calculateProfitMargin(
  revenue: number,
  netProfit: number
): number {
  if (revenue <= 0) return 0;
  return Math.round((netProfit / revenue) * 1000) / 10;
}
