import React, { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle,
  Loader2,
  ExternalLink,
  Upload,
  FileText,
  Wallet,
  Shield,
  Clock,
  Crown,
} from "lucide-react";
import { PaymentBreakdown } from "../PaymentBreakdown";
import { EscrowCollapsibleSection } from "./EscrowCollapsibleSection";
import { useManageAdvanceJob } from "./ManageAdvanceJobContext";
import {
  ADVANCE_TALENT_LABEL,
  escrowTransferredLabel,
  escrowTransferLabel,
  waitingEmployerEscrowLabel,
} from "../../utils/advanceJobLabels";
import { trackAdvanceEvent, advanceJobEventMeta } from "../../utils/analytics";

export function EscrowPane() {
  const {
    id,
    job,
    jobBoardCopy,
    hiredUserId,
    escrowStatus,
    escrowAmountNum,
    revisionCount,
    revisionLimit,
    isEmployer,
    isTalent,
    jobWithEscrow,
    workSubmissionStatus,
    escrowSectionsOpen,
    setEscrowSectionsOpen,
    procurementWinnerReason,
    setProcurementWinnerReason,
    selectedProcurementRevision,
    procurementRevisions,
    setSelectedProcurementRevisionId,
    procurementExporting,
    procurementSubmitting,
    procurementAgencyForm,
    setProcurementAgencyForm,
    handleCreateProcurementRevision,
    handleExportProcurement,
    handleApproveAndPay,
    approvePaySubmitting,
    setShowRequestRevisionModal,
    setShowSubmitWorkModal,
    milestones,
    releasingMilestoneId,
    handleReleaseMilestone,
    setReceiptMilestone,
    proposalLoading,
    milestoneProposal,
    proposalItems,
    setProposalItems,
    proposalSubmitting,
    handleSubmitProposal,
    handleProposalAction,
    agreedAmount,
    hasInsurance,
    setHasInsurance,
    escrowAmount,
    setEscrowAmount,
    escrowSubmitting,
    handleEscrow,
    escrowBreakdown,
    paymentsEnabled,
    notify,
  } = useManageAdvanceJob();

  const escrowImpressionSent = useRef(false);
  useEffect(() => {
    if (
      escrowImpressionSent.current ||
      !isEmployer ||
      !id ||
      !job ||
      !hiredUserId
    ) {
      return;
    }
    if (escrowStatus === "held" || escrowStatus === "released") return;
    escrowImpressionSent.current = true;
    trackAdvanceEvent(
      "advance_escrow_cta_impression",
      advanceJobEventMeta(job, { job_id: id, role: "employer" }),
      jobBoardCopy,
    );
  }, [isEmployer, id, job, hiredUserId, escrowStatus, jobBoardCopy]);

  return (
        <div className="luxury-card rounded-2xl p-6 space-y-6">
          {!hiredUserId ? (
            <p className="text-slate-500">
              เลือกผู้รับจ้างแล้วกดจ้างก่อน ถึงจะโอนเงินค้ำได้
            </p>
          ) : (
            <>
              {escrowStatus === "held" || escrowStatus === "released" ? (
                <div className="space-y-4">
                  {/* Status bar + Revision counter */}
                  <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                    <div className="flex items-center gap-3">
                      <CheckCircle
                        size={24}
                        className="text-emerald-400 shrink-0"
                      />
                      <div>
                        <p className="font-medium text-slate-100">
                          {escrowStatus === "released"
                            ? `ปล่อยเงินให้${ADVANCE_TALENT_LABEL}ครบแล้ว (งานเสร็จสมบูรณ์)`
                            : escrowTransferredLabel()}
                        </p>
                        <p className="text-amber-400 font-mono">
                          ฿{Number(escrowAmountNum).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    {escrowStatus === "held" && (
                      <span className="text-xs text-slate-400 px-2 py-1 rounded bg-slate-700/50">
                        Revision: {revisionCount}/{revisionLimit}
                      </span>
                    )}
                  </div>

                  {isEmployer && (
                    <EscrowCollapsibleSection
                      title="Procurement / เอกสารจัดซื้อ"
                      open={escrowSectionsOpen.procurement}
                      onToggle={() =>
                        setEscrowSectionsOpen((s) => ({
                          ...s,
                          procurement: !s.procurement,
                        }))
                      }
                      highlight={escrowSectionsOpen.procurement}
                    >
                    <div className="space-y-3">
                      <textarea
                        value={procurementWinnerReason}
                        onChange={(e) =>
                          setProcurementWinnerReason(e.target.value)
                        }
                        placeholder="เหตุผลคัดเลือกผู้ชนะ (ใช้ตอนสร้าง revision)"
                        rows={3}
                        className="w-full rounded-xl border border-slate-600 bg-charcoal-900 px-3 py-2 text-sm text-slate-100"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={selectedProcurementRevision?.id || ""}
                          onChange={(e) =>
                            setSelectedProcurementRevisionId(e.target.value)
                          }
                          disabled={procurementExporting || !procurementRevisions.length}
                          className="min-w-[11rem] rounded-lg border border-slate-600 bg-charcoal-900 px-2 py-2 text-xs text-slate-200 disabled:opacity-50"
                        >
                          {procurementRevisions.length === 0 ? (
                            <option value="">ยังไม่มี revision</option>
                          ) : (
                            procurementRevisions.map((rev) => (
                              <option key={rev.id} value={rev.id}>
                                rev #{rev.revision_no} •{" "}
                                {new Date(rev.created_at).toLocaleDateString(
                                  "th-TH",
                                )}
                              </option>
                            ))
                          )}
                        </select>
                        <button
                          type="button"
                          onClick={handleCreateProcurementRevision}
                          disabled={procurementSubmitting || !hiredUserId}
                          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
                        >
                          {procurementSubmitting
                            ? "กำลังสร้าง..."
                            : "สร้าง revision"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExportProcurement("csv")}
                          disabled={
                            procurementExporting || !selectedProcurementRevision
                          }
                          className="px-3 py-2 rounded-lg border border-slate-500 text-slate-100 text-sm hover:bg-slate-700/40 disabled:opacity-50"
                        >
                          Export CSV
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExportProcurement("pdf")}
                          disabled={
                            procurementExporting || !selectedProcurementRevision
                          }
                          className="px-3 py-2 rounded-lg border border-slate-500 text-slate-100 text-sm hover:bg-slate-700/40 disabled:opacity-50"
                        >
                          Export PDF
                        </button>
                        <select
                          value={procurementAgencyForm}
                          onChange={(e) =>
                            setProcurementAgencyForm(
                              e.target.value as
                                | "th_gov_procurement_v1"
                                | "egp_v1",
                            )
                          }
                          className="rounded-lg border border-slate-600 bg-charcoal-900 px-2 py-2 text-xs text-slate-200"
                        >
                          <option value="th_gov_procurement_v1">
                            JSON: TH GOV v1
                          </option>
                          <option value="egp_v1">JSON: eGP v1</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => handleExportProcurement("json")}
                          disabled={
                            procurementExporting || !selectedProcurementRevision
                          }
                          className="px-3 py-2 rounded-lg border border-slate-500 text-slate-100 text-sm hover:bg-slate-700/40 disabled:opacity-50"
                        >
                          Export JSON
                        </button>
                      </div>
                      {selectedProcurementRevision?.document_hash && (
                        <p className="text-xs text-slate-500 font-mono">
                          hash:{" "}
                          {selectedProcurementRevision.document_hash.slice(
                            0,
                            18,
                          )}
                          ...
                        </p>
                      )}
                    </div>
                    </EscrowCollapsibleSection>
                  )}

                  {/* Work Submission flow — Talent & Employer */}
                  {escrowStatus === "held" && (
                    <EscrowCollapsibleSection
                      title="ส่งมอบงาน"
                      open={escrowSectionsOpen.submission}
                      onToggle={() =>
                        setEscrowSectionsOpen((s) => ({
                          ...s,
                          submission: !s.submission,
                        }))
                      }
                      highlight={
                        workSubmissionStatus === "submitted" ||
                        workSubmissionStatus === "revision_requested"
                      }
                    >
                    <div className="space-y-4">
                      {workSubmissionStatus === "submitted" ? (
                        <>
                          <h4 className="font-medium text-slate-200">
                            สถานะ: อยู่ระหว่างตรวจสอบ
                          </h4>
                          {(jobWithEscrow?.work_submission_url ||
                            (jobWithEscrow?.work_submission_links?.length ??
                              0) > 0) && (
                            <div className="space-y-2">
                              <p className="text-sm text-slate-400">
                                งานที่ผู้รับจ้างส่งมา:
                              </p>
                              {jobWithEscrow?.work_submission_url && (
                                <a
                                  href={jobWithEscrow.work_submission_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 text-amber-400 hover:underline break-all"
                                >
                                  <ExternalLink size={14} />
                                  {jobWithEscrow.work_submission_url}
                                </a>
                              )}
                              {jobWithEscrow?.work_submission_links?.map(
                                (l, i) =>
                                  l.url && (
                                    <a
                                      key={i}
                                      href={l.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-2 text-amber-400 hover:underline break-all"
                                    >
                                      <ExternalLink size={14} />
                                      {l.label || l.url}
                                    </a>
                                  ),
                              )}
                            </div>
                          )}
                          {isEmployer ? (
                            <div className="flex flex-wrap gap-3 pt-2">
                              <button
                                type="button"
                                onClick={handleApproveAndPay}
                                disabled={!!approvePaySubmitting}
                                className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-2"
                              >
                                {approvePaySubmitting ? (
                                  <Loader2 size={18} className="animate-spin" />
                                ) : (
                                  <CheckCircle size={18} />
                                )}
                                อนุมัติและปล่อยเงิน
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setShowRequestRevisionModal(true)
                                }
                                disabled={revisionCount >= revisionLimit}
                                className="px-5 py-2.5 rounded-xl bg-slate-600 text-slate-100 font-medium hover:bg-slate-500 disabled:opacity-50 flex items-center gap-2"
                              >
                                ขอแก้ไข
                              </button>
                            </div>
                          ) : (
                            <p className="text-slate-400 text-sm">
                              รอให้นายจ้างตรวจสอบงานที่คุณส่ง
                            </p>
                          )}
                        </>
                      ) : workSubmissionStatus === "revision_requested" &&
                        (jobWithEscrow?.revision_notes?.length ?? 0) > 0 ? (
                        <>
                          <h4 className="font-medium text-amber-400">
                            นายจ้างขอให้แก้ไข
                          </h4>
                          <div className="space-y-2">
                            {jobWithEscrow.revision_notes?.map((n, i) => (
                              <div
                                key={i}
                                className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30"
                              >
                                <p className="text-slate-200 text-sm">
                                  {n.note}
                                </p>
                                <p className="text-xs text-slate-500 mt-1">
                                  {new Date(n.requested_at).toLocaleString(
                                    "th-TH",
                                  )}
                                </p>
                              </div>
                            ))}
                          </div>
                          {isTalent && (
                            <button
                              type="button"
                              onClick={() => setShowSubmitWorkModal(true)}
                              className="px-5 py-2.5 rounded-xl bg-amber-500 text-charcoal-900 font-medium hover:bg-amber-600 flex items-center gap-2"
                            >
                              <Upload size={18} />
                              ส่งงานแก้ไข
                            </button>
                          )}
                        </>
                      ) : isTalent &&
                        (workSubmissionStatus === "none" ||
                          workSubmissionStatus === "revision_requested") ? (
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-slate-200">
                            📤 ส่งมอบงานให้ลูกค้า
                          </p>
                          <button
                            type="button"
                            onClick={() => setShowSubmitWorkModal(true)}
                            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-amber-500 text-charcoal-900 font-bold hover:bg-amber-600 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
                          >
                            <Upload size={20} />
                            ส่งงาน (Submit Final Work)
                          </button>
                        </div>
                      ) : workSubmissionStatus === "none" && isEmployer ? (
                        <p className="text-slate-400 text-sm">
                          รอผู้รับจ้างส่งงาน
                        </p>
                      ) : null}
                      {/* 7-day auto-release note */}
                      {workSubmissionStatus === "submitted" && (
                        <p className="text-xs text-slate-500 pt-2 border-t border-slate-600">
                          หากนายจ้างไม่ตอบกลับภายใน 7 วันหลังจากผู้รับจ้างส่งงาน
                          ระบบจะปล่อยเงินให้ผู้รับจ้างอัตโนมัติ
                          (เพื่อกันนายจ้างหายตัว)
                        </p>
                      )}
                    </div>
                    </EscrowCollapsibleSection>
                  )}

                  {milestones.length > 0 && (
                    <EscrowCollapsibleSection
                      title={`งวดงาน (${milestones.length})`}
                      open={escrowSectionsOpen.milestones}
                      onToggle={() =>
                        setEscrowSectionsOpen((s) => ({
                          ...s,
                          milestones: !s.milestones,
                        }))
                      }
                    >
                    <div>
                      <p className="text-slate-400 text-sm mb-3">
                        รายการงวด — ปล่อยทีละงวด ระบบจะหักค่าธรรมเนียมอัตโนมัติ
                      </p>
                      <div className="space-y-3">
                        {milestones.map((m) => (
                          <div
                            key={m.id}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-white border border-slate-200"
                          >
                            <div className="flex items-center gap-3">
                              <span className="font-medium text-slate-200">
                                งวดที่ {m.order}
                              </span>
                                <span className="text-emerald-600 font-mono">
                                ฿{m.amount.toLocaleString()}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  m.status === "released"
                                    ? "bg-emerald-500/20 text-emerald-400"
                                    : "bg-amber-500/20 text-amber-400"
                                }`}
                              >
                                {m.status === "released"
                                  ? "ปล่อยแล้ว"
                                  : "รอปล่อย"}
                              </span>
                              {m.released_at && (
                                <span className="text-xs text-slate-500">
                                  {new Date(m.released_at).toLocaleString(
                                    "th-TH",
                                  )}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {m.status === "released" && (
                                <button
                                  type="button"
                                  onClick={() => setReceiptMilestone(m)}
                                  className="px-4 py-2 rounded-xl bg-white text-slate-700 border border-slate-300 font-medium hover:bg-slate-50 flex items-center gap-2"
                                >
                                  <FileText size={16} />
                                  ดูใบเสร็จ
                                </button>
                              )}
                              {m.status === "pending" &&
                                !(
                                  isEmployer &&
                                  workSubmissionStatus === "submitted"
                                ) && (
                                  <button
                                    type="button"
                                    onClick={() => handleReleaseMilestone(m.id)}
                                    disabled={!!releasingMilestoneId}
                                    className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-2"
                                  >
                                    {releasingMilestoneId === m.id ? (
                                      <Loader2
                                        size={16}
                                        className="animate-spin"
                                      />
                                    ) : (
                                      <CheckCircle size={16} />
                                    )}
                                    ปล่อยเงินงวดนี้
                                  </button>
                                )}
                              {m.status === "pending" &&
                                isEmployer &&
                                workSubmissionStatus === "submitted" && (
                                  <span className="text-xs text-slate-400">
                                    ใช้ปุ่ม อนุมัติและปล่อยเงิน ด้านบน
                                  </span>
                                )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    </EscrowCollapsibleSection>
                  )}
                </div>
              ) : (
                <>
                  {isTalent && (
                    <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200/90">
                      <p className="text-sm font-medium">
                        📤 ปุ่มส่งงานอยู่ที่ไหน?
                      </p>
                      <p className="text-xs mt-1 text-slate-300">
                        เมื่อนายจ้าง{escrowTransferredLabel()} ปุ่ม{" "}
                        <strong>ส่งงาน (Submit Final Work)</strong>{" "}
                        จะปรากฏที่ส่วนส่งมอบงาน — รอให้โอนเงินก่อน
                      </p>
                    </div>
                  )}
                  {/* Milestone Proposal — Talent เสนอ / Employer อนุมัติ */}
                  {proposalLoading ? (
                    <div className="flex items-center gap-2 text-slate-500 py-4">
                      <Loader2 size={18} className="animate-spin" />{" "}
                      โหลดโครงงวด...
                    </div>
                  ) : (
                    <div className="space-y-4 p-4 rounded-xl bg-white border border-slate-200">
                      <h4 className="font-medium text-slate-900">
                        โครงงวด (เสนองวดงาน)
                      </h4>
                      {milestoneProposal?.status === "approved" ? (
                        <p className="text-emerald-400 text-sm">
                          ✓ โครงงวดได้รับการอนุมัติแล้ว — เมื่อโอนเงินค้ำ
                          จะสร้างงวดตามนี้
                        </p>
                      ) : isTalent &&
                        (!milestoneProposal ||
                          milestoneProposal.status === "rejected") ? (
                        <div className="space-y-3">
                          <p className="text-slate-400 text-sm">
                            เสนอโครงงวด เช่น 50% ก่อนเริ่ม, 50% เมื่อส่งมอบ
                            (ยอดรวมต้องเท่ากับ ฿
                            {(agreedAmount ?? 0).toLocaleString()})
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              const half =
                                Math.round(((agreedAmount ?? 0) / 2) * 100) /
                                100;
                              setProposalItems([
                                {
                                  order: 1,
                                  amount: String(half),
                                  description: "ก่อนเริ่มงาน",
                                },
                                {
                                  order: 2,
                                  amount: String((agreedAmount ?? 0) - half),
                                  description: "เมื่อส่งมอบ",
                                },
                              ]);
                            }}
                            className="text-sm text-amber-400 hover:underline"
                          >
                            ใช้ 50/50
                          </button>
                          {proposalItems.map((item, i) => (
                            <div
                              key={i}
                              className="flex flex-wrap gap-2 items-center"
                            >
                              <input
                                type="number"
                                step="0.01"
                                min={0}
                                value={item.amount}
                                onChange={(e) =>
                                  setProposalItems((prev) =>
                                    prev.map((p, j) =>
                                      j === i
                                        ? { ...p, amount: e.target.value }
                                        : p,
                                    ),
                                  )
                                }
                                placeholder="จำนวนบาท"
                                className="w-28 px-3 py-2 rounded-lg bg-charcoal-800 border border-slate-600 text-slate-100"
                              />
                              <input
                                type="text"
                                value={item.description}
                                onChange={(e) =>
                                  setProposalItems((prev) =>
                                    prev.map((p, j) =>
                                      j === i
                                        ? { ...p, description: e.target.value }
                                        : p,
                                    ),
                                  )
                                }
                                placeholder="รายละเอียด"
                                className="flex-1 min-w-[120px] px-3 py-2 rounded-lg bg-charcoal-800 border border-slate-600 text-slate-100"
                              />
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={handleSubmitProposal}
                            disabled={proposalSubmitting}
                            className="px-4 py-2 rounded-xl bg-amber-500 text-charcoal-900 font-medium disabled:opacity-50 flex items-center gap-2"
                          >
                            {proposalSubmitting ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : null}
                            ส่งโครงงวด
                          </button>
                        </div>
                      ) : !isTalent &&
                        milestoneProposal?.status === "pending" ? (
                        <div className="space-y-3">
                          <p className="text-slate-400 text-sm">
                            ผู้รับจ้างส่งโครงงวดมา — อนุมัติหรือแก้ไขได้
                          </p>
                          <ul className="space-y-1 text-slate-300">
                            {milestoneProposal.items.map((it, i) => (
                              <li key={i}>
                                งวด {i + 1}: ฿
                                {Number(it.amount).toLocaleString()} —{" "}
                                {it.description || "-"}
                              </li>
                            ))}
                          </ul>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleProposalAction("approve")}
                              disabled={proposalSubmitting}
                              className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-medium disabled:opacity-50"
                            >
                              อนุมัติ
                            </button>
                            <button
                              type="button"
                              onClick={() => handleProposalAction("reject")}
                              disabled={proposalSubmitting}
                              className="px-4 py-2 rounded-xl bg-slate-600 text-slate-300 font-medium disabled:opacity-50"
                            >
                              ปฏิเสธ
                            </button>
                          </div>
                        </div>
                      ) : milestoneProposal?.status === "pending" &&
                        isTalent ? (
                        <p className="text-amber-400 text-sm">
                          รอนายจ้างอนุมัติโครงงวด
                        </p>
                      ) : null}
                    </div>
                  )}

                  {isEmployer ? (
                    <>
                      <p className="text-slate-300">
                        {escrowTransferLabel()} (กระเป๋ากลาง) เพื่อกันเงินให้ผู้รับจ้าง
                        — ระบบจะปล่อยเมื่องานส่งมอบ
                      </p>
                      <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                        <input
                          type="checkbox"
                          checked={hasInsurance}
                          onChange={(e) => setHasInsurance(e.target.checked)}
                          className="rounded border-slate-500"
                        />
                        <Shield size={18} className="text-amber-400" />
                        เบี้ยประกันงาน (10%)
                      </label>
                      <div className="flex flex-wrap items-end gap-4">
                        <div>
                          <label className="block text-sm text-slate-500 mb-1">
                            จำนวนเงิน (บาท)
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={escrowAmount}
                            onChange={(e) => setEscrowAmount(e.target.value)}
                            placeholder={
                              agreedAmount ? String(agreedAmount) : "เช่น 5000"
                            }
                            className="w-40 px-4 py-3 rounded-xl bg-charcoal-800 border border-slate-600 text-slate-100"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleEscrow}
                          disabled={escrowSubmitting || !escrowAmount.trim()}
                          className="px-5 py-3 rounded-xl bg-amber-500 text-charcoal-900 font-bold disabled:opacity-50 flex items-center gap-2"
                        >
                          {escrowSubmitting ? (
                            <Loader2 size={18} className="animate-spin" />
                          ) : (
                            <Wallet size={18} />
                          )}
                          โอนเข้าเงินค้ำ
                        </button>
                      </div>
                      {escrowBreakdown && Number(escrowAmount) > 0 && (
                        <div className="mt-4">
                          <PaymentBreakdown
                            jobFee={escrowBreakdown.jobFee}
                            handlingFeeAmount={
                              escrowBreakdown.handlingFeeAmount
                            }
                            paymentMarkupAmount={
                              escrowBreakdown.paymentMarkupAmount
                            }
                            commissionFeeAmount={
                              escrowBreakdown.commissionFeeAmount
                            }
                            talentReceives={escrowBreakdown.talentReceives}
                            totalToPay={escrowBreakdown.totalToPay}
                            insuranceAmount={
                              escrowBreakdown.insurance_amount ?? 0
                            }
                            mode="advance"
                            variant="dark"
                            showBenefits={true}
                            showComparison={true}
                            payoutByTier={escrowBreakdown.payout_by_tier}
                            talentCurrentTier={
                              escrowBreakdown.talent_current_tier ?? "none"
                            }
                          />
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="space-y-6">
                      {/* Status bar — prominent */}
                      <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/15 border border-amber-500/40">
                        <Clock size={24} className="text-amber-400 shrink-0" />
                        <div>
                          <p className="font-medium text-amber-200">
                            {waitingEmployerEscrowLabel()}
                          </p>
                          <p className="text-sm text-slate-400">
                            เมื่อนายจ้างโอนเงินแล้ว
                            คุณจะเห็นรายการงวดและรับเงินตามที่ตกลง
                          </p>
                        </div>
                      </div>

                      {/* Talent Payout Breakdown */}
                      {escrowBreakdown && agreedAmount && agreedAmount > 0 && (
                        <div className="space-y-4">
                          <div className="rounded-xl border border-slate-600/80 bg-slate-800/50 overflow-hidden">
                            <div className="px-4 py-3 bg-slate-700/50 border-b border-slate-600">
                              <h4 className="font-bold text-slate-100 text-sm">
                                ยอดที่คุณจะได้รับจากงานนี้
                              </h4>
                            </div>
                            <div className="p-4 space-y-2 text-sm">
                              <div className="flex justify-between items-center text-slate-300">
                                <span>ค่าจ้างงาน</span>
                                <span className="font-mono">
                                  ฿
                                  {escrowBreakdown.jobFee.toLocaleString(
                                    "th-TH",
                                  )}
                                </span>
                              </div>
                              <div className="flex justify-between items-center text-slate-300">
                                <span>
                                  หัก ค่าคอมมิชชั่นแพลตฟอร์ม (
                                  {Math.round(
                                    (escrowBreakdown.commissionFeeAmount /
                                      escrowBreakdown.jobFee) *
                                      100,
                                  )}
                                  %)
                                </span>
                                <span className="font-mono text-red-400">
                                  −฿
                                  {escrowBreakdown.commissionFeeAmount.toLocaleString(
                                    "th-TH",
                                  )}
                                </span>
                              </div>
                              <div className="flex justify-between items-center text-slate-300">
                                <span>
                                  หัก ค่าจัดหางาน (
                                  {Math.round(
                                    (escrowBreakdown.handlingFeeAmount /
                                      escrowBreakdown.jobFee) *
                                      100,
                                  )}
                                  %)
                                </span>
                                <span className="font-mono text-red-400">
                                  −฿
                                  {escrowBreakdown.handlingFeeAmount.toLocaleString(
                                    "th-TH",
                                  )}
                                </span>
                              </div>
                              <div className="border-t border-slate-600 pt-3 mt-2 flex justify-between items-center">
                                <span className="font-medium text-emerald-400">
                                  ยอดสุทธิที่คุณจะได้รับ
                                </span>
                                <span className="font-mono font-bold text-lg text-emerald-400">
                                  ฿
                                  {escrowBreakdown.talentReceives.toLocaleString(
                                    "th-TH",
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Membership Upsell */}
                          {escrowBreakdown.payout_by_tier && (
                            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-4">
                              <h4 className="font-bold text-slate-100 flex items-center gap-2">
                                <Crown size={18} className="text-amber-400" />
                                รับเงินเพิ่มขึ้นจากงานนี้เพียงอัปเกรดเป็น Member
                              </h4>
                              <div className="space-y-4">
                                {(["silver", "gold", "platinum"] as const).map(
                                  (tierId) => {
                                    const t =
                                      escrowBreakdown.payout_by_tier?.[tierId];
                                    if (!t) return null;
                                    const isCurrent =
                                      (escrowBreakdown.talent_current_tier ??
                                        "none") === tierId;
                                    return (
                                      <div
                                        key={tierId}
                                        className={`flex items-center justify-between gap-4 p-4 rounded-xl border ${
                                          t.isBestValue
                                            ? "border-amber-500/50 bg-amber-500/15"
                                            : "border-slate-600/80 bg-slate-800/50"
                                        }`}
                                      >
                                        <div>
                                          <span className="font-medium text-slate-100">
                                            {t.labelTh}
                                            {t.isBestValue && (
                                              <span className="ml-1 text-xs text-amber-400">
                                                (ได้รับเงินเยอะที่สุด)
                                              </span>
                                            )}
                                          </span>
                                          <p className="text-xs text-slate-400 mt-0.5">
                                            รับสุทธิ ฿
                                            {t.payout.toLocaleString("th-TH")}{" "}
                                            (หักรวม {t.totalDeductionPercent}%)
                                          </p>
                                        </div>
                                        {!isCurrent ? (
                                          paymentsEnabled ? (
                                            <Link
                                              to="/vip"
                                              className="px-4 py-2 rounded-xl text-sm font-medium bg-amber-500 text-charcoal-900 hover:bg-amber-400 transition-colors shrink-0"
                                            >
                                              อัปเกรด
                                            </Link>
                                          ) : (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                notify(
                                                  "การชำระเงินถูกปิดชั่วคราวโดยผู้ดูแลระบบ",
                                                  "warning",
                                                )
                                              }
                                              className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-600 text-slate-300 cursor-not-allowed shrink-0 opacity-80"
                                            >
                                              อัปเกรด
                                            </button>
                                          )
                                        ) : (
                                          <span className="text-xs px-2 py-1 rounded text-emerald-400 bg-emerald-500/20 shrink-0">
                                            ปัจจุบัน
                                          </span>
                                        )}
                                      </div>
                                    );
                                  },
                                )}
                              </div>
                              <p className="text-xs text-slate-400">
                                สิทธิประโยชน์ของ Member
                                จะคำนวณจากยอดงานนี้ให้ทันทีเมื่อคุณอัปเกรด
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
  );
}
