/**
 * Growth Engine client — storefront v2 (uses BFF proxy or direct backend in API routes)
 */

export const GROWTH_CAMPAIGNS = {
  TALENT_AI: 'talent_ai',
  MYSTERY_BOX: 'mystery_box',
} as const;

export type GrowthCampaign = (typeof GROWTH_CAMPAIGNS)[keyof typeof GROWTH_CAMPAIGNS];

export interface ReferralMilestone {
  target: number;
  qualified: number;
  unlocked: boolean;
  rewardGranted: boolean;
  progressPct: number;
}

export interface GrowthStatus {
  found: boolean;
  referralCode?: string | null;
  walletActivated?: boolean;
  entitlements?: {
    aiVideoCreditsRemaining: number;
    aiVideoLocked: boolean;
    mysteryVoucherUnlocked: boolean;
    mysteryVoucherClaimed: boolean;
    aqondPassPhase: number;
  };
  milestones?: Partial<Record<GrowthCampaign, ReferralMilestone>>;
  sharePath?: string | null;
}

export interface PersonalizedHomeHints {
  banner: { title: string; subtitle: string; href: string } | null;
  intents: Array<{ entity_type: string; entity_id: string; hits: number }>;
  temporal?: { dominant_intent?: string; open_count?: number } | null;
  dominantIntent?: string | null;
}

export interface Top10Merchant {
  rank: number;
  shopId: string;
  merchantName: string;
  score: number;
  promoJobId?: string | null;
  href: string;
}

export interface Top10MerchantsResponse {
  weekStart: string;
  merchants: Top10Merchant[];
}

async function growthFetch<T>(path: string, userId?: string, extraQuery?: Record<string, string>): Promise<T> {
  const q = new URLSearchParams();
  if (userId) q.set('userId', userId);
  if (extraQuery) {
    for (const [k, v] of Object.entries(extraQuery)) q.set(k, v);
  }
  const qs = q.toString();
  const res = await fetch(`/api/growth/${path}${qs ? `?${qs}` : ''}`, { cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `growth API ${res.status}`);
  }
  return data as T;
}

async function growthPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`/api/growth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `growth API ${res.status}`);
  }
  return data as T;
}

/** Server components / API routes — pass userId explicitly */
export async function getGrowthStatus(userId: string): Promise<GrowthStatus> {
  return growthFetch<GrowthStatus>('status', userId);
}

export async function syncReferralMilestones(userId: string): Promise<GrowthStatus> {
  return growthPost<GrowthStatus>('referral/sync', { userId });
}

export async function claimMysteryBoxVoucher(userId: string): Promise<{
  alreadyClaimed: boolean;
  voucher?: { type: string; value: number; label: string };
}> {
  return growthPost('mystery-box/claim', { userId });
}

export async function getTop10Merchants(): Promise<Top10MerchantsResponse> {
  return growthFetch<Top10MerchantsResponse>('merchants-top10');
}

export function buildReferralShareUrl(referralCode: string): string {
  const base =
    typeof window !== 'undefined'
      ? `${window.location.origin}`
      : 'https://aqond.com';
  return `${base}/m/register?ref=${encodeURIComponent(referralCode)}`;
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
  status: 'done' | 'current' | 'upcoming';
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

export async function getAqondPassStatus(userId: string): Promise<AqondPassStatus> {
  return growthFetch<AqondPassStatus>('aqond-pass', userId);
}

export async function activateAqondPass(userId: string): Promise<AqondPassStatus> {
  return growthPost<AqondPassStatus>('aqond-pass/activate', { userId });
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
  variant?: 'talent' | 'merchant';
  plan?: Pro799Plan;
  plans?: Pro799Plan[];
  hasActive799?: boolean;
  walletBalance?: number;
  canPayWithWallet?: boolean;
  exposure?: Upsell799Exposure;
  trialEnded?: boolean;
  entitlements?: {
    incubationWeek?: number;
    aqondPassPhase?: number;
    aiCreditsRemaining?: number;
  };
}

export async function getUpsell799Status(userId: string): Promise<Upsell799Status> {
  const q = new URLSearchParams({ userId });
  const res = await fetch(`/api/subscriptions/upsell-799?${q}`, { cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `upsell API ${res.status}`);
  return data as Upsell799Status;
}

export async function checkoutSubscription799(
  userId: string,
  planId: string,
): Promise<{ success: boolean; alreadyActive?: boolean; message?: string }> {
  const res = await fetch('/api/subscriptions/checkout-799', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, planId, payment_method: 'wallet' }),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `checkout API ${res.status}`);
  }
  return data;
}

export async function getPersonalizedHome(userId: string): Promise<PersonalizedHomeHints> {
  return growthFetch<PersonalizedHomeHints>('home-personalized', userId);
}

export async function getGrowthPlans() {
  return growthFetch<{ plans: unknown[]; campaigns: typeof GROWTH_CAMPAIGNS }>('plans');
}

export function mysteryBoxProgress(status: GrowthStatus): {
  qualified: number;
  target: number;
  unlocked: boolean;
} {
  const m = status.milestones?.[GROWTH_CAMPAIGNS.MYSTERY_BOX];
  return {
    qualified: m?.qualified ?? 0,
    target: m?.target ?? 10,
    unlocked: m?.unlocked ?? false,
  };
}

export function talentAiProgress(status: GrowthStatus): {
  qualified: number;
  target: number;
  unlocked: boolean;
  creditsRemaining: number;
} {
  const m = status.milestones?.[GROWTH_CAMPAIGNS.TALENT_AI];
  return {
    qualified: m?.qualified ?? 0,
    target: m?.target ?? 10,
    unlocked: m?.unlocked ?? false,
    creditsRemaining: status.entitlements?.aiVideoCreditsRemaining ?? 0,
  };
}
