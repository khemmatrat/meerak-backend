import React, { createContext, useContext } from "react";
import type {
  JobAdvanceAPI,
  AdvanceApplicantWithUser,
  QuotationCompareMeta,
  AdvanceMilestoneAPI,
} from "../../types/api";
import type { AdvanceProcurementRevision } from "../../services/jobService";
import type { JobBoardRemoteCopy } from "../../utils/jobBoardCopy";

export type JobWithEscrow = JobAdvanceAPI & {
  hired_user_id?: string;
  agreed_amount?: number;
  escrow_amount?: number;
  escrow_status?: string;
  work_submission_status?: string;
  work_submitted_at?: string;
  work_submission_url?: string;
  work_submission_links?: Array<{ url: string; label?: string }>;
  revision_count?: number;
  revision_limit?: number;
  revision_notes?: Array<{ note: string; requested_at: string }>;
};

export type EscrowBreakdown = {
  jobFee: number;
  handlingFeeAmount: number;
  paymentMarkupAmount: number;
  commissionFeeAmount: number;
  talentReceives: number;
  totalToPay: number;
  insurance_amount?: number;
  talent_current_tier?: string;
  payout_by_tier?: Record<
    string,
    {
      payout: number;
      commissionPercent: number;
      sourcePercent: number;
      totalDeductionPercent: number;
      label: string;
      labelTh: string;
      isBestValue?: boolean;
    }
  >;
};

export type MilestoneProposal = {
  id: string;
  items: Array<{ order: number; amount: number; description?: string }>;
  status: string;
};

export type EscrowSectionsOpen = {
  procurement: boolean;
  submission: boolean;
  milestones: boolean;
  proposal: boolean;
};

export type ManageAdvanceJobContextValue = {
  id: string | undefined;
  token: string | null | undefined;
  job: JobAdvanceAPI;
  isEmployer: boolean;
  isTalent: boolean;
  chatEnabled: boolean;
  paymentsEnabled: boolean;
  jobBoardCopy: JobBoardRemoteCopy;
  analytics: {
    view_count: number;
    applicant_count: number;
    conversion_rate?: string | null;
    time_to_hire_days?: number | null;
  } | null;
  applicants: AdvanceApplicantWithUser[];
  quotationScores: QuotationCompareMeta | undefined;
  patching: string | null;
  previewApplicantId: string | null;
  setPreviewApplicantId: (id: string | null) => void;
  applicantActionsOpen: string | null;
  setApplicantActionsOpen: (id: string | null) => void;
  t: (key: string) => string;
  notify: (
    msg: string,
    type?: "success" | "info" | "error" | "warning",
  ) => void;
  handlePatch: (
    applicantUserId: string,
    status: "shortlisted" | "hired" | "rejected",
    agreed?: number,
  ) => Promise<void>;
  handleViewQuotationVersions: (a: AdvanceApplicantWithUser) => Promise<void>;
  setCounterOfferApplicant: (a: AdvanceApplicantWithUser | null) => void;
  setProfileModalApplicant: (a: AdvanceApplicantWithUser | null) => void;
  setReportModalUser: (a: AdvanceApplicantWithUser | null) => void;
  handleBlockApplicant: (a: AdvanceApplicantWithUser) => void;
  // Escrow pane
  hiredUserId: string | undefined;
  escrowStatus: string;
  escrowAmountNum: number;
  revisionCount: number;
  revisionLimit: number;
  jobWithEscrow: JobWithEscrow;
  workSubmissionStatus: string;
  escrowSectionsOpen: EscrowSectionsOpen;
  setEscrowSectionsOpen: React.Dispatch<React.SetStateAction<EscrowSectionsOpen>>;
  procurementWinnerReason: string;
  setProcurementWinnerReason: (v: string) => void;
  selectedProcurementRevision: AdvanceProcurementRevision | null;
  procurementRevisions: AdvanceProcurementRevision[];
  setSelectedProcurementRevisionId: (id: string) => void;
  procurementExporting: boolean;
  procurementSubmitting: boolean;
  procurementAgencyForm: "th_gov_procurement_v1" | "egp_v1";
  setProcurementAgencyForm: (v: "th_gov_procurement_v1" | "egp_v1") => void;
  handleCreateProcurementRevision: () => Promise<void>;
  handleExportProcurement: (format: "csv" | "pdf" | "json") => Promise<void>;
  handleApproveAndPay: () => Promise<void>;
  approvePaySubmitting: boolean;
  setShowRequestRevisionModal: (v: boolean) => void;
  setShowSubmitWorkModal: (v: boolean) => void;
  milestones: AdvanceMilestoneAPI[];
  releasingMilestoneId: string | null;
  handleReleaseMilestone: (milestoneId: string) => Promise<void>;
  setReceiptMilestone: (m: AdvanceMilestoneAPI | null) => void;
  proposalLoading: boolean;
  milestoneProposal: MilestoneProposal | null;
  proposalItems: Array<{ order: number; amount: string; description: string }>;
  setProposalItems: React.Dispatch<
    React.SetStateAction<
      Array<{ order: number; amount: string; description: string }>
    >
  >;
  proposalSubmitting: boolean;
  handleSubmitProposal: () => Promise<void>;
  handleProposalAction: (
    action: "approve" | "reject" | "edit",
  ) => Promise<void>;
  agreedAmount: number | undefined;
  hasInsurance: boolean;
  setHasInsurance: (v: boolean) => void;
  escrowAmount: string;
  setEscrowAmount: (v: string) => void;
  escrowSubmitting: boolean;
  handleEscrow: () => Promise<void>;
  escrowBreakdown: EscrowBreakdown | null;
};

const ManageAdvanceJobContext = createContext<ManageAdvanceJobContextValue | null>(
  null,
);

export function ManageAdvanceJobProvider({
  value,
  children,
}: {
  value: ManageAdvanceJobContextValue;
  children: React.ReactNode;
}) {
  return (
    <ManageAdvanceJobContext.Provider value={value}>
      {children}
    </ManageAdvanceJobContext.Provider>
  );
}

export function useManageAdvanceJob() {
  const ctx = useContext(ManageAdvanceJobContext);
  if (!ctx) {
    throw new Error("useManageAdvanceJob must be used within ManageAdvanceJobProvider");
  }
  return ctx;
}
