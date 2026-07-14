import React, { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Star,
  Loader2,
  MessageCircle,
  MoreVertical,
  ShieldCheck,
  Briefcase,
  Award,
  Flag,
  Ban,
} from "lucide-react";
import { QuotationCompareTable } from "../QuotationCompareTable";
import { recordApplicantProfileView } from "../../services/jobService";
import { NoApplicantsCard } from "./NoApplicantsCard";
import { useManageAdvanceJob } from "./ManageAdvanceJobContext";
import { trackAdvanceEvent, advanceJobEventMeta } from "../../utils/analytics";

export function ApplicantsPane() {
  const {
    id,
    token,
    job,
    isEmployer,
    chatEnabled,
    jobBoardCopy,
    analytics,
    applicants,
    quotationScores,
    patching,
    previewApplicantId,
    setPreviewApplicantId,
    applicantActionsOpen,
    setApplicantActionsOpen,
    t,
    notify,
    handlePatch,
    handleViewQuotationVersions,
    setCounterOfferApplicant,
    setProfileModalApplicant,
    setReportModalUser,
    handleBlockApplicant,
  } = useManageAdvanceJob();

  const hireImpressionSent = useRef(false);
  useEffect(() => {
    if (hireImpressionSent.current || !isEmployer || !id || !job) return;
    if (applicants.some((a) => a.status === "hired")) return;
    const canHire = applicants.some(
      (a) => a.status === "interested" || a.status === "shortlisted",
    );
    if (!canHire) return;
    hireImpressionSent.current = true;
    trackAdvanceEvent(
      "advance_hire_cta_impression",
      advanceJobEventMeta(job, { job_id: id, role: "employer" }),
      jobBoardCopy,
    );
  }, [isEmployer, id, job, applicants, jobBoardCopy]);

  return (
    <div className="luxury-card rounded-2xl p-6 space-y-4">
      {isEmployer && analytics && (
        <div className="flex flex-wrap gap-4 p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
          <span className="text-slate-400">
            ผู้เข้าชม:{" "}
            <strong className="text-slate-200">{analytics.view_count}</strong>
          </span>
          <span className="text-slate-400">
            ผู้สนใจ:{" "}
            <strong className="text-slate-200">{analytics.applicant_count}</strong>
          </span>
          {analytics.conversion_rate && (
            <span className="text-slate-400">
              อัตราสมัคร:{" "}
              <strong className="text-amber-400">{analytics.conversion_rate}</strong>
            </span>
          )}
          {analytics.time_to_hire_days && (
            <span className="text-slate-400">
              ระยะเวลาปิดจ้าง:{" "}
              <strong className="text-emerald-400">
                {analytics.time_to_hire_days} วัน
              </strong>
            </span>
          )}
        </div>
      )}
      {isEmployer && applicants.some((a) => a.quotation?.total_amount) && (
        <QuotationCompareTable
          applicants={applicants}
          scores={quotationScores}
          selecting={patching}
          onSelect={(a) =>
            handlePatch(
              a.user_id,
              "hired",
              a.quotation?.total_amount
                ? Number(a.quotation.total_amount)
                : job.max_budget,
            )
          }
          onCounterOffer={(a) => setCounterOfferApplicant(a)}
          onViewVersions={handleViewQuotationVersions}
        />
      )}
      {applicants.length === 0 ? (
        <NoApplicantsCard
          jobId={id!}
          bullets={jobBoardCopy.manageNoApplicantsBullets}
          notify={notify}
          minBudget={job.min_budget}
          maxBudget={job.max_budget}
        />
      ) : (
        applicants.map((a) => {
          const canSwipeReject =
            isEmployer &&
            (a.status === "interested" || a.status === "shortlisted") &&
            a.status !== "hired";
          return (
            <div
              key={a.id}
              className="relative overflow-hidden rounded-xl"
              onTouchStart={(e) => {
                if (canSwipeReject)
                  (e.currentTarget as HTMLElement & { _touchStartX?: number })._touchStartX =
                    e.touches[0].clientX;
              }}
              onTouchEnd={(e) => {
                if (!canSwipeReject || !id || !token) return;
                const start = (e.currentTarget as HTMLElement & { _touchStartX?: number })
                  ._touchStartX;
                if (start != null && start - e.changedTouches[0].clientX > 80) {
                  handlePatch(a.user_id, "rejected");
                }
              }}
            >
              {canSwipeReject && (
                <div className="absolute inset-y-0 right-0 w-20 bg-slate-600/80 flex items-center justify-center text-slate-300 text-xs pointer-events-none">
                  {t("job_board.manage_advance.swipe_reject")}
                </div>
              )}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-800/50 border border-slate-700/50 relative z-10">
                <div>
                  <p className="font-medium text-slate-100 flex items-center gap-2">
                    {a.full_name || a.user_id}
                    {(a.kyc_level === "level_2" || a.verified_badge) && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-medium">
                        <ShieldCheck size={12} />
                        {a.verified_badge || "ยืนยันตัวตน"}
                      </span>
                    )}
                  </p>
                  {(a.phone || a.email) && (
                    <p className="text-sm text-slate-500">
                      {[a.phone, a.email].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-400">
                    {typeof a.completed_jobs_count === "number" &&
                      a.completed_jobs_count > 0 && (
                        <span className="flex items-center gap-1">
                          <Briefcase size={12} /> {a.completed_jobs_count} งานสำเร็จ
                        </span>
                      )}
                    {typeof a.rating === "number" && a.rating > 0 && (
                      <span className="flex items-center gap-1 text-amber-400">
                        <Star size={12} className="fill-amber-400" />{" "}
                        {a.rating.toFixed(1)}
                      </span>
                    )}
                    {a.skills && a.skills.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Award size={12} />{" "}
                        {a.skills
                          .slice(0, 3)
                          .map((s) => s.name || s.category)
                          .filter(Boolean)
                          .join(", ")}
                        {a.skills.length > 3 && ` +${a.skills.length - 3}`}
                      </span>
                    )}
                  </div>
                  {previewApplicantId === a.user_id && (
                    <div className="mt-3 p-3 rounded-lg bg-slate-800/80 border border-slate-600/50 text-sm space-y-1">
                      <p className="text-slate-300 font-medium">ข้อมูลย่อ</p>
                      <p className="text-slate-400">
                        งานสำเร็จ: {a.completed_jobs_count ?? 0} | Rating:{" "}
                        {(a.rating ?? 0).toFixed(1)}
                      </p>
                      {a.skills && a.skills.length > 0 && (
                        <p className="text-slate-400">
                          Skills:{" "}
                          {a.skills
                            .map((s) => s.name || s.category)
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => setPreviewApplicantId(null)}
                        className="text-xs text-amber-400 hover:underline mt-1"
                      >
                        ปิด
                      </button>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs ${
                        a.status === "hired"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : a.status === "shortlisted"
                            ? "bg-amber-500/20 text-amber-400"
                            : a.status === "rejected"
                              ? "bg-slate-600 text-slate-400"
                              : "bg-slate-700 text-slate-300"
                      }`}
                    >
                      {a.status === "hired"
                        ? t("job_board.manage_advance.status_hired")
                        : a.status === "shortlisted"
                          ? t("job_board.manage_advance.status_shortlisted")
                          : a.status === "rejected"
                            ? t("job_board.manage_advance.status_rejected")
                            : t("job_board.manage_advance.status_interested")}
                    </span>
                    {a.viewed_at && (
                      <span className="inline-block px-2 py-0.5 rounded text-xs bg-indigo-500/20 text-indigo-400">
                        {t("job_board.manage_advance.viewed")}
                      </span>
                    )}
                    {a.last_active_at && (
                      <span className="text-xs text-slate-500">
                        Last active:{" "}
                        {new Date(a.last_active_at).toLocaleDateString("th-TH", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                  {a.quotation?.total_amount ? (
                    <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs uppercase tracking-wide text-emerald-300">
                          AQOND Quotation
                          {a.quotation.version ? ` · v${a.quotation.version}` : ""}
                        </p>
                        {(a.score_badges || []).map((b) => (
                          <span
                            key={b}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/80 text-amber-300"
                          >
                            {b === "best_value"
                              ? "Best value"
                              : b === "fastest"
                                ? "Fastest"
                                : "Most trusted"}
                          </span>
                        ))}
                        {a.quotation_expired ||
                        a.quotation.expired ||
                        a.quotation.status === "expired" ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">
                            หมดอายุ
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-emerald-100 font-semibold">
                        {(a.quotation.theme || "aqond_classic_corporate")
                          .replace(/aqond_/g, "")
                          .replace(/_/g, " ")}{" "}
                        · ฿
                        {Number(a.quotation.total_amount).toLocaleString("th-TH")}{" "}
                        {a.quotation.currency || "THB"}
                      </p>
                      {a.quotation.timeline_days ? (
                        <p className="text-xs text-emerald-200/90 mt-1">
                          Timeline: {a.quotation.timeline_days} วัน
                        </p>
                      ) : null}
                      {a.quotation.valid_until ? (
                        <p className="text-xs text-emerald-200/90">
                          Valid until: {String(a.quotation.valid_until)}
                        </p>
                      ) : null}
                      {a.quotation.summary ? (
                        <p className="text-xs text-emerald-100/90 mt-1 line-clamp-2">
                          {a.quotation.summary}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2 shrink-0 items-center">
                  {(a.status === "interested" || a.status === "shortlisted") && (
                    <button
                      type="button"
                      onClick={() =>
                        handlePatch(
                          a.user_id,
                          "hired",
                          a.quotation?.total_amount
                            ? Number(a.quotation.total_amount)
                            : job.max_budget,
                        )
                      }
                      disabled={!!patching}
                      className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
                    >
                      {patching === a.user_id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : a.quotation?.total_amount ? (
                        "เลือกใบเสนอราคา"
                      ) : (
                        t("job_board.manage_advance.hire")
                      )}
                    </button>
                  )}
                  {chatEnabled ? (
                    <Link
                      to={`/job-board/${id}/chat/${a.user_id}`}
                      className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 inline-flex items-center gap-1"
                    >
                      <MessageCircle size={14} />
                      {t("job_board.manage_advance.chat")}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        notify("แชทถูกปิดชั่วคราวโดยผู้ดูแลระบบ", "warning")
                      }
                      className="px-4 py-2 rounded-lg bg-slate-600 text-slate-300 text-sm font-medium cursor-not-allowed inline-flex items-center gap-1 opacity-80"
                    >
                      <MessageCircle size={14} />
                      {t("job_board.manage_advance.chat")}
                    </button>
                  )}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setApplicantActionsOpen(
                          applicantActionsOpen === a.user_id ? null : a.user_id,
                        )
                      }
                      className="p-2 rounded-lg text-slate-400 hover:bg-slate-700/50 hover:text-slate-200 border border-slate-600/50"
                      aria-label="เมนูเพิ่มเติม"
                    >
                      <MoreVertical size={16} />
                    </button>
                    {applicantActionsOpen === a.user_id && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setApplicantActionsOpen(null)}
                        />
                        <div className="absolute right-0 top-full mt-1 py-1 rounded-xl bg-charcoal-800 border border-slate-600 shadow-xl z-50 min-w-[160px]">
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewApplicantId(
                                previewApplicantId === a.user_id ? null : a.user_id,
                              );
                              setApplicantActionsOpen(null);
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-slate-200 hover:bg-slate-700/50"
                          >
                            {t("job_board.manage_advance.view_quick_info")}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setProfileModalApplicant(a);
                              recordApplicantProfileView(id!, a.user_id, token).catch(
                                () => {},
                              );
                              setApplicantActionsOpen(null);
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-slate-200 hover:bg-slate-700/50"
                          >
                            {t("job_board.manage_advance.view_profile")}
                          </button>
                          {a.status === "interested" && (
                            <button
                              type="button"
                              onClick={() => {
                                handlePatch(a.user_id, "shortlisted");
                                setApplicantActionsOpen(null);
                              }}
                              disabled={!!patching}
                              className="w-full px-4 py-2 text-left text-sm text-slate-200 hover:bg-slate-700/50"
                            >
                              {t("job_board.manage_advance.shortlist")}
                            </button>
                          )}
                          {(a.status === "interested" || a.status === "shortlisted") && (
                            <button
                              type="button"
                              onClick={() => {
                                handlePatch(a.user_id, "rejected");
                                setApplicantActionsOpen(null);
                              }}
                              disabled={!!patching}
                              className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-slate-700/50"
                            >
                              {t("job_board.manage_advance.reject")}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setReportModalUser(a);
                              setApplicantActionsOpen(null);
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-slate-200 hover:bg-slate-700/50 flex items-center gap-2"
                          >
                            <Flag size={14} /> {t("job_board.manage_advance.report_user")}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              handleBlockApplicant(a);
                              setApplicantActionsOpen(null);
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-slate-700/50 flex items-center gap-2"
                          >
                            <Ban size={14} /> {t("job_board.manage_advance.block_user")}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
