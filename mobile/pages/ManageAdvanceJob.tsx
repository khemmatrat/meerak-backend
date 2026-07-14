import React, { useEffect, useState, useRef, useMemo } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import confetti from "canvas-confetti";
import {
  ArrowLeft,
  Users,
  MessageCircle,
  Wallet,
  Star,
  Loader2,
  FileText,
  PartyPopper,
  RefreshCw,
  WifiOff,
} from "lucide-react";
import {
  getAdvanceJobById,
  getAdvanceJobApplicants,
  patchAdvanceApplicant,
  postEmployerCounterOffer,
  getQuotationVersions,
  getPaymentFeeConfig,
  getEscrowBreakdown,
  postAdvanceJobEscrow,
  getAdvanceJobMilestones,
  releaseAdvanceMilestone,
  getAdvanceJobMessages,
  postAdvanceJobMessage,
  getAdvanceJobReviews,
  getAdvanceJobMyReview,
  postAdvanceJobReview,
  getMilestoneProposal,
  submitMilestoneProposal,
  approveMilestoneProposal,
  getScopeAgreement,
  putScopeAgreement,
  confirmScopeAgreement,
  getAdvanceJobAnalytics,
  submitWork,
  requestRevision,
  releaseAllAdvanceEscrow,
  createAdvanceProcurementRevision,
  getAdvanceProcurementRevisions,
  downloadAdvanceProcurementPackage,
  JobServiceError,
  type AdvanceProcurementRevision,
} from "../services/jobService";
import type {
  JobAdvanceAPI,
  AdvanceApplicantWithUser,
  AdvanceJobMessageAPI,
  AdvanceMilestoneAPI,
  QuotationCompareMeta,
  AdvanceQuotationVersion,
} from "../types/api";
import { ManageJobSkeleton, type ManageJobSkeletonVariant } from "../components/ManageJobSkeleton";
import {
  ManageJobHeader,
  ManageJobTabs,
  ChatPane,
  ScopePane,
  ReviewPane,
  ApplicantsPane,
  EscrowPane,
  JobPipelineStepper,
  ManageAdvanceJobModals,
  ManageAdvanceJobProvider,
} from "../components/manageAdvanceJob";
import type { JobWithEscrow } from "../components/manageAdvanceJob/ManageAdvanceJobContext";
import { isMockJobId } from "../services/mockJobsForReview";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { useLanguage } from "../context/LanguageContext";
import { useMobileAppConfig } from "../context/MobileAppConfigContext";
import { resolveJobBoardCopy } from "../utils/jobBoardCopy";
import {
  ADVANCE_TALENT_LABEL,
  escrowTransferredLabel,
} from "../utils/advanceJobLabels";
import { trackAdvanceEvent, advanceJobEventMeta } from "../utils/analytics";

type Tab = "applicants" | "chat" | "escrow" | "scope" | "review";

const PROCUREMENT_REASON_TEMPLATE = `เหตุผลคัดเลือกผู้ชนะ (Template)
- ความเหมาะสมของผลงานต่อขอบเขตงาน:
- งบประมาณ/ความคุ้มค่า:
- ระยะเวลาส่งมอบ:
- ความน่าเชื่อถือและประวัติการทำงาน:
- เงื่อนไขเพิ่มเติม (ถ้ามี):`;

