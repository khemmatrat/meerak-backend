/**
 * Job Advance API Service — เปลี่ยนจาก localStorage มาเรียก Backend (axios)
 * โครงเตรียม Mock API Calls; เมื่อ Backend พร้อมให้เปลี่ยน USE_MOCK_JOBS = false
 */

import axios, { AxiosInstance, AxiosError } from "axios";
import type {
  JobAdvanceAPI,
  CreateJobAdvanceRequest,
  CreateJobAdvanceResponse,
  ListJobAdvanceParams,
  ListJobAdvanceResponse,
  GetJobAdvanceResponse,
  MyJobAdvanceAPI,
  MyJobAdvanceApplicationAPI,
  JobBoardBadgesAPI,
  AdvanceApplicantWithUser,
  AdvanceJobMessageAPI,
  AdvanceMilestoneAPI,
  AdvanceJobReviewAPI,
  JobBoardBadgesAPI,
} from "../types/api";
import { getBackendBase } from "./api";

/** ใช้ logic เดียวกับ MockApi (api.ts) — กัน Mixed Content บน https://app.aqond.com */
function jobServiceBaseUrl(): string {
  return getBackendBase();
}

const USE_MOCK_JOBS = false;

const STORAGE_KEY = "meerak_advance_jobs";

// ============ Custom Error สำหรับแจ้ง Toast ============
export class JobServiceError extends Error {
  /** Server response body (for 5xx debugging) */
  public responseData?: unknown;
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number,
    responseData?: unknown,
  ) {
    super(message);
    this.name = "JobServiceError";
    this.responseData = responseData;
  }
}

export interface AdvanceJobQuotationPayload {
  quote_theme: string;
  quote_currency?: string;
  quote_summary?: string;
  quote_timeline_days?: number;
  quote_valid_until?: string;
  quote_total_amount?: number;
  edit_reason?: string;
  quote_items?: Array<{
    label: string;
    description?: string;
    qty?: number;
    unit_price?: number;
  }>;
}

/** Client-side hint for contact bypass in quotation text (server is authoritative) */
export function detectQuotationContactBypass(text: string): boolean {
  const s = String(text || "")
    .toLowerCase()
    .replace(/\s+/g, "");
  if (/0[689]\d{8}/.test(text.replace(/\D/g, ""))) return true;
  const needles = [
    "line",
    "lineapp",
    "lineme",
    "tiktok",
    "instagram",
    "facebook",
    "whatsapp",
    "telegram",
    "fb.com",
    "wa.me",
    "t.me",
  ];
  return needles.some((n) => s.includes(n));
}

// ============ Auth Header ============
export function getAuthHeaders(token: string | null): Record<string, string> {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

function createClient(token: string | null): AxiosInstance {
  const client = axios.create({
    baseURL: jobServiceBaseUrl(),
    timeout: 15000,
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(token),
    },
  });

  client.interceptors.response.use(
    (res) => res,
    (err: AxiosError<{ error?: string; message?: string }>) => {
      const msg =
        err.response?.data?.message || err.response?.data?.error || err.message;
      if (err.code === "ERR_NETWORK" || !err.response) {
        throw new JobServiceError(
          "การเชื่อมต่อขัดข้อง กรุณาตรวจสอบเน็ตหรือลองใหม่",
          "NETWORK_ERROR",
        );
      }
      if (err.response?.status === 401) {
        throw new JobServiceError("กรุณาเข้าสู่ระบบใหม่", "UNAUTHORIZED", 401);
      }
      if (err.response?.status === 403) {
        throw new JobServiceError(
          "คุณไม่มีสิทธิ์ดำเนินการนี้",
          "FORBIDDEN",
          403,
        );
      }
      if (err.response?.status === 400) {
        throw new JobServiceError(
          msg || "ข้อมูลไม่ถูกต้อง",
          "BAD_REQUEST",
          400,
        );
      }
      if (err.response?.status && err.response.status >= 500) {
        const resData = err.response?.data;
        console.error("[API] 5xx error:", err.response?.status, resData);
        throw new JobServiceError(
          "เซิร์ฟเวอร์ขัดข้อง ลองใหม่อีกครั้ง",
          "SERVER_ERROR",
          err.response.status,
          resData,
        );
      }
      throw new JobServiceError(
        msg || "เกิดข้อผิดพลาด",
        "UNKNOWN",
        err.response?.status,
      );
    },
  );

  return client;
}

// ============ Mock Storage Helpers ============
function mockLoad(): JobAdvanceAPI[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return [];
}

