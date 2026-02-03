/**
 * Phase 4: Admin dashboard API client.
 * All requests use JWT (Bearer). No admin API without authentication.
 */

const ADMIN_API_BASE =
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
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || res.statusText || `HTTP ${res.status}`);
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
  firebase_uid?: string;
  email: string;
  phone?: string;
  full_name?: string;
  kyc_status?: string;
  account_status?: string;
  created_at: string;
  role: string;
}

export interface AdminUsersResponse {
  users: AdminUserRow[];
  pagination: { limit: number; offset: number; total: number };
}

export function getAdminUsers(params?: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<AdminUsersResponse> {
  const sp = new URLSearchParams();
  if (params?.search) sp.set("search", params.search);
  if (params?.limit != null) sp.set("limit", String(params.limit));
  if (params?.offset != null) sp.set("offset", String(params.offset));
  const q = sp.toString();
  return request<AdminUsersResponse>(
    "GET",
    "/api/admin/users" + (q ? "?" + q : "")
  );
}

export interface AdminUserDetail {
  user: AdminUserRow & {
    kyc_level?: string;
    updated_at?: string;
    wallet_balance?: number;
  };
}

export function getAdminUser(id: string): Promise<AdminUserDetail> {
  return request<AdminUserDetail>("GET", `/api/admin/users/${encodeURIComponent(id)}`);
}

export function updateAdminUserRole(
  id: string,
  role: "USER" | "ADMIN" | "AUDITOR"
): Promise<{ success: boolean; user_id: string; role: string }> {
  return request("PATCH", `/api/admin/users/${encodeURIComponent(id)}/role`, {
    role,
  });
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
  return request<KycListResponse>(
    "GET",
    "/api/admin/kyc" + (q ? "?" + q : "")
  );
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
  return request("POST", `/api/admin/kyc/${encodeURIComponent(userId)}/approve`, {});
}

export function rejectKyc(
  userId: string,
  reason?: string
): Promise<{ success: boolean; kyc_status: string }> {
  return request("POST", `/api/admin/kyc/${encodeURIComponent(userId)}/reject`, {
    reason: reason || "Rejected by admin",
  });
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

// Phase 4D: Audit Logs (filters: date range, entity_type, action, actor_id)
export interface AuditLogRow {
  id: number;
  actor_type: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  state_before: unknown;
  state_after: unknown;
  reason: string | null;
  correlation_id: string | null;
  created_at: string;
}

export interface AuditLogsResponse {
  logs: AuditLogRow[];
  count: number;
}

export function getAuditLogs(params?: {
  from_date?: string;
  to_date?: string;
  entity_type?: string;
  action?: string;
  actor_id?: string;
  limit?: number;
}): Promise<AuditLogsResponse> {
  const sp = new URLSearchParams();
  if (params?.from_date) sp.set("from_date", params.from_date);
  if (params?.to_date) sp.set("to_date", params.to_date);
  if (params?.entity_type) sp.set("entity_type", params.entity_type);
  if (params?.action) sp.set("action", params.action);
  if (params?.actor_id) sp.set("actor_id", params.actor_id);
  if (params?.limit != null) sp.set("limit", String(params.limit));
  const q = sp.toString();
  return request<AuditLogsResponse>(
    "GET",
    "/api/audit/logs" + (q ? "?" + q : "")
  );
}