export const ManageAdvanceJob: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { token, user } = useAuth();
  const { notify } = useNotification();
  const { t } = useLanguage();
  const { config } = useMobileAppConfig();
  const jobBoardCopy = resolveJobBoardCopy(config.remote);
  const chatEnabled = config.featureFlags.enableChat;
  const paymentsEnabled = config.featureFlags.enablePayments;
  const [job, setJob] = useState<JobAdvanceAPI | null>(null);
  const [applicants, setApplicants] = useState<AdvanceApplicantWithUser[]>([]);
  const [quotationScores, setQuotationScores] = useState<
    QuotationCompareMeta | undefined
  >(undefined);
  const [counterOfferApplicant, setCounterOfferApplicant] =
    useState<AdvanceApplicantWithUser | null>(null);
  const [counterOfferSubmitting, setCounterOfferSubmitting] = useState(false);
  const [versionPanelApplicant, setVersionPanelApplicant] =
    useState<AdvanceApplicantWithUser | null>(null);
  const [quotationVersions, setQuotationVersions] = useState<
    AdvanceQuotationVersion[]
  >([]);
  const [messages, setMessages] = useState<AdvanceJobMessageAPI[]>([]);
  const [milestones, setMilestones] = useState<AdvanceMilestoneAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("applicants");
  const [patching, setPatching] = useState<string | null>(null);
  const [escrowAmount, setEscrowAmount] = useState("");
  const [escrowSubmitting, setEscrowSubmitting] = useState(false);
  const [feeConfig, setFeeConfig] = useState<{
    paymentMarkupPercent: number;
  } | null>(null);
  const [escrowBreakdown, setEscrowBreakdown] = useState<{
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
  } | null>(null);
  const [hasInsurance, setHasInsurance] = useState(false);
  const [releasingMilestoneId, setReleasingMilestoneId] = useState<
    string | null
  >(null);
  const [chatBody, setChatBody] = useState("");
  const [chatSubmitting, setChatSubmitting] = useState(false);
  const [receiptMilestone, setReceiptMilestone] =
    useState<AdvanceMilestoneAPI | null>(null);
  const [congratsOpen, setCongratsOpen] = useState(false);
  const [showHireSummary, setShowHireSummary] = useState(false);
  const [hireSummaryData, setHireSummaryData] = useState<{
    talentName: string;
    agreedAmount: number;
  } | null>(null);
  const [blockConfirmUser, setBlockConfirmUser] =
    useState<AdvanceApplicantWithUser | null>(null);
  const showedCelebrationRef = useRef(false);
  const [myReview, setMyReview] = useState<{
    id: string;
    rating: number;
    comment: string;
    created_at: string;
  } | null>(null);
  const [reviews, setReviews] = useState<
    Array<{
      id: string;
      rating: number;
      comment: string;
      created_at: string;
      reviewee_id?: string;
    }>
  >([]);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [applicantActionsOpen, setApplicantActionsOpen] = useState<
    string | null
  >(null);
  const [escrowSectionsOpen, setEscrowSectionsOpen] = useState({
    procurement: false,
    submission: true,
    milestones: false,
    proposal: true,
  });
  const [previewApplicantId, setPreviewApplicantId] = useState<string | null>(
    null,
  );
  const [reportModalUser, setReportModalUser] =
    useState<AdvanceApplicantWithUser | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportBlockLoading, setReportBlockLoading] = useState(false);
  const [milestoneProposal, setMilestoneProposal] = useState<{
    id: string;
    items: Array<{ order: number; amount: number; description?: string }>;
    status: string;
  } | null>(null);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalSubmitting, setProposalSubmitting] = useState(false);
  const [proposalItems, setProposalItems] = useState<
    Array<{ order: number; amount: string; description: string }>
  >([
    { order: 1, amount: "", description: "ก่อนเริ่มงาน" },
    { order: 2, amount: "", description: "เมื่อส่งมอบ" },
  ]);
  const [scopeAgreement, setScopeAgreement] = useState<{
    id: string;
    deliverables: Array<{ text: string; order?: number }>;
    employer_confirmed_at: string | null;
    talent_confirmed_at: string | null;
    both_confirmed: boolean;
  } | null>(null);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [scopeSubmitting, setScopeSubmitting] = useState(false);
  const [scopeDeliverables, setScopeDeliverables] = useState<string[]>([
    "",
    "",
    "",
  ]);
  const [analytics, setAnalytics] = useState<{
    view_count: number;
    applicant_count: number;
    conversion_rate: string | null;
    time_to_hire_hours: number | null;
    time_to_hire_days: string | null;
  } | null>(null);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [swipeRejectId, setSwipeRejectId] = useState<string | null>(null);
  const [profileModalApplicant, setProfileModalApplicant] =
    useState<AdvanceApplicantWithUser | null>(null);
  const [profileModalData, setProfileModalData] = useState<{
    bio?: string;
    avatar_url?: string;
  } | null>(null);
  const [showSubmitWorkModal, setShowSubmitWorkModal] = useState(false);
  const [submitWorkUrl, setSubmitWorkUrl] = useState("");
  const [submitWorkLinks, setSubmitWorkLinks] = useState<
    Array<{ url: string; label: string }>
  >([{ url: "", label: "" }]);
  const [submitWorkSubmitting, setSubmitWorkSubmitting] = useState(false);
  const [showRequestRevisionModal, setShowRequestRevisionModal] =
    useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const [revisionSubmitting, setRevisionSubmitting] = useState(false);
  const [procurementWinnerReason, setProcurementWinnerReason] = useState(
    PROCUREMENT_REASON_TEMPLATE,
  );
  const [procurementSubmitting, setProcurementSubmitting] = useState(false);
  const [procurementExporting, setProcurementExporting] = useState(false);
  const [procurementRevisions, setProcurementRevisions] = useState<
    AdvanceProcurementRevision[]
  >([]);
  const [selectedProcurementRevisionId, setSelectedProcurementRevisionId] =
    useState("");
  const [procurementAgencyForm, setProcurementAgencyForm] = useState<
    "th_gov_procurement_v1" | "egp_v1"
  >("th_gov_procurement_v1");
  const [approvePaySubmitting, setApprovePaySubmitting] = useState(false);

  const jobWithEscrow = job as
    | (JobAdvanceAPI & {
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
      })
    | null;
  const hiredUserId = jobWithEscrow?.hired_user_id;
  const agreedAmount = jobWithEscrow?.agreed_amount;
  const escrowAmountNum = jobWithEscrow?.escrow_amount ?? 0;
  const escrowStatus = jobWithEscrow?.escrow_status || "none";
  const workSubmissionStatus = jobWithEscrow?.work_submission_status || "none";
  const revisionCount = jobWithEscrow?.revision_count ?? 0;
  const revisionLimit = jobWithEscrow?.revision_limit ?? 3;
  const currentUserId = user?.id ?? (user as any)?.userId;
  const isEmployer =
    job &&
    currentUserId &&
    String((job as any).employer_id) === String(currentUserId);
  const isTalent =
    hiredUserId &&
    currentUserId &&
    String(hiredUserId) === String(currentUserId);
  const latestProcurementRevision = procurementRevisions[0] || null;
  const selectedProcurementRevision =
    procurementRevisions.find((r) => r.id === selectedProcurementRevisionId) ||
    latestProcurementRevision;

  useEffect(() => {
    if (!procurementRevisions.length) {
      if (selectedProcurementRevisionId) setSelectedProcurementRevisionId("");
      return;
    }
    const stillExists = procurementRevisions.some(
      (r) => r.id === selectedProcurementRevisionId,
    );
    if (!stillExists) {
      setSelectedProcurementRevisionId(procurementRevisions[0].id);
    }
  }, [procurementRevisions, selectedProcurementRevisionId]);

  const load = async () => {
    if (!id || !token) return;
    const cleanId = String(id).trim();
    if (!cleanId || cleanId === "undefined") {
      setLoading(false);
      setJob(null);
      return;
    }
    setLoading(true);
    try {
      const j = await getAdvanceJobById(cleanId, token);
      if (!j) {
        setJob(null);
        setLoading(false);
        return;
      }
      setJob(j);
      try {
        const [applicantsRes, m, milestonesRes] = await Promise.all([
          getAdvanceJobApplicants(cleanId, token),
          getAdvanceJobMessages(cleanId, token),
          getAdvanceJobMilestones(cleanId, token),
        ]);
        setApplicants(applicantsRes.applicants ?? []);
        setQuotationScores(applicantsRes.quotation_scores);
        setMessages(m ?? []);
        setMilestones(milestonesRes ?? []);
      } catch (secondaryErr) {
        setApplicants([]);
        setMessages([]);
        setMilestones([]);
      }
      try {
        const revs = await getAdvanceProcurementRevisions(cleanId, token);
        setProcurementRevisions(revs || []);
      } catch {
        setProcurementRevisions([]);
      }
      if (j && (j as any).agreed_amount != null)
        setEscrowAmount(String((j as any).agreed_amount));
      if (j && (j as any).status === "completed") {
        try {
          const [myR, list] = await Promise.all([
            getAdvanceJobMyReview(cleanId, token),
            getAdvanceJobReviews(cleanId),
          ]);
          setMyReview(myR ?? null);
          setReviews(
            (list ?? []).map((r) => ({
              id: r.id,
              rating: r.rating,
              comment: r.comment || "",
              created_at: r.created_at,
              reviewee_id: r.reviewee_id,
            })),
          );
        } catch {
          /* optional */
        }
      }
    } catch (e) {
      const msg = e instanceof JobServiceError ? e.message : "โหลดไม่สำเร็จ";
      notify(msg, "error");
      setJob(null);
    } finally {
      setLoading(false);
    }
  };

  const fireConfetti = () => {
    try {
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.7 } });
      setTimeout(() => {
        confetti({
          particleCount: 80,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
        });
        confetti({
          particleCount: 80,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
        });
      }, 200);
    } catch (_) {}
  };

  useEffect(() => {
    load();
  }, [id, token]);

  useEffect(() => {
    const urlTab = searchParams.get("tab") as Tab | null;
    if (
      urlTab &&
      ["applicants", "chat", "escrow", "scope", "review"].includes(urlTab)
    ) {
      setTab(urlTab);
    }
  }, [searchParams]);

  const setTabWithUrl = (next: Tab) => {
    setTab(next);
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set("tab", next);
        return p;
      },
      { replace: true },
    );
  };

  // โหลดข้อความใหม่ทุก 3 วินาที — ให้ทั้งสองฝั่งเห็นข้อความกันได้แบบ real-time
  useEffect(() => {
    if (!id || !token || !job?.hired_user_id) return;
    const poll = setInterval(async () => {
      try {
        const m = await getAdvanceJobMessages(id, token);
        setMessages((prev) => {
          if (!m || m.length === prev.length) return prev;
          const byId = new Map(prev.map((x) => [x.id, x]));
          m.forEach((x) => byId.set(x.id, x));
          return Array.from(byId.values()).sort(
            (a, b) =>
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime(),
          );
        });
      } catch {
        /* ignore */
      }
    }, 3000);
    return () => clearInterval(poll);
  }, [id, token, job?.hired_user_id]);

  const [escrowRefreshTrigger, setEscrowRefreshTrigger] = useState(0);
  const escrowHeld = escrowStatus === "held" || escrowStatus === "released";
  const isTalentEscrowWaiting =
    isTalent && !escrowHeld && (agreedAmount ?? 0) > 0;
  const effectiveEscrowAmount = isTalentEscrowWaiting
    ? (agreedAmount ?? 0)
    : Math.max(0, Number(escrowAmount));
  useEffect(() => {
    if (
      !id ||
      !token ||
      tab !== "escrow" ||
      !hiredUserId ||
      effectiveEscrowAmount <= 0
    ) {
      setEscrowBreakdown(null);
      return;
    }
    getEscrowBreakdown(id, effectiveEscrowAmount, token, hasInsurance)
      .then(setEscrowBreakdown)
      .catch(() => setEscrowBreakdown(null));
  }, [
    id,
    token,
    tab,
    hiredUserId,
    effectiveEscrowAmount,
    hasInsurance,
    escrowRefreshTrigger,
  ]);

  // Refetch escrow breakdown when user returns (e.g. after Talent upgrades) — immediate update
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && tab === "escrow")
        setEscrowRefreshTrigger((k) => k + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [tab]);

  useEffect(() => {
    if (tab !== "escrow") return;
    setEscrowSectionsOpen({
      procurement: isEmployer && escrowStatus === "held",
      submission:
        workSubmissionStatus === "submitted" ||
        workSubmissionStatus === "revision_requested" ||
        (escrowStatus === "held" && workSubmissionStatus === "none"),
      milestones: milestones.length > 0 && escrowStatus === "held",
      proposal: !escrowHeld && !!hiredUserId,
    });
  }, [tab, escrowStatus, workSubmissionStatus, isEmployer, milestones.length, hiredUserId, escrowHeld]);

  useEffect(() => {
    if (!id || !token || tab !== "escrow" || !hiredUserId) return;
    setProposalLoading(true);
    getMilestoneProposal(id, token)
      .then((p) => {
        setMilestoneProposal(p ?? null);
        setProposalLoading(false);
      })
      .catch(() => setProposalLoading(false));
  }, [id, token, tab, hiredUserId]);

  useEffect(() => {
    if (tab !== "escrow" || !isEmployer) return;
    getPaymentFeeConfig().then((c) =>
      setFeeConfig({ paymentMarkupPercent: c.paymentMarkupPercent }),
    );
  }, [tab, isEmployer]);

  useEffect(() => {
    if (!id || !token || tab !== "scope" || !hiredUserId) return;
    setScopeLoading(true);
    getScopeAgreement(id, token)
      .then((s) => {
        setScopeAgreement(s ?? null);
        if (s?.deliverables?.length)
          setScopeDeliverables(s.deliverables.map((d) => d.text || ""));
        setScopeLoading(false);
      })
      .catch(() => setScopeLoading(false));
  }, [id, token, tab, hiredUserId]);

  useEffect(() => {
    if (!id || !token || !isEmployer) return;
    getAdvanceJobAnalytics(id, token).then(setAnalytics);
  }, [id, token, isEmployer]);

  useEffect(() => {
    if (!profileModalApplicant?.user_id) {
      setProfileModalData(null);
      return;
    }
    let cancelled = false;
    import("../services/mockApi").then(({ MockApi }) => {
      MockApi.getProfile(profileModalApplicant.user_id)
        .then((p) => {
          if (!cancelled && p) {
            setProfileModalData({
              bio: (p as any).bio ?? (p as any).description,
              avatar_url: (p as any).avatar_url ?? (p as any).avatarUrl,
            });
          }
        })
        .catch(() => {
          if (!cancelled) setProfileModalData({});
        });
    });
    return () => {
      cancelled = true;
    };
  }, [profileModalApplicant?.user_id]);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // Talent: switch from Applicants to Chat ( Applicants tab is hidden for Talent )
  const hiredUid = (job as any)?.hired_user_id;
  useEffect(() => {
    if (
      !hiredUid ||
      !currentUserId ||
      String(hiredUid) !== String(currentUserId)
    )
      return;
    if (tab === "applicants") setTabWithUrl(chatEnabled ? "chat" : "escrow");
  }, [hiredUid, currentUserId, tab, chatEnabled]);

  // Celebration when job is completed (ทั้งโหลดเข้ามาหน้าแล้วงาน completed หรือพึ่งปล่อยงวดสุดท้าย)
  useEffect(() => {
    if (!job || job.status !== "completed" || showedCelebrationRef.current)
      return;
    showedCelebrationRef.current = true;
    fireConfetti();
    setCongratsOpen(true);
  }, [job?.id, job?.status]);

  const handlePatch = async (
    applicantUserId: string,
    status: "shortlisted" | "hired" | "rejected",
    agreed?: number,
  ) => {
    if (!id || !token) return;
    setPatching(applicantUserId);
    try {
      await patchAdvanceApplicant(id, applicantUserId, status, token, agreed);
      notify(status === "hired" ? "จ้างแล้ว" : "อัปเดตสถานะแล้ว", "success");
      if (status === "hired") {
        const hiredApplicant = applicants.find(
          (a) => String(a.user_id) === String(applicantUserId),
        );
        setHireSummaryData({
          talentName: hiredApplicant?.full_name || ADVANCE_TALENT_LABEL,
          agreedAmount:
            (agreed != null && agreed > 0
              ? agreed
              : Number(hiredApplicant?.quotation?.total_amount)) ||
            job?.max_budget ||
            0,
        });
        setShowHireSummary(true);
        trackAdvanceEvent(
          "advance_hire_confirmed",
          advanceJobEventMeta(job, { job_id: id, role: "employer" }),
          jobBoardCopy,
        );
      }
      await load();
    } catch (e) {
      notify(
        e instanceof JobServiceError ? e.message : "ดำเนินการไม่สำเร็จ",
        "error",
      );
    } finally {
      setPatching(null);
    }
  };

  const handleViewQuotationVersions = async (a: AdvanceApplicantWithUser) => {
    if (!id || !token) return;
    setVersionPanelApplicant(a);
    try {
      const versions = await getQuotationVersions(id, a.user_id, token);
      setQuotationVersions(versions);
    } catch {
      setQuotationVersions([]);
    }
  };

  const handleEmployerCounterOffer = async (
    amount: number,
    timelineDays: number,
    editReason: string,
  ) => {
    if (!id || !token || !counterOfferApplicant) return;
    setCounterOfferSubmitting(true);
    try {
      const q = counterOfferApplicant.quotation;
      await postEmployerCounterOffer(
        id,
        counterOfferApplicant.user_id,
        {
          quote_theme: q?.theme || "aqond_classic_corporate",
          quote_currency: q?.currency || "THB",
          quote_total_amount: amount,
          quote_timeline_days: timelineDays,
          quote_valid_until: q?.valid_until || undefined,
          quote_summary: q?.summary || undefined,
          quote_items: q?.items?.length
            ? q.items.map((item) => ({
                label: item.label,
                description: item.description,
                qty: item.qty,
                unit_price: amount,
              }))
            : [
                {
                  label: "ข้อเสนอใหม่จากนายจ้าง",
                  description: editReason,
                  qty: 1,
                  unit_price: amount,
                },
              ],
        },
        editReason,
        token,
      );
      notify("ส่ง counter-offer แล้ว", "success");
      setCounterOfferApplicant(null);
      await load();
    } catch (e) {
      notify(
        e instanceof JobServiceError
          ? e.message
          : "ส่ง counter-offer ไม่สำเร็จ",
        "error",
      );
    } finally {
      setCounterOfferSubmitting(false);
    }
  };

  const handleEscrow = async () => {
    if (!paymentsEnabled) {
      notify("การชำระเงินถูกปิดชั่วคราวโดยผู้ดูแลระบบ", "warning");
      return;
    }
    const amount = Math.max(0, Number(escrowAmount));
    if (!id || !token || !amount) {
      notify("กรุณาระบุจำนวนเงิน", "error");
      return;
    }
    setEscrowSubmitting(true);
    try {
      await postAdvanceJobEscrow(id, amount, token);
      notify(escrowTransferredLabel(), "success");
      setEscrowAmount("");
      trackAdvanceEvent(
        "advance_escrow_held",
        advanceJobEventMeta(job, {
          job_id: id,
          role: isEmployer ? "employer" : "talent",
          amount,
        }),
        jobBoardCopy,
      );
      await load();
    } catch (e) {
      notify(
        e instanceof JobServiceError ? e.message : "โอนไม่สำเร็จ",
        "error",
      );
    } finally {
      setEscrowSubmitting(false);
    }
  };

  const handleSubmitProposal = async () => {
    const amt = agreedAmount ?? 0;
    if (!id || !token || amt <= 0) {
      notify("ยังไม่มีจำนวนเงินที่ตกลงกัน", "error");
      return;
    }
    const items = proposalItems
      .filter(
        (x) =>
          x.amount.trim() && !isNaN(Number(x.amount)) && Number(x.amount) > 0,
      )
      .map((x, i) => ({
        order: i + 1,
        amount: Math.round(Number(x.amount) * 100) / 100,
        description: x.description || "",
      }));
    if (items.length === 0) {
      notify("กรุณาระบุจำนวนเงินอย่างน้อย 1 งวด", "error");
      return;
    }
    const sum = items.reduce((s, x) => s + x.amount, 0);
    if (Math.abs(sum - amt) > 0.01) {
      notify(
        `ยอดรวมต้องเท่ากับ ฿${amt.toLocaleString()} (ตอนนี้ ฿${sum.toLocaleString()})`,
        "error",
      );
      return;
    }
    setProposalSubmitting(true);
    try {
      const ok = await submitMilestoneProposal(id, items, token);
      if (ok) {
        notify("ส่งโครงงวดแล้ว", "success");
        getMilestoneProposal(id, token).then(setMilestoneProposal);
      } else notify("ส่งไม่สำเร็จ", "error");
    } finally {
      setProposalSubmitting(false);
    }
  };

  const handleSaveScope = async () => {
    const items = scopeDeliverables
      .filter((t) => t.trim())
      .map((text, i) => ({ text: text.trim(), order: i + 1 }));
    if (items.length === 0) {
      notify("กรุณาเพิ่มรายการส่งมอบอย่างน้อย 1 รายการ", "error");
      return;
    }
    if (!id || !token) return;
    setScopeSubmitting(true);
    try {
      const ok = await putScopeAgreement(id, items, token);
      if (ok) {
        notify("บันทึกรายการส่งมอบแล้ว", "success");
        getScopeAgreement(id, token).then(setScopeAgreement);
      } else notify("บันทึกไม่สำเร็จ", "error");
    } finally {
      setScopeSubmitting(false);
    }
  };

  const handleConfirmScope = async () => {
    if (!id || !token) return;
    setScopeSubmitting(true);
    try {
      const ok = await confirmScopeAgreement(id, token);
      if (ok) {
        notify("ยืนยันแล้ว", "success");
        getScopeAgreement(id, token).then(setScopeAgreement);
      } else notify("ยืนยันไม่สำเร็จ", "error");
    } finally {
      setScopeSubmitting(false);
    }
  };

  const handleProposalAction = async (
    action: "approve" | "reject" | "edit",
  ) => {
    if (!id || !token) return;
    setProposalSubmitting(true);
    try {
      const items =
        action === "edit" && milestoneProposal?.items
          ? milestoneProposal.items.map((x) => ({
              order: x.order,
              amount: x.amount,
              description: x.description,
            }))
          : undefined;
      const ok = await approveMilestoneProposal(id, action, items, token);
      if (ok) {
        notify(
          action === "approve"
            ? "อนุมัติแล้ว"
            : action === "reject"
              ? "ปฏิเสธแล้ว"
              : "แก้ไขแล้ว",
          "success",
        );
        getMilestoneProposal(id, token).then(setMilestoneProposal);
      } else notify("ดำเนินการไม่สำเร็จ", "error");
    } finally {
      setProposalSubmitting(false);
    }
  };

  const handleReleaseMilestone = async (milestoneId: string) => {
    if (!id || !token) return;
    setReleasingMilestoneId(milestoneId);
    try {
      const res = await releaseAdvanceMilestone(id, milestoneId, token);
      notify(
        `ปล่อยเงินงวดนี้แล้ว — ${ADVANCE_TALENT_LABEL} ได้ ฿${res.amount_released.toLocaleString()} (หักค่าธรรมเนียม ฿${res.commission_deducted.toLocaleString()})${res.is_job_completed ? " · งานเสร็จสมบูรณ์" : ""}`,
        "success",
      );
      await load();
      if (res.is_job_completed) {
        showedCelebrationRef.current = true;
        fireConfetti();
        setCongratsOpen(true);
      }
    } catch (e) {
      notify(
        e instanceof JobServiceError ? e.message : "ปล่อยเงินงวดไม่สำเร็จ",
        "error",
      );
    } finally {
      setReleasingMilestoneId(null);
    }
  };

  const handleSubmitWork = async () => {
    if (!id || !token) return;
    const url = submitWorkUrl.trim();
    const links = submitWorkLinks
      .filter((l) => l.url.trim())
      .map((l) => ({ url: l.url.trim(), label: l.label.trim() || undefined }));
    if (!url && links.length === 0) {
      notify("กรุณาระบุ URL หรือลิงก์อย่างน้อย 1 รายการ", "error");
      return;
    }
    const payload = {
      submission_url: url || undefined,
      submission_links: links,
    };
    console.log("[handleSubmitWork] Request payload:", {
      jobId: id,
      payload,
      hasToken: !!token,
    });
    setSubmitWorkSubmitting(true);
    try {
      if (isMockJobId(id)) {
        // Mock job — simulate success, do not call real API
        console.log("[handleSubmitWork] Mock job — simulating success");
        setJob((prev) =>
          prev
            ? ({
                ...prev,
                work_submission_status: "submitted",
                work_submission_url: url || undefined,
                work_submission_links: links,
                work_submitted_at: new Date().toISOString(),
              } as any)
            : prev,
        );
        notify("ส่งงานแล้ว รอให้นายจ้างตรวจสอบ (Demo)", "success");
        trackAdvanceEvent(
          "advance_work_submitted",
          advanceJobEventMeta(job, { job_id: id, role: "talent" }),
          jobBoardCopy,
        );
      } else {
        await submitWork(id, payload, token);
        notify("ส่งงานแล้ว รอให้นายจ้างตรวจสอบ", "success");
        trackAdvanceEvent(
          "advance_work_submitted",
          advanceJobEventMeta(job, { job_id: id, role: "talent" }),
          jobBoardCopy,
        );
        await load();
      }
      setShowSubmitWorkModal(false);
      setSubmitWorkUrl("");
      setSubmitWorkLinks([{ url: "", label: "" }]);
    } catch (e) {
      console.error("[handleSubmitWork] Error:", e);
      notify(
        e instanceof JobServiceError ? e.message : "ส่งงานไม่สำเร็จ",
        "error",
      );
    } finally {
      setSubmitWorkSubmitting(false);
    }
  };

  const handleRequestRevision = async () => {
    if (!id || !token || !revisionNote.trim()) {
      notify("กรุณาระบุรายการที่ต้องแก้ไข", "error");
      return;
    }
    setRevisionSubmitting(true);
    try {
      await requestRevision(id, revisionNote.trim(), token);
      notify("ส่งคำขอแก้ไขแล้ว", "success");
      setShowRequestRevisionModal(false);
      setRevisionNote("");
      await load();
    } catch (e) {
      notify(
        e instanceof JobServiceError ? e.message : "ส่งคำขอไม่สำเร็จ",
        "error",
      );
    } finally {
      setRevisionSubmitting(false);
    }
  };

  const handleCreateProcurementRevision = async () => {
    if (!id || !token || !hiredUserId) {
      notify("ต้องมีผู้รับงานก่อนจึงจะสร้าง revision ได้", "error");
      return;
    }
    if (!procurementWinnerReason.trim()) {
      setProcurementWinnerReason(PROCUREMENT_REASON_TEMPLATE);
      notify("ใส่ template เหตุผลให้แล้ว กรุณาตรวจทานก่อนสร้าง revision", "error");
      return;
    }
    setProcurementSubmitting(true);
    try {
      const created = await createAdvanceProcurementRevision(
        id,
        {
          winner_user_id: String(hiredUserId),
          winner_reason: procurementWinnerReason.trim(),
        },
        token,
      );
      notify(
        `สร้าง revision #${created.revision.revision_no} เรียบร้อย`,
        "success",
      );
      await load();
    } catch (e) {
      notify(
        e instanceof JobServiceError ? e.message : "สร้าง revision ไม่สำเร็จ",
        "error",
      );
    } finally {
      setProcurementSubmitting(false);
    }
  };

  const handleExportProcurement = async (format: "csv" | "pdf" | "json") => {
    if (!id || !token) return;
    if (!selectedProcurementRevision?.id) {
      notify("ยังไม่มี revision สำหรับ export", "error");
      return;
    }
    setProcurementExporting(true);
    try {
      await downloadAdvanceProcurementPackage(id, format, token, {
        revision_id: selectedProcurementRevision.id,
        agency_form: procurementAgencyForm,
      });
      notify(`เริ่มดาวน์โหลด ${format.toUpperCase()} แล้ว`, "success");
    } catch (e) {
      notify(
        e instanceof JobServiceError ? e.message : "export package ไม่สำเร็จ",
        "error",
      );
    } finally {
      setProcurementExporting(false);
    }
  };

  const handleApproveAndPay = async () => {
    if (!id || !token) return;
    setApprovePaySubmitting(true);
    try {
      const res = await releaseAllAdvanceEscrow(id, token);
      notify(
        `อนุมัติและปล่อยเงินแล้ว — ฿${res.amount_released.toLocaleString()}`,
        "success",
      );
      showedCelebrationRef.current = true;
      fireConfetti();
      setCongratsOpen(true);
      await load();
    } catch (e) {
      notify(
        e instanceof JobServiceError ? e.message : "ปล่อยเงินไม่สำเร็จ",
        "error",
      );
    } finally {
      setApprovePaySubmitting(false);
    }
  };

  const handleSendMessage = async () => {
    const body = chatBody.trim();
    if (!id || !token || !body) return;
    setChatSubmitting(true);
    try {
      const newMsg = await postAdvanceJobMessage(id, body, token);
      setMessages((prev) => [
        ...prev,
        { ...newMsg, sender_name: user?.name || "ฉัน" },
      ]);
      setChatBody("");
    } catch (e) {
      notify(
        e instanceof JobServiceError ? e.message : "ส่งไม่สำเร็จ",
        "error",
      );
    } finally {
      setChatSubmitting(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!id || !token || reviewRating < 1 || reviewRating > 5) {
      notify("กรุณาเลือกคะแนน 1–5 ดาว", "error");
      return;
    }
    setReviewSubmitting(true);
    try {
      await postAdvanceJobReview(
        id,
        { rating: reviewRating, comment: reviewComment.trim() || undefined },
        token,
      );
      notify("บันทึกคะแนนแล้ว", "success");
      trackAdvanceEvent(
        "advance_review_submitted",
        advanceJobEventMeta(job, {
          job_id: id,
          role: isEmployer ? "employer" : "talent",
          rating: reviewRating,
        }),
        jobBoardCopy,
      );
      setMyReview({
        id: "",
        rating: reviewRating,
        comment: reviewComment,
        created_at: new Date().toISOString(),
      });
      const revieweeId = isEmployer
        ? hiredUserId
        : (jobWithEscrow as any)?.employer_id;
      setReviews((prev) => [
        ...prev,
        {
          id: "",
          rating: reviewRating,
          comment: reviewComment,
          created_at: new Date().toISOString(),
          reviewee_id: revieweeId,
        },
      ]);
      setReviewRating(0);
      setReviewComment("");
    } catch (e) {
      notify(
        e instanceof JobServiceError ? e.message : "บันทึกคะแนนไม่สำเร็จ",
        "error",
      );
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleReportApplicant = async () => {
    if (!reportModalUser || !token || !id) return;
    setReportBlockLoading(true);
    try {
      const { api } = await import("../services/api");
      const { data } = await api.post(
        `/api/users/${reportModalUser.user_id}/report`,
        {
          context: "advance_job_applicant",
          context_id: id,
          reason: reportReason.trim() || undefined,
        },
      );
      if (data.success) {
        setReportModalUser(null);
        setReportReason("");
        notify("ขอบคุณที่แจ้งรายงาน เราจะตรวจสอบ", "success");
      }
    } catch (e: any) {
      notify(e?.response?.data?.error || "แจ้งรายงานไม่สำเร็จ", "error");
    } finally {
      setReportBlockLoading(false);
    }
  };

  const handleBlockApplicant = async (a: AdvanceApplicantWithUser) => {
    if (!a.user_id || !token) return;
    setApplicantActionsOpen(null);
    setBlockConfirmUser(a);
  };

  const confirmBlockApplicant = async () => {
    const a = blockConfirmUser;
    if (!a?.user_id || !token) return;
    setReportBlockLoading(true);
    try {
      const { api } = await import("../services/api");
      const { data } = await api.post(`/api/users/${a.user_id}/block`);
      if (data.success) {
        notify("บล็อกแล้ว", "success");
        setApplicants((prev) => prev.filter((x) => x.user_id !== a.user_id));
      }
    } catch (e: any) {
      notify(e?.response?.data?.error || "บล็อกไม่สำเร็จ", "error");
    } finally {
      setReportBlockLoading(false);
      setBlockConfirmUser(null);
    }
  };

  const manageJobContextValue = useMemo(() => {
    if (!job) return null;
    return {
      id,
      token,
      job,
      isEmployer: !!isEmployer,
      isTalent: !!isTalent,
      chatEnabled,
      paymentsEnabled,
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
      hiredUserId,
      escrowStatus,
      escrowAmountNum,
      revisionCount,
      revisionLimit,
      jobWithEscrow: job as JobWithEscrow,
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
    };
  }, [
    id,
    token,
    job,
    isEmployer,
    isTalent,
    chatEnabled,
    paymentsEnabled,
    jobBoardCopy,
    analytics,
    applicants,
    quotationScores,
    patching,
    previewApplicantId,
    applicantActionsOpen,
    t,
    notify,
    handlePatch,
    handleViewQuotationVersions,
    setCounterOfferApplicant,
    setProfileModalApplicant,
    setReportModalUser,
    handleBlockApplicant,
    hiredUserId,
    escrowStatus,
    escrowAmountNum,
    revisionCount,
    revisionLimit,
    workSubmissionStatus,
    escrowSectionsOpen,
    procurementWinnerReason,
    selectedProcurementRevision,
    procurementRevisions,
    procurementExporting,
    procurementSubmitting,
    procurementAgencyForm,
    handleCreateProcurementRevision,
    handleExportProcurement,
    handleApproveAndPay,
    approvePaySubmitting,
    milestones,
    releasingMilestoneId,
    handleReleaseMilestone,
    proposalLoading,
    milestoneProposal,
    proposalItems,
    proposalSubmitting,
    handleSubmitProposal,
    handleProposalAction,
    agreedAmount,
    hasInsurance,
    escrowAmount,
    escrowSubmitting,
    handleEscrow,
    escrowBreakdown,
  ]);

  if (loading && !job) {
    const skelTab = (searchParams.get("tab") || "applicants") as ManageJobSkeletonVariant;
    const skeletonVariant: ManageJobSkeletonVariant = [
      "applicants",
      "chat",
      "escrow",
      "scope",
      "review",
    ].includes(skelTab)
      ? skelTab
      : "default";
    return <ManageJobSkeleton variant={skeletonVariant} />;
  }
  if (!job) {
    return (
      <div className="luxury-card rounded-2xl p-8 text-center">
        <p className="text-slate-400">ไม่พบงานนี้</p>
        <Link
          to="/job-board"
          className="mt-4 inline-flex items-center gap-2 text-amber-400 hover:underline"
        >
          <ArrowLeft size={16} /> กลับ
        </Link>
      </div>
    );
  }

  const isCompleted = (jobWithEscrow as any)?.status === "completed";

  const tabs: { id: Tab; labelKey: string; icon: React.ReactNode }[] = [
    ...(isEmployer
      ? [
          {
            id: "applicants" as Tab,
            labelKey: "job_board.manage_advance.tab_applicants",
            icon: <Users size={18} />,
          },
        ]
      : []),
    ...(chatEnabled
      ? [
          {
            id: "chat" as Tab,
            labelKey: "job_board.manage_advance.tab_chat",
            icon: <MessageCircle size={18} />,
          },
        ]
      : []),
    {
      id: "escrow",
      labelKey: "job_board.manage_advance.tab_escrow",
      icon: <Wallet size={18} />,
    },
    ...(hiredUserId
      ? [
          {
            id: "scope" as Tab,
            labelKey: "job_board.manage_advance.tab_scope",
            icon: <FileText size={18} />,
          },
        ]
      : []),
    ...(isCompleted
      ? [
          {
            id: "review" as Tab,
            labelKey: "job_board.manage_advance.tab_review",
            icon: <Star size={18} />,
          },
        ]
      : []),
  ];

  const effectiveTab =
    tab && tabs.some((x) => x.id === tab) ? tab : (tabs[0]?.id ?? "escrow");

  return (
    <ManageAdvanceJobProvider value={manageJobContextValue!}>
    <div className="aqond-trust-theme jobboard-flow-theme space-y-6 pb-12 min-h-screen">
      {!isOnline && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 text-sm">
          <WifiOff size={18} />
          โหมดออฟไลน์ — ข้อมูลอาจไม่เป็นปัจจุบัน
        </div>
      )}
      {/* Header + Tabs */}
      <ManageJobHeader
        effectiveTab={effectiveTab}
        jobTitle={job.title}
        isTalent={!!isTalent}
        loading={loading}
        onRefresh={() => load()}
        t={t}
      />

      {isTalent && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200">
          <PartyPopper size={22} className="shrink-0 text-emerald-400" />
          <p className="text-sm font-medium">
            {t("job_board.manage_advance.talent_next_steps")}
          </p>
        </div>
      )}

      <JobPipelineStepper
        applicantCount={job.applicant_count ?? applicants.length}
        hiredUserId={hiredUserId}
        escrowStatus={escrowStatus}
        workSubmissionStatus={workSubmissionStatus}
        isCompleted={isCompleted}
      />

      <ManageJobTabs
        tabs={tabs}
        effectiveTab={effectiveTab}
        onSelect={setTabWithUrl}
        t={t}
      />

      {effectiveTab === "applicants" && <ApplicantsPane />}

      {effectiveTab === "chat" && (
        <ChatPane
          messages={messages}
          user={user}
          chatBody={chatBody}
          setChatBody={setChatBody}
          chatSubmitting={chatSubmitting}
          onSend={handleSendMessage}
        />
      )}

      {effectiveTab === "escrow" && <EscrowPane />}

      {effectiveTab === "scope" && hiredUserId && (
        <ScopePane
          scopeLoading={scopeLoading}
          scopeAgreement={scopeAgreement}
          scopeDeliverables={scopeDeliverables}
          setScopeDeliverables={setScopeDeliverables}
          scopeSubmitting={scopeSubmitting}
          isEmployer={isEmployer}
          talentLabel={ADVANCE_TALENT_LABEL}
          onSaveScope={handleSaveScope}
          onConfirmScope={handleConfirmScope}
        />
      )}

      {effectiveTab === "review" && isCompleted && (
        <ReviewPane
          isEmployer={isEmployer}
          myReview={myReview}
          reviews={reviews}
          currentUserId={currentUserId}
          reviewRating={reviewRating}
          setReviewRating={setReviewRating}
          reviewComment={reviewComment}
          setReviewComment={setReviewComment}
          reviewSubmitting={reviewSubmitting}
          onSubmitReview={handleSubmitReview}
          jobId={id}
          job={job}
          jobBoardCopy={jobBoardCopy}
        />
      )}

      <ManageAdvanceJobModals
        jobId={id}
        job={job}
        jobBoardCopy={jobBoardCopy}
        t={t}
        isEmployer={!!isEmployer}
        receiptMilestone={receiptMilestone}
        setReceiptMilestone={setReceiptMilestone}
        showHireSummary={showHireSummary}
        hireSummaryData={hireSummaryData}
        setShowHireSummary={setShowHireSummary}
        onGoEscrowTab={() => setTabWithUrl("escrow")}
        blockConfirmUser={blockConfirmUser}
        setBlockConfirmUser={setBlockConfirmUser}
        onConfirmBlock={confirmBlockApplicant}
        congratsOpen={congratsOpen}
        setCongratsOpen={setCongratsOpen}
        myReview={myReview}
        onGoReviewTab={() => setTabWithUrl("review")}
        counterOfferApplicant={counterOfferApplicant}
        setCounterOfferApplicant={setCounterOfferApplicant}
        counterOfferSubmitting={counterOfferSubmitting}
        quotationScores={quotationScores}
        onCounterOfferSubmit={handleEmployerCounterOffer}
        versionPanelApplicant={versionPanelApplicant}
        setVersionPanelApplicant={setVersionPanelApplicant}
        quotationVersions={quotationVersions}
        setQuotationVersions={setQuotationVersions}
        profileModalApplicant={profileModalApplicant}
        setProfileModalApplicant={setProfileModalApplicant}
        profileModalData={profileModalData}
        showSubmitWorkModal={showSubmitWorkModal}
        setShowSubmitWorkModal={setShowSubmitWorkModal}
        submitWorkUrl={submitWorkUrl}
        setSubmitWorkUrl={setSubmitWorkUrl}
        submitWorkLinks={submitWorkLinks}
        setSubmitWorkLinks={setSubmitWorkLinks}
        submitWorkSubmitting={submitWorkSubmitting}
        onSubmitWork={handleSubmitWork}
        showRequestRevisionModal={showRequestRevisionModal}
        setShowRequestRevisionModal={setShowRequestRevisionModal}
        revisionNote={revisionNote}
        setRevisionNote={setRevisionNote}
        revisionCount={revisionCount}
        revisionLimit={revisionLimit}
        revisionSubmitting={revisionSubmitting}
        onRequestRevision={handleRequestRevision}
        reportModalUser={reportModalUser}
        setReportModalUser={setReportModalUser}
        reportReason={reportReason}
        setReportReason={setReportReason}
        reportBlockLoading={reportBlockLoading}
        onReportApplicant={handleReportApplicant}
      />
    </div>
    </ManageAdvanceJobProvider>
  );
};
