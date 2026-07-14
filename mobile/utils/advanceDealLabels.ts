/** Label ภาษาไทยสำหรับสถานะดีล Advance Job */
export const DEAL_STATUS_TH: Record<string, string> = {
  pending: "รอตอบรับ",
  accepted: "ตกลงแล้ว",
  declined: "ปฏิเสธ",
  expired: "หมดอายุ",
  counter_offered: "เสนอราคาใหม่",
  replaced: "ส่งดีลใหม่",
};

export function formatDealStatusTh(status: string | null | undefined): string {
  const key = String(status || "").toLowerCase();
  return DEAL_STATUS_TH[key] || status || "—";
}
