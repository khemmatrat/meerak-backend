/**
 * Phase 4: Admin dashboard API client.
 * All requests use JWT (Bearer). No admin API without authentication.
 * - Dev: base = "" → ใช้ Vite proxy ไปที่ VITE_ADMIN_API_URL (vite.config)
 * - Prod: VITE_ADMIN_API_URL ตอน build ถ้ามี — ไม่มี fallback เป็น https://api.aqond.com
 *   (กันเคส build ลืม env แล้ว request ไป localhost โดยไม่ตั้งใจ)
 */
import type {
  AdminUser,
  ManualSettlementRecord,
  PersonalSettlementAccount,
} from "../types";

const PRODUCTION_API = "https://api.aqond.com";

/** ถ้า production build ฝัง VITE_ADMIN_API_URL เป็น localhost (หลง copy .env dev) — ห้ามใช้ */
function isLocalhostApiUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "::1";
  } catch {
    return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(url.trim());
  }
}

function resolveAdminApiBase(): string {
  if (typeof import.meta === "undefined") return PRODUCTION_API;
  const env = (import.meta as any).env;
  if (env?.DEV) return "";
  const u = env?.VITE_ADMIN_API_URL;
  if (typeof u === "string" && u.trim()) {
    const trimmed = u.replace(/\/$/, "");
    if (env?.PROD && isLocalhostApiUrl(trimmed)) {
      console.warn(
        "[adminApi] VITE_ADMIN_API_URL is localhost in production build — using",
        PRODUCTION_API,
      );
      return PRODUCTION_API;
    }
    return trimmed;
  }
  return PRODUCTION_API;
}

export const ADMIN_API_BASE = resolveAdminApiBase();

/** Origin สำหรับ Socket.IO (ไม่รวม path /api) */
export function getAdminSocketOrigin(): string {
  if (typeof window === "undefined") return "";
  const base = ADMIN_API_BASE?.replace(/\/$/, "") || "";
  return base || window.location.origin;
}

const ADMIN_TOKEN_KEY = "nexus_admin_token";

