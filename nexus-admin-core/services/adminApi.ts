/**
 * Phase 4: Admin dashboard API client.
 * All requests use JWT (Bearer). No admin API without authentication.
 */

export const ADMIN_API_BASE =
  (typeof import.meta !== "undefined" &&
    (import.meta as any).env?.VITE_ADMIN_API_URL) ||
  "http://localhost:3001";

let _token: string | null = null;

export function setAdminToken(token: string | null): void {
  _token = token;
}

export function getAdminToken(): string | null {
  return _token;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const url = path.startsWith("http") ? path : `${ADMIN_API_BASE}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (_token) headers["Authorization"] = `Bearer ${_token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string; details?: string };
    const msg = err.details ? `${err.error || res.statusText}: ${err.details}` : (err.error || res.statusText || `HTTP ${res.status}`);
    const e = new Error(msg) as Error & { status?: number };
    e.status = res.status;
    throw e;
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
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

// ============ Insurance Vault (Liability 60/40) ============
export interface InsuranceSettingsResponse {
  insurance_rate_percent: number;
  updated_at?: string;
  updated_by?: string;
  category_rates?: Record<string, number>;
}

export interface InsuranceSummaryResponse {
  total_insurance_collected: number;
  total_insurance_paid_out: number;
  current_insurance_balance: number;
  reserve_60: number;
  manageable_40: number;
  already_withdrawn_for_investment: number;
  allowed_to_withdraw: number;
  source?: string;
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
  lastUpdated: string;
  createdAt: string;
}

export interface SupportMessageRow {
  id: string;
  ticketId: string;
  sender: string;
  message: string;
  timestamp: string;
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
  asBot?: boolean
): Promise<{ message: SupportMessageRow }> {
  return request("POST", `/api/admin/support/tickets/${ticketId}/messages`, {
    message,
    asBot: !!asBot,
  });
}

export function resolveSupportTicket(
  ticketId: string,
  status: string
): Promise<{ ticket: SupportTicketRow }> {
  return request("PATCH", `/api/admin/support/tickets/${ticketId}`, { status });
}

export function getSupportAiSuggestion(ticketId: string): Promise<{ suggestion: string }> {
  return request("POST", "/api/admin/support/ai-suggest", { ticketId });
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
