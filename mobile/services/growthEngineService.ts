import { api } from "./api";

export const GROWTH_CAMPAIGNS = {
  TALENT_AI: "talent_ai",
  MYSTERY_BOX: "mystery_box",
} as const;

export type GrowthCampaign =
  (typeof GROWTH_CAMPAIGNS)[keyof typeof GROWTH_CAMPAIGNS];

export interface ReferralMilestone {
  target: number;
  qualified: number;
  unlocked: boolean;
  rewardGranted: boolean;
  progressPct: number;
}

export interface GrowthStatus {
  found: boolean;
  userId?: string;
  referralCode?: string | null;
  walletActivated?: boolean;
  entitlements?: {
    aiVideoCreditsRemaining: number;
    aiVideoCreditsTotal: number;
    aiVideoLocked: boolean;
    mysteryVoucherUnlocked: boolean;
    mysteryVoucherClaimed: boolean;
    incubationStartedAt?: string | null;
    incubationWeek: number;
    aqondPassPhase: number;
    passExpiresAt?: string | null;
    lockedSubsidyCategory?: string | null;
  };
  milestones?: Partial<Record<GrowthCampaign, ReferralMilestone>>;
  subscriptions?: Array<{
    id: string;
    plan_id: string;
    status: string;
    name_th: string;
    price_thb: number;
  }>;
  sharePath?: string | null;
}

export interface IntentDwellEvent {
  entity_type: string;
  entity_id: string;
  dwell_ms: number;
  surface?: string;
}

export interface PersonalizedHomeHints {
  banner: { title: string; subtitle: string; href: string } | null;
  intents: Array<{ entity_type: string; entity_id: string; hits: number }>;
  temporal?: { dominant_intent?: string; open_count?: number } | null;
}

function userId(): string | null {
  return typeof localStorage !== "undefined"
    ? localStorage.getItem("meerak_user_id")
    : null;
}

export async function fetchGrowthStatus(): Promise<GrowthStatus> {
  const uid = userId();
  if (!uid) return { found: false };
  const { data } = await api.get<GrowthStatus>("/growth/status", {
    params: { userId: uid },
    timeout: 20000,
  });
  return data;
}

export async function syncReferralMilestones(): Promise<GrowthStatus> {
  const uid = userId();
  if (!uid) throw new Error("กรุณาเข้าสู่ระบบก่อน");
  const { data } = await api.post<GrowthStatus>(
    "/growth/referral/sync",
    { userId: uid },
    { timeout: 20000 },
  );
  return data;
}

export async function markGrowthWalletActivated(): Promise<GrowthStatus> {
  const uid = userId();
  if (!uid) throw new Error("กรุณาเข้าสู่ระบบก่อน");
  const { data } = await api.post<GrowthStatus>(
    "/growth/wallet-activated",
    { userId: uid },
    { timeout: 15000 },
  );
  return data;
}

export async function claimMysteryBoxVoucher(): Promise<{
  alreadyClaimed: boolean;
  voucher?: { type: string; value: number; label: string };
}> {
  const uid = userId();
  if (!uid) throw new Error("กรุณาเข้าสู่ระบบก่อน");
  const { data } = await api.post("/growth/mystery-box/claim", { userId: uid });
  return data;
}

export async function postIntentDwellEvents(
  events: IntentDwellEvent[],
): Promise<{ inserted: number }> {
  const uid = userId();
  if (!uid || events.length === 0) return { inserted: 0 };
  const { data } = await api.post<{ inserted: number }>("/intent/dwell", {
    userId: uid,
    events,
  });
  return data;
}

export async function recordGrowthAppOpen(dominantIntent?: string): Promise<void> {
  const uid = userId();
  if (!uid) return;
  await api.post("/growth/app-open", {
    userId: uid,
    dominant_intent: dominantIntent,
  });
}

export async function fetchPersonalizedHome(): Promise<PersonalizedHomeHints> {
  const uid = userId();
  if (!uid) return { banner: null, intents: [] };
  const { data } = await api.get<PersonalizedHomeHints>("/home/personalized", {
    params: { userId: uid, surface: "mobile_home" },
    timeout: 15000,
  });
  return data;
}

export async function fetchGrowthPlans(): Promise<{
  plans: Array<{
    id: string;
    name_th: string;
    price_thb: number;
    plan_type: string;
    features: string[];
  }>;
  campaigns: typeof GROWTH_CAMPAIGNS;
}> {
  const { data } = await api.get("/growth/plans", { timeout: 15000 });
  return data;
}

/** Build share URL for referral milestone campaigns */
export function buildReferralShareUrl(referralCode: string): string {
  const base =
    typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}`
      : "https://aqond.com";
  return `${base}#/register?ref=${encodeURIComponent(referralCode)}`;
}

export interface IncubationBrief {
  cta_th?: string;
  headline_th?: string;
  hook_th?: string;
  script_th?: string;
  hashtags?: string[];
  template_hint?: string;
  week_no?: number;
  source?: string;
}

export interface IncubationWeekRow {
  week_no: number;
  brief_text?: string | null;
  brief_generated_at?: string | null;
  raw_upload_url?: string | null;
  composed_url?: string | null;
  status?: string;
  updated_at?: string;
}

export interface IncubationStatus {
  found: boolean;
  active?: boolean;
  locked?: boolean;
  incubationStartedAt?: string | null;
  currentWeek?: number;
  totalWeeks?: number;
  daysRemaining?: number;
  weeks?: IncubationWeekRow[];
  templates?: Array<{
    id: string;
    nameTh: string;
    preview: { bar: string; text: string };
  }>;
}

export interface OverlayTemplate {
  id: string;
  nameTh: string;
  preview: { bar: string; text: string };
}

