import { api } from "./api";
import { getCurrentFirebaseUser } from "./phoneAuth";
import { normalizePhoneForApi, phonesMatchApi } from "./phoneNormalize";
import {
  loadRegistrationDraft,
  saveRegistrationDraft,
} from "./registrationSession";

export type LoginFailureKind =
  | "no_account"
  | "wrong_password"
  | "password_not_set"
  | "unknown";

/** แยกว่า login ล้มเพราะไม่มีบัญชี หรือรหัสผ่านผิด */
export async function diagnoseLoginFailure(
  phone: string,
  apiCode?: string,
): Promise<LoginFailureKind> {
  if (apiCode === "USER_NOT_FOUND") return "no_account";
  if (apiCode === "INVALID_PASSWORD") return "wrong_password";
  if (apiCode === "PASSWORD_NOT_SET") return "password_not_set";

  const norm = normalizePhoneForApi(phone);
  if (!norm) return "unknown";
  try {
    const res = await api.get(`/users/profile/${encodeURIComponent(norm)}`, {
      validateStatus: () => true,
    });
    if (res.status === 404) return "no_account";
    if (res.status === 200 && res.data?.id) return "wrong_password";
  } catch {
    /* ignore */
  }
  return "unknown";
}

/** กู้ session Firebase ที่ยังค้างหลัง OTP — sync ลง draft สำหรับ Android */
export function syncFirebaseOtpSessionToDraft(
  phoneHint?: string,
): boolean {
  try {
    const fbUser = getCurrentFirebaseUser();
    if (!fbUser?.uid) return false;
    const fbPhone = fbUser.phoneNumber || "";
    const phone = phoneHint
      ? normalizePhoneForApi(phoneHint)
      : normalizePhoneForApi(fbPhone);
    if (!phone) return false;
    if (phoneHint && fbPhone && !phonesMatchApi(phoneHint, fbPhone)) {
      return false;
    }
    saveRegistrationDraft({ phone, firebaseUid: fbUser.uid });
    return true;
  } catch {
    return false;
  }
}

export function hasPendingRegistrationForPhone(phone: string): boolean {
  const draft = loadRegistrationDraft();
  if (!draft) return false;
  return phonesMatchApi(draft.phone, phone);
}

export function pendingRegistrationPhone(): string | null {
  return loadRegistrationDraft()?.phone || null;
}
