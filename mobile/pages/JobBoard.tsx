import React, { useEffect, useState, useCallback, useRef } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { Briefcase, DollarSign, Clock, Sparkles, Users, Lock, Crown, Search, Eye, Bookmark, RefreshCw, WifiOff, FileText, Send, Inbox, ChevronRight } from "lucide-react";
import {
  listAdvanceJobs,
  getSavedAdvanceJobIds,
  getSavedAdvanceJobs,
  getMyAdvanceJobs,
  getMyAdvanceJobApplications,
  saveAdvanceJob,
  unsaveAdvanceJob,
  JobServiceError,
} from "../services/jobService";
import type { JobAdvanceAPI, MyJobAdvanceAPI, MyJobAdvanceApplicationAPI } from "../types/api";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { useLanguage } from "../context/LanguageContext";
import { gradeService, type GradeData, GRADE_REQUIREMENTS } from "../services/gradeService";
import { isReviewerMode, getMockJobsForReview } from "../services/mockJobsForReview";
import { PreLaunchServiceBlock } from "../components/PreLaunchServiceBlock";
import { useMobileAppConfig } from "../context/MobileAppConfigContext";

/** งานราคาดี: Aura สีทอง/ม่วง (ราคาสูง >= 15000) */
const PREMIUM_PRICE_THRESHOLD = 15000;

const CATEGORIES = [
  "Design & Creative",
  "Writing & Translation",
  "Video & Animation",
  "Programming & Tech",
  "Marketing",
  "Admin & Support",
  "Other",
];

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

