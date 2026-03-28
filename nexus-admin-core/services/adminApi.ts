/**
 * Phase 4: Admin dashboard API client.
 * All requests use JWT (Bearer). No admin API without authentication.
 * Production: hardcode https://api.aqond.com เพื่อไม่ให้ build พลาด (เคยเกิด request ไป admin.aqond.com แทน)
 */
const PRODUCTION_API = "https://api.aqond.com";
export const ADMIN_API_BASE =
  typeof import.meta !== "undefined" && (import.meta as any).env?.DEV
    ? "" // ใช้ proxy ในโหมด dev
    : PRODUCTION_API;

const ADMIN_TOKEN_KEY = "nexus_admin_token";

function getStoredToken(): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(ADMIN_TOKEN_KEY) : null;
  } catch {
    return null;
  }
}

let _token: string | null = getStoredToken();

export function setAdminToken(token: string | null): void {
  _token = token;
  try {
    if (typeof localStorage !== "undefined") {
      if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
      else localStorage.removeItem(ADMIN_TOKEN_KEY);
    }
  } catch {}
}

export function getAdminToken(): string | null {
  if (_token) return _token;
  const stored = getStoredToken();
  if (stored) {
    _token = stored;
    return stored;
  }
  return null;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options?: { signal?: AbortSignal; timeoutMs?: number }
): Promise<T> {
  const url = path.startsWith("http") ? path : `${ADMIN_API_BASE}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (_token) headers["Authorization"] = `Bearer ${_token}`;

  const timeoutMs = options?.timeoutMs ?? 0;
  const controller = timeoutMs > 0 ? new AbortController() : null;
  const timeoutId = controller && timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: options?.signal ?? controller?.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      let err: { error?: string; details?: string } = {};
      try {
        if (text.startsWith("{")) err = JSON.parse(text);
        else if (text.startsWith("<")) err = { error: `Server returned HTML (${res.status}). Check API URL.` };
        else err = { error: text.slice(0, 200) };
      } catch {
        err = { error: res.statusText || `HTTP ${res.status}` };
      }
      const msg = err.details ? `${err.error || res.statusText}: ${err.details}` : (err.error || res.statusText || `HTTP ${res.status}`);
      const e = new Error(msg) as Error & { status?: number };
      e.status = res.status;
      throw e;
    }
    if (res.status === 204) return undefined as T;
    if (text.startsWith("<")) {
      throw new Error(
        "API returned HTML instead of JSON. Check that VITE_ADMIN_API_URL points to https://api.aqond.com and the backend is running."
      );
    }
    if (!text || !text.trim()) {
      throw new Error(
        `API returned empty response (status ${res.status}). URL: ${url}. Check CORS allows Origin from admin.`
      );
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      const preview = text.length > 100 ? text.slice(0, 100) + "..." : text;
      const hint = url.startsWith("http") && !url.includes("api.aqond.com")
        ? " (ควรเป็น https://api.aqond.com — rebuild Admin ด้วย VITE_ADMIN_API_URL=https://api.aqond.com)"
        : "";
      throw new Error(
        `Server returned invalid JSON. URL: ${url} | Status: ${res.status} | Response: ${preview.replace(/\n/g, " ")}${hint}`
      );
    }
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export interface AdminLoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: { id: string; email: string; name: string; role: string };
}

export function adminLogin(
  email: string,
  password: string
): Promise<AdminLoginResponse> {
  return request<AdminLoginResponse>("POST", "/api/auth/admin-login", {
    email,
    password,
  });
}

// Job Operations
export interface JobOperationsStats {
  total_posts_today: number;
  total_accepted_today: number;
  queue_backlog: number;
  failed_transactions_today: number;
  failed_transactions_total: number;
  date: string;
}

export function getJobOperationsStats(): Promise<JobOperationsStats> {
  return request<JobOperationsStats>("GET", "/api/admin/job-operations/stats");
}

export interface JobQueueBacklogItem {
  id: string;
  title: string;
  category: string;
  subcategory: string | null;
  budget: number | { min: number; max: number } | null;
  job_type: string;
  transport_job_kind: string | null;
  created_at: string | null;
}

export function getJobOperationsQueueBacklog(params?: {
  job_type?: string;
  limit?: number;
}): Promise<{ items: JobQueueBacklogItem[]; total: number }> {
  const q = new URLSearchParams();
  if (params?.job_type) q.set("job_type", params.job_type);
  if (params?.limit != null) q.set("limit", String(params.limit));
  const qs = q.toString();
  return request<{ items: JobQueueBacklogItem[]; total: number }>(
    "GET",
    `/api/admin/job-operations/queue-backlog${qs ? `?${qs}` : ""}`
  );
}

// Dashboard Overview (รวมข้อมูลจริงจาก Backend)
export type DashboardRange = 'today' | 'week' | 'month';

export interface DashboardOverviewResponse {
  total_users: number;
  total_revenue: number;
  total_revenue_month: number;
  posts_today: number;
  accepted_today: number;
  queue_backlog: number;
  failed_transactions_today: number;
  revenue_this_week: number;
  revenue_previous_week: number;
  server_load_percent: number;
  uptime_seconds: number;
  chart_data: Array<{ name: string; users: number; revenue: number; sessions: number }>;
  recent_logs: Array<{ id: string; timestamp: string; level: string; message: string; source: string; ip?: string }>;
  from_date: string;
  to_date: string;
  range: string;
}

export function getDashboardOverview(range?: DashboardRange): Promise<DashboardOverviewResponse> {
  const q = range ? `?range=${range}` : '';
  return request<DashboardOverviewResponse>("GET", "/api/admin/dashboard/overview" + q);
}

export function getStabilityFund(): Promise<{
  total_reserve_cash: number;
  projected_monthly_interest: number;
  annual_rate_percent: number;
}> {
  return request("GET", "/api/admin/stability-fund");
}

export function runMaturityRewardsCheck(): Promise<{ success: boolean; message: string }> {
  return request("POST", "/api/admin/maturity-rewards/run");
}

// AI Dashboard Insight — Backend ดึงและสรุปข้อมูลจาก DB เอง (Token Optimization)
export function fetchDashboardInsight(): Promise<{ insight: string }> {
  return request<{ insight: string }>("POST", "/api/admin/ai/dashboard-insight", {});
}

// Circuit Breakers
export interface CircuitBreakersStatusResponse {
  circuit_breakers: Record<string, string>;
  redis_available: boolean;
}

export function getCircuitBreakersStatus(): Promise<CircuitBreakersStatusResponse> {
  return request<CircuitBreakersStatusResponse>("GET", "/api/admin/circuit-breakers/status");
}

export function tripCircuitBreaker(service: string): Promise<{ service: string; status: string }> {
  return request("POST", "/api/admin/circuit-breakers/trip", { service });
}

export function resetCircuitBreaker(service: string): Promise<{ service: string; status: string }> {
  return request("POST", "/api/admin/circuit-breakers/reset", { service });
}

// Worker Queues (ค่าจริงจาก DB)
export interface WorkerQueueItem {
  name: string;
  displayName: string;
  pendingJobs: number;
  activeJobs: number;
  completedPerMin: number;
  failedRate: number;
  status: 'OPERATIONAL' | 'CONGESTED' | 'STALLED';
  description: string;
  isBull?: boolean;
}

export interface WorkerQueuesResponse {
  queues: WorkerQueueItem[];
  scaleConfig: Record<string, number>;
  pausedState?: Record<string, boolean>;
  alerts?: Array<{ queue: string; type: string; message?: string }>;
  timestamp: string;
}

export interface WorkerQueueMetricsResponse {
  daily: Array<{ date: string; jobsCompleted: number; payoutsProcessed: number; paymentFailed: number }>;
  days: number;
}

export interface WorkerQueueAlertsResponse {
  alerts: Array<{ queue: string; type: string; count?: number }>;
  thresholds: { congested: number; stalled: number };
}

export function getWorkerQueues(): Promise<WorkerQueuesResponse> {
  return request("GET", "/api/admin/worker-queues", undefined, { timeoutMs: 15000 });
}

export function scaleWorkerQueue(
  name: string,
  workers: number
): Promise<{ queue: string; desiredWorkers: number; message: string }> {
  return request("POST", `/api/admin/worker-queues/${encodeURIComponent(name)}/scale`, { workers });
}

export function verifyWorkerQueue(
  name: string
): Promise<{ queue: string; action: string; failedCount?: number; pendingCount?: number; hint?: string; message?: string }> {
  return request("POST", `/api/admin/worker-queues/${encodeURIComponent(name)}/verify`, {});
}

export function pauseWorkerQueue(name: string): Promise<{ queue: string; paused: boolean }> {
  return request("POST", `/api/admin/worker-queues/${encodeURIComponent(name)}/pause`, {});
}

export function resumeWorkerQueue(name: string): Promise<{ queue: string; paused: boolean }> {
  return request("POST", `/api/admin/worker-queues/${encodeURIComponent(name)}/resume`, {});
}

export function retryPaymentFailed(body?: { ledger_id?: string; limit?: number }): Promise<{ added: number; total: number; message: string }> {
  return request("POST", "/api/admin/worker-queues/payment-failed/retry", body || {});
}

export function getWorkerQueueMetrics(days?: number): Promise<WorkerQueueMetricsResponse> {
  const q = days != null ? `?days=${days}` : "";
  return request("GET", "/api/admin/worker-queues/metrics" + q, undefined, { timeoutMs: 15000 });
}

export function getWorkerQueueAlerts(): Promise<WorkerQueueAlertsResponse> {
  return request("GET", "/api/admin/worker-queues/alerts", undefined, { timeoutMs: 15000 });
}

export function setWorkerQueueAlertThresholds(body: { congested?: number; stalled?: number }): Promise<{ thresholds: { congested: number; stalled: number } }> {
  return request("POST", "/api/admin/worker-queues/alerts/thresholds", body);
}

// Staff & Access Control
export interface StaffMember {
  id: string;
  full_name: string;
  email: string;
  role: "super_admin" | "moderator" | "support";
  department: string;
  status: "active" | "inactive";
  last_login: string | null;
  permissions: string[];
}

export interface StaffResponse {
  staff: StaffMember[];
}

export function getStaff(search?: string): Promise<StaffResponse> {
  const sp = new URLSearchParams();
  if (search) sp.set("search", search);
  const q = sp.toString();
  return request<StaffResponse>("GET", "/api/admin/staff" + (q ? "?" + q : ""));
}

export function createStaff(data: {
  full_name: string;
  email: string;
  role?: "super_admin" | "moderator" | "support";
  department?: string;
  /** Required when role=super_admin — สร้าง users+user_roles เพื่อให้ล็อกอิน Admin ได้ */
  password?: string;
}): Promise<StaffMember> {
  return request<StaffMember>("POST", "/api/admin/staff", data);
}

export function updateStaffStatus(
  id: string,
  status: "active" | "inactive"
): Promise<{ id: string; status: string }> {
  return request("PATCH", `/api/admin/staff/${encodeURIComponent(id)}/status`, { status });
}

export function updateStaffPermissions(
  id: string,
  permissions: string[]
): Promise<{ id: string; permissions: string[] }> {
  return request("PATCH", `/api/admin/staff/${encodeURIComponent(id)}/permissions`, { permissions });
}

export interface AdminUserRow {
  id: string;
  email: string;
  phone?: string;
  full_name?: string;
  kyc_status?: string;
  account_status?: string;
  created_at: string;
  last_login_at?: string;
  role: string;
  is_vip?: boolean;
  /** Brand Adviser (migration 135 + backend) */
  is_brand_adviser?: boolean;
  adviser_status?: string | null;
  adviser_reputation_score?: number;
  adviser_public_slug?: string | null;
  adviser_public_profile_enabled?: boolean;
  adviser_granted_at?: string | null;
  adviser_suspended_at?: string | null;
  adviser_suspended_reason?: string | null;
}

export interface AdminUsersResponse {
  users: AdminUserRow[];
  pagination: { limit: number; offset: number; total: number };
}

export function getAdminUsers(params?: {
  search?: string;
  limit?: number;
  offset?: number;
  role?: string;
  status?: string;
  kyc_status?: string;
  vip?: boolean;
}): Promise<AdminUsersResponse> {
  const sp = new URLSearchParams();
  if (params?.search) sp.set("search", params.search);
  if (params?.limit != null) sp.set("limit", String(params.limit));
  if (params?.offset != null) sp.set("offset", String(params.offset));
  if (params?.role) sp.set("role", params.role);
  if (params?.status) sp.set("status", params.status);
  if (params?.kyc_status) sp.set("kyc_status", params.kyc_status);
  if (params?.vip === true) sp.set("vip", "1");
  const q = sp.toString();
  return request<AdminUsersResponse>(
    "GET",
    "/api/admin/users" + (q ? "?" + q : "")
  );
}

export interface AdminUserDetail {
  user: AdminUserRow & {
    kyc_level?: string;
    kyc_rejection_reason?: string;
    updated_at?: string;
    wallet_balance?: number;
  };
}

export function getAdminUser(id: string): Promise<AdminUserDetail> {
  return request<AdminUserDetail>(
    "GET",
    `/api/admin/users/${encodeURIComponent(id)}`
  );
}

export function updateAdminUserRole(
  id: string,
  role: "USER" | "ADMIN" | "AUDITOR",
  reason?: string
): Promise<{ success: boolean; user_id: string; role: string }> {
  return request("PATCH", `/api/admin/users/${encodeURIComponent(id)}/role`, {
    role,
    reason,
  });
}

// Account Control (ADMIN only; audit)
export function suspendAdminUser(
  id: string,
  reason?: string
): Promise<{ success: boolean; user_id: string; account_status: string }> {
  return request("POST", `/api/admin/users/${encodeURIComponent(id)}/suspend`, {
    reason,
  });
}
export function banAdminUser(
  id: string,
  reason?: string,
  banDays?: number
): Promise<{ success: boolean; user_id: string; account_status: string; banned_until?: string | null }> {
  return request("POST", `/api/admin/users/${encodeURIComponent(id)}/ban`, {
    reason: reason || "Banned by admin",
    ban_days: banDays,
  });
}
export function reactivateAdminUser(
  id: string,
  reason?: string
): Promise<{ success: boolean; user_id: string; account_status: string }> {
  return request(
    "POST",
    `/api/admin/users/${encodeURIComponent(id)}/reactivate`,
    { reason }
  );
}

/** Brand Adviser — มอบสิทธิ์ (ADMIN only) */
export function grantBrandAdviserAdminUser(
  id: string,
  reason?: string
): Promise<{ success: boolean; user_id: string; is_brand_adviser: boolean; adviser_status: string | null }> {
  return request("POST", `/api/admin/users/${encodeURIComponent(id)}/brand-adviser/grant`, {
    reason: reason || undefined,
  });
}

/** Brand Adviser — ถอดสิทธิ์ (ADMIN only) */
export function revokeBrandAdviserAdminUser(
  id: string,
  reason?: string
): Promise<{ success: boolean; user_id: string; is_brand_adviser: boolean; adviser_status: string | null }> {
  return request("POST", `/api/admin/users/${encodeURIComponent(id)}/brand-adviser/revoke`, {
    reason: reason || undefined,
  });
}

/** PATCH /api/admin/users/:id/wallet-freeze — ระงับเงิน (Platform Safety Authority) */
export function walletFreezeAdminUser(
  id: string,
  frozen: boolean
): Promise<{ success: boolean; user_id: string; wallet_frozen: boolean }> {
  return request("PATCH", `/api/admin/users/${encodeURIComponent(id)}/wallet-freeze`, {
    frozen,
  });
}
export function forceLogoutAdminUser(
  id: string,
  reason?: string
): Promise<{ success: boolean; user_id: string; message?: string }> {
  return request(
    "POST",
    `/api/admin/users/${encodeURIComponent(id)}/force-logout`,
    { reason }
  );
}

/** Emergency Kill Switch: Ban + wallet_frozen + force_logout */
export function emergencySuspendUser(
  id: string,
  reason?: string
): Promise<{ success: boolean; user_id: string; account_status: string; wallet_frozen: boolean }> {
  return request("POST", `/api/admin/users/${encodeURIComponent(id)}/emergency-suspend`, { reason });
}

/** Admin Ghost: generate short-lived impersonation token */
export function createImpersonationToken(
  userId: string,
  expiresMinutes?: number
): Promise<{ success: boolean; token: string; expires_minutes: number; expires_at: string }> {
  return request("POST", `/api/admin/users/${encodeURIComponent(userId)}/impersonate-token`, {
    expires_minutes: expiresMinutes ?? 15,
  });
}

/** Last N login sessions (IP + User-Agent) */
export function getAdminUserLoginSessions(
  userId: string,
  limit?: number
): Promise<{
  sessions: Array<{ id: string; ip_address: string | null; user_agent: string; created_at: string | null }>;
  device_hopping_24h: boolean;
}> {
  const sp = new URLSearchParams();
  if (limit != null) sp.set("limit", String(limit));
  const q = sp.toString();
  return request(
    "GET",
    `/api/admin/users/${encodeURIComponent(userId)}/login-sessions` + (q ? "?" + q : "")
  );
}

/** CRM notes */
export function getAdminUserNotes(
  userId: string
): Promise<{ notes: Array<{ id: string; admin_id: string; admin_name: string; note: string; created_at: string | null }> }> {
  return request("GET", `/api/admin/users/${encodeURIComponent(userId)}/admin-notes`);
}

export function addAdminUserNote(
  userId: string,
  note: string
): Promise<{ success: boolean; id: string; created_at: string | null }> {
  return request("POST", `/api/admin/users/${encodeURIComponent(userId)}/admin-notes`, { note });
}

/** LMS summary (avg_grade, training_status) */
export function getAdminUserLmsSummary(
  userId: string
): Promise<{
  avg_grade: number | null;
  training_status: string;
  passed_modules: number[];
  assignment_pending: number;
  assignment_passed: number;
}> {
  return request("GET", `/api/admin/users/${encodeURIComponent(userId)}/lms-summary`);
}

/** Manual wallet Credit/Debit with audit */
export function adminWalletAdjust(
  userId: string,
  direction: "credit" | "debit",
  amount: number,
  reason: string
): Promise<{ success: boolean; user_id: string; direction: string; amount: number; balance_after: number }> {
  return request("POST", `/api/admin/users/${encodeURIComponent(userId)}/wallet-adjust`, {
    direction,
    amount,
    reason,
  });
}

// App role (user / provider) — เปลี่ยนจากผู้รับงานเป็น user หรือกลับกัน
export function updateAdminUserAppRole(
  id: string,
  role: "user" | "provider"
): Promise<{ success: boolean; user_id: string; role: string }> {
  return request("PATCH", `/api/admin/users/${encodeURIComponent(id)}/app-role`, { role });
}

// อนุญาติให้เป็น Provider (แก้บั๊กที่ทำแบบทดสอบผ่านแต่สถานะไม่ขึ้น)
export function approveUserAsProvider(
  id: string
): Promise<{ success: boolean; user_id: string; provider_status: string }> {
  return request("POST", `/api/admin/users/${encodeURIComponent(id)}/approve-provider`, {});
}

// ตั้ง/ยกเลิก VIP
export function setUserVip(
  id: string,
  isVip: boolean
): Promise<{ success: boolean; user_id: string; is_vip: boolean }> {
  return request("PATCH", `/api/admin/users/${encodeURIComponent(id)}/vip`, { is_vip: isVip });
}

// User ledger (read-only, last N entries)
export interface AdminUserLedgerEntry {
  id: number;
  event_type: string;
  direction: string;
  amount: number;
  currency: string;
  description: string;
  created_at?: string;
  balance_after?: number;
}
export function getAdminUserLedger(
  userId: string,
  limit?: number
): Promise<{
  entries: AdminUserLedgerEntry[];
  total_credit?: number;
  total_debit?: number;
}> {
  const sp = new URLSearchParams();
  if (limit != null) sp.set("limit", String(limit));
  const q = sp.toString();
  return request(
    "GET",
    `/api/admin/users/${encodeURIComponent(userId)}/ledger` + (q ? "?" + q : "")
  );
}

// Phase 4B: KYC Review
export interface KycSubmissionRow {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  kyc_status: string;
  kyc_level: string | null;
  created_at: string;
  doc_count: string;
  pending_docs: string;
}

export interface KycListResponse {
  submissions: KycSubmissionRow[];
  pagination: { limit: number; offset: number; total: number };
}

export function getKycSubmissions(params?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<KycListResponse> {
  const sp = new URLSearchParams();
  if (params?.status) sp.set("status", params.status);
  if (params?.limit != null) sp.set("limit", String(params.limit));
  if (params?.offset != null) sp.set("offset", String(params.offset));
  const q = sp.toString();
  return request<KycListResponse>("GET", "/api/admin/kyc" + (q ? "?" + q : ""));
}

export interface KycDetailResponse {
  user: Record<string, unknown>;
  documents: Array<Record<string, unknown>>;
}

export function getKycDetail(userId: string): Promise<KycDetailResponse> {
  return request<KycDetailResponse>(
    "GET",
    `/api/admin/kyc/${encodeURIComponent(userId)}`
  );
}

// User Payout Requests (อนุมัติ/ปฏิเสธคำขอถอน)
export interface AdminPayoutRow {
  id: string;
  user_id: string;
  user_name: string | null;
  user_phone: string | null;
  user_email: string | null;
  amount: number;
  bank_details: Record<string, unknown>;
  status: string;
  admin_notes: string | null;
  transaction_id: string | null;
  created_at: string | null;
  processed_at: string | null;
  processed_by: string | null;
  membership_tier?: string;
  kyc_status?: string;
  rating?: number;
}

export interface AdminPayoutsResponse {
  payouts: AdminPayoutRow[];
}

export interface OmiseBalanceResponse {
  available: number;
  pending: number;
  total: number;
  currency: string;
  total_pending_payouts: number;
  safety_gap: number;
  error?: string;
}

export function getAdminPayouts(params?: { status?: string; limit?: number }): Promise<AdminPayoutsResponse> {
  const sp = new URLSearchParams();
  if (params?.status) sp.set("status", params.status);
  if (params?.limit != null) sp.set("limit", String(params.limit));
  const q = sp.toString();
  return request<AdminPayoutsResponse>("GET", "/api/admin/payouts" + (q ? "?" + q : ""));
}

export function patchAdminPayout(
  id: string,
  body: { status: "approved" | "rejected"; admin_notes?: string; transaction_id?: string }
): Promise<{ success: boolean; message: string; payout: { id: string; status: string; processed_at: string | null; transaction_id: string | null; admin_notes: string | null } | null }> {
  return request("PATCH", `/api/admin/payouts/${encodeURIComponent(id)}`, body);
}

export function getOmiseBalance(): Promise<OmiseBalanceResponse> {
  return request<OmiseBalanceResponse>("GET", "/api/admin/omise/balance");
}

export interface PayoutStatsResponse {
  pending_release_jobs: number;
  pending_payout_count: number;
  pending_payout_total: number;
  connections: { active: number; pending: number; graduated: number };
}

export function getPayoutStats(): Promise<PayoutStatsResponse> {
  return request<PayoutStatsResponse>("GET", "/api/admin/payouts/stats");
}

export function runAutoRelease(): Promise<{ success: boolean; released: number; errors: Array<{ jobId?: string; error: string }> }> {
  return request("POST", "/api/admin/payouts/run-auto-release");
}

export function runAutoPayout(): Promise<{ success: boolean; processed: number; errors: Array<{ payoutId?: string; error: string }> }> {
  return request("POST", "/api/admin/payouts/run-auto-payout");
}

export interface PayoutConfigResponse {
  auto_release_enabled: boolean;
  auto_release_hours: number;
  auto_payout_omise_enabled: boolean;
  job_limit: number;
  request_limit: number;
  omise_configured: boolean;
  hint?: string;
}

export async function getPayoutConfig(): Promise<PayoutConfigResponse | null> {
  try {
    return await request<PayoutConfigResponse>("GET", "/api/admin/payouts/config");
  } catch {
    return null; // Endpoint อาจไม่มีใน backend เวอร์ชันเก่า
  }
}

export function approveKyc(
  userId: string
): Promise<{ success: boolean; kyc_status: string }> {
  return request(
    "POST",
    `/api/admin/kyc/${encodeURIComponent(userId)}/approve`,
    {}
  );
}

export function rejectKyc(
  userId: string,
  reason?: string
): Promise<{ success: boolean; kyc_status: string }> {
  return request(
    "POST",
    `/api/admin/kyc/${encodeURIComponent(userId)}/reject`,
    {
      reason: reason || "Rejected by admin",
    }
  );
}

// Phase 4C: Financial Dashboard (read-only)
export interface FinancialDashboardResponse {
  total_wallets: number;
  total_balances: number;
  ledger_volume: Array<{
    day: string;
    gateway: string;
    entry_count: number;
    net_volume: number;
  }>;
  reconciliation_runs: Array<Record<string, unknown>>;
  vip_admin_fund_balance?: number;
}

export function getFinancialDashboard(params?: {
  from_date?: string;
  to_date?: string;
  days?: number;
}): Promise<FinancialDashboardResponse> {
  const sp = new URLSearchParams();
  if (params?.from_date) sp.set("from_date", params.from_date);
  if (params?.to_date) sp.set("to_date", params.to_date);
  if (params?.days != null) sp.set("days", String(params.days));
  const q = sp.toString();
  return request<FinancialDashboardResponse>(
    "GET",
    "/api/admin/financial/dashboard" + (q ? "?" + q : "")
  );
}

// GET /api/admin/financial/summary — รายรับวันนี้ + หนี้สิน + แยกตามประเภท
export interface FinancialSummaryResponse {
  total_today_revenue: number;
  total_liabilities_today: number;
  total_liabilities_all: number;
  revenue_breakdown: {
    job_match: number;
    talent_booking: number;
    job_advance: number;
    vip: number;
    post_job: number;
    branding: number;
  };
  date: string;
}

export function getFinancialSummary(): Promise<FinancialSummaryResponse> {
  return request("GET", "/api/admin/financial/summary");
}

// Financial Strategy — รองรับหลาย region (TH, ID, VN, MY, LA) สำหรับขยายเอเชีย
export const FINANCIAL_STRATEGY_REGIONS = [
  { code: 'TH', name: 'Thailand', currency: 'THB', flag: '🇹🇭' },
  { code: 'ID', name: 'Indonesia', currency: 'IDR', flag: '🇮🇩' },
  { code: 'VN', name: 'Vietnam', currency: 'VND', flag: '🇻🇳' },
  { code: 'MY', name: 'Malaysia', currency: 'MYR', flag: '🇲🇾' },
  { code: 'LA', name: 'Laos', currency: 'LAK', flag: '🇱🇦' },
] as const;

export interface FinancialStrategyResponse {
  region: string;
  currency: string;
  totalReserves: number;
  monthlyBurnRate: number;
  runwayMonths: number;
  expansionBudget: number;
  allocation: Array<{ category: string; percentage: number; amount: number; description: string }>;
  updatedAt: string | null;
}

export function getFinancialStrategy(region?: string): Promise<FinancialStrategyResponse> {
  const q = region ? `?region=${encodeURIComponent(region)}` : '';
  return request<FinancialStrategyResponse>("GET", "/api/admin/financial/strategy" + q);
}

export function patchFinancialStrategy(body: {
  region: string;
  totalReserves?: number;
  monthlyBurnRate?: number;
  expansionBudget?: number;
  allocation?: Array<{ category: string; percentage: number; amount: number; description: string }>;
}): Promise<FinancialStrategyResponse> {
  return request<FinancialStrategyResponse>("PATCH", "/api/admin/financial/strategy", body);
}

export interface FinancialStrategyAllResponse {
  baseCurrency: string;
  strategies: Array<FinancialStrategyResponse & {
    totalReservesInBase: number;
    monthlyBurnRateInBase: number;
    expansionBudgetInBase: number;
  }>;
  exchangeRates: Record<string, number>;
  aggregated: {
    totalReservesInBase: number;
    totalMonthlyBurnInBase: number;
    runwayMonths: number;
  };
}

export function getFinancialStrategyAll(baseCurrency?: string): Promise<FinancialStrategyAllResponse> {
  const q = baseCurrency ? `?base=${encodeURIComponent(baseCurrency)}` : '';
  return request<FinancialStrategyAllResponse>("GET", "/api/admin/financial/strategy/all" + q);
}

export interface ExchangeRateEntry {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  updatedAt: string | null;
}

export function getExchangeRates(baseCurrency?: string): Promise<{ baseCurrency: string; rates: ExchangeRateEntry[] }> {
  const q = baseCurrency ? `?base=${encodeURIComponent(baseCurrency)}` : '';
  return request<{ baseCurrency: string; rates: ExchangeRateEntry[] }>("GET", "/api/admin/exchange-rates" + q);
}

export function patchExchangeRates(body: {
  baseCurrency?: string;
  rates?: Array<{ fromCurrency: string; rate: number }>;
  fromCurrency?: string;
  rate?: number;
}): Promise<{ baseCurrency: string; rates: ExchangeRateEntry[] }> {
  return request("PATCH", "/api/admin/exchange-rates", body);
}

// สมุดบัญชีบริษัท (Company Bank Accounts)
export interface CompanyBankAccount {
  id: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export function getBankAccounts(): Promise<{ accounts: CompanyBankAccount[] }> {
  return request("GET", "/api/admin/bank-accounts");
}

export function createBankAccount(body: {
  bank_name: string;
  account_number: string;
  account_name: string;
  is_active?: boolean;
}): Promise<{ account: CompanyBankAccount }> {
  return request("POST", "/api/admin/bank-accounts", body);
}

// Phase 4D: Audit Logs (audit_log 014: actor_role, status, changes JSONB)
export interface AuditLogRow {
  id: number | string;
  actor_type: string;
  actor_id: string | null;
  actor_role?: string;
  action: string;
  entity_type: string;
  entity_id: string;
  entity_name?: string;
  state_before: unknown;
  state_after: unknown;
  changes?: { old?: Record<string, unknown>; new?: Record<string, unknown> };
  status?: string;
  ip_address?: string | null;
  reason: string | null;
  correlation_id?: string | null;
  created_at: string;
}

export interface AuditLogsResponse {
  logs: AuditLogRow[];
  count: number;
  total?: number;
}

export function getAuditLogs(params?: {
  from_date?: string;
  to_date?: string;
  entity_type?: string;
  entity_id?: string;
  action?: string;
  actor_id?: string;
  limit?: number;
  offset?: number;
}): Promise<AuditLogsResponse> {
  const sp = new URLSearchParams();
  if (params?.from_date) sp.set("from_date", params.from_date);
  if (params?.to_date) sp.set("to_date", params.to_date);
  if (params?.entity_type) sp.set("entity_type", params.entity_type);
  if (params?.entity_id) sp.set("entity_id", params.entity_id);
  if (params?.action) sp.set("action", params.action);
  if (params?.actor_id) sp.set("actor_id", params.actor_id);
  if (params?.limit != null) sp.set("limit", String(params.limit));
  if (params?.offset != null) sp.set("offset", String(params.offset));
  const q = sp.toString();
  return request<AuditLogsResponse>(
    "GET",
    "/api/audit/logs" + (q ? "?" + q : "")
  );
}

// Phase 4E: Financial Audit (platform revenue + recent transactions)
export interface FinancialAuditTransactionRow {
  id: string;
  userId: string;
  type: string;
  amount: number;
  status: "COMPLETED" | "PENDING" | "FLAGGED" | "FAILED";
  fraudScore: number;
  timestamp?: string;
  note?: string;
  metadata?: unknown;
}

export interface FinancialAuditResponse {
  currency: string;
  platform_balance: number;
  transactions: FinancialAuditTransactionRow[];
}

export function getFinancialAudit(params?: {
  limit?: number;
}): Promise<FinancialAuditResponse> {
  const sp = new URLSearchParams();
  if (params?.limit != null) sp.set("limit", String(params.limit));
  const q = sp.toString();
  return request<FinancialAuditResponse>(
    "GET",
    "/api/admin/financial/audit" + (q ? "?" + q : "")
  );
}

// VIP Admin Fund (12.5% ของ gross profit VIP)
export interface VipAdminFundEntry {
  id: string;
  amount: number;
  source_event_type: string;
  source_ledger_id?: string;
  vip_tier?: string;
  gross_profit?: number;
  siphon_percent?: number;
  created_at: string;
}

export interface VipAdminFundResponse {
  total: number;
  total_in?: number;
  total_out?: number;
  entries: VipAdminFundEntry[];
}

export function getVipAdminFund(params?: { limit?: number }): Promise<VipAdminFundResponse> {
  const sp = new URLSearchParams();
  if (params?.limit != null) sp.set("limit", String(params.limit));
  const q = sp.toString();
  return request<VipAdminFundResponse>(
    "GET",
    "/api/admin/financial/vip-admin-fund" + (q ? "?" + q : "")
  );
}

export function reinjectVipAdminFund(body: {
  amount: number;
  notes?: string;
}): Promise<{ success: boolean; reinjected: number; message: string }> {
  return request("POST", "/api/admin/financial/vip-admin-fund/reinject", body);
}

// Revenue by Source (Match / Board / Booking)
export interface RevenueBySourceResponse {
  match: { total: number; tx_count: number; margin_percent: number };
  board: { total: number; tx_count: number; margin_percent: number };
  booking: { total: number; tx_count: number; margin_percent: number };
  grand_total: number;
}

export function getRevenueBySource(): Promise<RevenueBySourceResponse> {
  return request<RevenueBySourceResponse>("GET", "/api/admin/financial/revenue-by-source");
}

// ============ Financial Control Settings (Admin Steering) ============
export interface FinancialControlSettingsResponse {
  withdrawal_min_jobs: number;
  withdrawal_min_balance_thb: number;
  withdrawal_fee_standard_thb: number;
  withdrawal_fee_instant_thb: number;
  fee_rates: {
    platform_fee: Record<string, number>;
    commission_match_board: Record<string, number>;
    commission_booking: Record<string, number>;
    handling_fee_percent?: number;
    payment_markup_percent?: number;
  };
  updated_at?: string | null;
}

export function getFinancialControlSettings(): Promise<FinancialControlSettingsResponse> {
  return request<FinancialControlSettingsResponse>("GET", "/api/admin/financial/control-settings");
}

export function patchFinancialControlSettings(body: {
  withdrawal_min_jobs?: number;
  withdrawal_min_balance_thb?: number;
  withdrawal_fee_standard_thb?: number;
  withdrawal_fee_instant_thb?: number;
  fee_rates?: {
    platform_fee?: Record<string, number>;
    commission_match_board?: Record<string, number>;
    commission_booking?: Record<string, number>;
    handling_fee_percent?: number;
    payment_markup_percent?: number;
  };
}): Promise<FinancialControlSettingsResponse & { message?: string }> {
  return request("PATCH", "/api/admin/financial/control-settings", body);
}

export function verifyLedgerIntegrity(): Promise<{
  valid: boolean;
  total_rows: number;
  first_broken?: { id: string; created_at: string; expected: string; stored: string };
  message: string;
}> {
  return request("POST", "/api/admin/financial/ledger/verify-integrity", {});
}

// Platform Revenues — Revenue A/B/C + กำไรจากค่าธรรมเนียม
export interface PlatformRevenuesResponse {
  total_margin_thb: number;
  revenue_a_commission?: number;
  revenue_b_deposit_margin?: number;
  revenue_c_withdrawal_margin?: number;
  by_source: Record<string, number>;
  recent: Array<{
    id: string;
    transaction_id: string;
    source_type: string;
    amount: number;
    gross_amount: number;
    created_at: string | null;
  }>;
  days: number;
}

export function getPlatformRevenues(range?: "today" | "week" | "month"): Promise<PlatformRevenuesResponse> {
  const q = range ? `?range=${range}` : "";
  return request("GET", "/api/admin/financial/platform-revenues" + q);
}

// Reconcile Alerts — แจ้งเตือนเงินรั่ว (Omise vs platform_balance)
export interface ReconcileAlertsResponse {
  count: number;
  alerts: Array<{
    id: string;
    omise_balance_thb: number;
    platform_balance_thb: number;
    diff_thb: number;
    created_at: string | null;
  }>;
}

export function getReconcileAlerts(): Promise<ReconcileAlertsResponse> {
  return request("GET", "/api/admin/reconcile/alerts");
}

export function resolveReconcileAlert(id: string, notes?: string): Promise<{ success: boolean }> {
  return request("PATCH", `/api/admin/reconcile/alerts/${id}/resolve`, { notes });
}

// Security Pulse — Cyber Command Center
export interface SecurityStatsResponse {
  failedLogins24h: number;
  bruteForceIps?: Array<{ ip: string; count: number }>;
  ledgerIntegrity: { valid: boolean | null; totalRows?: number; total_rows?: number; firstBroken?: unknown; note: string };
  suspiciousPayouts: Array<{ id: string; userId: string; amount: number; status: string; createdAt: string | null; userName?: string }>;
  rateLimitEntries: number;
  recentEvents: Array<{
    source: string;
    id?: unknown;
    actorType?: string;
    actorId?: string;
    action: string;
    entityType?: string;
    entityName?: string;
    entityId?: string;
    status?: string;
    ipAddress?: string;
    reason?: string;
    label?: string;
    createdAt: string | null;
  }>;
}

export function getSecurityStats(): Promise<SecurityStatsResponse> {
  return request("GET", "/api/admin/security/stats");
}

export function verifySecurityAll(): Promise<{ valid: boolean; totalRows: number; firstBroken?: unknown; message: string }> {
  return request("POST", "/api/admin/security/verify-all", {});
}

export function getBlockedIps(): Promise<{ blockedIps: Array<{ id: string; ip: string; reason?: string; blocked_by?: string; blocked_at?: string }> }> {
  return request("GET", "/api/admin/security/blocked-ips");
}

export function blockIp(ip: string, reason?: string): Promise<{ success: boolean; ip: string }> {
  return request("POST", "/api/admin/security/block-ip", { ip, reason });
}

export function unblockIp(ip: string): Promise<{ success: boolean; ip: string }> {
  return request("POST", "/api/admin/security/unblock-ip", { ip });
}

export interface HighRiskUser {
  user_id: string;
  phone?: string;
  email?: string;
  full_name?: string;
  account_status?: string;
  total_score: number;
  flag_count: number;
  anomaly_types: string[];
  latest_at?: string;
}

export function getHighRiskUsers(opts?: { limit?: number; offset?: number }): Promise<{ users: HighRiskUser[] }> {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.offset) params.set("offset", String(opts.offset));
  const q = params.toString();
  return request("GET", "/api/admin/security/high-risk-users" + (q ? "?" + q : ""));
}

// Tax & Compliance: Export Center + QR Audit
export async function downloadExport(
  type: "official-revenue" | "internal-ledger" | "payout-recon",
  from?: string,
  to?: string
): Promise<void> {
  const base = ADMIN_API_BASE;
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const q = params.toString();
  const url = `${base}/api/admin/financial/export/${type}${q ? "?" + q : ""}`;
  const token = getAdminToken();
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(await res.text().catch(() => "Export failed"));
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/);
  const filename = match?.[1] || `export_${type}_${new Date().toISOString().slice(0, 10)}.csv`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function getAuditByQr(q: string): Promise<{
  query: string;
  ledger: Array<{ id: string; tax_ref_id?: string; event_type: string; amount: number; bill_no?: string; transaction_no?: string; user_id?: string; provider_id?: string; created_at: string }>;
  statements: Array<{ id: string; user_id: string; period_from: string; period_to: string; fee_amount: number; status: string; qr_verification_code?: string }>;
  audit_trail: Array<{ id: number; actor_type: string; actor_id?: string; action: string; entity_type: string; entity_id: string; state_after?: unknown; reason?: string; created_at: string }>;
}> {
  return request("GET", "/api/admin/financial/audit-by-qr?q=" + encodeURIComponent(q));
}

// ============ Insurance Vault (Liability 60/40) ============
export interface InsuranceSettingsResponse {
  insurance_rate_percent: number;
  updated_at?: string;
  updated_by?: string;
  category_rates?: Record<string, number>;
}

export interface InsuranceSummaryResponse {
  total_insurance_collected:        number;
  total_insurance_paid_out:         number;
  current_insurance_balance:        number;
  reserve_60:                       number;  // หัก TIPO แล้ว (ยอดสำรองที่แท้จริง)
  gross_reserve_60?:                number;  // ก่อนหักเคลม
  manageable_40:                    number;
  already_withdrawn_for_investment: number;
  allowed_to_withdraw:              number;
  source?:                          string;
  // ── Claims integration ──
  pending_claims_count?:            number;  // จำนวน claim รอพิจารณา
  total_claims_approved_amount?:    number;  // ยอด payout อนุมัติแล้วทั้งหมด
  pending_claims_exposure?:         number;  // ความเสี่ยง (pending claims × 55%)
}

export interface JobCategoryItem {
  category: string;
  display_name: string;
  rate_percent: number;
}

export function getInsuranceSettings(): Promise<InsuranceSettingsResponse> {
  return request("GET", "/api/admin/insurance/settings");
}

export function patchInsuranceSettings(body: {
  insurance_rate_percent?: number;
  category_rates?: Record<string, number>;
}): Promise<{ success: boolean; insurance_rate_percent?: number }> {
  return request("PATCH", "/api/admin/insurance/settings", body);
}

export function getJobCategoryList(): Promise<{ categories: JobCategoryItem[] }> {
  return request("GET", "/api/jobs/category-list");
}

export function getInsuranceSummary(): Promise<InsuranceSummaryResponse> {
  return request("GET", "/api/admin/insurance/summary");
}

export function withdrawInsurance(body: {
  amount: number;
  reason?: string;
}): Promise<{ success: boolean; id: string; amount: number; message: string }> {
  return request("POST", "/api/admin/insurance/withdraw", body);
}

export interface PaymentLedgerEntry {
  id: string;
  event_type: string;
  payment_id: string | null;
  job_id: string | null;
  amount: number | null;
  currency: string | null;
  status: string | null;
  leg: string | null;
  created_at: string | null;
}

export function getPaymentLedger(params?: { limit?: number; job_id?: string }): Promise<{
  source: string;
  count: number;
  entries: PaymentLedgerEntry[];
}> {
  const sp = new URLSearchParams();
  if (params?.limit != null) sp.set("limit", String(params.limit));
  if (params?.job_id) sp.set("job_id", params.job_id);
  const q = sp.toString();
  return request("GET", "/api/admin/payment-ledger" + (q ? "?" + q : ""));
}

// ============ Admin Analytics / Financial Overview (Booking + Advance Jobs) ============
export interface AdminAnalyticsEarningsResponse {
  booking_fees: number;
  job_commissions: number;
  active_escrow_amount: number;
  total_platform_revenue: number;
  completed_bookings_count: number;
  active_advance_jobs: number;
  revenue_stream: Array<{
    id: string;
    event_type: string;
    payment_id: string | null;
    job_id: string | null;
    amount: number;
    currency: string | null;
    leg: string | null;
    sub_category?: string | null;
    created_at: string | null;
  }>;
}

export function getAdminAnalyticsEarnings(): Promise<AdminAnalyticsEarningsResponse> {
  return request("GET", "/api/admin/analytics/earnings");
}

// Broadcast notifications (Admin ส่ง → Frontend Home แสดง)
export interface BroadcastNotificationItem {
  id: string;
  title: string;
  message: string;
  target: string;
  sentAt: string;
}

export function sendBroadcastNotification(body: {
  title: string;
  message: string;
  target?: string;
}): Promise<{ id: string; sentAt: string }> {
  return request("POST", "/api/admin/notifications/broadcast", body);
}

export function getAdminNotifications(limit?: number): Promise<{
  notifications: BroadcastNotificationItem[];
}> {
  const sp = new URLSearchParams();
  if (limit != null) sp.set("limit", String(limit));
  const q = sp.toString();
  return request(
    "GET",
    "/api/admin/notifications" + (q ? "?" + q : "")
  );
}

/** ทดสอบ Push + เสียง aqond_intercity_jobs / aqond_notification */
export function sendTestNotification(body: { userId: string }): Promise<{
  success: boolean;
  userId: string;
  channelId: string;
  sound: string;
  fcm: { success: number; failed: number };
}> {
  return request("POST", "/api/admin/test-notification", body);
}

export interface GatewayEndpointItem {
  name: string;
  path: string;
  method: string;
  status: 'operational' | 'degraded';
}

export interface GatewayStatusResponse {
  status: string;
  timestamp: string;
  services: { postgresql: string; redis: string; cloudinary: string };
  uptime_seconds: number;
  memory: { heapUsed_mb: number; heapTotal_mb: number; rss_mb: number };
  env: {
    node_env: string;
    port: number | string;
    redis_configured: boolean;
    redis_provider: string | null;
    cloudinary_configured: boolean;
    cloud_name: string | null;
    render: boolean;
    render_service: string | null;
  };
  endpoints: GatewayEndpointItem[];
}

export function getGatewayStatus(): Promise<GatewayStatusResponse> {
  return request("GET", "/api/admin/gateway-status");
}

// ============ Cluster Health ============
export interface ClusterHealthNode {
  id: string;
  region: string;
  status: 'Healthy' | 'High Load' | 'Critical' | 'Down';
  cpuUsage: number;
  memoryUsage: number;
  activeConnections: number;
  service?: string;
}

export interface ClusterHealthResponse {
  timestamp: string;
  jobsPaused?: boolean;
  cronLastRunAt?: string | null;
  cronLastError?: string | null;
  activeUsers: number;
  activeWorkerNodes: string;
  healthyNodes: number;
  totalNodes: number;
  dbConnections: number;
  dbReplicationLagMs: number | null;
  services: { postgresql: string; redis: string; cloudinary: string };
  memory: {
    heapUsed_mb: number;
    heapTotal_mb: number;
    rss_mb: number;
    usagePercent: number;
  };
  uptime_seconds: number;
  nodes: ClusterHealthNode[];
  env: {
    node_env: string;
    region: string | null;
    render: boolean;
    cpu_source?: 'os.loadavg' | 'memory_proxy';
  };
}

export function getClusterHealth(): Promise<ClusterHealthResponse> {
  return request<ClusterHealthResponse>("GET", "/api/admin/cluster-health");
}

// ============ Sharding Stats (Partition Monitor - Migration 002) ============
export interface ShardingPartition {
  id: string;
  name: string;
  range: string;
  status: string;
  load: number;
  sizeGB: number;
  sizeBytes?: number;
  rowCount?: number;
  iops?: number;
  seqScan?: number;
  idxScan?: number;
}

export interface ShardingStatsResponse {
  strategy: string;
  partitionKey: string;
  tableName: string;
  partitions: ShardingPartition[];
  totalShards: number;
  partitionForecast: {
    expected: string[];
    missing: string[];
    missingDetails: { key: string; year: number; month: string; label: string }[];
  };
  throughput: {
    tpmEstimate: number;
    targetTpm: number;
    healthy: boolean;
  };
  partitionLimitGB: number;
  ledgerIntegrity?: {
    valid: boolean | null;
    totalRows: number;
    firstBroken?: unknown;
    note: string;
  };
}

export function getShardingStats(): Promise<ShardingStatsResponse> {
  return request<ShardingStatsResponse>("GET", "/api/admin/sharding/stats");
}

// ============ Disaster Recovery Center ============
export interface DRStatusResponse {
  primaryRegion: string;
  drRegion: string;
  syncStatus: string;
  syncStatusRaw?: string;
  rpoSeconds: number;
  replicationLagSeconds: number | null;
  replicationLagMs?: number | null;
  replicationState: string;
  replicationRows: { applicationName: string; clientAddr: string; state: string; replayLagSeconds: number; syncState: string }[];
  syncThroughputMbps: number;
  standbyHealthy: boolean;
  standbyLatencyMs: number | null;
  storageSyncOk: boolean;
  storageFileCount: number;
  lastBackup: string;
  lastBackupIso?: string | null;
  backupSource?: string;
  activeRegion: 'Primary' | 'DR';
  preFlight: {
    resourcePrep: boolean;
    resourcePrepNote: string;
    dnsReadiness: boolean;
    dnsTtlSeconds: number;
    dnsNote: string;
    verificationRequired: boolean;
    masterPinConfigured: boolean;
  };
  estimatedRecoveryMinutes: number;
}

export function getDRStatus(): Promise<DRStatusResponse> {
  return request<DRStatusResponse>("GET", "/api/admin/dr/status");
}

export function getDRStats(): Promise<DRStatusResponse> {
  return request<DRStatusResponse>("GET", "/api/admin/dr/stats");
}

export function logDRView(): Promise<{ ok: boolean }> {
  return request("POST", "/api/admin/dr/log-view");
}

export function simulateDRFailover(): Promise<{
  success: boolean;
  message: string;
  results: { standbyReachable: boolean; ledgerChainAccessible: boolean; taxDocumentsAccessible: boolean };
  note: string;
}> {
  return request("POST", "/api/admin/dr/simulate-failover");
}

export function activateDRFailover(masterPin: string, confirmText: string): Promise<{
  success: boolean;
  message: string;
  stages: { id: number; name: string; status: string; estimatedMinutes: number }[];
  totalEstimatedMinutes: number;
  note: string;
}> {
  return request("POST", "/api/admin/dr/failover", { masterPin, confirmText });
}

// Job Control (Pause/Resume, Clear Cache)
export interface JobsStatusResponse {
  paused: boolean;
  memoryPercent: number;
  memoryGuardPct: number;
  lastRunAt: string | null;
  lastError: string | null;
  cronIntervalMinutes: number;
}

export function getJobsStatus(): Promise<JobsStatusResponse> {
  return request<JobsStatusResponse>("GET", "/api/admin/jobs/status");
}

export function pauseJobs(): Promise<{ paused: boolean; message: string }> {
  return request("POST", "/api/admin/jobs/pause");
}

export function resumeJobs(): Promise<{ paused: boolean; message: string }> {
  return request("POST", "/api/admin/jobs/resume");
}

export function clearJobsCache(): Promise<{ cleared: number; message: string }> {
  return request("POST", "/api/admin/jobs/clear-cache");
}

// ============ Resource & Cost (Scaling Policy + Cost Metrics) ============
export interface ResourceCostResponse {
  costMetrics: {
    currentMonthlyEst: number;
    budgetCap: number;
    efficiencyScore: number;
    dailyUsage: { day: string; cost: number; traffic: number }[];
  };
  scalingPolicy: {
    mode: 'MANUAL' | 'AUTO_SAVER' | 'AUTO_BALANCED' | 'AUTO_PERFORMANCE';
    minInstances: number;
    maxInstances: number;
    cpuThresholdUp: number;
    cpuThresholdDown: number;
    scaleUpCooldown: number;
    scaleDownCooldown: number;
  };
}

export function getResourceCost(): Promise<ResourceCostResponse> {
  return request<ResourceCostResponse>("GET", "/api/admin/resource-cost");
}

export function patchResourceCost(body: {
  scalingPolicy?: Partial<ResourceCostResponse['scalingPolicy']>;
  budgetCap?: number;
}): Promise<{ updated: string[]; message: string }> {
  return request("PATCH", "/api/admin/resource-cost", body);
}

// ============ System Logs (จาก audit_log) ============
export interface AuditLogEntry {
  id: string;
  actor_id?: string;
  actor_role?: string;
  action: string;
  entity_name?: string;
  entity_id?: string;
  entity_type?: string;
  changes?: { old?: Record<string, unknown>; new?: Record<string, unknown> };
  status?: string;
  ip_address?: string | null;
  created_at?: string;
}

export interface SystemLogsResponse {
  logs: AuditLogEntry[];
  count: number;
  total: number;
}

function mapAuditToSystemLog(r: AuditLogEntry): import("../types").SystemLog {
  let level: "INFO" | "WARNING" | "ERROR" | "CRITICAL" = r.status === "Failed" ? "ERROR" : "INFO";
  const act = (r.action || "").toUpperCase();
  if (level === "INFO" && (act.includes("REJECT") || act.includes("FAIL") || act.includes("TIMEOUT") || act.includes("BLOCK"))) level = "WARNING";
  const entity = (r.entity_name || r.entity_type || "").toLowerCase();
  let source: "API" | "DB" | "AUTH" | "SYSTEM" | "SECURITY" = "SYSTEM";
  if (entity.includes("user") || entity.includes("auth") || entity.includes("kyc") || entity.includes("login")) source = "AUTH";
  else if (entity.includes("payment") || entity.includes("wallet") || entity.includes("ledger") || entity.includes("job")) source = "API";
  else if (entity.includes("db") || entity.includes("audit")) source = "DB";
  else if (entity.includes("security") || entity.includes("brute") || entity.includes("block")) source = "SECURITY";
  const msg = r.entity_id ? `${r.action} (${r.entity_id})` : r.action;
  const d = r.created_at ? new Date(r.created_at) : new Date();
  const timestamp = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${d.toTimeString().slice(0, 8)}`;
  return {
    id: String(r.id),
    timestamp,
    level,
    source,
    message: msg,
    ip: r.ip_address || undefined,
  };
}

