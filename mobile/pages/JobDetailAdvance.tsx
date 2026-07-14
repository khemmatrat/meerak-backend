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
  CheckCircle2,
  Flag,
  ChevronDown,
  ChevronUp,
  MapPin,
  Banknote,
  Briefcase,
  X,
} from "lucide-react";
import {
  getAdvanceJobById,
  applyToJobAdvance,
  detectQuotationContactBypass,
  getMyAdvanceJobApplications,
  recordAdvanceJobView,
  JobServiceError,
  type AdvanceJobQuotationPayload,
} from "../services/jobService";
import type { JobAdvanceAPI } from "../types/api";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { useMobileAppConfig } from "../context/MobileAppConfigContext";
import { resolveJobBoardCopy } from "../utils/jobBoardCopy";
import { useLanguage } from "../context/LanguageContext";
import { isMockJobId, getMockJobById } from "../services/mockJobsForReview";
import { trackAdvanceEvent, advanceJobEventMeta } from "../utils/analytics";
import {
  getEmploymentTypeLabel,
} from "../constants/workTaxonomy";
import { ApplicationTimeline } from "../components/ApplicationTimeline";

function CollapsibleText({
  text,
  maxChars = 280,
}: {
  text: string;
  maxChars?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return <p className="text-description text-sm">—</p>;
  const needsCollapse = text.length > maxChars;
  const display = expanded || !needsCollapse ? text : `${text.slice(0, maxChars).trim()}…`;
  return (
    <div>
      <div className="text-description whitespace-pre-wrap leading-relaxed text-sm">
        {display}
      </div>
      {needsCollapse && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
        >
          {expanded ? (
            <>
              <ChevronUp size={14} /> ย่อ
            </>
          ) : (
            <>
              <ChevronDown size={14} /> อ่านต่อ
            </>
          )}
        </button>
      )}
    </div>
  );
}

function JobSnapshotBar({ job, t }: { job: JobAdvanceAPI; t: (k: string) => string }) {
  const province = (job as any).target_province;
  const employment = (job as any).employment_type;
  const statusLabel =
    job.status === "open"
      ? "เปิดรับ"
      : job.status === "pending"
        ? "รอดำเนินการ"
        : job.status === "closed"
          ? "ปิดรับ"
          : job.status === "completed"
            ? "เสร็จสิ้น"
            : job.status;
  return (
    <div className="flex flex-wrap gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 mb-6">
      <span className="jb-filter-chip">
        <Banknote size={12} />
        ฿{job.min_budget.toLocaleString()}–{job.max_budget.toLocaleString()}
      </span>
      <span className="jb-filter-chip">
        <Clock size={12} />
        {job.duration_days} {t("job_board.days")}
      </span>
      {province && (
        <span className="jb-filter-chip">
          <MapPin size={12} />
          {province}
        </span>
      )}
      {employment && (
        <span className="jb-filter-chip">
          <Briefcase size={12} />
          {getEmploymentTypeLabel(String(employment))}
        </span>
      )}
      <span className="jb-filter-chip !bg-emerald-50 !text-emerald-700 !border-emerald-200">
        {statusLabel}
      </span>
    </div>
  );
}