/** Empty State — icon, message, CTA */
function EmptyState({
  icon: Icon,
  title,
  message,
  ctaLabel,
  ctaHref,
  dataTour,
}: {
  icon: React.ElementType;
  title: string;
  message: string;
  ctaLabel: string;
  ctaHref: string;
  dataTour?: string;
}) {
  const { config } = useMobileAppConfig();
  const { notify } = useNotification();
  const jobPostingCta = /\/create-job/.test(ctaHref);
  const postingBlocked = jobPostingCta && !config.featureFlags.enableJobPosting;
  return (
    <div className="luxury-card rounded-2xl p-12 text-center max-w-lg mx-auto">
      <div className="w-20 h-20 mx-auto rounded-full bg-slate-700/50 flex items-center justify-center mb-6">
        <Icon size={40} className="text-slate-500" />
      </div>
      <h3 className="text-lg font-bold text-slate-100 mb-2">{title}</h3>
      <p className="text-slate-400 text-sm mb-6">{message}</p>
      {postingBlocked ? (
        <button
          type="button"
          data-tour={dataTour}
          onClick={() => notify("การโพสต์งานถูกปิดชั่วคราวโดยผู้ดูแลระบบ", "warning")}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium bg-slate-600 text-slate-300 cursor-not-allowed opacity-90"
        >
          <Briefcase size={20} />
          {ctaLabel}
        </button>
      ) : (
        <Link
          to={ctaHref}
          data-tour={dataTour}
          className="inline-flex items-center gap-2 btn-gold-black px-6 py-3 rounded-xl font-medium hover:opacity-90 transition-opacity"
        >
          <Briefcase size={20} />
          {ctaLabel}
        </Link>
      )}
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
  token?:        string | null;
  onSaveChange?: (jobId: string, saved: boolean) => void;
}

export function JobCard({ job, workerGrade, savedIds, token, onSaveChange }: JobCardProps) {
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
            {job.category}
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
        ) : (
          <p className="text-slate-400 text-sm line-clamp-2 mb-4">{job.description}</p>
        )}

        {/* Stats */}
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5 font-semibold number-wallet-gold text-amber-400">
            <DollarSign size={16} />
            ฿{job.min_budget.toLocaleString()} – ฿{job.max_budget.toLocaleString()}
          </span>
          <span className="flex items-center gap-1.5 text-slate-500">
            <Clock size={14} />
            {job.duration_days} {t("job_board.days")}
          </span>
          {job.applicant_count > 0 && (
            <span className="flex items-center gap-1 text-emerald-400 text-xs font-medium">
              <Users size={14} />
              {t("job_board.interested")} {job.applicant_count}
            </span>
          )}
          {job.view_count != null && job.view_count > 0 && (
            <span className="flex items-center gap-1 text-slate-400 text-xs">
              <Eye size={14} />
              {t("job_board.views")} {job.view_count}
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
  const [filters, setFilters] = useState({
    q: "",
    category: "",
    min_budget: "",
    max_budget: "",
    min_duration: "",
    max_duration: "",
    sort: "newest" as "newest" | "budget_high" | "applicants",
  });

  const subTab = (searchParams.get("tab") as SubTabId) || "all";
  const setSubTab = (tab: SubTabId) => {
    setSearchParams(tab === "all" ? {} : { tab });
  };

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number | undefined> = { status: "all", sort: filters.sort };
      if (filters.q.trim()) params.q = filters.q.trim();
      if (filters.category) params.category = filters.category;
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

  const loadMyJobs = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const list = await getMyAdvanceJobs(token);
      setMyJobs(list);
      setBadgeCounts((p) => ({ ...p, myJobs: list.length }));
    } catch (e) {
      notify(e instanceof JobServiceError ? e.message : "โหลดงานของฉันไม่สำเร็จ", "error");
    } finally {
      setLoading(false);
    }
  }, [token, notify]);

  const loadApplications = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const list = await getMyAdvanceJobApplications(token);
      setApplications(list);
      setBadgeCounts((p) => ({ ...p, applications: list.length }));
    } catch (e) {
      notify(e instanceof JobServiceError ? e.message : "โหลดงานที่สมัครไม่สำเร็จ", "error");
    } finally {
      setLoading(false);
    }
  }, [token, notify]);

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
        const [myJ, apps, ids] = await Promise.all([
          getMyAdvanceJobs(token),
          getMyAdvanceJobApplications(token),
          getSavedAdvanceJobIds(token),
        ]);
        setBadgeCounts({ myJobs: myJ?.length ?? 0, applications: apps?.length ?? 0, saved: ids?.length ?? 0 });
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
    const onVisible = () => {
      if (document.visibilityState === "visible" && subTab === "my-jobs") {
        setRefreshTrigger((k) => k + 1);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [subTab]);

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
      className="space-y-8 pb-12 min-h-screen"
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

          {/* Pill-style Tab Bar with Badge Counts */}
          <div className="flex flex-wrap gap-2 p-1.5 rounded-xl bg-slate-800/50 border border-slate-600/50 w-fit">
            {SUB_TABS.map((tab) => {
              const count =
                tab.id === "all" ? jobs.length
                : tab.id === "my-jobs" ? (subTab === "my-jobs" ? myJobs.length : badgeCounts.myJobs)
                : tab.id === "my-applications" ? (subTab === "my-applications" ? applications.length : badgeCounts.applications)
                : tab.id === "saved" ? (subTab === "saved" ? savedJobs.length : badgeCounts.saved)
                : 0;
              const isActive = subTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSubTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? "bg-blue-600 text-white shadow-md"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
                  }`}
                >
                  {t(tab.labelKey)}
                  {count > 0 && (
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
      <div className="luxury-card rounded-2xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder={t("job_board.search_placeholder")}
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && loadJobs()}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-charcoal-800 border border-slate-600 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-gold/30 outline-none"
            />
          </div>
          <select
            value={filters.category}
            onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
            className="px-4 py-2.5 rounded-xl bg-charcoal-800 border border-slate-600 text-slate-100 focus:ring-2 focus:ring-gold/30 outline-none min-w-[160px]"
          >
            <option value="">{t("job_board.all_categories")}</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={filters.sort}
            onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as typeof filters.sort }))}
            className="px-4 py-2.5 rounded-xl bg-charcoal-800 border border-slate-600 text-slate-100 focus:ring-2 focus:ring-gold/30 outline-none min-w-[140px]"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
            ))}
          </select>
          <button
            onClick={loadJobs}
            className="btn-gold-black px-5 py-2.5 rounded-xl font-medium shrink-0"
          >
            {t("job_board.search_btn")}
          </button>
          <button
            onClick={handlePullRefresh}
            disabled={loading}
            className="p-2.5 rounded-xl bg-charcoal-800 border border-slate-600 text-slate-300 hover:bg-slate-700 disabled:opacity-50"
            title={t("job_board.refresh")}
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <span className="text-slate-400 text-sm">{t("job_board.budget_label")}:</span>
          <input
            type="number"
            placeholder={t("job_board.min_budget")}
            value={filters.min_budget}
            onChange={(e) => setFilters((f) => ({ ...f, min_budget: e.target.value }))}
            className="w-24 px-3 py-1.5 rounded-lg bg-charcoal-800 border border-slate-600 text-slate-100 text-sm placeholder-slate-500"
          />
          <span className="text-slate-500">–</span>
          <input
            type="number"
            placeholder={t("job_board.max_budget")}
            value={filters.max_budget}
            onChange={(e) => setFilters((f) => ({ ...f, max_budget: e.target.value }))}
            className="w-24 px-3 py-1.5 rounded-lg bg-charcoal-800 border border-slate-600 text-slate-100 text-sm placeholder-slate-500"
          />
          <span className="text-slate-400 text-sm ml-2">{t("job_board.duration_label")}:</span>
          <input
            type="number"
            placeholder={t("job_board.min_days")}
            value={filters.min_duration}
            onChange={(e) => setFilters((f) => ({ ...f, min_duration: e.target.value }))}
            className="w-20 px-3 py-1.5 rounded-lg bg-charcoal-800 border border-slate-600 text-slate-100 text-sm placeholder-slate-500"
          />
          <span className="text-slate-500">–</span>
          <input
            type="number"
            placeholder={t("job_board.max_days")}
            value={filters.max_duration}
            onChange={(e) => setFilters((f) => ({ ...f, max_duration: e.target.value }))}
            className="w-20 px-3 py-1.5 rounded-lg bg-charcoal-800 border border-slate-600 text-slate-100 text-sm placeholder-slate-500"
          />
        </div>
      </div>
      )}

      {loading ? (
        <div className="luxury-card rounded-2xl p-12 text-center">
          <div className="inline-block w-8 h-8 border-2 border-amber-400/50 border-t-amber-400 rounded-full animate-spin mb-4" />
          <p className="text-slate-400">{t("job_board.loading")}</p>
        </div>
      ) : subTab === "my-jobs" ? (
        myJobs.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={t("job_board.empty_my_jobs")}
            message={t("job_board.empty_my_jobs_msg")}
            ctaLabel={t("job_board.post_job_now")}
            ctaHref="/create-job-advance"
            dataTour="job-board-post"
          />
        ) : (
          <div className="space-y-4">
            {myJobs.map((job) => (
              <Link
                key={job.id}
                to={`/job-board/${job.id}/manage`}
                className="luxury-card rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 hover:border-gold/20 transition-colors block"
              >
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-100 text-lg truncate">{job.title}</h3>
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-slate-400">
                    <span className="px-2 py-0.5 rounded-lg bg-slate-700/50">{job.status}</span>
                    <span className="flex items-center gap-1"><Users size={14} /> {job.applicant_count} {t("job_board.interested")}</span>
                    {job.hired_user_id && <span className="text-emerald-400">จ้างแล้ว</span>}
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-sm">
                    <span className="number-wallet-gold text-amber-400">
                      ฿{job.min_budget?.toLocaleString()} – ฿{job.max_budget?.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1 text-slate-500"><Clock size={14} /> {job.duration_days} {t("job_board.days")}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-amber-400 font-medium shrink-0">จัดการ <ChevronRight size={18} /></div>
              </Link>
            ))}
          </div>
        )
      ) : subTab === "my-applications" ? (
        applications.length === 0 ? (
          <EmptyState
            icon={Send}
            title={t("job_board.empty_applications")}
            message={t("job_board.empty_applications_msg")}
            ctaLabel={t("job_board.browse_jobs")}
            ctaHref="/job-board"
          />
        ) : (
          <div className="space-y-4">
            {applications.map((app) => (
              <Link
                key={app.id}
                to={app.status === "hired" ? `/job-board/${app.job_id}/manage` : `/job-board/${app.job_id}`}
                className="luxury-card rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 hover:border-gold/20 transition-colors block"
              >
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-100 text-lg truncate">{app.title}</h3>
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-slate-400">
                    <span className={`px-2 py-0.5 rounded-lg ${app.status === "hired" ? "bg-emerald-500/20 text-emerald-400" : app.status === "shortlisted" ? "bg-amber-500/20 text-amber-400" : "bg-slate-700/50"}`}>
                      {app.status}
                    </span>
                    <span className="text-amber-400">฿{app.min_budget?.toLocaleString()} – ฿{app.max_budget?.toLocaleString()}</span>
                    <span className="text-slate-500">{app.employer_name}</span>
                  </div>
                </div>
                <ChevronRight size={18} className="text-amber-400 shrink-0" />
              </Link>
            ))}
          </div>
        )
      ) : subTab === "saved" ? (
        savedJobs.length === 0 ? (
          <EmptyState
            icon={Bookmark}
            title={t("job_board.empty_saved")}
            message={t("job_board.empty_saved_msg")}
            ctaLabel={t("job_board.browse_jobs")}
            ctaHref="/job-board"
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {savedJobs.map((job) => (
              <JobCard
                key={job.id}
                job={job as any}
                workerGrade={workerGrade}
                savedIds={savedIds}
                token={token}
                onSaveChange={handleSaveChange}
              />
            ))}
          </div>
        )
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={t("job_board.no_jobs")}
          message={t("job_board.empty_all_msg")}
          ctaLabel={t("job_board.post_first")}
          ctaHref="/create-job-advance"
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
              token={token}
              onSaveChange={handleSaveChange}
            />
          ))}
        </div>
      )}
      </div>
    </div>
  );
};