export function getSystemLogs(params?: {
  limit?: number;
  offset?: number;
  from_date?: string;
  to_date?: string;
  action?: string;
  entity_type?: string;
}): Promise<{ logs: import("../types").SystemLog[]; count: number; total: number }> {
  const sp = new URLSearchParams();
  if (params?.limit != null) sp.set("limit", String(params.limit));
  if (params?.offset != null) sp.set("offset", String(params.offset));
  if (params?.from_date) sp.set("from_date", params.from_date);
  if (params?.to_date) sp.set("to_date", params.to_date);
  if (params?.action) sp.set("action", params.action);
  if (params?.entity_type) sp.set("entity_type", params.entity_type);
  const q = sp.toString();
  return request<SystemLogsResponse>("GET", "/api/audit/logs" + (q ? "?" + q : "")).then((res) => ({
    logs: (res.logs || []).map(mapAuditToSystemLog),
    count: res.count ?? 0,
    total: res.total ?? 0,
  }));
}

// ============ Support Tickets (ค่าจริงจาก Settings Help & Support + JobDetails Dispute) ============
export interface SupportTicketRow {
  id: string;
  userId: string;
  email?: string | null;
  full_name?: string | null;
  phone?: string | null;
  subject: string;
  status: string;
  priority: string;
  category: string;
  source?: string;
  jobId?: string | null;
  ai_mode_enabled?: boolean;
  lastUpdated: string;
  createdAt: string;
  /** 0–1 from backend heuristic or AI; lower = more urgent/negative for queue ordering */
  sentiment_score?: number | null;
  sentiment_label?: string | null;
  invited_provider_id?: string | null;
  invited_provider_name?: string | null;
  attachments?: Array<{ url: string; type?: string; addedAt?: string }>;
  ai_summary?: string | null;
}

