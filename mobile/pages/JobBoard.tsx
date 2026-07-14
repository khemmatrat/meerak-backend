import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useSearchParams, useNavigate } from "react-router-dom";
import { Briefcase, Clock, Sparkles, Users, Lock, Crown, Search, Eye, Bookmark, RefreshCw, WifiOff, FileText, Send, Inbox, ChevronRight, SlidersHorizontal, X, MapPin, Banknote } from "lucide-react";
import {
  listAdvanceJobs,
  getSavedAdvanceJobIds,
  getSavedAdvanceJobs,
  getMyAdvanceJobs,
  getMyAdvanceJobApplications,
  getJobBoardBadges,
  getUnreadAdvanceJobMap,
  saveAdvanceJob,
  unsaveAdvanceJob,
  JobServiceError,
} from "../services/jobService";
import type { JobAdvanceAPI, MyJobAdvanceAPI, MyJobAdvanceApplicationAPI, JobBoardBadgesAPI } from "../types/api";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { useLanguage } from "../context/LanguageContext";
import { gradeService, type GradeData, GRADE_REQUIREMENTS } from "../services/gradeService";
import { isReviewerMode, getMockJobsForReview } from "../services/mockJobsForReview";
import { PreLaunchServiceBlock } from "../components/PreLaunchServiceBlock";
import { ApplicationTimeline } from "../components/ApplicationTimeline";
import { JobBoardEmptyState } from "../components/JobBoardEmptyState";
import {
  getUserPreferredProvinces,
  getRoutingPreferredCategories,
  scoreAdvanceSmartMatchJobs,
  suggestCategoryFromHistory,
} from "../utils/jobBoardSmartMatch";
import { resolveJobBoardCopy } from "../utils/jobBoardCopy";
import { useMobileAppConfig } from "../context/MobileAppConfigContext";
import { Link as RouterLink } from "react-router-dom";
import { JobBoardActionSheet } from "../components/JobBoardActionSheet";
import {
  buildEmployerActionItems,
  buildTalentActionItems,
} from "../utils/jobBoardActionItems";
import { trackAdvanceEvent, advanceJobEventMeta } from "../utils/analytics";
import {
  EMPLOYMENT_TYPE_OPTIONS,
  JOBBOARD_CATEGORY_GROUPS,
  THAI_PROVINCES,
  getEmploymentTypeLabel,
  getJobboardCategoryLabel,
  getJobboardGroupLabel,
} from "../constants/workTaxonomy";

/** งานราคาดี: Aura สีทอง/ม่วง (ราคาสูง >= 15000) */
const PREMIUM_PRICE_THRESHOLD = 15000;

const SORT_OPTIONS = [
  { value: "newest", labelKey: "job_board.sort_newest" },
  { value: "budget_high", labelKey: "job_board.sort_budget_high" },
  { value: "applicants", labelKey: "job_board.sort_applicants" },
] as const;

const SUB_TABS = [
  { id: "all" as const, labelKey: "job_board.tab_all_jobs" },
  { id: "my-jobs" as const, labelKey: "job_board.my_jobs" },
  { id: "my-applications" as const, labelKey: "job_board.my_applications" },
  { id: "saved" as const, labelKey: "job_board.saved_jobs" },
];

const STATUS_LABEL_TH: Record<string, string> = {
  open: "เปิดรับ",
  pending: "รอดำเนินการ",
  closed: "ปิดรับ",
  completed: "เสร็จสิ้น",
  interested: "สนใจ",
  shortlisted: "คัดเลือกแล้ว",
  hired: "จ้างแล้ว",
  rejected: "ปฏิเสธ",
};

function getStatusLabelTh(status: string): string {
  return STATUS_LABEL_TH[String(status || "").toLowerCase()] || status;
}

function formatBoardBadgeTitle(b: JobBoardBadgesAPI): string | undefined {
  const parts: string[] = [];
  if (b.unread_messages > 0) parts.push(`ข้อความใหม่ ${b.unread_messages}`);
  if (b.pending_escrow > 0) parts.push(`รอโอนเงิน ${b.pending_escrow}`);
  if (b.pending_review > 0) parts.push(`รอให้คะแนน ${b.pending_review}`);
  return parts.length ? parts.join(" · ") : undefined;
}

type JobFilters = {
  q: string;
  category: string;
  target_province: string;
  employment_type: string;
  min_budget: string;
  max_budget: string;
  min_duration: string;
  max_duration: string;
  sort: "newest" | "budget_high" | "applicants";
};

function buildFilterChips(
  filters: JobFilters,
  setFilters: React.Dispatch<React.SetStateAction<JobFilters>>,
): { key: string; label: string; onRemove: () => void }[] {
  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  if (filters.q.trim()) {
    chips.push({
      key: "q",
      label: `ค้นหา: ${filters.q.trim().slice(0, 24)}${filters.q.trim().length > 24 ? "…" : ""}`,
      onRemove: () => setFilters((f) => ({ ...f, q: "" })),
    });
  }
  if (filters.category) {
    chips.push({
      key: "category",
      label: getJobboardCategoryLabel(filters.category),
      onRemove: () => setFilters((f) => ({ ...f, category: "" })),
    });
  }
  if (filters.target_province) {
    chips.push({
      key: "province",
      label: filters.target_province,
      onRemove: () => setFilters((f) => ({ ...f, target_province: "" })),
    });
  }
  if (filters.employment_type) {
    chips.push({
      key: "employment",
      label: getEmploymentTypeLabel(filters.employment_type),
      onRemove: () => setFilters((f) => ({ ...f, employment_type: "" })),
    });
  }
  if (filters.min_budget || filters.max_budget) {
    const min = filters.min_budget ? `฿${Number(filters.min_budget).toLocaleString()}` : "";
    const max = filters.max_budget ? `฿${Number(filters.max_budget).toLocaleString()}` : "";
    chips.push({
      key: "budget",
      label: min && max ? `งบ ${min}–${max}` : min ? `งบ ${min}+` : `งบ ≤${max}`,
      onRemove: () => setFilters((f) => ({ ...f, min_budget: "", max_budget: "" })),
    });
  }
  if (filters.min_duration || filters.max_duration) {
    const min = filters.min_duration || "";
    const max = filters.max_duration || "";
    chips.push({
      key: "duration",
      label: min && max ? `${min}–${max} วัน` : min ? `${min}+ วัน` : `≤${max} วัน`,
      onRemove: () => setFilters((f) => ({ ...f, min_duration: "", max_duration: "" })),
    });
  }
  if (filters.sort !== "newest") {
    const sortLabel = SORT_OPTIONS.find((o) => o.value === filters.sort);
    chips.push({
      key: "sort",
      label: sortLabel ? sortLabel.value === "budget_high" ? "งบสูงสุด" : "ผู้สนใจมาก" : filters.sort,
      onRemove: () => setFilters((f) => ({ ...f, sort: "newest" })),
    });
  }
  return chips;
}

