/**
 * ปกติเบอร์เป็น 0XXXXXXXXX — สอดคล้องกับ backend normalizePhoneForStorage()
 * รองรับ +668..., 668..., 081..., และเบอร์ 9 หลัก
 */
export function normalizePhoneForApi(phone: string): string {
  if (!phone || typeof phone !== "string") return "";
  let p = phone.trim().replace(/[\s\-()]/g, "").replace(/^\+/, "");
  if (p.startsWith("66") && p.length >= 10) return "0" + p.slice(2);
  if (p.startsWith("0") && p.length === 10) return p;
  if (p.length === 9 && !p.startsWith("0")) return "0" + p;
  return p;
}

/** เปรียบเทียบเบอร์หลัง normalize — ใช้จับคู่ draft / Firebase */
export function phonesMatchApi(a: string, b: string): boolean {
  const na = normalizePhoneForApi(a);
  const nb = normalizePhoneForApi(b);
  if (!na || !nb) return false;
  return na === nb;
}
