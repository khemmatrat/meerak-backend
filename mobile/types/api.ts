/**
 * API Schema — โครงสร้างข้อมูล Job Advance สำหรับส่ง/รับจาก Backend
 * ใช้ร่วมกับ services/jobService.ts และ Backend API
 */

// ============ Job Advance Status (Workflow แบบ Fastwork) ============
export type JobAdvanceStatus =
  | "draft" // แบบร่าง ยังไม่เผยแพร่
  | "open" // เปิดรับข้อเสนอ
  | "pending" // มีคนสนใจ / รอเลือกผู้รับงาน
  | "in_progress" // กำลังทำงาน
  | "completed" // ส่งมอบเสร็จ
  | "disputed"; // มีข้อพิพาท

// ============ Budget Range ============
export interface BudgetRange {
  min_budget: number;
  max_budget: number;
  currency?: string; // default THB
}

// ============ Timestamps (ISO 8601) ============
export interface JobAdvanceTimestamps {
  created_at: string;
  updated_at: string;
  published_at?: string | null; // เมื่อเปลี่ยนจาก draft → open
  closed_at?: string | null;
}

// ============ Job Advance (Full — ตรงกับ DB + API Response) ============
export interface JobAdvanceAPI {
  id: string;
  employer_id: string;
  employer_name?: string;
  employer_trust_score?: number;

  title: string;
  description: string;
  scope: string;
  category: string;
  target_province?: string | null;
  employment_type?: string | null;
  work_surface?: string | null;

  min_budget: number;
  max_budget: number;
  duration_days: number;

  status: JobAdvanceStatus;
  applicant_count: number;
  view_count?: number;

  is_platinum_priority?: boolean;

  created_at: string;
  updated_at: string;
  published_at?: string | null;
  closed_at?: string | null;
}

// ============ Create Job Advance — Request Body ============
export interface CreateJobAdvanceRequest {
  title: string;
  description: string;
  scope: string;
  category: string;
  min_budget: number;
  max_budget: number;
  duration_days: number;
  status?: "draft" | "open"; // โพสต์เป็น open เลย หรือเก็บ draft
  is_platinum_priority?: boolean;
  target_province?: string;
  employment_type?: string;
  work_surface?: "jobboard" | "match_job" | "booking" | "videofeed";
}

// ============ Create Job Advance — API Response ============
export interface CreateJobAdvanceResponse {
  success: boolean;
  job: JobAdvanceAPI;
  message?: string;
}

// ============ List Jobs — Query Params ============
export interface ListJobAdvanceParams {
  status?: JobAdvanceStatus | "all";
  category?: string;
  target_province?: string;
  employment_type?: string;
  min_budget?: number;
  max_budget?: number;
  min_duration?: number;
  max_duration?: number;
  q?: string; // ค้นหาจาก title/description/scope
  page?: number;
  limit?: number;
  sort?: "newest" | "budget_high" | "applicants";
}

// ============ List Jobs — API Response ============
export interface ListJobAdvanceResponse {
  success: boolean;
  jobs: JobAdvanceAPI[];
  total: number;
  page: number;
  limit: number;
}

// ============ Get Job By ID — API Response ============
export interface GetJobAdvanceResponse {
  success: boolean;
  job: JobAdvanceAPI;
}

// ============ Applicant / สนใจงาน ============
export interface AdvanceJobApplicantAPI {
  id: string;
  job_id: string;
  user_id: string;
  user_name?: string;
  status: "interested" | "shortlisted" | "hired" | "rejected";
  created_at: string;
}

export interface ApplyJobAdvanceResponse {
  success: boolean;
  applicant_count: number;
  message?: string;
}

// ============ My Jobs (นายจ้าง) + Hired / Escrow ============
export interface MyJobAdvanceAPI extends JobAdvanceAPI {
  hired_user_id?: string | null;
  hired_at?: string | null;
  agreed_amount?: number | null;
  escrow_amount?: number;
  escrow_status?: "none" | "held" | "released" | "refunded" | "disputed";
  work_submission_status?: "none" | "submitted" | "revision_requested" | string;
  review_pending?: boolean;
}