export interface SupportMessageRow {
  id: string;
  ticketId: string;
  sender: string;
  message: string;
  timestamp: string;
  source?: 'faq_match' | 'ai_generated';
  faqScore?: number | null;
}

export function getSupportTickets(status?: string): Promise<{ tickets: SupportTicketRow[] }> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return request("GET", "/api/admin/support/tickets" + q);
}

export function getSupportTicketMessages(ticketId: string): Promise<{ messages: SupportMessageRow[] }> {
  return request("GET", `/api/admin/support/tickets/${ticketId}/messages`);
}

export function replySupportTicket(
  ticketId: string,
  message: string,
  asBot?: boolean,
  asProvider?: boolean
): Promise<{ message: SupportMessageRow }> {
  return request("POST", `/api/admin/support/tickets/${ticketId}/messages`, {
    message,
    asBot: !!asBot,
    asProvider: !!asProvider,
  });
}

export type SupportCrisisAlertResponse = {
  active: boolean;
  windowMinutes: number;
  threshold: number;
  incidents: Array<{
    signature: string;
    count: number;
    windowMinutes: number;
    threshold: number;
  }>;
  detectedAt: string | null;
};

/** ไม่ throw เมื่อ backend ยังไม่มี route หรือ proxy ผิด — คืนค่า inactive */
export async function getSupportCrisisAlert(): Promise<SupportCrisisAlertResponse> {
  try {
    return await request<SupportCrisisAlertResponse>("GET", "/api/admin/support/crisis-alert");
  } catch {
    return {
      active: false,
      windowMinutes: 10,
      threshold: 50,
      incidents: [],
      detectedAt: null,
    };
  }
}