const EMPTY_FILTERS: JobFilters = {
  q: "",
  category: "",
  target_province: "",
  employment_type: "",
  min_budget: "",
  max_budget: "",
  min_duration: "",
  max_duration: "",
  sort: "newest",
};

function JobFilterSheet({
  open,
  onClose,
  filters,
  setFilters,
  onApply,
  t,
}: {
  open: boolean;
  onClose: () => void;
  filters: JobFilters;
  setFilters: React.Dispatch<React.SetStateAction<JobFilters>>;
  onApply: () => void;
  t: (k: string) => string;
}) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div className="jb-bottom-sheet-backdrop" onClick={onClose} aria-hidden />
      <div
        className="jb-bottom-sheet jb-bottom-sheet--nav-safe"
        role="dialog"
        aria-modal="true"
        aria-label="ตัวกรองงาน"
      >
        <div className="jb-bottom-sheet-handle" />
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">ตัวกรองงาน</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100"
            aria-label="ปิด"
          >
            <X size={20} className="text-slate-500" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">
              {t("job_board.all_categories")}
            </label>
            <select
              value={filters.category}
              onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
              className="jb-sheet-input"
            >
              <option value="">{t("job_board.all_categories")}</option>
              {JOBBOARD_CATEGORY_GROUPS.map((g) => (
                <optgroup key={g.group} label={getJobboardGroupLabel(g.group)}>
                  {g.categories.map((c) => (
                    <option key={c} value={c}>
                      {getJobboardCategoryLabel(c)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">จังหวัด</label>
              <select
                value={filters.target_province}
                onChange={(e) => setFilters((f) => ({ ...f, target_province: e.target.value }))}
                className="jb-sheet-input text-sm"
              >
                <option value="">ทุกจังหวัด</option>
                {THAI_PROVINCES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">ลักษณะจ้าง</label>
              <select
                value={filters.employment_type}
                onChange={(e) => setFilters((f) => ({ ...f, employment_type: e.target.value }))}
                className="jb-sheet-input text-sm"
              >
                <option value="">ทุกประเภท</option>
                {EMPLOYMENT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">{t("job_board.budget_label")}</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                placeholder={t("job_board.min_budget")}
                value={filters.min_budget}
                onChange={(e) => setFilters((f) => ({ ...f, min_budget: e.target.value }))}
                className="jb-sheet-input flex-1 text-sm"
              />
              <span className="text-slate-400 shrink-0">–</span>
              <input
                type="number"
                placeholder={t("job_board.max_budget")}
                value={filters.max_budget}
                onChange={(e) => setFilters((f) => ({ ...f, max_budget: e.target.value }))}
                className="jb-sheet-input flex-1 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">{t("job_board.duration_label")}</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                placeholder={t("job_board.min_days")}
                value={filters.min_duration}
                onChange={(e) => setFilters((f) => ({ ...f, min_duration: e.target.value }))}
                className="jb-sheet-input flex-1 text-sm"
              />
              <span className="text-slate-400 shrink-0">–</span>
              <input
                type="number"
                placeholder={t("job_board.max_days")}
                value={filters.max_duration}
                onChange={(e) => setFilters((f) => ({ ...f, max_duration: e.target.value }))}
                className="jb-sheet-input flex-1 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">เรียงตาม</label>
            <select
              value={filters.sort}
              onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as JobFilters["sort"] }))}
              className="jb-sheet-input"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setFilters((f) => ({ ...EMPTY_FILTERS, q: f.q }))}
              className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-700 font-medium hover:bg-slate-50"
            >
              ล้างตัวกรอง
            </button>
            <button
              type="button"
              onClick={() => {
                onApply();
                onClose();
              }}
              className="flex-[2] py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-500"
            >
              {t("job_board.search_btn")}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

function JobBoardSkeleton({ variant = "grid" }: { variant?: "grid" | "list" | "saved" }) {
  if (variant === "saved") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="jb-skeleton-card luxury-card space-y-3 relative">
            <Bookmark size={16} className="absolute top-4 right-4 text-slate-300/80" />
            <div className="h-4 w-24 rounded bg-slate-200/80" />
            <div className="h-5 w-full rounded bg-slate-200/80" />
            <div className="h-4 w-3/4 rounded bg-slate-200/60" />
          </div>
        ))}
      </div>
    );
  }
  if (variant === "list") {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="jb-skeleton-card luxury-card rounded-2xl p-5 space-y-3">
            <div className="h-5 w-2/3 rounded bg-slate-200/80" />
            <div className="flex gap-2">
              <div className="h-6 w-16 rounded-lg bg-slate-200/60" />
              <div className="h-6 w-24 rounded-lg bg-slate-200/60" />
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="h-14 rounded-xl bg-slate-200/50" />
              <div className="h-14 rounded-xl bg-slate-200/50" />
              <div className="h-14 rounded-xl bg-slate-200/50" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="jb-skeleton-card luxury-card space-y-3">
          <div className="h-4 w-24 rounded bg-slate-200/80" />
          <div className="h-5 w-full rounded bg-slate-200/80" />
          <div className="h-4 w-3/4 rounded bg-slate-200/60" />
        </div>
      ))}
    </div>
  );
}

