import React from "react";
import {
  CounterOfferModal,
  QuotationVersionPanel,
} from "../QuotationCompareTable";
import type {
  JobAdvanceAPI,
  AdvanceApplicantWithUser,
  AdvanceMilestoneAPI,
  QuotationCompareMeta,
  AdvanceQuotationVersion,
} from "../../types/api";
import { ConfirmDialog } from "./ConfirmDialog";
import { HireSummaryModal } from "./HireSummaryModal";
import { MilestoneReceiptModal } from "./MilestoneReceiptModal";
import { CongratsModal } from "./CongratsModal";
import { ApplicantProfileModal } from "./ApplicantProfileModal";
import { SubmitWorkModal } from "./SubmitWorkModal";
import { RequestRevisionModal } from "./RequestRevisionModal";
import { ReportApplicantModal } from "./ReportApplicantModal";

export type ManageAdvanceJobModalsProps = {
  jobId?: string;
  job: JobAdvanceAPI;
  jobBoardCopy: { hireSummarySteps: string[] };
  t: (key: string) => string;
  isEmployer: boolean;
  receiptMilestone: AdvanceMilestoneAPI | null;
  setReceiptMilestone: (m: AdvanceMilestoneAPI | null) => void;
  showHireSummary: boolean;
  hireSummaryData: { talentName: string; agreedAmount: number } | null;
  setShowHireSummary: (v: boolean) => void;
  onGoEscrowTab: () => void;
  blockConfirmUser: AdvanceApplicantWithUser | null;
  setBlockConfirmUser: (a: AdvanceApplicantWithUser | null) => void;
  onConfirmBlock: () => void;
  congratsOpen: boolean;
  setCongratsOpen: (v: boolean) => void;
  myReview: { id: string } | null;
  onGoReviewTab: () => void;
  counterOfferApplicant: AdvanceApplicantWithUser | null;
  setCounterOfferApplicant: (a: AdvanceApplicantWithUser | null) => void;
  counterOfferSubmitting: boolean;
  quotationScores: QuotationCompareMeta | undefined;
  onCounterOfferSubmit: (
    amount: number,
    timelineDays: number,
    editReason: string,
  ) => Promise<void>;
  versionPanelApplicant: AdvanceApplicantWithUser | null;
  setVersionPanelApplicant: (a: AdvanceApplicantWithUser | null) => void;
  quotationVersions: AdvanceQuotationVersion[];
  setQuotationVersions: (v: AdvanceQuotationVersion[]) => void;
  profileModalApplicant: AdvanceApplicantWithUser | null;
  setProfileModalApplicant: (a: AdvanceApplicantWithUser | null) => void;
  profileModalData: { avatar_url?: string; bio?: string } | null;
  showSubmitWorkModal: boolean;
  setShowSubmitWorkModal: (v: boolean) => void;
  submitWorkUrl: string;
  setSubmitWorkUrl: (v: string) => void;
  submitWorkLinks: Array<{ url: string; label: string }>;
  setSubmitWorkLinks: React.Dispatch<
    React.SetStateAction<Array<{ url: string; label: string }>>
  >;
  submitWorkSubmitting: boolean;
  onSubmitWork: () => void;
  showRequestRevisionModal: boolean;
  setShowRequestRevisionModal: (v: boolean) => void;
  revisionNote: string;
  setRevisionNote: (v: string) => void;
  revisionCount: number;
  revisionLimit: number;
  revisionSubmitting: boolean;
  onRequestRevision: () => void;
  reportModalUser: AdvanceApplicantWithUser | null;
  setReportModalUser: (a: AdvanceApplicantWithUser | null) => void;
  reportReason: string;
  setReportReason: (v: string) => void;
  reportBlockLoading: boolean;
  onReportApplicant: () => void;
};