export function postSupportLearningFeedback(body: {
  ticket_id?: string;
  ai_suggestion: string;
  admin_final: string;
}): Promise<{ saved: boolean; id?: string; message?: string }> {
  return request("POST", "/api/admin/support/learning-feedback", body);
}

export function inviteSupportProvider(ticketId: string): Promise<{
  ticket: SupportTicketRow;
  invited_provider_id: string;
  invited_provider_name: string;
}> {
  return request("POST", `/api/admin/support/tickets/${encodeURIComponent(ticketId)}/invite-provider`, {});
}

export type SupportSentimentTrendResponse = {
  hours: number;
  points: Array<{
    hour: string;
    label: string;
    avgSentiment: number | null;
    count: number;
  }>;
};

export function getSupportSentimentTrend(hours = 24): Promise<SupportSentimentTrendResponse> {
  return request<SupportSentimentTrendResponse>(
    "GET",
    `/api/admin/support/sentiment-trend?hours=${encodeURIComponent(String(hours))}`
  );
}

export function generateSupportFaqDraft(ticketId: string): Promise<{
  draft: { id: string; created_at: string };
  faq: { question: string; answer: string; category: string };
}> {
  return request("POST", `/api/admin/support/tickets/${encodeURIComponent(ticketId)}/generate-faq-draft`, {});
}