function getEmployerJobNextAction(job: MyJobAdvanceAPI): {
  tab: "applicants" | "escrow" | "scope" | "review";
  label: string;
} {
  if (job.status === "completed") {
    return { tab: "review", label: "ให้คะแนน" };
  }
  if (job.work_submission_status === "submitted") {
    return { tab: "escrow", label: "ตรวจงาน" };
  }
  if (job.hired_user_id) {
    const escrow = job.escrow_status || "none";
    if (escrow !== "held" && escrow !== "released") {
      return { tab: "escrow", label: "โอนเงินค้ำ" };
    }
    return { tab: "escrow", label: "รอส่งงาน" };
  }
  if ((job.applicant_count ?? 0) > 0) {
    return { tab: "applicants", label: "เลือกผู้รับจ้าง" };
  }
  return { tab: "applicants", label: "รอผู้สนใจ" };
}

function EmployerJobDashboardCard({ job }: { job: MyJobAdvanceAPI }) {
  const navigate = useNavigate();
  const action = getEmployerJobNextAction(job);
  const manageUrl = `/job-board/${job.id}/manage?tab=${action.tab}`;
  const unread = (job as any).unread_messages as number | undefined;
  const cardBadges: { label: string; href: string }[] = [];
  if (unread && unread > 0) {
    cardBadges.push({
      label: `มีแชทใหม่ ${unread > 9 ? "9+" : unread}`,
      href: `/job-board/${job.id}/manage?tab=chat`,
    });
  }
  if (job.hired_user_id && job.escrow_status !== "held" && job.escrow_status !== "released") {
    cardBadges.push({ label: "รอโอนเงินค้ำ", href: `/job-board/${job.id}/manage?tab=escrow` });
  }
  if (job.review_pending) {
    cardBadges.push({ label: "รอให้คะแนน", href: `/job-board/${job.id}/manage?tab=review` });
  }

  const handleNavigate = () => navigate(manageUrl);
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleNavigate();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleNavigate}
      onKeyDown={handleKeyDown}
      className="luxury-card rounded-2xl p-5 block hover:border-blue-500/30 transition-colors cursor-pointer"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <h3 className="font-bold text-slate-100 text-lg line-clamp-2 flex-1">{job.title}</h3>
        <span className="shrink-0 px-2.5 py-1 rounded-lg bg-blue-600/20 text-blue-300 text-xs font-semibold">
          {action.label}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="text-center p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
          <p className="text-2xl font-bold text-slate-100">{job.view_count ?? 0}</p>
          <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wide">ผู้เข้าชม</p>
        </div>
        <div className="text-center p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
          <p className="text-2xl font-bold text-emerald-400">{job.applicant_count ?? 0}</p>
          <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wide">ผู้สนใจ</p>
        </div>
        <div className="text-center p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <p className="text-sm font-bold text-blue-300 leading-tight">{action.label}</p>
          <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wide">ต้องทำ</p>
        </div>
      </div>
      {cardBadges.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {cardBadges.slice(0, 2).map((b) => (
            <RouterLink
              key={b.label}
              to={b.href}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25"
            >
              {b.label}
            </RouterLink>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span className="px-2 py-0.5 rounded-lg bg-slate-700/50 text-slate-300 text-xs">
          {getStatusLabelTh(job.status)}
        </span>
        <span className="flex items-center gap-1 text-blue-400 font-medium">
          จัดการ <ChevronRight size={16} />
        </span>
      </div>
    </div>
  );
}

// shimmer css (inject ครั้งเดียว)
const vvipShimmerStyle = `
@keyframes vvip-shimmer {
  0%   { background-position: -200% center; }
  100% { background-position:  200% center; }
}
.vvip-card-shimmer { background-size: 200% auto; animation: vvip-shimmer 3s linear infinite; }
`;

interface JobCardProps {
  job:           JobAdvanceAPI & { is_vvip?: boolean; min_grade?: string };
  workerGrade?:  GradeData | null;
  savedIds?:     Set<string>;
  appliedIds?:   Set<string>;
  token?:        string | null;
  onSaveChange?: (jobId: string, saved: boolean) => void;
}

export function JobCard({ job, workerGrade, savedIds, appliedIds, token, onSaveChange }: JobCardProps) {
  const { t } = useLanguage();
  const isPremium  = job.max_budget >= PREMIUM_PRICE_THRESHOLD || job.min_budget >= PREMIUM_PRICE_THRESHOLD;
  const isVvip     = !!job.is_vvip;
  // ถ้า job ต้อง Grade A แต่ worker ไม่ถึง → locked
  const requiredGrade = (job.min_grade as 'A' | 'B' | 'C' | undefined) ?? 'C';
  const gradeOrder    = { C: 0, B: 1, A: 2 };
  const workerGradeLv = gradeOrder[workerGrade?.grade ?? 'C'];
  const requiredLv    = gradeOrder[requiredGrade];
  const isLocked      = isVvip && workerGradeLv < requiredLv;

  const cardClass = [
    "rounded-2xl p-5 transition-all relative overflow-hidden",
    isVvip
      ? "border border-amber-500/40"
      : isPremium
      ? "luxury-card hover:border-amber-400/40 job-board-card-premium"
      : "luxury-card hover:border-gold/20",
    isLocked ? "opacity-75 cursor-not-allowed" : "cursor-pointer",
  ].join(" ");

  const isSaved = savedIds?.has(String(job.id)) ?? false;
  const handleSaveClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!token || !onSaveChange) return;
    try {
      if (isSaved) {
        await unsaveAdvanceJob(job.id, token);
        onSaveChange(job.id, false);
      } else {
        await saveAdvanceJob(job.id, token);
        onSaveChange(job.id, true);
      }
    } catch (_) {}
  };

  const cardContent = (
    <div className={cardClass}>
      {/* VVIP background glow */}
      {isVvip && (
        <>
          <style>{vvipShimmerStyle}</style>
          <div
            className="absolute inset-0 pointer-events-none rounded-2xl"
            style={{
              background: "linear-gradient(135deg, rgba(212,175,55,0.15) 0%, rgba(120,53,15,0.1) 50%, rgba(212,175,55,0.15) 100%)",
              boxShadow:  "inset 0 0 80px rgba(212,175,55,0.1), 0 0 40px rgba(212,175,55,0.08)",
            }}
          />
        </>
      )}
      {isPremium && !isVvip && (
        <div
          className="absolute inset-0 pointer-events-none rounded-2xl opacity-60"
          style={{
            background: "linear-gradient(135deg, rgba(212,175,55,0.12) 0%, rgba(157,80,187,0.12) 100%)",
            boxShadow:  "inset 0 0 60px rgba(212,175,55,0.08), 0 0 40px rgba(157,80,187,0.1)",
          }}
        />
      )}

      <div className="relative z-10">
        {/* Top row: category + badges + save */}
        <div className="flex justify-between items-start gap-2 mb-3 flex-wrap">
          <span className="px-3 py-1 rounded-xl bg-slate-700/50 text-slate-300 text-xs font-medium">
            {getJobboardCategoryLabel(job.category)}
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {token && (
              <button
                type="button"
                onClick={handleSaveClick}
                className={`p-1.5 rounded-lg shrink-0 ${isSaved ? "text-amber-400" : "text-slate-500 hover:text-amber-400"}`}
                title={isSaved ? t("job_board.unsave") : t("job_board.save")}
              >
                <Bookmark size={18} className={isSaved ? "fill-current" : ""} />
              </button>
            )}
            {(() => {
              const created = new Date(job.created_at).getTime();
              const isNew = Date.now() - created < 24 * 60 * 60 * 1000;
              return isNew ? (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/80 text-white text-[10px] font-bold">
                  {t("job_board.new_badge")}
                </span>
              ) : null;
            })()}
            {isVvip && (
              <span
                className="vvip-card-shimmer flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black tracking-wide"
                style={{
                  background:  "linear-gradient(135deg,#D4AF37,#F5E27D,#B8860B)",
                  color:       "#1a1200",
                  boxShadow:   "0 0 10px rgba(212,175,55,0.5)",
                }}
              >
                <Crown size={10} />
                VVIP
              </span>
            )}
            {isPremium && !isVvip && (
              <span className="flex items-center gap-1 text-amber-400 text-xs font-bold">
                <Sparkles size={12} /> {t("job_board.premium_badge")}
              </span>
            )}
          </div>
        </div>

        {/* Title */}
        <h3 className="font-bold text-slate-100 text-lg line-clamp-2 mb-2">{job.title}</h3>

        {/* Status chips */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          {appliedIds?.has(String(job.id)) && (
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold">
              สมัครแล้ว
            </span>
          )}
          {isSaved && (
            <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 text-[10px] font-semibold">
              บันทึกแล้ว
            </span>
          )}
        </div>

        {/* Locked overlay info */}
        {isLocked ? (
          <div className="flex items-start gap-2 bg-slate-800/80 border border-amber-500/20 rounded-xl p-3 mb-3">
            <Lock size={16} className="text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-amber-300 text-xs font-semibold">
                {t("job_board.grade_required").replace("{grade}", requiredGrade)}
              </p>
              <p className="text-slate-400 text-[11px] mt-0.5">
                {requiredGrade === 'A'
                  ? `ต้องการ: คะแนน ≥ ${GRADE_REQUIREMENTS.A.avg_rating}, ใบเซอร์ > ${GRADE_REQUIREMENTS.A.cert_count - 1} ใบ, สำเร็จ ≥ ${GRADE_REQUIREMENTS.A.success_rate}%`
                  : `ต้องการ: คะแนน ≥ ${GRADE_REQUIREMENTS.B.avg_rating}, ใบเซอร์ ≥ ${GRADE_REQUIREMENTS.B.cert_count} ใบ`}
              </p>
            </div>
          </div>
        ) : null}

        {/* Scannable chip row */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] mt-2">
          <span className="jb-job-meta-chip">
            <Banknote size={11} />
            ฿{job.min_budget.toLocaleString()}–{job.max_budget.toLocaleString()}
          </span>
          <span className="jb-job-meta-chip">
            <Clock size={11} />
            {job.duration_days} {t("job_board.days")}
          </span>
          {(job as any).target_province ? (
            <span className="jb-job-meta-chip">
              <MapPin size={11} />
              {(job as any).target_province}
            </span>
          ) : null}
          {(job as any).employment_type ? (
            <span className="jb-job-meta-chip">
              {getEmploymentTypeLabel(String((job as any).employment_type))}
            </span>
          ) : null}
          {job.applicant_count > 0 && (
            <span className="jb-job-meta-chip jb-job-meta-chip--accent">
              <Users size={11} />
              {job.applicant_count}
            </span>
          )}
        </div>
      </div>
    </div>
  );

  // ถ้า locked ไม่ให้ navigate
  if (isLocked) return <div>{cardContent}</div>;
  return <Link to={`/job-board/${String(job.id)}`} className="block">{cardContent}</Link>;
}

type SubTabId = "all" | "my-jobs" | "my-applications" | "saved";

export const JobBoard: React.FC = () => {
  const { token, user } = useAuth();
  const { notify } = useNotification();
  const { t } = useLanguage();
  const { config } = useMobileAppConfig();
  const jobBoardCopy = useMemo(
    () => resolveJobBoardCopy(config.remote),
    [config.remote],
  );
  const profileProvinces = useMemo(
    () =>
      getUserPreferredProvinces(
        user,
        config.remote?.jobBoardCopy?.smartMatchProvinces,
      ),
    [user, config.remote?.jobBoardCopy?.smartMatchProvinces],
  );
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [workerGrade, setWorkerGrade] = useState<GradeData | null>(null);
  const [jobs, setJobs] = useState<JobAdvanceAPI[]>([]);
  const [myJobs, setMyJobs] = useState<MyJobAdvanceAPI[]>([]);
  const [applications, setApplications] = useState<MyJobAdvanceApplicationAPI[]>([]);
  const [savedJobs, setSavedJobs] = useState<JobAdvanceAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [badgeCounts, setBadgeCounts] = useState({ myJobs: 0, applications: 0, saved: 0 });
  const [boardBadges, setBoardBadges] = useState<{
    my_jobs: JobBoardBadgesAPI;
    applications: JobBoardBadgesAPI;
  }>({
    my_jobs: { unread_messages: 0, pending_escrow: 0, pending_review: 0, total: 0 },
    applications: { unread_messages: 0, pending_escrow: 0, pending_review: 0, total: 0 },
  });
  const [appliedJobIds, setAppliedJobIds] = useState<Set<string>>(new Set());
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [actionSheet, setActionSheet] = useState<{
    open: boolean;
    title: string;
    side: "my-jobs" | "my-applications";
  }>({ open: false, title: "", side: "my-jobs" });
  const [filters, setFilters] = useState<JobFilters>({
    q: "",
    category: "",
    target_province: "",
    employment_type: "",
    min_budget: "",
    max_budget: "",
    min_duration: "",
    max_duration: "",
    sort: "newest" as "newest" | "budget_high" | "applicants",
  });
  const navigate = useNavigate();

  const filterChips = useMemo(() => buildFilterChips(filters, setFilters), [filters]);
  const activeFilterCount = filterChips.length;
  const myUserId = user?.id ?? (user as { userId?: string })?.userId;

  const employerActionItems = useMemo(
    () => buildEmployerActionItems(myJobs, unreadMap),
    [myJobs, unreadMap],
  );
  const talentActionItems = useMemo(
    () => buildTalentActionItems(applications, myUserId, unreadMap),
    [applications, myUserId, unreadMap],
  );

  const openTabActionSheet = (side: "my-jobs" | "my-applications") => {
    const items = side === "my-jobs" ? employerActionItems : talentActionItems;
    if (items.length === 0) {
      setSubTab(side);
      return;
    }
    if (items.length === 1) {
      navigate(items[0].href);
      setSubTab(side);
      return;
    }
    setActionSheet({
      open: true,
      title: side === "my-jobs" ? "งานของฉัน — ต้องดำเนินการ" : "งานที่สมัคร — ต้องดำเนินการ",
      side,
    });
  };

  useEffect(() => {
    if (!showFilterSheet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showFilterSheet]);

  const routingCategories = useMemo(
    () => getRoutingPreferredCategories(config.remote?.routingWeightOverrides),
    [config.remote?.routingWeightOverrides],
  );

  const subTab = (searchParams.get("tab") as SubTabId) || "all";
  const setSubTab = (tab: SubTabId) => {
    setSearchParams(tab === "all" ? {} : { tab });
  };

  const smartMatchJobs = useMemo(() => {
    if (subTab !== "all" || jobs.length === 0) return [];
    return scoreAdvanceSmartMatchJobs({
      jobs,
      applications,
      savedJobs,
      savedIds,
      appliedJobIds,
      profileProvinces,
      routingCategories,
      filterCategory: filters.category,
      filterProvince: filters.target_province,
      reasonLabels: jobBoardCopy.smartMatchReasonLabels,
    });
  }, [
    subTab,
    jobs,
    applications,
    savedJobs,
    savedIds,
    appliedJobIds,
    profileProvinces,
    routingCategories,
    filters.category,
    filters.target_province,
    jobBoardCopy.smartMatchReasonLabels,
  ]);

  useEffect(() => {
    if (searchParams.get("openFilter") !== "1") return;
    const cat = searchParams.get("category")?.trim() || "";
    if (cat) {
      setFilters((f) => ({ ...f, category: cat }));
    }
    setSubTab("all");
    setShowFilterSheet(true);
    const next = new URLSearchParams(searchParams);
    next.delete("openFilter");
    next.delete("category");
    setSearchParams(next.toString() ? next : {}, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (subTab === "all" && smartMatchJobs.length > 0) {
      trackAdvanceEvent(
        "advance_smart_match_impression",
        { count: smartMatchJobs.length },
        jobBoardCopy,
      );
    }
  }, [subTab, smartMatchJobs.length, jobBoardCopy]);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number | undefined> = { status: "all", sort: filters.sort };
      if (filters.q.trim()) params.q = filters.q.trim();
      if (filters.category) params.category = filters.category;
      if (filters.target_province) params.target_province = filters.target_province;
      if (filters.employment_type) params.employment_type = filters.employment_type;
      if (filters.min_budget) params.min_budget = Number(filters.min_budget) || undefined;
      if (filters.max_budget) params.max_budget = Number(filters.max_budget) || undefined;
      if (filters.min_duration) params.min_duration = Number(filters.min_duration) || undefined;
      if (filters.max_duration) params.max_duration = Number(filters.max_duration) || undefined;
      const res = await listAdvanceJobs(params, token);
      let jobsList = res.jobs;
      if (isReviewerMode(user)) {
        const mockJobs = getMockJobsForReview();
        const mockIds = new Set(mockJobs.map((j) => j.id));
        const realJobs = jobsList.filter((j) => !mockIds.has(j.id));
        jobsList = [...mockJobs, ...realJobs];
      }
      setJobs(jobsList);
    } catch (e) {
      if (isReviewerMode(user)) {
        setJobs(getMockJobsForReview());
      } else {
        notify(e instanceof JobServiceError ? e.message : "โหลดรายการงานไม่สำเร็จ", "error");
      }
    } finally {
      setLoading(false);
    }
  }, [token, notify, filters, user]);

  const refreshBoardBadges = useCallback(async () => {
    if (!token) return;
    try {
      const badges = await getJobBoardBadges(token);
      setBoardBadges({
        my_jobs: badges.my_jobs,
        applications: badges.applications,
      });
    } catch (_) {}
  }, [token]);

  const refreshUnreadMap = useCallback(async () => {
    if (!token) return;
    try {
      const m = await getUnreadAdvanceJobMap(token);
      setUnreadMap(m);
    } catch (_) {}
  }, [token]);

  const loadMyJobs = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const list = await getMyAdvanceJobs(token);
      setMyJobs(list);
      setBadgeCounts((p) => ({ ...p, myJobs: list.length }));
      refreshBoardBadges();
      refreshUnreadMap();
    } catch (e) {
      notify(e instanceof JobServiceError ? e.message : "โหลดงานของฉันไม่สำเร็จ", "error");
    } finally {
      setLoading(false);
    }
  }, [token, notify, refreshBoardBadges, refreshUnreadMap]);

  const loadApplications = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const list = await getMyAdvanceJobApplications(token);
      setApplications(list);
      setAppliedJobIds(new Set(list.map((a) => String(a.job_id))));
      setBadgeCounts((p) => ({ ...p, applications: list.length }));
      refreshBoardBadges();
      refreshUnreadMap();
    } catch (e) {
      notify(e instanceof JobServiceError ? e.message : "โหลดงานที่สมัครไม่สำเร็จ", "error");
    } finally {
      setLoading(false);
    }
  }, [token, notify, refreshBoardBadges, refreshUnreadMap]);

  const loadSavedJobs = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [list, ids] = await Promise.all([
        getSavedAdvanceJobs(token),
        getSavedAdvanceJobIds(token),
      ]);
      setSavedJobs(list);
      setSavedIds(new Set(ids));
      setBadgeCounts((p) => ({ ...p, saved: list.length }));
    } catch (e) {
      notify(e instanceof JobServiceError ? e.message : "โหลดงานที่บันทึกไม่สำเร็จ", "error");
    } finally {
      setLoading(false);
    }
  }, [token, notify]);

  useEffect(() => {
    const tab = searchParams.get("tab") as SubTabId | null;
    if (tab === "my-jobs") {
      loadMyJobs();
    } else if (tab === "my-applications") {
      loadApplications();
    } else if (tab === "saved") {
      loadSavedJobs();
    } else {
      const timer = setTimeout(loadJobs, 300);
      return () => clearTimeout(timer);
    }
  }, [subTab, loadJobs, loadMyJobs, loadApplications, loadSavedJobs, refreshTrigger]);

  useEffect(() => {
    if (token) {
      getSavedAdvanceJobIds(token).then((ids) => setSavedIds(new Set(ids)));
    } else {
      setSavedIds(new Set());
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const [myJ, apps, ids, badges] = await Promise.all([
          getMyAdvanceJobs(token),
          getMyAdvanceJobApplications(token),
          getSavedAdvanceJobIds(token),
          getJobBoardBadges(token),
        ]);
        setBadgeCounts({ myJobs: myJ?.length ?? 0, applications: apps?.length ?? 0, saved: ids?.length ?? 0 });
        setAppliedJobIds(new Set((apps || []).map((a) => String(a.job_id))));
        if (badges) {
          setBoardBadges({
            my_jobs: badges.my_jobs,
            applications: badges.applications,
          });
        }
      } catch (_) {}
    })();
  }, [token, refreshTrigger]);

  useEffect(() => {
    const justPosted = (location.state as any)?.justPostedJobId;
    if (justPosted && subTab === "my-jobs") {
      setRefreshTrigger((k) => k + 1);
    }
  }, [location.state, subTab]);

  useEffect(() => {
    if (subTab !== "my-applications") return;
    loadApplications();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") loadApplications();
    }, 25000);
    const onVisible = () => {
      if (document.visibilityState === "visible") loadApplications();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [subTab, loadApplications]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && subTab === "my-jobs") {
        setRefreshTrigger((k) => k + 1);
        refreshUnreadMap();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [subTab, refreshUnreadMap]);

  const handleSaveChange = (jobId: string, saved: boolean) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (saved) next.add(jobId);
      else next.delete(jobId);
      return next;
    });
    if (subTab === "saved" && !saved) {
      setSavedJobs((prev) => prev.filter((j) => j.id !== jobId));
    }
  };

  useEffect(() => {
    if (user?.id) gradeService.getWorkerGrade(user.id).then((g) => setWorkerGrade(g));
  }, [user?.id]);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, []);

  const handlePullRefresh = useCallback(() => {
    if (subTab === "all") loadJobs();
    else if (subTab === "my-jobs") loadMyJobs();
    else if (subTab === "my-applications") loadApplications();
    else if (subTab === "saved") loadSavedJobs();
    if (token) getSavedAdvanceJobIds(token).then((ids) => setSavedIds(new Set(ids)));
  }, [subTab, loadJobs, loadMyJobs, loadApplications, loadSavedJobs, token]);

  const [pullY, setPullY] = useState(0);
  const pullStartY = useRef(0);
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (window.scrollY <= 5) pullStartY.current = e.touches[0].clientY;
  }, []);
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (window.scrollY <= 5 && pullStartY.current > 0) {
      const dy = e.touches[0].clientY - pullStartY.current;
      if (dy > 0) setPullY(Math.min(dy, 80));
    }
  }, []);
  const onTouchEnd = useCallback(() => {
    if (pullY >= 50) handlePullRefresh();
    setPullY(0);
    pullStartY.current = 0;
  }, [pullY, handlePullRefresh]);

  return (
    <div
      className="aqond-trust-theme jobboard-flow-theme space-y-8 pb-12 min-h-screen"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <PreLaunchServiceBlock title="Job Board — รับงาน" />
      {pullY > 0 && (
        <div className="fixed top-0 left-0 right-0 z-50 flex justify-center py-2 bg-charcoal-900/95" style={{ height: Math.min(pullY, 60) }}>
          <div className="flex items-center gap-2 text-amber-400 text-sm">
            <RefreshCw size={20} className={pullY >= 50 ? "animate-spin" : ""} />
            {pullY >= 50 ? t("job_board.release_refresh") : t("job_board.pull_refresh")}
          </div>
        </div>
      )}
      {!isOnline && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 text-sm">
          <WifiOff size={18} />
          {t("job_board.offline_msg")}
        </div>
      )}
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col gap-4">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-50 flex items-center gap-2">
            <Briefcase size={28} className="text-amber-400" />
            {t("job_board.title")}
          </h1>

          {/* Pill-style Tab Bar — scroll แนวนอน ไม่ตกบรรทัด */}
          <div className="jb-tab-scroll flex gap-2 p-1.5 rounded-xl bg-slate-100 border border-slate-200 w-full">
            {SUB_TABS.map((tab) => {
              const count =
                tab.id === "all" ? jobs.length
                : tab.id === "my-jobs" ? (subTab === "my-jobs" ? myJobs.length : badgeCounts.myJobs)
                : tab.id === "my-applications" ? (subTab === "my-applications" ? applications.length : badgeCounts.applications)
                : tab.id === "saved" ? (subTab === "saved" ? savedJobs.length : badgeCounts.saved)
                : 0;
              const actionCount =
                tab.id === "my-jobs" ? boardBadges.my_jobs.total
                : tab.id === "my-applications" ? boardBadges.applications.total
                : 0;
              const actionTitle =
                tab.id === "my-jobs" ? formatBoardBadgeTitle(boardBadges.my_jobs)
                : tab.id === "my-applications" ? formatBoardBadgeTitle(boardBadges.applications)
                : undefined;
              const isActive = subTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSubTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all shrink-0 whitespace-nowrap ${
                    isActive
                      ? "bg-blue-600 text-white shadow-md"
                      : "text-slate-600 hover:text-slate-900 hover:bg-white"
                  }`}
                >
                  {t(tab.labelKey)}
                  {actionCount > 0 && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (tab.id === "my-jobs" || tab.id === "my-applications") {
                          openTabActionSheet(tab.id);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          if (tab.id === "my-jobs" || tab.id === "my-applications") {
                            openTabActionSheet(tab.id);
                          }
                        }
                      }}
                      className={`min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold flex items-center justify-center cursor-pointer ${
                        isActive ? "bg-red-500 text-white" : "bg-red-500/80 text-white"
                      }`}
                      title={actionTitle || "ต้องดำเนินการ — แตะเพื่อเลือกงาน"}
                    >
                      {actionCount > 99 ? "99+" : actionCount}
                    </span>
                  )}
                  {count > 0 && actionCount === 0 && (
                    <span
                      className={`min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold flex items-center justify-center ${
                        isActive ? "bg-blue-500/80 text-white" : "bg-slate-600 text-slate-300"
                      }`}
                    >
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

      {/* Search & Filter — only for All Jobs */}
      {subTab === "all" && (
      <div className="jb-search-toolbar space-y-2.5">
        <div className="flex gap-2 items-stretch">
          <div className="relative flex-1 min-w-0">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="search"
              placeholder={t("job_board.search_placeholder")}
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && loadJobs()}
              className="jb-search-input w-full"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilterSheet(true)}
            className="jb-filter-trigger relative shrink-0"
            aria-label="เปิดตัวกรอง"
          >
            <SlidersHorizontal size={18} />
            <span className="hidden sm:inline text-sm font-medium">ตัวกรอง</span>
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={handlePullRefresh}
            disabled={loading}
            className="jb-filter-trigger shrink-0 !px-3"
            title={t("job_board.refresh")}
            aria-label={t("job_board.refresh")}
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {filterChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {filterChips.map((chip) => (
              <span key={chip.key} className="jb-filter-chip">
                {chip.label}
                <button type="button" onClick={chip.onRemove} aria-label="ลบตัวกรอง">
                  <X size={12} />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => setFilters((f) => ({ ...EMPTY_FILTERS, q: f.q }))}
              className="text-xs text-slate-500 hover:text-blue-600 px-1"
            >
              ล้างตัวกรอง
            </button>
          </div>
        )}

        <JobFilterSheet
          open={showFilterSheet}
          onClose={() => setShowFilterSheet(false)}
          filters={filters}
          setFilters={setFilters}
          onApply={loadJobs}
          t={t}
        />
      </div>
      )}

      {subTab === "all" && smartMatchJobs.length > 0 && !loading && (
        <div className="luxury-card rounded-2xl p-4 space-y-3">
          <h3
            className="text-sm font-bold text-slate-100 flex items-center gap-2"
            title={jobBoardCopy.smartMatchTooltip}
          >
            <Sparkles size={16} className="text-blue-400" />
            {jobBoardCopy.smartMatchTitle}
          </h3>
          <p className="text-[11px] text-slate-500 -mt-1">{jobBoardCopy.smartMatchTooltip}</p>
          <div className="jb-smart-match-strip">
            {smartMatchJobs.map(({ job, reasons }) => (
              <Link
                key={job.id}
                to={`/job-board/${job.id}`}
                onClick={() =>
                  trackAdvanceEvent(
                    "advance_smart_match_click",
                    advanceJobEventMeta(job, { job_id: job.id }),
                    jobBoardCopy,
                  )
                }
                className="shrink-0 w-44 p-3 rounded-xl bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/40 transition-colors"
                title={reasons.join(" · ") || jobBoardCopy.smartMatchTooltip}
              >
                <p className="text-sm font-semibold text-slate-100 line-clamp-2">{job.title}</p>
                <p className="text-xs text-blue-300 mt-1">
                  ฿{job.min_budget.toLocaleString()}–{job.max_budget.toLocaleString()}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">{getJobboardCategoryLabel(job.category)}</p>
                {reasons.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {reasons.slice(0, 2).map((r) => (
                      <span
                        key={r}
                        className="px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-200 text-[10px] font-semibold border border-blue-500/25"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            ))}
        </div>
      </div>
      )}

      {loading ? (
        <JobBoardSkeleton
          variant={
            subTab === "saved"
              ? "saved"
              : subTab === "my-jobs" || subTab === "my-applications"
                ? "list"
                : "grid"
          }
        />
      ) : subTab === "my-jobs" ? (
        myJobs.length === 0 ? (
          <JobBoardEmptyState
            icon={FileText}
            title={t("job_board.empty_my_jobs")}
            bullets={jobBoardCopy.emptyMyJobsBullets}
            ctaLabel={t("job_board.post_job_now")}
            ctaHref="/create-job-advance"
            dataTour="job-board-post"
            analyticsContext="empty_my_jobs"
            experimentCopy={jobBoardCopy}
          />
        ) : (
          <div className="space-y-4">
            {myJobs.map((job) => (
              <EmployerJobDashboardCard
                key={job.id}
                job={{ ...job, unread_messages: unreadMap[String(job.id)] || 0 } as MyJobAdvanceAPI}
              />
            ))}
          </div>
        )
      ) : subTab === "my-applications" ? (
        applications.length === 0 ? (
          <JobBoardEmptyState
            icon={Send}
            title={t("job_board.empty_applications")}
            bullets={jobBoardCopy.emptyApplicationsBullets}
            ctaLabel={t("job_board.browse_jobs")}
            ctaHref="/job-board"
            secondaryCtaLabel="เปิดตัวกรองหมวดงาน"
            analyticsContext="empty_applications"
            experimentCopy={jobBoardCopy}
            onSecondaryClick={() => {
              const suggested = suggestCategoryFromHistory(
                applications,
                savedJobs,
                routingCategories,
              );
              setSubTab("all");
              if (suggested) {
                setFilters((f) => ({ ...f, category: suggested }));
              }
              setShowFilterSheet(true);
            }}
          />
        ) : (
          <div className="space-y-4">
            {applications.map((app) => (
              <Link
                key={app.id}
                to={app.status === "hired" ? `/job-board/${app.job_id}/manage` : `/job-board/${app.job_id}`}
                className="luxury-card rounded-2xl p-5 flex flex-col gap-3 hover:border-gold/20 transition-colors block"
              >
                <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-100 text-lg truncate">{app.title}</h3>
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-slate-400">
                    <span className={`px-2 py-0.5 rounded-lg ${app.status === "hired" ? "bg-emerald-500/20 text-emerald-400" : app.status === "shortlisted" ? "bg-amber-500/20 text-amber-400" : "bg-slate-700/50"}`}>
                        {getStatusLabelTh(app.status)}
                    </span>
                    <span className="text-amber-400">฿{app.min_budget?.toLocaleString()} – ฿{app.max_budget?.toLocaleString()}</span>
                    <span className="text-slate-500">{app.employer_name}</span>
                  </div>
                </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <ChevronRight size={18} className="text-amber-400" />
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      {(() => {
                        const badges: { label: string; href: string }[] = [];
                        const unread = unreadMap[String(app.job_id)] || 0;
                        if (unread > 0) {
                          badges.push({
                            label: `มีแชทใหม่ ${unread > 9 ? "9+" : unread}`,
                            href: `/job-board/${app.job_id}/chat/${myUserId}`,
                          });
                        }
                        const escrowStatus = app.escrow_status || "none";
                        if (app.status === "hired" && escrowStatus !== "held" && escrowStatus !== "released") {
                          badges.push({
                            label: "รอโอนเงินค้ำ",
                            href: `/job-board/${app.job_id}/manage?tab=escrow`,
                          });
                        }
                        if (app.review_pending) {
                          badges.push({
                            label: "รอให้คะแนน",
                            href: `/job-board/${app.job_id}/manage?tab=review`,
                          });
                        }
                        return badges.slice(0, 2).map((b) => (
                          <RouterLink
                            key={b.label}
                            to={b.href}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25"
                          >
                            {b.label}
                          </RouterLink>
                        ));
                      })()}
                    </div>
                  </div>
                </div>
                {app.status !== "rejected" && (
                  <ApplicationTimeline
                    status={app.status}
                    jobStatus={app.job_status}
                    viewedAt={app.viewed_at}
                    compact
                  />
                )}
              </Link>
            ))}
          </div>
        )
      ) : subTab === "saved" ? (
        savedJobs.length === 0 ? (
          <JobBoardEmptyState
            icon={Bookmark}
            title={t("job_board.empty_saved")}
            bullets={jobBoardCopy.emptySavedBullets}
            ctaLabel={t("job_board.browse_jobs")}
            ctaHref="/job-board"
            analyticsContext="empty_saved"
            experimentCopy={jobBoardCopy}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {savedJobs.map((job) => (
              <JobCard
                key={job.id}
                job={job as any}
                workerGrade={workerGrade}
                savedIds={savedIds}
                appliedIds={appliedJobIds}
                token={token}
                onSaveChange={handleSaveChange}
              />
            ))}
          </div>
        )
      ) : jobs.length === 0 ? (
        <JobBoardEmptyState
          icon={Inbox}
          title={t("job_board.no_jobs")}
          bullets={jobBoardCopy.emptyAllBullets}
          ctaLabel={t("job_board.post_first")}
          ctaHref="/create-job-advance"
          secondaryCtaLabel="เปิดตัวกรอง"
          analyticsContext="empty_all_jobs"
          experimentCopy={jobBoardCopy}
          onSecondaryClick={() => setShowFilterSheet(true)}
          dataTour="job-board-post"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6" data-tour="job-board-select">
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job as any}
              workerGrade={workerGrade}
              savedIds={savedIds}
              appliedIds={appliedJobIds}
              token={token}
              onSaveChange={handleSaveChange}
            />
          ))}
        </div>
      )}
      </div>

      <JobBoardActionSheet
        open={actionSheet.open}
        onClose={() => setActionSheet((s) => ({ ...s, open: false }))}
        title={actionSheet.title}
        items={actionSheet.side === "my-jobs" ? employerActionItems : talentActionItems}
      />
    </div>
  );
};
