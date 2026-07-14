import { api } from "./api";

export type AdsObjective =
  | "VIDEO_VIEWS"
  | "STORY_VIEWS"
  | "MARKETPLACE_LEADS"
  | "PROFILE_VISITS"
  | "TRAFFIC";

export type AdsPackage = {
  key: string;
  budgetMicro: string;
  cpmMicro: string;
  label: string;
  budgetThb: number;
};

export type AdsCampaignRow = {
  id: string;
  title: string;
  lifecycleState: string;
  objective?: string;
  dailyBudgetMicro: string;
  totalBudgetMicro?: string;
  metadata?: Record<string, unknown>;
  advertiser?: string;
  creatives?: Array<{
    id: string;
    headline: string;
    moderationState: string;
    lifecycleState: string;
    metadata?: Record<string, unknown>;
  }>;
};

export type AdsCampaignInsights = {
  campaignId: string;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  spendMicro: string;
};

export type AdsCampaignInsightsV2 = AdsCampaignInsights & {
  range?: string;
  since?: string;
  periodImpressions?: number;
  periodClicks?: number;
  periodOutcomes?: number;
  periodCtr?: number;
  periodCvr?: number;
  dailySeries?: Array<{
    date: string;
    impressions: number;
    clicks: number;
    outcomes: number;
    spendMicro?: string;
    escrowRemainingMicro?: string;
    ctr: number;
    cvr: number;
  }>;
  surfaceBreakdown?: Record<string, number>;
  geoBreakdown?: Array<{ province: string; clicks: number }>;
  audienceEngagement?: Array<{ role: string; clicks: number }>;
  funnel?: {
    impressions: number;
    clicks: number;
    outcomes: number;
    impressionToClickRate: number;
    clickToOutcomeRate: number;
  };
  efficiency?: {
    costPerOutcomeThb: number;
    spendMicro: string;
    billingModel: string;
    outcomeCostMicro: string;
    projectedOutcomesRemaining: number | null;
  };
  escrow?: {
    escrowMicro: string;
    spentMicro: string;
    remainingMicro: string;
    status: string;
    billingModel: string;
    outcomeCostMicro: string;
  } | null;
  benchmark?: {
    medianCtr: number;
    medianCvr: number;
    sampleSize: number;
  };
  audienceEngagementV2?: {
    clickHeatmap: Array<{ hour: number; clicks: number }>;
    ageBuckets: Array<{ bucket: string; label: string; clicks: number }>;
    outcomesByKind: Array<{ conversion_kind: string; cnt: number }>;
  };
  cohortRetention?: {
    retentionRatePct: number;
    repeatOutcomeUsers: number;
    adAttributedConverters: number;
  };
};

export type AdsOutcomeRow = {
  id: string;
  campaign_id: string;
  conversion_kind: string;
  outcome_key: string;
  cost_micro: string;
  status?: string;
  dispute_reason?: string;
  created_at: string;
};

export type AdsOptimizationReport = {
  campaignId?: string;
  objective?: string | null;
  qualityScore: number;
  qualityLabel: string;
  recommendations: Array<{
    type: string;
    severity: string;
    title: string;
    message: string;
    autoPauseEligible?: boolean;
  }>;
  autoPause: {
    eligible: boolean;
    reason?: string;
    thresholdCvr?: number;
    benchmarkCvr?: number;
  };
  budgetRecommendation?: {
    addThb: number;
    projectedAdditionalOutcomes: number;
    maxOutcomeSlots: number;
    remainingEscrowThb: number;
    basis: string;
    disclaimer: string;
  } | null;
  alerts?: {
    lowCvrWarningAt: string | null;
    autoPausedAt: string | null;
    autoPausedReason: string | null;
  };
  abTestReady?: boolean;
  abTestNote?: string;
  variants?: Array<{
    variantKey: string;
    creativeId: string;
    impressions: number;
    qualityScore?: number;
  }>;
};