export function listKnowledgeDrafts(limit?: number): Promise<{
  items: Array<{
    id: string;
    ticket_id: string | null;
    question: string;
    draft_answer: string;
    category: string;
    status: string;
    created_by: string | null;
    created_at: string;
  }>;
}> {
  const q = limit != null ? `?limit=${encodeURIComponent(String(limit))}` : "";
  return request("GET", "/api/admin/support/knowledge-drafts" + q);
}

export function addSupportTicketMediaUrl(
  ticketId: string,
  body: { url: string; type?: string }
): Promise<{ ticket: SupportTicketRow }> {
  return request("POST", `/api/admin/support/tickets/${encodeURIComponent(ticketId)}/attachments`, body);
}

export function resolveSupportTicket(
  ticketId: string,
  status: string
): Promise<{ ticket: SupportTicketRow }> {
  return request("PATCH", `/api/admin/support/tickets/${ticketId}`, { status });
}

export function setSupportTicketAiMode(
  ticketId: string,
  aiMode: boolean
): Promise<{ ticket: SupportTicketRow }> {
  return request("PATCH", `/api/admin/support/tickets/${ticketId}`, { aiMode });
}

export function getSupportAiSuggestion(ticketId: string): Promise<{
  suggestion: string;
  source?: 'faq_match' | 'ai_generated';
  score?: number | null;
}> {
  return request("POST", "/api/admin/support/ai-suggest", { ticketId });
}