export async function fetchIncubationStatus(): Promise<IncubationStatus> {
  const uid = userId();
  if (!uid) return { found: false };
  const { data } = await api.get<IncubationStatus>("/growth/incubation/status", {
    params: { userId: uid },
    timeout: 20000,
  });
  return data;
}

export async function fetchIncubationBrief(weekNo?: number): Promise<{
  weekNo: number;
  brief: IncubationBrief;
  status?: string;
  composedUrl?: string | null;
  source?: string;
}> {
  const uid = userId();
  if (!uid) throw new Error("กรุณาเข้าสู่ระบบก่อน");
  const { data } = await api.get("/growth/incubation/brief", {
    params: { userId: uid, ...(weekNo ? { weekNo } : {}) },
    timeout: 45000,
  });
  return data;
}

const EXPECTED_OVERLAY_VERSION = 4;

export async function fetchIncubationOverlayVersion(): Promise<{
  overlayVersion?: number;
  overlayMode?: string;
}> {
  try {
    const { data } = await api.get("/growth/incubation/overlay-version", { timeout: 8000 });
    return data;
  } catch {
    return {};
  }
}

export { EXPECTED_OVERLAY_VERSION };

export async function uploadIncubationRawVideo(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<{
    url?: string;
    secure_url?: string;
    success?: boolean;
  }>("/upload/form", form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 120000,
  });
  const url = data.url || data.secure_url;
  if (!url) throw new Error("อัปโหลดวิดีโอไม่สำเร็จ");
  return url;
}

export async function composeIncubationClip(payload: {
  raw_upload_url: string;
  template_id: string;
  cta_th?: string;
  week_no?: number;
}): Promise<{
  weekNo: number;
  composedUrl: string;
  templateId: string;
  skippedOverlay?: boolean;
  skipReason?: string | null;
  overlayMeta?: { duration?: number; ctaStart?: number; ctaTailSec?: number; overlayMode?: string; overlayVersion?: number } | null;
  overlayVersion?: number;
}> {
  const uid = userId();
  if (!uid) throw new Error("กรุณาเข้าสู่ระบบก่อน");
  try {
    const { data } = await api.post("/growth/incubation/compose", {
      userId: uid,
      ...payload,
    }, { timeout: 180000 });
    return data;
  } catch (err: unknown) {
    const ax = err as { response?: { data?: { error?: string; code?: string } } };
    const msg = ax.response?.data?.error;
    const code = ax.response?.data?.code;
    if (code === "INCUBATION_LOCKED") {
      throw new Error("ยังไม่เข้าโปรแกรม Incubation — ปลดล็อก 10/10 ที่หน้าชวนเพื่อนก่อน");
    }
    throw new Error(msg || "ประกอบคลิปไม่สำเร็จ");
  }
}

export interface AqondPassHermesBrief {
  headline_th?: string;
  hook_th?: string;
  cta_href?: string;
  source?: string;
}

export interface AqondPassSubsidyCard {
  category: string;
  labelTh: string;
  discountPct: number;
  href: string;
  locked: boolean;
  phase: number;
}

export interface AqondPassTimelineItem {
  month: number;
  label: string;
  status: "done" | "current" | "upcoming";
}

export interface AqondPassStatus {
  found: boolean;
  active?: boolean;
  phase?: number;
  phaseLabel?: string;
  startedAt?: string | null;
  expiresAt?: string | null;
  daysRemaining?: number;
  lockedSubsidyCategory?: string | null;
  canActivate?: boolean;
  walletActivated?: boolean;
  hermesBrief?: AqondPassHermesBrief | null;
  subsidyCard?: AqondPassSubsidyCard | null;
  timeline?: AqondPassTimelineItem[];
  crossSell?: { primaryPct: number; bonusPct: number; message: string };
}

export async function fetchAqondPassStatus(): Promise<AqondPassStatus> {
  const uid = userId();
  if (!uid) return { found: false };
  const { data } = await api.get<AqondPassStatus>("/aqond-pass", {
    params: { userId: uid },
    timeout: 20000,
  });
  return data;
}

export async function activateAqondPass(): Promise<AqondPassStatus> {
  const uid = userId();
  if (!uid) throw new Error("กรุณาเข้าสู่ระบบก่อน");
  const { data } = await api.post<AqondPassStatus>("/aqond-pass/activate", {
    userId: uid,
  });
  return data;
}

export interface Pro799Plan {
  id: string;
  nameTh: string;
  priceThb: number;
  planType: string;
  features: string[];
}

export interface Upsell799Exposure {
  monthlyImpressions: number;
  revenuePotentialThb: number;
  label: string;
  message: string;
}

export interface Upsell799Status {
  found: boolean;
  variant?: "talent" | "merchant";
  plan?: Pro799Plan;
  plans?: Pro799Plan[];
  hasActive799?: boolean;
  walletBalance?: number;
  canPayWithWallet?: boolean;
  exposure?: Upsell799Exposure;
  trialEnded?: boolean;
}

export async function fetchUpsell799Status(): Promise<Upsell799Status> {
  const uid = userId();
  if (!uid) return { found: false };
  const { data } = await api.get<Upsell799Status>("/subscriptions/upsell-799", {
    params: { userId: uid },
    timeout: 20000,
  });
  return data;
}

export async function checkoutSubscription799(
  planId: string,
): Promise<{ success: boolean; message?: string }> {
  const uid = userId();
  if (!uid) throw new Error("กรุณาเข้าสู่ระบบก่อน");
  const { data } = await api.post("/subscriptions/checkout-799", {
    userId: uid,
    planId,
    payment_method: "wallet",
  });
  return data;
}

