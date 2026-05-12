/**
 * AdvanceJobChat — Private Chat ระหว่าง Employer กับ Talent ต่องาน
 * - Header: Job Title + Budget
 * - Safety message
 * - Chat messages
 * - Employer: [Send Deal] button; Accept/Decline เมื่อ Talent counter-offer
 * - Talent: Deal card with [Accept] / [Decline] / [Counter-offer]
 * - Deal expiry: หมดอายุหลัง 24 ชม.
 * - Deal history: บันทึก Deal ก่อนหน้า
 */
import React, { useEffect, useState, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Send, Shield, DollarSign, Loader2, CheckCircle, X, Clock, History, RefreshCw, ShieldCheck, Briefcase, MoreVertical, Flag, Ban } from "lucide-react";
import {
  getAdvanceJobById,
  getAdvanceJobMessages,
  postAdvanceJobMessage,
  getAdvanceJobApplicants,
  sendAdvanceJobTyping,
  getAdvanceJobTyping,
  JobServiceError,
} from "../services/jobService";
import type { JobAdvanceAPI, AdvanceApplicantWithUser, AdvanceJobMessageAPI } from "../types/api";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { useLanguage } from "../context/LanguageContext";
import { isMockJobId, getMockJobById } from "../services/mockJobsForReview";

const SAFETY_MSG = "เพื่อความปลอดภัยและรับประกันรายได้ กรุณาชำระเงินผ่านระบบ AQOND เท่านั้น";

const QUICK_REPLIES = [
  "ขอเวลาคิดก่อนนะครับ/ค่ะ",
  "พร้อมเริ่มงานได้เลย",
  "สนใจงานนี้มากครับ/ค่ะ",
  "ขอบคุณครับ/ค่ะ",
  "รบกวนส่งรายละเอียดเพิ่มเติมได้ไหมครับ/ค่ะ",
];