export function saveSupportBestAnswer(body: {
  question: string;
  best_answer: string;
  category?: string;
  ticket_id?: string;
}): Promise<{ success: boolean; id: string; message: string }> {
  return request("POST", "/api/admin/support/save-best-answer", body);
}

export interface FaqKnowledgeItem {
  id: string;
  question: string;
  best_answer: string;
  category: string;
  ticket_id?: string | null;
  created_by?: string | null;
  created_at: string;
}

export function getFaqKnowledge(): Promise<{ items: FaqKnowledgeItem[] }> {
  return request("GET", "/api/admin/support/faq-knowledge");
}

export function deleteFaqKnowledge(id: string): Promise<{ success: boolean; message: string }> {
  return request("DELETE", `/api/admin/support/faq-knowledge/${encodeURIComponent(id)}`);
}

/** One-Click Promote: draft → faq_knowledge (draft ถูกทำเครื่องหมาย promoted) */
export function promoteKnowledgeDraft(id: string): Promise<{
  success: boolean;
  faq: FaqKnowledgeItem;
  draft_id: string;
}> {
  return request(
    "POST",
    `/api/admin/support/knowledge-drafts/${encodeURIComponent(id)}/promote`,
    {}
  );
}

// ============ Mobile App Config (ตั้งค่า Mobile App) ============
export interface MobileAppConfig {
  iosMinVersion: string;
  androidMinVersion: string;
  welcomeMessage: string;
  pushNotificationEnabled: boolean;
  featureFlags: {
    enableSignups: boolean;
    enablePayments: boolean;
    enableJobPosting: boolean;
    enableChat: boolean;
    maintenanceMode: boolean;
  };
}

export function getMobileConfig(): Promise<{ config: MobileAppConfig; updatedAt: string | null }> {
  return request("GET", "/api/admin/mobile-config");
}

export function patchMobileConfig(body: Partial<MobileAppConfig>): Promise<{ config: MobileAppConfig; updatedAt: string }> {
  return request("PATCH", "/api/admin/mobile-config", body);
}

/** Payso / Ksher / Stripe + MDR snapshot (อ่านจาก ENV บน API) */
export function getPaymentProviderGate(): Promise<Record<string, unknown>> {
  return request("GET", "/api/admin/payment-provider-gate");
}

/** บันทึก gateway: ยอดเต็ม / MDR / กำไรประมาณ (ต้องมีตาราง payment_transaction_logs) */
export function getPaymentTransactionLogs(limit?: number): Promise<{ rows: Record<string, unknown>[]; limit: number }> {
  const q = limit != null ? `?limit=${encodeURIComponent(String(limit))}` : "";
  return request("GET", `/api/admin/payment-transaction-logs${q}`);
}

/** AQOND Internal Gateway — Admin Console (migration 146) — masked data requires `accessReason` (ISO 27001) */
export function getInternalGatewayMetrics(days?: number, accessReason?: string): Promise<Record<string, unknown>> {
  const q = new URLSearchParams();
  if (days != null) q.set("days", String(days));
  if (accessReason) q.set("reason", accessReason);
  const qs = q.toString();
  return request("GET", `/api/admin/internal-gateway/metrics${qs ? `?${qs}` : ""}`);
}

export function getInternalGatewayTransactions(limit?: number, accessReason?: string): Promise<{
  rows: Record<string, unknown>[];
  limit: number;
}> {
  const q = new URLSearchParams();
  if (limit != null) q.set("limit", String(limit));
  if (accessReason) q.set("reason", accessReason);
  const qs = q.toString();
  return request("GET", `/api/admin/internal-gateway/transactions${qs ? `?${qs}` : ""}`);
}

export function getInternalGatewaySettlementReports(limit?: number, accessReason?: string): Promise<{
  rows: Record<string, unknown>[];
  limit: number;
}> {
  const q = new URLSearchParams();
  if (limit != null) q.set("limit", String(limit));
  if (accessReason) q.set("reason", accessReason);
  const qs = q.toString();
  return request("GET", `/api/admin/internal-gateway/settlement-reports${qs ? `?${qs}` : ""}`);
}

export function verifyInternalGatewayLedger(reason?: string): Promise<Record<string, unknown>> {
  const body = reason && reason.trim().length >= 3 ? { reason: reason.trim().slice(0, 500) } : {};
  return request("POST", "/api/admin/internal-gateway/verify-ledger", body);
}

/** Manual / backfill BOT monthly compliance report (audited). */
export function postInternalGatewayGenerateReport(body: {
  month: number;
  year: number;
  reason: string;
  force?: boolean;
}): Promise<Record<string, unknown>> {
  return request("POST", "/api/admin/internal-gateway/generate-report", body);
}

export function getInternalGatewayAuditLogs(limit?: number, accessReason?: string): Promise<{
  rows: Record<string, unknown>[];
  limit: number;
}> {
  const q = new URLSearchParams();
  if (limit != null) q.set("limit", String(limit));
  if (accessReason) q.set("reason", accessReason);
  const qs = q.toString();
  return request("GET", `/api/admin/internal-gateway/audit-logs${qs ? `?${qs}` : ""}`);
}

export function getInternalGatewayPulse(): Promise<Record<string, unknown>> {
  return request("GET", "/api/admin/internal-gateway/pulse");
}

export function getInternalGatewayPayoutRouteSuggest(
  amountMinor: number,
  preferSpeed?: boolean
): Promise<Record<string, unknown>> {
  const q = new URLSearchParams({
    amountMinor: String(amountMinor),
    ...(preferSpeed ? { preferSpeed: "1" } : {}),
  });
  return request("GET", `/api/admin/internal-gateway/payout-route-suggest?${q.toString()}`);
}

// ============ Banners (Content Manager → แสดงที่ Home + โค้ดส่วนลด) ============
export function getBanners(): Promise<{ banners: import("../types").AppBanner[] }> {
  return request("GET", "/api/admin/banners");
}

export function createBanner(body: {
  title: string;
  imageUrl: string;
  actionUrl?: string;
  order?: number;
  startDate?: string;
  endDate?: string;
  isActive?: boolean;
  promoCode?: string;
  discountMaxBaht?: number;
  discountDescription?: string;
}): Promise<{ banner: import("../types").AppBanner }> {
  return request("POST", "/api/admin/banners", body);
}

export function updateBanner(
  id: string,
  body: Partial<{
    title: string;
    imageUrl: string;
    actionUrl: string;
    order: number;
    startDate: string;
    endDate: string;
    isActive: boolean;
    promoCode: string;
    discountMaxBaht: number;
    discountDescription: string;
  }>
): Promise<{ banner: import("../types").AppBanner }> {
  return request("PATCH", `/api/admin/banners/${encodeURIComponent(id)}`, body);
}

