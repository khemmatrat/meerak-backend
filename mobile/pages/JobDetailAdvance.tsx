import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  User,
  Shield,
  Star,
  FileText,
  Target,
  Send,
  Clock,
  Users,
  MessageCircle,
  Flag,
} from "lucide-react";
import { getAdvanceJobById, applyToJobAdvance, getMyAdvanceJobApplications, recordAdvanceJobView, JobServiceError } from "../services/jobService";
import type { JobAdvanceAPI } from "../types/api";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { useMobileAppConfig } from "../context/MobileAppConfigContext";
import { useLanguage } from "../context/LanguageContext";
import { isMockJobId, getMockJobById } from "../services/mockJobsForReview";

/** คะแนนความน่าเชื่อถือของผู้จ้าง (แสดงใน Sidebar + บนหัวข้อ) */
function EmployerTrustBadge({ score, t }: { score: number; t: (k: string) => string }) {
  const level =
    score >= 80 ? "สูงมาก" : score >= 60 ? "สูง" : score >= 40 ? "ปานกลาง" : "กำลังสะสม";
  const color =
    score >= 80 ? "text-emerald-400" : score >= 60 ? "text-amber-400" : "text-slate-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        <Shield size={16} className="text-amber-400" />
        <span className="text-sm font-medium text-slate-300">{t("job_board.employer_trust")}</span>
      </div>
      <div className={`flex items-center gap-1.5 ${color}`}>
        <Star size={16} className="fill-current" />
        <span className="font-bold">{score}</span>
        <span className="text-xs">/ 100</span>
      </div>
      <span className={`text-xs ${color}`}>({level})</span>
    </div>
  );
}