function mockSave(list: JobAdvanceAPI[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (_) {}
}

function toAPI(j: any): JobAdvanceAPI {
  return {
    id: j.id,
    employer_id: j.employer_id ?? j.created_by,
    employer_name: j.employer_name ?? j.created_by_name,
    employer_trust_score: j.employer_trust_score ?? 0,
    title: j.title,
    description: j.description,
    scope: j.scope,
    category: j.category,
    target_province: j.target_province ?? null,
    employment_type: j.employment_type ?? null,
    work_surface: j.work_surface ?? null,
    min_budget: j.min_budget ?? j.budget_min,
    max_budget: j.max_budget ?? j.budget_max,
    duration_days: j.duration_days,
    status: j.status ?? "open",
    applicant_count: j.applicant_count ?? 0,
    view_count: j.view_count ?? 0,
    is_platinum_priority: j.is_platinum_priority ?? false,
    created_at: j.created_at,
    updated_at: j.updated_at ?? j.created_at,
    published_at: j.published_at ?? null,
    closed_at: j.closed_at ?? null,
  };
}

// ============ API Methods ============

/**
 * ดึงรายการ Job Advance (พร้อม Filter/Search)
 */
export async function listAdvanceJobs(
  params: ListJobAdvanceParams = {},
  token: string | null = null,
): Promise<ListJobAdvanceResponse> {
  if (USE_MOCK_JOBS) {
    await new Promise((r) => setTimeout(r, 300));
    let list = mockLoad().map(toAPI);
    if (params.status && params.status !== "all") {
      list = list.filter((j) => j.status === params.status);
    }
    if (params.category) {
      list = list.filter((j) => j.category === params.category);
    }
    if (params.target_province) {
      list = list.filter(
        (j) =>
          String((j as any).target_province || "").trim() ===
          String(params.target_province).trim(),
      );
    }
    if (params.employment_type) {
      list = list.filter(
        (j) =>
          String((j as any).employment_type || "").trim() ===
          String(params.employment_type).trim(),
      );
    }
    if (params.min_budget != null) {
      list = list.filter((j) => j.max_budget >= params.min_budget!);
    }
    if (params.max_budget != null) {
      list = list.filter((j) => j.min_budget <= params.max_budget!);
    }
    const sort = params.sort ?? "newest";
    if (sort === "newest")
      list.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    if (sort === "budget_high")
      list.sort((a, b) => b.max_budget - a.max_budget);
    if (sort === "applicants")
      list.sort((a, b) => b.applicant_count - a.applicant_count);
    const page = params.page ?? 1;
    const limit = params.limit ?? 50;
    const total = list.length;
    const start = (page - 1) * limit;
    const jobs = list.slice(start, start + limit);
    return { success: true, jobs, total, page, limit };
  }

  const client = createClient(token);
  const { data } = await client.get<ListJobAdvanceResponse>(
    "/api/advance-jobs",
    { params },
  );
  return data;
}

/**
 * ดึงรายละเอียดงาน Advance ตาม ID
 */
export async function getAdvanceJobById(
  id: string,
  token: string | null = null,
): Promise<JobAdvanceAPI | null> {
  if (USE_MOCK_JOBS) {
    await new Promise((r) => setTimeout(r, 200));
    const list = mockLoad();
    const j = list.find((x) => x.id === id);
    return j ? toAPI(j) : null;
  }

  const client = createClient(token);
  const cleanId = String(id || "").trim();
  if (!cleanId) return null;
  try {
    const { data } = await client.get<GetJobAdvanceResponse>(
      `/api/advance-jobs/${encodeURIComponent(cleanId)}`,
    );
    return data.success ? data.job : null;
  } catch (err: any) {
    if (err?.statusCode === 404 || err?.response?.status === 404) {
      return null;
    }
    throw err;
  }
}

/** บันทึก View เมื่อเปิดดูงาน (สำหรับนับ view_count) */
export async function recordAdvanceJobView(
  jobId: string,
  token: string | null = null,
): Promise<void> {
  const cleanId = String(jobId || "").trim();
  if (!cleanId) return;
  try {
    const client = createClient(token);
    await client.post(`/api/advance-jobs/${encodeURIComponent(cleanId)}/view`);
  } catch (_) {}
}

/** แจ้งว่ากำลังพิมพ์ (Typing indicator) */
export async function sendAdvanceJobTyping(
  jobId: string,
  talentId: string,
  isTyping: boolean,
  token: string | null,
): Promise<void> {
  if (!token) return;
  const client = createClient(token);
  try {
    await client.post(`/api/advance-jobs/${encodeURIComponent(jobId)}/typing`, {
      talent_id: talentId,
      is_typing: isTyping,
    });
  } catch (_) {}
}

/** ตรวจว่าอีกฝ่ายกำลังพิมพ์หรือไม่ */
export async function getAdvanceJobTyping(
  jobId: string,
  talentId: string,
  token: string | null,
): Promise<boolean> {
  if (!token) return false;
  const client = createClient(token);
  try {
    const { data } = await client.get<{ success: boolean; is_typing: boolean }>(
      `/api/advance-jobs/${encodeURIComponent(jobId)}/typing`,
      { params: { talent_id: talentId } },
    );
    return !!data?.is_typing;
  } catch (_) {
    return false;
  }
}

/** รายการ Job Templates (สร้างจาก Template) */
export async function getAdvanceJobTemplates(token: string | null): Promise<
  Array<{
    id: string;
    name: string;
    category: string;
    description: string;
    scope: string;
    min_budget: number;
    max_budget: number;
    duration_days: number;
    is_system: boolean;
  }>
> {
  if (!token) return [];
  const client = createClient(token);
  try {
    const { data } = await client.get<{ success: boolean; templates: any[] }>(
      "/api/advance-jobs/templates",
    );
    return data.success ? data.templates : [];
  } catch (_) {
    return [];
  }
}

/** บันทึกเป็น Template */
export async function saveAdvanceJobTemplate(
  payload: {
    name: string;
    category: string;
    description: string;
    scope: string;
    min_budget?: number;
    max_budget?: number;
    duration_days?: number;
  },
  token: string | null,
): Promise<{ id: string } | null> {
  if (!token) return null;
  const client = createClient(token);
  try {
    const { data } = await client.post<{
      success: boolean;
      template: { id: string };
    }>("/api/advance-jobs/templates", payload);
    return data.success ? data.template : null;
  } catch (_) {
    return null;
  }
}

/** บันทึกเมื่อ employer เปิดดูโปรไฟล์ Talent (Viewed) */
export async function recordApplicantProfileView(
  jobId: string,
  talentId: string,
  token: string | null,
): Promise<void> {
  if (!token) return;
  const client = createClient(token);
  try {
    await client.post(
      `/api/advance-jobs/${encodeURIComponent(jobId)}/applicants/${encodeURIComponent(talentId)}/view`,
    );
  } catch (_) {}
}

/**
 * โพสต์งาน Advance ใหม่
 */
export async function createAdvanceJob(
  payload: CreateJobAdvanceRequest,
  token: string | null,
  employerName?: string,
  employerId?: string,
): Promise<JobAdvanceAPI> {
  if (USE_MOCK_JOBS) {
    await new Promise((r) => setTimeout(r, 500));
    if (!token && !employerId) {
      throw new JobServiceError("กรุณาเข้าสู่ระบบก่อนโพสต์งาน", "UNAUTHORIZED");
    }
    const list = mockLoad();
    const id = `adv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date().toISOString();
    const job: JobAdvanceAPI = {
      id,
      employer_id: employerId ?? "user",
      employer_name: employerName ?? "ผู้จ้าง",
      employer_trust_score: 0,
      title: payload.title,
      description: payload.description,
      scope: payload.scope,
      category: payload.category,
      min_budget: payload.min_budget,
      max_budget: payload.max_budget,
      duration_days: payload.duration_days,
      status: payload.status ?? "open",
      applicant_count: 0,
      is_platinum_priority: payload.is_platinum_priority ?? false,
      created_at: now,
      updated_at: now,
      published_at: payload.status === "open" ? now : null,
      closed_at: null,
    };
    list.push(job);
    mockSave(list);
    return job;
  }

  const client = createClient(token);
  if (!token)
    throw new JobServiceError("กรุณาเข้าสู่ระบบก่อนโพสต์งาน", "UNAUTHORIZED");
  const { data } = await client.post<CreateJobAdvanceResponse>(
    "/api/advance-jobs",
    payload,
  );
  if (!data.success || !data.job) {
    throw new JobServiceError(
      data.message ?? "โพสต์งานไม่สำเร็จ",
      "POST_FAILED",
    );
  }
  return data.job;
}

/**
 * กดสนใจ/ส่งข้อเสนอรับงาน (เพิ่ม applicant_count)
 */
export async function applyToJobAdvance(
  jobId: string,
  token: string | null,
  quotation?: AdvanceJobQuotationPayload | null,
  editReason?: string,
): Promise<{ applicant_count: number; version?: number }> {
  if (USE_MOCK_JOBS) {
    await new Promise((r) => setTimeout(r, 300));
    const list = mockLoad();
    const job = list.find((j) => j.id === jobId);
    if (!job) throw new JobServiceError("ไม่พบงานนี้", "NOT_FOUND");
    const count = (job.applicant_count ?? 0) + 1;
    job.applicant_count = count;
    mockSave(list);
    return { applicant_count: count };
  }

  const client = createClient(token);
  if (!token)
    throw new JobServiceError("กรุณาเข้าสู่ระบบก่อนส่งข้อเสนอ", "UNAUTHORIZED");
  const { data } = await client.post<{
    success: boolean;
    applicant_count: number;
    version?: number;
    error?: string;
    code?: string;
  }>(
    `/api/advance-jobs/${jobId}/apply`,
    quotation
      ? { quotation, edit_reason: editReason || quotation.edit_reason }
      : {},
  );
  if (!data.success)
    throw new JobServiceError(
      data.error || "ส่งข้อเสนอไม่สำเร็จ",
      data.code || "APPLY_FAILED",
    );
  return { applicant_count: data.applicant_count, version: data.version };
}

/** งานที่ฉันสมัคร (Talent) */
export async function getMyAdvanceJobApplications(
  token: string | null,
): Promise<MyJobAdvanceApplicationAPI[]> {
  if (!token) return [];
  try {
    const client = createClient(token);
    const { data } = await client.get<{
      success: boolean;
      applications: MyJobAdvanceApplicationAPI[];
    }>("/api/advance-jobs/my-applications");
    return data.success ? data.applications : [];
  } catch (err: any) {
    const status = err?.response?.status ?? err?.statusCode;
    if (status === 404) return [];
    throw err;
  }
}

/** แจ้งเตือนจริงบนแท็บ Job Board (ข้อความใหม่ / รอโอน / รอให้คะแนน) */
export async function getJobBoardBadges(
  token: string | null,
): Promise<{ my_jobs: JobBoardBadgesAPI; applications: JobBoardBadgesAPI }> {
  const empty: JobBoardBadgesAPI = {
    unread_messages: 0,
    pending_escrow: 0,
    pending_review: 0,
    total: 0,
  };
  if (!token) return { my_jobs: empty, applications: empty };
  try {
    const client = createClient(token);
    const { data } = await client.get<{
      success: boolean;
      my_jobs: JobBoardBadgesAPI;
      applications: JobBoardBadgesAPI;
    }>("/api/advance-jobs/board-badges");
    if (!data.success) return { my_jobs: empty, applications: empty };
    return {
      my_jobs: data.my_jobs || empty,
      applications: data.applications || empty,
    };
  } catch (err: any) {
    const status = err?.response?.status ?? err?.statusCode;
    if (status === 404) return { my_jobs: empty, applications: empty };
    throw err;
  }
}

/** จำนวนข้อความที่ยังไม่อ่านต่อ job */
export async function getUnreadAdvanceJobMap(
  token: string | null,
): Promise<Record<string, number>> {
  if (!token) return {};
  try {
    const client = createClient(token);
    const { data } = await client.get<{ success: boolean; unread_by_job: Record<string, number> }>(
      "/api/advance-jobs/unread-map",
    );
    if (!data.success) return {};
    return data.unread_by_job || {};
  } catch (err: any) {
    const status = err?.response?.status ?? err?.statusCode;
    if (status === 404) return {};
    throw err;
  }
}

/** งานที่ฉันโพสต์ (นายจ้าง) */
export async function getMyAdvanceJobs(
  token: string | null,
): Promise<MyJobAdvanceAPI[]> {
  if (!token) return [];
  try {
    const client = createClient(token);
    const { data } = await client.get<{
      success: boolean;
      jobs: MyJobAdvanceAPI[];
    }>("/api/advance-jobs/my-jobs");
    return data.success ? data.jobs : [];
  } catch (err: any) {
    const status = err?.response?.status ?? err?.statusCode;
    if (status === 404) return [];
    throw err;
  }
}

/** งานที่บันทึกไว้ */
export async function getSavedAdvanceJobs(
  token: string | null,
): Promise<JobAdvanceAPI[]> {
  if (!token) return [];
  try {
    const client = createClient(token);
    const { data } = await client.get<{
      success: boolean;
      jobs: JobAdvanceAPI[];
    }>("/api/advance-jobs/saved");
    return data.success ? (data.jobs || []).map(toAPI) : [];
  } catch (err: any) {
    const status = err?.response?.status ?? err?.statusCode;
    if (status === 404) return [];
    throw err;
  }
}

/** รายการ id งานที่บันทึกไว้ */
export async function getSavedAdvanceJobIds(
  token: string | null,
): Promise<string[]> {
  if (!token) return [];
  try {
    const client = createClient(token);
    const { data } = await client.get<{ success: boolean; ids: string[] }>(
      "/api/advance-jobs/saved-ids",
    );
    return data.success ? data.ids || [] : [];
  } catch (err: any) {
    const status = err?.response?.status ?? err?.statusCode;
    if (status === 404) return [];
    throw err;
  }
}

/** บันทึกงานไว้ดูภายหลัง */
export async function saveAdvanceJob(
  jobId: string,
  token: string | null,
): Promise<void> {
  if (!token) throw new JobServiceError("กรุณาเข้าสู่ระบบ", "UNAUTHORIZED");
  const client = createClient(token);
  const { data } = await client.post<{ success: boolean; error?: string }>(
    `/api/advance-jobs/${encodeURIComponent(jobId)}/save`,
  );
  if (!data.success)
    throw new JobServiceError(data.error || "บันทึกไม่สำเร็จ", "SAVE_FAILED");
}

/** ยกเลิกบันทึกงาน */
export async function unsaveAdvanceJob(
  jobId: string,
  token: string | null,
): Promise<void> {
  if (!token) throw new JobServiceError("กรุณาเข้าสู่ระบบ", "UNAUTHORIZED");
  const client = createClient(token);
  const { data } = await client.delete<{ success: boolean; error?: string }>(
    `/api/advance-jobs/${encodeURIComponent(jobId)}/save`,
  );
  if (!data.success)
    throw new JobServiceError(
      data.error || "ยกเลิกบันทึกไม่สำเร็จ",
      "UNSAVE_FAILED",
    );
}

/** รายชื่อผู้สนใจ (เฉพาะนายจ้าง) + auto-scoring */
export async function getAdvanceJobApplicants(
  jobId: string,
  token: string | null,
): Promise<{
  applicants: AdvanceApplicantWithUser[];
  quotation_scores?: import("../types/api").QuotationCompareMeta;
}> {
  if (!token) return { applicants: [] };
  const client = createClient(token);
  const { data } = await client.get<{
    success: boolean;
    applicants: AdvanceApplicantWithUser[];
    quotation_scores?: import("../types/api").QuotationCompareMeta;
  }>(`/api/advance-jobs/${encodeURIComponent(jobId)}/applicants`);
  return data.success
    ? {
        applicants: data.applicants,
        quotation_scores: data.quotation_scores,
      }
    : { applicants: [] };
}

/** Employer counter-offer to talent */
export async function postEmployerCounterOffer(
  jobId: string,
  talentUserId: string,
  quotation: AdvanceJobQuotationPayload,
  editReason: string,
  token: string | null,
): Promise<{ version: number; expires_at?: string }> {
  if (!token) throw new JobServiceError("กรุณาเข้าสู่ระบบ", "UNAUTHORIZED");
  const client = createClient(token);
  const { data } = await client.post<{
    success: boolean;
    version?: number;
    expires_at?: string;
    error?: string;
  }>(
    `/api/advance-jobs/${encodeURIComponent(jobId)}/applicants/${encodeURIComponent(talentUserId)}/counter-offer`,
    { quotation, edit_reason: editReason },
  );
  if (!data.success)
    throw new JobServiceError(
      data.error || "ส่ง counter-offer ไม่สำเร็จ",
      "COUNTER_FAILED",
    );
  return { version: data.version || 0, expires_at: data.expires_at };
}

/** Quotation version history */
export async function getQuotationVersions(
  jobId: string,
  talentUserId: string,
  token: string | null,
): Promise<import("../types/api").AdvanceQuotationVersion[]> {
  if (!token) return [];
  const client = createClient(token);
  const { data } = await client.get<{
    success: boolean;
    versions: import("../types/api").AdvanceQuotationVersion[];
  }>(
    `/api/advance-jobs/${encodeURIComponent(jobId)}/applicants/${encodeURIComponent(talentUserId)}/quotation-versions`,
  );
  return data.success ? data.versions : [];
}

/** Shortlist / Hire / Reject (นายจ้าง) */
export async function patchAdvanceApplicant(
  jobId: string,
  applicantUserId: string,
  status: "shortlisted" | "hired" | "rejected",
  token: string | null,
  agreed_amount?: number,
): Promise<void> {
  if (!token) throw new JobServiceError("กรุณาเข้าสู่ระบบ", "UNAUTHORIZED");
  const client = createClient(token);
  const { data } = await client.patch<{ success: boolean; error?: string }>(
    `/api/advance-jobs/${encodeURIComponent(jobId)}/applicants/${encodeURIComponent(applicantUserId)}`,
    { status, agreed_amount },
  );
  if (!data.success)
    throw new JobServiceError(data.error || "อัปเดตไม่สำเร็จ", "PATCH_FAILED");
}

/** ค่าธรรมเนียมการชำระเงิน (markup, handling, commission) — สำหรับแสดงยอดรวมก่อนโอน Escrow */
export async function getPaymentFeeConfig(): Promise<{
  paymentMarkupPercent: number;
  handlingFeePercent: number;
  commissionRates?: {
    none: number;
    silver: number;
    gold: number;
    platinum: number;
  };
}> {
  try {
    const { data } = await axios.get<{
      paymentMarkupPercent?: number;
      handlingFeePercent?: number;
      commissionRates?: {
        none: number;
        silver: number;
        gold: number;
        platinum: number;
      };
    }>(`${jobServiceBaseUrl()}/api/payments/fee-config`, { timeout: 5000 });
    return {
      paymentMarkupPercent: data.paymentMarkupPercent ?? 5,
      handlingFeePercent: data.handlingFeePercent ?? 8,
      commissionRates: data.commissionRates ?? {
        none: 24,
        silver: 18,
        gold: 15,
        platinum: 12,
      },
    };
  } catch {
    return {
      paymentMarkupPercent: 5,
      handlingFeePercent: 8,
      commissionRates: { none: 24, silver: 18, gold: 15, platinum: 12 },
    };
  }
}

export interface PayoutByTierItem {
  payout: number;
  commissionPercent: number;
  sourcePercent: number;
  totalDeductionPercent: number;
  label: string;
  labelTh: string;
  isBestValue?: boolean;
}

/** รายละเอียดการชำระก่อนโอน Escrow (Job Advance) */
export async function getEscrowBreakdown(
  jobId: string,
  amount: number,
  token: string | null,
  hasInsurance?: boolean,
): Promise<{
  jobFee: number;
  handlingFeeAmount: number;
  paymentMarkupAmount: number;
  commissionFeeAmount: number;
  talentReceives: number;
  totalToPay: number;
  has_insurance?: boolean;
  insurance_amount?: number;
  talent_current_tier?: string;
  payout_by_tier?: Record<string, PayoutByTierItem>;
}> {
  if (!token) throw new JobServiceError("กรุณาเข้าสู่ระบบ", "UNAUTHORIZED");
  const client = createClient(token);
  const params: Record<string, string | number> = { amount };
  if (hasInsurance) params.has_insurance = "true";
  const { data } = await client.get<{
    jobFee: number;
    handlingFeeAmount: number;
    paymentMarkupAmount: number;
    commissionFeeAmount: number;
    talentReceives: number;
    totalToPay: number;
    has_insurance?: boolean;
    insurance_amount?: number;
    talent_current_tier?: string;
    payout_by_tier?: Record<string, PayoutByTierItem>;
  }>(`/api/advance-jobs/${encodeURIComponent(jobId)}/escrow-breakdown`, {
    params,
  });
  return data;
}

/** โอนเงินเข้า Escrow (นายจ้าง) */
export async function postAdvanceJobEscrow(
  jobId: string,
  amount: number,
  token: string | null,
): Promise<{ escrow_amount: number; escrow_status: string }> {
  if (!token) throw new JobServiceError("กรุณาเข้าสู่ระบบ", "UNAUTHORIZED");
  const client = createClient(token);
  const { data } = await client.post<{
    success: boolean;
    escrow_amount?: number;
    escrow_status?: string;
    error?: string;
  }>(`/api/advance-jobs/${encodeURIComponent(jobId)}/escrow`, { amount });
  if (!data.success)
    throw new JobServiceError(data.error || "โอนไม่สำเร็จ", "ESCROW_FAILED");
  return {
    escrow_amount: data.escrow_amount ?? amount,
    escrow_status: data.escrow_status ?? "held",
  };
}

/** Talent ส่งงาน (Submit Final Work) — status → submitted / Under Review */
export async function submitWork(
  jobId: string,
  payload: {
    submission_url?: string;
    submission_links?: Array<{ url: string; label?: string }>;
  },
  token: string | null,
): Promise<boolean> {
  if (!token) throw new JobServiceError("กรุณาเข้าสู่ระบบ", "UNAUTHORIZED");
  if (!jobId || jobId === "undefined") {
    console.error("[submitWork] jobId is missing or undefined:", jobId);
    throw new JobServiceError("ไม่พบ ID งาน", "INVALID_JOB_ID");
  }

  // Mock handling — do not call real API for mock job IDs
  const { isMockJobId } = await import("../services/mockJobsForReview");
  if (isMockJobId(jobId)) {
    console.log("[submitWork] Mock job — simulating success (no API call)");
    return true;
  }

  const body = {
    submission_url: payload.submission_url ?? null,
    submission_links: Array.isArray(payload.submission_links)
      ? payload.submission_links.filter((l) => l?.url?.trim())
      : [],
  };
  const hasUrl = !!(body.submission_url && String(body.submission_url).trim());
  const hasLinks = body.submission_links.length > 0;
  if (!hasUrl && !hasLinks) {
    throw new JobServiceError(
      "กรุณาระบุ URL หรือลิงก์อย่างน้อย 1 รายการ",
      "VALIDATION",
    );
  }

  console.log("[submitWork] Request payload:", {
    jobId,
    body,
    hasToken: !!token,
  });
  const client = createClient(token);
  try {
    const { data } = await client.post<{ success: boolean; error?: string }>(
      `/api/advance-jobs/${encodeURIComponent(jobId)}/submit-work`,
      body,
    );
    if (!data?.success) {
      console.error("[submitWork] Server response (non-success):", data);
      throw new JobServiceError(
        data?.error || "ส่งงานไม่สำเร็จ",
        "SUBMIT_FAILED",
      );
    }
    return true;
  } catch (err: any) {
    const status = err?.response?.status ?? err?.statusCode;
    const resData =
      err?.response?.data ??
      (err instanceof JobServiceError ? err.responseData : undefined);
    console.error("[submitWork] Error:", {
      status,
      message: err?.message,
      responseData: resData,
      code: err?.code,
    });
    throw err;
  }
}

/** นายจ้างขอแก้ไข (Request Revision) */
export async function requestRevision(
  jobId: string,
  revisionNote: string,
  token: string | null,
): Promise<{ revision_count: number; revision_limit: number }> {
  if (!token) throw new JobServiceError("กรุณาเข้าสู่ระบบ", "UNAUTHORIZED");
  const client = createClient(token);
  const { data } = await client.post<{
    success: boolean;
    error?: string;
    revision_count?: number;
    revision_limit?: number;
  }>(`/api/advance-jobs/${encodeURIComponent(jobId)}/request-revision`, {
    revision_note: revisionNote,
  });
  if (!data?.success)
    throw new JobServiceError(
      data?.error || "ส่งคำขอไม่สำเร็จ",
      "REVISION_FAILED",
    );
  return {
    revision_count: data.revision_count ?? 0,
    revision_limit: data.revision_limit ?? 3,
  };
}

export interface AdvanceProcurementRevision {
  id: string;
  revision_no: number;
  created_at: string;
  document_hash: string;
  prev_hash?: string | null;
  winner_user_id?: string | null;
  winner_reason?: string | null;
  price_before_negotiation?: number | null;
  price_after_negotiation?: number | null;
  ai_price_recommended?: number | null;
  ai_risk_score?: number | null;
  fraud_signals?: string[];
  document_count?: number;
}

export async function createAdvanceProcurementRevision(
  jobId: string,
  payload: {
    winner_user_id?: string;
    winner_reason?: string;
    price_before_negotiation?: number;
    price_after_negotiation?: number;
    tor_sow_snapshot?: {
      title?: string;
      objective?: string;
      scope?: string;
      deliverables?: string[];
      timeline_days?: number;
      extra_notes?: string;
    };
  },
  token: string | null,
): Promise<{
  revision: {
    id: string;
    revision_no: number;
    created_at: string;
    document_hash: string;
    prev_hash?: string | null;
  };
  ai?: {
    recommended_price?: number;
    risk_score?: number;
    fraud_signals?: string[];
  };
}> {
  if (!token) throw new JobServiceError("กรุณาเข้าสู่ระบบ", "UNAUTHORIZED");
  const client = createClient(token);
  const { data } = await client.post<{
    success: boolean;
    revision?: {
      id: string;
      revision_no: number;
      created_at: string;
      document_hash: string;
      prev_hash?: string | null;
    };
    ai?: {
      recommended_price?: number;
      risk_score?: number;
      fraud_signals?: string[];
    };
    error?: string;
  }>(
    `/api/advance-jobs/${encodeURIComponent(jobId)}/procurement/revisions`,
    payload,
  );
  if (!data?.success || !data?.revision) {
    throw new JobServiceError(
      data?.error || "สร้าง procurement revision ไม่สำเร็จ",
      "PROCUREMENT_REVISION_FAILED",
    );
  }
  return { revision: data.revision, ai: data.ai };
}

export async function getAdvanceProcurementRevisions(
  jobId: string,
  token: string | null,
): Promise<AdvanceProcurementRevision[]> {
  if (!token) return [];
  const client = createClient(token);
  const { data } = await client.get<{
    success: boolean;
    revisions: AdvanceProcurementRevision[];
  }>(`/api/advance-jobs/${encodeURIComponent(jobId)}/procurement/revisions`);
  return data?.success ? data.revisions || [] : [];
}

export async function downloadAdvanceProcurementPackage(
  jobId: string,
  format: "csv" | "pdf" | "json",
  token: string | null,
  opts?: {
    revision_id?: string;
    agency_form?: "th_gov_procurement_v1" | "egp_v1";
  },
): Promise<void> {
  if (!token) throw new JobServiceError("กรุณาเข้าสู่ระบบ", "UNAUTHORIZED");
  const q = new URLSearchParams();
  if (opts?.revision_id) q.set("revision_id", opts.revision_id);
  if (format === "json" && opts?.agency_form)
    q.set("agency_form", opts.agency_form);
  const qs = q.toString();
  const path = `/api/advance-jobs/${encodeURIComponent(jobId)}/procurement/export.${format}${qs ? `?${qs}` : ""}`;
  const url = `${jobServiceBaseUrl()}${path}`;
  const headers: Record<string, string> = {
    ...getAuthHeaders(token),
  };
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new JobServiceError(
      errText || `ดาวน์โหลดไฟล์ไม่สำเร็จ (${res.status})`,
      "PROCUREMENT_EXPORT_FAILED",
      res.status,
    );
  }
  const blob = await res.blob();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `procurement-${jobId}-${stamp}.${format}`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** รายการงวด (Milestone) — สำหรับปล่อยเงินเป็นงวด */
/** Milestone Proposal — Talent เสนอโครงงวด */
export async function getMilestoneProposal(
  jobId: string,
  token: string | null,
): Promise<{
  id: string;
  items: Array<{ order: number; amount: number; description: string }>;
  status: string;
} | null> {
  if (!token) return null;
  const client = createClient(token);
  try {
    const { data } = await client.get<{ success: boolean; proposal: any }>(
      `/api/advance-jobs/${jobId}/milestone-proposal`,
    );
    return data.success && data.proposal ? data.proposal : null;
  } catch (_) {
    return null;
  }
}

export async function submitMilestoneProposal(
  jobId: string,
  items: Array<{ order: number; amount: number; description?: string }>,
  token: string | null,
): Promise<boolean> {
  if (!token) return false;
  const client = createClient(token);
  try {
    const { data } = await client.post<{ success: boolean }>(
      `/api/advance-jobs/${jobId}/milestone-proposal`,
      { items },
    );
    return !!data?.success;
  } catch (_) {
    return false;
  }
}

export async function approveMilestoneProposal(
  jobId: string,
  action: "approve" | "reject" | "edit",
  items?: Array<{ order: number; amount: number; description?: string }>,
  token?: string | null,
): Promise<boolean> {
  if (!token) return false;
  const client = createClient(token);
  try {
    const { data } = await client.patch<{ success: boolean }>(
      `/api/advance-jobs/${jobId}/milestone-proposal`,
      { action, items },
    );
    return !!data?.success;
  } catch (_) {
    return false;
  }
}

/** Scope Agreement — รายการส่งมอบ + ยืนยัน */
export async function getScopeAgreement(
  jobId: string,
  token: string | null,
): Promise<{
  id: string;
  deliverables: Array<{ text: string; order?: number }>;
  employer_confirmed_at: string | null;
  talent_confirmed_at: string | null;
  both_confirmed: boolean;
} | null> {
  if (!token) return null;
  const client = createClient(token);
  try {
    const { data } = await client.get<{ success: boolean; scope: any }>(
      `/api/advance-jobs/${jobId}/scope-agreement`,
    );
    return data.success && data.scope ? data.scope : null;
  } catch (_) {
    return null;
  }
}

export async function putScopeAgreement(
  jobId: string,
  deliverables: Array<{ text: string; order?: number }>,
  token: string | null,
): Promise<boolean> {
  if (!token) return false;
  const client = createClient(token);
  try {
    const { data } = await client.put<{ success: boolean }>(
      `/api/advance-jobs/${jobId}/scope-agreement`,
      { deliverables },
    );
    return !!data?.success;
  } catch (_) {
    return false;
  }
}

export async function confirmScopeAgreement(
  jobId: string,
  token: string | null,
): Promise<boolean> {
  if (!token) return false;
  const client = createClient(token);
  try {
    const { data } = await client.post<{ success: boolean }>(
      `/api/advance-jobs/${jobId}/scope-agreement/confirm`,
    );
    return !!data?.success;
  } catch (_) {
    return false;
  }
}

/** Analytics สำหรับ Employer */
export async function getAdvanceJobAnalytics(
  jobId: string,
  token: string | null,
): Promise<{
  view_count: number;
  applicant_count: number;
  conversion_rate: string | null;
  time_to_hire_hours: number | null;
  time_to_hire_days: string | null;
} | null> {
  if (!token) return null;
  const client = createClient(token);
  try {
    const { data } = await client.get<{ success: boolean; analytics: any }>(
      `/api/advance-jobs/${jobId}/analytics`,
    );
    return data.success && data.analytics ? data.analytics : null;
  } catch (_) {
    return null;
  }
}

export async function getAdvanceJobMilestones(
  jobId: string,
  token: string | null,
): Promise<AdvanceMilestoneAPI[]> {
  if (!token) return [];
  const client = createClient(token);
  const { data } = await client.get<{
    success: boolean;
    milestones: AdvanceMilestoneAPI[];
  }>(`/api/advance-jobs/${encodeURIComponent(jobId)}/milestones`);
  return data.success ? data.milestones : [];
}

/** ปล่อยเงินทั้งหมดจาก Escrow (นายจ้าง) — Approve & Pay เมื่อ work under review */
export async function releaseAllAdvanceEscrow(
  jobId: string,
  token: string | null,
): Promise<{ amount_released: number }> {
  if (!token) throw new JobServiceError("กรุณาเข้าสู่ระบบ", "UNAUTHORIZED");
  const client = createClient(token);
  const { data } = await client.post<{
    success: boolean;
    amount_released?: number;
    error?: string;
  }>(`/api/advance-jobs/${encodeURIComponent(jobId)}/release`);
  if (!data?.success)
    throw new JobServiceError(
      data?.error || "ปล่อยเงินไม่สำเร็จ",
      "RELEASE_FAILED",
    );
  return { amount_released: data.amount_released ?? 0 };
}

/** ปล่อยเงินงวดนี้ (นายจ้าง) — หัก Commission อัตโนมัติ แล้วโอนเข้า balance Talent */
export async function releaseAdvanceMilestone(
  jobId: string,
  milestoneId: string,
  token: string | null,
): Promise<{
  amount_released: number;
  commission_deducted: number;
  is_job_completed: boolean;
}> {
  if (!token) throw new JobServiceError("กรุณาเข้าสู่ระบบ", "UNAUTHORIZED");
  const client = createClient(token);
  const { data } = await client.post<{
    success: boolean;
    amount_released?: number;
    commission_deducted?: number;
    is_job_completed?: boolean;
    error?: string;
  }>(
    `/api/advance-jobs/${encodeURIComponent(jobId)}/milestones/${encodeURIComponent(milestoneId)}/release`,
  );
  if (!data.success)
    throw new JobServiceError(
      data.error || "ปล่อยเงินงวดไม่สำเร็จ",
      "RELEASE_FAILED",
    );
  return {
    amount_released: data.amount_released ?? 0,
    commission_deducted: data.commission_deducted ?? 0,
    is_job_completed: data.is_job_completed ?? false,
  };
}

/** รายการแชท (talentId = Private Chat กับผู้สมัครคนนั้น) */
export async function getAdvanceJobMessages(
  jobId: string,
  token: string | null,
  talentId?: string | null,
): Promise<AdvanceJobMessageAPI[]> {
  if (!token) return [];
  const client = createClient(token);
  const params = talentId ? { talent_id: talentId } : {};
  const { data } = await client.get<{
    success: boolean;
    messages: AdvanceJobMessageAPI[];
  }>(`/api/advance-jobs/${encodeURIComponent(jobId)}/messages`, { params });
  return data.success ? data.messages : [];
}

/** ส่งข้อความ (talentId = ส่งใน Private Chat กับผู้สมัครคนนั้น) */
export async function postAdvanceJobMessage(
  jobId: string,
  body: string,
  token: string | null,
  talentId?: string | null,
): Promise<AdvanceJobMessageAPI> {
  if (!token) throw new JobServiceError("กรุณาเข้าสู่ระบบ", "UNAUTHORIZED");
  const client = createClient(token);
  const payload: { body: string; talent_id?: string } = { body };
  if (talentId) payload.talent_id = talentId;
  const { data } = await client.post<{
    success: boolean;
    message: AdvanceJobMessageAPI;
    error?: string;
  }>(`/api/advance-jobs/${encodeURIComponent(jobId)}/messages`, payload);
  if (!data.success)
    throw new JobServiceError(
      data.error || "ส่งไม่สำเร็จ",
      "POST_MESSAGE_FAILED",
    );
  return data.message;
}

/** รายการรีวิวของงานนี้ */
export async function getAdvanceJobReviews(
  jobId: string,
): Promise<AdvanceJobReviewAPI[]> {
  const { data } = await createClient(null).get<{
    success: boolean;
    reviews: AdvanceJobReviewAPI[];
  }>(`/api/advance-jobs/${encodeURIComponent(jobId)}/reviews`);
  return data.success ? data.reviews : [];
}

/** รีวิวของฉัน (ถ้ามี) — ใช้ซ่อนฟอร์มเมื่อให้คะแนนแล้ว */
export async function getAdvanceJobMyReview(
  jobId: string,
  token: string | null,
): Promise<{
  id: string;
  rating: number;
  comment: string;
  created_at: string;
} | null> {
  if (!token) return null;
  const { data } = await createClient(token).get<{
    success: boolean;
    review: {
      id: string;
      rating: number;
      comment: string;
      created_at: string;
    } | null;
  }>(`/api/advance-jobs/${encodeURIComponent(jobId)}/reviews/me`);
  return data.success ? data.review : null;
}

/** ส่งรีวิว (Talent ให้ดาวนายจ้าง) */
export async function postAdvanceJobReview(
  jobId: string,
  payload: { rating: number; comment?: string },
  token: string | null,
): Promise<{ employer_trust_score: number }> {
  if (!token) throw new JobServiceError("กรุณาเข้าสู่ระบบ", "UNAUTHORIZED");
  const client = createClient(token);
  const { data } = await client.post<{
    success: boolean;
    employer_trust_score?: number;
    error?: string;
  }>(`/api/advance-jobs/${encodeURIComponent(jobId)}/reviews`, payload);
  if (!data.success)
    throw new JobServiceError(
      data.error || "บันทึกคะแนนไม่สำเร็จ",
      "POST_REVIEW_FAILED",
    );
  return { employer_trust_score: data.employer_trust_score ?? 0 };
}