export function deleteBanner(id: string): Promise<void> {
  return request("DELETE", "/api/admin/banners/" + encodeURIComponent(id));
}

// ============ Report Center (Admin BI) ============
export interface FinancialReportResponse {
  from_date: string;
  to_date: string;
  total_revenue: number;
  total_marketing_expense?: number;
  total_liabilities: number;
  daily: Array<{ date: string; revenue: number; marketing_expense?: number; liabilities: number }>;
}

export interface UserGrowthReportResponse {
  from_date: string;
  to_date: string;
  total_users: number;
  total_providers: number;
  daily_signups: Array<{ date: string; signups: number }>;
}

export interface SystemHealthReportResponse {
  timestamp: string;
  services: { postgresql: string; redis: string; cloudinary: string };
  uptime_seconds: number;
  memory_mb: { heapUsed: number; heapTotal: number; rss: number };
  node_env: string;
}

export interface ReportListItem {
  id: string;
  name: string;
  type: string;
  format: string;
  frequency: string;
  lastGenerated: string;
}

export function getReportFinancial(params?: {
  from_date?: string;
  to_date?: string;
}): Promise<FinancialReportResponse> {
  const sp = new URLSearchParams();
  if (params?.from_date) sp.set("from_date", params.from_date);
  if (params?.to_date) sp.set("to_date", params.to_date);
  const q = sp.toString();
  return request("GET", "/api/admin/reports/financial" + (q ? "?" + q : ""));
}

export function getReportUserGrowth(params?: {
  from_date?: string;
  to_date?: string;
}): Promise<UserGrowthReportResponse> {
  const sp = new URLSearchParams();
  if (params?.from_date) sp.set("from_date", params.from_date);
  if (params?.to_date) sp.set("to_date", params.to_date);
  const q = sp.toString();
  return request("GET", "/api/admin/reports/user-growth" + (q ? "?" + q : ""));
}

export function getReportSystemHealth(): Promise<SystemHealthReportResponse> {
  return request("GET", "/api/admin/reports/system-health");
}

export function getReportList(): Promise<{ reports: ReportListItem[] }> {
  return request("GET", "/api/admin/reports/list");
}

// ---------- Training Center: ข้อสอบ & คะแนน ----------
export interface TrainingExamConfig {
  module1: { passPercent: number; timeLimitMin: number; totalQuestions: number; categories?: string[]; updatedAt?: string | null };
  module2: { passPercent: number; timeLimitMin: number; totalQuestions: number; categories?: string[]; updatedAt?: string | null };
  module3: { passPercent: number; timeLimitMin: number; totalQuestions: number; categories?: string[]; updatedAt?: string | null };
}

export function getTrainingExamConfig(): Promise<TrainingExamConfig> {
  return request("GET", "/api/admin/training/exam-config");
}

export function updateTrainingExamConfig(params: {
  module: 1 | 2 | 3;
  passPercent?: number;
  timeLimitMin?: number;
  totalQuestions?: number;
}): Promise<{ module: number; passPercent: number; timeLimitMin: number; totalQuestions: number; updatedAt: string | null }> {
  return request("PATCH", "/api/admin/training/exam-config", params);
}

// ---------- LMS Training: Courses, Lessons, Questions ----------
export interface LmsCourse {
  id: string;
  title: string;
  description?: string;
  category?: string;
  duration?: string;
  level?: string;
  image_url?: string;
  nexus_module?: number;
  job_category?: string;
  pass_percent?: number;
  time_limit_min?: number;
  created_at?: string;
  updated_at?: string;
}

export interface LmsLesson {
  id: string;
  course_id: string;
  title: string;
  sort_order: number;
  step_type: "video" | "text" | "quiz" | "assignment";
  video_url?: string;
  text_content?: string;
  duration_min?: number;
  quiz_pass_percent?: number;
}

export interface LmsQuestion {
  id: string;
  course_id: string;
  question_text: string;
  options: Array<{ id: string; text: string }>;
  correct_option_id: string;
  sort_order: number;
}

export function getLmsCourses(): Promise<{ courses: LmsCourse[] }> {
  return request("GET", "/api/admin/training/courses");
}

export function updateLmsCourse(id: string, data: Partial<LmsCourse> & { videoUrl?: string }): Promise<LmsCourse> {
  return request("PUT", `/api/admin/training/courses/${id}`, data);
}

export function getLmsLessons(courseId: string): Promise<{ lessons: LmsLesson[] }> {
  return request("GET", `/api/admin/training/courses/${courseId}/lessons`);
}

export function updateLmsLesson(lessonId: string, data: Partial<LmsLesson> & { videoUrl?: string; textContent?: string }): Promise<LmsLesson> {
  return request("PUT", `/api/admin/training/lessons/${lessonId}`, {
    ...data,
    videoUrl: data.videoUrl ?? (data as any).video_url,
    textContent: data.textContent ?? (data as any).text_content,
    durationMin: data.duration_min,
    quizPassPercent: data.quiz_pass_percent,
  });
}

export function createLmsLesson(data: {
  courseId: string;
  title: string;
  sortOrder?: number;
  stepType: "video" | "text" | "quiz" | "assignment";
  videoUrl?: string;
  textContent?: string;
  durationMin?: number;
  quizPassPercent?: number;
}): Promise<LmsLesson> {
  return request("POST", "/api/admin/training/lessons", data);
}

export function deleteLmsLesson(lessonId: string): Promise<{ deleted: boolean }> {
  return request("DELETE", `/api/admin/training/lessons/${lessonId}`);
}

export function reorderLmsLessons(courseId: string, order: string[]): Promise<{ success: boolean; count: number }> {
  return request("PUT", "/api/admin/training/lessons/reorder", { courseId, order });
}

export function getLmsQuestions(courseId: string): Promise<{ questions: LmsQuestion[] }> {
  return request("GET", `/api/admin/training/courses/${courseId}/questions`);
}

export function createLmsQuestion(data: {
  courseId: string;
  questionText: string;
  options: Array<{ id: string; text: string }>;
  correctOptionId: string;
  sortOrder?: number;
}): Promise<LmsQuestion> {
  return request("POST", "/api/admin/training/questions", data);
}

export function updateLmsQuestion(qid: string, data: Partial<LmsQuestion>): Promise<LmsQuestion> {
  return request("PUT", `/api/admin/training/questions/${qid}`, {
    questionText: data.question_text,
    options: data.options,
    correctOptionId: data.correct_option_id,
    sortOrder: data.sort_order,
  });
}

export function deleteLmsQuestion(qid: string): Promise<{ deleted: boolean }> {
  return request("DELETE", `/api/admin/training/questions/${qid}`);
}

export function duplicateLmsQuestion(qid: string, targetCourseId?: string): Promise<LmsQuestion> {
  return request("POST", `/api/admin/training/questions/${qid}/duplicate`, { targetCourseId });
}

export function bulkImportLmsQuestions(courseId: string, questions: Array<{
  questionText?: string;
  question_text?: string;
  text?: string;
  options?: Array<{ id: string; text: string } | string>;
  correctOptionId?: string;
  correct_option_id?: string;
}>): Promise<{ inserted: number; questions: Array<{ id: string; question_text: string }> }> {
  return request("POST", "/api/admin/training/questions/bulk-import", { courseId, questions });
}

export function reorderLmsQuestions(courseId: string, order: string[]): Promise<{ success: boolean; count: number }> {
  return request("PUT", "/api/admin/training/questions/reorder", { courseId, order });
}

export interface TrainingStats {
  passRateByModule: Record<number, { passed: number; total: number; rate: number }>;
  attemptsOverTime: Array<{ date: string; count: number }>;
  pendingAssignments: number;
  totalAttempts: number;
}

export function getTrainingStats(): Promise<TrainingStats> {
  return request("GET", "/api/admin/training/stats");
}

export function exportLmsQuestionsCsv(courseId: string): Promise<Blob> {
  const url = `${ADMIN_API_BASE}/api/admin/training/courses/${courseId}/export-questions`;
  return fetch(url, {
    headers: { Authorization: `Bearer ${getAdminToken()}` },
  }).then((r) => {
    if (!r.ok) throw new Error("Export failed");
    return r.blob();
  });
}

export function duplicateLmsCourse(courseId: string, newTitle?: string): Promise<LmsCourse> {
  return request("POST", `/api/admin/training/courses/${courseId}/duplicate`, { newTitle });
}

export function aiGenerateQuestions(text: string): Promise<{ questions: Array<{ questionText: string; options: Array<{ id: string; text: string }>; correctOptionId: string }> }> {
  return request("POST", "/api/admin/training/questions/ai-generate", { text });
}

export interface AssignmentSubmission {
  id: string;
  user_id: string;
  lesson_id: string;
  file_urls: string[];
  submitted_at: string;
  status: "pending" | "passed" | "failed";
  admin_feedback?: string;
  full_name?: string;
  email?: string;
  lesson_title?: string;
  course_title?: string;
}

export function getLmsAssignments(status?: string): Promise<{ submissions: AssignmentSubmission[] }> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return request("GET", `/api/admin/training/assignments${q}`);
}

export function gradeLmsAssignment(id: string, status: "passed" | "failed", adminFeedback?: string): Promise<AssignmentSubmission> {
  return request("PUT", `/api/admin/training/assignments/${id}/grade`, { status, adminFeedback });
}

// ═══════════════════════════════════════════════════════════════════════
// Worker Emergency Incident Management
// ═══════════════════════════════════════════════════════════════════════

export type IncidentStatus = "pending" | "resolved" | "fraud";
export type IncidentResolutionAction = "reroute" | "refund_close" | "mark_fraud";

export interface IncidentRow {
  id:                string;
  job_id:            string;
  type:              string;
  description:       string;
  evidence_images:   string[];
  resolution_status: IncidentStatus;
  resolver_id:       string | null;
  resolution_notes:  string | null;
  reported_at:       string;
  // joined fields
  job_title:         string;
  job_price:         number | null;
  job_category:      string | null;
  job_location:      string | null;
  client_id:         string | null;
  worker_name:       string;
  worker_avatar:     string | null;
  worker_grade:      string | null;
  client_name:       string;
  client_email:      string;
}

export interface ReplacementWorker {
  id:            string;
  full_name:     string;
  profile_image_url: string | null;
  worker_grade:  string;
  avg_rating:    number;
  total_jobs:    number;
  success_rate:  number;
}

/** GET /api/admin/incidents?status=pending|resolved|all — Admin dashboard ใช้ Bearer token จาก admin login */
export function getIncidents(params?: {
  status?: "pending" | "resolved" | "all";
  limit?:  number;
  offset?: number;
}): Promise<{ incidents: IncidentRow[]; pending_count: number }> {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.limit)  q.set("limit",  String(params.limit));
  if (params?.offset) q.set("offset", String(params.offset));
  return request("GET", `/api/admin/incidents?${q}`);
}

/** GET /api/admin/incidents/pending-count — Admin dashboard ใช้ Bearer token จาก admin login */
export function getIncidentPendingCount(): Promise<{ count: number }> {
  return request("GET", "/api/admin/incidents/pending-count");
}

