/**
 * กฎ Brand Adviser จาก payout_config — sync กับแอดมิน (Financial Control)
 */
import { api } from "./api";

export type BrandAdviserRules = {
  program_enabled: boolean;
  inactivity_days: number;
  warn_days_before_suspend: number;
  admin_alert_days_before_suspend: number;
  activity_requires_closed_job: boolean;
  referral_reputation_multiplier: number;
};

export type BrandAdviserRulesApiResponse = {
  rules: BrandAdviserRules;
  help?: Record<string, string>;
};

let cached: { data: BrandAdviserRulesApiResponse; at: number } | null = null;
const TTL_MS = 120_000;

export async function fetchBrandAdviserRules(options?: { force?: boolean }): Promise<BrandAdviserRulesApiResponse> {
  if (!options?.force && cached && Date.now() - cached.at < TTL_MS) {
    return cached.data;
  }
  const { data } = await api.get<BrandAdviserRulesApiResponse>("/app/brand-adviser-rules");
  cached = { data, at: Date.now() };
  return data;
}

export function clearBrandAdviserRulesCache() {
  cached = null;
}