export interface MyJobAdvanceApplicationAPI {
  id: string;
  job_id: string;
  user_id: string;
  status: "interested" | "shortlisted" | "hired" | "rejected";
  created_at: string;
  title: string;
  category: string;
  min_budget: number;
  max_budget: number;
  duration_days: number;
  job_status: string;
  hired_user_id?: string | null;
  employer_name: string;
  escrow_status?: string;
  work_submission_status?: string;
  review_pending?: boolean;
  viewed_at?: string | null;
  quote_theme?: string | null;
  quote_total_amount?: number | null;
  quote_currency?: string | null;
  quote_valid_until?: string | null;
  quote_version_count?: number;
  quote_expires_at?: string | null;
  quote_status?: string | null;
}

export interface JobBoardBadgesAPI {
  unread_messages: number;
  pending_escrow: number;
  pending_review: number;
  total: number;
}

export interface AdvanceQuotationSnapshot {
  theme: string;
  currency: string;
  summary?: string;
  timeline_days?: number | null;
  valid_until?: string | null;
  expires_at?: string | null;
  items?: Array<{
    label: string;
    description?: string;
    qty: number;
    unit_price: number;
    total: number;
  }>;
  total_amount: number;
  updated_at?: string | null;
  version?: number;
  status?: "active" | "expired" | "accepted" | "superseded";
  expired?: boolean;
}

export type QuotationScoreBadge = "best_value" | "fastest" | "most_trusted";

export interface AdvanceQuotationVersion {
  id: string;
  version: number;
  proposed_by: "talent" | "employer";
  edit_reason?: string | null;
  status: string;
  expires_at?: string | null;
  created_at: string;
  quotation: AdvanceQuotationSnapshot;
}

export interface QuotationCompareMeta {
  badges: Record<string, QuotationScoreBadge[]>;
  winners: Partial<Record<QuotationScoreBadge, string>>;
  expiry_rules?: {
    default_hours: number;
    max_versions: number;
    reminder_hours_before: number;
  };
}

export interface AdvanceApplicantWithUser {
  id: string;
  viewed_at?: string | null; // เมื่อ employer เปิดดูโปรไฟล์แล้ว
  last_active_at?: string | null; // เวลาที่ Talent เคลื่อนไหวล่าสุด
  job_id: string;
  user_id: string;
  status: "interested" | "shortlisted" | "hired" | "rejected";
  created_at: string;
  full_name?: string;
  phone?: string;
  email?: string;
  /** Trust & Safety */
  kyc_level?: string | null;
  verified_badge?: string | null;
  completed_jobs_count?: number;
  /** Talent Preview */
  rating?: number;
  skills?: Array<{ category?: string; name?: string }>;
  quotation?: AdvanceQuotationSnapshot | null;
  quote_status?: string | null;
  quotation_expired?: boolean;
  score_badges?: QuotationScoreBadge[];
  trust_score?: number;
}

export interface AdvanceJobMessageAPI {
  id: string;
  job_id: string;
  sender_id: string;
  sender_name?: string;
  body: string;
  created_at: string;
  read_at?: string | null; // เมื่อผู้รับอ่านแล้ว (สำหรับข้อความที่เราส่ง)
}

// ============ Milestone (จ่ายเป็นงวด) ============
export interface AdvanceMilestoneAPI {
  id: string;
  job_id: string;
  order: number;
  amount: number;
  status: "pending" | "released";
  released_at?: string | null;
  created_at: string;
  /** ค่าคอมที่หักเมื่อปล่อยงวด (สำหรับใบเสร็จ) */
  commission_deducted?: number;
  /** เงินสุทธิที่ Talent ได้รับ */
  net_amount?: number;
}

// ============ Advance Job Review (Talent ให้ดาวนายจ้าง) ============
export interface AdvanceJobReviewAPI {
  id: string;
  job_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  comment: string;
  created_at: string;
}
