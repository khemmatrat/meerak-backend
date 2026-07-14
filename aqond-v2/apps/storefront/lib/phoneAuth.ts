'use client';

import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth';
import { auth } from './firebaseConfig';

let recaptchaVerifier: RecaptchaVerifier | null = null;
let confirmationResult: ConfirmationResult | null = null;

const RECAPTCHA_CONTAINER_ID = 'recaptcha-container';

function friendlyOtpError(error: unknown): string {
  const code = (error as { code?: string })?.code || '';
  if (code === 'auth/invalid-phone-number') return 'เบอร์โทรไม่ถูกต้อง ลองตรวจสอบแล้วกรอกใหม่อีกครั้งนะคะ';
  if (code === 'auth/too-many-requests') return 'ส่งรหัสบ่อยเกินไป รอประมาณ 1–2 นาทีแล้วลองใหม่ได้เลยค่ะ';
  return 'ส่งรหัสไม่สำเร็จชั่วคราว กดส่งรหัสอีกครั้งได้เลยค่ะ';
}

function normalizeThaiPhone(phoneNumber: string): string {
  let normalizedPhone = phoneNumber.trim().replace(/[\s\-()]/g, '');
  if (normalizedPhone.startsWith('0')) {
    normalizedPhone = '+66' + normalizedPhone.substring(1);
  } else if (normalizedPhone.startsWith('66') && !normalizedPhone.startsWith('+')) {
    normalizedPhone = '+' + normalizedPhone;
  } else if (!normalizedPhone.startsWith('+')) {
    normalizedPhone = '+66' + normalizedPhone;
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
  }
}

async function ensureRecaptchaReady(elementId = RECAPTCHA_CONTAINER_ID): Promise<RecaptchaVerifier> {
  if (recaptchaVerifier) return recaptchaVerifier;
  recaptchaVerifier = new RecaptchaVerifier(auth, elementId, { size: 'invisible' });
  await recaptchaVerifier.render();
  return recaptchaVerifier;
}

export async function sendOTP(phoneNumber: string): Promise<{ success: boolean; message: string }> {
  try {
    if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
      return { success: false, message: 'Firebase ยังไม่ได้ตั้งค่า — ใช้แอป AQOND สมัครได้' };
    }
    const normalizedPhone = normalizeThaiPhone(phoneNumber);
    const verifier = await ensureRecaptchaReady();
    confirmationResult = await signInWithPhoneNumber(auth, normalizedPhone, verifier);
    return { success: true, message: 'ส่งรหัส OTP แล้ว' };
  } catch (error) {
    clearRecaptchaVerifier();
    return { success: false, message: friendlyOtpError(error) };
  }
}

export async function verifyOTP(code: string): Promise<{ success: boolean; firebaseUid?: string; message: string }> {
  if (!confirmationResult) {
    return { success: false, message: 'ยังไม่ได้ขอรหัส OTP — กดส่งรหัสก่อน' };
  }
  try {
    const cred = await confirmationResult.confirm(code.trim());
    const firebaseUid = cred.user.uid;
    confirmationResult = null;
    clearRecaptchaVerifier();
    return { success: true, firebaseUid, message: 'ยืนยันเบอร์สำเร็จ' };
  } catch {
    return { success: false, message: 'รหัส OTP ไม่ถูกต้อง ลองใหม่อีกครั้ง' };
  }
}

export async function resendOTP(phoneNumber: string) {
  clearRecaptchaVerifier();
  confirmationResult = null;
  return sendOTP(phoneNumber);
}

export function resetPhoneAuth() {
  confirmationResult = null;
  clearRecaptchaVerifier();
}

export { RECAPTCHA_CONTAINER_ID };