export const AdvanceJobChat: React.FC = () => {
  const { id, talentId } = useParams<{ id: string; talentId: string }>();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const { notify } = useNotification();
  const { t } = useLanguage();
  const [job, setJob] = useState<JobAdvanceAPI | null>(null);
  const [applicant, setApplicant] = useState<AdvanceApplicantWithUser | null>(null);
  const [messages, setMessages] = useState<AdvanceJobMessageAPI[]>([]);
  const [chatBody, setChatBody] = useState("");
  const [chatSubmitting, setChatSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deal, setDeal] = useState<{
    id: string;
    amount: number;
    status: string;
    proposed_by?: string;
    expires_at?: string | null;
  } | null>(null);
  const [dealHistory, setDealHistory] = useState<Array<{ id: string; amount: number; status: string; proposed_by?: string; created_at: string; responded_at?: string | null }>>([]);
  const [showDealModal, setShowDealModal] = useState(false);
  const [showCounterOfferModal, setShowCounterOfferModal] = useState(false);
  const [counterOfferAmount, setCounterOfferAmount] = useState("");
  const [dealAmount, setDealAmount] = useState("");
  const [dealSubmitting, setDealSubmitting] = useState(false);
  const [dealActionLoading, setDealActionLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportBlockLoading, setReportBlockLoading] = useState(false);

  const currentUserId = user?.id ?? (user as any)?.userId;
  const isEmployer = job && (String(job.employer_id) === String(currentUserId) || String((user as any)?.userId) === String(job.employer_id));
  const otherUserId = applicant ? applicant.user_id : (job ? job.employer_id : null);

  const load = useCallback(async () => {
    if (!id || !talentId) return;
    setLoading(true);
    // IMMEDIATE Mock Check — never call API for mock job IDs (prevents 404)
    if (isMockJobId(id)) {
      const mockJob = getMockJobById(id);
      if (mockJob) {
        setJob(mockJob);
        setDealAmount(String(mockJob.max_budget || mockJob.min_budget || ""));
        setApplicant(null);
        setMessages([
          {
            id: "mock-msg-welcome",
            job_id: id,
            sender_id: mockJob.employer_id,
            sender_name: mockJob.employer_name ?? "Employer",
            body: t("job_board.mock_chat_welcome"),
            created_at: new Date().toISOString(),
          },
        ]);
      }
      setLoading(false);
      return;
    }
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const [j, m] = await Promise.all([
        getAdvanceJobById(id, token),
        getAdvanceJobMessages(id, token, talentId),
      ]);
      setJob(j ?? null);
      setMessages(m || []);
      if (j) setDealAmount(String(j.max_budget || j.min_budget || ""));
      try {
        const a = await getAdvanceJobApplicants(id, token);
        const found = (a || []).find((x) => String(x.user_id) === String(talentId));
        setApplicant(found ?? null);
      } catch {
        setApplicant(null);
      }
    } catch (e) {
      notify(e instanceof JobServiceError ? e.message : "โหลดไม่สำเร็จ", "error");
    } finally {
      setLoading(false);
    }
  }, [id, talentId, token, notify, t]);

  const loadDeal = useCallback(async () => {
    if (!id || !talentId || !token || isMockJobId(id)) return;
    try {
      const { api } = await import("../services/api");
      const { data } = await api.get(`/api/advance-jobs/${id}/deals`, { params: { talent_id: talentId } });
      if (data.success && data.deal) setDeal(data.deal);
      else setDeal(null);
    } catch {
      setDeal(null);
    }
  }, [id, talentId, token]);

  const loadDealHistory = useCallback(async () => {
    if (!id || !talentId || !token || isMockJobId(id)) return;
    try {
      const { api } = await import("../services/api");
      const { data } = await api.get(`/api/advance-jobs/${id}/deals/history`, { params: { talent_id: talentId } });
      if (data.success && data.history) setDealHistory(data.history);
      else setDealHistory([]);
    } catch {
      setDealHistory([]);
    }
  }, [id, talentId, token]);

  useEffect(() => {
    load();
  }, [load]);

  // โหลดข้อความใหม่ทุก 3 วินาที — ให้ทั้งสองฝั่งเห็นข้อความกันได้แบบ real-time (skip for mock)
  useEffect(() => {
    if (!id || !talentId || !token || isMockJobId(id)) return;
    const poll = setInterval(async () => {
      try {
        const m = await getAdvanceJobMessages(id, token, talentId);
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
  }, [id, talentId, token]);

  useEffect(() => {
    loadDeal();
  }, [loadDeal]);

  useEffect(() => {
    if (showHistory) loadDealHistory();
  }, [showHistory, loadDealHistory]);

  // Poll typing indicator (skip for mock)
  useEffect(() => {
    if (!id || !talentId || !token || isMockJobId(id)) return;
    const t = setInterval(async () => {
      const v = await getAdvanceJobTyping(id, talentId, token);
      setOtherTyping(v);
    }, 2000);
    return () => clearInterval(t);
  }, [id, talentId, token]);

  // Send typing when user types (debounced, skip for mock)
  const typingTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!id || !talentId || !token || isMockJobId(id)) return;
    if (chatBody.trim()) {
      sendAdvanceJobTyping(id, talentId, true, token).catch(() => {});
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        sendAdvanceJobTyping(id, talentId, false, token).catch(() => {});
        typingTimeoutRef.current = null;
      }, 1500);
    } else {
      sendAdvanceJobTyping(id, talentId, false, token).catch(() => {});
    }
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [chatBody, id, talentId, token]);

  const handleSendMessage = async () => {
    const body = chatBody.trim();
    if (!id || !body) return;
    setChatSubmitting(true);
    if (isMockJobId(id)) {
      const mockMsg: AdvanceJobMessageAPI = {
        id: `mock-msg-${Date.now()}`,
        job_id: id,
        sender_id: currentUserId ?? "me",
        sender_name: user?.name || "ฉัน",
        body,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, mockMsg]);
      setChatBody("");
      notify(t("job_board.mock_chat_demo_sent"), "success");
      setChatSubmitting(false);
      return;
    }
    if (!token) {
      setChatSubmitting(false);
      return;
    }
    if (talentId) sendAdvanceJobTyping(id, talentId, false, token).catch(() => {});
    try {
      const newMsg = await postAdvanceJobMessage(id, body, token, talentId);
      setMessages((prev) => [...prev, { ...newMsg, sender_name: user?.name || "ฉัน" }]);
      setChatBody("");
    } catch (e) {
      notify(e instanceof JobServiceError ? e.message : "ส่งไม่สำเร็จ", "error");
    } finally {
      setChatSubmitting(false);
    }
  };

  const handleSendDeal = async () => {
    if (!id || !talentId || !token) return;
    const amt = Math.max(0, Number(dealAmount));
    if (!amt) {
      notify("กรุณาระบุจำนวนเงิน", "error");
      return;
    }
    setDealSubmitting(true);
    try {
      const { api } = await import("../services/api");
      const { data } = await api.post(`/api/advance-jobs/${id}/deals`, { talent_id: talentId, amount: amt });
      if (data.success) {
        setDeal(data.deal);
        setShowDealModal(false);
        notify("ส่ง Deal แล้ว รอ Talent ตอบรับ", "success");
        loadDeal();
        loadDealHistory();
      }
    } catch (e: any) {
      notify(e?.response?.data?.error || "ส่ง Deal ไม่สำเร็จ", "error");
    } finally {
      setDealSubmitting(false);
    }
  };

  const handleDealAction = async (action: "accept" | "decline") => {
    if (!id || !deal || !token) return;
    setDealActionLoading(true);
    try {
      const { api } = await import("../services/api");
      const { data } = await api.patch(`/api/advance-jobs/${id}/deals/${deal.id}`, { action });
      if (data.success) {
        setDeal(null);
        setShowCounterOfferModal(false);
        notify(action === "accept" ? "รับ Deal แล้ว" : "ปฏิเสธ Deal แล้ว", "success");
        load();
        loadDeal();
        loadDealHistory();
        if (action === "accept") {
          navigate(`/job-board/${id}/manage`);
        }
      }
    } catch (e: any) {
      notify(e?.response?.data?.error || "ดำเนินการไม่สำเร็จ", "error");
    } finally {
      setDealActionLoading(false);
    }
  };

  const handleCounterOffer = async () => {
    if (!id || !deal || !token) return;
    const amt = Math.max(0, Number(counterOfferAmount));
    if (!amt || amt < (job?.min_budget ?? 0) || amt > (job?.max_budget ?? 0)) {
      notify(`กรุณาระบุจำนวนระหว่าง ฿${(job?.min_budget ?? 0).toLocaleString()} – ฿${(job?.max_budget ?? 0).toLocaleString()}`, "error");
      return;
    }
    setDealActionLoading(true);
    try {
      const { api } = await import("../services/api");
      const { data } = await api.patch(`/api/advance-jobs/${id}/deals/${deal.id}`, { action: "counter_offer", amount: amt });
      if (data.success) {
        setShowCounterOfferModal(false);
        setCounterOfferAmount("");
        notify("ส่งข้อเสนอราคาใหม่แล้ว", "success");
        loadDeal();
        loadDealHistory();
      }
    } catch (e: any) {
      notify(e?.response?.data?.error || "ส่งข้อเสนอไม่สำเร็จ", "error");
    } finally {
      setDealActionLoading(false);
    }
  };

  const formatExpiry = (expiresAt: string | null | undefined) => {
    if (!expiresAt) return null;
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return "หมดอายุแล้ว";
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    if (h > 0) return `หมดอายุใน ${h} ชม. ${m} นาที`;
    return `หมดอายุใน ${m} นาที`;
  };

  const handleReport = async () => {
    if (!otherUserId || !token) return;
    setReportBlockLoading(true);
    try {
      const { api } = await import("../services/api");
      const { data } = await api.post(`/api/users/${otherUserId}/report`, {
        context: "advance_job_chat",
        context_id: id,
        reason: reportReason.trim() || undefined,
      });
      if (data.success) {
        setShowReportModal(false);
        setReportReason("");
        setShowActionsMenu(false);
        notify("ขอบคุณที่แจ้งรายงาน เราจะตรวจสอบ", "success");
      }
    } catch (e: any) {
      notify(e?.response?.data?.error || "แจ้งรายงานไม่สำเร็จ", "error");
    } finally {
      setReportBlockLoading(false);
    }
  };

  const handleBlock = async () => {
    if (!otherUserId || !token) return;
    setReportBlockLoading(true);
    try {
      const { api } = await import("../services/api");
      const { data } = await api.post(`/api/users/${otherUserId}/block`);
      if (data.success) {
        setShowActionsMenu(false);
        notify("บล็อกแล้ว", "success");
        navigate(`/job-board/${id}/manage`);
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

  return (
    <div className="space-y-4 pb-12">
      <Link
        to={isEmployer ? `/job-board/${id}/manage` : `/job-board/${id}`}
        className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-200"
      >
        <ArrowLeft size={18} /> {isEmployer ? "กลับจัดการงาน" : "กลับไป Job Board"}
      </Link>

      {/* Header: Job context */}
      <div className="luxury-card rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-100 truncate">{job.title}</h2>
          <p className="text-sm text-amber-400 flex items-center gap-1">
            <DollarSign size={14} />
            ฿{job.min_budget?.toLocaleString()} – ฿{job.max_budget?.toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
        <p className="text-sm text-slate-400 flex flex-wrap items-center gap-2">
          {applicant ? (
            <>
              แชทกับ <span className="text-slate-200">{applicant.full_name || "Talent"}</span>
              {(applicant.kyc_level === "level_2" || applicant.verified_badge) && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs">
                  <ShieldCheck size={12} /> {applicant.verified_badge || "ยืนยันตัวตน"}
                </span>
              )}
              {typeof applicant.completed_jobs_count === "number" && applicant.completed_jobs_count > 0 && (
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <Briefcase size={12} /> {applicant.completed_jobs_count} งานสำเร็จ
                </span>
              )}
            </>
          ) : (
            <>แชทกับ <span className="text-slate-200">{job.employer_name || "นายจ้าง"}</span></>
          )}
        </p>
        {otherUserId && !isMockJobId(id!) && (
          <div className="relative">
            <button
              onClick={() => setShowActionsMenu(!showActionsMenu)}
              className="p-2 rounded-lg text-slate-400 hover:bg-slate-700/50 hover:text-slate-200"
            >
              <MoreVertical size={18} />
            </button>
            {showActionsMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowActionsMenu(false)} />
                <div className="absolute right-0 top-full mt-1 py-1 rounded-xl bg-charcoal-800 border border-slate-600 shadow-xl z-50 min-w-[140px]">
                  <button
                    onClick={() => { setShowReportModal(true); setShowActionsMenu(false); }}
                    className="w-full px-4 py-2 text-left text-sm text-slate-200 hover:bg-slate-700/50 flex items-center gap-2"
                  >
                    <Flag size={14} /> แจ้งรายงาน
                  </button>
                  <button
                    onClick={() => {
                      setShowActionsMenu(false);
                      if (confirm("ต้องการบล็อกผู้ใช้นี้หรือไม่? จะไม่เห็นข้อความหรือติดต่อได้อีก")) handleBlock();
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-slate-700/50 flex items-center gap-2"
                  >
                    <Ban size={14} /> บล็อก
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        </div>
      </div>

      {/* Safety message — เด่นแต่ไม่เกะกะ */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/8 border border-amber-500/15 text-xs text-amber-200/85">
        <Shield size={14} className="text-amber-400 shrink-0" />
        <span>{SAFETY_MSG}</span>
      </div>

      {/* Deal card (Talent) — นายจ้างส่ง Deal มา */}
      {!isEmployer && deal && deal.status === "pending" && deal.proposed_by !== "talent" && (
        <div
          className="rounded-2xl p-6 border-2"
          style={{
            background: "linear-gradient(135deg, rgba(212,175,55,0.12) 0%, rgba(251,191,36,0.08) 100%)",
            borderColor: "rgba(212,175,55,0.6)",
            boxShadow: "0 0 20px rgba(212,175,55,0.15)",
          }}
        >
          <p className="text-sm text-slate-400 mb-2">นายจ้างส่ง Deal มาให้คุณ</p>
          <p className="text-2xl font-bold text-amber-400 mb-2">฿{deal.amount.toLocaleString()}</p>
          {deal.expires_at && (
            <p className="text-xs text-slate-500 mb-4 flex items-center gap-1">
              <Clock size={12} />
              {formatExpiry(deal.expires_at)}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleDealAction("accept")}
              disabled={dealActionLoading}
              className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-2"
            >
              {dealActionLoading ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
              Accept Deal
            </button>
            <button
              onClick={() => handleDealAction("decline")}
              disabled={dealActionLoading}
              className="px-4 py-2 rounded-xl bg-slate-600 text-slate-200 hover:bg-slate-500"
            >
              Decline
            </button>
            <button
              onClick={() => {
                setCounterOfferAmount(String(deal.amount));
                setShowCounterOfferModal(true);
              }}
              disabled={dealActionLoading}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-500 flex items-center gap-2"
            >
              <RefreshCw size={16} />
              เสนอราคาใหม่
            </button>
          </div>
        </div>
      )}

      {/* Deal card (Employer) — Talent เสนอราคาใหม่ (Counter-offer) */}
      {isEmployer && deal && deal.status === "pending" && deal.proposed_by === "talent" && (
        <div
          className="rounded-2xl p-6 border-2"
          style={{
            background: "linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.08) 100%)",
            borderColor: "rgba(99,102,241,0.6)",
            boxShadow: "0 0 20px rgba(99,102,241,0.15)",
          }}
        >
          <p className="text-sm text-slate-400 mb-2">Talent เสนอราคาใหม่</p>
          <p className="text-2xl font-bold text-indigo-400 mb-2">฿{deal.amount.toLocaleString()}</p>
          {deal.expires_at && (
            <p className="text-xs text-slate-500 mb-4 flex items-center gap-1">
              <Clock size={12} />
              {formatExpiry(deal.expires_at)}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => handleDealAction("accept")}
              disabled={dealActionLoading}
              className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-2"
            >
              {dealActionLoading ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
              Accept
            </button>
            <button
              onClick={() => handleDealAction("decline")}
              disabled={dealActionLoading}
              className="px-4 py-2 rounded-xl bg-slate-600 text-slate-200 hover:bg-slate-500"
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {/* Deal History */}
      <div className="luxury-card rounded-2xl p-4">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="w-full flex items-center justify-between text-left text-slate-300 hover:text-slate-100"
        >
          <span className="flex items-center gap-2">
            <History size={18} />
            ประวัติ Deal
          </span>
          <span className="text-sm text-slate-500">{showHistory ? "ซ่อน" : "แสดง"}</span>
        </button>
        {showHistory && (
          <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
            {dealHistory.length === 0 ? (
              <p className="text-slate-500 text-sm py-2">ยังไม่มีประวัติ Deal</p>
            ) : (
              dealHistory.map((h) => (
                <div key={h.id} className="flex justify-between items-center py-2 border-b border-slate-700/50 last:border-0 text-sm">
                  <span className="text-amber-400">฿{h.amount.toLocaleString()}</span>
                  <span className="text-slate-500">
                    {h.status === "accepted" && "รับแล้ว"}
                    {h.status === "declined" && "ปฏิเสธ"}
                    {h.status === "expired" && "หมดอายุ"}
                    {h.status === "counter_offered" && "Talent เสนอใหม่"}
                    {h.status === "replaced" && "ส่ง Deal ใหม่"}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Chat */}
      <div className="luxury-card rounded-2xl p-6 flex flex-col h-[400px]">
        <div className="flex-1 overflow-y-auto space-y-3 mb-4 min-h-0">
          {messages.length === 0 ? (
            <p className="text-slate-500 text-center py-8">ยังไม่มีข้อความ — เริ่มคุยได้เลย</p>
          ) : (
            messages.map((msg) => {
              const isSystem = msg.body.startsWith("[System] ");
              const body = isSystem ? msg.body.replace("[System] ", "") : msg.body;
              const isMe = user && (String(user.id) === msg.sender_id || String((user as any).userId) === msg.sender_id);
              if (isSystem) {
                return (
                  <div key={msg.id} className="flex justify-center">
                    <div className="max-w-[90%] rounded-xl px-4 py-2 bg-amber-500/15 border border-amber-500/30 text-amber-200/95 text-center">
                      <p className="text-sm">{body}</p>
                      <p className="text-xs text-slate-500 mt-1">{new Date(msg.created_at).toLocaleString("th-TH")}</p>
                    </div>
                  </div>
                );
              }
              return (
                <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${isMe ? "bg-amber-500/20 text-slate-100" : "bg-slate-700/50 text-slate-200"}`}>
                    {!isMe && <p className="text-xs text-slate-500 mb-0.5">{msg.sender_name}</p>}
                    <p className="text-sm whitespace-pre-wrap">{body}</p>
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                      {new Date(msg.created_at).toLocaleString("th-TH")}
                      {isMe && msg.read_at && <span className="text-emerald-400">· อ่านแล้ว</span>}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          {otherTyping && (
            <div className="flex justify-start">
              <div className="rounded-2xl px-4 py-2 bg-slate-700/50 text-slate-400 text-sm animate-pulse">
                กำลังพิมพ์...
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 mb-2 shrink-0">
          {QUICK_REPLIES.map((text) => (
            <button
              key={text}
              type="button"
              onClick={async () => {
                if (chatSubmitting || !id) return;
                setChatSubmitting(true);
                if (isMockJobId(id)) {
                  const mockMsg: AdvanceJobMessageAPI = {
                    id: `mock-msg-${Date.now()}`,
                    job_id: id,
                    sender_id: currentUserId ?? "me",
                    sender_name: user?.name || "ฉัน",
                    body: text,
                    created_at: new Date().toISOString(),
                  };
                  setMessages((prev) => [...prev, mockMsg]);
                  notify(t("job_board.mock_chat_demo_sent"), "success");
                  setChatSubmitting(false);
                  return;
                }
                if (!token) {
                  setChatSubmitting(false);
                  return;
                }
                try {
                  const newMsg = await postAdvanceJobMessage(id, text, token, talentId);
                  setMessages((prev) => [...prev, { ...newMsg, sender_name: user?.name || "ฉัน" }]);
                } catch (e) {
                  notify(e instanceof JobServiceError ? e.message : "ส่งไม่สำเร็จ", "error");
                } finally {
                  setChatSubmitting(false);
                }
              }}
              disabled={chatSubmitting}
              className="px-3 py-1.5 rounded-lg text-xs bg-slate-700/60 text-slate-300 hover:bg-slate-600/80 border border-slate-600/50 disabled:opacity-50"
            >
              {text}
            </button>
          ))}
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
            className="flex-1 px-4 py-3 rounded-xl bg-charcoal-800 border border-slate-600 text-slate-100 placeholder-slate-500"
          />
          {isEmployer && !job.hired_user_id && (
            <button
              onClick={() => setShowDealModal(true)}
              className="px-4 py-3 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 font-medium hover:bg-amber-500/30"
            >
              Send Deal
            </button>
          )}
          <button
            onClick={handleSendMessage}
            disabled={!chatBody.trim() || chatSubmitting}
            className="px-4 py-3 rounded-xl bg-amber-500 text-charcoal-900 font-medium disabled:opacity-50 flex items-center gap-2"
          >
            {chatSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </div>

      {/* Send Deal Modal */}
      {showDealModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setShowDealModal(false)}>
          <div className="bg-charcoal-800 rounded-2xl border border-slate-600 shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-100 mb-4">ส่ง Deal</h3>
            <p className="text-sm text-slate-400 mb-2">จำนวนเงินที่ตกลง (บาท)</p>
            <p className="text-xs text-slate-500 mb-2">อ้างอิง: ฿{job.min_budget?.toLocaleString()} – ฿{job.max_budget?.toLocaleString()}</p>
            <input
              type="number"
              min={job.min_budget}
              max={job.max_budget}
              value={dealAmount}
              onChange={(e) => setDealAmount(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-charcoal-900 border border-slate-600 text-slate-100 mb-4"
              placeholder="เช่น 5000"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowDealModal(false)} className="flex-1 py-2 rounded-xl bg-slate-600 text-slate-100">
                ยกเลิก
              </button>
              <button
                onClick={handleSendDeal}
                disabled={dealSubmitting || !dealAmount.trim()}
                className="flex-1 py-2 rounded-xl bg-amber-500 text-charcoal-900 font-bold disabled:opacity-50"
              >
                {dealSubmitting ? <Loader2 size={18} className="animate-spin mx-auto" /> : "ส่ง Deal"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Counter-offer Modal (Talent) */}
      {showCounterOfferModal && deal && job && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setShowCounterOfferModal(false)}>
          <div className="bg-charcoal-800 rounded-2xl border border-slate-600 shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-100 mb-4">เสนอราคาใหม่</h3>
            <p className="text-sm text-slate-400 mb-2">นายจ้างเสนอ ฿{deal.amount.toLocaleString()} — คุณเสนอเท่าไหร่?</p>
            <p className="text-xs text-slate-500 mb-2">อ้างอิง: ฿{job.min_budget?.toLocaleString()} – ฿{job.max_budget?.toLocaleString()}</p>
            <input
              type="number"
              min={job.min_budget}
              max={job.max_budget}
              value={counterOfferAmount}
              onChange={(e) => setCounterOfferAmount(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-charcoal-900 border border-slate-600 text-slate-100 mb-4"
              placeholder="เช่น 5500"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowCounterOfferModal(false)} className="flex-1 py-2 rounded-xl bg-slate-600 text-slate-100">
                ยกเลิก
              </button>
              <button
                onClick={handleCounterOffer}
                disabled={dealActionLoading || !counterOfferAmount.trim()}
                className="flex-1 py-2 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-50"
              >
                {dealActionLoading ? <Loader2 size={18} className="animate-spin mx-auto" /> : "ส่งข้อเสนอ"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setShowReportModal(false)}>
          <div className="bg-charcoal-800 rounded-2xl border border-slate-600 shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-100 mb-4">แจ้งรายงานผู้ใช้</h3>
            <p className="text-sm text-slate-400 mb-2">เหตุผล (ไม่บังคับ)</p>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="เช่น สแปม, พฤติกรรมไม่เหมาะสม..."
              className="w-full px-4 py-3 rounded-xl bg-charcoal-900 border border-slate-600 text-slate-100 mb-4 min-h-[80px]"
              maxLength={500}
            />
            <div className="flex gap-2">
              <button onClick={() => { setShowReportModal(false); setReportReason(""); }} className="flex-1 py-2 rounded-xl bg-slate-600 text-slate-100">
                ยกเลิก
              </button>
              <button
                onClick={handleReport}
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

