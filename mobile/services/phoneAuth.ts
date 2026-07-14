import { auth } from "../firebaseConfig";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
} from "firebase/auth";

let recaptchaVerifier: RecaptchaVerifier | null = null;
let confirmationResult: ConfirmationResult | null = null;
let recaptchaRenderPromise: Promise<void> | null = null;

const RECAPTCHA_CONTAINER_ID = "recaptcha-container";

/** ข้อความที่ user เห็น — ไม่พูดถึง reCAPTCHA / Firebase / API key */
function friendlyOtpError(error: unknown): string {
  const code = (error as { code?: string })?.code || "";
  const raw = String((error as { message?: string })?.message || "");

  if (code === "auth/invalid-phone-number") {
    return "เบอร์โทรไม่ถูกต้อง ลองตรวจสอบแล้วกรอกใหม่อีกครั้งนะคะ";
  }
  if (code === "auth/too-many-requests") {
    return "ส่งรหัสบ่อยเกินไป รอประมาณ 1–2 นาทีแล้วลองใหม่ได้เลยค่ะ";
  }
  if (code === "auth/quota-exceeded") {
    return "ระบบส่ง SMS เต็มช่วงเวลานี้ กรุณารอสักครู่หรือติดต่อทีมสนับสนุนค่ะ";
  }
  if (
    code === "auth/captcha-check-failed" ||
    code === "auth/missing-recaptcha-token" ||
    code === "auth/invalid-app-credential" ||
    code === "auth/app-not-authorized"
  ) {
    return "กำลังเตรียมส่งรหัสให้คุณอีกครั้ง — กดส่งรหัสอีกครั้งในอีกสักครู่ค่ะ";
  }
  if (code === "auth/operation-not-allowed") {
    return "ระบบยืนยันเบอร์ยังไม่พร้อม กรุณาติดต่อทีมสนับสนุนค่ะ";
  }
  if (code === "auth/billing-not-enabled") {
    return "ระบบส่ง SMS ยังไม่พร้อม กรุณาติดต่อทีมสนับสนุนค่ะ";
  }
  if (/recaptcha|captcha|firebase|api key|invalid-app-credential/i.test(raw)) {
    return "กำลังเตรียมส่งรหัสให้คุณ — กดส่งรหัสอีกครั้งในอีกสักครู่ค่ะ";
  }
  return "ส่งรหัสไม่สำเร็จชั่วคราว กดส่งรหัสอีกครั้งได้เลยค่ะ";
}

function normalizeThaiPhone(phoneNumber: string): string {
  let normalizedPhone = phoneNumber.trim().replace(/[\s\-()]/g, "");
  if (normalizedPhone.startsWith("0")) {
    normalizedPhone = "+66" + normalizedPhone.substring(1);
  } else if (
    normalizedPhone.startsWith("66") &&
    !normalizedPhone.startsWith("+")
  ) {
    normalizedPhone = "+" + normalizedPhone;
  } else if (!normalizedPhone.startsWith("+")) {
    normalizedPhone = "+66" + normalizedPhone;
  }
  return normalizedPhone;
}

function clearRecaptchaVerifier() {
  if (recaptchaVerifier) {
    try {
      recaptchaVerifier.clear();
    } catch {
      /* ignore */
    }
    recaptchaVerifier = null;
    recaptchaRenderPromise = null;
  }
}

async function ensureRecaptchaReady(
  elementId: string = RECAPTCHA_CONTAINER_ID,
  forceNew = false,
): Promise<RecaptchaVerifier> {
  if (forceNew) clearRecaptchaVerifier();

  if (!recaptchaVerifier) {
    if (!auth) throw new Error("auth_unavailable");
    recaptchaVerifier = new RecaptchaVerifier(auth, elementId, {
      size: "invisible",
      callback: () => {},
      "expired-callback": () => {
        clearRecaptchaVerifier();
      },
    });
    recaptchaRenderPromise = recaptchaVerifier.render().then(() => {});
  }

  if (recaptchaRenderPromise) {
    await recaptchaRenderPromise.catch(() => {
      clearRecaptchaVerifier();
    });
  }

  if (!recaptchaVerifier) {
    throw new Error("recaptcha_init_failed");
  }
  return recaptchaVerifier;
}

/** เรียกตอนเปิดหน้าสมัคร/ลืมรหัส — ลดโอกาส popup ตอนกดส่ง OTP */
export async function warmRecaptchaVerifier(
  elementId: string = RECAPTCHA_CONTAINER_ID,
): Promise<void> {
  try {
    await ensureRecaptchaReady(elementId, false);
  } catch {
    /* non-fatal — sendOTP จะลองใหม่ */
  }
}

