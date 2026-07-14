const TOKEN_KEY = "ads_admin_token";
let _token: string | null = null;

declare const __ADS_ADMIN_API_BASE__: string;

/** Injected at build time by vite.config.ts — never rely on import.meta.env.PROD in source */
const API_BASE = __ADS_ADMIN_API_BASE__;

export function setAdsAdminToken(token: string | null) {
  _token = token;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function getAdsAdminToken(): string | null {
  if (_token) return _token;
  try {
    _token = localStorage.getItem(TOKEN_KEY);
  } catch {
    _token = null;
  }
  return _token;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const tok = getAdsAdminToken();
  if (tok) headers.Authorization = `Bearer ${tok}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      "API ตอบกลับไม่ถูกต้อง — ตรวจว่า build ชี้ไป https://api.aqond.com (ไม่ใช่ /api บน ads-admin.aqond.com)",
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
  if (data?.error && !data?.access_token) throw new Error(String(data.error));
  return data as T;
}

export type AdminLoginResponse = {
  access_token?: string;
  requires_totp?: boolean;
  mfa_token?: string;
  error?: string;
  user?: { id: string; email: string; role: string; name?: string };
};

export async function adsAdminLogin(email: string, password: string, totpCode?: string) {
  return request<AdminLoginResponse>("POST", "/api/auth/admin-login", {
    email,
    password,
    ...(totpCode ? { totp_code: totpCode } : {}),
  });
}

export async function adsAdminLoginTotp(mfaToken: string, totpCode: string) {
  return request<AdminLoginResponse>("POST", "/api/auth/admin-login/totp", {
    mfa_token: mfaToken,
    totp_code: totpCode,
  });
}

export async function fetchAdsAdminSession() {
  return request<{ user: { id: string; email: string; role: string; name?: string } }>(
    "GET",
    "/api/auth/admin-session",
  );
}

export async function getAdsAdminSummary(rangeDays = 7) {
  return request<{ configured: boolean; summary: AdsSummary | null }>(
    "GET",
    `/api/ads-admin/summary?rangeDays=${rangeDays}`,
  );
}

export async function listAdsAdminCampaigns(limit = 100) {
  return request<{ campaigns: AdsCampaign[]; configured?: boolean }>(
    "GET",
    `/api/ads-admin/campaigns?limit=${limit}`,
  );
}

export async function listPendingCreatives(limit = 50) {
  return request<{ creatives: PendingCreative[]; configured?: boolean }>(
    "GET",
    `/api/ads-admin/creatives/pending?limit=${limit}`,
  );
}

export async function moderateCreative(
  creativeId: string,
  moderationState: "APPROVED" | "REJECTED",
  moderationNote?: string,
  refund?: { refundUserId: string; refundAmountThb: number; originalLedgerId?: string },
) {
  return request("PATCH", `/api/ads-admin/creatives/${encodeURIComponent(creativeId)}/moderation`, {
    moderationState,
    moderationNote,
    ...refund,
  });
}

export async function patchCampaignLifecycle(campaignId: string, lifecycleState: string) {
  return request("PATCH", `/api/ads-admin/campaigns/${encodeURIComponent(campaignId)}/lifecycle`, {
    lifecycleState,
  });
}

export async function getBillingLedger(limit = 50) {
  return request<{ entries: BillingEntry[] }>("GET", `/api/ads-admin/billing/ledger?limit=${limit}`);
}

export async function getBillingReconciliation(rangeDays = 7) {
  return request<{ report: BillingReconciliationReport }>(
    "GET",
    `/api/ads-admin/billing/reconciliation?rangeDays=${rangeDays}`,
  );
}

export async function getFraudRecent(limit = 50) {
  return request<{ blocks: FraudBlock[] }>("GET", `/api/ads-admin/fraud/recent?limit=${limit}`);
}

export async function getScaleHealth() {
  return request<ScaleHealth>("GET", "/api/ads-admin/scale/health");
}

export async function listOutcomeAudit(limit = 50, status?: string) {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (status) qs.set("status", status);
  return request<{ outcomes: Array<{
    id: string;
    campaign_id: string;
    conversion_kind: string;
    outcome_key: string;
    cost_micro: string;
    status?: string;
    dispute_reason?: string;
    public_click_id?: string;
    created_at: string;
  }> }>("GET", `/api/ads-admin/outcomes?${qs}`);
}

export async function reverseOutcome(outcomeId: string, note?: string) {
  return request<{ reversed: boolean; outcomeId?: string; refundedMicro?: string }>(
    "POST",
    `/api/ads-admin/outcomes/${encodeURIComponent(outcomeId)}/reverse`,
    { note },
  );
}

export async function rejectOutcomeDispute(outcomeId: string, note?: string) {
  return request<{ rejected: boolean; outcome?: Record<string, unknown> }>(
    "POST",
    `/api/ads-admin/outcomes/${encodeURIComponent(outcomeId)}/reject`,
    { note },
  );
}

export async function getAdsPopulation(rangeDays = 7) {
  return request<AdsPopulationSummary>("GET", `/api/ads-admin/population?rangeDays=${rangeDays}`);
}

export async function getAdsBenchmarks(range = "30d") {
  return request<{ range: string; benchmarks: AdsBenchmarkRow[] }>(
    "GET",
    `/api/ads-admin/benchmarks?range=${encodeURIComponent(range)}`,
  );
}

export async function runAdsOptimization(dryRun = false) {
  return request<{
    ok: boolean;
    processed: number;
    warned: number;
    paused: number;
    results: Array<Record<string, unknown>>;
  }>("POST", "/api/ads-admin/optimization/run", { dryRun });
}

export async function getOptimizationLog(limit = 50) {
  return request<{ logs: OptimizationLogRow[] }>(
    "GET",
    `/api/ads-admin/optimization/log?limit=${limit}`,
  );
}

export async function seedHouseAds(platformOwnerUserId: string) {
  return request("POST", "/api/ads-admin/seed-house", { platformOwnerUserId });
}

export type AdsSummary = {
  activeCampaigns: number;
  houseCampaigns: number;
  paidCampaigns: number;
  impressions: number;
  clicks: number;
  ctr: number;
  spendMicro: string;
  spendThb: number;
  daily: Array<{ date: string; impressions: number; clicks: number; spendMicro: string; ctr: number }>;
  surfaceBreakdown: Record<string, number>;
  topCampaigns: Array<{
    id: string;
    title: string;
    advertiser: string;
    lifecycleState: string;
    isHouse: boolean;
    impressions: number;
    clicks: number;
    ctr: number;
  }>;
};

export type AdsCampaign = {
  id: string;
  title: string;
  lifecycleState: string;
  objective?: string;
  dailyBudgetMicro: string;
  advertiser?: string;
  metadata?: Record<string, unknown>;
};

export type PendingCreative = {
  id: string;
  headline: string;
  body: string;
  moderationState: string;
  destinationUrl: string;
  campaignId: string;
  campaignTitle: string;
  advertiser: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type BillingEntry = {
  id: string;
  event_type: string;
  amount: string;
  user_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type BillingReconciliationReport = {
  rangeDays: number;
  walletByEvent: Array<{ event_type: string; cnt: number; total_thb: string }>;
  walletSpendThb: number;
  walletSpendCampaigns: number;
  refundThb: number;
  refundCount: number;
  billableDeliveryEvents: number;
  failedRenderEvents: number;
  note: string;
};

export type FraudBlock = {
  reason?: string;
  score?: number;
  publicImpressionId?: string;
  userId?: string;
  sessionId?: string;
  ip?: string;
  at?: string;
};

export type ScaleHealth = {
  rollout: {
    stage: string;
    feedInjectionEnabled: boolean;
    asyncTranscode: boolean;
    internalMaxSpendThb: number;
    betaMaxSpendThb: number;
    dailyReconEnabled: boolean;
    cdnBaseUrl: string | null;
  };
  circuit: {
    state: string;
    failures: number;
    openUntil: number | null;
  };
  outbox: { pending: number; dispatched: number; total: number; tableMissing?: boolean };
  scheduler: {
    dailyReconEnabled: boolean;
    optimizationEnabled?: boolean;
    warehouseEnabled?: boolean;
    escrowExpiryEnabled?: boolean;
    lastReconAt: string | null;
    alive: boolean;
  };
  lastRecon?: { at: string; report: BillingReconciliationReport } | null;
};

export type AdsPopulationSummary = {
  rangeDays: number;
  totalUsers: number;
  adEligibleDau: number;
  engagedUsers: number;
  engagementRatePct: number;
  usersByProvince: Array<{ province: string; users: number }>;
  clicksBySurface: Array<{ surface: string; clicks: number; clickers: number }>;
  outcomesByKind: Array<{ conversion_kind: string; cnt: number }>;
  outcomesByStatus: Array<{ status: string; cnt: number }>;
  openDisputes: number;
  engagementByProvince: Array<{
    province: string;
    clicks: number;
    clickers: number;
    users: number;
    engagementPct: number;
  }>;
  fillRateByProvince: Array<{
    province: string;
    adEligibleDau: number;
    impressions: number;
    fillRatePct: number;
  }>;
};

export type AdsBenchmarkRow = {
  objective: string;
  medianCtr: number;
  medianCvr: number;
  sampleSize: number;
};

export type OptimizationLogRow = {
  id: string;
  campaign_id: string;
  action: string;
  reason?: string;
  metrics: Record<string, unknown>;
  created_at: string;
};
