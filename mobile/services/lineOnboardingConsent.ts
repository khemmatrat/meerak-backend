import axios from "axios";
import { getBackendBase } from "./api";

/**
 * LINE messaging consent for partner onboarding (Phase 3).
 * Consent is EXPLICIT: the backend rejects unless { consent: true } and requires a lineUserId,
 * and onboarding nudges are only sent via LINE after this consent is recorded.
 */

export type LineConsentResult = {
  success: boolean;
  connected?: boolean;
  error?: string;
};

/** Message types the user is consenting to receive via LINE. Keep in sync with the consent copy. */
export const LINE_MESSAGE_SCOPES = [
  "onboarding_nudge",
  "status_update",
] as const;

type LiffLike = {
  isLoggedIn?: () => boolean;
  login?: () => void;
  getProfile?: () => Promise<{ userId?: string }>;
};

/** Try to obtain the LINE userId from the LIFF SDK (available inside the LINE app / liff.html). */
export async function getLineUserId(): Promise<string | null> {
  try {
    const liff = (globalThis as unknown as { liff?: LiffLike }).liff;
    if (!liff?.getProfile) return null;
    if (liff.isLoggedIn && !liff.isLoggedIn()) {
      liff.login?.();
      return null;
    }
    const profile = await liff.getProfile();
    return profile?.userId || null;
  } catch {
    return null;
  }
}

export async function submitLineConsent(
  userId: string,
  lineUserId: string,
): Promise<LineConsentResult> {
  const base = getBackendBase().replace(/\/$/, "");
  const token =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("meerak_token")
      : null;
  try {
    const { data } = await axios.post<LineConsentResult>(
      `${base}/api/partner-onboarding/line-consent`,
      { userId, lineUserId, consent: true, scopes: LINE_MESSAGE_SCOPES },
      {
        timeout: 20000,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
    );
    return { success: data?.success !== false, connected: data?.connected };
  } catch {
    return { success: false, error: "network" };
  }
}

/** Opt out of onboarding nudges (all channels). Reuses the same backend endpoint. */
export async function setOnboardingNudgeOptOut(
  userId: string,
  optOut: boolean,
): Promise<{ success: boolean }> {
  const base = getBackendBase().replace(/\/$/, "");
  const token =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("meerak_token")
      : null;
  try {
    const { data } = await axios.post(
      `${base}/api/partner-onboarding/nudge/opt-out`,
      { userId, opt_out: optOut },
      {
        timeout: 20000,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
    );
    return { success: (data as { success?: boolean })?.success !== false };
  } catch {
    return { success: false };
  }
}