/**
 * ส่ง OTP ไปยังเบอร์โทรศัพท์ (invisible verification — ไม่แสดงข้อความ reCAPTCHA ให้ user)
 */
export const sendOTP = async (
  phoneNumber: string,
  opts?: { retryOnCaptcha?: boolean },
): Promise<{ success: boolean; message: string }> => {
  const normalizedPhone = normalizeThaiPhone(phoneNumber);
  const allowRetry = opts?.retryOnCaptcha !== false;

  for (let attempt = 0; attempt < (allowRetry ? 2 : 1); attempt++) {
    try {
      const appVerifier = await ensureRecaptchaReady(
        RECAPTCHA_CONTAINER_ID,
        attempt > 0,
      );

      confirmationResult = await signInWithPhoneNumber(
        auth,
        normalizedPhone,
        appVerifier,
      );

      return {
        success: true,
        message: `ส่งรหัส OTP ไปที่ ${normalizedPhone} แล้ว กรุณาตรวจ SMS ค่ะ`,
      };
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code || "";
      const captchaLike =
        code === "auth/captcha-check-failed" ||
        code === "auth/missing-recaptcha-token" ||
        code === "auth/invalid-app-credential";

      if (captchaLike && attempt === 0 && allowRetry) {
        clearRecaptchaVerifier();
        continue;
      }

      if (import.meta.env?.DEV) {
        console.warn("[phoneAuth] sendOTP failed:", code || error);
      }

      return {
        success: false,
        message: friendlyOtpError(error),
      };
    }
  }

  return {
    success: false,
    message: "ส่งรหัสไม่สำเร็จชั่วคราว กดส่งรหัสอีกครั้งได้เลยค่ะ",
  };
};

/** ส่ง OTP ใหม่โดยไม่กลับไปหน้ากรอกเบอร์ */
export const resendOTP = async (
  phoneNumber: string,
): Promise<{ success: boolean; message: string }> => {
  confirmationResult = null;
  return sendOTP(phoneNumber, { retryOnCaptcha: true });
};

const OTP_VERIFY_TIMEOUT_MS = 45_000;

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  timeoutCode: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(Object.assign(new Error(timeoutCode), { code: timeoutCode }));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export const verifyOTP = async (
  otp: string,
): Promise<{
  success: boolean;
  message: string;
  firebase_uid?: string;
  firebase_token?: string;
  phone?: string;
}> => {
  try {
    if (!confirmationResult) {
      return {
        success: false,
        message: "กรุณากดส่งรหัส OTP ก่อนนะคะ",
      };
    }

    const userCredential = await withTimeout(
      confirmationResult.confirm(otp),
      OTP_VERIFY_TIMEOUT_MS,
      "otp_verify_timeout",
    );
    const user = userCredential.user;
    const idToken = await user.getIdToken();

    return {
      success: true,
      message: "ยืนยันเบอร์โทรสำเร็จแล้วค่ะ",
      firebase_uid: user.uid,
      firebase_token: idToken,
      phone: user.phoneNumber || undefined,
    };
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code || "";
    if (code === "otp_verify_timeout") {
      return {
        success: false,
        message:
          "ตรวจสอบ OTP นานเกินไป กรุณาตรวจสัญญาณแล้วลองใหม่อีกครั้งค่ะ",
      };
    }
    if (code === "auth/invalid-verification-code") {
      return {
        success: false,
        message: "รหัส OTP ไม่ถูกต้อง ลองกรอกใหม่อีกครั้งนะคะ",
      };
    }
    if (code === "auth/code-expired") {
      return {
        success: false,
        message: "รหัส OTP หมดอายุแล้ว กดส่งรหัสใหม่ได้เลยค่ะ",
      };
    }
    return {
      success: false,
      message: "รหัส OTP ไม่ถูกต้อง ลองกรอกใหม่อีกครั้งนะคะ",
    };
  }
};

export const resetPhoneAuth = () => {
  clearRecaptchaVerifier();
  confirmationResult = null;
};

export const getCurrentFirebaseUser = () => auth.currentUser;

export const getFreshPhoneAuthIdToken = async (): Promise<string | null> => {
  try {
    const user = auth.currentUser;
    if (!user) return null;
    return await user.getIdToken(true);
  } catch {
    return null;
  }
};
