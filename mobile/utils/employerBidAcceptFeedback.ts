import type { NotificationType } from "../context/NotificationContext";
import { HIGH_VALUE_JOB_THRESHOLD_THB } from "./kycProgressiveGate";

/** รหัสที่ backend ส่งเมื่อผู้รับงานยัง KYC ไม่ครบสำหรับงานมูลค่าสูง */
export const EMPLOYER_BID_ACCEPT_KYC_CODE = "KYC_REQUIRED_FOR_HIGH_VALUE_JOB" as const;

type ApiErrPayload = {
  error?: unknown;
  message?: unknown;
  code?: unknown;
  threshold_thb?: unknown;
};

type AxiosShape = {
  response?: { status?: number; data?: ApiErrPayload };
  message?: string;
};

function asNonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/\s+/g, " ");
  return s.length > 0 ? s : null;
}

function thresholdLabelFromPayload(data: ApiErrPayload | undefined): string {
  const n = Number(data?.threshold_thb);
  const thb =
    Number.isFinite(n) && n > 0 ? Math.round(n) : HIGH_VALUE_JOB_THRESHOLD_THB;
  return thb.toLocaleString("th-TH");
}

/**
 * แปลง error จาก POST …/bids/:bidId/accept เป็นข้อความ toast สำหรับผู้จ้าง
 * — แยกรหัส KYC ชัดเจน, ที่เหลือ fallback จาก response.data
 */
export function getEmployerBidAcceptFeedback(err: unknown): {
  message: string;
  notificationType: NotificationType;
  durationMs: number;
  /** ข้อความสำหรับส่งต่อถึงผู้รับงาน (แชทในแอป / LINE ฯลฯ) — มีเมื่อเป็น KYC งานมูลค่าสูง */
  textToCopyForDriver?: string;
} {
  const ax = err as AxiosShape;
  const data = ax.response?.data;
  const code = asNonEmptyString(data?.code);

  if (code === EMPLOYER_BID_ACCEPT_KYC_CODE) {
    const thresholdFmt = thresholdLabelFromPayload(data);
    const serverLine = asNonEmptyString(data?.error);
    const headline =
      `ยังยืนยันข้อเสนอนี้ไม่ได้ — งานค่าจ้างตั้งแต่ ${thresholdFmt} บาทขึ้นไป ผู้รับงานต้องทำ KYC (ยืนยันตัวตน) ให้ครบก่อน`;
    const hint =
      "แจ้งผู้รับงานให้ไปทำ KYC ในแอป หรือเลือกผู้เสนอราคาท่านอื่น";
    const message = serverLine
      ? `${headline}\n${hint}\n(${serverLine})`
      : `${headline}\n${hint}`;

    const textToCopyForDriver = [
      "สวัสดีครับ/ค่ะ (แจ้งจากผู้จ้าง)",
      "",
      `ระบบยังกดยืนยันราคาที่คุณเสนอไม่ได้ชั่วคราว — งานค่าจ้างตั้งแต่ ${thresholdFmt} บาทขึ้นไป ต้องยืนยันตัวตน (KYC) ในแอปให้ครบก่อน`,
      "",
      "รบกวนเข้าเมนูยืนยันตัวตน (KYC) ในแอป ให้ครบตามขั้นตอน แล้วแจ้งกลับมาเมื่อพร้อม จะได้ดำเนินการยืนยันราคาต่อให้ครับ/ค่ะ",
      ...(serverLine ? ["", `หมายเหตุจากระบบ: ${serverLine}`] : []),
    ].join("\n");

    return {
      message,
      notificationType: "warning",
      durationMs: 11_000,
      textToCopyForDriver,
    };
  }

  const fallback =
    asNonEmptyString(data?.error) ||
    asNonEmptyString(data?.message) ||
    asNonEmptyString(ax.message) ||
    "ยืนยันข้อเสนอไม่สำเร็จ — กรุณาลองอีกครั้ง";

  return {
    message: fallback,
    notificationType: "error",
    durationMs: 4_500,
  };
}

/**
 * คัดลอกข้อความธรรมดา — รองรับ HTTPS / permission และ fallback execCommand (บาง WebView)
 */
export async function copyPlainTextToClipboard(text: string): Promise<boolean> {
  const payload = String(text ?? "");
  if (!payload.trim()) return false;
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard?.writeText &&
      window.isSecureContext
    ) {
      await navigator.clipboard.writeText(payload);
      return true;
    }
  } catch {
    /* fallback */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = payload;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, payload.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return !!ok;
  } catch {
    return false;
  }
}
