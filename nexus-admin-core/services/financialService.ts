/**
 * Financial API services — เงินประกันงาน, ค่าคอมมิชชั่น, ค่าใช้จ่าย, Market Cap
 * เชื่อมกับ Backend จริงเมื่อมี VITE_ADMIN_API_URL และ Admin Login แล้ว (JWT จาก adminApi)
 * Backend: GET /api/admin/financial/job-guarantees | commission | expenses | market-cap
 */
import { getAdminToken } from "./adminApi";

const ADMIN_API_BASE =
  (typeof import.meta !== "undefined" &&
    (import.meta as any).env?.VITE_ADMIN_API_URL) ||
  "http://localhost:3001";

async function request<T>(path: string): Promise<T> {
  const token = getAdminToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${ADMIN_API_BASE}${path}`, { headers });
  if (!res.ok) throw new Error(res.statusText || `HTTP ${res.status}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// --- Job Guarantees ---
export interface JobGuaranteeEntry {
  id: string;
  job_id: string;
  job_title: string;
  amount: number;
  currency: string;
  status: string;
  employer_id: string;
  provider_id?: string;
  created_at: string;
  released_at?: string;
  due_release_at?: string;
  note?: string;
}

export interface JobGuaranteesResponse {
  entries: JobGuaranteeEntry[];
  total_held: number;
  total_released: number;
  total_claimed: number;
  liability_to_release: number;
}

export async function getJobGuarantees(): Promise<JobGuaranteesResponse> {
  if (!getAdminToken()) {
    return {
      entries: [],
      total_held: 0,
      total_released: 0,
      total_claimed: 0,
      liability_to_release: 0,
    };
  }
  try {
    return await request<JobGuaranteesResponse>(
      "/api/admin/financial/job-guarantees"
    );
  } catch {
    return {
      entries: [],
      total_held: 0,
      total_released: 0,
      total_claimed: 0,
      liability_to_release: 0,
    };
  }
}

// --- Commission ---
export interface CommissionByCategory {
  category: string;
  total_commission: number;
  paid: number;
  pending: number;
  job_count: number;
}

export interface CommissionData {
  by_category: CommissionByCategory[];
  trend: { period: string; amount: number }[];
  total_commission: number;
  total_paid: number;
  total_pending: number;
}

export async function getCommissionData(): Promise<CommissionData> {
  if (!getAdminToken()) {
    return {
      by_category: [],
      trend: [],
      total_commission: 0,
      total_paid: 0,
      total_pending: 0,
    };
  }
  try {
    return await request<CommissionData>("/api/admin/financial/commission");
  } catch {
    return {
      by_category: [],
      trend: [],
      total_commission: 0,
      total_paid: 0,
      total_pending: 0,
    };
  }
}

// --- Real-time Expenses ---
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

export async function getRealTimeExpenses(): Promise<ExpenseItem[]> {
  if (!getAdminToken()) return [];
  try {
    const res = await request<{ expenses: ExpenseItem[] }>(
      "/api/admin/financial/expenses"
    );
    return res?.expenses ?? [];
  } catch {
    return [];
  }
}

// --- Market Cap ---
export interface InvestorEntry {
  id: string;
  name: string;
  shares: number;
  invested_amount: number;
  invested_at: string;
  note?: string;
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

export async function getMarketCapData(): Promise<MarketCapData> {
  if (!getAdminToken()) {
    return {
      current_market_cap: 0,
      total_shares: 0,
      share_value: 0,
      investors: [],
      growth: [],
    };
  }
  try {
    return await request<MarketCapData>("/api/admin/financial/market-cap");
  } catch {
    return {
      current_market_cap: 0,
      total_shares: 0,
      share_value: 0,
      investors: [],
      growth: [],
    };
  }
}