export function ManageAdvanceJobModals(props: ManageAdvanceJobModalsProps) {
  const {
    jobId,
    job,
    jobBoardCopy,
    t,
    isEmployer,
    receiptMilestone,
    setReceiptMilestone,
    showHireSummary,
    hireSummaryData,
    setShowHireSummary,
    onGoEscrowTab,
    blockConfirmUser,
    setBlockConfirmUser,
    onConfirmBlock,
    congratsOpen,
    setCongratsOpen,
    myReview,
    onGoReviewTab,
    counterOfferApplicant,
    setCounterOfferApplicant,
    counterOfferSubmitting,
    quotationScores,
    onCounterOfferSubmit,
    versionPanelApplicant,
    setVersionPanelApplicant,
    quotationVersions,
    setQuotationVersions,
    profileModalApplicant,
    setProfileModalApplicant,
    profileModalData,
    showSubmitWorkModal,
    setShowSubmitWorkModal,
    submitWorkUrl,
    setSubmitWorkUrl,
    submitWorkLinks,
    setSubmitWorkLinks,
    submitWorkSubmitting,
    onSubmitWork,
    showRequestRevisionModal,
    setShowRequestRevisionModal,
    revisionNote,
    setRevisionNote,
    revisionCount,
    revisionLimit,
    revisionSubmitting,
    onRequestRevision,
    reportModalUser,
    setReportModalUser,
    reportReason,
    setReportReason,
    reportBlockLoading,
    onReportApplicant,
  } = props;

  return (
    <>
      {receiptMilestone && (
        <MilestoneReceiptModal
          jobTitle={job.title}
          jobId={jobId}
          milestone={receiptMilestone}
          onClose={() => setReceiptMilestone(null)}
        />
      )}

      {showHireSummary && hireSummaryData && (
        <HireSummaryModal
          talentName={hireSummaryData.talentName}
          agreedAmount={hireSummaryData.agreedAmount}
          steps={jobBoardCopy.hireSummarySteps}
          onGoEscrow={() => {
            setShowHireSummary(false);
            onGoEscrowTab();
          }}
          onClose={() => setShowHireSummary(false)}
        />
      )}

      {blockConfirmUser && (
        <ConfirmDialog
          title="บล็อกผู้ใช้นี้?"
          message="จะไม่เห็นข้อความหรือติดต่อกับผู้ใช้นี้ได้อีก"
          confirmLabel="บล็อก"
          cancelLabel="ยกเลิก"
          danger
          onConfirm={onConfirmBlock}
          onCancel={() => setBlockConfirmUser(null)}
        />
      )}

      {congratsOpen && (
        <CongratsModal
          isEmployer={isEmployer}
          hasMyReview={!!myReview}
          onClose={() => setCongratsOpen(false)}
          onGoReview={onGoReviewTab}
        />
      )}

      {counterOfferApplicant && (
        <CounterOfferModal
          applicant={counterOfferApplicant}
          maxBudget={job.max_budget}
          currentVersion={counterOfferApplicant.quotation?.version || 1}
          maxVersions={quotationScores?.expiry_rules?.max_versions || 3}
          submitting={counterOfferSubmitting}
          onSubmit={onCounterOfferSubmit}
          onClose={() => setCounterOfferApplicant(null)}
        />
      )}

      {versionPanelApplicant && (
        <QuotationVersionPanel
          versions={quotationVersions}
          talentName={versionPanelApplicant.full_name}
          onClose={() => {
            setVersionPanelApplicant(null);
            setQuotationVersions([]);
          }}
        />
      )}

      {profileModalApplicant && (
        <ApplicantProfileModal
          applicant={profileModalApplicant}
          profileData={profileModalData}
          t={t}
          onClose={() => setProfileModalApplicant(null)}
        />
      )}

      {showSubmitWorkModal && (
        <SubmitWorkModal
          submitWorkUrl={submitWorkUrl}
          setSubmitWorkUrl={setSubmitWorkUrl}
          submitWorkLinks={submitWorkLinks}
          setSubmitWorkLinks={setSubmitWorkLinks}
          submitting={submitWorkSubmitting}
          onSubmit={onSubmitWork}
          onClose={() => setShowSubmitWorkModal(false)}
        />
      )}

      {showRequestRevisionModal && (
        <RequestRevisionModal
          revisionNote={revisionNote}
          setRevisionNote={setRevisionNote}
          revisionCount={revisionCount}
          revisionLimit={revisionLimit}
          submitting={revisionSubmitting}
          onSubmit={onRequestRevision}
          onClose={() => {
            setShowRequestRevisionModal(false);
            setRevisionNote("");
          }}
        />
      )}

      {reportModalUser && (
        <ReportApplicantModal
          user={reportModalUser}
          reportReason={reportReason}
          setReportReason={setReportReason}
          loading={reportBlockLoading}
          onSubmit={onReportApplicant}
          onClose={() => {
            setReportModalUser(null);
            setReportReason("");
          }}
        />
      )}
    </>
  );
}