/** GET /api/admin/incidents/nearby-workers/:incidentId */
export function findReplacementWorkers(
  incidentId: string
): Promise<{ workers: ReplacementWorker[]; job_id: string }> {
  return request("GET", `/api/admin/incidents/nearby-workers/${incidentId}`);
}

/** PATCH /api/admin/incidents/:id/resolve */
export function resolveIncident(
  id:                    string,
  action:                IncidentResolutionAction,
  replacementWorkerId?:  string,
  notes?:                string
): Promise<{ success: boolean; action: string }> {
  return request("PATCH", `/api/admin/incidents/${id}/resolve`, {
    action,
    replacement_worker_id: replacementWorkerId,
    notes,
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Review Management & Worker Grading (Admin Governance)
// ═══════════════════════════════════════════════════════════════════════

export type WorkerGrade = "A" | "B" | "C";

export interface AdminReviewRow {
  id: string;
  job_id: string;
  rating_overall: number;
  rating_quality: number | null;
  rating_punctuality: number | null;
  rating_attitude: number | null;
  rating_cleanliness: number | null;
  rating_communication: number | null;
  tags: string[];
  comment: string;
  is_verified: boolean;
  is_flagged: boolean;
  flagged_reason: string | null;
  dispute_status: "none" | "pending" | "resolved";
  dispute_images: string[] | null;
  created_at: string;
  reviewer_name: string;
  reviewer_id: string;
  reviewee_name: string;
  reviewee_id: string;
  worker_grade: WorkerGrade;
  shadow_banned_at: string | null;
  /** ผล AI-flag scan (คืนจาก backend) */
  ai_flag: string | null;
}

export interface AdminDisputeRow {
  id: string;
  job_id: string;
  comment: string;
  rating_overall: number;
  dispute_text: string;
  dispute_images: string[];
  dispute_status: string;
  dispute_resolution: string | null;
  flagged_reason: string | null;
  created_at: string;
  reviewer_name: string;
  reviewee_name: string;
  reviewee_id: string;
}

export interface AdminWorkerRow {
  id: string;
  full_name: string;
  email: string;
  worker_grade: WorkerGrade;
  shadow_banned_at: string | null;
  ban_reason: string | null;
  avg_rating: number;
  total_reviews: number;
  total_jobs: number;
  success_rate: number;
  cert_count: number;
  is_vvip_eligible: boolean;
  last_calculated: string | null;
}

/** GET /api/admin/reviews — รายการรีวิวทั้งหมด พร้อม AI flag */
export function getAdminReviews(params?: {
  flagged?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ reviews: AdminReviewRow[]; total: number }> {
  const q = new URLSearchParams();
  if (params?.flagged !== undefined) q.set("flagged", String(params.flagged));
  if (params?.limit)  q.set("limit",  String(params.limit));
  if (params?.offset) q.set("offset", String(params.offset));
  return request("GET", `/api/admin/reviews?${q}`);
}

/** PATCH /api/admin/reviews/:id/verify */
export function adminVerifyReview(
  reviewId: string,
  verified: boolean
): Promise<{ success: boolean; is_verified: boolean }> {
  return request("PATCH", `/api/admin/reviews/${reviewId}/verify`, { verified });
}

/** PATCH /api/admin/reviews/:id/flag */
export function adminFlagReview(
  reviewId: string,
  isFlagged: boolean,
  flaggedReason = ""
): Promise<{ success: boolean }> {
  return request("PATCH", `/api/admin/reviews/${reviewId}/flag`, {
    is_flagged: isFlagged,
    flagged_reason: flaggedReason,
  });
}

/** PATCH /api/admin/workers/:id/shadow-ban */
export function adminShadowBanWorker(
  workerId: string,
  reason: string
): Promise<{ success: boolean }> {
  return request("PATCH", `/api/admin/workers/${workerId}/shadow-ban`, { reason });
}

/** PATCH /api/admin/workers/:id/shadow-ban/lift */
export function adminLiftShadowBan(
  workerId: string
): Promise<{ success: boolean }> {
  return request("PATCH", `/api/admin/workers/${workerId}/shadow-ban/lift`, {});
}

/** GET /api/admin/disputes */
export function getAdminDisputes(
  status: "pending" | "resolved" | "all" = "pending"
): Promise<{ disputes: AdminDisputeRow[] }> {
  return request("GET", `/api/admin/disputes?status=${status}`);
}

/** PATCH /api/admin/disputes/:id/resolve */
export function adminResolveDispute(
  reviewId: string,
  resolution: string,
  favor: "worker" | "client"
): Promise<{ success: boolean; dispute_status: string }> {
  return request("PATCH", `/api/admin/disputes/${reviewId}/resolve`, {
    resolution,
    favor,
  });
}

/** GET /api/admin/workers — รายการ Worker พร้อม Grade */
export function getAdminWorkers(params?: {
  grade?: WorkerGrade;
  limit?: number;
}): Promise<{ workers: AdminWorkerRow[] }> {
  const q = new URLSearchParams();
  if (params?.grade)  q.set("grade",  params.grade);
  if (params?.limit)  q.set("limit",  String(params.limit));
  return request("GET", `/api/admin/workers?${q}`);
}

// ============ Legal Compliance (Admin) ============
export interface CompliancePolicy {
  id: string;
  type: string;
  version: string;
  content: string;
  is_active: boolean;
  created_at: string;
  published_at?: string;
  notes?: string;
  content_length?: number;
  created_by_name?: string;
  created_by_email?: string;
}

export interface CompliancePoliciesResponse {
  policies: CompliancePolicy[];
}

export interface CompliancePolicyResponse {
  policy: CompliancePolicy;
}

export function getAllCompliancePolicies(): Promise<CompliancePoliciesResponse> {
  return request("GET", "/api/admin/compliance/all");
}

export function getCompliancePolicy(id: string): Promise<CompliancePolicyResponse> {
  return request("GET", `/api/admin/compliance/${id}`);
}

export function createCompliancePolicy(body: {
  type: string;
  version: string;
  content: string;
  notes?: string;
}): Promise<{ success: boolean; policy: CompliancePolicy }> {
  return request("POST", "/api/admin/compliance", body);
}

export function activateCompliancePolicy(id: string): Promise<{ success: boolean; message: string }> {
  return request("PATCH", `/api/admin/compliance/${id}/activate`);
}

// ============ Insurance Claims (Admin) ============

export interface InsuranceClaimRow {
  id:                 string;
  job_id:             string;
  job_title?:         string;
  job_category?:      string;
  has_insurance?:     boolean;
  insurance_amount?:  number;
  claim_status:       'pending' | 'approved' | 'rejected';
  original_price:     number;
  replacement_payout: number;
  reserve_amount:     number;
  evidence_text?:     string;
  admin_note?:        string;
  claimed_at?:        string;
  resolved_at?:       string;
  client_name?:       string;
  client_email?:      string;
  worker_name?:       string;
  worker_email?:      string;
  worker_avatar?:     string;
  worker_grade?:      string;
}

export function getAdminInsuranceClaims(params?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ claims: InsuranceClaimRow[]; total: number }> {
  const q = new URLSearchParams();
  if (params?.status) q.set('status', params.status);
  if (params?.limit)  q.set('limit',  String(params.limit));
  if (params?.offset) q.set('offset', String(params.offset));
  return request('GET', `/api/admin/insurance/claims?${q}`);
}

export function approveInsuranceClaim(
  id: string, body: { admin_note?: string; replacement_worker_id?: string }
): Promise<{ success: boolean; replacement_payout: number }> {
  return request('PATCH', `/api/admin/insurance/claims/${id}/approve`, body);
}

export function rejectInsuranceClaim(
  id: string, body: { admin_note?: string }
): Promise<{ success: boolean }> {
  return request('PATCH', `/api/admin/insurance/claims/${id}/reject`, body);
}

export function getCompliancePolicyHistory(type: string): Promise<CompliancePoliciesResponse> {
  return request("GET", `/api/compliance/${type}/history`);
}

// ============ PDPA & Law Enforcement (Legal Compliance) ============
export interface AccountDeletionRequest {
  id: string;
  user_id: string;
  reason: string | null;
  status: string;
  requested_at: string;
  processed_at: string | null;
  scheduled_deletion_date: string | null;
  admin_notes: string | null;
  full_name: string | null;
  email: string | null;
  account_status: string | null;
}

export function getAdminAccountDeletions(status?: string): Promise<{ requests: AccountDeletionRequest[] }> {
  const q = status ? `?status=${status}` : "?status=pending";
  return request("GET", `/api/admin/account-deletions${q}`);
}

export function patchAdminAccountDeletion(
  id: string,
  body: { status: "approved" | "rejected"; admin_notes?: string }
): Promise<{ success: boolean; scheduled_deletion_date?: string }> {
  return request("PATCH", `/api/admin/account-deletions/${id}`, body);
}

export interface PdpaExportRequest {
  id: string;
  user_id: string;
  status: string;
  requested_at: string;
  deadline: string | null;
  processed_at: string | null;
  admin_notes: string | null;
  full_name: string | null;
  email: string | null;
}

export function getAdminPdpaExport(status?: string): Promise<{ requests: PdpaExportRequest[] }> {
  const q = status ? `?status=${status}` : "?status=pending";
  return request("GET", `/api/admin/pdpa-export${q}`);
}

export function patchAdminPdpaExport(
  id: string,
  body: { status: "processing" | "completed" | "rejected"; admin_notes?: string; export_file_url?: string }
): Promise<{ success: boolean }> {
  return request("PATCH", `/api/admin/pdpa-export/${id}`, body);
}

export interface LawEnforcementRequest {
  id: string;
  case_id: string | null;
  agency: string | null;
  target_user_id: string | null;
  request_type: string;
  documents: unknown;
  deadline: string | null;
  status: string;
  requested_at: string;
  responded_at: string | null;
  response_notes: string | null;
  target_name: string | null;
  target_email: string | null;
}

export function getAdminLawEnforcement(): Promise<{ requests: LawEnforcementRequest[] }> {
  return request("GET", "/api/admin/law-enforcement");
}

export function postAdminLawEnforcement(body: {
  case_id?: string;
  agency?: string;
  target_user_id?: string;
  request_type?: string;
  documents?: unknown;
  deadline?: string;
}): Promise<{ success: boolean; request: LawEnforcementRequest }> {
  return request("POST", "/api/admin/law-enforcement", body);
}

export function patchAdminLawEnforcement(
  id: string,
  body: { status: "processing" | "responded" | "rejected"; response_notes?: string }
): Promise<{ success: boolean }> {
  return request("PATCH", `/api/admin/law-enforcement/${id}`, body);
}

export interface RescueNetStatsResponse {
  ok?: boolean;
  summary?: { totalRevenue: number; totalOrders: number };
  bySku?: Array<{ product_sku: string; cnt: number; revenue: string | number }>;
  recentPurchases?: Array<{
    id: string;
    product_sku: string;
    product_name: string | null;
    total_charged: string | number;
    created_at: string;
    user_id: string;
  }>;
  warning?: string;
}

export function getRescueNetStats(): Promise<RescueNetStatsResponse> {
  return request("GET", "/api/admin/telecom/rescue-net-stats");
}