function getStoredToken(): string | null {
  try {
    return typeof localStorage !== "undefined"
      ? localStorage.getItem(ADMIN_TOKEN_KEY)
      : null;
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

/** จาก Error ที่ throw จาก request() — รองรับ backend { error, message } */
export function getAdminApiErrorCode(e: unknown): string | undefined {
  return (e as Error & { code?: string })?.code;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<T> {
  const url = path.startsWith("http") ? path : `${ADMIN_API_BASE}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const tok = getAdminToken();
  if (tok) headers["Authorization"] = `Bearer ${tok}`;

  const timeoutMs = options?.timeoutMs ?? 0;
  const controller = timeoutMs > 0 ? new AbortController() : null;
  const timeoutId =
    controller && timeoutMs > 0
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
      let err: {
        error?: string;
        details?: string;
        message?: string;
        code?: string;
      } = {};
      try {
        if (text.startsWith("{")) err = JSON.parse(text);
        else if (text.startsWith("<"))
          err = {
            error: `Server returned HTML (${res.status}). Check API URL.`,
          };
        else err = { error: text.slice(0, 200) };
      } catch {
        err = { error: res.statusText || `HTTP ${res.status}` };
      }
      const msg = err.details
        ? `${err.error || res.statusText}: ${err.details}`
        : err.message && String(err.message).trim()
          ? [err.error, err.message].filter(Boolean).join(": ")
          : err.error || res.statusText || `HTTP ${res.status}`;
      const e = new Error(msg) as Error & { status?: number; code?: string };
      e.status = res.status;
      e.code =
        typeof err.code === "string"
          ? err.code
          : typeof err.error === "string" && err.error.includes("_")
            ? err.error
            : undefined;
      throw e;
    }
    if (res.status === 204) return undefined as T;
    if (text.startsWith("<")) {
      throw new Error(
        "API returned HTML instead of JSON. Check that VITE_ADMIN_API_URL points to https://api.aqond.com and the backend is running.",
      );
    }
    if (!text || !text.trim()) {
      throw new Error(
        `API returned empty response (status ${res.status}). URL: ${url}. Check CORS allows Origin from admin.`,
      );
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      const preview = text.length > 100 ? text.slice(0, 100) + "..." : text;
      const hint =
        url.startsWith("http") && !url.includes("api.aqond.com")
          ? " (ควรเป็น https://api.aqond.com — rebuild Admin ด้วย VITE_ADMIN_API_URL=https://api.aqond.com)"
          : "";
      throw new Error(
        `Server returned invalid JSON. URL: ${url} | Status: ${res.status} | Response: ${preview.replace(/\n/g, " ")}${hint}`,
      );
    }
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export interface AdminLoginUser {
  id: string;
  email: string;
  name: string;
  role: string;
  avatar_url?: string | null;
  permissions?: string[];
}

function founderAvatarPublicPath(): string {
  const b =
    (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL || "/";
  return b.endsWith("/") ? `${b}founder-avatar.png` : `${b}/founder-avatar.png`;
}

/** LoginView + App — restore session หลังรีเฟรช (token อยู่ localStorage แต่ React state หาย) */
export function mapLoginUserToAdminUser(u: AdminLoginUser): AdminUser {
  const env =
    (import.meta as { env?: Record<string, string | undefined> }).env || {};
  const envUrl = env.VITE_ADMIN_AVATAR_URL;
  const avatar = u.avatar_url
    ? u.avatar_url
    : envUrl
      ? envUrl
      : founderAvatarPublicPath();
  const nameOverride = env.VITE_ADMIN_DISPLAY_NAME?.trim();
  const name = nameOverride || u.name || u.email;
  return {
    id: u.id,
    email: u.email,
    name,
    role: u.role as AdminUser["role"],
    avatar,
    permissions: Array.isArray(u.permissions) ? u.permissions.map(String) : [],
  };
}

export async function fetchAdminSession(): Promise<{ user: AdminLoginUser }> {
  return request<{ user: AdminLoginUser }>("GET", "/api/auth/admin-session");
}

/** ล็อกอินสำเร็จ (ไม่บังคับ MFA ใน env) */
export interface AdminLoginSuccess {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: AdminLoginUser;
}

/** รอรหัส 6 หลักจาก Authenticator — backend ส่ง requires_totp */
export interface AdminLoginMfaRequired {
  mfa_required?: true;
  requires_totp?: true;
  mfa_token: string;
  user: AdminLoginUser;
}

/** ยังไม่ลงทะเบียน TOTP — สแกน QR แล้วยืนยัน */
export interface AdminLoginMfaSetupRequired {
  mfa_setup_required: true;
  mfa_token: string;
  user: AdminLoginUser;
}

export type AdminLoginResponse =
  | AdminLoginSuccess
  | AdminLoginMfaRequired
  | AdminLoginMfaSetupRequired;

export function adminLogin(
  email: string,
  password: string,
): Promise<AdminLoginResponse> {
  return request<AdminLoginResponse>("POST", "/api/auth/admin-login", {
    email,
    password,
  });
}

// MFA ใช้ body แทน Bearer — ไม่แนบ Authorization
async function requestNoAuth<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = path.startsWith("http") ? path : `${ADMIN_API_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    let err: { error?: string; details?: string } = {};
    try {
      if (text.startsWith("{")) err = JSON.parse(text);
      else err = { error: text.slice(0, 200) };
    } catch {
      err = { error: res.statusText || `HTTP ${res.status}` };
    }
    const msg = err.details
      ? `${err.error || res.statusText}: ${err.details}`
      : err.error || res.statusText || `HTTP ${res.status}`;
    const e = new Error(msg) as Error & { status?: number };
    e.status = res.status;
    throw e;
  }
  if (!text || !text.trim()) {
    throw new Error(`Empty response (${res.status})`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON from ${url}`);
  }
}

export interface AdminMfaSetupStartResponse {
  qr_data_url: string;
  otpauth_url: string;
}

export function adminMfaSetupStart(
  mfaToken: string,
): Promise<AdminMfaSetupStartResponse> {
  return requestNoAuth<AdminMfaSetupStartResponse>(
    "POST",
    "/api/auth/admin-mfa/setup-start",
    {
      mfa_token: mfaToken,
    },
  );
}

export function adminMfaSetupFinish(
  mfaToken: string,
  code: string,
): Promise<AdminLoginSuccess> {
  return requestNoAuth<AdminLoginSuccess>(
    "POST",
    "/api/auth/admin-mfa/setup-finish",
    {
      mfa_token: mfaToken,
      code,
    },
  );
}

export function adminMfaVerify(
  mfaToken: string,
  code: string,
): Promise<AdminLoginSuccess> {
  return requestNoAuth<AdminLoginSuccess>(
    "POST",
    "/api/auth/admin-login/totp",
    {
      mfa_token: mfaToken,
      totp_code: code,
    },
  );
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
  status?: string | null;
  focused?: boolean;
}

export function getJobOperationsQueueBacklog(params?: {
  job_type?: string;
  limit?: number;
  job_id?: string;
}): Promise<{ items: JobQueueBacklogItem[]; total: number }> {
  const q = new URLSearchParams();
  if (params?.job_type) q.set("job_type", params.job_type);
  if (params?.limit != null) q.set("limit", String(params.limit));
  if (params?.job_id) q.set("job_id", params.job_id);
  const qs = q.toString();
  return request<{ items: JobQueueBacklogItem[]; total: number }>(
    "GET",
    `/api/admin/job-operations/queue-backlog${qs ? `?${qs}` : ""}`,
  );
}

// Dashboard Overview (รวมข้อมูลจริงจาก Backend)
export type DashboardRange = "today" | "week" | "month";

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
  chart_data: Array<{
    name: string;
    users: number;
    revenue: number;
    sessions: number;
  }>;
  recent_logs: Array<{
    id: string;
    timestamp: string;
    level: string;
    message: string;
    source: string;
    ip?: string;
  }>;
  from_date: string;
  to_date: string;
  range: string;
}

export function getDashboardOverview(
  range?: DashboardRange,
): Promise<DashboardOverviewResponse> {
  const q = range ? `?range=${range}` : "";
  return request<DashboardOverviewResponse>(
    "GET",
    "/api/admin/dashboard/overview" + q,
  );
}

export function getStabilityFund(): Promise<{
  total_reserve_cash: number;
  projected_monthly_interest: number;
  annual_rate_percent: number;
}> {
  return request("GET", "/api/admin/stability-fund");
}

export function runMaturityRewardsCheck(): Promise<{
  success: boolean;
  message: string;
}> {
  return request("POST", "/api/admin/maturity-rewards/run");
}

// AI Dashboard Insight — Backend ดึงและสรุปข้อมูลจาก DB เอง (Token Optimization)
export function fetchDashboardInsight(): Promise<{ insight: string }> {
  return request<{ insight: string }>(
    "POST",
    "/api/admin/ai/dashboard-insight",
    {},
  );
}

// Circuit Breakers
export interface CircuitBreakersStatusResponse {
  circuit_breakers: Record<string, string>;
  redis_available: boolean;
}

export function getCircuitBreakersStatus(): Promise<CircuitBreakersStatusResponse> {
  return request<CircuitBreakersStatusResponse>(
    "GET",
    "/api/admin/circuit-breakers/status",
  );
}

export function tripCircuitBreaker(
  service: string,
): Promise<{ service: string; status: string }> {
  return request("POST", "/api/admin/circuit-breakers/trip", { service });
}

export function resetCircuitBreaker(
  service: string,
): Promise<{ service: string; status: string }> {
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
  status: "OPERATIONAL" | "CONGESTED" | "STALLED";
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
  daily: Array<{
    date: string;
    jobsCompleted: number;
    payoutsProcessed: number;
    paymentFailed: number;
  }>;
  days: number;
}

export interface WorkerQueueAlertsResponse {
  alerts: Array<{ queue: string; type: string; count?: number }>;
  thresholds: { congested: number; stalled: number };
}

export function getWorkerQueues(): Promise<WorkerQueuesResponse> {
  return request("GET", "/api/admin/worker-queues", undefined, {
    timeoutMs: 15000,
  });
}

export function scaleWorkerQueue(
  name: string,
  workers: number,
): Promise<{ queue: string; desiredWorkers: number; message: string }> {
  return request(
    "POST",
    `/api/admin/worker-queues/${encodeURIComponent(name)}/scale`,
    { workers },
  );
}

export function verifyWorkerQueue(name: string): Promise<{
  queue: string;
  action: string;
  failedCount?: number;
  pendingCount?: number;
  hint?: string;
  message?: string;
}> {
  return request(
    "POST",
    `/api/admin/worker-queues/${encodeURIComponent(name)}/verify`,
    {},
  );
}

export function pauseWorkerQueue(
  name: string,
): Promise<{ queue: string; paused: boolean }> {
  return request(
    "POST",
    `/api/admin/worker-queues/${encodeURIComponent(name)}/pause`,
    {},
  );
}

export function resumeWorkerQueue(
  name: string,
): Promise<{ queue: string; paused: boolean }> {
  return request(
    "POST",
    `/api/admin/worker-queues/${encodeURIComponent(name)}/resume`,
    {},
  );
}

export function retryPaymentFailed(body?: {
  ledger_id?: string;
  limit?: number;
}): Promise<{ added: number; total: number; message: string }> {
  return request(
    "POST",
    "/api/admin/worker-queues/payment-failed/retry",
    body || {},
  );
}

export function getWorkerQueueMetrics(
  days?: number,
): Promise<WorkerQueueMetricsResponse> {
  const q = days != null ? `?days=${days}` : "";
  return request("GET", "/api/admin/worker-queues/metrics" + q, undefined, {
    timeoutMs: 15000,
  });
}

export function getWorkerQueueAlerts(): Promise<WorkerQueueAlertsResponse> {
  return request("GET", "/api/admin/worker-queues/alerts", undefined, {
    timeoutMs: 15000,
  });
}

export function setWorkerQueueAlertThresholds(body: {
  congested?: number;
  stalled?: number;
}): Promise<{ thresholds: { congested: number; stalled: number } }> {
  return request("POST", "/api/admin/worker-queues/alerts/thresholds", body);
}

// Staff & Access Control
export interface StaffMember {
  id: string;
  full_name: string;
  email: string;
  /** อีเมลติดต่อ/แจ้งเตือน — ถ้าไม่มีให้ใช้ email ล็อกอิน */
  contact_email?: string | null;
  role: "super_admin" | "admin" | "moderator" | "support";
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
  /** อีเมลล็อกอิน Admin Panel */
  email: string;
  /** อีเมลติดต่อ/แจ้งเตือน (ไม่บังคับ — ถ้าว่างใช้อีเมลล็อกอินแทน) */
  contact_email?: string;
  role?: "super_admin" | "admin" | "moderator" | "support";
  department?: string;
  /** บังคับเมื่อ role=super_admin หรือ admin — สร้าง users+user_roles */
  password?: string;
}): Promise<StaffMember> {
  return request<StaffMember>("POST", "/api/admin/staff", data);
}

export function updateStaffStatus(
  id: string,
  status: "active" | "inactive",
): Promise<{ id: string; status: string }> {
  return request("PATCH", `/api/admin/staff/${encodeURIComponent(id)}/status`, {
    status,
  });
}

export function updateStaffPermissions(
  id: string,
  permissions: string[],
): Promise<{ id: string; permissions: string[] }> {
  return request(
    "PATCH",
    `/api/admin/staff/${encodeURIComponent(id)}/permissions`,
    { permissions },
  );
}

/** Super Admin — ส่งอีเมลถึงผู้ใช้จาก email/contact_email ใน DB */
export function postAdminEmailBroadcast(body: {
  subject: string;
  text: string;
  preview?: boolean;
}): Promise<{
  preview?: boolean;
  recipient_count?: number;
  max_recipients?: number;
  sample?: string[];
  success?: boolean;
  sent?: number;
  failed?: number;
  failure_sample?: Array<{ to: string; error?: string }>;
}> {
  return request("POST", "/api/admin/communications/email-broadcast", body);
}

export interface AdminUserRow {
  id: string;
  email: string;
  contact_email?: string | null;
  phone?: string;
  full_name?: string;
  kyc_status?: string;
  account_status?: string;
  created_at: string;
  last_login_at?: string;
  role: string;
  is_vip?: boolean;
  /** Tier 4 — reconcile trend from reconcile_alert_log */
  reconcile_fail_count_30d?: number;
  is_reconcile_repeat?: boolean;
  open_support_case_id?: string | null;
  open_support_case_priority?: string | null;
  needs_ops_attention?: boolean;
  /** Tier 5 — lightweight reconcile snapshot (list page) */
  reconcile_status?: "pass" | "warn" | "skip";
  reconcile_verdict?: string;
  reconcile_verdict_th?: string;
  reconcile_variance?: number;
  /** Brand Adviser (migration 135 + backend) */
  is_brand_adviser?: boolean;
  adviser_status?: string | null;
  adviser_reputation_score?: number;
  adviser_public_slug?: string | null;
  adviser_public_profile_enabled?: boolean;
  adviser_granted_at?: string | null;
  adviser_suspended_at?: string | null;
  adviser_suspended_reason?: string | null;
  /** Closed beta cohort (migration 149) */
  is_beta_tester?: boolean;
  beta_tester_number?: number;
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
  /** Only closed-beta testers */
  beta_tester?: boolean;
  reconcile_repeat?: boolean;
  ops_attention?: boolean;
  sort?: "reconcile_fails" | "created_at";
}): Promise<AdminUsersResponse> {
  const sp = new URLSearchParams();
  if (params?.search) sp.set("search", params.search);
  if (params?.limit != null) sp.set("limit", String(params.limit));
  if (params?.offset != null) sp.set("offset", String(params.offset));
  if (params?.role) sp.set("role", params.role);
  if (params?.status) sp.set("status", params.status);
  if (params?.kyc_status) sp.set("kyc_status", params.kyc_status);
  if (params?.vip === true) sp.set("vip", "1");
  if (params?.beta_tester === true) sp.set("beta_tester", "1");
  if (params?.reconcile_repeat === true) sp.set("reconcile_repeat", "1");
  if (params?.ops_attention === true) sp.set("ops_attention", "1");
  if (params?.sort) sp.set("sort", params.sort);
  const q = sp.toString();
  return request<AdminUsersResponse>(
    "GET",
    "/api/admin/users" + (q ? "?" + q : ""),
  );
}

export async function downloadAdminOpsQueueCsv(limit = 500): Promise<void> {
  const token = getAdminToken();
  const path = `/api/admin/users/ops-queue/export.csv?limit=${encodeURIComponent(String(limit))}`;
  const url = path.startsWith("http") ? path : `${ADMIN_API_BASE}${path}`;
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const stamp = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ops-queue-${stamp}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export interface LandingPageLeadRow {
  id: string;
  created_at: string;
  source: string;
  full_name: string | null;
  contact: string;
  interest_service: string | null;
  first_name: string | null;
  last_name: string | null;
  national_id: string | null;
  date_of_birth: string | null;
  address: string | null;
  kyc_started: boolean;
}

export function getAdminLandingLeads(params?: {
  limit?: number;
  offset?: number;
}): Promise<{
  leads: LandingPageLeadRow[];
  pagination: { limit: number; offset: number; total: number };
  warning?: string;
}> {
  const sp = new URLSearchParams();
  if (params?.limit != null) sp.set("limit", String(params.limit));
  if (params?.offset != null) sp.set("offset", String(params.offset));
  const q = sp.toString();
  return request("GET", "/api/admin/landing-leads" + (q ? "?" + q : ""));
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
    `/api/admin/users/${encodeURIComponent(id)}`,
  );
}

export function updateAdminUserRole(
  id: string,
  role: "USER" | "ADMIN" | "AUDITOR",
  reason?: string,
): Promise<{ success: boolean; user_id: string; role: string }> {
  return request("PATCH", `/api/admin/users/${encodeURIComponent(id)}/role`, {
    role,
    reason,
  });
}

// Account Control (ADMIN only; audit)
export function suspendAdminUser(
  id: string,
  reason?: string,
): Promise<{ success: boolean; user_id: string; account_status: string }> {
  return request("POST", `/api/admin/users/${encodeURIComponent(id)}/suspend`, {
    reason,
  });
}
export function banAdminUser(
  id: string,
  reason?: string,
  banDays?: number,
): Promise<{
  success: boolean;
  user_id: string;
  account_status: string;
  banned_until?: string | null;
}> {
  return request("POST", `/api/admin/users/${encodeURIComponent(id)}/ban`, {
    reason: reason || "Banned by admin",
    ban_days: banDays,
  });
}
export function reactivateAdminUser(
  id: string,
  reason?: string,
): Promise<{ success: boolean; user_id: string; account_status: string }> {
  return request(
    "POST",
    `/api/admin/users/${encodeURIComponent(id)}/reactivate`,
    { reason },
  );
}

export interface RateLimitUnlockResponse {
  ok: boolean;
  message: string;
  cleared: { cleared: number; redis: number; memory: number };
  unlock: {
    unlocked: boolean;
    expires_at: string | null;
    source: string | null;
    self_unlocks_used_today: number;
    self_unlocks_remaining_today: number;
    self_unlock_daily_limit: number;
  };
}

export function unlockAdminUserRateLimit(
  id: string,
  reason?: string,
): Promise<RateLimitUnlockResponse> {
  return request(
    "POST",
    `/api/admin/users/${encodeURIComponent(id)}/rate-limit/unlock`,
    { reason: reason || "Admin rate-limit unlock" },
  );
}

/** Brand Adviser — มอบสิทธิ์ (ADMIN only) */
export function grantBrandAdviserAdminUser(
  id: string,
  reason?: string,
): Promise<{
  success: boolean;
  user_id: string;
  is_brand_adviser: boolean;
  adviser_status: string | null;
}> {
  return request(
    "POST",
    `/api/admin/users/${encodeURIComponent(id)}/brand-adviser/grant`,
    {
      reason: reason || undefined,
    },
  );
}

/** Brand Adviser — ถอดสิทธิ์ (ADMIN only) */
export function revokeBrandAdviserAdminUser(
  id: string,
  reason?: string,
): Promise<{
  success: boolean;
  user_id: string;
  is_brand_adviser: boolean;
  adviser_status: string | null;
}> {
  return request(
    "POST",
    `/api/admin/users/${encodeURIComponent(id)}/brand-adviser/revoke`,
    {
      reason: reason || undefined,
    },
  );
}

/** PATCH /api/admin/users/:id/wallet-freeze — ระงับเงิน (Platform Safety Authority) */
export function walletFreezeAdminUser(
  id: string,
  frozen: boolean,
): Promise<{ success: boolean; user_id: string; wallet_frozen: boolean }> {
  return request(
    "PATCH",
    `/api/admin/users/${encodeURIComponent(id)}/wallet-freeze`,
    {
      frozen,
    },
  );
}
export function forceLogoutAdminUser(
  id: string,
  reason?: string,
): Promise<{ success: boolean; user_id: string; message?: string }> {
  return request(
    "POST",
    `/api/admin/users/${encodeURIComponent(id)}/force-logout`,
    { reason },
  );
}

/** Emergency Kill Switch: Ban + wallet_frozen + force_logout */
export function emergencySuspendUser(
  id: string,
  reason?: string,
): Promise<{
  success: boolean;
  user_id: string;
  account_status: string;
  wallet_frozen: boolean;
}> {
  return request(
    "POST",
    `/api/admin/users/${encodeURIComponent(id)}/emergency-suspend`,
    { reason },
  );
}

/** Admin Ghost: generate short-lived impersonation token */
export function createImpersonationToken(
  userId: string,
  expiresMinutes?: number,
): Promise<{
  success: boolean;
  token: string;
  expires_minutes: number;
  expires_at: string;
}> {
  return request(
    "POST",
    `/api/admin/users/${encodeURIComponent(userId)}/impersonate-token`,
    {
      expires_minutes: expiresMinutes ?? 15,
    },
  );
}

/** Last N login sessions (IP + User-Agent) */
export function getAdminUserLoginSessions(
  userId: string,
  limit?: number,
): Promise<{
  sessions: Array<{
    id: string;
    ip_address: string | null;
    user_agent: string;
    created_at: string | null;
  }>;
  device_hopping_24h: boolean;
}> {
  const sp = new URLSearchParams();
  if (limit != null) sp.set("limit", String(limit));
  const q = sp.toString();
  return request(
    "GET",
    `/api/admin/users/${encodeURIComponent(userId)}/login-sessions` +
      (q ? "?" + q : ""),
  );
}

/** CRM notes */
export function getAdminUserNotes(userId: string): Promise<{
  notes: Array<{
    id: string;
    admin_id: string;
    admin_name: string;
    note: string;
    created_at: string | null;
  }>;
}> {
  return request(
    "GET",
    `/api/admin/users/${encodeURIComponent(userId)}/admin-notes`,
  );
}

export function addAdminUserNote(
  userId: string,
  note: string,
): Promise<{ success: boolean; id: string; created_at: string | null }> {
  return request(
    "POST",
    `/api/admin/users/${encodeURIComponent(userId)}/admin-notes`,
    { note },
  );
}

/** LMS summary (avg_grade, training_status) */
export function getAdminUserLmsSummary(userId: string): Promise<{
  avg_grade: number | null;
  training_status: string;
  passed_modules: number[];
  assignment_pending: number;
  assignment_passed: number;
}> {
  return request(
    "GET",
    `/api/admin/users/${encodeURIComponent(userId)}/lms-summary`,
  );
}

export type AdminUserCompetencySkill = {
  skill_name: string;
  skill_category: string | null;
  is_certified: boolean;
  admin_enabled: boolean;
  admin_disabled_reason: string | null;
  admin_disabled_at: string | null;
  certified_at: string | null;
  certification_id: string | null;
};

export type AdminUserExamResult = {
  module: number;
  category: string | null;
  score: number | null;
  passed: boolean;
  attempt: number | null;
  submitted_at: string | null;
};

export type AdminUserModuleSummary = {
  module1: {
    score: number | null;
    passed: boolean;
    attempt: number | null;
    submitted_at: string | null;
  } | null;
  module2: {
    attempted_count: number;
    passed_count: number;
    attempted_categories: string[];
    passed_categories: string[];
    attempts: Array<{
      category: string | null;
      score: number | null;
      passed: boolean;
      attempt: number | null;
      submitted_at: string | null;
    }>;
  };
  module3: {
    score: number | null;
    passed: boolean;
    submitted_at: string | null;
  } | null;
};

export function getAdminUserCompetency(userId: string): Promise<{
  ok: boolean;
  skills: AdminUserCompetencySkill[];
  exam_results: AdminUserExamResult[];
  module_summary?: AdminUserModuleSummary;
  kyc_public_transport: {
    wants_public_transport?: boolean;
    yellow_plate_photo_url?: string | null;
    public_transport_license_front_url?: string | null;
    public_transport_license_back_url?: string | null;
  } | null;
}> {
  return request(
    "GET",
    `/api/admin/users/${encodeURIComponent(userId)}/competency`,
  );
}

export function patchAdminUserSkill(
  userId: string,
  skillName: string,
  body: {
    admin_enabled: boolean;
    reason?: string;
    notify?: boolean;
    notify_title?: string;
    notify_message?: string;
    template?: string;
  },
): Promise<{ ok: boolean; skill: AdminUserCompetencySkill }> {
  return request(
    "PATCH",
    `/api/admin/users/${encodeURIComponent(userId)}/skills/${encodeURIComponent(skillName)}`,
    body,
  );
}

export function sendAdminUserNotification(body: {
  user_id: string;
  title: string;
  message: string;
  reason?: string;
  template?: string;
}): Promise<{ ok: boolean; user_id: string }> {
  return request("POST", "/api/admin/notifications/user", body);
}

/** Manual wallet Credit/Debit with audit — debit ต้องส่ง reason_code + evidence_ref (ledger id ของรายการผิด) */
export function adminWalletAdjust(
  userId: string,
  direction: "credit" | "debit",
  amount: number,
  reason: string,
  debitAudit?: { reason_code: string; evidence_ref: string },
): Promise<{
  success: boolean;
  user_id: string;
  direction: string;
  amount: number;
  balance_after: number;
}> {
  const body: Record<string, unknown> = { direction, amount, reason };
  if (direction === "debit" && debitAudit) {
    body.reason_code = debitAudit.reason_code;
    body.evidence_ref = debitAudit.evidence_ref;
  }
  return request(
    "POST",
    `/api/admin/users/${encodeURIComponent(userId)}/wallet-adjust`,
    body,
  );
}

// App role (user / provider) — เปลี่ยนจากผู้รับงานเป็น user หรือกลับกัน
export function updateAdminUserAppRole(
  id: string,
  role: "user" | "provider",
): Promise<{ success: boolean; user_id: string; role: string }> {
  return request(
    "PATCH",
    `/api/admin/users/${encodeURIComponent(id)}/app-role`,
    { role },
  );
}

// อนุญาติให้เป็น Provider (แก้บั๊กที่ทำแบบทดสอบผ่านแต่สถานะไม่ขึ้น)
export function approveUserAsProvider(
  id: string,
): Promise<{ success: boolean; user_id: string; provider_status: string }> {
  return request(
    "POST",
    `/api/admin/users/${encodeURIComponent(id)}/approve-provider`,
    {},
  );
}

// ตั้ง/ยกเลิก VIP (manual override)
export function setUserVip(
  id: string,
  isVip: boolean,
): Promise<{ success: boolean; user_id: string; is_vip: boolean }> {
  return request("PATCH", `/api/admin/users/${encodeURIComponent(id)}/vip`, {
    is_vip: isVip,
  });
}

export type AdminVipOrderRow = {
  id: string;
  tier: string;
  status: string;
  amount_baht: number | null;
  billing_month: string | null;
  started_at: string | null;
  expires_at: string | null;
  paid_at: string | null;
  activated_at: string | null;
  payment_method: string | null;
  payment_ref: string | null;
  created_at: string | null;
};

export type AdminVipMembership = {
  ok: boolean;
  current: {
    tier: string;
    is_vip: boolean;
    display_status: string;
    vip_started_at: string | null;
    vip_expiry: string | null;
    vip_quota_balance: number | null;
    pending_order: AdminVipOrderRow | null;
    active_order: AdminVipOrderRow | null;
  };
  history: AdminVipOrderRow[];
};

export function getAdminUserVipMembership(
  userId: string,
): Promise<AdminVipMembership> {
  return request(
    "GET",
    `/api/admin/users/${encodeURIComponent(userId)}/vip-membership`,
  );
}

export type AdminLiveEvent = {
  id: string;
  event_type: string;
  user_id: string | null;
  title: string;
  message: string;
  payload: Record<string, unknown>;
  created_at: string | null;
  user_name: string | null;
};

export function getAdminLiveEvents(since?: string): Promise<{
  ok: boolean;
  events: AdminLiveEvent[];
  server_time: string;
}> {
  const q = since ? `?since=${encodeURIComponent(since)}` : "";
  return request("GET", `/api/admin/live-events${q}`);
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
  limit?: number,
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
    `/api/admin/users/${encodeURIComponent(userId)}/ledger` +
      (q ? "?" + q : ""),
  );
}

export type AdminUserFinancialMovementCategory =
  | "all"
  | "deposit"
  | "withdraw"
  | "admin"
  | "job";

export interface AdminUserFinancialMovement {
  id: string;
  event_type: string;
  direction: "in" | "out" | "neutral";
  label: string;
  gross_amount: number;
  net_amount: number;
  fee_amount?: number;
  currency: string;
  status: string;
  gateway?: string | null;
  payment_id?: string | null;
  bill_no?: string | null;
  transaction_no?: string | null;
  source_type?: string | null;
  charge_status?: string | null;
  settlement_status?: string | null;
  is_withdrawable?: boolean | null;
  available_on?: string | null;
  payout_status?: string | null;
  reconciliation_status?: string | null;
  anomaly_hold_reason?: string | null;
  job_id?: string | null;
  anomaly_flags?: string[];
  created_at?: string | null;
}

export interface AdminUserFinancialRiskSignal {
  code: string;
  count?: number;
  total_thb?: number;
  severity?: "low" | "medium" | "high";
}

export interface AdminUserWalletSnapshot {
  wallet_balance: number;
  wallet_balance_withdrawable: number;
  wallet_pending: number;
  wallet_frozen: boolean;
  pending_settlement_thb: number;
  other_locked_thb: number;
}

export interface AdminUserBalanceReconcile {
  expected_balance: number;
  actual_balance: number;
  variance: number;
  status: "pass" | "warn";
  formula: string;
  components: {
    deposits_net: number;
    withdrawals_gross: number;
    admin_credits: number;
    admin_debits: number;
    job_earnings?: number;
    job_expenses?: number;
  };
  note?: string | null;
  explain?: {
    simple: {
      expected_balance: number;
      variance: number;
      formula: string;
      status: "pass" | "warn";
    };
    explained: {
      expected_balance: number;
      variance: number;
      formula: string;
      status: "pass" | "warn";
    };
    breakdown: Array<{
      key: string;
      label: string;
      amount: number;
      effect: "credit" | "debit";
    }>;
    wallet_state: Array<{ key: string; label: string; amount: number }>;
    verdict: string;
    verdict_th: string;
    use_explained_formula?: boolean;
  };
}

export interface AdminUserPendingDepositItem {
  charge_id: string;
  amount: number;
  source_type: string | null;
  status?: string;
  created_at: string | null;
  webhook_count?: number;
  webhook_received?: boolean;
  last_webhook_status?: string | null;
  last_webhook_at?: string | null;
  can_reconcile?: boolean;
}

export interface AdminUserBankDuplicateWarning {
  account_number: string;
  bank_name: string | null;
  other_user_id: string;
  other_user_name: string | null;
  other_user_email: string | null;
  match_source: string;
}

export interface AdminUserSecurityRiskBadge {
  code: string;
  label: string;
  severity: "low" | "medium" | "high";
  count?: number;
}

export interface AdminReconcileTrend {
  window_days: number;
  min_fails_threshold: number;
  fail_count: number;
  distinct_days: number;
  max_variance: number;
  last_fail_at: string | null;
  first_fail_at: string | null;
  is_repeat_offender: boolean;
  escalate_recommended: boolean;
}

export interface AdminUserCompositeRisk {
  composite_score: number;
  composite_tier: string;
  anomaly_score: number;
  linked_account_count: number;
  device_hopping_24h: boolean;
  score_components: Array<{ code: string; points: number; detail?: string }>;
  linked_accounts: Array<{
    linked_user_id: string;
    linked_email?: string | null;
    linked_name?: string | null;
    link_type: string;
    shared_ip?: string;
    account_number?: string;
  }>;
}

export interface AdminUserSupportCase {
  case_id: string;
  status: string;
  priority: string;
  subject?: string | null;
  created_at: string;
}

export interface AdminUserPendingWithdrawalItem {
  id: string;
  amount: number;
  status: string;
  created_at: string | null;
}

export interface AdminUserFinancialMovementsResponse {
  items: AdminUserFinancialMovement[];
  next_cursor: string | null;
  has_more: boolean;
  wallet_snapshot?: AdminUserWalletSnapshot;
  reconcile?: AdminUserBalanceReconcile;
  pending_deposit_items?: AdminUserPendingDepositItem[];
  pending_withdrawal_items?: AdminUserPendingWithdrawalItem[];
  bank_duplicate_warnings?: AdminUserBankDuplicateWarning[];
  security_risk_badges?: AdminUserSecurityRiskBadge[];
  composite_risk?: AdminUserCompositeRisk | null;
  reconcile_trend?: AdminReconcileTrend | null;
  reconcile_escalated?: boolean;
  support_case?: AdminUserSupportCase | null;
  summary: {
    deposits: { count: number; total_net: number; total_gross: number };
    withdrawals: { count: number; total_net: number; total_gross: number };
    admin_credits: { count: number; total_net: number; total_gross: number };
    admin_debits: { count: number; total_net: number; total_gross: number };
    job_earnings?: { count: number; total_thb: number };
    job_expenses?: { count: number; total_thb: number };
    pending_deposits: { count: number; total_thb: number };
    pending_withdrawals: { count: number; total_thb: number };
  };
  risk_signals: AdminUserFinancialRiskSignal[];
  pagination: { limit: number; mode: string; category: string };
}

export function getAdminUserFinancialMovements(
  userId: string,
  params?: {
    limit?: number;
    cursor?: string | null;
    category?: AdminUserFinancialMovementCategory;
    from_date?: string;
    to_date?: string;
    job_id?: string | null;
  },
): Promise<AdminUserFinancialMovementsResponse> {
  const sp = new URLSearchParams();
  if (params?.limit != null) sp.set("limit", String(params.limit));
  if (params?.cursor) sp.set("cursor", params.cursor);
  if (params?.category) sp.set("category", params.category);
  if (params?.from_date) sp.set("from_date", params.from_date);
  if (params?.to_date) sp.set("to_date", params.to_date);
  if (params?.job_id) sp.set("job_id", params.job_id);
  const q = sp.toString();
  return request(
    "GET",
    `/api/admin/users/${encodeURIComponent(userId)}/financial-movements` +
      (q ? "?" + q : ""),
  );
}

export interface AdminUserFinancialAuditItem {
  id: string;
  source: string;
  category: string;
  title: string;
  detail?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  charge_id?: string | null;
  payout_id?: string | null;
  amount?: number;
  status?: string | null;
  reconciliation_status?: string | null;
  reconciliation_rules?: Array<{
    rule: string;
    ok: boolean;
    reason?: string | null;
  }>;
  created_at: string | null;
  processed_at?: string | null;
}

export interface AdminUserFinancialAuditResponse {
  items: AdminUserFinancialAuditItem[];
  total_fetched: number;
  case_summary: string;
  support_case?: AdminUserSupportCase | null;
}

export function getAdminUserFinancialAudit(
  userId: string,
  params?: { limit?: number },
): Promise<AdminUserFinancialAuditResponse> {
  const sp = new URLSearchParams();
  if (params?.limit != null) sp.set("limit", String(params.limit));
  const q = sp.toString();
  return request(
    "GET",
    `/api/admin/users/${encodeURIComponent(userId)}/financial-audit` +
      (q ? "?" + q : ""),
  );
}

export async function downloadAdminUserFinancialCsv(
  userId: string,
): Promise<void> {
  const path = `/api/admin/users/${encodeURIComponent(userId)}/financial-movements/export`;
  const url = path.startsWith("http") ? path : `${ADMIN_API_BASE}${path}`;
  const tok = getAdminToken();
  const res = await fetch(url, {
    headers: tok ? { Authorization: `Bearer ${tok}` } : {},
  });
  if (!res.ok) {
    const t = await res.text();
    let msg = t.slice(0, 300);
    try {
      const j = JSON.parse(t);
      msg = j.error || j.message || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `user-financial-${userId.slice(0, 8)}.csv`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

export interface AdminUserCommerceProfile {
  user_id: string;
  user_hash: string;
  role: string;
  kyc_status?: string | null;
  wallet_balance: number;
  wallet_pending: number;
  data_sharing_consent: boolean;
  consent_at: string | null;
  period_days: number;
  event_count: number;
  metrics: {
    spend_in: number;
    spend_out: number;
    jobs_posted: number;
    jobs_completed: number;
    jobs_disputed: number;
    deposits_count: number;
    withdrawals_count: number;
    escrow_held: number;
    escrow_released: number;
  };
  category_mix: Record<string, number>;
  funnel: {
    jobs_opened?: number;
    jobs_paid?: number;
    jobs_done?: number;
    reviews?: number;
    deposits?: number;
  };
  risk_score: number;
  risk_flag_count: number;
  risk_tier: string;
  daily_rows?: Array<Record<string, unknown>>;
}

export interface AdminUserCommerceInsightsResponse {
  profile: AdminUserCommerceProfile;
}

export interface AdminUnifiedTimelineItem {
  id: string;
  lane: "commerce" | "security" | "audit" | "financial";
  ts: string;
  title: string;
  category?: string | null;
  amount?: number | null;
  job_id?: string | null;
  detail?: unknown;
  entity_id?: string | null;
}

export function getAdminUserCommerceInsights(
  userId: string,
  params?: { days?: number },
): Promise<AdminUserCommerceInsightsResponse> {
  const sp = new URLSearchParams();
  if (params?.days != null) sp.set("days", String(params.days));
  const q = sp.toString();
  return request(
    "GET",
    `/api/admin/users/${encodeURIComponent(userId)}/commerce-insights` +
      (q ? "?" + q : ""),
  );
}

export function getAdminUserUnifiedTimeline(
  userId: string,
  params?: { limit?: number },
): Promise<{ items: AdminUnifiedTimelineItem[]; total: number }> {
  const sp = new URLSearchParams();
  if (params?.limit != null) sp.set("limit", String(params.limit));
  const q = sp.toString();
  return request(
    "GET",
    `/api/admin/users/${encodeURIComponent(userId)}/unified-timeline` +
      (q ? "?" + q : ""),
  );
}

export async function downloadAdminUserAnonymizedBundle(
  userId: string,
): Promise<void> {
  const path = `/api/admin/users/${encodeURIComponent(userId)}/anonymized-bundle`;
  const url = path.startsWith("http") ? path : `${ADMIN_API_BASE}${path}`;
  const tok = getAdminToken();
  const res = await fetch(url, {
    headers: tok ? { Authorization: `Bearer ${tok}` } : {},
  });
  if (!res.ok) {
    const t = await res.text();
    let msg = t.slice(0, 300);
    try {
      const j = JSON.parse(t);
      msg = j.error || j.message || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `trust-bundle-${userId.slice(0, 8)}.json`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

export function patchAdminUserConsent(
  userId: string,
  dataSharingConsent: boolean,
): Promise<{
  user: {
    id: string;
    data_sharing_consent: boolean;
    consent_at: string | null;
  };
}> {
  return request(
    "PATCH",
    `/api/admin/users/${encodeURIComponent(userId)}/consent`,
    {
      data_sharing_consent: dataSharingConsent,
    },
  );
}

export interface AdminEscrowTimelineStep {
  stage: string;
  event_type: string;
  amount: number;
  ts: string;
  leg?: string | null;
  actor?: string | null;
  source?: string;
}

export interface AdminEscrowTimelineJob {
  job_id: string;
  title?: string | null;
  job_status?: string | null;
  category?: string | null;
  released_status?: string | null;
  escrow_held?: boolean;
  current_stage: string;
  steps: AdminEscrowTimelineStep[];
}

export interface AdminJobGraphNode {
  type: string;
  ts: string;
  amount?: number | null;
  category?: string | null;
  metadata?: unknown;
  source?: string;
}

export interface AdminJobGraphStepAction {
  id: string;
  label: string;
  action: "navigate" | "scroll" | "api" | "info";
  view?: string;
  section?: string;
  api?: string;
}

export interface AdminJobGraphPlaybookItem {
  id: string;
  label: string;
  done: boolean;
  hint?: string;
  action?: AdminJobGraphStepAction;
}

export interface AdminJobGraphPlaybook {
  stuck_step: string;
  title: string;
  items: AdminJobGraphPlaybookItem[];
}

export interface AdminJobGraphStep {
  key: string;
  label: string;
  state: "done" | "pending" | "stuck" | "blocked";
  ts?: string | null;
  amount?: number | null;
  events: Array<{
    type: string;
    ts: string;
    amount?: number | null;
    source?: string;
  }>;
  admin_actions: AdminJobGraphStepAction[];
}

export interface AdminJobGraph {
  job_id: string;
  title?: string | null;
  job_status?: string;
  category?: string | null;
  user_role?: string;
  nodes: AdminJobGraphNode[];
  steps?: AdminJobGraphStep[];
  stuck_step?: string | null;
  is_stuck?: boolean;
  playbook?: AdminJobGraphPlaybook | null;
  edge_summary: string;
  extras?: Array<{ type: string; ts: string; amount?: number | null }>;
  live?: Record<string, unknown>;
  data_source?: string;
}

export function getAdminUserEscrowTimeline(
  userId: string,
  params?: { limit?: number },
): Promise<{ jobs: AdminEscrowTimelineJob[]; total: number }> {
  const sp = new URLSearchParams();
  if (params?.limit != null) sp.set("limit", String(params.limit));
  const q = sp.toString();
  return request(
    "GET",
    `/api/admin/users/${encodeURIComponent(userId)}/escrow-timeline` +
      (q ? "?" + q : ""),
  );
}

export function getAdminUserJobGraph(
  userId: string,
  params?: { limit?: number },
): Promise<{ graphs: AdminJobGraph[]; total: number; data_source?: string }> {
  const sp = new URLSearchParams();
  if (params?.limit != null) sp.set("limit", String(params.limit));
  const q = sp.toString();
  return request(
    "GET",
    `/api/admin/users/${encodeURIComponent(userId)}/job-graph` +
      (q ? "?" + q : ""),
  );
}

export function getAdminJobGraphDetail(
  jobId: string,
): Promise<{ graph: AdminJobGraph & Record<string, unknown> }> {
  return request("GET", `/api/admin/job-graph/${encodeURIComponent(jobId)}`);
}

export function adminSuspendJob(
  jobId: string,
  reason?: string,
): Promise<{ success: boolean; job_id: string }> {
  return request(
    "POST",
    `/api/admin/jobs/${encodeURIComponent(jobId)}/suspend`,
    {
      reason,
    },
  );
}

export function adminRejectJob(
  jobId: string,
  reason?: string,
): Promise<{ success: boolean; job_id: string }> {
  return request(
    "POST",
    `/api/admin/jobs/${encodeURIComponent(jobId)}/reject`,
    {
      reason,
    },
  );
}

export function adminReleaseJobEscrow(
  jobId: string,
  opts?: { force?: boolean },
): Promise<{
  success: boolean;
  job_id: string;
  amount?: number;
  wht_withheld?: number;
  net_available?: number;
  message?: string;
}> {
  return request(
    "POST",
    `/api/admin/jobs/${encodeURIComponent(jobId)}/release-escrow`,
    opts || {},
  );
}

export function previewAdminJobEscrowRelease(jobId: string): Promise<{
  preview: {
    eligible: boolean;
    reason?: string | null;
    provider_receive?: number | null;
    released_status?: string;
  };
}> {
  return request(
    "GET",
    `/api/admin/jobs/${encodeURIComponent(jobId)}/release-escrow/preview`,
  );
}

export function getAdminUserRiskProfile(
  userId: string,
): Promise<{ profile: AdminUserCompositeRisk & Record<string, unknown> }> {
  return request(
    "GET",
    `/api/admin/users/${encodeURIComponent(userId)}/risk-profile`,
  );
}

export async function downloadAdminUserSupportPackJson(
  userId: string,
  caseId?: string,
): Promise<void> {
  const sp = new URLSearchParams();
  if (caseId) sp.set("case_id", caseId);
  const q = sp.toString();
  const path =
    `/api/admin/users/${encodeURIComponent(userId)}/support-pack.json` +
    (q ? "?" + q : "");
  const url = path.startsWith("http") ? path : `${ADMIN_API_BASE}${path}`;
  const tok = getAdminToken();
  const res = await fetch(url, {
    headers: tok ? { Authorization: `Bearer ${tok}` } : {},
  });
  if (!res.ok) throw new Error((await res.text()).slice(0, 300));
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `support-${userId.slice(0, 8)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function downloadAdminUserSupportPackCsv(
  userId: string,
  caseId?: string,
): Promise<void> {
  const sp = new URLSearchParams();
  if (caseId) sp.set("case_id", caseId);
  const q = sp.toString();
  const path =
    `/api/admin/users/${encodeURIComponent(userId)}/support-pack.csv` +
    (q ? "?" + q : "");
  const url = path.startsWith("http") ? path : `${ADMIN_API_BASE}${path}`;
  const tok = getAdminToken();
  const res = await fetch(url, {
    headers: tok ? { Authorization: `Bearer ${tok}` } : {},
  });
  if (!res.ok) throw new Error((await res.text()).slice(0, 300));
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `support-${userId.slice(0, 8)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function downloadAdminUser360Json(
  userId: string,
  caseId?: string,
): Promise<void> {
  const sp = new URLSearchParams();
  if (caseId) sp.set("case_id", caseId);
  const q = sp.toString();
  const path =
    `/api/admin/users/${encodeURIComponent(userId)}/user-360.json` +
    (q ? "?" + q : "");
  const url = path.startsWith("http") ? path : `${ADMIN_API_BASE}${path}`;
  const tok = getAdminToken();
  const res = await fetch(url, {
    headers: tok ? { Authorization: `Bearer ${tok}` } : {},
  });
  if (!res.ok) throw new Error((await res.text()).slice(0, 300));
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `user-360-${userId.slice(0, 8)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function downloadAdminUser360Csv(
  userId: string,
  caseId?: string,
): Promise<void> {
  const sp = new URLSearchParams();
  if (caseId) sp.set("case_id", caseId);
  const q = sp.toString();
  const path =
    `/api/admin/users/${encodeURIComponent(userId)}/user-360.csv` +
    (q ? "?" + q : "");
  const url = path.startsWith("http") ? path : `${ADMIN_API_BASE}${path}`;
  const tok = getAdminToken();
  const res = await fetch(url, {
    headers: tok ? { Authorization: `Bearer ${tok}` } : {},
  });
  if (!res.ok) throw new Error((await res.text()).slice(0, 300));
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `user-360-${userId.slice(0, 8)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function postAdminUserSupportCase(
  userId: string,
  body?: { subject?: string; force_new?: boolean },
): Promise<{ case: AdminUserSupportCase; created: boolean }> {
  return request(
    "POST",
    `/api/admin/users/${encodeURIComponent(userId)}/support-case`,
    body || {},
  );
}

// Partner API admin
export interface PartnerApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  rate_limit_per_minute: number;
  weekly_quota_requests?: number;
  is_active: boolean;
  scopes: string[];
  created_by?: string | null;
  created_at: string;
  last_used_at?: string | null;
}

export interface PartnerApiAuditRow {
  id: number;
  api_key_id: string | null;
  key_name?: string | null;
  endpoint: string;
  method: string;
  status_code: number;
  ip_address?: string | null;
  request_meta?: unknown;
  created_at: string;
}

export function getPartnerApiKeys(): Promise<{ keys: PartnerApiKeyRow[] }> {
  return request("GET", "/api/admin/partner-api-keys");
}

export function createPartnerApiKey(body: {
  name: string;
  rate_limit_per_minute?: number;
  weekly_quota_requests?: number;
  scopes?: string[];
}): Promise<{ key: PartnerApiKeyRow; api_key: string; warning: string }> {
  return request("POST", "/api/admin/partner-api-keys", body);
}

export function patchPartnerApiKey(
  id: string,
  body: {
    is_active?: boolean;
    rate_limit_per_minute?: number;
    weekly_quota_requests?: number;
  },
): Promise<{ key: PartnerApiKeyRow }> {
  return request(
    "PATCH",
    `/api/admin/partner-api-keys/${encodeURIComponent(id)}`,
    body,
  );
}

export function getPartnerApiAudit(params?: {
  limit?: number;
  api_key_id?: string;
}): Promise<{ audit: PartnerApiAuditRow[] }> {
  const sp = new URLSearchParams();
  if (params?.limit != null) sp.set("limit", String(params.limit));
  if (params?.api_key_id) sp.set("api_key_id", params.api_key_id);
  const q = sp.toString();
  return request("GET", `/api/admin/partner-api-audit${q ? "?" + q : ""}`);
}

export interface PartnerApiKeyStats {
  api_key_id: string;
  name: string;
  key_prefix: string;
  rate_limit_per_minute: number;
  weekly_quota_requests?: number;
  requests_7d?: number;
  weekly_quota_pct?: number | null;
  is_active: boolean;
  last_used_at?: string | null;
  requests_window: number;
  errors_window: number;
  rate_limits_window: number;
  last_request_at?: string | null;
  requests_this_minute: number;
  rate_usage_pct: number;
  near_rate_limit: boolean;
}

export interface PartnerApiDashboard {
  window_hours: number;
  generated_at: string;
  summary: {
    total_requests: number;
    success_count: number;
    error_count: number;
    rate_limit_count: number;
    server_error_count: number;
    error_rate_pct: number;
    active_keys: number;
    total_keys: number;
  };
  partner_hash: {
    consent_users: number;
    hashed_users: number;
    pending_backfill: number;
  };
  key_stats: PartnerApiKeyStats[];
  recent_errors: PartnerApiAuditRow[];
  hourly: { hour: string; requests: number; errors: number }[];
  live_rate_limits: {
    api_key_id: string;
    requests_this_minute: number;
    window_started_at: string;
    seconds_remaining: number;
  }[];
}

export function getPartnerApiDashboard(params?: {
  hours?: number;
}): Promise<PartnerApiDashboard> {
  const sp = new URLSearchParams();
  if (params?.hours != null) sp.set("hours", String(params.hours));
  const q = sp.toString();
  return request("GET", `/api/admin/partner-api-dashboard${q ? "?" + q : ""}`);
}

export function runSupportCaseSlaNudge(params?: { force?: boolean }): Promise<{
  ok: boolean;
  sent: number;
  skipped: number;
  total_candidates?: number;
}> {
  return request("POST", "/api/admin/cron/support-case-sla-nudge/run", {
    force: !!params?.force,
  });
}

export function runOpsWeeklyDigest(params?: { force?: boolean }): Promise<{
  ok: boolean;
  sent: boolean;
  digest_key?: string;
  reason?: string;
}> {
  return request("POST", "/api/admin/cron/ops-weekly-digest/run", {
    force: !!params?.force,
  });
}

export function runPartnerApiWeeklyReport(params?: {
  force?: boolean;
}): Promise<{
  ok: boolean;
  sent: boolean;
  alert_key?: string;
  slack_sent?: boolean;
  email_sent?: boolean;
  over_quota?: boolean;
  reason?: string;
}> {
  return request("POST", "/api/admin/partner-api-weekly-report/run", {
    force: !!params?.force,
  });
}

// KYC lifecycle + WHT (user modal)
export interface AdminKycLifecycle {
  kyc_status: string | null;
  kyc_level: string | null;
  submitted_at: string | null;
  verified_at: string | null;
  next_reverify_at: string | null;
  needs_reverify: boolean;
  rejection_reason: string | null;
  admin_instruction: string | null;
  resubmission_deadline: string | null;
  required_steps: string[];
  resubmit_trigger: string | null;
}

export interface AdminKycSupplementRequest {
  id: string;
  requested_docs: string[];
  instruction: string;
  deadline: string | null;
  status: string;
  created_by: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface AdminUserWhtSummary {
  posting_count: number;
  gross_total: number;
  withheld_total: number;
  net_total: number;
  recent: Array<{
    id: string;
    source_event_type: string;
    source_job_id: string | null;
    gross_income_amount: number;
    wht_rate_percent: number;
    withheld_amount: number;
    net_payable_amount: number;
    eligibility_status: string;
    eligibility_reason: string | null;
    created_at: string;
  }>;
}

export function getAdminUserKycLifecycle(userId: string): Promise<{
  lifecycle: AdminKycLifecycle;
  supplement_requests: AdminKycSupplementRequest[];
  wht: AdminUserWhtSummary;
}> {
  return request(
    "GET",
    `/api/admin/users/${encodeURIComponent(userId)}/kyc-lifecycle`,
  );
}

// Support case admin queue
export interface AdminSupportCaseRow {
  case_id: string;
  user_id?: string;
  status: string;
  priority: string;
  subject?: string | null;
  opened_by?: string | null;
  assigned_to?: string | null;
  created_at: string;
  updated_at?: string;
  closed_at?: string | null;
  user_email?: string | null;
  user_name?: string | null;
  user_phone?: string | null;
}

export interface AdminSupportCaseEvent {
  id: number;
  case_id: string;
  event_type: string;
  actor: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

export interface AdminSupportCaseSla {
  generated_at: string;
  counts: {
    open_total: number;
    open_urgent?: number;
    open_stale_24h: number;
    unassigned_priority: number;
  };
  averages_30d: {
    hours_to_assign: number | null;
    hours_to_close: number | null;
  };
  stale_open_cases: Array<AdminSupportCaseRow & { age_hours?: number | null }>;
  unassigned_urgent_cases: AdminSupportCaseRow[];
  sla_breaches?: {
    stale_24h: number;
    unassigned_urgent: number;
  };
}

export function getAdminSupportCaseSla(): Promise<{
  sla: AdminSupportCaseSla;
}> {
  return request("GET", "/api/admin/support-cases/sla");
}

export interface SupportCaseAutoAssignConfig {
  enabled: boolean;
  ops_queue: string | null;
  round_robin: string[];
}

export function getSupportCaseAutoAssignStatus(): Promise<{
  auto_assign: SupportCaseAutoAssignConfig;
}> {
  return request("GET", "/api/admin/support-cases/auto-assign/status");
}

export function runSupportCaseAutoAssign(params?: { limit?: number }): Promise<{
  assigned: number;
  skipped: number;
  results: Array<{
    case_id: string;
    assigned: boolean;
    assigned_to?: string;
    rule?: string;
    reason?: string;
  }>;
  config: SupportCaseAutoAssignConfig;
  error?: string;
}> {
  return request("POST", "/api/admin/support-cases/auto-assign/run", {
    limit: params?.limit ?? 50,
  });
}

export async function downloadSupportCaseAuditBundleJson(
  caseId: string,
): Promise<void> {
  const path = `/api/admin/support-cases/${encodeURIComponent(caseId)}/audit-bundle.json`;
  const url = path.startsWith("http") ? path : `${ADMIN_API_BASE}${path}`;
  const tok = getAdminToken();
  const res = await fetch(url, {
    headers: tok ? { Authorization: `Bearer ${tok}` } : {},
  });
  if (!res.ok) throw new Error((await res.text()).slice(0, 300));
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `audit-bundle-${caseId}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function downloadSupportCaseAuditBundleCsv(
  caseId: string,
): Promise<void> {
  const path = `/api/admin/support-cases/${encodeURIComponent(caseId)}/audit-bundle.csv`;
  const url = path.startsWith("http") ? path : `${ADMIN_API_BASE}${path}`;
  const tok = getAdminToken();
  const res = await fetch(url, {
    headers: tok ? { Authorization: `Bearer ${tok}` } : {},
  });
  if (!res.ok) throw new Error((await res.text()).slice(0, 300));
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `audit-bundle-${caseId}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function getAdminSupportCases(params?: {
  status?: string;
  assigned_to?: string;
  limit?: number;
}): Promise<{ cases: AdminSupportCaseRow[] }> {
  const sp = new URLSearchParams();
  if (params?.status) sp.set("status", params.status);
  if (params?.assigned_to) sp.set("assigned_to", params.assigned_to);
  if (params?.limit != null) sp.set("limit", String(params.limit));
  const q = sp.toString();
  return request("GET", `/api/admin/support-cases${q ? "?" + q : ""}`);
}

export function getAdminSupportCaseDetail(caseId: string): Promise<{
  case: AdminSupportCaseRow & Record<string, unknown>;
  history: AdminSupportCaseEvent[];
}> {
  return request(
    "GET",
    `/api/admin/support-cases/${encodeURIComponent(caseId)}`,
  );
}

export function assignAdminSupportCase(
  caseId: string,
  assignedTo: string,
): Promise<{ case: AdminSupportCaseRow }> {
  return request(
    "PATCH",
    `/api/admin/support-cases/${encodeURIComponent(caseId)}/assign`,
    { assigned_to: assignedTo },
  );
}

export function closeAdminSupportCase(
  caseId: string,
  body?: { resolution?: string; status?: "closed" | "resolved" },
): Promise<{ case: AdminSupportCaseRow }> {
  return request(
    "PATCH",
    `/api/admin/support-cases/${encodeURIComponent(caseId)}/close`,
    body || {},
  );
}

export function getAdminUserSupportCases(
  userId: string,
  params?: { limit?: number },
): Promise<{ cases: AdminSupportCaseRow[] }> {
  const sp = new URLSearchParams();
  if (params?.limit != null) sp.set("limit", String(params.limit));
  const q = sp.toString();
  return request(
    "GET",
    `/api/admin/users/${encodeURIComponent(userId)}/support-cases` +
      (q ? "?" + q : ""),
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
    `/api/admin/kyc/${encodeURIComponent(userId)}`,
  );
}

export interface KycOverviewResponse {
  countsByKycStatus: Record<string, number>;
  pendingReviewUsers: number;
  resubmissionRequiredUsers: number;
  rejectedUsers: number;
  resubmissionDeadlineOverdue: number;
}

export function getKycOverview(): Promise<KycOverviewResponse> {
  return request<KycOverviewResponse>("GET", "/api/admin/kyc/overview");
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
  /** Tier A payout reconciliation (migration 155) */
  reconciliation_status?: string;
  reconciliation_details?: Record<string, unknown>;
  slip_hash?: string | null;
  reconciled_at?: string | null;
  /** Payso (Pay Solutions) PromptPay */
  payso_transaction_id?: string | null;
  payso_reference_id?: string | null;
  withdrawal_fee?: number | null;
  /** สำรองเมื่อ PaySo ล่ม — โอนมือ + สลิป */
  paid_manually?: boolean;
  paid_manually_slip_url?: string | null;
  paid_manually_at?: string | null;
  paid_manually_by?: string | null;
}

export interface AdminPayoutsResponse {
  payouts: AdminPayoutRow[];
}

/** ยอดจาก PAYMENT_GATEWAY_* (Paysolution / HTTP adapter / ฯลฯ) — ไม่ผูกกับ Omise โดยตรง */
export interface PayoutGatewayBalanceResponse {
  available: number;
  pending: number;
  total: number;
  currency: string;
  total_pending_payouts: number;
  safety_gap: number;
  error?: string;
  payment_gateway_provider?: string;
}

/** @deprecated ใช้ PayoutGatewayBalanceResponse */
export type OmiseBalanceResponse = PayoutGatewayBalanceResponse;

export function getAdminPayouts(params?: {
  status?: string;
  user_id?: string;
  limit?: number;
}): Promise<AdminPayoutsResponse> {
  const sp = new URLSearchParams();
  if (params?.status) sp.set("status", params.status);
  if (params?.user_id) sp.set("user_id", params.user_id);
  if (params?.limit != null) sp.set("limit", String(params.limit));
  const q = sp.toString();
  return request<AdminPayoutsResponse>(
    "GET",
    "/api/admin/payouts" + (q ? "?" + q : ""),
  );
}

export function patchAdminPayout(
  id: string,
  body: {
    status: "approved" | "rejected";
    admin_notes?: string;
    transaction_id?: string;
  },
): Promise<{
  success: boolean;
  message: string;
  payout: {
    id: string;
    status: string;
    processed_at: string | null;
    transaction_id: string | null;
    admin_notes: string | null;
    reconciliation_status?: string | null;
    reconciliation_details?: unknown;
    slip_hash?: string | null;
    reconciled_at?: string | null;
  } | null;
}> {
  return request("PATCH", `/api/admin/payouts/${encodeURIComponent(id)}`, body);
}

/** โอนมือ + สลิป (สำรองเมื่อ PaySo ล่ม) — POST /api/admin/payouts/:id/approve-manual */
export function postAdminPayoutApproveManual(
  id: string,
  body: { slip_url: string; admin_notes?: string; transaction_id?: string },
): Promise<{ success: boolean; message?: string }> {
  return request(
    "POST",
    `/api/admin/payouts/${encodeURIComponent(id)}/approve-manual`,
    body,
  );
}

export interface PayoutReconciliationOverviewItem {
  id: string;
  user_id: string;
  user_name: string | null;
  amount: number;
  status: string;
  reconciliation_status: string;
  reconciliation_details: Record<string, unknown>;
  slip_hash: string | null;
  slip_url: string | null;
  reconciled_at: string | null;
  created_at: string | null;
  processed_at: string | null;
  payso_transaction_id?: string | null;
  payso_reference_id?: string | null;
}

export function getPayoutReconciliationOverview(params?: {
  limit?: number;
  reconciliation_status?: string;
}): Promise<{ items: PayoutReconciliationOverviewItem[] }> {
  const sp = new URLSearchParams();
  if (params?.limit != null) sp.set("limit", String(params.limit));
  if (params?.reconciliation_status)
    sp.set("reconciliation_status", params.reconciliation_status);
  const q = sp.toString();
  return request(
    "GET",
    "/api/admin/payouts/reconciliation/overview" + (q ? "?" + q : ""),
  );
}

/** Payso None-UI PromptPay — requires PAYSO_ENABLED=1 and migration 157 */
export function postAdminPaysoPromptPay(id: string): Promise<{
  success: boolean;
  payso_reference_id: string;
  payso_transaction_id: string | null;
  data?: Record<string, unknown>;
}> {
  return request(
    "POST",
    `/api/admin/payouts/${encodeURIComponent(id)}/payso-promptpay`,
  );
}

export function postAdminPayoutReconcile(
  id: string,
  body: { reason: string },
): Promise<{
  success: boolean;
  status: string;
  details: Record<string, unknown>;
  slip_hash: string | null;
}> {
  return request(
    "POST",
    `/api/admin/payouts/${encodeURIComponent(id)}/reconcile`,
    body,
  );
}

/** Dashboard cards — Bangkok calendar day (ICT / UTC+7) */
export function getPayoutReconciliationSummary(params?: {
  date?: string;
}): Promise<{
  report_date: string;
  timezone: string;
  total_volume_reconciled_pass_thb: number;
  pending_exceptions: number;
  ledger_variance_thb: number;
  report_id: string;
}> {
  const sp = new URLSearchParams();
  if (params?.date) sp.set("date", params.date);
  const q = sp.toString();
  return request(
    "GET",
    "/api/admin/payouts/reconciliation/summary" + (q ? "?" + q : ""),
  );
}

/** SUPER_ADMIN only — override amount / bank_details when reconciliation locked; backend records audit log */
export function putAdminPayoutSensitive(
  id: string,
  body: {
    reason: string;
    amount?: number;
    bank_details?: Record<string, unknown>;
  },
): Promise<{
  success: boolean;
  reconciliation: Record<string, unknown>;
  amount: number;
  bank_details: Record<string, unknown>;
}> {
  return request(
    "PUT",
    `/api/admin/payouts/${encodeURIComponent(id)}/sensitive`,
    body,
  );
}

/** Download daily audit CSV/PDF (browser) */
export async function downloadPayoutReconciliationDailyReport(
  date: string,
  format: "csv" | "pdf",
): Promise<void> {
  const path =
    "/api/admin/payouts/reconciliation/daily-report?" +
    new URLSearchParams({ date, format }).toString();
  const url = path.startsWith("http") ? path : `${ADMIN_API_BASE}${path}`;
  const headers: Record<string, string> = {};
  const t = getAdminToken();
  if (t) headers["Authorization"] = `Bearer ${t}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text.slice(0, 300) || `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `payout-reconciliation-${date}.${format === "pdf" ? "pdf" : "csv"}`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function getPayoutGatewayBalance(): Promise<PayoutGatewayBalanceResponse> {
  return request<PayoutGatewayBalanceResponse>(
    "GET",
    "/api/admin/payments/gateway-balance",
  );
}

/** @deprecated ใช้ getPayoutGatewayBalance — backend alias เดิมยังรองรับ */
export function getOmiseBalance(): Promise<OmiseBalanceResponse> {
  return getPayoutGatewayBalance();
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

export function runAutoRelease(): Promise<{
  success: boolean;
  released: number;
  errors: Array<{ jobId?: string; error: string }>;
}> {
  return request("POST", "/api/admin/payouts/run-auto-release");
}

export function runAutoPayout(): Promise<{
  success: boolean;
  processed: number;
  errors: Array<{ payoutId?: string; error: string }>;
}> {
  return request("POST", "/api/admin/payouts/run-auto-payout");
}

export interface TemporaryPayoutAccountSummary {
  label: string;
  bank_name: string;
  account_holder_name: string;
  account_number_masked: string;
  has_prompt_pay: boolean;
  updated_at: string | null;
}

export interface PayoutConfigResponse {
  /** Payso PromptPay None-UI payout (PAYSO_ENABLED=1) */
  payso_payout_enabled?: boolean;
  auto_release_enabled: boolean;
  auto_release_hours: number;
  /** โอนอัตโนมัติผ่าน API ของ payment gateway (Paysolution ฯลฯ) เมื่อเปิดใน .env */
  auto_payout_gateway_transfer_enabled: boolean;
  payment_gateway_provider?: string;
  job_limit: number;
  request_limit: number;
  gateway_configured: boolean;
  /** บัญชีรับชั่วคราว (Personal Settlement) สำหรับโอนด้วยมือ / รอ gateway */
  temporary_payout_account?: TemporaryPayoutAccountSummary | null;
  payout_rail_hint?: string;
  /** legacy — เทียบเท่า auto_payout_gateway_transfer_enabled */
  auto_payout_omise_enabled: boolean;
  /** legacy — เทียบเท่า gateway_configured */
  omise_configured: boolean;
  hint?: string;
}

export async function getPayoutConfig(): Promise<PayoutConfigResponse | null> {
  try {
    return await request<PayoutConfigResponse>(
      "GET",
      "/api/admin/payouts/config",
    );
  } catch {
    return null; // Endpoint อาจไม่มีใน backend เวอร์ชันเก่า
  }
}

export function approveKyc(
  userId: string,
): Promise<{ success: boolean; kyc_status: string }> {
  return request(
    "POST",
    `/api/admin/kyc/${encodeURIComponent(userId)}/approve`,
    {},
  );
}

export function rejectKyc(
  userId: string,
  reason?: string,
): Promise<{ success: boolean; kyc_status: string }> {
  return request(
    "POST",
    `/api/admin/kyc/${encodeURIComponent(userId)}/reject`,
    {
      reason: reason || "Rejected by admin",
    },
  );
}

export function requestKycResubmit(
  userId: string,
  body: {
    instruction: string;
    deadline?: string | null;
    required_steps?: string[];
    trigger?: string;
  },
): Promise<{ success: boolean; kyc_status: string }> {
  return request(
    "POST",
    `/api/admin/kyc/${encodeURIComponent(userId)}/request-resubmit`,
    {
      instruction: body.instruction,
      deadline: body.deadline ?? null,
      required_steps: body.required_steps || [],
      trigger: body.trigger ?? "admin_manual",
    },
  );
}

export function requestKycSupplement(
  userId: string,
  body: {
    instruction?: string;
    deadline?: string | null;
    requested_docs?: string[];
  },
): Promise<{
  success: boolean;
  kyc_status: string;
  requested_docs: string[];
  step_labels: string[];
}> {
  return request(
    "POST",
    `/api/admin/kyc/${encodeURIComponent(userId)}/request-supplement`,
    {
      instruction: body.instruction ?? "",
      deadline: body.deadline ?? null,
      requested_docs: body.requested_docs ?? [
        "yellow_plate",
        "public_transport_license_front",
      ],
    },
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
  wallet_deposit_channels?: Array<{
    source_type: string;
    entry_count: number;
    net_amount: number;
  }>;
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
    "/api/admin/financial/dashboard" + (q ? "?" + q : ""),
  );
}

/** GET/PATCH /api/admin/finance/runtime-config — ปิดบัญชีรับชั่วคราว + เกตเวย์สำรอง (system_settings) */
export interface FinanceBackupGatewayEntry {
  enabled: boolean;
  display_name: string;
  merchant_id_env?: string;
  notes?: string;
}

export interface FinanceRuntimeConfig {
  personal_settlement_manual_enabled: boolean;
  backup_gateways: {
    twoc2p: FinanceBackupGatewayEntry;
    gb_prime_pay: FinanceBackupGatewayEntry;
  };
}

export function getFinanceRuntimeConfig(): Promise<FinanceRuntimeConfig> {
  return request<FinanceRuntimeConfig>(
    "GET",
    "/api/admin/finance/runtime-config",
  );
}

export function patchFinanceRuntimeConfig(
  body: Partial<
    Pick<FinanceRuntimeConfig, "personal_settlement_manual_enabled">
  > & {
    backup_gateways?: Partial<FinanceRuntimeConfig["backup_gateways"]>;
  },
): Promise<FinanceRuntimeConfig> {
  return request<FinanceRuntimeConfig>(
    "PATCH",
    "/api/admin/finance/runtime-config",
    body,
  );
}

// Tax identity foundation — VAT company settings + user Tax Profile queue
export interface TaxCompanySettings {
  id: string;
  legal_name: string;
  registered_address: string | null;
  tax_id: string | null;
  branch_code: string;
  branch_name: string;
  vat_registered: boolean;
  vat_rate_percent: number;
  wht_rate_percent: number;
  support_email: string | null;
  support_line: string | null;
  help_center_url: string | null;
  phone_optional: string | null;
  updated_by?: string | null;
  updated_at?: string | null;
  tax_invoice_ready: boolean;
}

export interface TaxUserProfile {
  user_id: string | null;
  legal_name: string | null;
  tax_id: string | null;
  tax_entity_type: "unknown" | "individual" | "company" | "foreign";
  registered_address: string | null;
  branch_code: string | null;
  branch_name: string | null;
  country: string;
  email: string | null;
  phone_optional: string | null;
  verified_status: "unverified" | "pending_review" | "verified" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface MissingTaxProfileRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  legal_name: string | null;
  tax_id: string | null;
  registered_address: string | null;
  verified_status: string;
  updated_at: string | null;
}

export function getTaxCompanySettings(): Promise<{
  settings: TaxCompanySettings;
}> {
  return request("GET", "/api/admin/tax/company-settings");
}

export function patchTaxCompanySettings(
  body: Partial<TaxCompanySettings> & { reason?: string },
): Promise<{ settings: TaxCompanySettings }> {
  return request("PATCH", "/api/admin/tax/company-settings", body);
}

export function getMissingTaxProfiles(
  limit = 50,
): Promise<{ rows: MissingTaxProfileRow[] }> {
  return request(
    "GET",
    `/api/admin/tax/profiles/missing?limit=${encodeURIComponent(String(limit))}`,
  );
}

export function getAdminTaxProfile(userId: string): Promise<{
  user: {
    id: string;
    full_name?: string | null;
    email?: string | null;
    role?: string | null;
  } | null;
  profile: TaxUserProfile | null;
}> {
  return request(
    "GET",
    `/api/admin/tax/profiles/${encodeURIComponent(userId)}`,
  );
}

export function patchAdminTaxProfile(
  userId: string,
  body: Partial<TaxUserProfile> & { reason?: string },
): Promise<{ profile: TaxUserProfile }> {
  return request(
    "PATCH",
    `/api/admin/tax/profiles/${encodeURIComponent(userId)}`,
    body,
  );
}

export interface ProviderWhtPosting {
  id: string;
  source_event_id: string;
  source_event_type: string;
  source_payment_id: string | null;
  source_job_id: string | null;
  source_booking_id: string | null;
  source_milestone_id: string | null;
  provider_user_id: string;
  provider_name?: string | null;
  provider_email?: string | null;
  gross_income_amount: number;
  wht_rate_percent: number;
  withheld_amount: number;
  net_payable_amount: number;
  eligibility_status:
    | "eligible"
    | "blocked_missing_tax_profile"
    | "not_eligible";
  eligibility_reason: string | null;
  earning_document_id: string | null;
  earning_document_no?: string | null;
  earning_document_status?: string | null;
  wht_certificate_document_id: string | null;
  wht_certificate_document_no?: string | null;
  wht_certificate_document_status?: string | null;
  created_at: string;
}

export function getProviderWhtPostings(
  params: {
    limit?: number;
    status?: string;
    provider_user_id?: string;
  } = {},
): Promise<{ postings: ProviderWhtPosting[] }> {
  const search = new URLSearchParams();
  if (params.limit) search.set("limit", String(params.limit));
  if (params.status) search.set("status", params.status);
  if (params.provider_user_id)
    search.set("provider_user_id", params.provider_user_id);
  const qs = search.toString();
  return request("GET", `/api/admin/tax/wht-postings${qs ? `?${qs}` : ""}`);
}

export interface TaxExportMeta {
  report_type: string;
  generated_by: string;
  generated_at: string;
  filters: {
    month: number;
    year: number;
    from_date: string;
    to_date_exclusive: string;
  };
  row_count?: number;
  totals?: Record<string, unknown>;
  checksum_sha256: string;
  csv_checksum_sha256?: string;
}

export interface TaxMonthlyPackFile {
  name: string;
  filename: string;
  checksum_sha256: string;
  row_count: number;
}

export interface TaxMonthlyPack {
  meta: TaxExportMeta & {
    files: TaxMonthlyPackFile[];
    reconciliation: Record<string, unknown>;
  };
  files: Array<TaxMonthlyPackFile & { csv: string }>;
}

export function getTaxMonthlyPack(
  month: number,
  year: number,
): Promise<TaxMonthlyPack> {
  return request(
    "GET",
    `/api/admin/tax/export/monthly-pack?month=${encodeURIComponent(String(month))}&year=${encodeURIComponent(String(year))}`,
  );
}

export interface EtaxReadinessDocument {
  id: string;
  document_no: string | null;
  document_type: string;
  status: string;
  party_role: string;
  party_user_id: string | null;
  subtotal_amount: number;
  vat_amount: number;
  wht_amount: number;
  total_amount: number;
  issued_at: string | null;
  created_at: string | null;
  etax_status: string;
  etax_provider: string | null;
  etax_provider_document_id: string | null;
  etax_submitted_at: string | null;
  etax_error: string | null;
  etax_response_json?: unknown;
}

export interface EtaxValidationIssue {
  path: string;
  code: string;
  message: string;
}

export interface EtaxDryRunResponse {
  dry_run: true;
  provider: string;
  document_id: string;
  ok: boolean;
  validation: {
    ok: boolean;
    errors: EtaxValidationIssue[];
    warnings: EtaxValidationIssue[];
  };
  payload: unknown | null;
  submit?: {
    submitted: boolean;
    status: string;
    provider: string;
    error?: string;
  };
}

export function getEtaxReadiness(
  params: { limit?: number; status?: string } = {},
): Promise<{
  summary: Array<{ etax_status: string; count: number }>;
  documents: EtaxReadinessDocument[];
}> {
  const search = new URLSearchParams();
  if (params.limit) search.set("limit", String(params.limit));
  if (params.status) search.set("status", params.status);
  const qs = search.toString();
  return request("GET", `/api/admin/tax/etax/readiness${qs ? `?${qs}` : ""}`);
}

export function dryRunEtaxDocument(
  documentId: string,
  provider = "provider_neutral_dry_run",
): Promise<EtaxDryRunResponse> {
  return request(
    "POST",
    `/api/admin/tax/etax/documents/${encodeURIComponent(documentId)}/dry-run`,
    { provider },
  );
}

export function getEtaxPayload(
  documentId: string,
  provider = "provider_neutral_dry_run",
): Promise<EtaxDryRunResponse> {
  return request(
    "GET",
    `/api/admin/tax/etax/documents/${encodeURIComponent(documentId)}/payload?provider=${encodeURIComponent(provider)}`,
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
  { code: "TH", name: "Thailand", currency: "THB", flag: "🇹🇭" },
  { code: "ID", name: "Indonesia", currency: "IDR", flag: "🇮🇩" },
  { code: "VN", name: "Vietnam", currency: "VND", flag: "🇻🇳" },
  { code: "MY", name: "Malaysia", currency: "MYR", flag: "🇲🇾" },
  { code: "LA", name: "Laos", currency: "LAK", flag: "🇱🇦" },
] as const;

export interface FinancialStrategyResponse {
  region: string;
  currency: string;
  totalReserves: number;
  monthlyBurnRate: number;
  runwayMonths: number;
  expansionBudget: number;
  allocation: Array<{
    category: string;
    percentage: number;
    amount: number;
    description: string;
  }>;
  updatedAt: string | null;
}

export function getFinancialStrategy(
  region?: string,
): Promise<FinancialStrategyResponse> {
  const q = region ? `?region=${encodeURIComponent(region)}` : "";
  return request<FinancialStrategyResponse>(
    "GET",
    "/api/admin/financial/strategy" + q,
  );
}

export function patchFinancialStrategy(body: {
  region: string;
  totalReserves?: number;
  monthlyBurnRate?: number;
  expansionBudget?: number;
  allocation?: Array<{
    category: string;
    percentage: number;
    amount: number;
    description: string;
  }>;
}): Promise<FinancialStrategyResponse> {
  return request<FinancialStrategyResponse>(
    "PATCH",
    "/api/admin/financial/strategy",
    body,
  );
}

export interface FinancialStrategyAllResponse {
  baseCurrency: string;
  strategies: Array<
    FinancialStrategyResponse & {
      totalReservesInBase: number;
      monthlyBurnRateInBase: number;
      expansionBudgetInBase: number;
    }
  >;
  exchangeRates: Record<string, number>;
  aggregated: {
    totalReservesInBase: number;
    totalMonthlyBurnInBase: number;
    runwayMonths: number;
  };
}

export function getFinancialStrategyAll(
  baseCurrency?: string,
): Promise<FinancialStrategyAllResponse> {
  const q = baseCurrency ? `?base=${encodeURIComponent(baseCurrency)}` : "";
  return request<FinancialStrategyAllResponse>(
    "GET",
    "/api/admin/financial/strategy/all" + q,
  );
}

export interface ExchangeRateEntry {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  updatedAt: string | null;
}

export function getExchangeRates(
  baseCurrency?: string,
): Promise<{ baseCurrency: string; rates: ExchangeRateEntry[] }> {
  const q = baseCurrency ? `?base=${encodeURIComponent(baseCurrency)}` : "";
  return request<{ baseCurrency: string; rates: ExchangeRateEntry[] }>(
    "GET",
    "/api/admin/exchange-rates" + q,
  );
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
    "/api/audit/logs" + (q ? "?" + q : ""),
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
    "/api/admin/financial/audit" + (q ? "?" + q : ""),
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

export function getVipAdminFund(params?: {
  limit?: number;
}): Promise<VipAdminFundResponse> {
  const sp = new URLSearchParams();
  if (params?.limit != null) sp.set("limit", String(params.limit));
  const q = sp.toString();
  return request<VipAdminFundResponse>(
    "GET",
    "/api/admin/financial/vip-admin-fund" + (q ? "?" + q : ""),
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
  return request<RevenueBySourceResponse>(
    "GET",
    "/api/admin/financial/revenue-by-source",
  );
}

// ============ Financial Control Settings (Admin Steering) ============

/** Persisted/normalized payout withdrawal fee lanes (mirror backend). */
export interface WithdrawalFeePolicyLaneFlat {
  mode: "flat";
  fee_thb: number;
  eta_label_th?: string;
}

export interface WithdrawalFeePolicyLanePercent {
  mode: "percent";
  percent: number;
  min_fee_thb: number;
  max_fee_thb: number | null;
  eta_label_th?: string;
}

export type WithdrawalFeePolicyLaneResolved =
  | WithdrawalFeePolicyLaneFlat
  | WithdrawalFeePolicyLanePercent;

export interface WithdrawalFeePolicyFull {
  bank_transfer: WithdrawalFeePolicyLaneResolved;
  promptpay: WithdrawalFeePolicyLaneResolved;
  truemoney: WithdrawalFeePolicyLaneResolved;
  provider_batch: WithdrawalFeePolicyLaneResolved;
  provider_instant: WithdrawalFeePolicyLaneResolved;
  processor_cost_estimate_thb: number;
}

export interface WithdrawalFeePolicyPreviewQuote {
  fee_lane: string;
  fee_thb: number;
  processor_cost_estimate_thb: number;
  platform_margin_amount: number;
  total_deduct: number;
  net_receive: number;
  eta_label_th: string;
}

export type AdminWithdrawalFeePreviewResponse =
  WithdrawalFeePolicyPreviewQuote & {
    ok: boolean;
    preview_used_draft_policy?: boolean;
  };

export interface FinancialControlSettingsResponse {
  withdrawal_min_jobs: number;
  withdrawal_min_balance_thb: number;
  withdrawal_fee_standard_thb: number;
  withdrawal_fee_instant_thb: number;
  /** Normalized lanes + processor estimate (undefined if payout_config legacy only). */
  withdrawal_fee_policy?: WithdrawalFeePolicyFull;
  fee_rates: {
    platform_fee?: Record<string, number>;
    commission_match_board?: Record<string, number>;
    commission_booking?: Record<string, number>;
    handling_fee_percent?: number;
    payment_markup_percent?: number;
    booking_sourcing_percent?: number;
    bidding_fee_percent?: number;
  };
  /** VIP subscription — priceMonthly THB, quotaPerMonth, discountPercent (merge with backend defaults) */
  vip_tiers?: {
    silver?: {
      priceMonthly?: number;
      quotaPerMonth?: number;
      discountPercent?: number;
    };
    gold?: {
      priceMonthly?: number;
      quotaPerMonth?: number;
      discountPercent?: number;
    };
    platinum?: {
      priceMonthly?: number;
      quotaPerMonth?: number;
      discountPercent?: number;
    };
  };
  /** ใบรับรองรายได้ + ช่วง min–max (THB) — sync กับ GET /api/payouts/settings */
  misc_fees?: {
    certified_statement_fee_thb?: number;
    certified_statement_fee_min_thb?: number;
    certified_statement_fee_max_thb?: number;
  };
  updated_at?: string | null;
}

export function getFinancialControlSettings(): Promise<FinancialControlSettingsResponse> {
  return request<FinancialControlSettingsResponse>(
    "GET",
    "/api/admin/financial/control-settings",
  );
}

export function patchFinancialControlSettings(body: {
  withdrawal_min_jobs?: number;
  withdrawal_min_balance_thb?: number;
  withdrawal_fee_standard_thb?: number;
  withdrawal_fee_instant_thb?: number;
  withdrawal_fee_policy?: WithdrawalFeePolicyFull;
  fee_rates?: {
    platform_fee?: Record<string, number>;
    commission_match_board?: Record<string, number>;
    commission_booking?: Record<string, number>;
    handling_fee_percent?: number;
    payment_markup_percent?: number;
    booking_sourcing_percent?: number;
    bidding_fee_percent?: number;
  };
  vip_tiers?: FinancialControlSettingsResponse["vip_tiers"];
  misc_fees?: FinancialControlSettingsResponse["misc_fees"];
}): Promise<FinancialControlSettingsResponse & { message?: string }> {
  return request("PATCH", "/api/admin/financial/control-settings", body);
}

export function previewAdminWithdrawalFee(body: {
  payout_amount_thb: number;
  channel?: string;
  is_provider?: boolean;
  instant_payout?: boolean;
  withdrawal_fee_policy_draft?: WithdrawalFeePolicyFull;
}): Promise<AdminWithdrawalFeePreviewResponse> {
  return request<AdminWithdrawalFeePreviewResponse>(
    "POST",
    "/api/admin/financial/withdrawal-fee-preview",
    body,
  );
}

export function verifyLedgerIntegrity(): Promise<{
  valid: boolean;
  total_rows: number;
  first_broken?: {
    id: string;
    created_at: string;
    expected: string;
    stored: string;
  };
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
  daily_trend?: Array<{
    date: string;
    revenue_a_commission: number;
    revenue_b_deposit_margin: number;
    revenue_c_withdrawal_margin: number;
    total_margin_thb: number;
    total_with_commission_thb: number;
  }>;
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

export function getPlatformRevenues(
  range?: "today" | "week" | "month",
): Promise<PlatformRevenuesResponse> {
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

export function resolveReconcileAlert(
  id: string,
  notes?: string,
): Promise<{ success: boolean }> {
  return request("PATCH", `/api/admin/reconcile/alerts/${id}/resolve`, {
    notes,
  });
}

// Security Pulse — Cyber Command Center
export interface SecurityStatsResponse {
  failedLogins24h: number;
  bruteForceIps?: Array<{ ip: string; count: number }>;
  ledgerIntegrity: {
    valid: boolean | null;
    totalRows?: number;
    total_rows?: number;
    firstBroken?: unknown;
    note: string;
  };
  suspiciousPayouts: Array<{
    id: string;
    userId: string;
    amount: number;
    status: string;
    createdAt: string | null;
    userName?: string;
  }>;
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

export function verifySecurityAll(): Promise<{
  valid: boolean;
  totalRows: number;
  firstBroken?: unknown;
  message: string;
}> {
  return request("POST", "/api/admin/security/verify-all", {});
}

export function getBlockedIps(): Promise<{
  blockedIps: Array<{
    id: string;
    ip: string;
    reason?: string;
    blocked_by?: string;
    blocked_at?: string;
  }>;
}> {
  return request("GET", "/api/admin/security/blocked-ips");
}

export function blockIp(
  ip: string,
  reason?: string,
): Promise<{ success: boolean; ip: string }> {
  return request("POST", "/api/admin/security/block-ip", { ip, reason });
}

export function unblockIp(
  ip: string,
): Promise<{ success: boolean; ip: string }> {
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

export function getHighRiskUsers(opts?: {
  limit?: number;
  offset?: number;
}): Promise<{ users: HighRiskUser[] }> {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.offset) params.set("offset", String(opts.offset));
  const q = params.toString();
  return request(
    "GET",
    "/api/admin/security/high-risk-users" + (q ? "?" + q : ""),
  );
}

// Tax & Compliance: Export Center + QR Audit
/** internal-ledger: excludeDemo=true → ?exclude_demo=1 (ไม่รวมแถว demo; default ไม่ส่ง = ทั้งหมด) */
export async function downloadExport(
  type: "official-revenue" | "internal-ledger" | "payout-recon",
  from?: string,
  to?: string,
  opts?: { excludeDemo?: boolean },
): Promise<void> {
  const base = ADMIN_API_BASE;
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (type === "internal-ledger" && opts?.excludeDemo)
    params.set("exclude_demo", "1");
  const q = params.toString();
  const url = `${base}/api/admin/financial/export/${type}${q ? "?" + q : ""}`;
  const token = getAdminToken();
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(await res.text().catch(() => "Export failed"));
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/);
  const filename =
    match?.[1] || `export_${type}_${new Date().toISOString().slice(0, 10)}.csv`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function getAuditByQr(
  q: string,
  opts?: { strictProduction?: boolean },
): Promise<{
  query: string;
  strict_production?: boolean;
  reporting_note?: string | null;
  ledger: Array<{
    id: string;
    tax_ref_id?: string;
    event_type: string;
    amount: number;
    bill_no?: string;
    transaction_no?: string;
    user_id?: string;
    provider_id?: string;
    created_at: string;
  }>;
  statements: Array<{
    id: string;
    user_id: string;
    period_from: string;
    period_to: string;
    fee_amount: number;
    status: string;
    qr_verification_code?: string;
  }>;
  audit_trail: Array<{
    id: number;
    actor_type: string;
    actor_id?: string;
    action: string;
    entity_type: string;
    entity_id: string;
    state_after?: unknown;
    reason?: string;
    created_at: string;
  }>;
}> {
  const sp = new URLSearchParams();
  sp.set("q", q);
  if (opts?.strictProduction) sp.set("strict_production", "1");
  return request("GET", "/api/admin/financial/audit-by-qr?" + sp.toString());
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
  reserve_60: number; // หัก TIPO แล้ว (ยอดสำรองที่แท้จริง)
  gross_reserve_60?: number; // ก่อนหักเคลม
  manageable_40: number;
  already_withdrawn_for_investment: number;
  allowed_to_withdraw: number;
  source?: string;
  // ── Claims integration ──
  pending_claims_count?: number; // จำนวน claim รอพิจารณา
  total_claims_approved_amount?: number; // ยอด payout อนุมัติแล้วทั้งหมด
  pending_claims_exposure?: number; // ความเสี่ยง (pending claims × 55%)
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

export function getJobCategoryList(): Promise<{
  categories: JobCategoryItem[];
}> {
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

export function getPaymentLedger(params?: {
  limit?: number;
  job_id?: string;
  excludeDemo?: boolean;
}): Promise<{
  source: string;
  exclude_demo?: boolean;
  count: number;
  entries: PaymentLedgerEntry[];
}> {
  const sp = new URLSearchParams();
  if (params?.limit != null) sp.set("limit", String(params.limit));
  if (params?.job_id) sp.set("job_id", params.job_id);
  if (params?.excludeDemo) sp.set("exclude_demo", "1");
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
}): Promise<{
  id: string;
  sentAt: string;
  fcm?: { success: number; failed: number };
}> {
  return request("POST", "/api/admin/notifications/broadcast", body);
}

export function getAdminNotifications(limit?: number): Promise<{
  notifications: BroadcastNotificationItem[];
}> {
  const sp = new URLSearchParams();
  if (limit != null) sp.set("limit", String(limit));
  const q = sp.toString();
  return request("GET", "/api/admin/notifications" + (q ? "?" + q : ""));
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
  status: "operational" | "degraded";
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
  status: "Healthy" | "High Load" | "Critical" | "Down";
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
    cpu_source?: "os.loadavg" | "memory_proxy";
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
    missingDetails: {
      key: string;
      year: number;
      month: string;
      label: string;
    }[];
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
  replicationRows: {
    applicationName: string;
    clientAddr: string;
    state: string;
    replayLagSeconds: number;
    syncState: string;
  }[];
  syncThroughputMbps: number;
  standbyHealthy: boolean;
  standbyLatencyMs: number | null;
  storageSyncOk: boolean;
  storageFileCount: number;
  lastBackup: string;
  lastBackupIso?: string | null;
  backupSource?: string;
  activeRegion: "Primary" | "DR";
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
  results: {
    standbyReachable: boolean;
    ledgerChainAccessible: boolean;
    taxDocumentsAccessible: boolean;
  };
  note: string;
}> {
  return request("POST", "/api/admin/dr/simulate-failover");
}

export function activateDRFailover(
  masterPin: string,
  confirmText: string,
): Promise<{
  success: boolean;
  message: string;
  stages: {
    id: number;
    name: string;
    status: string;
    estimatedMinutes: number;
  }[];
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

export function clearJobsCache(): Promise<{
  cleared: number;
  message: string;
}> {
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
    mode: "MANUAL" | "AUTO_SAVER" | "AUTO_BALANCED" | "AUTO_PERFORMANCE";
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
  scalingPolicy?: Partial<ResourceCostResponse["scalingPolicy"]>;
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
  let level: "INFO" | "WARNING" | "ERROR" | "CRITICAL" =
    r.status === "Failed" ? "ERROR" : "INFO";
  const act = (r.action || "").toUpperCase();
  if (
    level === "INFO" &&
    (act.includes("REJECT") ||
      act.includes("FAIL") ||
      act.includes("TIMEOUT") ||
      act.includes("BLOCK"))
  )
    level = "WARNING";
  const entity = (r.entity_name || r.entity_type || "").toLowerCase();
  let source: "API" | "DB" | "AUTH" | "SYSTEM" | "SECURITY" = "SYSTEM";
  if (
    entity.includes("user") ||
    entity.includes("auth") ||
    entity.includes("kyc") ||
    entity.includes("login")
  )
    source = "AUTH";
  else if (
    entity.includes("payment") ||
    entity.includes("wallet") ||
    entity.includes("ledger") ||
    entity.includes("job")
  )
    source = "API";
  else if (entity.includes("db") || entity.includes("audit")) source = "DB";
  else if (
    entity.includes("security") ||
    entity.includes("brute") ||
    entity.includes("block")
  )
    source = "SECURITY";
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
}): Promise<{
  logs: import("../types").SystemLog[];
  count: number;
  total: number;
}> {
  const sp = new URLSearchParams();
  if (params?.limit != null) sp.set("limit", String(params.limit));
  if (params?.offset != null) sp.set("offset", String(params.offset));
  if (params?.from_date) sp.set("from_date", params.from_date);
  if (params?.to_date) sp.set("to_date", params.to_date);
  if (params?.action) sp.set("action", params.action);
  if (params?.entity_type) sp.set("entity_type", params.entity_type);
  const q = sp.toString();
  return request<SystemLogsResponse>(
    "GET",
    "/api/audit/logs" + (q ? "?" + q : ""),
  ).then((res) => ({
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
  assignedToAdminId?: string | null;
  assignedToName?: string | null;
  waitingOn?: string;
  firstAdminReplyAt?: string | null;
  slaDueAt?: string | null;
  isEmergency?: boolean;
  emergencyKind?: string | null;
  care_timeline?: SupportCareTimelineEvent[];
  situation_cards?: SupportSituationCard[];
  reroute_sla?: SupportRerouteSla | null;
  replacement_candidates?: SupportReplacementCandidate[];
  reroute_invitations?: SupportRerouteInvitation[];
  care_outcomes?: SupportCareOutcome[];
  last_care_outcome?: SupportCareOutcome | null;
  provider_reliability_signal?: {
    reason?: string;
    severity?: string;
    ranking_effect?: string;
    captured_at?: string;
  } | null;
}

export interface SupportCareTimelineEvent {
  id: string;
  stage: string;
  label: string;
  status?: string;
  detail?: string | null;
  candidate_count?: number | null;
  provider_id?: string | null;
  provider_name?: string | null;
  action?: string | null;
  at: string;
}

export interface SupportReplacementCandidate {
  id: string;
  full_name?: string;
  worker_grade?: string;
  avg_rating?: number | null;
  total_jobs?: number | null;
  success_rate?: number | null;
  is_vvip_eligible?: boolean;
}

export interface SupportRerouteInvitation {
  id: string;
  status: string;
  candidates?: SupportReplacementCandidate[];
  invited_provider_ids?: string[];
  sent_at?: string;
  expires_at?: string | null;
  accept_window_ms?: number;
  accepted_provider_id?: string | null;
  accepted_at?: string | null;
  expired_at?: string | null;
}

export interface SupportCareOutcome {
  id: string;
  type: string;
  label: string;
  provider_id?: string | null;
  provider_name?: string | null;
  job_id?: string | null;
  note?: string | null;
  actor?: string;
  at: string;
}

export interface SupportSituationCard {
  id: string;
  title: string;
  description: string;
  action_type: string;
  recommended?: boolean;
  reason?: string;
}

export interface SupportRerouteSla {
  status?: string;
  stage?: string;
  started_at?: string;
  updated_at?: string;
  first_candidate_check_ms?: number;
  expanded_search_ms?: number;
  fallback_options_ms?: number;
  job_id?: string;
  candidate_count?: number;
  invited_count?: number;
  accept_window_ms?: number;
  accept_deadline_at?: string | null;
  active_invitation_id?: string;
  confirmed_provider_id?: string;
  confirmed_at?: string;
}

export interface SupportMessageRow {
  id: string;
  ticketId: string;
  sender: string;
  message: string;
  timestamp: string;
  source?: string;
  faqScore?: number | null;
  ai_actions?: string[];
  quick_actions?: Array<{
    id: string;
    label: string;
    type: string;
    url?: string;
  }>;
  diagnostic_summary?: string | null;
  escalation?: { level?: string; reason?: string } | null;
  feedback?: { helpful: boolean; reason?: string | null; at?: string };
  care_timeline?: SupportCareTimelineEvent[];
  situation_cards?: SupportSituationCard[];
  reroute_sla?: SupportRerouteSla | null;
}

export function getSupportTickets(
  status?: string,
): Promise<{ tickets: SupportTicketRow[] }> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return request("GET", "/api/admin/support/tickets" + q);
}

export function getSupportTicketMessages(
  ticketId: string,
): Promise<{ messages: SupportMessageRow[] }> {
  return request("GET", `/api/admin/support/tickets/${ticketId}/messages`);
}

export function replySupportTicket(
  ticketId: string,
  message: string,
  asBot?: boolean,
  asProvider?: boolean,
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
    return await request<SupportCrisisAlertResponse>(
      "GET",
      "/api/admin/support/crisis-alert",
    );
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

export function startSupportCareReroute(
  ticketId: string,
  body: { job_id?: string | null } = {},
): Promise<{
  ok: boolean;
  candidate_count?: number;
  candidates?: SupportReplacementCandidate[];
  invitation?: SupportRerouteInvitation | null;
}> {
  return request(
    "POST",
    `/api/support/tickets/${encodeURIComponent(ticketId)}/care-reroute`,
    body,
  );
}

export interface SupportCareAnalyticsSummary {
  pushes: number;
  success_tokens: number;
  failed_tokens: number;
  opened: number;
  open_rate_pct: number;
  accepted: number;
  accept_rate_pct: number;
  avg_accept_ms?: number | null;
  p50_accept_ms?: number | null;
  p90_accept_ms?: number | null;
}

export interface SupportCareAnalyticsProvider {
  provider_id: string;
  provider_name?: string | null;
  accepts: number;
  avg_accept_ms: number;
  best_accept_ms: number;
}

export interface SupportCareAnalyticsEvent {
  id: string;
  ticket_id?: string | null;
  invitation_id?: string | null;
  job_id?: string | null;
  provider_id?: string | null;
  provider_name?: string | null;
  push_sent_at?: string | null;
  tokens_success?: number;
  tokens_failed?: number;
  opened_at?: string | null;
  opened_source?: string | null;
  accepted_at?: string | null;
  push_to_accept_ms?: number | null;
}

export function getSupportCareAnalytics(hours = 24): Promise<{
  hours: number;
  summary: SupportCareAnalyticsSummary;
  fastest_providers: SupportCareAnalyticsProvider[];
  recent_events: SupportCareAnalyticsEvent[];
}> {
  return request(
    "GET",
    `/api/admin/support/care-analytics?hours=${encodeURIComponent(String(hours))}`,
  );
}

export function getSupportCareAnalyticsTrend(days: 7 | 30): Promise<{
  days: number;
  points: Array<{
    day: string;
    pushes: number;
    opened: number;
    accepted: number;
    success_tokens: number;
    failed_tokens: number;
    open_rate_pct: number;
    accept_rate_pct: number;
  }>;
}> {
  return request(
    "GET",
    `/api/admin/support/care-analytics/trend?days=${encodeURIComponent(String(days))}`,
  );
}

export function exportSupportCareAnalyticsCsv(hours = 24 * 7): Promise<Blob> {
  const url = `${ADMIN_API_BASE}/api/admin/support/care-analytics/export.csv?hours=${encodeURIComponent(String(hours))}`;
  return fetch(url, {
    headers: { Authorization: `Bearer ${getAdminToken()}` },
  }).then((r) => {
    if (!r.ok) throw new Error("Export failed");
    return r.blob();
  });
}

export function applySupportCareAction(
  ticketId: string,
  body:
    | { action: "confirm_replacement"; provider_id: string; actor?: string }
    | {
        action: "refund" | "coupon" | "insurance" | "review_provider";
        actor?: string;
      },
): Promise<{
  ok: boolean;
  ticket?: SupportTicketRow;
  outcome?: SupportCareOutcome;
}> {
  return request(
    "POST",
    `/api/support/tickets/${encodeURIComponent(ticketId)}/care-actions`,
    body,
  );
}

export function inviteSupportProvider(ticketId: string): Promise<{
  ticket: SupportTicketRow;
  invited_provider_id: string;
  invited_provider_name: string;
}> {
  return request(
    "POST",
    `/api/admin/support/tickets/${encodeURIComponent(ticketId)}/invite-provider`,
    {},
  );
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

export function getSupportSentimentTrend(
  hours = 24,
): Promise<SupportSentimentTrendResponse> {
  return request<SupportSentimentTrendResponse>(
    "GET",
    `/api/admin/support/sentiment-trend?hours=${encodeURIComponent(String(hours))}`,
  );
}

export function generateSupportFaqDraft(ticketId: string): Promise<{
  draft: { id: string; created_at: string };
  faq: { question: string; answer: string; category: string };
}> {
  return request(
    "POST",
    `/api/admin/support/tickets/${encodeURIComponent(ticketId)}/generate-faq-draft`,
    {},
  );
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
  can_manage_knowledge?: boolean;
}> {
  const q = limit != null ? `?limit=${encodeURIComponent(String(limit))}` : "";
  return request("GET", "/api/admin/support/knowledge-drafts" + q);
}

export function addSupportTicketMediaUrl(
  ticketId: string,
  body: { url: string; type?: string },
): Promise<{ ticket: SupportTicketRow }> {
  return request(
    "POST",
    `/api/admin/support/tickets/${encodeURIComponent(ticketId)}/attachments`,
    body,
  );
}

export function resolveSupportTicket(
  ticketId: string,
  status: string,
): Promise<{ ticket: SupportTicketRow }> {
  return request("PATCH", `/api/admin/support/tickets/${ticketId}`, { status });
}

export function setSupportTicketAiMode(
  ticketId: string,
  aiMode: boolean,
): Promise<{ ticket: SupportTicketRow }> {
  return request("PATCH", `/api/admin/support/tickets/${ticketId}`, { aiMode });
}

export function patchSupportTicket(
  ticketId: string,
  body: {
    status?: string;
    aiMode?: boolean;
    waitingOn?: string;
    assignToMe?: boolean;
  },
): Promise<{ ticket: SupportTicketRow }> {
  return request("PATCH", `/api/admin/support/tickets/${ticketId}`, body);
}

export function getSupportAiSuggestion(ticketId: string): Promise<{
  suggestion: string;
  source?: "faq_match" | "ai_generated";
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

export function deleteFaqKnowledge(
  id: string,
): Promise<{ success: boolean; message: string }> {
  return request(
    "DELETE",
    `/api/admin/support/faq-knowledge/${encodeURIComponent(id)}`,
  );
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
    {},
  );
}

// ============ Mobile App Config (ตั้งค่า Mobile App) ============
export interface MobileAppRemote {
  paymentNoticeTh: string;
  paymentNoticeEn: string;
  transportNoticeTh: string;
  transportNoticeEn: string;
  promoNoticeTh: string;
  promoNoticeEn: string;
  showPromoFundBalance: boolean;
  complianceSupportEmail: string;
}

export interface MobileAppConfig {
  iosMinVersion: string;
  androidMinVersion: string;
  welcomeMessage: string;
  forceUpdateMessage: string;
  iosStoreUrl: string;
  playStoreUrl: string;
  pushNotificationEnabled: boolean;
  remote: MobileAppRemote;
  featureFlags: {
    enableSignups: boolean;
    enablePayments: boolean;
    enableJobPosting: boolean;
    enableChat: boolean;
    enablePromoVouchers: boolean;
    maintenanceMode: boolean;
  };
}

export function getMobileConfig(): Promise<{
  config: MobileAppConfig;
  updatedAt: string | null;
}> {
  return request("GET", "/api/admin/mobile-config");
}

export function patchMobileConfig(
  body: Partial<MobileAppConfig>,
): Promise<{ config: MobileAppConfig; updatedAt: string }> {
  return request("PATCH", "/api/admin/mobile-config", body);
}

/** เป้าหมายร่วมบน Home — system_settings.community_challenge */
export interface CommunityChallengeConfig {
  enabled: boolean;
  titleTh: string;
  titleEn: string;
  subtitleTh: string;
  subtitleEn: string;
  onlineWindowMinutes: number;
  periodStart: string | null;
  periodEnd: string | null;
  targetOnlineUsers: number;
  targetJobsPosted: number;
  targetHires: number;
  targetCompleted: number;
  rewardTitleTh: string;
  rewardTitleEn: string;
  rewardDescriptionTh: string;
  rewardDescriptionEn: string;
  employerNoteTh: string;
  employerNoteEn: string;
  providerNoteTh: string;
  providerNoteEn: string;
}

export interface CommunityChallengeSnapshot {
  config: CommunityChallengeConfig;
  stats: Record<string, unknown>;
  updatedAt?: string | null;
}

export function getCommunityChallenge(): Promise<CommunityChallengeSnapshot> {
  return request("GET", "/api/admin/community-challenge");
}

export function patchCommunityChallenge(
  body: Partial<CommunityChallengeConfig>,
): Promise<CommunityChallengeSnapshot & { updatedAt: string }> {
  return request("PATCH", "/api/admin/community-challenge", body);
}

/** Payso / Ksher / Stripe + MDR snapshot (อ่านจาก ENV บน API) */
export function getPaymentProviderGate(): Promise<Record<string, unknown>> {
  return request("GET", "/api/admin/payment-provider-gate");
}

/** สลับ local gateway / match markup แบบเรียลไทม์ (persist ที่ backend/data) — ไม่ต้องรีสตาร์ท Node */
export interface PatchPaymentProviderGateBody {
  localGateway?: "payso" | "ksher";
  /** 0–50 (percent), e.g. 5 for 5% */
  matchMarkupPercent?: number;
  matchMarkupRateDecimal?: number;
  /** true = ปิด QR เติมเงิน PaySo สำหรับผู้ใช้มือถือ (โอนสลิปยังใช้ได้) */
  paysoQrDepositBlocked?: boolean;
  reset?: boolean;
  clear?: boolean;
}

export function patchPaymentProviderGate(
  body: PatchPaymentProviderGateBody,
): Promise<Record<string, unknown>> {
  return request("PATCH", "/api/admin/payment-provider-gate", body);
}

/** Transport Hub — local distance pricing (system_settings) */
export interface DistancePricingSettings {
  base_fare_thb: number;
  price_per_km_thb: number;
  minimum_fare_thb: number;
  markup_rate?: number;
  markup_percent?: number;
  updated_at?: string | null;
}

const DISTANCE_PRICING_ADMIN_GET_PATHS = [
  "/api/admin/wallet/distance-pricing",
  /** รองรับโค้ด/ proxy ที่ตัด path ผิด (เดิมเคยยิงแบบไม่มี `wallet`) */
  "/api/admin/distance-pricing",
  "/api/admin/settings/pricing",
] as const;

/** เรียงลำดับรองรับ proxy ที่เปิดแค่ /api/admin/wallet/* — ถ้ายังได้ 404 ลองชื่อเดิมจาก admin เก่า */
export async function getDistancePricingSettings(): Promise<DistancePricingSettings> {
  let lastErr: unknown;
  for (const path of DISTANCE_PRICING_ADMIN_GET_PATHS) {
    try {
      return await request<DistancePricingSettings>("GET", path);
    } catch (e: unknown) {
      const status =
        typeof e === "object" && e !== null && "status" in e
          ? (e as { status?: number }).status
          : undefined;
      const msg = e instanceof Error ? e.message : String(e);
      const is404 = status === 404 || /\b404\b/.test(msg);
      if (is404) {
        lastErr = e;
        continue;
      }
      throw e;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(
        typeof lastErr === "string" ? lastErr : "distance_pricing_unreachable",
      );
}

export async function patchDistancePricingSettings(
  body: Partial<
    Pick<
      DistancePricingSettings,
      "base_fare_thb" | "price_per_km_thb" | "minimum_fare_thb"
    >
  >,
): Promise<DistancePricingSettings> {
  let lastErr: unknown;
  for (const path of DISTANCE_PRICING_ADMIN_GET_PATHS) {
    try {
      return await request<DistancePricingSettings>("PATCH", path, body);
    } catch (e: unknown) {
      const status =
        typeof e === "object" && e !== null && "status" in e
          ? (e as { status?: number }).status
          : undefined;
      const msg = e instanceof Error ? e.message : String(e);
      const is404 = status === 404 || /\b404\b/.test(msg);
      if (is404) {
        lastErr = e;
        continue;
      }
      throw e;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(
        typeof lastErr === "string" ? lastErr : "distance_pricing_unreachable",
      );
}

/** บันทึก gateway: ยอดเต็ม / MDR / กำไรประมาณ (ต้องมีตาราง payment_transaction_logs) */
export function getPaymentTransactionLogs(
  limit?: number,
): Promise<{ rows: Record<string, unknown>[]; limit: number }> {
  const q = limit != null ? `?limit=${encodeURIComponent(String(limit))}` : "";
  return request("GET", `/api/admin/payment-transaction-logs${q}`);
}

/** AQOND Internal Gateway — Admin Console (migration 146) — masked data requires `accessReason` (ISO 27001) */
export function getInternalGatewayMetrics(
  days?: number,
  accessReason?: string,
): Promise<Record<string, unknown>> {
  const q = new URLSearchParams();
  if (days != null) q.set("days", String(days));
  if (accessReason) q.set("reason", accessReason);
  const qs = q.toString();
  return request(
    "GET",
    `/api/admin/internal-gateway/metrics${qs ? `?${qs}` : ""}`,
  );
}

export function getInternalGatewayTransactions(
  limit?: number,
  accessReason?: string,
): Promise<{
  rows: Record<string, unknown>[];
  limit: number;
}> {
  const q = new URLSearchParams();
  if (limit != null) q.set("limit", String(limit));
  if (accessReason) q.set("reason", accessReason);
  const qs = q.toString();
  return request(
    "GET",
    `/api/admin/internal-gateway/transactions${qs ? `?${qs}` : ""}`,
  );
}

export function getInternalGatewaySettlementReports(
  limit?: number,
  accessReason?: string,
): Promise<{
  rows: Record<string, unknown>[];
  limit: number;
}> {
  const q = new URLSearchParams();
  if (limit != null) q.set("limit", String(limit));
  if (accessReason) q.set("reason", accessReason);
  const qs = q.toString();
  return request(
    "GET",
    `/api/admin/internal-gateway/settlement-reports${qs ? `?${qs}` : ""}`,
  );
}

export function verifyInternalGatewayLedger(
  reason?: string,
): Promise<Record<string, unknown>> {
  const body =
    reason && reason.trim().length >= 3
      ? { reason: reason.trim().slice(0, 500) }
      : {};
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

export function getInternalGatewayAuditLogs(
  limit?: number,
  accessReason?: string,
): Promise<{
  rows: Record<string, unknown>[];
  limit: number;
}> {
  const q = new URLSearchParams();
  if (limit != null) q.set("limit", String(limit));
  if (accessReason) q.set("reason", accessReason);
  const qs = q.toString();
  return request(
    "GET",
    `/api/admin/internal-gateway/audit-logs${qs ? `?${qs}` : ""}`,
  );
}

export function getInternalGatewayPulse(): Promise<Record<string, unknown>> {
  return request("GET", "/api/admin/internal-gateway/pulse");
}

export function getInternalGatewayPayoutRouteSuggest(
  amountMinor: number,
  preferSpeed?: boolean,
): Promise<Record<string, unknown>> {
  const q = new URLSearchParams({
    amountMinor: String(amountMinor),
    ...(preferSpeed ? { preferSpeed: "1" } : {}),
  });
  return request(
    "GET",
    `/api/admin/internal-gateway/payout-route-suggest?${q.toString()}`,
  );
}

// ============ Banners (Content Manager → แสดงที่ Home + โค้ดส่วนลด) ============
export function getBanners(): Promise<{
  banners: import("../types").AppBanner[];
}> {
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
  promoClaimsEnabled?: boolean;
  [key: string]: unknown;
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
    promoClaimsEnabled: boolean;
    [key: string]: unknown;
  }>,
): Promise<{ banner: import("../types").AppBanner }> {
  return request("PATCH", `/api/admin/banners/${encodeURIComponent(id)}`, body);
}

export function deleteBanner(id: string): Promise<void> {
  return request("DELETE", "/api/admin/banners/" + encodeURIComponent(id));
}

function formatUploadNetworkError(url: string, cause: unknown): Error {
  const devHint =
    typeof import.meta !== "undefined" && (import.meta as any).env?.DEV
      ? " ตรวจว่า backend รันอยู่ (เช่น cd backend && node server.js ที่พอร์ตใน VITE_ADMIN_API_URL) และใช้ npm run dev ของ Admin เพื่อให้ proxy /api ทำงาน"
      : " ตรวจว่าเปิด Admin จาก https://admin.aqond.com และ API ที่ https://api.aqond.com พร้อม CORS";
  const msg =
    cause instanceof Error && /failed to fetch/i.test(cause.message)
      ? `เชื่อมต่อ API ไม่ได้ (${url}) — มักเกิดจาก backend ไม่รัน, CORS, หรือเปิด Admin จากพอร์ตที่ API ไม่อนุญาต.${devHint}`
      : cause instanceof Error
        ? cause.message
        : String(cause);
  return new Error(msg);
}

export async function uploadBannerImage(file: File): Promise<{
  url: string;
  key?: string;
  bytes?: number;
}> {
  const token = getAdminToken();
  if (!token) throw new Error("กรุณา Login ก่อนอัปโหลดรูป");
  const fd = new FormData();
  fd.append("file", file);
  const url = `${ADMIN_API_BASE}/api/admin/banners/upload-image`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: fd,
    });
  } catch (e) {
    throw formatUploadNetworkError(url, e);
  }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    let detail = t;
    try {
      if (t.startsWith("{")) {
        const j = JSON.parse(t) as { error?: string; message?: string };
        detail = [j.error, j.message].filter(Boolean).join(": ") || t;
      }
    } catch {
      /* keep raw */
    }
    throw new Error(
      `อัปโหลดรูปไม่สำเร็จ (HTTP ${res.status})${detail ? `: ${detail}` : ""}`,
    );
  }
  return (await res.json()) as { url: string; key?: string; bytes?: number };
}

// ============ Report Center (Admin BI) ============
export interface FinancialReportResponse {
  from_date: string;
  to_date: string;
  total_revenue: number;
  total_marketing_expense?: number;
  total_liabilities: number;
  daily: Array<{
    date: string;
    revenue: number;
    marketing_expense?: number;
    liabilities: number;
  }>;
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

export interface ExecutiveDailyReportStatusResponse {
  enabled: boolean;
  send_time: string;
  timezone: string;
  recipients: string[];
  window_days: number;
  last_sent_at?: string | null;
  last_report_date?: string | null;
  next_run_local?: string | null;
  next_run_date?: string | null;
  next_run_time?: string | null;
  next_run_timezone?: string | null;
  next_run_note?: string | null;
}

export interface ExecutiveDailyReportRunResponse {
  ok: boolean;
  sent: boolean;
  reason?: string;
  report_key?: string;
  report_date?: string;
  recipients?: string[];
  window_days?: number;
  row_count?: number;
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

export function getExecutiveDailyReportStatus(): Promise<ExecutiveDailyReportStatusResponse> {
  return request("GET", "/api/admin/reports/executive-daily/schedule");
}

export function updateExecutiveDailyReportSchedule(body: {
  enabled?: boolean;
  send_time?: string;
  timezone?: string;
  recipients?: string[] | string;
  window_days?: number;
}): Promise<ExecutiveDailyReportStatusResponse> {
  return request("PATCH", "/api/admin/reports/executive-daily/schedule", body);
}

export function runExecutiveDailyReport(body?: {
  force?: boolean;
  report_date?: string;
  window_days?: number;
}): Promise<ExecutiveDailyReportRunResponse> {
  return request(
    "POST",
    "/api/admin/cron/executive-daily-report/run",
    body || {},
  );
}

// ---------- Training Center: ข้อสอบ & คะแนน ----------
export interface TrainingExamConfig {
  module1: {
    passPercent: number;
    timeLimitMin: number;
    totalQuestions: number;
    categories?: string[];
    updatedAt?: string | null;
  };
  module2: {
    passPercent: number;
    timeLimitMin: number;
    totalQuestions: number;
    categories?: string[];
    updatedAt?: string | null;
  };
  module3: {
    passPercent: number;
    timeLimitMin: number;
    totalQuestions: number;
    categories?: string[];
    updatedAt?: string | null;
  };
}

export function getTrainingExamConfig(): Promise<TrainingExamConfig> {
  return request("GET", "/api/admin/training/exam-config");
}

export function updateTrainingExamConfig(params: {
  module: 1 | 2 | 3;
  passPercent?: number;
  timeLimitMin?: number;
  totalQuestions?: number;
}): Promise<{
  module: number;
  passPercent: number;
  timeLimitMin: number;
  totalQuestions: number;
  updatedAt: string | null;
}> {
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

export function updateLmsCourse(
  id: string,
  data: Partial<LmsCourse> & { videoUrl?: string },
): Promise<LmsCourse> {
  return request("PUT", `/api/admin/training/courses/${id}`, data);
}

export function getLmsLessons(
  courseId: string,
): Promise<{ lessons: LmsLesson[] }> {
  return request("GET", `/api/admin/training/courses/${courseId}/lessons`);
}

export function updateLmsLesson(
  lessonId: string,
  data: Partial<LmsLesson> & { videoUrl?: string; textContent?: string },
): Promise<LmsLesson> {
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

export function deleteLmsLesson(
  lessonId: string,
): Promise<{ deleted: boolean }> {
  return request("DELETE", `/api/admin/training/lessons/${lessonId}`);
}

export function reorderLmsLessons(
  courseId: string,
  order: string[],
): Promise<{ success: boolean; count: number }> {
  return request("PUT", "/api/admin/training/lessons/reorder", {
    courseId,
    order,
  });
}

export function getLmsQuestions(
  courseId: string,
): Promise<{ questions: LmsQuestion[] }> {
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

export function updateLmsQuestion(
  qid: string,
  data: Partial<LmsQuestion>,
): Promise<LmsQuestion> {
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

export function duplicateLmsQuestion(
  qid: string,
  targetCourseId?: string,
): Promise<LmsQuestion> {
  return request("POST", `/api/admin/training/questions/${qid}/duplicate`, {
    targetCourseId,
  });
}

export function bulkImportLmsQuestions(
  courseId: string,
  questions: Array<{
    questionText?: string;
    question_text?: string;
    text?: string;
    options?: Array<{ id: string; text: string } | string>;
    correctOptionId?: string;
    correct_option_id?: string;
  }>,
): Promise<{
  inserted: number;
  questions: Array<{ id: string; question_text: string }>;
}> {
  return request("POST", "/api/admin/training/questions/bulk-import", {
    courseId,
    questions,
  });
}

export function reorderLmsQuestions(
  courseId: string,
  order: string[],
): Promise<{ success: boolean; count: number }> {
  return request("PUT", "/api/admin/training/questions/reorder", {
    courseId,
    order,
  });
}

export interface TrainingStats {
  passRateByModule: Record<
    number,
    { passed: number; total: number; rate: number }
  >;
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

export function duplicateLmsCourse(
  courseId: string,
  newTitle?: string,
): Promise<LmsCourse> {
  return request("POST", `/api/admin/training/courses/${courseId}/duplicate`, {
    newTitle,
  });
}

export function aiGenerateQuestions(text: string): Promise<{
  questions: Array<{
    questionText: string;
    options: Array<{ id: string; text: string }>;
    correctOptionId: string;
  }>;
}> {
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

export function getLmsAssignments(
  status?: string,
): Promise<{ submissions: AssignmentSubmission[] }> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return request("GET", `/api/admin/training/assignments${q}`);
}

export function gradeLmsAssignment(
  id: string,
  status: "passed" | "failed",
  adminFeedback?: string,
): Promise<AssignmentSubmission> {
  return request("PUT", `/api/admin/training/assignments/${id}/grade`, {
    status,
    adminFeedback,
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Worker Emergency Incident Management
// ═══════════════════════════════════════════════════════════════════════

export type IncidentStatus = "pending" | "resolved" | "fraud";
export type IncidentResolutionAction =
  | "reroute"
  | "refund_close"
  | "mark_fraud";

export interface IncidentRow {
  id: string;
  job_id: string;
  type: string;
  description: string;
  evidence_images: string[];
  resolution_status: IncidentStatus;
  resolver_id: string | null;
  resolution_notes: string | null;
  reported_at: string;
  // joined fields
  job_title: string;
  job_price: number | null;
  job_category: string | null;
  job_location: string | null;
  client_id: string | null;
  worker_name: string;
  worker_avatar: string | null;
  worker_grade: string | null;
  client_name: string;
  client_email: string;
}

export interface ReplacementWorker {
  id: string;
  full_name: string;
  profile_image_url: string | null;
  worker_grade: string;
  avg_rating: number;
  total_jobs: number;
  success_rate: number;
}

/** GET /api/admin/incidents?status=pending|resolved|all — Admin dashboard ใช้ Bearer token จาก admin login */
export function getIncidents(params?: {
  status?: "pending" | "resolved" | "all";
  limit?: number;
  offset?: number;
}): Promise<{ incidents: IncidentRow[]; pending_count: number }> {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.offset) q.set("offset", String(params.offset));
  return request("GET", `/api/admin/incidents?${q}`);
}

/** GET /api/admin/incidents/pending-count — Admin dashboard ใช้ Bearer token จาก admin login */
export function getIncidentPendingCount(): Promise<{ count: number }> {
  return request("GET", "/api/admin/incidents/pending-count");
}

/** GET /api/admin/incidents/nearby-workers/:incidentId */
export function findReplacementWorkers(
  incidentId: string,
): Promise<{ workers: ReplacementWorker[]; job_id: string }> {
  return request("GET", `/api/admin/incidents/nearby-workers/${incidentId}`);
}

/** PATCH /api/admin/incidents/:id/resolve */
export function resolveIncident(
  id: string,
  action: IncidentResolutionAction,
  replacementWorkerId?: string,
  notes?: string,
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
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.offset) q.set("offset", String(params.offset));
  return request("GET", `/api/admin/reviews?${q}`);
}

/** PATCH /api/admin/reviews/:id/verify */
export function adminVerifyReview(
  reviewId: string,
  verified: boolean,
): Promise<{ success: boolean; is_verified: boolean }> {
  return request("PATCH", `/api/admin/reviews/${reviewId}/verify`, {
    verified,
  });
}

/** PATCH /api/admin/reviews/:id/flag */
export function adminFlagReview(
  reviewId: string,
  isFlagged: boolean,
  flaggedReason = "",
): Promise<{ success: boolean }> {
  return request("PATCH", `/api/admin/reviews/${reviewId}/flag`, {
    is_flagged: isFlagged,
    flagged_reason: flaggedReason,
  });
}

/** PATCH /api/admin/workers/:id/shadow-ban */
export function adminShadowBanWorker(
  workerId: string,
  reason: string,
): Promise<{ success: boolean }> {
  return request("PATCH", `/api/admin/workers/${workerId}/shadow-ban`, {
    reason,
  });
}

/** PATCH /api/admin/workers/:id/shadow-ban/lift */
export function adminLiftShadowBan(
  workerId: string,
): Promise<{ success: boolean }> {
  return request("PATCH", `/api/admin/workers/${workerId}/shadow-ban/lift`, {});
}

/** GET /api/admin/disputes */
export function getAdminDisputes(
  status: "pending" | "resolved" | "all" = "pending",
): Promise<{ disputes: AdminDisputeRow[] }> {
  return request("GET", `/api/admin/disputes?status=${status}`);
}

/** PATCH /api/admin/disputes/:id/resolve */
export function adminResolveDispute(
  reviewId: string,
  resolution: string,
  favor: "worker" | "client",
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
  if (params?.grade) q.set("grade", params.grade);
  if (params?.limit) q.set("limit", String(params.limit));
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

export function getCompliancePolicy(
  id: string,
): Promise<CompliancePolicyResponse> {
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

export function activateCompliancePolicy(
  id: string,
): Promise<{ success: boolean; message: string }> {
  return request("PATCH", `/api/admin/compliance/${id}/activate`);
}

// ============ Insurance Claims (Admin) ============

export interface InsuranceClaimRow {
  id: string;
  job_id: string;
  job_title?: string;
  job_category?: string;
  has_insurance?: boolean;
  insurance_amount?: number;
  claim_status: "pending" | "approved" | "rejected";
  original_price: number;
  replacement_payout: number;
  reserve_amount: number;
  evidence_text?: string;
  admin_note?: string;
  claimed_at?: string;
  resolved_at?: string;
  client_name?: string;
  client_email?: string;
  worker_name?: string;
  worker_email?: string;
  worker_avatar?: string;
  worker_grade?: string;
}

export function getAdminInsuranceClaims(params?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ claims: InsuranceClaimRow[]; total: number }> {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.offset) q.set("offset", String(params.offset));
  return request("GET", `/api/admin/insurance/claims?${q}`);
}

export function approveInsuranceClaim(
  id: string,
  body: { admin_note?: string; replacement_worker_id?: string },
): Promise<{ success: boolean; replacement_payout: number }> {
  return request("PATCH", `/api/admin/insurance/claims/${id}/approve`, body);
}

export function rejectInsuranceClaim(
  id: string,
  body: { admin_note?: string },
): Promise<{ success: boolean }> {
  return request("PATCH", `/api/admin/insurance/claims/${id}/reject`, body);
}

export function getCompliancePolicyHistory(
  type: string,
): Promise<CompliancePoliciesResponse> {
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

export function getAdminAccountDeletions(
  status?: string,
): Promise<{ requests: AccountDeletionRequest[] }> {
  const q = status ? `?status=${status}` : "?status=pending";
  return request("GET", `/api/admin/account-deletions${q}`);
}

export function patchAdminAccountDeletion(
  id: string,
  body: { status: "approved" | "rejected"; admin_notes?: string },
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

export function getAdminPdpaExport(
  status?: string,
): Promise<{ requests: PdpaExportRequest[] }> {
  const q = status ? `?status=${status}` : "?status=pending";
  return request("GET", `/api/admin/pdpa-export${q}`);
}

export function patchAdminPdpaExport(
  id: string,
  body: {
    status: "processing" | "completed" | "rejected";
    admin_notes?: string;
    export_file_url?: string;
  },
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

export function getAdminLawEnforcement(): Promise<{
  requests: LawEnforcementRequest[];
}> {
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
  body: {
    status: "processing" | "responded" | "rejected";
    response_notes?: string;
  },
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

// ============ Personal settlement (บัญชีชั่วคราว — migration 153) ============

export async function getPersonalSettlementAccountApi(): Promise<{
  account: PersonalSettlementAccount | null;
}> {
  return request("GET", "/api/admin/personal-settlement/account");
}

export async function putPersonalSettlementAccountApi(
  body: Omit<PersonalSettlementAccount, "id" | "updatedAt">,
): Promise<{ account: PersonalSettlementAccount }> {
  return request("PUT", "/api/admin/personal-settlement/account", {
    label: body.label,
    bankName: body.bankName,
    accountHolderName: body.accountHolderName,
    accountNumber: body.accountNumber,
    promptPayId: body.promptPayId,
    preferredMobileBankApps: body.preferredMobileBankApps,
    notes: body.notes,
  });
}

export async function getPersonalSettlementRecordsApi(params?: {
  direction?: "INBOUND" | "OUTBOUND";
  limit?: number;
}): Promise<{ records: ManualSettlementRecord[] }> {
  const sp = new URLSearchParams();
  if (params?.direction) sp.set("direction", params.direction);
  if (params?.limit != null) sp.set("limit", String(params.limit));
  const q = sp.toString();
  return request(
    "GET",
    "/api/admin/personal-settlement/records" + (q ? "?" + q : ""),
  );
}

export async function postPersonalSettlementRecordApi(
  body: Omit<ManualSettlementRecord, "id" | "createdAt"> & {
    idempotencyKey?: string;
  },
): Promise<{ record: ManualSettlementRecord }> {
  return request("POST", "/api/admin/personal-settlement/records", {
    direction: body.direction,
    channel: body.channel,
    amount: body.amount,
    currency: body.currency,
    referenceLabel: body.referenceLabel,
    bankReference: body.bankReference,
    transferAt: body.transferAt,
    status: body.status,
    notes: body.notes,
    slipUrl: body.slipUrl,
    idempotencyKey: body.idempotencyKey,
    createdBy: body.createdBy,
  });
}

export async function patchPersonalSettlementRecordApi(
  id: string,
  patch: Partial<
    Pick<
      ManualSettlementRecord,
      "status" | "notes" | "slipUrl" | "bankReference"
    >
  >,
): Promise<{ record: ManualSettlementRecord }> {
  return request(
    "PATCH",
    `/api/admin/personal-settlement/records/${encodeURIComponent(id)}`,
    {
      status: patch.status,
      notes: patch.notes,
      slipUrl: patch.slipUrl,
      bankReference: patch.bankReference,
    },
  );
}

/** อัปโหลดสลิป → S3 (multipart field name: file) */
export async function uploadPersonalSettlementSlip(
  file: File,
): Promise<{ url: string; key?: string }> {
  const base =
    typeof import.meta !== "undefined" && (import.meta as any).env?.DEV
      ? ""
      : ADMIN_API_BASE;
  const url = `${base}/api/admin/personal-settlement/upload-slip`;
  const token = getAdminToken();
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(url, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try {
      const j = JSON.parse(text);
      msg = j.error || j.message || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return JSON.parse(text) as { url: string; key?: string };
}

export interface WalletLiquiditySummary {
  /** ผลรวม wallet_balance ผู้ใช้ (เครดิตดิจิทัลในแอป) */
  total_user_credit_thb: number;
  /** manual verified (ledger MANUAL+RECEIVED) + PaySo RECEIVED net − ยอดถอนที่อนุมัติแล้ว */
  actual_cash_reserve_thb: number;
  actual_cash_in_bank_approx_thb: number;
  pending_payouts_total_thb: number;
  /** true เมื่อ actual_cash_reserve_thb < pending_payouts_total_thb */
  critical_warning_cash_reserve_below_pending?: boolean;
  /** รายได้ค่าธรรมเนียมถอนที่เก็บได้ (ledger อนุมัติแล้ว) */
  withdrawal_fee_collected_thb?: number;
  /** ค่าเข้า ~1% จาก PaySo deposits (gross − net ใน ledger) */
  payso_deposit_entry_fees_thb?: number;
  /** ประมาณการ: fee รวม − entry fees (ยังไม่หักต้นทุนโอนจริง) */
  realized_profit_estimate_thb?: number;
  system_total_user_wallet_balance_thb: number;
  breakdown: {
    /** สุทธิจาก wallet_transactions MANUAL + RECEIVED (สอดคล้องสลิปอนุมัติใน ledger) */
    manual_verified_net_thb: number;
    /** @deprecated ใช้ manual_verified_net_thb */
    manual_approved_gross_thb?: number;
    payso_settled_net_to_users_thb: number;
    payso_pending_settlement_net_thb: number;
    manual_ledger_net_thb: number;
    total_approved_payouts_thb: number;
    /** รวมจาก ledger event_type = admin_debit (User Management) */
    admin_debit_total_thb?: number;
    /** รวมจาก ledger event_type = admin_credit */
    admin_credit_total_thb?: number;
  };
  note?: string;
}

/** เงินสดโดยประมาณ vs ยอดเครดิตรวมในกระเป๋าผู้ใช้ (Hybrid deposit + settlement) */
export async function getWalletLiquiditySummary(): Promise<WalletLiquiditySummary> {
  return request<WalletLiquiditySummary>(
    "GET",
    "/api/admin/wallet/liquidity-summary",
  );
}

export interface DiscountPromoFundMovement {
  at: string;
  amount_thb: number;
  note: string;
  admin_id?: string | null;
  kind: string;
}

export interface DiscountPromoFundResponse {
  balance_thb: number;
  movements: DiscountPromoFundMovement[];
  updated_at?: string | null;
  help_th?: string;
}

export async function getDiscountPromoFund(): Promise<DiscountPromoFundResponse> {
  return request<DiscountPromoFundResponse>(
    "GET",
    "/api/admin/financial/discount-fund",
  );
}

export async function creditDiscountPromoFund(
  amountThb: number,
  note: string,
): Promise<{
  balance_thb: number;
  movement: DiscountPromoFundMovement;
  movements: DiscountPromoFundMovement[];
}> {
  return request("POST", "/api/admin/financial/discount-fund/credit", {
    amount_thb: amountThb,
    note: note.trim(),
  });
}

export interface DailyReconcileRow {
  id: string;
  user_id: string | null;
  bank_ref_id: string | null;
  amount_thb: number;
  approved_by: string | null;
  approved_at_bkk: string;
  reviewed_at: string | null;
  ledger_id: string | null;
  user_email: string | null;
  transaction_hash: string | null;
}

export async function getDailyReconcile(date: string): Promise<{
  report_date: string;
  timezone: string;
  count: number;
  rows: DailyReconcileRow[];
  note?: string;
}> {
  return request(
    "GET",
    `/api/admin/reports/daily-reconcile?date=${encodeURIComponent(date)}`,
  );
}

/** ดาวน์โหลด CSV (UTF-8 BOM) — ใช้ token เดียวกับ admin API */
export async function downloadDailyReconcileCsv(date: string): Promise<void> {
  const path = `/api/admin/reports/daily-reconcile?date=${encodeURIComponent(date)}&format=csv`;
  const url = path.startsWith("http") ? path : `${ADMIN_API_BASE}${path}`;
  const tok = getAdminToken();
  const res = await fetch(url, {
    headers: tok ? { Authorization: `Bearer ${tok}` } : {},
  });
  if (!res.ok) {
    const t = await res.text();
    let msg = t.slice(0, 300);
    try {
      const j = JSON.parse(t);
      msg = j.error || j.message || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `daily-reconcile-${date}.csv`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

export interface SettlementProjectionDay {
  available_on: string;
  total_thb: number;
  row_count: number;
}

export interface SettlementProjection {
  horizon_days: number;
  timezone: string;
  payso_settlement_pipeline_locked_thb: number;
  payso_settlement_pipeline_row_count: number;
  not_withdrawable_total_locked_thb: number;
  not_withdrawable_row_count: number;
  cash_flow_projection: SettlementProjectionDay[];
  note?: string;
}

export async function getSettlementProjection(
  days = 14,
): Promise<SettlementProjection> {
  return request<SettlementProjection>(
    "GET",
    `/api/admin/wallet/settlement-projection?days=${encodeURIComponent(String(days))}`,
  );
}

/** รายการเติมเงินแบบโอน + สลิป (รอแอดมิน) — POST /api/wallet/deposit/manual */
export interface AdminManualDepositRow {
  id: string;
  user_id: string;
  amount: string | number;
  slip_url: string;
  /** SHA-256 ของไฟล์ — กันส่งสลิปเดิมซ้ำ (backend migration 163) */
  slip_sha256?: string | null;
  /** เลขอ้างอิงธนาคาร — ตั้งเมื่ออนุมัติ (migration 165) */
  bank_ref_id?: string | null;
  status: string;
  created_at?: string;
  reviewed_at?: string | null;
  /** JSON string { code, message, internal_note? } — เวอร์ชันผู้ใช้เห็นที่ message */
  rejection_reason?: string | null;
  reviewed_by?: string | null;
  user_email?: string | null;
}

export interface AdminWalletDepositChargeRow {
  charge_id: string;
  user_id: string;
  amount: string | number;
  currency?: string;
  status: string;
  source_type: string;
  slip_url?: string | null;
  ledger_id?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
  user_email?: string | null;
}

export interface AdminWalletDepositChargeDetail {
  charge: {
    charge_id: string;
    user_id: string;
    user_email?: string | null;
    amount: number;
    currency: string;
    status: string;
    source_type: string;
    ledger_id?: string | null;
    created_at?: string | null;
    completed_at?: string | null;
  };
  ledger?: {
    id: string;
    event_type: string;
    gateway?: string | null;
    amount?: number;
    net_amount?: number | null;
    gateway_fee_amount?: number | null;
    platform_margin_amount?: number | null;
    status?: string | null;
    bill_no?: string | null;
    transaction_no?: string | null;
    created_at?: string | null;
  } | null;
  webhook_logs: Array<{
    id: string;
    provider: string;
    event_status?: string | null;
    http_status?: number | null;
    signature_valid?: boolean | null;
    bypass_unsigned?: boolean;
    amount?: number | null;
    transaction_id?: string | null;
    payload_json?: Record<string, unknown>;
    processing_result?: Record<string, unknown>;
    created_at?: string | null;
  }>;
  audit_trail: Array<{
    id: number;
    actor_type?: string | null;
    actor_id?: string | null;
    action?: string | null;
    reason?: string | null;
    state_after?: unknown;
    created_at?: string | null;
  }>;
  timeline: Array<{
    at?: string | null;
    source: "charge" | "webhook" | "audit";
    title: string;
    payload?: Record<string, unknown>;
  }>;
}

export async function getAdminManualDeposits(
  status?: string,
): Promise<{ rows: AdminManualDepositRow[] }> {
  const q =
    status && status !== "all" ? `?status=${encodeURIComponent(status)}` : "";
  return request<{ rows: AdminManualDepositRow[] }>(
    "GET",
    `/api/admin/manual-deposits${q}`,
  );
}

export async function getAdminWalletDepositCharges(params?: {
  source_type?: string;
  status?: string;
  user_id?: string;
  limit?: number;
}): Promise<{ rows: AdminWalletDepositChargeRow[] }> {
  const sp = new URLSearchParams();
  if (params?.source_type && params.source_type !== "all")
    sp.set("source_type", params.source_type);
  if (params?.status && params.status !== "all")
    sp.set("status", params.status);
  if (params?.user_id) sp.set("user_id", params.user_id);
  if (params?.limit && Number.isFinite(params.limit))
    sp.set("limit", String(params.limit));
  const q = sp.toString() ? `?${sp.toString()}` : "";
  return request<{ rows: AdminWalletDepositChargeRow[] }>(
    "GET",
    `/api/admin/wallet-deposit-charges${q}`,
  );
}

export async function postAdminWalletDepositChargesExportAsync(params?: {
  source_type?: string;
  status?: string;
  user_id?: string;
}): Promise<{ job_id: string; status: string; poll_url: string }> {
  return request(
    "POST",
    "/api/admin/wallet-deposit-charges/export-async",
    params || {},
  );
}

export async function getAdminExportJob(jobId: string): Promise<{
  id: string;
  job_type: string;
  status: string;
  row_count?: number;
  error?: string;
  download_url?: string | null;
}> {
  return request("GET", `/api/admin/export-jobs/${encodeURIComponent(jobId)}`);
}

export async function getAdminWalletDepositChargeDetail(
  chargeId: string,
): Promise<AdminWalletDepositChargeDetail> {
  return request(
    "GET",
    `/api/admin/wallet-deposit-charges/${encodeURIComponent(chargeId)}/detail`,
  );
}

export async function postAdminReconcilePaysoCharge(chargeId: string): Promise<{
  charge_id: string;
  status: string;
  completed_at?: string | null;
  ledger_id?: string | null;
  reconcile?: unknown;
}> {
  return request(
    "POST",
    `/api/admin/wallet-deposit-charges/${encodeURIComponent(chargeId)}/reconcile-payso`,
  );
}

export async function postAdminReconcilePaysoBatch(limit = 100): Promise<{
  requested_limit: number;
  total: number;
  success_count: number;
  still_pending_count: number;
  error_count: number;
  items: Array<{
    charge_id: string;
    status: string;
    completed_at?: string | null;
    ledger_id?: string | null;
    reconcile?: unknown;
  }>;
}> {
  return request(
    "POST",
    "/api/admin/wallet-deposit-charges/reconcile-payso-batch",
    { limit },
  );
}

export async function postAdminManualDepositApprove(
  id: string,
  body: { bank_ref_id: string },
): Promise<{ ok?: boolean; error?: string }> {
  return request<{ ok?: boolean; error?: string }>(
    "POST",
    `/api/admin/manual-deposits/${encodeURIComponent(id)}/approve`,
    body,
  );
}

export async function postAdminManualDepositReject(
  id: string,
  body: { reason_code: string; note?: string },
): Promise<{ ok?: boolean; error?: string; code?: string }> {
  return request<{ ok?: boolean; error?: string; code?: string }>(
    "POST",
    `/api/admin/manual-deposits/${encodeURIComponent(id)}/reject`,
    body,
  );
}

export async function downloadWalletDepositChargesCsv(params?: {
  source_type?: string;
  status?: string;
  from?: string;
  to?: string;
}): Promise<void> {
  const base = ADMIN_API_BASE;
  const sp = new URLSearchParams();
  if (params?.source_type && params.source_type !== "all")
    sp.set("source_type", params.source_type);
  if (params?.status && params.status !== "all")
    sp.set("status", params.status);
  if (params?.from) sp.set("from", params.from);
  if (params?.to) sp.set("to", params.to);
  const q = sp.toString();
  const url = `${base}/api/admin/wallet-deposit-charges/export.csv${q ? `?${q}` : ""}`;
  const token = getAdminToken();
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(await res.text().catch(() => "Export failed"));
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/);
  const filename =
    match?.[1] ||
    `wallet_deposit_charges_${new Date().toISOString().slice(0, 10)}.csv`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function downloadManualDepositsCsv(params?: {
  status?: string;
}): Promise<void> {
  const base = ADMIN_API_BASE;
  const q =
    params?.status && params.status !== "all"
      ? `?status=${encodeURIComponent(params.status)}`
      : "";
  const url = `${base}/api/admin/manual-deposits/export.csv${q}`;
  const token = getAdminToken();
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(await res.text().catch(() => "Export failed"));
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/);
  const filename =
    match?.[1] ||
    `manual_deposits_${new Date().toISOString().slice(0, 10)}.csv`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// --- Smart Anti-Bypass (PR-4 admin UI) ---

export interface AntiBypassRuleRow {
  id: string;
  kind: string;
  scope: string;
  pattern: string;
  enabled: boolean;
  severity: string;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export async function getAntiBypassRules(): Promise<{
  rules: AntiBypassRuleRow[];
}> {
  return request<{ rules: AntiBypassRuleRow[] }>(
    "GET",
    "/api/admin/anti-bypass/rules",
  );
}

export async function createAntiBypassRule(body: {
  kind: "keyword" | "regex";
  scope: "text" | "image_ocr";
  pattern: string;
  severity?: "block" | "warn";
  enabled?: boolean;
}): Promise<{ rule: AntiBypassRuleRow }> {
  return request<{ rule: AntiBypassRuleRow }>(
    "POST",
    "/api/admin/anti-bypass/rules",
    body,
  );
}

export async function patchAntiBypassRule(
  id: string,
  body: Partial<{
    kind: "keyword" | "regex";
    scope: "text" | "image_ocr";
    pattern: string;
    severity: "block" | "warn";
    enabled: boolean;
  }>,
): Promise<{ rule: AntiBypassRuleRow }> {
  return request<{ rule: AntiBypassRuleRow }>(
    "PATCH",
    `/api/admin/anti-bypass/rules/${encodeURIComponent(id)}`,
    body,
  );
}

export async function deleteAntiBypassRule(
  id: string,
): Promise<{ deleted: string }> {
  return request<{ deleted: string }>(
    "DELETE",
    `/api/admin/anti-bypass/rules/${encodeURIComponent(id)}`,
  );
}

export async function postAntiBypassEvaluateTest(body: {
  text: string;
  scope?: "text" | "image_ocr";
}): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(
    "POST",
    "/api/admin/anti-bypass/evaluate-test",
    body,
  );
}

export async function getAntiBypassTelemetry(): Promise<{
  enabled: boolean;
  counts?: Record<string, number>;
  hint?: string;
}> {
  return request("GET", "/api/admin/anti-bypass/telemetry");
}

function resolveSupportServiceBase(): string {
  if (typeof import.meta === "undefined") return "https://support.aqond.com";
  const env = (import.meta as any).env;
  const u = env?.VITE_SUPPORT_AI_URL;
  if (typeof u === "string" && u.trim()) return u.replace(/\/$/, "");
  if (env?.DEV) return "http://localhost:3091";
  return "https://support.aqond.com";
}

async function supportAdminRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const tok = getAdminToken();
  const res = await fetch(`${resolveSupportServiceBase()}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err = new Error(
      data?.error || `Support service error ${res.status}`,
    ) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export interface SupportServiceFeatureRequest {
  id: string;
  user_id: string;
  category: string;
  summary: string;
  status: string;
  created_at: string;
}

export interface SupportServiceSecurityIncident {
  id: string;
  user_id: string;
  session_id?: string | null;
  severity: string;
  signals?: string[];
  action_taken?: string | null;
  created_at: string;
}

export interface SupportServiceChatSummary {
  id: string;
  user_id: string;
  status: string;
  risk_score: number;
  summary_compact?: string | null;
  updated_at?: string;
}

export function listSupportServiceFeatureRequests(status = "open"): Promise<{
  items: SupportServiceFeatureRequest[];
}> {
  const q = new URLSearchParams();
  if (status) q.set("status", status);
  return supportAdminRequest("GET", `/admin/feature-requests?${q.toString()}`);
}

export function acknowledgeSupportServiceFeatureRequest(id: string): Promise<{
  item: SupportServiceFeatureRequest;
}> {
  return supportAdminRequest(
    "PATCH",
    `/admin/feature-requests/${encodeURIComponent(id)}`,
    { status: "acknowledged" },
  );
}

export function listSupportServiceSecurityIncidents(): Promise<{
  items: SupportServiceSecurityIncident[];
}> {
  return supportAdminRequest("GET", "/admin/security-incidents");
}

export function listSupportServiceChatSummaries(): Promise<{
  items: SupportServiceChatSummary[];
}> {
  return supportAdminRequest("GET", "/admin/chat-summaries");
}

/** Low-level JSON client (Bearer + prod base URL) — ใช้โดย financialService และ adminApi */
export { request as adminJsonRequest };

export interface AdminAdCampaign {
  id: string;
  title: string;
  lifecycleState: string;
  dailyBudgetMicro: string;
  metadata?: Record<string, unknown>;
  advertiser: string;
  adGroups?: number;
}

export async function listAdminAdCampaigns(): Promise<{
  campaigns: AdminAdCampaign[];
  configured?: boolean;
}> {
  return request("GET", "/api/admin/ads/campaigns");
}

export async function patchAdminAdCampaignLifecycle(
  campaignId: string,
  lifecycleState: "ACTIVE" | "PAUSED" | "ARCHIVED",
): Promise<{ id: string; lifecycleState: string }> {
  return request(
    "PATCH",
    `/api/admin/ads/campaigns/${encodeURIComponent(campaignId)}/lifecycle`,
    { lifecycleState },
  );
}

export async function seedAdminHouseAds(body?: {
  platformOwnerUserId?: string;
}): Promise<{ message?: string; seeded?: boolean }> {
  return request("POST", "/api/admin/ads/seed-house", body || {});
}

export type AdminAdsSummary = {
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

export async function getAdminAdsSummary(range: "7d" | "30d" | string = "7d"): Promise<{
  configured: boolean;
  summary: AdminAdsSummary | null;
}> {
  return request("GET", `/api/admin/ads/summary?range=${encodeURIComponent(range)}`);
}

export type GrowthConversionFunnel = {
  rangeDays: number;
  generatedAt: string;
  talent: {
    registered: number;
    milestone10Unlocked: number;
    aiVideoUsers: number;
    videoJobsInRange: number;
    subscribed799: number;
    conversionToMilestonePct: number;
    conversionToVideoPct: number;
    conversionTo799Pct: number;
    checkoutAttempts: number;
  };
  consumer: {
    mysteryMilestone10: number;
    mysteryUnlocked: number;
    mysteryClaimed: number;
    aqondPassActive: number;
    conversionClaimPct: number;
    conversionPassPct: number;
  };
  merchant: {
    subscribed799: number;
    checkoutAttempts: number;
    conversionFromPassPct: number;
  };
  revenue799: {
    byPlan: Record<string, { orders: number; revenueThb: number }>;
    totalThb: number;
    talentActive: number;
    merchantActive: number;
  };
};

export async function getGrowthConversionFunnel(
  rangeDays = 30,
): Promise<GrowthConversionFunnel> {
  return request(
    "GET",
    `/api/admin/growth/conversion-funnel?rangeDays=${encodeURIComponent(String(rangeDays))}`,
  );
}

export type FtxFunnelStep = {
  eventType: string;
  label: string;
  events: number;
  actors: number;
};

export type FtxDashboard = {
  rangeDays: number;
  generatedAt: string;
  stub?: boolean;
  rollout?: {
    version: string;
    killSwitch: boolean;
    experienceEnabled: boolean;
    ftxEnabled: boolean;
  };
  summary: {
    profilesTotal: number;
    wizardCompleted: number;
    tourCompleted: number;
    tourSkippedProfiles: number;
    wizardCompletedInRange: number;
    tourCompletedInRange: number;
  };
  funnel: FtxFunnelStep[];
  eventCounts: { event_type: string; n: number }[];
  dailyEvents: { day: string; n: number }[];
  dailyWizardCompletions: { day: string; n: number }[];
  referralSources: { source: string; n: number }[];
  primaryIntents: { intent: string; n: number }[];
  guestVsRegistered: { guests: number; registered: number };
  retention: {
    multiDayActors: number;
    totalActors: number;
    retentionPct: number;
  };
};

export async function getFtxDashboard(rangeDays = 30): Promise<FtxDashboard> {
  return request(
    "GET",
    `/api/admin/ftx/dashboard?rangeDays=${encodeURIComponent(String(rangeDays))}`,
  );
}

// --- PRB orders (FairDee export) ---

export type AdminPrbOrderRow = {
  id: string;
  quote_number: string;
  fairdee_quote_number?: string | null;
  status: string;
  policy_status?: string | null;
  payment_status?: string | null;
  fairdee_bot_status?: string | null;
  fairdee_bot_error?: string | null;
  car_type?: string | null;
  registration_number?: string | null;
  registration_province?: string | null;
  chassis_number?: string | null;
  chassis_search_7?: string | null;
  engine_number?: string | null;
  vehicle_code?: string | null;
  vehicle_brand?: string | null;
  vehicle_model?: string | null;
  vehicle_year?: number | null;
  engine_cc?: number | null;
  vehicle_weight_kg?: number | null;
  seat_count?: number | null;
  coverage_start_date?: string | null;
  coverage_end_date?: string | null;
  id_type?: string | null;
  national_id?: string | null;
  name_prefix?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone_number?: string | null;
  nationality?: string | null;
  address_line?: string | null;
  address_province?: string | null;
  address_district?: string | null;
  address_subdistrict?: string | null;
  postal_code?: string | null;
  shipping_address?: string | null;
  car_registration_img_url?: string | null;
  id_card_img_url?: string | null;
  address_proof_img_url?: string | null;
  policy_pdf_url?: string | null;
  provider_code?: string | null;
  provider_name?: string | null;
  base_premium?: number | null;
  vat_amount?: number | null;
  stamp_duty?: number | null;
  total_premium?: number | null;
  total_price?: number | null;
  admin_notes?: string | null;
  dispute_reason?: string | null;
  user_full_name?: string | null;
  user_phone?: string | null;
  user_email?: string | null;
  created_at?: string;
  fairdee_payload_json?: Record<string, unknown> | null;
};

export type AdminPrbModuleConfig = {
  enabled: boolean;
  min_wallet_for_entry_thb: number;
  first_order_discount_thb: number;
  platform_fee_by_car_type: Record<string, number>;
  base_price_by_car_type: Record<string, number>;
  pricing_by_car_type?: Record<string, { base: number; fee: number }>;
  promo_banner_text?: string;
};

export async function getAdminPrbConfig(): Promise<{
  ok: boolean;
  config: AdminPrbModuleConfig;
}> {
  return request("GET", "/api/admin/prb/config");
}

export async function patchAdminPrbConfig(body: {
  platform_fee_by_car_type?: Record<string, number>;
  base_price_by_car_type?: Record<string, number>;
  enabled?: boolean;
  min_wallet_for_entry_thb?: number;
  first_order_discount_thb?: number;
  promo_banner_text?: string;
}): Promise<{ ok: boolean; config: AdminPrbModuleConfig }> {
  return request("PATCH", "/api/admin/prb/config", body);
}

export async function getAdminPrbOrders(params?: {
  tab?: string;
  status?: string;
  bot_status?: string;
}): Promise<{ orders: AdminPrbOrderRow[] }> {
  const q = new URLSearchParams();
  if (params?.tab) q.set("tab", params.tab);
  if (params?.status) q.set("status", params.status);
  if (params?.bot_status) q.set("bot_status", params.bot_status);
  const qs = q.toString();
  return request("GET", `/api/admin/prb/orders${qs ? `?${qs}` : ""}`);
}

export async function getAdminPrbOrder(
  id: string,
): Promise<{ order: AdminPrbOrderRow }> {
  return request("GET", `/api/admin/prb/orders/${encodeURIComponent(id)}`);
}

export async function getAdminPrbFairdeePayload(
  id: string,
): Promise<{ payload: Record<string, unknown> }> {
  return request(
    "GET",
    `/api/admin/prb/orders/${encodeURIComponent(id)}/fairdee-payload`,
  );
}

export async function patchAdminPrbOrder(
  id: string,
  body: Partial<AdminPrbOrderRow>,
): Promise<{ order: AdminPrbOrderRow }> {
  return request(
    "PATCH",
    `/api/admin/prb/orders/${encodeURIComponent(id)}`,
    body,
  );
}

export async function postAdminPrbBotStatus(
  id: string,
  body: { status: string; error?: string },
): Promise<{ order: AdminPrbOrderRow }> {
  return request(
    "POST",
    `/api/admin/prb/orders/${encodeURIComponent(id)}/fairdee-bot-status`,
    body,
  );
}

export type GoldLottoPrizePool = {
  side: "employer" | "provider";
  label: string;
  prize_count: number;
  prize_name: string;
};

export type GoldLottoConfig = {
  enabled: boolean;
  campaign_id: string;
  title: string;
  period_start: string;
  period_end: string;
  draw_at: string;
  prize_pools: GoldLottoPrizePool[];
  exclude_user_ids?: string[];
  require_kyc_for_winner?: boolean;
  auto_draw_enabled?: boolean;
  public_results_enabled?: boolean;
};

export type GoldLottoCampaignRow = {
  id: string;
  title: string;
  status: string;
  period_start: string;
  period_end: string;
  draw_at: string;
  ticket_count_employer: number;
  ticket_count_provider: number;
  frozen_at?: string | null;
  drawn_at?: string | null;
  published_at?: string | null;
};

export type GoldLottoWinnerRow = {
  id: string;
  campaign_id: string;
  pool_side: string;
  prize_rank: number;
  prize_name: string;
  winner_user_id: string;
  winning_display_code?: string | null;
  dossier_json?: Record<string, unknown>;
  marketing_lock?: boolean;
  contact_status?: string;
  delivery_status?: string;
  delivery_address_json?: Record<string, unknown> | null;
  delivery_consent_at?: string | null;
  delivery_notes?: string | null;
  delivery_delivered_at?: string | null;
  delivery_confirmed_at?: string | null;
  full_name?: string;
  phone?: string;
  email?: string;
  published_at?: string | null;
};

export async function getAdminGoldLottoConfig(): Promise<{
  ok: boolean;
  config: GoldLottoConfig;
  campaign: GoldLottoCampaignRow | null;
}> {
  return request("GET", "/api/admin/gold-lotto/config");
}

export async function patchAdminGoldLottoConfig(
  body: Partial<GoldLottoConfig>,
): Promise<{
  ok: boolean;
  config: GoldLottoConfig;
  campaign: GoldLottoCampaignRow | null;
}> {
  return request("PATCH", "/api/admin/gold-lotto/config", body);
}

export async function postAdminGoldLottoSyncTickets(body?: {
  campaignId?: string;
}): Promise<{
  ok: boolean;
  jobs_scanned: number;
  tickets_upserted: number;
  ticket_count_employer: number;
  ticket_count_provider: number;
}> {
  return request("POST", "/api/admin/gold-lotto/sync-tickets", body || {});
}

export async function postAdminGoldLottoFreeze(body?: { campaignId?: string }) {
  return request("POST", "/api/admin/gold-lotto/freeze", body || {});
}

export async function postAdminGoldLottoRunDraw(body?: {
  campaignId?: string;
}) {
  return request("POST", "/api/admin/gold-lotto/run-draw", body || {});
}

export async function postAdminGoldLottoPublish(body?: {
  campaignId?: string;
}) {
  return request("POST", "/api/admin/gold-lotto/publish", body || {});
}

export async function getAdminGoldLottoWinners(params?: {
  campaignId?: string;
}): Promise<{ ok: boolean; winners: GoldLottoWinnerRow[] }> {
  const q = params?.campaignId
    ? `?campaignId=${encodeURIComponent(params.campaignId)}`
    : "";
  return request("GET", `/api/admin/gold-lotto/winners${q}`);
}

export async function patchAdminGoldLottoWinner(
  id: string,
  body: {
    marketing_lock?: boolean;
    contact_status?: string;
    delivery_status?: string;
    delivery_notes?: string;
  },
): Promise<{ ok: boolean; winner: GoldLottoWinnerRow }> {
  return request(
    "PATCH",
    `/api/admin/gold-lotto/winners/${encodeURIComponent(id)}`,
    body,
  );
}

export async function getAdminGoldLottoDrawRuns(params?: {
  campaignId?: string;
}): Promise<{ ok: boolean; runs: Record<string, unknown>[] }> {
  const q = params?.campaignId
    ? `?campaignId=${encodeURIComponent(params.campaignId)}`
    : "";
  return request("GET", `/api/admin/gold-lotto/draw-runs${q}`);
}

// ---- Beauty Bookings (Salon / Barber) ----

export type AdminBeautyBookingPolicy = {
  cancel_notice_hours?: number;
  no_show_fee_percent?: number;
  no_show_fee_platform_share?: number;
  no_show_fee_provider_share?: number;
  payout_withdraw_hold_hours?: number;
  min_completion_photos?: number;
  transport_base_fare_thb?: number;
  transport_rate_min_km?: number;
  transport_rate_max_km?: number;
  employer_service_fee_percent?: number;
  service_sourcing_percent?: number;
  service_commission_percent?: number;
  transport_platform_fee_percent?: number;
  employer_service_fee_by_tier?: Record<string, number> | null;
  service_sourcing_by_tier?: Record<string, number> | null;
  service_commission_by_tier?: Record<string, number> | null;
  transport_platform_fee_by_tier?: Record<string, number> | null;
  use_vip_tier_overrides?: boolean;
};

export type AdminBeautyBookingRow = {
  id: string;
  status: string;
  session_status: string;
  location_mode: string | null;
  service_subtotal: number;
  transport_total: number;
  quoted_price: number;
  employer_service_fee: number;
  employer_total: number;
  amount_paid: number;
  remaining_balance: number;
  deposit_status: string;
  payment_mode: string | null;
  start_time: string;
  end_time: string;
  created_at: string;
  booker_id: string;
  talent_id: string;
  booker_name: string | null;
  talent_name: string | null;
  booker_phone?: string | null;
  talent_phone?: string | null;
};

export type AdminBeautyBookingDetail = {
  booking: Record<string, unknown>;
  photos: { phase: string; photo_urls: string[]; submitted_at?: string }[];
  provider_payout: Record<string, number>;
  policy: AdminBeautyBookingPolicy;
};

export type AdminBeautyDisputeRow = {
  id: string;
  booking_id: string;
  reason: string;
  status: string;
  resolution: string | null;
  refund_amount: number | null;
  created_at: string;
  resolved_at: string | null;
  employer_total: number;
  amount_paid: number;
  session_status: string;
  booking_status: string;
  booker_id: string;
  talent_id: string;
  booker_name: string | null;
  talent_name: string | null;
};

export async function getAdminBeautyDisputes(params?: {
  status?: string;
}): Promise<{ ok: boolean; disputes: AdminBeautyDisputeRow[] }> {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  const qs = q.toString();
  return request(
    "GET",
    `/api/admin/beauty-bookings/disputes/list${qs ? `?${qs}` : ""}`,
  );
}

export async function resolveAdminBeautyDispute(
  id: string,
  body: {
    resolution: "refund_customer" | "release_provider" | "reject_dispute";
    resolution_note?: string;
  },
): Promise<{ ok: boolean; resolution: string; message?: string }> {
  return request(
    "POST",
    `/api/admin/beauty-bookings/disputes/${encodeURIComponent(id)}/resolve`,
    body,
  );
}

export async function getAdminBeautyBookings(params?: {
  status?: string;
  session_status?: string;
  limit?: number;
}): Promise<{ ok: boolean; bookings: AdminBeautyBookingRow[] }> {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.session_status) q.set("session_status", params.session_status);
  if (params?.limit) q.set("limit", String(params.limit));
  const qs = q.toString();
  return request("GET", `/api/admin/beauty-bookings${qs ? `?${qs}` : ""}`);
}

export async function getAdminBeautyBooking(
  id: string,
): Promise<AdminBeautyBookingDetail & { ok: boolean }> {
  return request("GET", `/api/admin/beauty-bookings/${encodeURIComponent(id)}`);
}

export async function getAdminBeautyBookingPolicy(): Promise<{
  ok: boolean;
  policy: AdminBeautyBookingPolicy;
}> {
  return request("GET", "/api/admin/beauty-bookings/policy");
}

export async function patchAdminBeautyBookingPolicy(
  body: Partial<AdminBeautyBookingPolicy>,
): Promise<{ ok: boolean; policy: AdminBeautyBookingPolicy }> {
  return request("PATCH", "/api/admin/beauty-bookings/policy", body);
}

export interface ProcurementComplianceItem {
  id: string;
  job_id: string;
  job_title: string;
  category: string;
  job_status: string;
  revision_no: number;
  created_at: string;
  document_hash: string;
  prev_hash?: string | null;
  winner_user_id?: string | null;
  winner_name?: string | null;
  winner_reason?: string | null;
  price_before_negotiation?: number | null;
  price_after_negotiation?: number | null;
  ai_price_recommended?: number | null;
  ai_risk_score?: number | null;
  fraud_signals?: string[];
  document_count?: number;
}

export async function getAdminProcurementCompliance(params?: {
  q?: string;
  status?: "has_winner" | "no_winner" | "negotiated" | "";
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}): Promise<{
  success: boolean;
  items: ProcurementComplianceItem[];
  total: number;
  page: number;
  limit: number;
}> {
  const q = new URLSearchParams();
  if (params?.q) q.set("q", params.q);
  if (params?.status) q.set("status", params.status);
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  const qs = q.toString();
  return request(
    "GET",
    `/api/admin/procurement/compliance${qs ? `?${qs}` : ""}`,
  );
}

export async function downloadAdminProcurementComplianceCsv(params?: {
  q?: string;
  status?: "has_winner" | "no_winner" | "negotiated" | "";
}): Promise<void> {
  const q = new URLSearchParams();
  if (params?.q) q.set("q", params.q);
  if (params?.status) q.set("status", params.status);
  const qs = q.toString();
  const path = `/api/admin/procurement/compliance/export.csv${qs ? `?${qs}` : ""}`;
  const url = `${ADMIN_API_BASE}${path}`;
  const tok = getAdminToken();
  const headers: Record<string, string> = {};
  if (tok) headers.Authorization = `Bearer ${tok}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `procurement-compliance-${stamp}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function downloadAdminProcurementComplianceJson(params?: {
  q?: string;
  status?: "has_winner" | "no_winner" | "negotiated" | "";
  agency_form?: "th_gov_procurement_v1" | "egp_v1";
}): Promise<void> {
  const q = new URLSearchParams();
  if (params?.q) q.set("q", params.q);
  if (params?.status) q.set("status", params.status);
  if (params?.agency_form) q.set("agency_form", params.agency_form);
  const qs = q.toString();
  const path = `/api/admin/procurement/compliance/export.json${qs ? `?${qs}` : ""}`;
  const url = `${ADMIN_API_BASE}${path}`;
  const tok = getAdminToken();
  const headers: Record<string, string> = {};
  if (tok) headers.Authorization = `Bearer ${tok}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `procurement-compliance-${params?.agency_form || "th_gov_procurement_v1"}-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export type CourseQualityItem = {
  id: string;
  label: string;
  ok: boolean;
  required: boolean;
};

export type CourseMarketplaceReviewItem = {
  course: {
    id: string;
    title: string;
    subtitle?: string;
    description?: string;
    priceThb?: number;
    instructorName?: string;
    status?: string;
  };
  checklist: {
    items: CourseQualityItem[];
    ready: boolean;
    score: number;
  };
  instructorEmail?: string | null;
};

export type CourseMarketplaceFunnelReport = {
  funnel: Record<string, number>;
  conversion: Record<string, number | null>;
};

export type CourseLaunchChecklist = {
  ready: boolean;
  automated: {
    pass: number;
    total: number;
    checks: Array<{ id: string; label: string; pass: boolean; detail?: unknown }>;
  };
  manualQa: Array<{ id: string; label: string }>;
  signOff: Record<string, unknown>;
  generatedAt: string;
};

export async function getCourseMarketplaceReviewQueue(status = "in_review") {
  return request<{ status: string; courses: CourseMarketplaceReviewItem[] }>(
    "GET",
    `/api/admin/courses/marketplace/review-queue?status=${encodeURIComponent(status)}`,
  );
}

export async function reviewCourseMarketplace(
  courseId: string,
  body: {
    action: string;
    reason?: string;
    createBanner?: boolean;
    featuredRank?: number;
    platformRateOverride?: number;
    clearPlatformRateOverride?: boolean;
  },
) {
  return request<{ course: CourseMarketplaceReviewItem["course"]; banner?: { created?: boolean; banner?: unknown } }>(
    "PATCH",
    `/api/admin/courses/marketplace/${encodeURIComponent(courseId)}/review`,
    body,
  );
}

export async function getCourseMarketplaceFunnel(params?: { from?: string; to?: string; courseId?: string }) {
  const q = new URLSearchParams();
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  if (params?.courseId) q.set("courseId", params.courseId);
  const qs = q.toString();
  return request<CourseMarketplaceFunnelReport>("GET", `/api/admin/courses/analytics/funnel${qs ? `?${qs}` : ""}`);
}

export async function getCourseLaunchChecklist() {
  return request<CourseLaunchChecklist>("GET", "/api/admin/courses/launch-checklist");
}

export async function releaseCoursePayouts(limit = 50) {
  return request<{ ok: boolean; count: number; released: unknown[] }>("POST", "/api/admin/courses/payouts/release", {
    limit,
  });
}

export type CourseRevenuePolicy = {
  platformRate: number;
  platformRatePct: number;
  coachDirectDiscountRate: number;
  coachDirectPlatformRate: number;
  coachDirectPlatformRatePct: number;
};

export type CourseRevenueSummaryResponse = {
  policy: CourseRevenuePolicy;
  ledger: Array<{ event_type: string; events: number; gross_flow: number | string }>;
  platformRevenues: {
    platform_fee_net?: number | string;
    course_gross_net?: number | string;
    rows?: number;
  };
  orders: {
    total_orders?: number;
    completed_orders?: number;
    refunded_orders?: number;
    payouts_held?: number;
    payouts_released?: number;
    gross_completed?: number | string;
    platform_fee_orders?: number | string;
    instructor_net_orders?: number | string;
  };
  topInstructors: Array<{
    instructorUserId: string;
    instructorName: string;
    instructorEmail: string | null;
    orders: number;
    gross: number;
    platformFee: number;
    instructorNet: number;
  }>;
  topCourses: Array<{
    courseId: string;
    courseTitle: string;
    courseStatus: string | null;
    instructorUserId: string | null;
    instructorName: string | null;
    orders: number;
    gross: number;
    platformFee: number;
    instructorNet: number;
  }>;
};

export type AdminCourseOrderRow = {
  orderId: string;
  id: string;
  receiptNo: string;
  transactionNo?: string;
  ledgerId?: string | null;
  status: string;
  refundStatus?: string;
  payoutStatus?: string;
  gateway?: string;
  createdAt: string;
  grossAmount: number;
  platformFee: number;
  instructorNet: number;
  course: { id: string; title: string; status?: string | null; subtitle?: string; imageUrl?: string };
  buyer: { id: string; name: string; email?: string | null };
  instructor: { id: string; name: string; email?: string | null };
  metadata?: Record<string, unknown>;
};

export type CourseRevenueOrdersResponse = {
  total: number;
  limit: number;
  offset: number;
  orders: AdminCourseOrderRow[];
};

export async function getCourseRevenueSummary(params?: { from?: string; to?: string }) {
  const q = new URLSearchParams();
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  const qs = q.toString();
  return request<CourseRevenueSummaryResponse>("GET", `/api/admin/courses/revenue${qs ? `?${qs}` : ""}`);
}

export async function getCourseRevenueOrders(params?: {
  from?: string;
  to?: string;
  status?: string;
  courseId?: string;
  buyerId?: string;
  instructorId?: string;
  q?: string;
  limit?: number;
  offset?: number;
}) {
  const q = new URLSearchParams();
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  if (params?.status) q.set("status", params.status);
  if (params?.courseId) q.set("courseId", params.courseId);
  if (params?.buyerId) q.set("buyerId", params.buyerId);
  if (params?.instructorId) q.set("instructorId", params.instructorId);
  if (params?.q) q.set("q", params.q);
  if (params?.limit != null) q.set("limit", String(params.limit));
  if (params?.offset != null) q.set("offset", String(params.offset));
  const qs = q.toString();
  return request<CourseRevenueOrdersResponse>("GET", `/api/admin/courses/revenue/orders${qs ? `?${qs}` : ""}`);
}

export type AdminUserCourseMarketplaceProfile = {
  user: { id: string; name: string; email: string; providerStatus?: string | null };
  sellEligibility: { canSell: boolean; reason?: string | null; checks?: unknown };
  instructor: {
    coursesTotal: number;
    coursesPublished: number;
    orders: number;
    refundedOrders: number;
    gross: number;
    platformFee: number;
    instructorNet: number;
    payoutsPending: number;
    pendingNet: number;
    courses: Array<{
      id: string;
      title: string;
      status: string;
      priceThb: number;
      totalEnrolled: number;
      ratingAvg: number;
      ratingCount: number;
      publishedAt?: string | null;
      createdAt?: string | null;
    }>;
    topSellingCourses: Array<{
      courseId: string;
      courseTitle: string;
      courseStatus: string | null;
      orders: number;
      gross: number;
      platformFee: number;
      instructorNet: number;
    }>;
    recentOrders: AdminCourseOrderRow[];
  };
  buyer: {
    purchases: number;
    refundedPurchases: number;
    spent: number;
    recentOrders: AdminCourseOrderRow[];
  };
};

export function getAdminUserCourseMarketplace(userId: string): Promise<AdminUserCourseMarketplaceProfile> {
  return request<AdminUserCourseMarketplaceProfile>(
    "GET",
    `/api/admin/users/${encodeURIComponent(userId)}/course-marketplace`,
  );
}

export type AdminModerationReview = {
  id: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  isHidden: boolean;
  createdAt?: string;
};

export type AdminModerationQa = {
  id: string;
  userName: string;
  body: string;
  isHidden: boolean;
  isClosed: boolean;
  createdAt?: string;
};

export type CourseMarketplaceAuditRow = {
  id: string;
  courseId: string | null;
  adminUserId?: string | null;
  adminName?: string | null;
  action: string;
  beforeStatus?: string | null;
  afterStatus?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  createdAt?: string;
};

export async function getAdminCourseModeration(courseId: string) {
  return request<{ reviews: AdminModerationReview[]; qa: AdminModerationQa[] }>(
    "GET",
    `/api/admin/courses/marketplace/${encodeURIComponent(courseId)}/moderation`,
  );
}

export async function moderateAdminCourseReview(
  courseId: string,
  reviewId: string,
  action: "hide" | "unhide" | "delete",
  reason?: string,
) {
  return request(
    "PATCH",
    `/api/admin/courses/marketplace/${encodeURIComponent(courseId)}/reviews/${encodeURIComponent(reviewId)}`,
    { action, reason },
  );
}

export async function moderateAdminCourseQa(
  courseId: string,
  messageId: string,
  action: "hide" | "unhide" | "close" | "reopen" | "delete",
  reason?: string,
) {
  return request(
    "PATCH",
    `/api/admin/courses/marketplace/${encodeURIComponent(courseId)}/qa/${encodeURIComponent(messageId)}`,
    { action, reason },
  );
}

export async function getAdminCourseAuditLog(params?: { courseId?: string; limit?: number }) {
  const q = new URLSearchParams();
  if (params?.courseId) q.set("courseId", params.courseId);
  if (params?.limit != null) q.set("limit", String(params.limit));
  const qs = q.toString();
  return request<{ rows: CourseMarketplaceAuditRow[] }>(
    "GET",
    `/api/admin/courses/marketplace/audit-log${qs ? `?${qs}` : ""}`,
  );
}

export async function updateCourseRevenuePolicy(body: {
  platformRate?: number;
  coachDirectDiscountRate?: number;
  coachDirectPlatformRate?: number;
}) {
  return request<{ policy: CourseRevenuePolicy }>("PATCH", "/api/admin/courses/revenue/policy", body);
}

export type AdminCompassQueueRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  primary_intent: string | null;
  kyc_status: string | null;
  onboarding_status: string | null;
  provider_status: string | null;
  onboarding_compass_completed_at: string | null;
};

export async function getAdminCompassQueue(intent?: string): Promise<{
  queue: AdminCompassQueueRow[];
}> {
  const q = intent ? `?intent=${encodeURIComponent(intent)}` : "";
  return request("GET", `/api/admin/compass/queue${q}`);
}

export async function getAdminCompassUserStatus(userId: string): Promise<{
  compassMode?: boolean;
  primaryIntent?: string;
  progress?: { completed: number; total: number };
  nextAction?: { label: string };
}> {
  return request("GET", `/api/admin/compass/user-status?userId=${encodeURIComponent(userId)}`);
}

// —— Food Merchant OS ——

export type AdminFoodDashboard = {
  ok: boolean;
  today: {
    orders: number;
    completed: number;
    cooking: number;
    waiting_rider: number;
    delivering: number;
    cancelled: number;
    gmv_micro: number;
    platform_fee_micro: number;
    merchant_income_micro: number;
    rider_income_micro: number;
    unique_customers: number;
  };
  merchants: {
    total: number;
    open: number;
    closed: number;
    pending_review: number;
    suspended: number;
  };
  wallet: { balance_micro: number; pending_withdraw_micro: number };
};

export type AdminFoodOrderRow = {
  order_id: string;
  buyer_id: string;
  merchant_id: string;
  merchant_name?: string;
  status: string;
  fulfillment_status: string;
  amount_micro: number;
  payment_status?: string;
  method: string;
  item_count: number;
  created_at: string;
};

export type AdminFoodMerchantRow = {
  merchant_id: string;
  name: string;
  cuisine: string;
  emoji: string;
  rating: number;
  open: boolean;
  delivery_fee_micro: number;
};

export async function getAdminFoodDashboard(): Promise<AdminFoodDashboard> {
  return request("GET", "/api/admin/food/dashboard");
}

export async function getAdminFoodOrders(params?: {
  limit?: number;
}): Promise<{ ok: boolean; orders: AdminFoodOrderRow[] }> {
  const q = params?.limit ? `?limit=${params.limit}` : "";
  return request("GET", `/api/admin/food/orders${q}`);
}

export async function getAdminFoodMerchants(): Promise<{
  ok: boolean;
  merchants: AdminFoodMerchantRow[];
}> {
  return request("GET", "/api/admin/food/merchants");
}

export type AdminFoodRiderEvent = {
  id: string;
  order_id: string;
  event_type: string;
  source: string;
  at: string;
  rider_id?: string;
  phase?: string;
};

export type AdminFoodRidersPayload = {
  ok: boolean;
  summary: {
    open_jobs: number;
    active_deliveries: number;
    riders_online: number;
  };
  jobs: Array<{
    id: string;
    order_id: string;
    merchant_name?: string;
    status: string;
    phase: string;
    rider_id?: string;
    job_type?: string;
    amount_micro?: number;
  }>;
  riders: Array<{ rider_id: string; active_jobs: number; completed: number }>;
  recent_events: AdminFoodRiderEvent[];
};

export async function getAdminFoodRiders(): Promise<AdminFoodRidersPayload> {
  return request("GET", "/api/admin/food/riders");
}

export type AdminDispatchPipeline = {
  ok: boolean;
  pipeline: {
    waiting_rider: Array<{ id: string; order_id: string; merchant_name?: string; phase: string }>;
    assigned: Array<{ id: string; order_id: string; merchant_name?: string; phase: string }>;
    picked: Array<{ id: string; order_id: string; merchant_name?: string; phase: string }>;
    delivering: Array<{ id: string; order_id: string; merchant_name?: string; phase: string }>;
    completed: Array<{ id: string; order_id: string; merchant_name?: string; phase: string }>;
  };
};

export async function getAdminFoodDispatch(): Promise<AdminDispatchPipeline> {
  return request("GET", "/api/admin/food/dispatch");
}

export type AdminOrderTimeline = {
  ok: boolean;
  order_id: string;
  food_timeline: Array<{
    id: string;
    time_label: string;
    label: string;
    event_type: string;
    kind: string;
    rider_id?: string;
  }>;
  dispatch_timeline: Array<{
    id: string;
    time_label: string;
    label: string;
    event_type: string;
    rider_id?: string;
  }>;
};

export async function getAdminOrderTimeline(orderId: string): Promise<AdminOrderTimeline> {
  return request("GET", `/api/admin/food/orders/${encodeURIComponent(orderId)}/timeline`);
}

// ============ Marketplace commission (storefront escrow ledger — admin only) ============
export type MarketplaceCommissionSummary = {
  ok: true;
  backend: string;
  commission_rate_default: number;
  from: string | null;
  to: string | null;
  group: "day" | "week" | "month";
  totals: {
    accrued_commission_micro: number;
    released_commission_micro: number;
    gross_micro: number;
    accrued_order_count: number;
    released_order_count: number;
  };
  buckets: Array<{
    bucket: string;
    accrued_commission_micro: number;
    released_commission_micro: number;
    gross_micro: number;
    order_count: number;
  }>;
};

export type MarketplaceCommissionOrderRow = {
  id: string;
  order_id: string;
  hold_id: string;
  merchant_id: string;
  gross_amount_micro: number;
  commission_rate: number;
  commission_micro: number;
  net_amount_micro: number;
  status: "accrued" | "released";
  created_at: string;
  released_at: string | null;
};

export function getMarketplaceCommissionSummary(params?: {
  from?: string;
  to?: string;
  group?: "day" | "week" | "month";
}): Promise<MarketplaceCommissionSummary> {
  const sp = new URLSearchParams();
  if (params?.from) sp.set("from", params.from);
  if (params?.to) sp.set("to", params.to);
  if (params?.group) sp.set("group", params.group);
  const q = sp.toString();
  return request("GET", `/api/admin/marketplace/commission/summary${q ? `?${q}` : ""}`);
}

export function getMarketplaceCommissionOrders(params?: {
  from?: string;
  to?: string;
  status?: "accrued" | "released";
  limit?: number;
  offset?: number;
}): Promise<{
  ok: true;
  total: number;
  orders: MarketplaceCommissionOrderRow[];
}> {
  const sp = new URLSearchParams();
  if (params?.from) sp.set("from", params.from);
  if (params?.to) sp.set("to", params.to);
  if (params?.status) sp.set("status", params.status);
  if (params?.limit != null) sp.set("limit", String(params.limit));
  if (params?.offset != null) sp.set("offset", String(params.offset));
  const q = sp.toString();
  return request("GET", `/api/admin/marketplace/commission/orders${q ? `?${q}` : ""}`);
}

export async function downloadMarketplaceCommissionCsv(params?: {
  from?: string;
  to?: string;
  status?: "accrued" | "released";
}): Promise<void> {
  const sp = new URLSearchParams();
  if (params?.from) sp.set("from", params.from);
  if (params?.to) sp.set("to", params.to);
  if (params?.status) sp.set("status", params.status);
  const q = sp.toString();
  const token = getAdminToken();
  const url = `${ADMIN_API_BASE}/api/admin/marketplace/commission/export.csv${q ? `?${q}` : ""}`;
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `marketplace-commission${params?.from ? `-${params.from}` : ""}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
