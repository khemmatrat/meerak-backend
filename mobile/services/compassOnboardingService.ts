import { api } from "./api";

export type CompassGoal =
  | "use_services"
  | "shop"
  | "food"
  | "open_shop"
  | "provider_service"
  | "rider_delivery"
  | "ai_assist";

export type AcquisitionChannel =
  | "facebook"
  | "line"
  | "tiktok"
  | "friend"
  | "google"
  | "ads"
  | "other";

export interface CompassStep {
  id: string;
  label: string;
  done: boolean;
  href: string;
  minutes?: number;
}

export interface CompassStatus {
  found: boolean;
  surveyDone: boolean;
  compassMode: boolean;
  compassCompleted: boolean;
  primaryIntent?: string;
  acquisitionChannel?: string;
  userGoals?: CompassGoal[];
  kyc?: { status: string; submitted: boolean };
  onboardingStatus?: string;
  providerStatus?: string;
  m2Category?: string;
  categoryPackDone?: boolean;
  rider?: { registered: boolean; approved: boolean; status: string | null };
  steps: CompassStep[];
  nextAction: { id: string; label: string; href: string; minutes?: number };
  marketplaceHref?: string;
  progress?: { completed: number; total: number };
  allDone?: boolean;
}

function userId(): string | null {
  return typeof localStorage !== "undefined"
    ? localStorage.getItem("meerak_user_id")
    : null;
}

export async function fetchCompassStatus(): Promise<CompassStatus> {
  const uid = userId();
  if (!uid) {
    return {
      found: false,
      surveyDone: false,
      compassMode: false,
      compassCompleted: false,
      steps: [],
      nextAction: { id: "survey", label: "เริ่มต้น", href: "/onboarding/compass" },
    };
  }
  const { data } = await api.get<CompassStatus>("/onboarding/compass-status", {
    params: { userId: uid },
    timeout: 20000,
  });
  return data;
}

export async function submitCompassSurvey(payload: {
  acquisition_channel: AcquisitionChannel;
  user_goals: CompassGoal[];
  primary_intent?: string;
  referral_code?: string;
}): Promise<CompassStatus> {
  const uid = userId();
  if (!uid) throw new Error("กรุณาเข้าสู่ระบบก่อน");
  const { data } = await api.post<CompassStatus>(
    "/onboarding/compass-survey",
    { ...payload, userId: uid },
    { timeout: 20000 },
  );
  return data;
}

export async function saveCategoryPackFields(
  intent: string,
  fields: Record<string, string>,
): Promise<void> {
  const uid = userId();
  if (!uid) throw new Error("กรุณาเข้าสู่ระบบก่อน");
  await api.post(
    "/onboarding/compass-category-pack",
    { userId: uid, intent, fields },
    { timeout: 60000 },
  );
}

export async function fetchCompassKycPrefill(): Promise<{
  display_name: string;
  phone: string;
  email: string;
  bank_account: string;
  plate: string;
  vehicle: string;
} | null> {
  const uid = userId();
  if (!uid) return null;
  try {
    const { data } = await api.get("/onboarding/compass-kyc-prefill", {
      params: { userId: uid },
      timeout: 15000,
    });
    return data;
  } catch {
    return null;
  }
}

/** เปิด v2 ผ่าน mobile shell */
export function compassHrefToNavigate(href: string): string {
  if (href.startsWith("/storefront")) return href;
  if (href.startsWith("/m/")) return `/storefront?p=${encodeURIComponent(href)}`;
  return href;
}