export const JobDetailAdvance: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const { notify } = useNotification();
  const { config } = useMobileAppConfig();
  const chatEnabled = config.featureFlags.enableChat;
  const { t } = useLanguage();
  const [job, setJob] = useState<JobAdvanceAPI | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [hasApplied, setHasApplied] = useState(false);

  useEffect(() => {
    const rawId = id ?? "";
    const cleanId = String(rawId).trim();
    if (!cleanId) {
      setJob(null);
      setLoading(false);
      return;
    }
    // IMMEDIATE Mock Check — must be FIRST, before any try-catch or API calls
    if (isMockJobId(cleanId)) {
      const mockJob = getMockJobById(cleanId);
      setJob(mockJob);
      setLoading(false);
      return;
    }
    // Real job IDs — fetch from API (GET job does not require auth; token optional for view/save)
    let cancelled = false;
    (async () => {
      setLoading(true);
      if (import.meta.env?.DEV) {
        console.log("[JobDetailAdvance] Fetching job id:", cleanId, "hasToken:", !!token);
      }
      try {
        const j = await getAdvanceJobById(cleanId, token);
        if (import.meta.env?.DEV) {
          console.log("[JobDetailAdvance] API response:", j ? "Success" : "Not found (404)");
        }
        let myApps: { job_id: string }[] = [];
        if (token) {
          try {
            myApps = await getMyAdvanceJobApplications(token);
          } catch {
            /* my-applications failed; job detail still valid — treat as not applied */
          }
        }
        if (!cancelled) {
          setJob(j ?? null);
          setHasApplied(!!myApps?.some((a) => String(a.job_id) === String(cleanId)));
          if (j) recordAdvanceJobView(cleanId, token).catch(() => {});
        }
      } catch (e) {
        if (import.meta.env?.DEV) {
          console.warn("[JobDetailAdvance] API error:", e);
        }
        if (!cancelled) {
          const msg = e instanceof JobServiceError ? e.message : "โหลดรายละเอียดงานไม่สำเร็จ";
          notify(msg, "error");
          setJob(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, token, notify]);

  const handleApply = async () => {
    if (!id || !job || job.status !== "open") return;
    setApplying(true);
    try {
      if (isMockJobId(id)) {
        setJob((prev) => (prev ? { ...prev, applicant_count: prev.applicant_count + 1 } : null));
        setHasApplied(true);
        notify("ส่งความสนใจแล้ว — แชทกับนายจ้างได้เลย", "success");
      } else {
        const { applicant_count } = await applyToJobAdvance(id, token);
        setJob((prev) => (prev ? { ...prev, applicant_count } : null));
        setHasApplied(true);
        notify("ส่งความสนใจแล้ว — แชทกับนายจ้างได้เลย", "success");
      }
    } catch (e) {
      notify(e instanceof JobServiceError ? e.message : "ส่งข้อเสนอไม่สำเร็จ", "error");
    } finally {
      setApplying(false);
    }
  };

  const handleReportJob = () => {
    alert(t("job_board.report_thanks"));
  };

  if (loading) {
    return (
      <div className="luxury-card rounded-2xl p-12 text-center">
        <div className="inline-block w-8 h-8 border-2 border-amber-400/50 border-t-amber-400 rounded-full animate-spin mb-4" />
        <p className="text-slate-400">{t("job_board.loading")}</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="luxury-card rounded-2xl p-8 text-center">
        <p className="text-slate-400">{t("job_board.not_found")}</p>
        <Link to="/job-board" className="mt-4 inline-flex items-center gap-2 text-amber-400 hover:underline">
          <ArrowLeft size={16} /> {t("job_board.back")}
        </Link>
      </div>
    );
  }

  const canApplyStatus = job.status === "open" || job.status === "pending";
  const currentUserId = user?.id ?? (user as any)?.userId;
  const isEmployer = job && currentUserId && String(job.employer_id) === String(currentUserId);
  const applicantCount = job.applicant_count ?? 0;
  const showTalentActions = canApplyStatus && !isEmployer;

  return (
    <div className="job-detail-container job-detail-advance min-h-screen py-6 pb-44">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <Link
            to="/job-board"
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft size={18} /> {t("job_board.back")}
          </Link>
          {isEmployer && (
            <Link
              to={`/job-board/${job.id}/manage`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/20 text-amber-700 border border-amber-500/30 hover:bg-amber-500/30 font-medium"
            >
              {t("job_board.manage_job")}
              {applicantCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/40 text-amber-800 text-sm font-bold">
                  {applicantCount} {t("job_board.applicants")}
                </span>
              )}
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main: คำบรรยายงาน — Clean Pro */}
          <div className="lg:col-span-2 space-y-6">
            <div className="job-main-card rounded-2xl overflow-hidden">
              <div className="job-detail-header p-6 sm:p-8">
                <span className="badge-category inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-3">
                  {job.category}
                </span>
                <h1 className="text-title text-2xl font-bold mb-2">{job.title}</h1>
                <p className="text-sm opacity-90">{new Date(job.created_at).toLocaleDateString("th-TH")}</p>
              </div>

              <div className="p-6 sm:p-8">
                <section className="mb-8">
                  <h2 className="text-lg font-semibold text-title flex items-center gap-2 mb-3">
                    <FileText size={18} className="text-emerald-600" />
                    {t("job_board.job_details")}
                  </h2>
                  <div className="text-description whitespace-pre-wrap leading-relaxed">
                    {job.description}
                  </div>
                </section>

                <section>
                  <h2 className="text-lg font-semibold text-title flex items-center gap-2 mb-3">
                    <Target size={18} className="text-emerald-600" />
                    {t("job_board.scope_deliverables")}
                  </h2>
                  <div className="text-description whitespace-pre-wrap leading-relaxed">
                    {job.scope}
                  </div>
                </section>
              </div>
            </div>
          </div>

          {/* Sidebar: สรุป + Layout การรับงาน — Clean Pro */}
          <div className="lg:col-span-1 space-y-6">
            <div className="job-main-card rounded-2xl p-6">
              <div className="mb-4">
                <p className="text-xs font-medium text-description uppercase tracking-wider mb-1">
                  {t("job_board.budget")}
                </p>
                <p className="text-2xl font-bold text-emerald-700">
                  ฿{job.min_budget.toLocaleString()} – ฿{job.max_budget.toLocaleString()}
                </p>
              </div>
              {job.applicant_count > 0 && (
                <p className="text-sm text-emerald-600 flex items-center gap-1.5 mb-3">
                  <Users size={16} />
                  {t("job_board.interested")} {job.applicant_count}
                </p>
              )}
              <div className="info-box-item flex items-center gap-2 p-4 rounded-lg mb-6">
                <Clock size={18} className="text-emerald-600" />
                <span className="text-description">{t("job_board.work_duration")}</span>
                <span className="font-semibold text-title">{job.duration_days} {t("job_board.days")}</span>
              </div>

              {showTalentActions && (
                <div className="space-y-2">
                  {!hasApplied ? (
                    <button
                      type="button"
                      onClick={handleApply}
                      disabled={applying || !token}
                      data-tour="talent-place-bid"
                      className="btn-chat-action w-full py-3.5 rounded-xl font-bold inline-flex items-center justify-center gap-2 disabled:opacity-70"
                    >
                      <Send size={18} />
                      {applying ? t("job_board.sending") : t("job_board.send_proposal")}
                    </button>
                  ) : chatEnabled ? (
                    <Link
                      to={`/job-board/${id}/chat/${currentUserId}`}
                      className="btn-chat-action w-full py-3.5 rounded-xl font-bold inline-flex items-center justify-center gap-2"
                    >
                      <MessageCircle size={18} />
                      {t("job_board.chat_employer")}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => notify("แชทถูกปิดชั่วคราวโดยผู้ดูแลระบบ", "warning")}
                      className="w-full py-3.5 rounded-xl font-bold inline-flex items-center justify-center gap-2 bg-slate-600 text-slate-300 cursor-not-allowed opacity-90"
                    >
                      <MessageCircle size={18} />
                      {t("job_board.chat_employer")}
                    </button>
                  )}
                </div>
              )}
              {!canApplyStatus && (
                <div className="job-status-banner py-3 rounded-xl text-center text-sm font-medium">
                  {t("job_board.job_closed")}
                </div>
              )}
            </div>

            <div className="job-main-card rounded-2xl p-5">
              <EmployerTrustBadge score={job.employer_trust_score ?? 0} t={t} />
            </div>

            <div className="job-main-card rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-title flex items-center gap-2 mb-3">
                <User size={16} /> {t("job_board.employer")}
              </h3>
              <p className="font-medium text-title">{job.employer_name ?? t("job_board.employer")}</p>
            </div>

            <div className="info-box-item rounded-2xl p-5 flex items-center gap-3">
              <Calendar size={18} className="text-emerald-600" />
              <div>
                <p className="text-xs text-description">{t("job_board.posted_at")}</p>
                <p className="text-title font-medium">
                  {new Date(job.created_at).toLocaleString("th-TH")}
                </p>
              </div>
            </div>

            {/* UGC Compliance: Report this Job */}
            <button
              type="button"
              onClick={handleReportJob}
              className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-500 text-slate-400 hover:bg-slate-800/50 hover:text-slate-300 transition-colors text-sm font-medium"
            >
              <Flag size={16} />
              {t("job_board.report_job")}
            </button>
          </div>
        </div>
      </div>

      {/* Sticky Footer: Apply / Chat — above bottom nav (bottom-16) so not overlapped */}
      {showTalentActions && (
        <div className="fixed bottom-16 left-0 right-0 z-50 p-4 bg-charcoal-900/95 border-t border-slate-700 shadow-[0_-4px_20px_rgba(0,0,0,0.3)] md:bottom-0">
          <div className="max-w-2xl mx-auto flex flex-col sm:flex-row gap-3">
            {!token ? (
              <Link
                to="/login"
                className="flex-1 flex items-center justify-center gap-2 py-4 rounded-xl bg-emerald-600 text-white font-bold text-lg hover:bg-emerald-500 transition-colors"
              >
                {t("job_board.login_to_apply")}
              </Link>
            ) : hasApplied ? (
              <>
                {chatEnabled ? (
                  <Link
                    to={`/job-board/${id}/chat/${currentUserId}`}
                    className="flex-1 flex items-center justify-center gap-2 py-4 rounded-xl bg-emerald-600 text-white font-bold text-lg hover:bg-emerald-500 transition-colors"
                  >
                    <MessageCircle size={22} />
                    {t("job_board.chat_employer")}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => notify("แชทถูกปิดชั่วคราวโดยผู้ดูแลระบบ", "warning")}
                    className="flex-1 flex items-center justify-center gap-2 py-4 rounded-xl bg-slate-600 text-slate-300 font-bold text-lg cursor-not-allowed opacity-90"
                  >
                    <MessageCircle size={22} />
                    {t("job_board.chat_employer")}
                  </button>
                )}
                <button
                  type="button"
                  disabled
                  className="flex-1 flex items-center justify-center gap-2 py-4 rounded-xl bg-slate-600 text-slate-400 font-semibold cursor-not-allowed"
                >
                  {t("job_board.already_applied")}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleApply}
                disabled={applying}
                className="flex-1 flex items-center justify-center gap-2 py-4 rounded-xl bg-emerald-600 text-white font-bold text-lg hover:bg-emerald-500 disabled:opacity-70 transition-colors"
              >
                <Send size={22} />
                {applying ? t("job_board.sending") : t("job_board.apply_for_job")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
