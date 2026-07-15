/** เก็บ draft ลืมรหัสผ่าน — localStorage หลัก (รอด Android kill app) + sessionStorage สำรอง
 *  เก็บเฉพาะจุดที่กู้คืนได้จริง: หลังยืนยัน OTP แล้ว (step "password")
 *  token ใหม่ดึงจาก auth.currentUser ผ่าน getFreshPhoneAuthIdToken() ตอนตั้งรหัส */
import { normalizePhoneForApi } from "./phoneNormalize";

const FP_STORAGE_KEY = "aqond_forgot_password_draft_v1";
const FP_SESSION_TTL_MS = 60 * 60 * 1000; // 1 ชั่วโมง — OTP-based

export type ForgotPasswordDraft = {
  phone: string;
  step: "password";
  savedAt: number;
};

function readRawDraft(): string | null {
  try {
    return (
      localStorage.getItem(FP_STORAGE_KEY) ||
      sessionStorage.getItem(FP_STORAGE_KEY)
    );
  } catch {
    return null;
  }
}

function writeRawDraft(json: string): void {
  try {
    localStorage.setItem(FP_STORAGE_KEY, json);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.setItem(FP_STORAGE_KEY, json);
  } catch {
    /* ignore */
  }
}

export function saveForgotPasswordDraft(input: { phone: string }): void {
  const phone = normalizePhoneForApi(String(input.phone || ""));
  if (!phone) return;
  const draft: ForgotPasswordDraft = {
    phone,
    step: "password",
    savedAt: Date.now(),
  };
  writeRawDraft(JSON.stringify(draft));
}

export function loadForgotPasswordDraft(): ForgotPasswordDraft | null {
  try {
    const raw = readRawDraft();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ForgotPasswordDraft>;
    if (parsed?.step !== "password" || !parsed.phone?.trim()) {
      return null;
    }
    if (Date.now() - (parsed.savedAt || 0) > FP_SESSION_TTL_MS) {
      clearForgotPasswordDraft();
      return null;
    }
    return {
      phone: normalizePhoneForApi(parsed.phone),
      step: "password",
      savedAt: parsed.savedAt || Date.now(),
    };
  } catch {
    return null;
  }
}

export function clearForgotPasswordDraft(): void {
  try {
    localStorage.removeItem(FP_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(FP_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
