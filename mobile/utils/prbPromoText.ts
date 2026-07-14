import type { PrbConfig } from "../services/prbApi";

/** ข้อความโปรโมชัน — ตัวเลข min / ส่วนลด มาจาก config ที่ admin บันทึก */
export function formatPrbPromoBanner(
  config?: Partial<PrbConfig> | null,
): string {
  const min = Number(config?.min_wallet_for_entry_thb) || 700;
  const discount = Number(config?.first_order_discount_thb) || 0;
  const template = String(config?.promo_banner_text || "").trim();
  if (template.includes("{min}") || template.includes("{discount}")) {
    return template
      .replace(/\{min\}/g, min.toLocaleString())
      .replace(/\{discount\}/g, discount.toLocaleString());
  }
  return `เติมเงิน ${min.toLocaleString()} บาท รับส่วนลด ${discount.toLocaleString()} บาท สำหรับต่อ พ.ร.บ. ครั้งแรก`;
}

export function prbMinWalletTopup(config?: Partial<PrbConfig> | null): number {
  return Number(config?.min_wallet_for_entry_thb) || 700;
}