export type CreateCampaignPayload = {
  title: string;
  headline: string;
  body?: string;
  description?: string;
  objective: AdsObjective;
  package?: string;
  budgetMicro?: string;
  destinationUrl: string;
  allowedSurfaces?: string[];
  targetingRules?: Record<string, unknown>;
  scheduledStartAt?: string | null;
  scheduledEndAt?: string | null;
  contentKind?: string;
  contentId?: string;
  playbackUrl?: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  promotedProviderUserId?: string;
  metadata?: Record<string, unknown>;
};

export type AdsRolloutConfig = {
  stage: string;
  feedInjectionEnabled?: boolean;
  asyncTranscode?: boolean;
  betaAutoModerate?: boolean;
  betaMaxSpendThb?: number;
  internalMaxSpendThb?: number;
};

export const marketplaceAdsService = {
  async getPackages(): Promise<{
    packages: AdsPackage[];
    boostPackages: AdsPackage[];
    rollout?: AdsRolloutConfig;
  }> {
    const { data } = await api.get("/ads/packages");
    return data;
  },

  async listCampaigns(limit = 50): Promise<{ campaigns: AdsCampaignRow[]; configured?: boolean }> {
    const { data } = await api.get("/ads/campaigns", { params: { limit } });
    return data;
  },

  async getCampaign(id: string) {
    const { data } = await api.get(`/ads/campaigns/${encodeURIComponent(id)}`);
    return data;
  },

  async getInsights(id: string): Promise<AdsCampaignInsights> {
    const { data } = await api.get(`/ads/campaigns/${encodeURIComponent(id)}/insights`);
    return data;
  },

  async getInsightsV2(id: string, range = "7d"): Promise<AdsCampaignInsightsV2> {
    const { data } = await api.get(`/ads/campaigns/${encodeURIComponent(id)}/insights/v2`, {
      params: { range },
    });
    return data;
  },

  async compareCampaigns(ids: string[]) {
    const { data } = await api.get("/ads/campaigns/compare", {
      params: { ids: ids.join(",") },
    });
    return data as {
      campaigns: Array<
        AdsCampaignInsightsV2 & { compareFlags?: Record<string, boolean> }
      >;
      winners?: {
        ctr?: { value: number; campaignIds: string[] };
        cvr?: { value: number; campaignIds: string[] };
        outcomes?: { value: number; campaignIds: string[] };
        impressions?: { value: number; campaignIds: string[] };
        efficiency?: { value: number; campaignIds: string[] };
      } | null;
    };
  },

  async estimateAudience(provinces: string[], surfaces: string[]) {
    const { data } = await api.get("/ads/audience/estimate", {
      params: {
        provinces: provinces.join(","),
        surfaces: surfaces.join(","),
      },
    });
    return data as {
      estimatedWeeklyReach: number;
      estimatedWeeklyImpressions: number;
      addressableUsers: number;
      disclaimer: string;
    };
  },

  async createCampaign(payload: CreateCampaignPayload) {
    const { data } = await api.post("/ads/campaigns", payload, { timeout: 30000 });
    return data as {
      success: boolean;
      campaignId: string;
      creativeId: string;
      charged: number;
      ledgerId?: string;
      moderationState?: string;
      message?: string;
    };
  },

  async setLifecycle(campaignId: string, lifecycleState: "ACTIVE" | "PAUSED" | "ARCHIVED") {
    const { data } = await api.patch(`/ads/campaigns/${encodeURIComponent(campaignId)}/lifecycle`, {
      lifecycleState,
    });
    return data;
  },

  async listOutcomes(campaignId: string, limit = 50): Promise<{ outcomes: AdsOutcomeRow[] }> {
    const { data } = await api.get(`/ads/campaigns/${encodeURIComponent(campaignId)}/outcomes`, {
      params: { limit },
    });
    return data;
  },

  async disputeOutcome(outcomeId: string, reason: string) {
    const { data } = await api.post(`/ads/outcomes/${encodeURIComponent(outcomeId)}/dispute`, {
      reason,
    });
    return data as { success: boolean; outcome: AdsOutcomeRow };
  },

  async getOptimization(campaignId: string, range = "30d"): Promise<AdsOptimizationReport> {
    const { data } = await api.get(`/ads/campaigns/${encodeURIComponent(campaignId)}/optimization`, {
      params: { range },
    });
    return data;
  },

  async getRealtime(campaignId: string) {
    const { data } = await api.get(`/ads/campaigns/${encodeURIComponent(campaignId)}/realtime`);
    return data as {
      campaignId: string;
      impressions: number;
      clicks: number;
      outcomes: number;
      pollIntervalSec: number;
      polledAt: string;
    };
  },

  async exportCampaign(campaignId: string, range = "30d", format: "csv" | "json" = "csv") {
    const { data } = await api.get(`/ads/campaigns/${encodeURIComponent(campaignId)}/export`, {
      params: { range, format },
      responseType: format === "csv" ? "blob" : "json",
    });
    return data;
  },

  async registerVariant(
    campaignId: string,
    creativeId: string,
    variantKey = "B",
    metadata?: Record<string, unknown>,
    headline?: string,
  ) {
    const { data } = await api.post(`/ads/campaigns/${encodeURIComponent(campaignId)}/variants`, {
      creativeId: creativeId || undefined,
      variantKey,
      metadata,
      headline,
    });
    return data;
  },

  async previewAbSplit(campaignId: string, n = 40) {
    const { data } = await api.get(`/ads/campaigns/${encodeURIComponent(campaignId)}/variants/preview`, {
      params: { n },
    });
    return data as {
      simulations: number;
      distribution: Record<string, number>;
      abActive: boolean;
      variants: Array<{ variantKey: string; creativeId: string; impressions: number }>;
    };
  },

  async uploadCreative(file: File): Promise<{
    url: string;
    contentKind: string;
    playbackUrl?: string;
    imageUrl?: string;
    thumbnailUrl?: string;
    posterUrl?: string | null;
    processingStatus?: string;
    processingReason?: string | null;
    renderPreflightStatus?: string;
    renderPreflightReason?: string | null;
  }> {
    const fd = new FormData();
    fd.append("media", file);
    const { data } = await api.post("/ads/creative/upload", fd, {
      timeout: 300000,
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  },
};

export const ADS_OBJECTIVES: Array<{ value: AdsObjective; label: string; desc: string; surfaces: string }> = [
  { value: "TRAFFIC", label: "เพิ่มการเข้าชม", desc: "ดึงคนเข้าดูเนื้อหาและโปรไฟล์", surfaces: "Video Feed · Story · Marketplace" },
  { value: "VIDEO_VIEWS", label: "ยอดวิวคลิป", desc: "แสดงใน Video Feed", surfaces: "Video Feed" },
  { value: "STORY_VIEWS", label: "ยอดวิวสตอรี่", desc: "แสดงใน Story Viewer", surfaces: "Story" },
  {
    value: "MARKETPLACE_LEADS",
    label: "ลูกค้า Marketplace",
    desc: "ดึงลูกค้าเข้ารายการบริการ",
    surfaces: "Marketplace · ค้นหา (ยังไม่เชื่อม mobile)",
  },
  { value: "PROFILE_VISITS", label: "เข้าชมโปรไฟล์", desc: "เพิ่มผู้เข้าชมโปรไฟล์ผู้ให้บริการ", surfaces: "โปรไฟล์ผู้ให้บริการ" },
];

export const ADS_PACKAGES_UI = [
  { key: "starter", label: "Starter", budgetThb: 100, desc: "ทดลองยิง ads" },
  { key: "growth", label: "Growth", budgetThb: 300, desc: "ขยายกลุ่มเป้าหมาย" },
  { key: "pro", label: "Pro", budgetThb: 1000, desc: "แคมเปญเต็มรูปแบบ" },
];
