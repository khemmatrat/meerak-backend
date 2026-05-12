/**
 * ฟลัก PaySo เดียวกันทั้ง payout / เติมเงิน QR / snapshot แอดมิน
 * รับค่า PAYSO_ENABLED หลายรูปแบบ (ลดปัญหา deploy ที่ใช้ true/on)
 */

/** @returns {boolean} */
export function isPaysoEnabledFromEnv() {
  const v = normalizePaysoEnabled(process.env.PAYSO_ENABLED);
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** เหลือ ASCII lower + trim — ว่างเมื่อไม่มีหรือ blank; ตัด BOM + เครื่องหมายคำพูดครอบ (บาง .env เขียนเป็น "1") */
export function normalizePaysoEnabled(raw) {
  if (raw == null) return '';
  let s = String(raw).trim();
  s = s.replace(/^\uFEFF/, '').trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s.toLowerCase();
}

/** สำหรับแอดมินดูว่าเซิร์ฟเวอร์จริงได้ค่าอะไร (ไม่ใช่ความลับ) */
export function getPaysoEnabledEnvDiagnostics() {
  const hasKey = Object.prototype.hasOwnProperty.call(process.env, 'PAYSO_ENABLED');
  const rawTrimmed =
    process.env.PAYSO_ENABLED === undefined ? null : String(process.env.PAYSO_ENABLED).trim();
  return {
    /** มีคีย์ใน process.env (ครอบคลุมกรณี PAYSO_ENABLED= ว่าง) */
    defined: hasKey,
    raw: rawTrimmed,
    effectiveOn: isPaysoEnabledFromEnv(),
  };
}
