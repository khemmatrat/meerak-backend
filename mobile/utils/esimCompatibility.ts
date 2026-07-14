/**
 * Client-side heuristic for eSIM support — not a guarantee (hardware/OS dependent).
 * Real support requires native APIs or carrier profile checks.
 */

export type EsimSupportHint = "likely" | "possible" | "unknown";

export function getEsimSupportHint(): { level: EsimSupportHint; detail: string } {
  if (typeof navigator === "undefined") {
    return { level: "unknown", detail: "ไม่สามารถตรวจสอบในเบราว์เซอร์นี้ได้" };
  }
  const ua = navigator.userAgent || "";

  // iPhone XS (2018)+ generally eSIM-capable on supported iOS
  if (/iPhone/.test(ua)) {
    const m = /OS (\d+)_/.exec(ua);
    const major = m ? parseInt(m[1], 10) : 0;
    if (major >= 12) {
      return {
        level: "likely",
        detail: "iPhone รุ่นใหม่มักรองรับ eSIM — ตรวจสอบใน การตั้งค่า > เซลลูลาร์ อีกครั้ง",
      };
    }
    return { level: "possible", detail: "อาจรองรับ eSIM ขึ้นกับรุ่นเครื่องและ iOS" };
  }

  if (/iPad/.test(ua)) {
    return { level: "likely", detail: "iPad หลายรุ่นรองรับ eSIM — ตรวจสอบในการตั้งค่า" };
  }

  if (/Android/.test(ua)) {
    return {
      level: "unknown",
      detail: "Android ขึ้นกับผู้ผลิต — เปิด การตั้งค่า > เครือข่าย > SIM / eSIM",
    };
  }

  return { level: "unknown", detail: "ไม่พบข้อมูลรุ่น — ตรวจสอบคู่มือเครื่องก่อนซื้อ" };
}
