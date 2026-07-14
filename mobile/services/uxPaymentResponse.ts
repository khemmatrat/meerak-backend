/** Task 16: canonical UX payment payload + staleness guards (mobile). Mirrors backend/lib/paymentResponsePresenter.js. */

export type UxPaymentStatus =
  | "pending"
  | "awaiting_payment"
  | "processing"
  | "completed"
  | "failed"
  | "expired"
  | "reversed"
  | "manual_review";

export type UxNextAction =
  | "open_qr"
  | "open_redirect"
  | "wait"
  | "retry_payment"
  | "contact_support"
  | "none";

export type UxPaymentCanonical = {
  payment_id: string;
  status: UxPaymentStatus;
  next_action: UxNextAction;
  expires_at: string | null;
  display_amount: string;
  poll_after_ms: number;
  failure_code: string | null;
  failure_hint_th: string | null;
  failure_hint_en: string | null;
  trace_id: string;
  status_version: number;
};

export const UX_TERMINAL_PAYMENT_STATUSES: ReadonlySet<UxPaymentStatus> = new Set([
  "completed",
  "failed",
  "expired",
  "reversed",
  "manual_review",
]);

export function shouldDiscardStaleUxPayment(storedVersion: number, incomingVersion: number): boolean {
  return incomingVersion < storedVersion;
}

export function isTerminalUxPaymentStatus(status: string | undefined | null): boolean {
  if (!status) return false;
  return UX_TERMINAL_PAYMENT_STATUSES.has(status as UxPaymentStatus);
}

export function pickUxFailureMessage(ux: UxPaymentCanonical | null | undefined, lang: "th" | "en"): string | null {
  if (!ux) return null;
  if (ux.status !== "failed" && ux.status !== "manual_review") return null;
  return lang === "th" ? ux.failure_hint_th : ux.failure_hint_en;
}

/**
 * User-visible explanation while polling — status comes from AQOND/backend after provider processing,
 * never from verifying webhooks on the device.
 */
export function describeUxPollingStatus(ux: UxPaymentCanonical, lang: "th" | "en"): string {
  const raw = ux.status as UxPaymentStatus;
  if (lang === "th") {
    switch (raw) {
      case "pending":
        return "สร้างรายการแล้ว รอยืนยันจากผู้ให้บริการและเซิร์ฟเวอร์";
      case "awaiting_payment":
        return "รอให้โอนหรือสแกนจ่ายครบถ้วน";
      case "processing":
        return "กำลังยืนยันการชำระกับธนาคาร/ผู้ให้บริการผ่านเซิร์ฟเวอร์";
      case "completed":
        return "ยืนยันการชำระแล้ว";
      default:
        return raw;
    }
  }
  switch (raw) {
    case "pending":
      return "Order created — waiting for your bank/provider and AQOND confirmation";
    case "awaiting_payment":
      return "Awaiting your transfer or QR payment";
    case "processing":
      return "Confirming payment with provider via AQOND servers";
    case "completed":
      return "Payment confirmed";
    default:
      return raw;
  }
}

/** Footer under QR/card flow — reinforces trust boundary (verification on server only). */
export function paymentConfirmedViaServerFootnote(lang: "th" | "en"): string {
  return lang === "th"
    ? "เมื่อมีการโอนแล้ว สถานะชำระเงินที่แสดงจะได้รับการยืนยันจากเซิร์ฟเวอร์หลังระบบรับจากผู้ให้บริการ — อาจใช้เวลาสักครู่หลังจากโอนสำเร็จ"
    : "After you pay, the status updates when AQOND’s servers confirm with your provider — it may lag slightly after your bank shows success.";
}

export function pollTimeoutUserMessage(lang: "th" | "en"): string {
  return lang === "th"
    ? "รอยืนยันจากระบบนานเกินไป — หากธนาคารหักเงินแล้ว ให้รีเฟรชหรือติดตามสถานะงาน หากยังค้างติดต่อสนับสนุนพร้อมหมายเลขงาน"
    : "We could not confirm in time — if money left your bank, refresh or check the job; if stuck, contact support with the job ID.";
}

export function rateLimitedCreatePaymentMessage(seconds: number, lang: "th" | "en"): string {
  const sec = Math.max(1, Math.ceil(seconds));
  return lang === "th"
    ? `เรียกสร้างการชำระเงินบ่อยเกินไป — โปรดรอประมาณ ${sec} วินาทีแล้วลองใหม่`
    : `Too many payment-create requests — please wait about ${sec} seconds before retrying.`;
}
