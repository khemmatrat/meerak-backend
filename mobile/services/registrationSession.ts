/** เก็บ draft สมัคร — localStorage หลัก (รอด Android kill app) + sessionStorage สำรอง */
import { normalizePhoneForApi } from "./phoneNormalize";

const REG_STORAGE_KEY = "aqond_registration_draft_v1";
const REG_SESSION_TTL_MS = 72 * 60 * 60 * 1000;

export type RegistrationDraft = {
  phone: string;
  firebaseUid: string;
  step: "details";
  savedAt: number;
};

function readRawDraft(): string | null {
  try {
    return (
      localStorage.getItem(REG_STORAGE_KEY) ||
      sessionStorage.getItem(REG_STORAGE_KEY)
    );
  } catch {
    return null;
  }
}

function writeRawDraft(json: string): void {
  try {
    localStorage.setItem(REG_STORAGE_KEY, json);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.setItem(REG_STORAGE_KEY, json);
  } catch {
    /* ignore */
  }
}

export function saveRegistrationDraft(input: {
  phone: string;
  firebaseUid: string;
}): void {
  const phone = normalizePhoneForApi(String(input.phone || ""));
  const firebaseUid = String(input.firebaseUid || "").trim();
  if (!phone || !firebaseUid) return;
  const draft: RegistrationDraft = {
    phone,
    firebaseUid,
    step: "details",
    savedAt: Date.now(),
  };
  writeRawDraft(JSON.stringify(draft));
}

export function loadRegistrationDraft(): RegistrationDraft | null {
  try {
    const raw = readRawDraft();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RegistrationDraft>;
    if (
      parsed?.step !== "details" ||
      !parsed.phone?.trim() ||
      !parsed.firebaseUid?.trim()
    ) {
      return null;
    }
    if (Date.now() - (parsed.savedAt || 0) > REG_SESSION_TTL_MS) {
      clearRegistrationDraft();
      return null;
    }
    return {
      phone: normalizePhoneForApi(parsed.phone),
      firebaseUid: parsed.firebaseUid.trim(),
      step: "details",
      savedAt: parsed.savedAt || Date.now(),
    };
  } catch {
    return null;
  }
}

export function clearRegistrationDraft(): void {
  try {
    localStorage.removeItem(REG_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(REG_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
