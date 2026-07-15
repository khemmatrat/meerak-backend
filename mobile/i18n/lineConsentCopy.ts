/**
 * Explicit LINE-connect consent copy. The point (per spec): tell the user exactly WHAT messages
 * we will send via LINE — not a vague "link your account".
 */
export function lineConsentCopy(lang: string) {
  if (lang === "th") {
    return {
      title: "เชื่อม LINE เพื่อรับความช่วยเหลือตอนสมัคร",
      intro:
        "ถ้าคุณเชื่อม LINE เราจะส่งข้อความช่วยเหลือระหว่างสมัครพาร์ทเนอร์ให้ครับ โดยจะส่งเฉพาะเรื่องเหล่านี้:",
      scopes: [
        "เตือนอย่างสุภาพเมื่อสมัครค้างไว้ (ไม่เกินวันละ 1 ครั้ง และหยุดเองเมื่อสมัครเสร็จ)",
        "อัปเดตสถานะการสมัคร/ยืนยันตัวตน (KYC) และการเปิดร้าน",
      ],
      promise:
        "เราจะไม่ส่งโฆษณาหรือสแปม และคุณปิดการแจ้งเตือนได้ทุกเมื่อในหน้าตั้งค่า",
      accept: "ยินยอมและเชื่อม LINE",
      decline: "ไม่ใช่ตอนนี้",
      unavailable:
        "เปิดผ่านแอป LINE เพื่อเชื่อมบัญชี — ตอนนี้ยังเชื่อมไม่ได้ครับ",
      connected: "เชื่อม LINE เรียบร้อย จะส่งข้อความช่วยเหลือให้ตามที่ยินยอมครับ",
      failed: "เชื่อม LINE ไม่สำเร็จ ลองใหม่อีกครั้งครับ",
    };
  }
  return {
    title: "Connect LINE for onboarding help",
    intro:
      "If you connect LINE, we'll send onboarding help messages. We will only send:",
    scopes: [
      "A gentle reminder if your application stalls (at most once a day, and it stops once you finish).",
      "Status updates for your application, identity check (KYC), and shop go-live.",
    ],
    promise:
      "No ads or spam — and you can turn notifications off anytime in Settings.",
    accept: "Agree & connect LINE",
    decline: "Not now",
    unavailable: "Open in the LINE app to connect — not available right now.",
    connected: "LINE connected — we'll send the help messages you agreed to.",
    failed: "Couldn't connect LINE. Please try again.",
  };
}
