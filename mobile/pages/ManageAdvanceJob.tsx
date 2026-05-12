import React, { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import confetti from "canvas-confetti";
import {
  ArrowLeft,
  Users,
  MessageCircle,
  Wallet,
  Send,
  UserCheck,
  UserX,
  Star,
  Loader2,
  CheckCircle,
  FileText,
  X,
  PartyPopper,
  User,
  ShieldCheck,
  Shield,
  Briefcase,
  MoreVertical,
  Flag,
  Ban,
  ChevronDown,
  ChevronUp,
  Award,
  RefreshCw,
  WifiOff,
  Crown,
  Clock,
  Upload,
  ExternalLink,
} from "lucide-react";
import {
  getAdvanceJobById,
  getAdvanceJobApplicants,
  patchAdvanceApplicant,
  recordApplicantProfileView,
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
  JobServiceError,
} from "../services/jobService";
import { PaymentBreakdown } from "../components/PaymentBreakdown";
import type { JobAdvanceAPI, AdvanceApplicantWithUser, AdvanceJobMessageAPI, AdvanceMilestoneAPI } from "../types/api";
import { isMockJobId } from "../services/mockJobsForReview";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { useLanguage } from "../context/LanguageContext";
import { useMobileAppConfig } from "../context/MobileAppConfigContext";

type Tab = "applicants" | "chat" | "escrow" | "scope" | "review";

export const ManageAdvanceJob: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const { notify } = useNotification();
  const { t } = useLanguage();
  const { config } = useMobileAppConfig();
  const chatEnabled = config.featureFlags.enableChat;
  const paymentsEnabled = config.featureFlags.enablePayments;
  const [job, setJob] = useState<JobAdvanceAPI | null>(null);
  const [applicants, setApplicants] = useState<AdvanceApplicantWithUser[]>([]);
  const [messages, setMessages] = useState<AdvanceJobMessageAPI[]>([]);
  const [milestones, setMilestones] = useState<AdvanceMilestoneAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("applicants");
  const [patching, setPatching] = useState<string | null>(null);
  const [escrowAmount, setEscrowAmount] = useState("");
  const [escrowSubmitting, setEscrowSubmitting] = useState(false);
  const [feeConfig, setFeeConfig] = useState<{ paymentMarkupPercent: number } | null>(null);
  const [escrowBreakdown, setEscrowBreakdown] = useState<{
    jobFee: number;
    handlingFeeAmount: number;
    paymentMarkupAmount: number;
    commissionFeeAmount: number;
    talentReceives: number;
    totalToPay: number;
    insurance_amount?: number;
    talent_current_tier?: string;
    payout_by_tier?: Record<string, { payout: number; commissionPercent: number; sourcePercent: number; totalDeductionPercent: number; label: string; labelTh: string; isBestValue?: boolean }>;
  } | null>(null);
  const [hasInsurance, setHasInsurance] = useState(false);
  const [releasingMilestoneId, setReleasingMilestoneId] = useState<string | null>(null);
  const [chatBody, setChatBody] = useState("");
  const [chatSubmitting, setChatSubmitting] = useState(false);
  const [receiptMilestone, setReceiptMilestone] = useState<AdvanceMilestoneAPI | null>(null);
  const [congratsOpen, setCongratsOpen] = useState(false);
  const showedCelebrationRef = useRef(false);
  const [myReview, setMyReview] = useState<{ id: string; rating: number; comment: string; created_at: string } | null>(null);
  const [reviews, setReviews] = useState<Array<{ id: string; rating: number; comment: string; created_at: string; reviewee_id?: string }>>([]);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [applicantActionsOpen, setApplicantActionsOpen] = useState<string | null>(null);
  const [previewApplicantId, setPreviewApplicantId] = useState<string | null>(null);
  const [reportModalUser, setReportModalUser] = useState<AdvanceApplicantWithUser | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportBlockLoading, setReportBlockLoading] = useState(false);
  const [milestoneProposal, setMilestoneProposal] = useState<{ id: string; items: Array<{ order: number; amount: number; description?: string }>; status: string } | null>(null);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalSubmitting, setProposalSubmitting] = useState(false);
  const [proposalItems, setProposalItems] = useState<Array<{ order: number; amount: string; description: string }>>([
    { order: 1, amount: "", description: "ก่อนเริ่มงาน" },
    { order: 2, amount: "", description: "เมื่อส่งมอบ" },
  ]);
  const [scopeAgreement, setScopeAgreement] = useState<{ id: string; deliverables: Array<{ text: string; order?: number }>; employer_confirmed_at: string | null; talent_confirmed_at: string | null; both_confirmed: boolean } | null>(null);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [scopeSubmitting, setScopeSubmitting] = useState(false);
  const [scopeDeliverables, setScopeDeliverables] = useState<string[]>(["", "", ""]);
  const [analytics, setAnalytics] = useState<{ view_count: number; applicant_count: number; conversion_rate: string | null; time_to_hire_hours: number | null; time_to_hire_days: string | null } | null>(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [swipeRejectId, setSwipeRejectId] = useState<string | null>(null);
  const [profileModalApplicant, setProfileModalApplicant] = useState<AdvanceApplicantWithUser | null>(null);
  const [profileModalData, setProfileModalData] = useState<{ bio?: string; avatar_url?: string } | null>(null);
  const [showSubmitWorkModal, setShowSubmitWorkModal] = useState(false);
  const [submitWorkUrl, setSubmitWorkUrl] = useState("");
  const [submitWorkLinks, setSubmitWorkLinks] = useState<Array<{ url: string; label: string }>>([{ url: "", label: "" }]);
  const [submitWorkSubmitting, setSubmitWorkSubmitting] = useState(false);
  const [showRequestRevisionModal, setShowRequestRevisionModal] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const [revisionSubmitting, setRevisionSubmitting] = useState(false);
  const [approvePaySubmitting, setApprovePaySubmitting] = useState(false);

  const jobWithEscrow = job as (JobAdvanceAPI & {
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
  }) | null;
  const hiredUserId = jobWithEscrow?.hired_user_id;
  const agreedAmount = jobWithEscrow?.agreed_amount;
  const escrowAmountNum = jobWithEscrow?.escrow_amount ?? 0;
  const escrowStatus = jobWithEscrow?.escrow_status || "none";
  const workSubmissionStatus = jobWithEscrow?.work_submission_status || "none";
  const revisionCount = jobWithEscrow?.revision_count ?? 0;
  const revisionLimit = jobWithEscrow?.revision_limit ?? 3;
  const currentUserId = user?.id ?? (user as any)?.userId;
  const isEmployer = job && currentUserId && String((job as any).employer_id) === String(currentUserId);
  const isTalent = hiredUserId && currentUserId && String(hiredUserId) === String(currentUserId);

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
        const [a, m, milestonesRes] = await Promise.all([
          getAdvanceJobApplicants(cleanId, token),
          getAdvanceJobMessages(cleanId, token),
          getAdvanceJobMilestones(cleanId, token),
        ]);
        setApplicants(a ?? []);
        setMessages(m ?? []);
        setMilestones(milestonesRes ?? []);
      } catch (secondaryErr) {
        setApplicants([]);
        setMessages([]);
        setMilestones([]);
      }
      if (j && (j as any).agreed_amount != null) setEscrowAmount(String((j as any).agreed_amount));
      if (j && (j as any).status === "completed") {
        try {
          const [myR, list] = await Promise.all([
            getAdvanceJobMyReview(cleanId, token),
            getAdvanceJobReviews(cleanId),
          ]);
          setMyReview(myR ?? null);
          setReviews((list ?? []).map((r) => ({ id: r.id, rating: r.rating, comment: r.comment || "", created_at: r.created_at, reviewee_id: r.reviewee_id })));
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
        confetti({ particleCount: 80, angle: 60, spread: 55, origin: { x: 0 } });
        confetti({ particleCount: 80, angle: 120, spread: 55, origin: { x: 1 } });
      }, 200);
    } catch (_) {}
  };

  useEffect(() => {
    load();
  }, [id, token]);

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
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
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
  const isTalentEscrowWaiting = isTalent && !escrowHeld && (agreedAmount ?? 0) > 0;
  const effectiveEscrowAmount = isTalentEscrowWaiting ? (agreedAmount ?? 0) : Math.max(0, Number(escrowAmount));
  useEffect(() => {
    if (!id || !token || tab !== "escrow" || !hiredUserId || effectiveEscrowAmount <= 0) {
      setEscrowBreakdown(null);
      return;
    }
    getEscrowBreakdown(id, effectiveEscrowAmount, token, hasInsurance)
      .then(setEscrowBreakdown)
      .catch(() => setEscrowBreakdown(null));
  }, [id, token, tab, hiredUserId, effectiveEscrowAmount, hasInsurance, escrowRefreshTrigger]);

  // Refetch escrow breakdown when user returns (e.g. after Talent upgrades) — immediate update
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && tab === "escrow") setEscrowRefreshTrigger((k) => k + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [tab]);

  useEffect(() => {
    if (!id || !token || tab !== "escrow" || !hiredUserId) return;
    setProposalLoading(true);
    getMilestoneProposal(id, token).then((p) => {
      setMilestoneProposal(p ?? null);
      setProposalLoading(false);
    }).catch(() => setProposalLoading(false));
  }, [id, token, tab, hiredUserId]);

  useEffect(() => {
    if (tab !== "escrow" || !isEmployer) return;
    getPaymentFeeConfig().then((c) => setFeeConfig({ paymentMarkupPercent: c.paymentMarkupPercent }));
  }, [tab, isEmployer]);

  useEffect(() => {
    if (!id || !token || tab !== "scope" || !hiredUserId) return;
    setScopeLoading(true);
    getScopeAgreement(id, token).then((s) => {
      setScopeAgreement(s ?? null);
      if (s?.deliverables?.length) setScopeDeliverables(s.deliverables.map((d) => d.text || ""));
      setScopeLoading(false);
    }).catch(() => setScopeLoading(false));
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
      MockApi.getProfile(profileModalApplicant.user_id).then((p) => {
        if (!cancelled && p) {
          setProfileModalData({
            bio: (p as any).bio ?? (p as any).description,
            avatar_url: (p as any).avatar_url ?? (p as any).avatarUrl,
          });
        }
      }).catch(() => { if (!cancelled) setProfileModalData({}); });
    });
    return () => { cancelled = true; };
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
    if (!hiredUid || !currentUserId || String(hiredUid) !== String(currentUserId)) return;
    if (tab === "applicants") setTab(chatEnabled ? "chat" : "escrow");
  }, [hiredUid, currentUserId, tab, chatEnabled]);

  // Celebration when job is completed (ทั้งโหลดเข้ามาหน้าแล้วงาน completed หรือพึ่งปล่อยงวดสุดท้าย)
  useEffect(() => {
    if (!job || job.status !== "completed" || showedCelebrationRef.current) return;
    showedCelebrationRef.current = true;
    fireConfetti();
    setCongratsOpen(true);
  }, [job?.id, job?.status]);

  const handlePatch = async (applicantUserId: string, status: "shortlisted" | "hired" | "rejected", agreed?: number) => {
    if (!id || !token) return;
    setPatching(applicantUserId);
    try {
      await patchAdvanceApplicant(id, applicantUserId, status, token, agreed);
      notify(status === "hired" ? "จ้างแล้ว" : "อัปเดตสถานะแล้ว", "success");
      await load();
    } catch (e) {
      notify(e instanceof JobServiceError ? e.message : "ดำเนินการไม่สำเร็จ", "error");
    } finally {
      setPatching(null);
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
      notify("โอนเงินเข้า Escrow แล้ว", "success");
      setEscrowAmount("");
      await load();
    } catch (e) {
      notify(e instanceof JobServiceError ? e.message : "โอนไม่สำเร็จ", "error");
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
      .filter((x) => x.amount.trim() && !isNaN(Number(x.amount)) && Number(x.amount) > 0)
      .map((x, i) => ({ order: i + 1, amount: Math.round(Number(x.amount) * 100) / 100, description: x.description || "" }));
    if (items.length === 0) {
      notify("กรุณาระบุจำนวนเงินอย่างน้อย 1 งวด", "error");
      return;
    }
    const sum = items.reduce((s, x) => s + x.amount, 0);
    if (Math.abs(sum - amt) > 0.01) {
      notify(`ยอดรวมต้องเท่ากับ ฿${amt.toLocaleString()} (ตอนนี้ ฿${sum.toLocaleString()})`, "error");
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
    const items = scopeDeliverables.filter((t) => t.trim()).map((text, i) => ({ text: text.trim(), order: i + 1 }));
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

  const handleProposalAction = async (action: "approve" | "reject" | "edit") => {
    if (!id || !token) return;
    setProposalSubmitting(true);
    try {
      const items = action === "edit" && milestoneProposal?.items
        ? milestoneProposal.items.map((x) => ({ order: x.order, amount: x.amount, description: x.description }))
        : undefined;
      const ok = await approveMilestoneProposal(id, action, items, token);
      if (ok) {
        notify(action === "approve" ? "อนุมัติแล้ว" : action === "reject" ? "ปฏิเสธแล้ว" : "แก้ไขแล้ว", "success");
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
        `ปล่อยเงินงวดนี้แล้ว — Talent ได้ ฿${res.amount_released.toLocaleString()} (หักค่าธรรมเนียม ฿${res.commission_deducted.toLocaleString()})${res.is_job_completed ? " · งานเสร็จสมบูรณ์" : ""}`,
        "success"
      );
      await load();
      if (res.is_job_completed) {
        showedCelebrationRef.current = true;
        fireConfetti();
        setCongratsOpen(true);
      }
    } catch (e) {
      notify(e instanceof JobServiceError ? e.message : "ปล่อยเงินงวดไม่สำเร็จ", "error");
    } finally {
      setReleasingMilestoneId(null);
    }
  };

  const handleSubmitWork = async () => {
    if (!id || !token) return;
    const url = submitWorkUrl.trim();
    const links = submitWorkLinks.filter((l) => l.url.trim()).map((l) => ({ url: l.url.trim(), label: l.label.trim() || undefined }));
    if (!url && links.length === 0) {
      notify("กรุณาระบุ URL หรือลิงก์อย่างน้อย 1 รายการ", "error");
      return;
    }
    const payload = { submission_url: url || undefined, submission_links: links };
    console.log("[handleSubmitWork] Request payload:", { jobId: id, payload, hasToken: !!token });
    setSubmitWorkSubmitting(true);
    try {
      if (isMockJobId(id)) {
        // Mock job — simulate success, do not call real API
        console.log("[handleSubmitWork] Mock job — simulating success");
        setJob((prev) =>
          prev
            ? {
                ...prev,
                work_submission_status: "submitted",
                work_submission_url: url || undefined,
                work_submission_links: links,
                work_submitted_at: new Date().toISOString(),
              } as any
            : prev
        );
        notify("ส่งงานแล้ว รอให้นายจ้างตรวจสอบ (Demo)", "success");
      } else {
        await submitWork(id, payload, token);
        notify("ส่งงานแล้ว รอให้นายจ้างตรวจสอบ", "success");
        await load();
      }
      setShowSubmitWorkModal(false);
      setSubmitWorkUrl("");
      setSubmitWorkLinks([{ url: "", label: "" }]);
    } catch (e) {
      console.error("[handleSubmitWork] Error:", e);
      notify(e instanceof JobServiceError ? e.message : "ส่งงานไม่สำเร็จ", "error");
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
      notify(e instanceof JobServiceError ? e.message : "ส่งคำขอไม่สำเร็จ", "error");
    } finally {
      setRevisionSubmitting(false);
    }
  };

  const handleApproveAndPay = async () => {
    if (!id || !token) return;
    setApprovePaySubmitting(true);
    try {
      const res = await releaseAllAdvanceEscrow(id, token);
      notify(`อนุมัติและปล่อยเงินแล้ว — ฿${res.amount_released.toLocaleString()}`, "success");
      showedCelebrationRef.current = true;
      fireConfetti();
      setCongratsOpen(true);
      await load();
    } catch (e) {
      notify(e instanceof JobServiceError ? e.message : "ปล่อยเงินไม่สำเร็จ", "error");
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
      setMessages((prev) => [...prev, { ...newMsg, sender_name: user?.name || "ฉัน" }]);
      setChatBody("");
    } catch (e) {
      notify(e instanceof JobServiceError ? e.message : "ส่งไม่สำเร็จ", "error");
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
      await postAdvanceJobReview(id, { rating: reviewRating, comment: reviewComment.trim() || undefined }, token);
      notify("บันทึกคะแนนแล้ว", "success");
      setMyReview({ id: "", rating: reviewRating, comment: reviewComment, created_at: new Date().toISOString() });
      const revieweeId = isEmployer ? hiredUserId : (jobWithEscrow as any)?.employer_id;
      setReviews((prev) => [...prev, { id: "", rating: reviewRating, comment: reviewComment, created_at: new Date().toISOString(), reviewee_id: revieweeId }]);
      setReviewRating(0);
      setReviewComment("");
    } catch (e) {
      notify(e instanceof JobServiceError ? e.message : "บันทึกคะแนนไม่สำเร็จ", "error");
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleReportApplicant = async () => {
    if (!reportModalUser || !token || !id) return;
    setReportBlockLoading(true);
    try {
      const { api } = await import("../services/api");
      const { data } = await api.post(`/api/users/${reportModalUser.user_id}/report`, {
        context: "advance_job_applicant",
        context_id: id,
        reason: reportReason.trim() || undefined,
      });
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
    if (!confirm("ต้องการบล็อกผู้ใช้นี้หรือไม่? จะไม่เห็นข้อความหรือติดต่อได้อีก")) return;
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
    }
  };

  if (loading && !job) {
    return (
      <div className="luxury-card rounded-2xl p-12 text-center">
        <Loader2 size={32} className="mx-auto animate-spin text-amber-400 mb-4" />
        <p className="text-slate-400">กำลังโหลด...</p>
      </div>
    );
  }
  if (!job) {
    return (
      <div className="luxury-card rounded-2xl p-8 text-center">
        <p className="text-slate-400">ไม่พบงานนี้</p>
        <Link to="/job-board" className="mt-4 inline-flex items-center gap-2 text-amber-400 hover:underline">
          <ArrowLeft size={16} /> กลับ
        </Link>
      </div>
    );
  }

  const isCompleted = (jobWithEscrow as any)?.status === "completed";

  const tabs: { id: Tab; labelKey: string; icon: React.ReactNode }[] = [
    ...(isEmployer ? [{ id: "applicants" as Tab, labelKey: "job_board.manage_advance.tab_applicants", icon: <Users size={18} /> }] : []),
    ...(chatEnabled ? [{ id: "chat" as Tab, labelKey: "job_board.manage_advance.tab_chat", icon: <MessageCircle size={18} /> }] : []),
    { id: "escrow", labelKey: "job_board.manage_advance.tab_escrow", icon: <Wallet size={18} /> },
    ...(hiredUserId ? [{ id: "scope" as Tab, labelKey: "job_board.manage_advance.tab_scope", icon: <FileText size={18} /> }] : []),
    ...(isCompleted ? [{ id: "review" as Tab, labelKey: "job_board.manage_advance.tab_review", icon: <Star size={18} /> }] : []),
  ];

  const effectiveTab = tab && tabs.some((x) => x.id === tab) ? tab : (tabs[0]?.id ?? "escrow");

  return (
    <div className="space-y-6 pb-12">
      {!isOnline && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 text-sm">
          <WifiOff size={18} />
          โหมดออฟไลน์ — ข้อมูลอาจไม่เป็นปัจจุบัน
        </div>
      )}
      {/* Header: Back + Context Title + Refresh */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Link to={isTalent ? "/job-board?tab=my-applications" : "/job-board?tab=my-jobs"} className="shrink-0 p-1 -ml-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700/50">
            <ArrowLeft size={22} />
          </Link>
          <h1 className="text-lg sm:text-xl font-bold text-slate-50 truncate">
            {effectiveTab === "applicants" && `← ${t("job_board.manage_advance.applicants_for")} ${job.title}`}
            {effectiveTab === "chat" && `← ${t("job_board.manage_advance.chat_for")} ${job.title}`}
            {effectiveTab === "escrow" && `← ${t("job_board.manage_advance.escrow_for")} ${job.title}`}
            {effectiveTab === "scope" && `← ${t("job_board.manage_advance.scope_for")} ${job.title}`}
            {effectiveTab === "review" && `← ${t("job_board.manage_advance.review_for")} ${job.title}`}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => load()}
          disabled={loading}
          className="p-2 rounded-lg bg-slate-700/50 text-slate-300 hover:bg-slate-600 disabled:opacity-50 shrink-0"
          title={t("job_board.refresh")}
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {isTalent && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200">
          <PartyPopper size={22} className="shrink-0 text-emerald-400" />
          <p className="text-sm font-medium">{t("job_board.manage_advance.talent_next_steps")}</p>
        </div>
      )}

      <div className="flex gap-2 border-b border-slate-700 pb-2 overflow-x-auto">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.id}
            type="button"
            onClick={() => setTab(tabItem.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors shrink-0 ${
              effectiveTab === tabItem.id ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "text-slate-400 hover:bg-slate-700/50"
            }`}
          >
            {tabItem.icon} {t(tabItem.labelKey)}
          </button>
        ))}
      </div>

      {effectiveTab === "applicants" && (
        <div className="luxury-card rounded-2xl p-6 space-y-4">
          {isEmployer && analytics && (
            <div className="flex flex-wrap gap-4 p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
              <span className="text-slate-400">Views: <strong className="text-slate-200">{analytics.view_count}</strong></span>
              <span className="text-slate-400">ผู้สนใจ: <strong className="text-slate-200">{analytics.applicant_count}</strong></span>
              {analytics.conversion_rate && <span className="text-slate-400">อัตราสมัคร: <strong className="text-amber-400">{analytics.conversion_rate}</strong></span>}
              {analytics.time_to_hire_days && <span className="text-slate-400">Time to hire: <strong className="text-emerald-400">{analytics.time_to_hire_days} วัน</strong></span>}
            </div>
          )}
          {applicants.length === 0 ? (
            <p className="text-slate-500 text-center py-8">{t("job_board.manage_advance.no_applicants")}</p>
          ) : (
            applicants.map((a) => {
              const canSwipeReject = isEmployer && (a.status === "interested" || a.status === "shortlisted") && a.status !== "hired";
              return (
              <div
                key={a.id}
                className="relative overflow-hidden rounded-xl"
                onTouchStart={(e) => { if (canSwipeReject) (e.currentTarget as any)._touchStartX = e.touches[0].clientX; }}
                onTouchEnd={(e) => {
                  if (!canSwipeReject || !id || !token) return;
                  const start = (e.currentTarget as any)._touchStartX;
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
              <div
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-800/50 border border-slate-700/50 relative z-10"
              >
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
                    <p className="text-sm text-slate-500">{[a.phone, a.email].filter(Boolean).join(" · ")}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-400">
                    {typeof a.completed_jobs_count === "number" && a.completed_jobs_count > 0 && (
                      <span className="flex items-center gap-1">
                        <Briefcase size={12} /> {a.completed_jobs_count} งานสำเร็จ
                      </span>
                    )}
                    {typeof a.rating === "number" && a.rating > 0 && (
                      <span className="flex items-center gap-1 text-amber-400">
                        <Star size={12} className="fill-amber-400" /> {a.rating.toFixed(1)}
                      </span>
                    )}
                    {a.skills && a.skills.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Award size={12} /> {a.skills.slice(0, 3).map((s) => s.name || s.category).filter(Boolean).join(", ")}
                        {a.skills.length > 3 && ` +${a.skills.length - 3}`}
                      </span>
                    )}
                  </div>
                  {previewApplicantId === a.user_id && (
                    <div className="mt-3 p-3 rounded-lg bg-slate-800/80 border border-slate-600/50 text-sm space-y-1">
                      <p className="text-slate-300 font-medium">ข้อมูลย่อ</p>
                      <p className="text-slate-400">งานสำเร็จ: {a.completed_jobs_count ?? 0} | Rating: {(a.rating ?? 0).toFixed(1)}</p>
                      {a.skills && a.skills.length > 0 && (
                        <p className="text-slate-400">Skills: {a.skills.map((s) => s.name || s.category).filter(Boolean).join(", ")}</p>
                      )}
                      <button onClick={() => setPreviewApplicantId(null)} className="text-xs text-amber-400 hover:underline mt-1">ปิด</button>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs ${
                      a.status === "hired" ? "bg-emerald-500/20 text-emerald-400" :
                      a.status === "shortlisted" ? "bg-amber-500/20 text-amber-400" :
                      a.status === "rejected" ? "bg-slate-600 text-slate-400" : "bg-slate-700 text-slate-300"
                    }`}>
                      {a.status === "hired" ? t("job_board.manage_advance.status_hired") : a.status === "shortlisted" ? t("job_board.manage_advance.status_shortlisted") : a.status === "rejected" ? t("job_board.manage_advance.status_rejected") : t("job_board.manage_advance.status_interested")}
                    </span>
                    {a.viewed_at && (
                      <span className="inline-block px-2 py-0.5 rounded text-xs bg-indigo-500/20 text-indigo-400">
                        {t("job_board.manage_advance.viewed")}
                      </span>
                    )}
                    {a.last_active_at && (
                      <span className="text-xs text-slate-500">
                        Last active: {new Date(a.last_active_at).toLocaleDateString("th-TH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0 items-center">
                  <button
                    onClick={() => setPreviewApplicantId(previewApplicantId === a.user_id ? null : a.user_id)}
                    className="px-4 py-2 rounded-lg bg-slate-700/50 text-slate-300 text-sm font-medium hover:bg-slate-600 inline-flex items-center gap-1"
                  >
                    {previewApplicantId === a.user_id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {t("job_board.manage_advance.view_quick_info")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileModalApplicant(a);
                      recordApplicantProfileView(id!, a.user_id, token).catch(() => {});
                    }}
                    className="px-4 py-2 rounded-lg bg-cyan-500 text-white text-sm font-medium hover:bg-cyan-600 inline-flex items-center gap-1"
                  >
                    <User size={14} />
                    {t("job_board.manage_advance.view_profile")}
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setApplicantActionsOpen(applicantActionsOpen === a.user_id ? null : a.user_id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-700/50 hover:text-slate-200"
                    >
                      <MoreVertical size={16} />
                    </button>
                    {applicantActionsOpen === a.user_id && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setApplicantActionsOpen(null)} />
                        <div className="absolute right-0 top-full mt-1 py-1 rounded-xl bg-charcoal-800 border border-slate-600 shadow-xl z-50 min-w-[140px]">
                          <button
                            onClick={() => { setReportModalUser(a); setApplicantActionsOpen(null); }}
                            className="w-full px-4 py-2 text-left text-sm text-slate-200 hover:bg-slate-700/50 flex items-center gap-2"
                          >
                            <Flag size={14} /> {t("job_board.manage_advance.report_user")}
                          </button>
                          <button
                            onClick={() => handleBlockApplicant(a)}
                            className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-slate-700/50 flex items-center gap-2"
                          >
                            <Ban size={14} /> {t("job_board.manage_advance.block_user")}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  {chatEnabled ? (
                    <Link
                      to={`/job-board/${id}/chat/${a.user_id}`}
                      className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 inline-flex items-center gap-1"
                    >
                      <MessageCircle size={14} />
                      {t("job_board.manage_advance.chat")}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => notify("แชทถูกปิดชั่วคราวโดยผู้ดูแลระบบ", "warning")}
                      className="px-4 py-2 rounded-lg bg-slate-600 text-slate-300 text-sm font-medium cursor-not-allowed inline-flex items-center gap-1 opacity-80"
                    >
                      <MessageCircle size={14} />
                      {t("job_board.manage_advance.chat")}
                    </button>
                  )}
                  {a.status === "interested" && (
                    <>
                      <button
                        type="button"
                        onClick={() => handlePatch(a.user_id, "shortlisted")}
                        disabled={!!patching}
                        className="px-4 py-2 rounded-lg bg-sky-500 text-white text-sm font-medium hover:bg-sky-600 disabled:opacity-50"
                      >
                        {patching === a.user_id ? <Loader2 size={14} className="animate-spin" /> : t("job_board.manage_advance.shortlist")}
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePatch(a.user_id, "hired", job.max_budget)}
                        disabled={!!patching}
                        className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
                      >
                        {patching === a.user_id ? <Loader2 size={14} className="animate-spin" /> : t("job_board.manage_advance.hire")}
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePatch(a.user_id, "rejected")}
                        disabled={!!patching}
                        className="px-4 py-2 rounded-lg bg-white border border-red-300 text-slate-800 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                      >
                        {t("job_board.manage_advance.reject")}
                      </button>
                    </>
                  )}
                  {a.status === "shortlisted" && (
                    <>
                      <button
                        type="button"
                        onClick={() => handlePatch(a.user_id, "hired", job.max_budget)}
                        disabled={!!patching}
                        className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium"
                      >
                        {t("job_board.manage_advance.hire")}
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePatch(a.user_id, "rejected")}
                        disabled={!!patching}
                        className="px-4 py-2 rounded-lg bg-white border border-red-300 text-slate-800 text-sm font-medium hover:bg-slate-50"
                      >
                        {t("job_board.manage_advance.reject")}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
            );
            })
          )}
        </div>
      )}

      {effectiveTab === "chat" && (
        <div className="luxury-card rounded-2xl p-6 flex flex-col h-[400px]">
          <div className="flex-1 overflow-y-auto space-y-3 mb-4 min-h-0">
            {messages.length === 0 ? (
              <p className="text-slate-500 text-center py-8">ยังไม่มีข้อความ — คุยรายละเอียดก่อนกดจ้างได้เลย</p>
            ) : (
              messages.map((msg) => {
                const isMe = user && (String(user.id) === msg.sender_id || String((user as any).userId) === msg.sender_id);
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                  >
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${isMe ? "bg-amber-500/20 text-slate-100" : "bg-slate-700/50 text-slate-200"}`}>
                      {!isMe && <p className="text-xs text-slate-500 mb-0.5">{msg.sender_name}</p>}
                      <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                      <p className="text-xs text-slate-500 mt-1">{new Date(msg.created_at).toLocaleString("th-TH")}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <p className="text-xs text-slate-500 mb-2 shrink-0">
            💬 แนะนำการสื่อสารให้มีมารยาทต่อกัน และใช้คำสุภาพต่อกัน
          </p>
          <div className="flex gap-2 shrink-0">
            <input
              type="text"
              value={chatBody}
              onChange={(e) => setChatBody(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
              placeholder="พิมพ์ข้อความ..."
              className="flex-1 px-4 py-3 rounded-xl bg-charcoal-800 border border-slate-600 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-amber-500/30 outline-none"
            />
            <button
              type="button"
              onClick={handleSendMessage}
              disabled={!chatBody.trim() || chatSubmitting}
              className="px-4 py-3 rounded-xl bg-amber-500 text-charcoal-900 font-medium disabled:opacity-50 flex items-center gap-2"
            >
              {chatSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
        </div>
      )}

      {effectiveTab === "escrow" && (
        <div className="luxury-card rounded-2xl p-6 space-y-6">
          {!hiredUserId ? (
            <p className="text-slate-500">เลือก Talent แล้วกดจ้างก่อน ถึงจะโอนเงินเข้า Escrow ได้</p>
          ) : (
            <>
              {escrowStatus === "held" || escrowStatus === "released" ? (
                <div className="space-y-4">
                  {/* Status bar + Revision counter */}
                  <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                    <div className="flex items-center gap-3">
                      <CheckCircle size={24} className="text-emerald-400 shrink-0" />
                      <div>
                        <p className="font-medium text-slate-100">
                          {escrowStatus === "released" ? "ปล่อยเงินให้ Talent ครบแล้ว (งานเสร็จสมบูรณ์)" : "โอนเงินเข้า Escrow แล้ว"}
                        </p>
                        <p className="text-amber-400 font-mono">฿{Number(escrowAmountNum).toLocaleString()}</p>
                      </div>
                    </div>
                    {escrowStatus === "held" && (
                      <span className="text-xs text-slate-400 px-2 py-1 rounded bg-slate-700/50">
                        Revision: {revisionCount}/{revisionLimit}
                      </span>
                    )}
                  </div>

                  {/* Work Submission flow — Talent & Employer */}
                  {escrowStatus === "held" && (
                    <div className="space-y-4 p-4 rounded-xl border border-slate-600/80 bg-slate-800/50">
                      {workSubmissionStatus === "submitted" ? (
                        <>
                          <h4 className="font-medium text-slate-200">สถานะ: อยู่ระหว่างตรวจสอบ (Under Review)</h4>
                          {(jobWithEscrow?.work_submission_url || (jobWithEscrow?.work_submission_links?.length ?? 0) > 0) && (
                            <div className="space-y-2">
                              <p className="text-sm text-slate-400">งานที่ Talent ส่งมา:</p>
                              {jobWithEscrow?.work_submission_url && (
                                <a href={jobWithEscrow.work_submission_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-amber-400 hover:underline break-all">
                                  <ExternalLink size={14} />
                                  {jobWithEscrow.work_submission_url}
                                </a>
                              )}
                              {jobWithEscrow?.work_submission_links?.map((l, i) => l.url && (
                                <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-amber-400 hover:underline break-all">
                                  <ExternalLink size={14} />
                                  {l.label || l.url}
                                </a>
                              ))}
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
                                {approvePaySubmitting ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
                                อนุมัติและปล่อยเงิน
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowRequestRevisionModal(true)}
                                disabled={revisionCount >= revisionLimit}
                                className="px-5 py-2.5 rounded-xl bg-slate-600 text-slate-100 font-medium hover:bg-slate-500 disabled:opacity-50 flex items-center gap-2"
                              >
                                ขอแก้ไข
                              </button>
                            </div>
                          ) : (
                            <p className="text-slate-400 text-sm">รอให้นายจ้างตรวจสอบงานที่คุณส่ง</p>
                          )}
                        </>
                      ) : (workSubmissionStatus === "revision_requested" && (jobWithEscrow?.revision_notes?.length ?? 0) > 0) ? (
                        <>
                          <h4 className="font-medium text-amber-400">นายจ้างขอให้แก้ไข</h4>
                          <div className="space-y-2">
                            {jobWithEscrow.revision_notes?.map((n, i) => (
                              <div key={i} className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                                <p className="text-slate-200 text-sm">{n.note}</p>
                                <p className="text-xs text-slate-500 mt-1">{new Date(n.requested_at).toLocaleString("th-TH")}</p>
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
                      ) : isTalent && (workSubmissionStatus === "none" || workSubmissionStatus === "revision_requested") ? (
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-slate-200">📤 ส่งมอบงานให้ลูกค้า</p>
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
                        <p className="text-slate-400 text-sm">รอ Talent ส่งงาน</p>
                      ) : null}
                      {/* 7-day auto-release note */}
                      {workSubmissionStatus === "submitted" && (
                        <p className="text-xs text-slate-500 pt-2 border-t border-slate-600">
                          หากนายจ้างไม่ตอบกลับภายใน 7 วันหลังจาก Talent ส่งงาน ระบบจะปล่อยเงินให้ Talent อัตโนมัติ (เพื่อกันนายจ้างหายตัว)
                        </p>
                      )}
                    </div>
                  )}

                  {milestones.length > 0 && (
                    <div>
                      <p className="text-slate-400 text-sm mb-3">รายการงวด — ปล่อยทีละงวด ระบบจะหักค่าธรรมเนียมอัตโนมัติ</p>
                      <div className="space-y-3">
                        {milestones.map((m) => (
                          <div
                            key={m.id}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-800/50 border border-slate-700/50"
                          >
                            <div className="flex items-center gap-3">
                              <span className="font-medium text-slate-200">งวดที่ {m.order}</span>
                              <span className="text-amber-400 font-mono">฿{m.amount.toLocaleString()}</span>
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                m.status === "released" ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
                              }`}>
                                {m.status === "released" ? "Released" : "Pending"}
                              </span>
                              {m.released_at && (
                                <span className="text-xs text-slate-500">{new Date(m.released_at).toLocaleString("th-TH")}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {m.status === "released" && (
                                <button
                                  type="button"
                                  onClick={() => setReceiptMilestone(m)}
                                  className="px-4 py-2 rounded-xl bg-slate-600 text-slate-100 font-medium hover:bg-slate-500 flex items-center gap-2"
                                >
                                  <FileText size={16} />
                                  ดูใบเสร็จ
                                </button>
                              )}
                              {m.status === "pending" && !(isEmployer && workSubmissionStatus === "submitted") && (
                                <button
                                  type="button"
                                  onClick={() => handleReleaseMilestone(m.id)}
                                  disabled={!!releasingMilestoneId}
                                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-2"
                                >
                                  {releasingMilestoneId === m.id ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                                  ปล่อยเงินงวดนี้
                                </button>
                              )}
                              {m.status === "pending" && isEmployer && workSubmissionStatus === "submitted" && (
                                <span className="text-xs text-slate-400">ใช้ปุ่ม อนุมัติและปล่อยเงิน ด้านบน</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {isTalent && (
                    <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200/90">
                      <p className="text-sm font-medium">📤 ปุ่มส่งงานอยู่ที่ไหน?</p>
                      <p className="text-xs mt-1 text-slate-300">เมื่อนายจ้างโอนเงินเข้า Escrow แล้ว ปุ่ม <strong>ส่งงาน (Submit Final Work)</strong> จะปรากฏที่ส่วนส่งมอบงาน — รอให้โอนเงินก่อน</p>
                    </div>
                  )}
                  {/* Milestone Proposal — Talent เสนอ / Employer อนุมัติ */}
                  {proposalLoading ? (
                    <div className="flex items-center gap-2 text-slate-500 py-4"><Loader2 size={18} className="animate-spin" /> โหลดโครงงวด...</div>
                  ) : (
                    <div className="space-y-4 p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                      <h4 className="font-medium text-slate-200">โครงงวด (Milestone Proposal)</h4>
                      {milestoneProposal?.status === "approved" ? (
                        <p className="text-emerald-400 text-sm">✓ โครงงวดได้รับการอนุมัติแล้ว — เมื่อโอน Escrow จะสร้างงวดตามนี้</p>
                      ) : isTalent && (!milestoneProposal || milestoneProposal.status === "rejected") ? (
                        <div className="space-y-3">
                          <p className="text-slate-400 text-sm">เสนอโครงงวด เช่น 50% ก่อนเริ่ม, 50% เมื่อส่งมอบ (ยอดรวมต้องเท่ากับ ฿{(agreedAmount ?? 0).toLocaleString()})</p>
                          <button
                            type="button"
                            onClick={() => {
                              const half = Math.round((agreedAmount ?? 0) / 2 * 100) / 100;
                              setProposalItems([
                                { order: 1, amount: String(half), description: "ก่อนเริ่มงาน" },
                                { order: 2, amount: String((agreedAmount ?? 0) - half), description: "เมื่อส่งมอบ" },
                              ]);
                            }}
                            className="text-sm text-amber-400 hover:underline"
                          >
                            ใช้ 50/50
                          </button>
                          {proposalItems.map((item, i) => (
                            <div key={i} className="flex flex-wrap gap-2 items-center">
                              <input
                                type="number"
                                step="0.01"
                                min={0}
                                value={item.amount}
                                onChange={(e) => setProposalItems((prev) => prev.map((p, j) => j === i ? { ...p, amount: e.target.value } : p))}
                                placeholder="จำนวนบาท"
                                className="w-28 px-3 py-2 rounded-lg bg-charcoal-800 border border-slate-600 text-slate-100"
                              />
                              <input
                                type="text"
                                value={item.description}
                                onChange={(e) => setProposalItems((prev) => prev.map((p, j) => j === i ? { ...p, description: e.target.value } : p))}
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
                            {proposalSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
                            ส่งโครงงวด
                          </button>
                        </div>
                      ) : !isTalent && milestoneProposal?.status === "pending" ? (
                        <div className="space-y-3">
                          <p className="text-slate-400 text-sm">Talent ส่งโครงงวดมา — อนุมัติหรือแก้ไขได้</p>
                          <ul className="space-y-1 text-slate-300">
                            {milestoneProposal.items.map((it, i) => (
                              <li key={i}>งวด {i + 1}: ฿{Number(it.amount).toLocaleString()} — {it.description || "-"}</li>
                            ))}
                          </ul>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => handleProposalAction("approve")} disabled={proposalSubmitting} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-medium disabled:opacity-50">อนุมัติ</button>
                            <button type="button" onClick={() => handleProposalAction("reject")} disabled={proposalSubmitting} className="px-4 py-2 rounded-xl bg-slate-600 text-slate-300 font-medium disabled:opacity-50">ปฏิเสธ</button>
                          </div>
                        </div>
                      ) : milestoneProposal?.status === "pending" && isTalent ? (
                        <p className="text-amber-400 text-sm">รอนายจ้างอนุมัติโครงงวด</p>
                      ) : null}
                    </div>
                  )}

                  {isEmployer ? (
                    <>
                      <p className="text-slate-300">
                        โอนเงินเข้า Escrow (Wallet กลาง) เพื่อกันเงินให้ Talent — ระบบจะปล่อยเมื่องานส่งมอบ
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
                          <label className="block text-sm text-slate-500 mb-1">จำนวนเงิน (บาท)</label>
                          <input
                            type="number"
                            min={1}
                            value={escrowAmount}
                            onChange={(e) => setEscrowAmount(e.target.value)}
                            placeholder={agreedAmount ? String(agreedAmount) : "เช่น 5000"}
                            className="w-40 px-4 py-3 rounded-xl bg-charcoal-800 border border-slate-600 text-slate-100"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleEscrow}
                          disabled={escrowSubmitting || !escrowAmount.trim()}
                          className="px-5 py-3 rounded-xl bg-amber-500 text-charcoal-900 font-bold disabled:opacity-50 flex items-center gap-2"
                        >
                          {escrowSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Wallet size={18} />}
                          โอนเข้า Escrow
                        </button>
                      </div>
                      {escrowBreakdown && Number(escrowAmount) > 0 && (
                        <div className="mt-4">
                          <PaymentBreakdown
                            jobFee={escrowBreakdown.jobFee}
                            handlingFeeAmount={escrowBreakdown.handlingFeeAmount}
                            paymentMarkupAmount={escrowBreakdown.paymentMarkupAmount}
                            commissionFeeAmount={escrowBreakdown.commissionFeeAmount}
                            talentReceives={escrowBreakdown.talentReceives}
                            totalToPay={escrowBreakdown.totalToPay}
                            insuranceAmount={escrowBreakdown.insurance_amount ?? 0}
                            mode="advance"
                            variant="dark"
                            showBenefits={true}
                            showComparison={true}
                            payoutByTier={escrowBreakdown.payout_by_tier}
                            talentCurrentTier={escrowBreakdown.talent_current_tier ?? "none"}
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
                          <p className="font-medium text-amber-200">รอนายจ้างโอนเงินเข้า Escrow</p>
                          <p className="text-sm text-slate-400">เมื่อนายจ้างโอนเงินแล้ว คุณจะเห็นรายการงวดและรับเงินตามที่ตกลง</p>
                        </div>
                      </div>

                      {/* Talent Payout Breakdown */}
                      {escrowBreakdown && agreedAmount && agreedAmount > 0 && (
                        <div className="space-y-4">
                          <div className="rounded-xl border border-slate-600/80 bg-slate-800/50 overflow-hidden">
                            <div className="px-4 py-3 bg-slate-700/50 border-b border-slate-600">
                              <h4 className="font-bold text-slate-100 text-sm">ยอดที่คุณจะได้รับจากงานนี้</h4>
                            </div>
                            <div className="p-4 space-y-2 text-sm">
                              <div className="flex justify-between items-center text-slate-300">
                                <span>ค่าจ้างงาน</span>
                                <span className="font-mono">฿{escrowBreakdown.jobFee.toLocaleString("th-TH")}</span>
                              </div>
                              <div className="flex justify-between items-center text-slate-300">
                                <span>หัก ค่าคอมมิชชั่นแพลตฟอร์ม ({Math.round((escrowBreakdown.commissionFeeAmount / escrowBreakdown.jobFee) * 100)}%)</span>
                                <span className="font-mono text-red-400">−฿{escrowBreakdown.commissionFeeAmount.toLocaleString("th-TH")}</span>
                              </div>
                              <div className="flex justify-between items-center text-slate-300">
                                <span>หัก ค่าจัดหางาน ({Math.round((escrowBreakdown.handlingFeeAmount / escrowBreakdown.jobFee) * 100)}%)</span>
                                <span className="font-mono text-red-400">−฿{escrowBreakdown.handlingFeeAmount.toLocaleString("th-TH")}</span>
                              </div>
                              <div className="border-t border-slate-600 pt-3 mt-2 flex justify-between items-center">
                                <span className="font-medium text-emerald-400">ยอดสุทธิที่คุณจะได้รับ</span>
                                <span className="font-mono font-bold text-lg text-emerald-400">฿{escrowBreakdown.talentReceives.toLocaleString("th-TH")}</span>
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
                                {(["silver", "gold", "platinum"] as const).map((tierId) => {
                                  const t = escrowBreakdown.payout_by_tier?.[tierId];
                                  if (!t) return null;
                                  const isCurrent = (escrowBreakdown.talent_current_tier ?? "none") === tierId;
                                  return (
                                    <div
                                      key={tierId}
                                      className={`flex items-center justify-between gap-4 p-4 rounded-xl border ${
                                        t.isBestValue ? "border-amber-500/50 bg-amber-500/15" : "border-slate-600/80 bg-slate-800/50"
                                      }`}
                                    >
                                      <div>
                                        <span className="font-medium text-slate-100">
                                          {t.labelTh}
                                          {t.isBestValue && <span className="ml-1 text-xs text-amber-400">(ได้รับเงินเยอะที่สุด)</span>}
                                        </span>
                                        <p className="text-xs text-slate-400 mt-0.5">รับสุทธิ ฿{t.payout.toLocaleString("th-TH")} (หักรวม {t.totalDeductionPercent}%)</p>
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
                                            onClick={() => notify("การชำระเงินถูกปิดชั่วคราวโดยผู้ดูแลระบบ", "warning")}
                                            className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-600 text-slate-300 cursor-not-allowed shrink-0 opacity-80"
                                          >
                                            อัปเกรด
                                          </button>
                                        )
                                      ) : (
                                        <span className="text-xs px-2 py-1 rounded text-emerald-400 bg-emerald-500/20 shrink-0">ปัจจุบัน</span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                              <p className="text-xs text-slate-400">
                                สิทธิประโยชน์ของ Member จะคำนวณจากยอดงานนี้ให้ทันทีเมื่อคุณอัปเกรด
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
      )}

      {effectiveTab === "scope" && hiredUserId && (
        <div className="luxury-card rounded-2xl p-6 space-y-6">
          <h3 className="text-lg font-bold text-slate-100">Scope Agreement — รายการส่งมอบ</h3>
          <p className="text-slate-400 text-sm">ทั้งสองฝ่ายต้องกดยืนยันก่อนเริ่มงาน</p>
          {scopeLoading ? (
            <div className="flex items-center gap-2 text-slate-500 py-4"><Loader2 size={18} className="animate-spin" /> โหลด...</div>
          ) : scopeAgreement?.both_confirmed ? (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
              <p className="text-emerald-400 font-medium">✓ ทั้งสองฝ่ายยืนยันแล้ว — สามารถเริ่มงานได้</p>
              <ul className="mt-2 space-y-1 text-slate-300">
                {scopeAgreement.deliverables.map((d, i) => (
                  <li key={i}>• {d.text || "-"}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                {scopeDeliverables.map((text, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="text"
                      value={text}
                      onChange={(e) => setScopeDeliverables((prev) => prev.map((p, j) => j === i ? e.target.value : p))}
                      placeholder={`รายการที่ ${i + 1}`}
                      className="flex-1 px-4 py-2 rounded-xl bg-charcoal-800 border border-slate-600 text-slate-100"
                    />
                    {scopeDeliverables.length > 1 && (
                      <button type="button" onClick={() => setScopeDeliverables((prev) => prev.filter((_, j) => j !== i))} className="px-3 py-2 rounded-xl bg-slate-600 text-slate-300 hover:bg-slate-500">ลบ</button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={() => setScopeDeliverables((prev) => [...prev, ""])} className="text-sm text-amber-400 hover:underline">+ เพิ่มรายการ</button>
              </div>
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={handleSaveScope} disabled={scopeSubmitting} className="px-4 py-2 rounded-xl bg-amber-500 text-charcoal-900 font-medium disabled:opacity-50">
                  {scopeSubmitting ? <Loader2 size={16} className="animate-spin inline" /> : null} บันทึกรายการ
                </button>
                {scopeAgreement && (
                  <button type="button" onClick={handleConfirmScope} disabled={scopeSubmitting || (isEmployer ? !!scopeAgreement.employer_confirmed_at : !!scopeAgreement.talent_confirmed_at)} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-medium disabled:opacity-50">
                    {scopeSubmitting ? <Loader2 size={16} className="animate-spin inline" /> : null} ยืนยัน
                  </button>
                )}
              </div>
              {scopeAgreement && (
                <p className="text-slate-500 text-sm">
                  {isEmployer ? (scopeAgreement.employer_confirmed_at ? "✓ คุณยืนยันแล้ว" : "รอคุณกดยืนยัน") : (scopeAgreement.talent_confirmed_at ? "✓ คุณยืนยันแล้ว" : "รอคุณกดยืนยัน")}
                  {" · "}
                  {isEmployer ? (scopeAgreement.talent_confirmed_at ? "✓ Talent ยืนยันแล้ว" : "รอ Talent ยืนยัน") : (scopeAgreement.employer_confirmed_at ? "✓ นายจ้างยืนยันแล้ว" : "รอนายจ้างยืนยัน")}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {effectiveTab === "review" && isCompleted && (
        <div className="luxury-card rounded-2xl p-6 space-y-6">
          <h3 className="text-lg font-bold text-slate-100">ให้คะแนนการร่วมงาน</h3>
          {/* Employer: ให้คะแนนผู้รับงาน (Rate Talent) — Primary reviewer */}
          {isEmployer ? (
            <>
              {myReview ? (
                <div className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700/50">
                  <p className="text-emerald-400 font-medium mb-2">คุณให้คะแนนผู้รับงานแล้ว</p>
                  <div className="flex gap-1 mb-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star key={i} size={24} className={i <= myReview.rating ? "text-amber-400 fill-amber-400" : "text-slate-600"} />
                    ))}
                  </div>
                  {myReview.comment && <p className="text-slate-300 text-sm mt-2">{myReview.comment}</p>}
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-slate-200 font-medium">ให้คะแนนผู้รับงาน (Rate Talent)</p>
                  <p className="text-slate-400 text-sm">ประเมินคุณภาพงานและพฤติกรรมของ Talent</p>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setReviewRating(i)}
                        className="p-2 rounded-xl transition hover:scale-110 focus:ring-2 focus:ring-amber-500/50"
                      >
                        <Star size={32} className={i <= reviewRating ? "text-amber-400 fill-amber-400" : "text-slate-500"} />
                      </button>
                    ))}
                  </div>
                  <div className="relative">
                    <textarea
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      placeholder="เขียนรีวิว (ถ้าต้องการ)..."
                      rows={4}
                      className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-amber-500/30 outline-none backdrop-blur-sm"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSubmitReview}
                    disabled={reviewSubmitting || reviewRating < 1}
                    className="px-6 py-3 rounded-xl bg-amber-500 text-charcoal-900 font-bold disabled:opacity-50 flex items-center gap-2"
                  >
                    {reviewSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Star size={18} />}
                    ส่งคะแนน
                  </button>
                </div>
              )}
              {/* Reviews Employer received from Talent */}
              {(() => {
                const received = reviews.filter((r) => currentUserId && String(r.reviewee_id) === String(currentUserId));
                return received.length > 0 ? (
                  <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50 mt-4">
                    <p className="text-amber-400 font-medium mb-2">ผู้รับงานให้คะแนนคุณแล้ว</p>
                    {received.map((r) => (
                      <div key={r.id || r.created_at} className="flex gap-2 mb-2">
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <Star key={i} size={18} className={i <= r.rating ? "text-amber-400 fill-amber-400" : "text-slate-600"} />
                          ))}
                        </div>
                        {r.comment && <p className="text-slate-300 text-sm">{r.comment}</p>}
                      </div>
                    ))}
                  </div>
                ) : null;
              })()}
            </>
          ) : (
            /* Talent: นายจ้างประเมินคนทำงานก่อน — แสดงผลนายจ้างให้คะแนนคุณก่อน, Rate Employer เป็นตัวเลือกเสริม */
            <>
              {/* ส่วนบน: นายจ้างให้คะแนนคุณแล้ว (หรือรออยู่) — PRIMARY สำหรับ Talent */}
              {(() => {
                const received = reviews.filter((r) => currentUserId && String(r.reviewee_id) === String(currentUserId));
                if (received.length > 0) {
                  return (
                    <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 mb-6">
                      <p className="text-emerald-400 font-medium mb-2">นายจ้างประเมินคนทำงาน (Rate Talent) — คะแนนที่คุณได้รับ</p>
                      {received.map((r) => (
                        <div key={r.id || r.created_at} className="flex gap-2 mb-2">
                          <div className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map((i) => (
                              <Star key={i} size={24} className={i <= r.rating ? "text-amber-400 fill-amber-400" : "text-slate-600"} />
                            ))}
                          </div>
                          {r.comment && <p className="text-slate-300 text-sm">{r.comment}</p>}
                        </div>
                      ))}
                    </div>
                  );
                }
                return (
                  <div className="p-6 rounded-2xl bg-amber-500/10 border border-amber-500/30 mb-6">
                    <p className="text-amber-400 font-medium">รอให้นายจ้างให้คะแนนคุณก่อน</p>
                    <p className="text-slate-400 text-sm mt-1">นายจ้างจะประเมินคุณภาพงานและพฤติกรรมของคุณ — เมื่อให้คะแนนแล้วจะแสดงตรงนี้</p>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      {/* Modal ใบเสร็จ (สรุปการจ่ายงวด) */}
      {receiptMilestone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setReceiptMilestone(null)}>
          <div
            className="bg-charcoal-800 rounded-2xl border border-slate-600 shadow-xl max-w-md w-full p-6 print:bg-white print:border print:shadow-none"
            onClick={(e) => e.stopPropagation()}
            id="receipt-print-area"
          >
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-bold text-slate-100 print:text-black">สรุปการจ่ายเงิน (ใบเสร็จ)</h3>
              <button type="button" onClick={() => setReceiptMilestone(null)} className="p-1 rounded hover:bg-slate-700 text-slate-400 print:hidden">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <p className="text-slate-300 print:text-black"><span className="text-slate-500">งาน Advance Job:</span> {(job as any)?.title || "—"}</p>
              <p className="text-slate-300 print:text-black"><span className="text-slate-500">Job ID:</span> {id}</p>
              <p className="text-slate-300 print:text-black"><span className="text-slate-500">งวดที่:</span> {receiptMilestone.order}</p>
              <p className="text-slate-300 print:text-black"><span className="text-slate-500">จำนวนที่จ่าย (งวด):</span> ฿{receiptMilestone.amount.toLocaleString()}</p>
              {receiptMilestone.commission_deducted != null && (
                <p className="text-slate-300 print:text-black"><span className="text-slate-500">ค่าธรรมเนียม (หัก):</span> ฿{receiptMilestone.commission_deducted.toLocaleString()}</p>
              )}
              {receiptMilestone.net_amount != null && (
                <p className="text-slate-300 print:text-black"><span className="text-slate-500">Talent ได้รับสุทธิ:</span> ฿{receiptMilestone.net_amount.toLocaleString()}</p>
              )}
              {receiptMilestone.released_at && (
                <p className="text-slate-300 print:text-black"><span className="text-slate-500">วันที่ปล่อย:</span> {new Date(receiptMilestone.released_at).toLocaleString("th-TH")}</p>
              )}
            </div>
            <div className="mt-6 flex gap-2 print:hidden">
              <button type="button" onClick={() => window.print()} className="px-4 py-2 rounded-xl bg-amber-500 text-charcoal-900 font-medium">พิมพ์ / บันทึกเป็น PDF</button>
              <button type="button" onClick={() => setReceiptMilestone(null)} className="px-4 py-2 rounded-xl bg-slate-600 text-slate-100">ปิด</button>
            </div>
          </div>
        </div>
      )}

      {/* การ์ดความยินดี — งานเสร็จสมบูรณ์ */}
      {congratsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => { setCongratsOpen(false); if (isEmployer && !myReview) setTab("review"); }}>
          <div className="bg-gradient-to-b from-amber-500/20 to-charcoal-800 rounded-2xl border border-amber-500/40 shadow-xl max-w-sm w-full p-8 text-center" onClick={(e) => e.stopPropagation()}>
            <PartyPopper size={48} className="mx-auto text-amber-400 mb-4" />
            <h3 className="text-xl font-bold text-slate-100 mb-2">โปรเจกต์สำเร็จ!</h3>
            <p className="text-slate-400 text-sm mb-6">งาน Advance Job เสร็จสมบูรณ์ เงินปล่อยให้ Talent ครบแล้ว</p>
            <button type="button" onClick={() => { setCongratsOpen(false); if (isEmployer && !myReview) setTab("review"); }} className="px-6 py-3 rounded-xl bg-amber-500 text-charcoal-900 font-bold">
              {isEmployer && !myReview ? "ให้คะแนนผู้รับงาน" : "ยินดีด้วย"}
            </button>
          </div>
        </div>
      )}

      {/* Profile Quick View Modal */}
      {profileModalApplicant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setProfileModalApplicant(null)}>
          <div
            className="bg-charcoal-800 rounded-2xl border border-slate-600 shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-charcoal-800/95 backdrop-blur border-b border-slate-600 flex justify-between items-center p-4">
              <h3 className="text-lg font-bold text-slate-100">{t("job_board.manage_advance.view_profile")}</h3>
              <button
                type="button"
                onClick={() => setProfileModalApplicant(null)}
                className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-slate-200"
                aria-label="Close"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div className="w-24 h-24 rounded-full bg-slate-700 flex items-center justify-center overflow-hidden shrink-0">
                  {profileModalData?.avatar_url ? (
                    <img src={profileModalData.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User size={40} className="text-slate-500" />
                  )}
                </div>
                <div className="text-center sm:text-left">
                  <h4 className="text-xl font-bold text-slate-100">{profileModalApplicant.full_name || profileModalApplicant.user_id}</h4>
                  {typeof profileModalApplicant.rating === "number" && profileModalApplicant.rating > 0 && (
                    <div className="flex items-center justify-center sm:justify-start gap-1 mt-1">
                      <Star size={18} className="text-amber-400 fill-amber-400" />
                      <span className="text-slate-200 font-medium">{profileModalApplicant.rating.toFixed(1)}</span>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <h5 className="text-sm font-medium text-slate-400 mb-1">{t("job_board.manage_advance.profile_modal_bio")}</h5>
                <p className="text-slate-200 text-sm whitespace-pre-wrap">
                  {profileModalData?.bio || t("job_board.manage_advance.profile_modal_no_bio")}
                </p>
              </div>
              {profileModalApplicant.skills && profileModalApplicant.skills.length > 0 && (
                <div>
                  <h5 className="text-sm font-medium text-slate-400 mb-2">{t("job_board.manage_advance.profile_modal_skills")}</h5>
                  <div className="flex flex-wrap gap-2">
                    {profileModalApplicant.skills.map((s, i) => (
                      <span key={i} className="px-3 py-1 rounded-lg bg-slate-700/80 text-slate-300 text-sm">
                        {s.name || s.category || "—"}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {(profileModalApplicant.phone || profileModalApplicant.email) && (
                <p className="text-sm text-slate-500">{[profileModalApplicant.phone, profileModalApplicant.email].filter(Boolean).join(" · ")}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Submit Work Modal (Talent) */}
      {showSubmitWorkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setShowSubmitWorkModal(false)}>
          <div className="bg-charcoal-800 rounded-2xl border border-slate-600 shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-100 mb-4 flex items-center gap-2">
              <Upload size={20} />
              ส่งงาน (Submit Final Work)
            </h3>
            <p className="text-sm text-slate-400 mb-4">แชร์ลิงก์งาน เช่น Google Drive, Figma, หรือ URL ตรง</p>
            <div className="space-y-4 mb-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">URL หลัก (หรือใช้ลิงก์เพิ่มเติมด้านล่าง)</label>
                <input
                  type="url"
                  value={submitWorkUrl}
                  onChange={(e) => setSubmitWorkUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-4 py-3 rounded-xl bg-charcoal-900 border border-slate-600 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">ลิงก์เพิ่มเติม (ถ้ามี)</label>
                {submitWorkLinks.map((link, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <input
                      type="url"
                      value={link.url}
                      onChange={(e) => setSubmitWorkLinks((prev) => prev.map((p, j) => (j === i ? { ...p, url: e.target.value } : p)))}
                      placeholder="https://..."
                      className="flex-1 px-4 py-2 rounded-lg bg-charcoal-900 border border-slate-600 text-slate-100"
                    />
                    <input
                      type="text"
                      value={link.label}
                      onChange={(e) => setSubmitWorkLinks((prev) => prev.map((p, j) => (j === i ? { ...p, label: e.target.value } : p)))}
                      placeholder="ชื่อ"
                      className="w-24 px-3 py-2 rounded-lg bg-charcoal-900 border border-slate-600 text-slate-100"
                    />
                    {submitWorkLinks.length > 1 && (
                      <button type="button" onClick={() => setSubmitWorkLinks((prev) => prev.filter((_, j) => j !== i))} className="p-2 text-red-400 hover:bg-red-500/20 rounded">×</button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={() => setSubmitWorkLinks((prev) => [...prev, { url: "", label: "" }])} className="text-sm text-amber-400 hover:underline">
                  + เพิ่มลิงก์
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowSubmitWorkModal(false)} className="flex-1 py-2 rounded-xl bg-slate-600 text-slate-100">
                ยกเลิก
              </button>
              <button onClick={handleSubmitWork} disabled={submitWorkSubmitting} className="flex-1 py-2 rounded-xl bg-amber-500 text-charcoal-900 font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                {submitWorkSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                ส่งงาน
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Revision Modal (Employer) */}
      {showRequestRevisionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => { setShowRequestRevisionModal(false); setRevisionNote(""); }}>
          <div className="bg-charcoal-800 rounded-2xl border border-slate-600 shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-100 mb-2">ขอแก้ไขงาน</h3>
            <p className="text-sm text-slate-400 mb-4">ระบุรายการที่ต้องแก้ไข — Talent จะได้รับแจ้งและสามารถส่งงานใหม่ได้</p>
            <textarea
              value={revisionNote}
              onChange={(e) => setRevisionNote(e.target.value)}
              placeholder="เช่น สีตัวอักษรควรเป็นดำ, เพิ่มโลโก้ที่มุมขวาล่าง..."
              className="w-full px-4 py-3 rounded-xl bg-charcoal-900 border border-slate-600 text-slate-100 mb-4 min-h-[120px]"
              maxLength={2000}
            />
            <p className="text-xs text-slate-500 mb-4">Revision: {revisionCount}/{revisionLimit} (ใช้ได้อีก {revisionLimit - revisionCount} ครั้ง)</p>
            <div className="flex gap-2">
              <button onClick={() => { setShowRequestRevisionModal(false); setRevisionNote(""); }} className="flex-1 py-2 rounded-xl bg-slate-600 text-slate-100">
                ยกเลิก
              </button>
              <button onClick={handleRequestRevision} disabled={revisionSubmitting || !revisionNote.trim() || revisionCount >= revisionLimit} className="flex-1 py-2 rounded-xl bg-amber-500 text-charcoal-900 font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                {revisionSubmitting ? <Loader2 size={18} className="animate-spin" /> : "ส่งคำขอแก้ไข"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {reportModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => { setReportModalUser(null); setReportReason(""); }}>
          <div className="bg-charcoal-800 rounded-2xl border border-slate-600 shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-100 mb-4">แจ้งรายงานผู้ใช้</h3>
            <p className="text-sm text-slate-400 mb-2">รายงาน {reportModalUser.full_name || "ผู้สมัคร"} — เหตุผล (ไม่บังคับ)</p>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="เช่น สแปม, พฤติกรรมไม่เหมาะสม..."
              className="w-full px-4 py-3 rounded-xl bg-charcoal-900 border border-slate-600 text-slate-100 mb-4 min-h-[80px]"
              maxLength={500}
            />
            <div className="flex gap-2">
              <button onClick={() => { setReportModalUser(null); setReportReason(""); }} className="flex-1 py-2 rounded-xl bg-slate-600 text-slate-100">
                ยกเลิก
              </button>
              <button
                onClick={handleReportApplicant}
                disabled={reportBlockLoading}
                className="flex-1 py-2 rounded-xl bg-red-600 text-white font-bold disabled:opacity-50"
              >
                {reportBlockLoading ? <Loader2 size={18} className="animate-spin mx-auto" /> : "แจ้งรายงาน"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
