/**
 * Admin financial API client — เชื่อม Backend /api/admin/financial/*
 * ใช้ร่วมกับ hooks/useFinancialData และ RealTimeExpenses / MarketCapManager
 */
import { adminJsonRequest } from "./adminApi";

export interface JobGuaranteeEntry {
  id: string;
  job_id: string;
  job_title: string;
  amount: number;
  currency: string;
  status: string;
  employer_id: string | null;
  provider_id?: string | null;
  created_at?: string;
  released_at?: string;
  due_release_at?: string;
  note?: string;
  source?: string;
}

export interface JobGuaranteesResponse {
  entries: JobGuaranteeEntry[];
  total_held: number;
  total_released: number;
  total_claimed: number;
  liability_to_release: number;
  total_insurance_premium: number;
  auto_release_enabled: boolean;
  counts: {
    active: number;
    pending_release: number;
    released: number;
    claimed: number;
  };
}

export interface CommissionCategoryRow {
  category: string;
  total_commission: number;
  paid: number;
  pending: number;
  job_count: number;
}

export interface CommissionData {
  by_category: CommissionCategoryRow[];
  trend: Array<{ period: string; amount: number }>;
  total_commission: number;
  total_paid: number;
  total_pending: number;
}

export interface ExpenseItem {
  id: string;
  category: string;
  label: string;
  amount: number;
  budget?: number;
  cost_type: "fixed" | "variable";
  currency: string;
  updated_at: string;
}

export interface InvestorEntry {
  id: string;
  name: string;
  shares: number;
  invested_amount: number;
  invested_at: string;
  note?: string | null;
  decision_power_percent: number;
}

export interface MarketCapSnapshot {
  date: string;
  market_cap: number;
  total_shares: number;
}

export interface MarketCapData {
  current_market_cap: number;
  total_shares: number;
  share_value: number;
  investors: InvestorEntry[];
  growth: MarketCapSnapshot[];
}

export async function getJobGuarantees(): Promise<JobGuaranteesResponse> {
  return adminJsonRequest<JobGuaranteesResponse>("GET", "/api/admin/financial/job-guarantees");
}

export async function getCommissionData(): Promise<CommissionData> {
  return adminJsonRequest<CommissionData>("GET", "/api/admin/financial/commission");
}

export async function getRealTimeExpenses(region?: string): Promise<ExpenseItem[]> {
  const q =
    region && ["TH", "ID", "VN", "MY", "LA"].includes(region)
      ? `?region=${encodeURIComponent(region)}`
      : "";
  const res = await adminJsonRequest<{ expenses: ExpenseItem[] }>(
    "GET",
    `/api/admin/financial/expenses${q}`
  );
  return res.expenses || [];
}

export async function getMarketCapData(): Promise<MarketCapData> {
  return adminJsonRequest<MarketCapData>("GET", "/api/admin/financial/market-cap");
}

export interface RevenueFourBumpsResponse {
  currency: string;
  markup_payment_employer: number;
  handling_fee_from_job: number;
  commission_vip_tier: number;
  withdrawal_fees: number;
  total_platform_fee_components: number;
  mapping_note?: string;
}

export async function getRevenueFourBumps(): Promise<RevenueFourBumpsResponse> {
  return adminJsonRequest<RevenueFourBumpsResponse>(
    "GET",
    "/api/admin/financial/revenue-four-bumps"
  );
}

export interface CreateExpenseInput {
  category: string;
  label: string;
  amount: number;
  budget?: number | null;
  cost_type: "fixed" | "variable";
  currency: string;
  region?: string;
}

export async function createExpense(
  input: CreateExpenseInput
): Promise<{ expense: ExpenseItem }> {
  return adminJsonRequest<{ expense: ExpenseItem }>(
    "POST",
    "/api/admin/financial/expenses",
    input
  );
}

export async function updateExpense(
  id: string,
  patch: Partial<CreateExpenseInput>
): Promise<{ expense: ExpenseItem }> {
  return adminJsonRequest<{ expense: ExpenseItem }>(
    "PATCH",
    `/api/admin/financial/expenses/${encodeURIComponent(id)}`,
    patch
  );
}

export async function deleteExpense(id: string): Promise<void> {
  return adminJsonRequest<void>(
    "DELETE",
    `/api/admin/financial/expenses/${encodeURIComponent(id)}`
  );
}

export interface CreateInvestorInput {
  name: string;
  shares: number;
  invested_amount: number;
  invested_at: string;
  note?: string;
  decision_power_percent?: number;
}

export async function createInvestor(
  input: CreateInvestorInput
): Promise<{ investor: InvestorEntry }> {
  return adminJsonRequest<{ investor: InvestorEntry }>(
    "POST",
    "/api/admin/financial/investors",
    input
  );
}

export async function updateInvestor(
  id: string,
  patch: Partial<CreateInvestorInput>
): Promise<{ investor: InvestorEntry }> {
  return adminJsonRequest<{ investor: InvestorEntry }>(
    "PATCH",
    `/api/admin/financial/investors/${encodeURIComponent(id)}`,
    patch
  );
}

export async function deleteInvestor(id: string): Promise<void> {
  return adminJsonRequest<void>(
    "DELETE",
    `/api/admin/financial/investors/${encodeURIComponent(id)}`
  );
}

export async function updateMarketCap(
  market_cap: number
): Promise<{ current_market_cap: number; total_shares: number }> {
  return adminJsonRequest<{ current_market_cap: number; total_shares: number }>(
    "PATCH",
    "/api/admin/financial/market-cap",
    { market_cap }
  );
}