/** คะแนนความน่าเชื่อถือของผู้จ้าง (แสดงใน Sidebar + บนหัวข้อ) */
function EmployerTrustBadge({
  score,
  t,
}: {
  score: number;
  t: (k: string) => string;
}) {
  const level =
    score >= 80
      ? "สูงมาก"
      : score >= 60
        ? "สูง"
        : score >= 40
          ? "ปานกลาง"
          : "กำลังสะสม";
  const color =
    score >= 80
      ? "text-emerald-400"
      : score >= 60
        ? "text-amber-400"
        : "text-slate-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        <Shield size={16} className="text-amber-400" />
        <span className="text-sm font-medium text-slate-300">
          {t("job_board.employer_trust")}
        </span>
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
  const { config: appConfig } = useMobileAppConfig();
  const jobBoardCopy = resolveJobBoardCopy(appConfig.remote);
  const chatEnabled = appConfig.featureFlags.enableChat;
  const { t } = useLanguage();
  const [job, setJob] = useState<JobAdvanceAPI | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [hasApplied, setHasApplied] = useState(false);
  const [applicationStatus, setApplicationStatus] = useState<string>("");
  const [applicationViewedAt, setApplicationViewedAt] = useState<string | null>(null);
  const [showQuoteSheet, setShowQuoteSheet] = useState(false);
  const [showAppliedModal, setShowAppliedModal] = useState(false);
  const [showReportThanks, setShowReportThanks] = useState(false);
  const [quoteTheme, setQuoteTheme] = useState("aqond_classic_corporate");
  const [quoteAmount, setQuoteAmount] = useState("");
  const [quoteTimelineDays, setQuoteTimelineDays] = useState("7");
  const [quoteValidUntil, setQuoteValidUntil] = useState("");
  const [quoteSummary, setQuoteSummary] = useState("");
  const [quoteEditReason, setQuoteEditReason] = useState("");
  const [myQuoteVersion, setMyQuoteVersion] = useState(0);
  const [bypassWarning, setBypassWarning] = useState(false);

  const quoteThemes: Array<{ id: string; label: string; desc: string }> = [
    {
      id: "aqond_classic_corporate",
      label: "AQOND Classic Corporate",
      desc: "ทางการ อ่านง่าย เหมาะงานธุรกิจทั่วไป",
    },
    {
      id: "aqond_sme_fast",
      label: "AQOND SME Fast",
      desc: "กระชับ เร็ว เหมาะงานเร่งด่วน",
    },
    {
      id: "aqond_creative_portfolio",
      label: "AQOND Creative Portfolio",
      desc: "เน้นงานครีเอทีฟและตัวอย่างผลงาน",
    },
    {
      id: "aqond_technical_sow",
      label: "AQOND Technical SOW",
      desc: "เน้นขอบเขตงาน/สเปก/ส่งมอบเชิงเทคนิค",
    },
    {
      id: "aqond_gov_ready",
      label: "AQOND Gov-ready",
      desc: "เหมาะเอกสารจัดซื้อจัดจ้าง ตรวจสอบย้อนหลังได้",
    },
  ];

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
        console.log(
          "[JobDetailAdvance] Fetching job id:",
          cleanId,
          "hasToken:",
          !!token,
        );
      }
      try {
        const j = await getAdvanceJobById(cleanId, token);
        if (import.meta.env?.DEV) {
          console.log(
            "[JobDetailAdvance] API response:",
            j ? "Success" : "Not found (404)",
          );
        }
        let myApps: Awaited<ReturnType<typeof getMyAdvanceJobApplications>> = [];
        if (token) {
          try {
            myApps = await getMyAdvanceJobApplications(token);
          } catch {
            /* my-applications failed; job detail still valid — treat as not applied */
          }
        }
        if (!cancelled) {
          setJob(j ?? null);
          const myApp = myApps?.find(
            (a) => String(a.job_id) === String(cleanId),
          );
          setHasApplied(!!myApp);
          setApplicationStatus(myApp?.status || "");
          setApplicationViewedAt(myApp?.viewed_at ?? null);
          setMyQuoteVersion(myApp?.quote_version_count ?? 0);
          if (j) recordAdvanceJobView(cleanId, token).catch(() => {});
        }
      } catch (e) {
        if (import.meta.env?.DEV) {
          console.warn("[JobDetailAdvance] API error:", e);
        }
        if (!cancelled) {
          const msg =
            e instanceof JobServiceError
              ? e.message
              : "โหลดรายละเอียดงานไม่สำเร็จ";
          notify(msg, "error");
          setJob(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, token, notify]);

  useEffect(() => {
    if (!job) return;
    if (!quoteAmount)
      setQuoteAmount(String(job.max_budget || job.min_budget || 0));
    if (!quoteValidUntil) {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      setQuoteValidUntil(d.toISOString().slice(0, 10));
    }
    if (!quoteSummary) {
      setQuoteSummary(
        `พร้อมเริ่มงานทันที ส่งงานภายใน ${job.duration_days} วัน พร้อมรับประกันคุณภาพงานตามขอบเขต`,
      );
    }
  }, [job]);

  useEffect(() => {
    const texts = [quoteSummary].filter(Boolean);
    setBypassWarning(texts.some((t) => detectQuotationContactBypass(t)));
  }, [quoteSummary]);

  const handleApply = async () => {
    if (!id || !job || job.status !== "open") return;
    if (bypassWarning) {
      notify(
        "ไม่สามารถใส่เบอร์โทร ไลน์ หรือช่องทางติดต่อนอกแพลตฟอร์มในใบเสนอราคาได้",
        "error",
      );
      return;
    }
    if (hasApplied && myQuoteVersion >= 3 && showQuoteSheet) {
      notify("ถึงขีดจำกัด counter-offer แล้ว (สูงสุด v3)", "error");
      return;
    }
    if (hasApplied && showQuoteSheet && !quoteEditReason.trim()) {
      notify("กรุณาระบุเหตุผลการแก้ไขเมื่ออัปเดตใบเสนอราคา", "error");
      return;
    }
    setApplying(true);
    try {
      const amountNum = Math.max(0, Number(quoteAmount || 0));
      const quotation: AdvanceJobQuotationPayload | null =
        amountNum > 0
          ? {
              quote_theme: quoteTheme,
              quote_currency: "THB",
              quote_total_amount: amountNum,
              quote_timeline_days: Math.max(
                1,
                Number(quoteTimelineDays || 0) || job.duration_days || 7,
              ),
              quote_valid_until: quoteValidUntil || undefined,
              quote_summary: quoteSummary.trim() || undefined,
              quote_items: [
                {
                  label: "บริการหลักตามขอบเขตงาน",
                  description:
                    quoteSummary.trim() || job.scope?.slice(0, 140) || "",
                  qty: 1,
                  unit_price: amountNum,
                },
              ],
            }
          : null;
      if (isMockJobId(id)) {
        setJob((prev) =>
          prev ? { ...prev, applicant_count: prev.applicant_count + 1 } : null,
        );
        setHasApplied(true);
        setApplicationStatus("interested");
        setShowQuoteSheet(false);
        setShowAppliedModal(true);
        notify(
          quotation
            ? "ส่งใบเสนอราคาแล้ว — แชทกับนายจ้างได้เลย"
            : "ส่งความสนใจแล้ว — แชทกับนายจ้างได้เลย",
          "success",
        );
        trackAdvanceEvent(
          "advance_apply_submitted",
          advanceJobEventMeta(job, {
            job_id: id,
            role: "talent",
            with_quote: !!quotation,
          }),
          jobBoardCopy,
        );
      } else {
        const { applicant_count, version } = await applyToJobAdvance(
          id,
          token,
          quotation,
          hasApplied ? quoteEditReason.trim() : undefined,
        );
        setJob((prev) => (prev ? { ...prev, applicant_count } : null));
        setHasApplied(true);
        setApplicationStatus("interested");
        if (version) setMyQuoteVersion(version);
        setShowQuoteSheet(false);
        setShowAppliedModal(true);
        setQuoteEditReason("");
        notify(
          quotation
            ? "ส่งใบเสนอราคาแล้ว — แชทกับนายจ้างได้เลย"
            : "ส่งความสนใจแล้ว — แชทกับนายจ้างได้เลย",
          "success",
        );
        trackAdvanceEvent(
          "advance_apply_submitted",
          advanceJobEventMeta(job, {
            job_id: id,
            role: "talent",
            with_quote: !!quotation,
          }),
          jobBoardCopy,
        );
      }
    } catch (e) {
      notify(
        e instanceof JobServiceError ? e.message : "ส่งข้อเสนอไม่สำเร็จ",
        "error",
      );
    } finally {
      setApplying(false);
    }
  };

  const handleReportJob = () => {
    setShowReportThanks(true);
  };

  const currentUserId = user?.id ?? (user as any)?.userId;
  const isEmployer =
    !!job &&
    !!currentUserId &&
    String(job.employer_id) === String(currentUserId);
  const canApplyStatus = job?.status === "open" || job?.status === "pending";
  const showTalentActions = !!job && canApplyStatus && !isEmployer;

  useEffect(() => {
    if (loading || !job || !showTalentActions) return;
    trackAdvanceEvent(
      "advance_apply_cta_impression",
      advanceJobEventMeta(job, { job_id: id, role: "talent" }),
      jobBoardCopy,
    );
  }, [loading, job, showTalentActions, id, jobBoardCopy]);

  useEffect(() => {
    if (!showAppliedModal || !job) return;
    trackAdvanceEvent(
      "advance_apply_modal_impression",
      advanceJobEventMeta(job, { job_id: id, role: "talent" }),
      jobBoardCopy,
    );
  }, [showAppliedModal, job, id, jobBoardCopy]);

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
        <Link
          to="/job-board"
          className="mt-4 inline-flex items-center gap-2 text-amber-400 hover:underline"
        >
          <ArrowLeft size={16} /> {t("job_board.back")}
        </Link>
      </div>
    );
  }

  const applicantCount = job.applicant_count ?? 0;

  return (
    <div className="aqond-trust-theme jobboard-flow-theme job-detail-container job-detail-advance min-h-screen py-6 pb-44">
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
                <h1 className="text-title text-2xl font-bold mb-2">
                  {job.title}
                </h1>
                <p className="text-sm opacity-90">
                  {new Date(job.created_at).toLocaleDateString("th-TH")}
                </p>
              </div>

              <div className="p-6 sm:p-8">
                <JobSnapshotBar job={job} t={t} />

                {hasApplied && showTalentActions && (
                  <div className="mb-6 p-4 rounded-xl border border-blue-200 bg-blue-50">
                    <p className="text-sm font-semibold text-blue-900 flex items-center gap-2">
                      <CheckCircle2 size={16} />
                      {applicationStatus === "hired"
                        ? "คุณได้รับการจ้างแล้ว"
                        : applicationStatus === "shortlisted"
                          ? "นายจ้างคัดเลือกคุณแล้ว"
                          : "สมัครงานนี้แล้ว — รอนายจ้างพิจารณา"}
                    </p>
                    <div className="mt-3">
                      <ApplicationTimeline
                        status={applicationStatus || "interested"}
                        jobStatus={job.status}
                        viewedAt={applicationViewedAt}
                      />
                    </div>
                  </div>
                )}

                <section className="mb-8">
                  <h2 className="text-lg font-semibold text-title flex items-center gap-2 mb-3">
                    <FileText size={18} className="text-emerald-600" />
                    {t("job_board.job_details")}
                  </h2>
                  <CollapsibleText text={job.description} />
                </section>

                <section>
                  <h2 className="text-lg font-semibold text-title flex items-center gap-2 mb-3">
                    <Target size={18} className="text-emerald-600" />
                    {t("job_board.scope_deliverables")}
                  </h2>
                  <CollapsibleText text={job.scope} />
                </section>
              </div>
            </div>
          </div>

          {/* Sidebar: ข้อมูล + trust — ไม่มี CTA ซ้ำ */}
          <div className="lg:col-span-1 space-y-6">
            <div className="job-main-card rounded-2xl p-6">
              <div className="mb-4">
                <p className="text-xs font-medium text-description uppercase tracking-wider mb-1">
                  {t("job_board.budget")}
                </p>
                <p className="text-2xl font-bold text-emerald-700">
                  ฿{job.min_budget.toLocaleString()} – ฿
                  {job.max_budget.toLocaleString()}
                </p>
              </div>
              {job.applicant_count > 0 && (
                <p className="text-sm text-emerald-600 flex items-center gap-1.5 mb-3">
                  <Users size={16} />
                  {t("job_board.interested")} {job.applicant_count}
                </p>
              )}
              <div className="info-box-item flex items-center gap-2 p-4 rounded-lg">
                <Clock size={18} className="text-emerald-600" />
                <span className="text-description">
                  {t("job_board.work_duration")}
                </span>
                <span className="font-semibold text-title">
                  {job.duration_days} {t("job_board.days")}
                </span>
              </div>
              {!canApplyStatus && (
                <div className="job-status-banner py-3 rounded-xl text-center text-sm font-medium mt-4">
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
              <p className="font-medium text-title">
                {job.employer_name ?? t("job_board.employer")}
              </p>
            </div>

            <div className="info-box-item rounded-2xl p-5 flex items-center gap-3">
              <Calendar size={18} className="text-emerald-600" />
              <div>
                <p className="text-xs text-description">
                  {t("job_board.posted_at")}
                </p>
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

      {/* Sticky Footer: CTA เดียว */}
      {showTalentActions && (
        <div className="fixed bottom-16 left-0 right-0 z-50 p-4 bg-white/95 border-t border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] md:bottom-0">
          <div className="max-w-2xl mx-auto space-y-2">
            {!token ? (
              <Link
                to="/login"
                className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-blue-600 text-white font-bold text-lg hover:bg-blue-500 transition-colors"
              >
                {t("job_board.login_to_apply")}
              </Link>
            ) : hasApplied ? (
              <>
                {chatEnabled ? (
                  <Link
                    to={`/job-board/${id}/chat/${currentUserId}`}
                    className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-blue-600 text-white font-bold text-lg hover:bg-blue-500 transition-colors"
                  >
                    <MessageCircle size={22} />
                    {t("job_board.chat_employer")}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      notify("แชทถูกปิดชั่วคราวโดยผู้ดูแลระบบ", "warning")
                    }
                    className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-slate-400 text-white font-bold text-lg cursor-not-allowed"
                  >
                    <MessageCircle size={22} />
                    {t("job_board.chat_employer")}
                  </button>
                )}
                {myQuoteVersion < 3 && job.status === "open" && (
                  <button
                    type="button"
                    onClick={() => setShowQuoteSheet(true)}
                    className="w-full text-center text-sm text-blue-600 hover:underline py-1"
                  >
                    {`เพิ่ม/อัปเดตใบเสนอราคา (ไม่บังคับ) · v${myQuoteVersion + 1}`}
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={applying}
                  data-tour="talent-place-bid"
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-blue-600 text-white font-bold text-lg hover:bg-blue-500 disabled:opacity-70 transition-colors"
                >
                  <Send size={22} />
                  {applying ? t("job_board.sending") : "สนใจงานนี้"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowQuoteSheet(true)}
                  className="w-full text-center text-sm text-slate-500 hover:text-blue-600 py-1"
                >
                  เพิ่มใบเสนอราคา (ไม่บังคับ)
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Quotation bottom sheet */}
      {showQuoteSheet && showTalentActions && (
        <>
          <div className="jb-bottom-sheet-backdrop" onClick={() => setShowQuoteSheet(false)} />
          <div className="jb-bottom-sheet">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">
                {hasApplied
                  ? `อัปเดตใบเสนอราคา (v${myQuoteVersion + 1})`
                  : "เพิ่มใบเสนอราคา (ไม่บังคับ)"}
              </h3>
              <button type="button" onClick={() => setShowQuoteSheet(false)} className="p-2 rounded-lg hover:bg-slate-100">
                <X size={20} className="text-slate-500" />
              </button>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              ใบเสนอราคาช่วยให้นายจ้างเปรียบเทียบได้ — ส่งความสนใจอย่างเดียวก็ได้
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-slate-700">Theme ใบเสนอราคา</label>
                <select
                  value={quoteTheme}
                  onChange={(e) => setQuoteTheme(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {quoteThemes.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs font-medium text-slate-600">ราคา (THB)</label>
                  <input
                    type="number"
                    min={0}
                    value={quoteAmount}
                    onChange={(e) => setQuoteAmount(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Timeline</label>
                  <input
                    type="number"
                    min={1}
                    value={quoteTimelineDays}
                    onChange={(e) => setQuoteTimelineDays(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Valid until</label>
                  <input
                    type="date"
                    value={quoteValidUntil}
                    onChange={(e) => setQuoteValidUntil(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">สรุปข้อเสนอ</label>
                <textarea
                  value={quoteSummary}
                  onChange={(e) => setQuoteSummary(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                {bypassWarning && (
                  <p className="text-xs text-red-600 mt-1">
                    ตรวจพบข้อมูลติดต่อนอกแพลตฟอร์ม
                  </p>
                )}
              </div>
              {hasApplied && (
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    เหตุผลการแก้ไข <span className="text-red-600">*</span>
                  </label>
                  <textarea
                    value={quoteEditReason}
                    onChange={(e) => setQuoteEditReason(e.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              )}
              <button
                type="button"
                onClick={handleApply}
                disabled={applying}
                className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-500 disabled:opacity-70"
              >
                {applying
                  ? t("job_board.sending")
                  : hasApplied
                    ? "ส่งเวอร์ชันใหม่"
                    : "ส่งใบเสนอราคาพร้อมสมัคร"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Chat-first modal หลังสมัคร */}
      {showAppliedModal && (
        <>
          <div className="fixed inset-0 z-[70] bg-black/40" onClick={() => setShowAppliedModal(false)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[71] w-[90%] max-w-md p-6 rounded-2xl bg-white shadow-xl text-center">
            <CheckCircle2 size={48} className="text-emerald-500 mx-auto mb-3" />
            <h3 className="text-xl font-bold text-slate-900 mb-2">สมัครแล้ว!</h3>
            <p className="text-sm text-slate-600 mb-5">
              {jobBoardCopy.appliedModalBody}
            </p>
            {chatEnabled ? (
              <Link
                to={`/job-board/${id}/chat/${currentUserId}`}
                onClick={() => {
                  setShowAppliedModal(false);
                  trackAdvanceEvent(
                    "advance_chat_opened_from_apply_modal",
                    advanceJobEventMeta(job, { job_id: id, role: "talent" }),
                    jobBoardCopy,
                  );
                }}
                className="block w-full py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-500 mb-2"
              >
                แชทกับนายจ้าง
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => setShowAppliedModal(false)}
              className="w-full py-2 text-sm text-slate-500 hover:text-slate-700"
            >
              ปิด
            </button>
          </div>
        </>
      )}

      {showReportThanks && (
        <>
          <div className="fixed inset-0 z-[70] bg-black/40" onClick={() => setShowReportThanks(false)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[71] w-[90%] max-w-sm p-6 rounded-2xl bg-white shadow-xl text-center">
            <Flag size={40} className="text-blue-500 mx-auto mb-3" />
            <p className="text-slate-700 text-sm">{t("job_board.report_thanks")}</p>
            <button
              type="button"
              onClick={() => setShowReportThanks(false)}
              className="mt-4 w-full py-2.5 rounded-xl bg-blue-600 text-white font-medium"
            >
              ตกลง
            </button>
          </div>
        </>
      )}
    </div>
  );
};
