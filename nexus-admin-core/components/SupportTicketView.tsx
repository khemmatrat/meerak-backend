import React, { useState, useEffect, useCallback, useMemo } from "react";
import { io, type Socket } from "socket.io-client";
import {
  Clock,
  CheckCircle,
  Send,
  Phone,
  Mail,
  Zap,
  Shield,
  AlertTriangle,
  BookOpen,
  Trash2,
  X,
  Bot,
  Sparkles,
  Briefcase,
  UserPlus,
  Rocket,
  ExternalLink,
} from "lucide-react";
import {
  getSupportTickets,
  replySupportTicket,
  resolveSupportTicket,
  setSupportTicketAiMode,
  getSupportAiSuggestion,
  saveSupportBestAnswer,
  getFaqKnowledge,
  deleteFaqKnowledge,
  listKnowledgeDrafts,
  promoteKnowledgeDraft,
  getAdminUser,
  inviteSupportProvider,
  postSupportLearningFeedback,
  generateSupportFaqDraft,
  addSupportTicketMediaUrl,
  patchSupportTicket,
  applySupportCareAction,
  startSupportCareReroute,
  getSupportCareAnalytics,
  getSupportCareAnalyticsTrend,
  exportSupportCareAnalyticsCsv,
  listSupportServiceFeatureRequests,
  acknowledgeSupportServiceFeatureRequest,
  listSupportServiceSecurityIncidents,
  listSupportServiceChatSummaries,
  getAdminSocketOrigin,
  getAdminToken,
  type SupportTicketRow,
  type FaqKnowledgeItem,
  type SupportServiceFeatureRequest,
  type SupportServiceSecurityIncident,
  type SupportServiceChatSummary,
  type SupportCareAnalyticsSummary,
  type SupportCareAnalyticsProvider,
  type SupportCareAnalyticsEvent,
} from "../services/adminApi";
import { useChatMessages } from "../hooks/useChatMessages";
import { MessageBubble } from "./chat/MessageBubble";
import { AiModeToggle } from "./chat/AiModeToggle";
import { Toast } from "./chat/Toast";
import type { AdminUser } from "../types";

// คำตอบแนะนำสำหรับ 403 และ 429 — ให้แอดมินกดใช้แล้วส่งได้ทันที แก้ปัญหาจนสิ้นสุด
const CANNED_REPLY_429 = `สวัสดีครับ สำหรับข้อความ **429 (Rate Limit)** ระบบจำกัดจำนวนครั้งในการลองเพื่อความปลอดภัย

**วิธีแก้:**
1. รอเวลาตามที่แอปแจ้ง (มัก 1–15 นาที) แล้วลองเข้าสู่ระบบใหม่
2. ถ้าลืมรหัสผ่าน: กด "ลืมรหัสผ่าน" ที่หน้า Login เพื่อรีเซ็ตรหัส
3. ถ้ายังติดอยู่: แจ้งเบอร์โทรหรืออีเมลที่ใช้สมัครมา เราจะตรวจสอบและปลดล็อกให้

หากทำตามแล้วยังไม่ได้ผล แจ้งเพิ่มได้เลยครับ เราจะดำเนินการให้จนแก้ไขสิ้นสุด`;

function priorityRank(p: string): number {
  const u = (p || "").toUpperCase();
  if (u === "URGENT") return 0;
  if (u === "HIGH") return 1;
  if (u === "MEDIUM") return 2;
  if (u === "LOW") return 3;
  return 2;
}

/** Sentiment สำหรับเรียงคิว: ค่าต่ำ = ลูกค้าหงุดหงิดมากกว่า (ดูก่อน) — ใช้ค่าจาก backend หรือประมาณจากหัวข้อ */
function effectiveSentiment(t: SupportTicketRow): {
  label: string;
  score: number;
} {
  if (
    t.sentiment_label != null &&
    t.sentiment_score != null &&
    !Number.isNaN(Number(t.sentiment_score))
  ) {
    return {
      label: String(t.sentiment_label),
      score: Number(t.sentiment_score),
    };
  }
  const text = `${t.subject} ${t.category} ${t.source || ""}`.toLowerCase();
  let score = 0.5;
  const neg = [
    "แย่",
    "โกง",
    "ร้อง",
    "ฟ้อง",
    "ไม่พอใจ",
    "รอนาน",
    "เงิน",
    "dispute",
    "refund",
    "error",
    "บั๊ก",
    "bug",
    "urgent",
    "ด่วน",
  ];
  const pos = ["ขอบคุณ", "ดีมาก", "สุดยอด", "ok", "thanks", "hello"];
  for (const w of neg) if (text.includes(w)) score -= 0.07;
  for (const w of pos) if (text.includes(w)) score += 0.06;
  if (t.priority === "URGENT" || t.priority === "HIGH") score -= 0.08;
  score = Math.max(0, Math.min(1, score));
  let label = "neutral";
  if (score < 0.38) label = "negative";
  else if (score > 0.62) label = "positive";
  return { label, score };
}

function sortOpenTickets(a: SupportTicketRow, b: SupportTicketRow): number {
  if (!!a.isEmergency !== !!b.isEmergency) return a.isEmergency ? -1 : 1;
  const pr = priorityRank(a.priority) - priorityRank(b.priority);
  if (pr !== 0) return pr;
  const sa = effectiveSentiment(a).score;
  const sb = effectiveSentiment(b).score;
  if (sa !== sb) return sa - sb;
  return (
    new Date(a.createdAt || a.lastUpdated).getTime() -
    new Date(b.createdAt || b.lastUpdated).getTime()
  );
}

const CANNED_REPLY_403 = `สวัสดีครับ สำหรับข้อความ **403 (Forbidden / ไม่มีสิทธิ์)**

**กรณีทั่วไป:**
• ตรวจสอบว่าเข้าสู่ระบบแล้ว และบัญชีไม่ถูกระงับ
• ลองออกจากระบบแล้วเข้าสู่ระบบใหม่

**กรณี "เงินถูกล็อก" / ปล่อยเงินไม่ได้:**
• ถ้ามีการยื่น Dispute งานนั้น ระบบจะล็อกเงินไว้จนกว่าแอดมินจะตัดสิน
• รอทีมงานพิจารณา Dispute (24–48 ชม.) แล้วสถานะจะอัปเดต

ถ้าเป็นกรณีอื่น แจ้งรายละเอียด (เช่น หน้าที่เจอ งานที่เกี่ยวข้อง) เราจะตรวจและแก้ให้จนสิ้นสุดครับ`;

export interface SupportTicketViewProps {
  /** ลดความสูงเมื่อฝังใน Dashboard (มีแท็บ + banner ด้านบน) */
  embeddedInDashboard?: boolean;
  /** เปิด User Management โฟกัส user นี้ (จากตั๋ว) */
  onOpenUserInAdmin?: (userId: string) => void;
  /** ใช้คุมสิทธิ์ approve/delete คลังความรู้ */
  currentUser?: AdminUser | null;
}

export const SupportTicketView: React.FC<SupportTicketViewProps> = ({
  embeddedInDashboard = false,
  onOpenUserInAdmin,
  currentUser,
}) => {
  const [allTickets, setAllTickets] = useState<SupportTicketRow[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [statusFilter, setStatusFilter] = useState<"OPEN" | "RESOLVED">("OPEN");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [reroutingCare, setReroutingCare] = useState(false);
  const [careActionLoading, setCareActionLoading] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  /** AI Toggle: true = น้องรักษ์ตอบอัตโนมัติเมื่อ User ส่ง + Admin ส่งเป็น BOT, false = Manual */
  const [aiMode, setAiMode] = useState(false);
  /** ข้อความที่ Admin บันทึกเป็น Best Answer แล้ว (เพื่อแสดงดาวสีเหลืองถาวร) */
  const [savedMessageIds, setSavedMessageIds] = useState<Set<string>>(
    new Set(),
  );
  /** Toast */
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("Knowledge Saved");
  /** Knowledge Base Modal */
  const [kbOpen, setKbOpen] = useState(false);
  const [kbItems, setKbItems] = useState<FaqKnowledgeItem[]>([]);
  const [kbDrafts, setKbDrafts] = useState<
    Array<{
      id: string;
      question: string;
      draft_answer: string;
      category: string;
      created_at: string;
    }>
  >([]);
  const [serverCanManageKnowledge, setServerCanManageKnowledge] =
    useState(false);
  const [kbLoading, setKbLoading] = useState(false);
  const [selectedUserDetail, setSelectedUserDetail] = useState<{
    full_name?: string;
    email?: string;
    phone?: string;
  } | null>(null);
  /** Shadow Mode: เก็บ draft ล่าสุดจาก AI Suggest เพื่อบันทึก learning เมื่อ Admin แก้ก่อนส่ง */
  const [lastAiSuggestion, setLastAiSuggestion] = useState<string | null>(null);
  /** Three-way: ส่งในชื่อ Verified Pro (หลังเชิญแล้ว) */
  const [sendAsProvider, setSendAsProvider] = useState(false);
  const [invitingPro, setInvitingPro] = useState(false);
  const [draftFaqOnResolve, setDraftFaqOnResolve] = useState(false);
  const [faqDraftLoading, setFaqDraftLoading] = useState(false);
  const [mediaUrlInput, setMediaUrlInput] = useState("");
  const [mediaSaving, setMediaSaving] = useState(false);
  const [promotingDraftId, setPromotingDraftId] = useState<string | null>(null);
  const [supportBridgeLoading, setSupportBridgeLoading] = useState(false);
  const [supportBridgeError, setSupportBridgeError] = useState<string | null>(
    null,
  );
  const [supportFeatureRequests, setSupportFeatureRequests] = useState<
    SupportServiceFeatureRequest[]
  >([]);
  const [supportIncidents, setSupportIncidents] = useState<
    SupportServiceSecurityIncident[]
  >([]);
  const [supportChatSummaries, setSupportChatSummaries] = useState<
    SupportServiceChatSummary[]
  >([]);
  const [supportCareSummary, setSupportCareSummary] =
    useState<SupportCareAnalyticsSummary | null>(null);
  const [supportCareFastestProviders, setSupportCareFastestProviders] =
    useState<SupportCareAnalyticsProvider[]>([]);
  const [supportCareRecentEvents, setSupportCareRecentEvents] = useState<
    SupportCareAnalyticsEvent[]
  >([]);
  const [supportCareTrend7, setSupportCareTrend7] = useState<{
    open_rate_pct: number;
    accept_rate_pct: number;
    pushes: number;
  } | null>(null);
  const [supportCareTrend30, setSupportCareTrend30] = useState<{
    open_rate_pct: number;
    accept_rate_pct: number;
    pushes: number;
  } | null>(null);
  const [careExporting, setCareExporting] = useState(false);

  const { messages, fetchMessages, messagesEndRef } = useChatMessages(
    selectedTicketId,
    getAdminToken,
  );

  const fetchKb = useCallback(async () => {
    setKbLoading(true);
    try {
      const [res, drafts] = await Promise.all([
        getFaqKnowledge(),
        listKnowledgeDrafts(30).catch(() => ({ items: [] })),
      ]);
      setKbItems(res.items || []);
      setKbDrafts(drafts.items || []);
      setServerCanManageKnowledge(!!drafts.can_manage_knowledge);
    } catch {
      setKbItems([]);
      setKbDrafts([]);
      setServerCanManageKnowledge(false);
    } finally {
      setKbLoading(false);
    }
  }, []);

  useEffect(() => {
    if (kbOpen) fetchKb();
  }, [kbOpen, fetchKb]);

  // โหลด KB เมื่อเปิดหน้า Support (เพื่อ sync ดาวกับข้อความที่เคยบันทึก)
  useEffect(() => {
    fetchKb();
  }, [fetchKb]);

  // Sync saved state: ถ้า message ตรงกับ faq item ให้แสดงดาวสีเหลือง
  useEffect(() => {
    if (kbItems.length === 0) return;
    setSavedMessageIds((prev) => {
      const next = new Set(prev);
      for (let idx = 0; idx < messages.length; idx++) {
        const msg = messages[idx];
        if (msg.sender !== "ADMIN") continue;
        const prevUserMsg = [...messages]
          .slice(0, idx)
          .reverse()
          .find((m) => m.sender === "USER");
        const hasMatch = kbItems.some(
          (faq) =>
            faq.best_answer.trim() === msg.message.trim() &&
            (!prevUserMsg ||
              faq.question.trim() === prevUserMsg.message.trim()),
        );
        if (hasMatch) next.add(msg.id);
      }
      return next;
    });
  }, [kbItems, messages]);

  const openTickets = allTickets.filter(
    (t) => t.status === "OPEN" || t.status === "IN_PROGRESS",
  );
  const resolvedTickets = allTickets.filter(
    (t) => t.status === "RESOLVED" || t.status === "CLOSED",
  );
  const tickets =
    statusFilter === "OPEN"
      ? [...openTickets].sort(sortOpenTickets)
      : [...resolvedTickets].sort(
          (a, b) =>
            new Date(b.lastUpdated || b.createdAt).getTime() -
            new Date(a.lastUpdated || a.createdAt).getTime(),
        );

  const queueKpis = useMemo(() => {
    const open = allTickets.filter(
      (t) => t.status === "OPEN" || t.status === "IN_PROGRESS",
    );
    const urgent = open.filter(
      (t) => t.priority === "URGENT" || t.priority === "HIGH",
    ).length;
    const aiOn = open.filter((t) => t.ai_mode_enabled).length;
    const neg = open.filter(
      (t) => effectiveSentiment(t).label === "negative",
    ).length;
    return { open: open.length, urgent, aiOn, neg };
  }, [allTickets]);
  const formatMsBrief = useCallback((ms?: number | null) => {
    if (!ms || !Number.isFinite(ms)) return "—";
    if (ms < 1000) return `${ms}ms`;
    const sec = Math.round(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    const remSec = sec % 60;
    return `${min}m ${remSec}s`;
  }, []);
  const openCount = openTickets.length;
  const resolvedCount = resolvedTickets.length;
  const selectedTicket = tickets.find((t) => t.id === selectedTicketId);
  const careTickets = allTickets.filter(
    (t) =>
      (t.care_timeline || []).length > 0 || t.reroute_sla?.status === "running",
  );
  const activeCareTickets = careTickets.filter(
    (t) => t.status === "OPEN" || t.status === "IN_PROGRESS",
  );
  const currentRole = String(currentUser?.role || "").toUpperCase();
  const canManageKnowledge =
    currentRole === "SUPER_ADMIN" ||
    currentRole === "OWNER" ||
    currentRole === "FOUNDER" ||
    currentUser?.permissions?.includes("support_knowledge:approve") ||
    serverCanManageKnowledge;

  useEffect(() => {
    if (selectedTicket) setAiMode(!!selectedTicket.ai_mode_enabled);
  }, [selectedTicket?.id, selectedTicket?.ai_mode_enabled]);

  useEffect(() => {
    if (!selectedTicket?.userId || !getAdminToken()) {
      setSelectedUserDetail(null);
      return;
    }
    let cancelled = false;
    getAdminUser(selectedTicket.userId)
      .then((res) => {
        if (!cancelled && res?.user)
          setSelectedUserDetail({
            full_name: res.user.full_name,
            email: res.user.email,
            phone: res.user.phone,
          });
        else if (!cancelled) setSelectedUserDetail(null);
      })
      .catch(() => {
        if (!cancelled) setSelectedUserDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTicket?.userId]);

  const fetchTickets = async () => {
    if (!getAdminToken()) {
      setError("กรุณา Login เพื่อดูตั๋วสนับสนุนจากผู้ใช้จริง");
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const res = await getSupportTickets();
      const list = res.tickets || [];
      setAllTickets(list);
      const openList = list.filter(
        (t) => t.status === "OPEN" || t.status === "IN_PROGRESS",
      );
      const openSorted = [...openList].sort(sortOpenTickets);
      if (!selectedTicketId && openSorted.length > 0) {
        setSelectedTicketId(openSorted[0].id);
      } else if (!selectedTicketId && list.length > 0) {
        setSelectedTicketId(list[0].id);
      }
      if (selectedTicketId && !list.find((t) => t.id === selectedTicketId)) {
        setSelectedTicketId(openSorted[0]?.id ?? list[0]?.id ?? null);
      }
    } catch (e: any) {
      setError(e?.message || "โหลดตั๋วไม่สำเร็จ");
      setAllTickets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
    const interval = setInterval(fetchTickets, 15000);
    return () => clearInterval(interval);
  }, []);

  const fetchSupportBridge = useCallback(async () => {
    if (!getAdminToken()) return;
    setSupportBridgeLoading(true);
    setSupportBridgeError(null);
    try {
      const [features, incidents, summaries, careAnalytics, trend7, trend30] =
        await Promise.all([
          listSupportServiceFeatureRequests("open"),
          listSupportServiceSecurityIncidents(),
          listSupportServiceChatSummaries(),
          getSupportCareAnalytics(24),
          getSupportCareAnalyticsTrend(7),
          getSupportCareAnalyticsTrend(30),
        ]);
      setSupportFeatureRequests(features.items || []);
      setSupportIncidents(incidents.items || []);
      setSupportChatSummaries(summaries.items || []);
      setSupportCareSummary(careAnalytics.summary || null);
      setSupportCareFastestProviders(careAnalytics.fastest_providers || []);
      setSupportCareRecentEvents(careAnalytics.recent_events || []);
      const summarizeTrend = (
        points: Array<{
          open_rate_pct: number;
          accept_rate_pct: number;
          pushes: number;
        }>,
      ) => {
        if (!points?.length) return null;
        const pushes = points.reduce(
          (sum, p) => sum + Number(p.pushes || 0),
          0,
        );
        if (pushes <= 0)
          return { open_rate_pct: 0, accept_rate_pct: 0, pushes: 0 };
        const weightedOpen =
          points.reduce(
            (sum, p) =>
              sum + Number(p.open_rate_pct || 0) * Number(p.pushes || 0),
            0,
          ) / pushes;
        const weightedAccept =
          points.reduce(
            (sum, p) =>
              sum + Number(p.accept_rate_pct || 0) * Number(p.pushes || 0),
            0,
          ) / pushes;
        return {
          open_rate_pct: Number(weightedOpen.toFixed(2)),
          accept_rate_pct: Number(weightedAccept.toFixed(2)),
          pushes,
        };
      };
      setSupportCareTrend7(summarizeTrend(trend7.points || []));
      setSupportCareTrend30(summarizeTrend(trend30.points || []));
    } catch (e: any) {
      setSupportBridgeError(
        e?.message || "โหลดข้อมูล Support AI bridge ไม่สำเร็จ",
      );
    } finally {
      setSupportBridgeLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSupportBridge();
  }, [fetchSupportBridge]);

  useEffect(() => {
    if (!getAdminToken()) return;
    const origin = getAdminSocketOrigin();
    if (!origin) return;
    const socket: Socket = io(origin, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });
    const join = () => {
      const t = getAdminToken();
      if (t) socket.emit("joinAdminSupport", { token: t });
    };
    socket.on("connect", join);
    const bump = () => {
      getSupportTickets()
        .then((res) => {
          const list = res.tickets || [];
          setAllTickets(list);
        })
        .catch(() => {});
    };
    socket.on("support_event", bump);
    return () => {
      socket.off("connect", join);
      socket.off("support_event", bump);
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    setLastAiSuggestion(null);
    setSendAsProvider(false);
  }, [selectedTicketId]);

  // โหลดข้อความ + Polling แบบ Realtime — ใช้ useChatMessages hook (รองรับ WebSocket ในอนาคต)

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !selectedTicketId) return;
    if (sendAsProvider && !aiMode && !selectedTicket?.invited_provider_id) {
      setError("กดเชิญ Verified Pro ก่อน แล้วค่อยส่งในชื่อ Pro");
      return;
    }
    const final = messageInput.trim();
    setSending(true);
    try {
      await replySupportTicket(
        selectedTicketId,
        final,
        aiMode,
        !aiMode && sendAsProvider,
      );
      if (!aiMode && lastAiSuggestion && final !== lastAiSuggestion.trim()) {
        postSupportLearningFeedback({
          ticket_id: selectedTicketId,
          ai_suggestion: lastAiSuggestion,
          admin_final: final,
        }).catch(() => {});
      }
      setLastAiSuggestion(null);
      setMessageInput("");
      await fetchMessages();
    } catch (e: any) {
      setError(e?.message || "ส่งข้อความไม่สำเร็จ");
    } finally {
      setSending(false);
    }
  };

  const handleInviteProvider = async () => {
    if (!selectedTicketId) return;
    setInvitingPro(true);
    setError(null);
    try {
      const res = await inviteSupportProvider(selectedTicketId);
      setAllTickets((prev) =>
        prev.map((t) =>
          t.id === selectedTicketId
            ? {
                ...t,
                invited_provider_id: res.invited_provider_id,
                invited_provider_name: res.invited_provider_name,
              }
            : t,
        ),
      );
      await fetchMessages();
    } catch (e: any) {
      setError(e?.message || "เชิญ Verified Pro ไม่สำเร็จ");
    } finally {
      setInvitingPro(false);
    }
  };

  const handleRunCareReroute = async () => {
    if (!selectedTicketId) return;
    setReroutingCare(true);
    setError(null);
    try {
      const res = await startSupportCareReroute(selectedTicketId, {
        job_id: selectedTicket?.jobId || null,
      });
      setToastMessage(
        `ตรวจงานจริงแล้ว พบผู้รับงานว่าง ${res.candidate_count ?? 0} คน`,
      );
      setToastVisible(true);
      await fetchTickets();
      await fetchMessages();
    } catch (e: any) {
      setError(e?.message || "เริ่ม Real Reroute ไม่สำเร็จ");
    } finally {
      setReroutingCare(false);
    }
  };

  const handleCareAction = async (
    action:
      | "confirm_replacement"
      | "refund"
      | "coupon"
      | "insurance"
      | "review_provider",
    providerId?: string,
  ) => {
    if (!selectedTicketId) return;
    setCareActionLoading(action);
    setError(null);
    try {
      if (action === "confirm_replacement") {
        if (!providerId) {
          setError("ยังไม่มี candidate สำหรับยืนยันคนแทน");
          return;
        }
        await applySupportCareAction(selectedTicketId, {
          action,
          provider_id: providerId,
          actor: "admin",
        });
      } else {
        await applySupportCareAction(selectedTicketId, {
          action,
          actor: "admin",
        });
      }
      setToastMessage("บันทึก Care action แล้ว");
      setToastVisible(true);
      await fetchTickets();
      await fetchMessages();
    } catch (e: any) {
      setError(e?.message || "บันทึก Care action ไม่สำเร็จ");
    } finally {
      setCareActionLoading(null);
    }
  };

  const handleGenerateFaqDraft = async () => {
    if (!selectedTicketId) return;
    setFaqDraftLoading(true);
    setError(null);
    try {
      await generateSupportFaqDraft(selectedTicketId);
      setToastMessage("บันทึก FAQ draft ลง knowledge_base_drafts แล้ว");
      setToastVisible(true);
      await fetchTickets();
    } catch (e: any) {
      setError(e?.message || "สร้าง FAQ draft ไม่สำเร็จ");
    } finally {
      setFaqDraftLoading(false);
    }
  };

  const handleAddMediaUrl = async () => {
    if (!selectedTicketId || !mediaUrlInput.trim()) return;
    setMediaSaving(true);
    setError(null);
    try {
      await addSupportTicketMediaUrl(selectedTicketId, {
        url: mediaUrlInput.trim(),
        type: "image",
      });
      setMediaUrlInput("");
      await fetchTickets();
      setTimeout(() => fetchTickets(), 4000);
    } catch (e: any) {
      setError(e?.message || "แนบลิงก์มีเดียไม่สำเร็จ");
    } finally {
      setMediaSaving(false);
    }
  };

  const handleMarkResolved = async () => {
    if (!selectedTicketId) return;
    try {
      if (draftFaqOnResolve) {
        setFaqDraftLoading(true);
        try {
          await generateSupportFaqDraft(selectedTicketId);
        } catch (e: any) {
          setError(e?.message || "สร้าง FAQ draft ไม่สำเร็จ — ยังไม่ปิดตั๋ว");
          setFaqDraftLoading(false);
          return;
        } finally {
          setFaqDraftLoading(false);
        }
      }
      await resolveSupportTicket(selectedTicketId, "RESOLVED");
      await fetchTickets();
      if (tickets.find((t) => t.id === selectedTicketId)) {
        const next = tickets.filter((t) => t.id !== selectedTicketId)[0];
        setSelectedTicketId(next?.id ?? null);
      }
    } catch (e: any) {
      setError(e?.message || "อัปเดตสถานะไม่สำเร็จ");
    }
  };

  const handleAssignMe = async () => {
    if (!selectedTicketId) return;
    setError(null);
    try {
      await patchSupportTicket(selectedTicketId, { assignToMe: true });
      await fetchTickets();
    } catch (e: any) {
      setError(e?.message || "มอบหมายไม่สำเร็จ");
    }
  };

  const handleWaitingOnChange = async (v: string) => {
    if (!selectedTicketId) return;
    setError(null);
    try {
      await patchSupportTicket(selectedTicketId, { waitingOn: v });
      await fetchTickets();
    } catch (e: any) {
      setError(e?.message || "อัปเดตป้ายไม่สำเร็จ");
    }
  };

  const handleAiSuggest = async () => {
    if (!selectedTicketId) return;
    setAiLoading(true);
    try {
      const res = await getSupportAiSuggestion(selectedTicketId);
      const s = res.suggestion || "";
      setMessageInput(s);
      setLastAiSuggestion(s || null);
    } catch {
      const fallback =
        "สวัสดีครับ ขอบคุณที่ติดต่อเรา ทีมงานจะตรวจสอบและติดต่อกลับโดยเร็วครับ";
      setMessageInput(fallback);
      setLastAiSuggestion(fallback);
    } finally {
      setAiLoading(false);
    }
  };

  const handleAcknowledgeFeature = async (id: string) => {
    try {
      await acknowledgeSupportServiceFeatureRequest(id);
      await fetchSupportBridge();
      setToastMessage("รับทราบ feature request แล้ว");
      setToastVisible(true);
    } catch (e: any) {
      setSupportBridgeError(e?.message || "อัปเดต feature request ไม่สำเร็จ");
    }
  };

  const handleExportCareAnalytics = async () => {
    setCareExporting(true);
    try {
      const blob = await exportSupportCareAnalyticsCsv(24 * 30);
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `care-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      setToastMessage("ดาวน์โหลด care analytics CSV แล้ว");
      setToastVisible(true);
    } catch (e: any) {
      setSupportBridgeError(e?.message || "ดาวน์โหลด CSV ไม่สำเร็จ");
    } finally {
      setCareExporting(false);
    }
  };

  const selectedUserBridgeSummaries = selectedTicket?.userId
    ? supportChatSummaries
        .filter((s) => String(s.user_id) === String(selectedTicket.userId))
        .slice(0, 2)
    : [];

  const shellClass = embeddedInDashboard
    ? "flex flex-col gap-4 min-h-[calc(100vh-280px)]"
    : "flex flex-col gap-4 h-[calc(100vh-140px)]";

  return (
    <div className={shellClass}>
      {/* Executive / Ops strip — ให้ผู้บริหารเห็นภาพรวมว่า AI + ทีมรับมือได้ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 shrink-0">
        <div className="rounded-xl border border-indigo-100 bg-white p-3 shadow-sm">
          <p className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1">
            <Sparkles size={12} className="text-indigo-500" /> Minnie + Help
            Center
          </p>
          <p className="text-lg font-bold text-slate-800 mt-0.5">
            AI บรรทัดแรก
          </p>
          <p className="text-[11px] text-slate-500">
            เชื่อม KB อัตโนมัติ 24 ชม.
          </p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
          <p className="text-[10px] font-bold uppercase text-slate-500">
            คิวเปิด
          </p>
          <p className="text-lg font-bold text-indigo-700">{queueKpis.open}</p>
          <p className="text-[11px] text-slate-500">รอแอดมิน / AI</p>
        </div>
        <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-3 shadow-sm">
          <p className="text-[10px] font-bold uppercase text-rose-700">
            ด่วน / High
          </p>
          <p className="text-lg font-bold text-rose-800">{queueKpis.urgent}</p>
          <p className="text-[11px] text-rose-600/90">Priority สูงสุดก่อน</p>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-3 shadow-sm">
          <p className="text-[10px] font-bold uppercase text-amber-800">
            Sentiment เสี่ยง
          </p>
          <p className="text-lg font-bold text-amber-900">{queueKpis.neg}</p>
          <p className="text-[11px] text-amber-800/90">ประมาณจากข้อความ</p>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 shadow-sm col-span-2 sm:col-span-1">
          <p className="text-[10px] font-bold uppercase text-emerald-800 flex items-center gap-1">
            <Bot size={12} /> AI mode เปิด
          </p>
          <p className="text-lg font-bold text-emerald-900">{queueKpis.aiOn}</p>
          <p className="text-[11px] text-emerald-800/90">ตั๋วที่ปล่อยบอทตอบ</p>
        </div>
        <div className="rounded-xl border border-cyan-100 bg-cyan-50/40 p-3 shadow-sm col-span-2 sm:col-span-1">
          <p className="text-[10px] font-bold uppercase text-cyan-800">
            FCM Delivery
          </p>
          <p className="text-lg font-bold text-cyan-900">
            {supportCareSummary?.success_tokens ?? 0}/
            {(supportCareSummary?.success_tokens ?? 0) +
              (supportCareSummary?.failed_tokens ?? 0)}
          </p>
          <p className="text-[11px] text-cyan-800/90">
            open {supportCareSummary?.open_rate_pct ?? 0}%
          </p>
        </div>
        <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3 shadow-sm col-span-2 sm:col-span-1">
          <p className="text-[10px] font-bold uppercase text-violet-800">
            Provider Accept
          </p>
          <p className="text-lg font-bold text-violet-900">
            {formatMsBrief(supportCareSummary?.avg_accept_ms)}
          </p>
          <p className="text-[11px] text-violet-800/90">
            p50 {formatMsBrief(supportCareSummary?.p50_accept_ms)}
          </p>
        </div>
      </div>

      {activeCareTickets.length > 0 && (
        <div className="rounded-xl border border-rose-200 bg-gradient-to-r from-rose-50 to-amber-50 p-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-rose-800 flex items-center gap-1">
                <AlertTriangle size={14} /> Owner Control Room · Care Timeline
              </p>
              <p className="text-[11px] text-rose-700">
                เคสวิกฤตที่ระบบกำลังดูแลแบบเรียลไทม์ {activeCareTickets.length}{" "}
                เคส
              </p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-rose-700 border border-rose-100">
              Auto Reroute SLA running
            </span>
          </div>
          <div className="mt-2 grid gap-2 md:grid-cols-3">
            {activeCareTickets.slice(0, 3).map((ticket) => {
              const latest = (ticket.care_timeline || []).slice(-1)[0];
              return (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => setSelectedTicketId(ticket.id)}
                  className="rounded-lg border border-white bg-white/80 p-2 text-left hover:bg-white"
                >
                  <p className="truncate text-xs font-bold text-slate-800">
                    {ticket.subject}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Stage:{" "}
                    {latest?.label ||
                      ticket.reroute_sla?.stage ||
                      "รับเรื่องแล้ว"}
                  </p>
                  {ticket.provider_reliability_signal && (
                    <p className="mt-0.5 text-[10px] text-amber-700">
                      Reliability: {ticket.provider_reliability_signal.severity}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 shrink-0">
        <div className="rounded-xl border border-indigo-100 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-xs font-bold text-slate-800 flex items-center gap-1">
              <Sparkles size={14} className="text-indigo-500" /> Support AI
              Bridge
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleExportCareAnalytics}
                className="text-[11px] px-2 py-1 rounded-lg border border-cyan-200 text-cyan-800 hover:bg-cyan-50"
                disabled={careExporting}
              >
                {careExporting ? "Export…" : "Export CSV"}
              </button>
              <button
                type="button"
                onClick={fetchSupportBridge}
                className="text-[11px] px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50"
                disabled={supportBridgeLoading}
              >
                {supportBridgeLoading ? "Loading…" : "Refresh"}
              </button>
            </div>
          </div>
          {supportBridgeError ? (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2">
              {supportBridgeError}
            </p>
          ) : (
            <p className="text-[11px] text-slate-500">
              Qwen service แยกโดเมน: อ่านข้อมูลแบบ user-scoped เท่านั้น,
              ไม่เปิดเผยข้อมูลการเงินของ platform หรือข้อมูล user อื่น
            </p>
          )}
          {selectedUserBridgeSummaries.length > 0 && (
            <div className="mt-2 space-y-1">
              {selectedUserBridgeSummaries.map((s) => (
                <p
                  key={s.id}
                  className="text-[11px] text-slate-700 bg-slate-50 rounded-lg p-2 line-clamp-2"
                >
                  Risk {s.risk_score}:{" "}
                  {s.summary_compact || "ยังไม่มี compact summary"}
                </p>
              ))}
            </div>
          )}
          {supportCareSummary && (
            <div className="mt-2 rounded-lg border border-cyan-100 bg-cyan-50/60 p-2">
              <p className="text-[11px] font-bold text-cyan-800">
                FCM Delivery Audit (24h)
              </p>
              <p className="text-[11px] text-cyan-900">
                sent {supportCareSummary.pushes} · opened{" "}
                {supportCareSummary.opened} ({supportCareSummary.open_rate_pct}
                %) · accepted {supportCareSummary.accepted} (
                {supportCareSummary.accept_rate_pct}%)
              </p>
              {supportCareRecentEvents[0] && (
                <p className="mt-1 text-[10px] text-cyan-800">
                  ล่าสุด:{" "}
                  {supportCareRecentEvents[0].provider_name || "provider"} ·{" "}
                  {supportCareRecentEvents[0].opened_at
                    ? "opened"
                    : "not opened"}
                  {supportCareRecentEvents[0].accepted_at ? " · accepted" : ""}
                </p>
              )}
            </div>
          )}
          {(supportCareTrend7 || supportCareTrend30) && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-2">
                <p className="text-[10px] font-bold text-indigo-800">
                  Trend 7d
                </p>
                <p className="text-[11px] text-indigo-900">
                  open {supportCareTrend7?.open_rate_pct ?? 0}% · accept{" "}
                  {supportCareTrend7?.accept_rate_pct ?? 0}%
                </p>
                <p className="text-[10px] text-indigo-700">
                  pushes {supportCareTrend7?.pushes ?? 0}
                </p>
              </div>
              <div className="rounded-lg border border-violet-100 bg-violet-50/60 p-2">
                <p className="text-[10px] font-bold text-violet-800">
                  Trend 30d
                </p>
                <p className="text-[11px] text-violet-900">
                  open {supportCareTrend30?.open_rate_pct ?? 0}% · accept{" "}
                  {supportCareTrend30?.accept_rate_pct ?? 0}%
                </p>
                <p className="text-[10px] text-violet-700">
                  pushes {supportCareTrend30?.pushes ?? 0}
                </p>
              </div>
            </div>
          )}
          {supportCareFastestProviders.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="text-[11px] font-bold text-violet-800">
                Fastest Provider Accept
              </p>
              {supportCareFastestProviders.slice(0, 3).map((p) => (
                <p
                  key={p.provider_id}
                  className="text-[10px] rounded-lg border border-violet-100 bg-violet-50 p-1.5 text-violet-900"
                >
                  {p.provider_name || p.provider_id} · avg{" "}
                  {formatMsBrief(p.avg_accept_ms)} · best{" "}
                  {formatMsBrief(p.best_accept_ms)}
                </p>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-emerald-100 bg-white p-3 shadow-sm">
          <p className="text-xs font-bold text-slate-800 mb-2">
            Feature Requests จาก AI
          </p>
          <div className="space-y-2 max-h-28 overflow-auto">
            {supportFeatureRequests.slice(0, 3).map((item) => (
              <div
                key={item.id}
                className="text-[11px] rounded-lg border border-slate-100 p-2"
              >
                <p className="font-semibold text-slate-700 line-clamp-2">
                  {item.summary}
                </p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-slate-400">
                    {item.category} · {item.user_id}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleAcknowledgeFeature(item.id)}
                    className="text-emerald-700 font-semibold hover:underline"
                  >
                    Ack
                  </button>
                </div>
              </div>
            ))}
            {supportFeatureRequests.length === 0 && (
              <p className="text-[11px] text-slate-400">ยังไม่มีรายการเปิด</p>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-rose-100 bg-white p-3 shadow-sm">
          <p className="text-xs font-bold text-slate-800 mb-2">
            Security Incidents
          </p>
          <div className="space-y-2 max-h-28 overflow-auto">
            {supportIncidents.slice(0, 3).map((item) => (
              <div
                key={item.id}
                className="text-[11px] rounded-lg border border-rose-100 bg-rose-50/40 p-2"
              >
                <p className="font-semibold text-rose-800">
                  {item.severity} · {item.action_taken || "logged"}
                </p>
                <p className="text-rose-700 line-clamp-1">
                  {(item.signals || []).join(", ") || "no signals"}
                </p>
              </div>
            ))}
            {supportIncidents.length === 0 && (
              <p className="text-[11px] text-slate-400">ยังไม่มี incident</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-6 flex-1 min-h-0 flex-col lg:flex-row">
        {/* ========== ฝั่งซ้าย: Visual queue (ตาราง) ========== */}
        <div
          className={`flex flex-col bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden shrink-0 ${embeddedInDashboard ? "w-full xl:w-[min(100%,520px)] xl:max-h-[55vh]" : "w-full max-w-xl xl:max-w-[440px]"}`}
        >
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="font-bold text-slate-800 mb-1">Ticket queue</h3>
            <p className="text-[11px] text-slate-500 mb-2">
              เรียง: Priority → Sentiment (ลูกค้าไม่พอใจก่อน) → เวลารอ
            </p>
            {error && <p className="text-xs text-rose-600 mb-2">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStatusFilter("OPEN")}
                className={`flex-1 py-1 text-xs font-bold rounded ${statusFilter === "OPEN" ? "bg-indigo-600 text-white" : "bg-white border border-slate-200 text-slate-500"}`}
              >
                Open ({openCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("RESOLVED")}
                className={`flex-1 py-1 text-xs font-bold rounded ${statusFilter === "RESOLVED" ? "bg-indigo-600 text-white" : "bg-white border border-slate-200 text-slate-500"}`}
              >
                Resolved ({resolvedCount})
              </button>
            </div>
          </div>
          <div className="overflow-auto flex-1">
            {loading && tickets.length === 0 && (
              <div className="p-4 text-slate-500 text-sm">กำลังโหลด...</div>
            )}
            {!loading && tickets.length === 0 && (
              <div className="p-4 text-slate-500 text-sm">
                ไม่มีตั๋วในกลุ่มนี้
              </div>
            )}
            {tickets.length > 0 && (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 sticky top-0 z-[1] border-b border-slate-200">
                  <tr>
                    <th className="px-2 py-2 font-semibold text-slate-600 w-10">
                      #
                    </th>
                    <th className="px-2 py-2 font-semibold text-slate-600">
                      Pri
                    </th>
                    <th className="px-2 py-2 font-semibold text-slate-600">
                      Sentiment
                    </th>
                    <th className="px-2 py-2 font-semibold text-slate-600 min-w-[120px]">
                      หัวข้อ
                    </th>
                    <th className="px-2 py-2 font-semibold text-slate-600 hidden sm:table-cell">
                      User
                    </th>
                    <th className="px-2 py-2 font-semibold text-slate-600 hidden md:table-cell">
                      AI
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((ticket, index) => {
                    const queueNum =
                      statusFilter === "OPEN" ? index + 1 : index + 1;
                    const sent = effectiveSentiment(ticket);
                    const sentCls =
                      sent.label === "negative"
                        ? "bg-rose-100 text-rose-700"
                        : sent.label === "positive"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-600";
                    return (
                      <tr
                        key={ticket.id}
                        onClick={() => setSelectedTicketId(ticket.id)}
                        className={`cursor-pointer border-b border-slate-50 hover:bg-indigo-50/80 ${selectedTicketId === ticket.id ? "bg-indigo-50 ring-1 ring-inset ring-indigo-200" : ""}`}
                      >
                        <td className="px-2 py-2 font-mono text-indigo-600 font-bold">
                          {queueNum}
                        </td>
                        <td className="px-2 py-2">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded font-bold ${
                              ticket.priority === "URGENT"
                                ? "bg-rose-100 text-rose-600"
                                : ticket.priority === "HIGH"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {ticket.priority}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded font-medium ${sentCls}`}
                          >
                            {sent.label}{" "}
                            <span className="opacity-70">
                              ({sent.score.toFixed(2)})
                            </span>
                          </span>
                        </td>
                        <td className="px-2 py-2 max-w-[200px]">
                          <div
                            className="font-semibold text-slate-800 truncate flex items-center gap-1"
                            title={ticket.subject}
                          >
                            {ticket.isEmergency && (
                              <AlertTriangle
                                size={14}
                                className="text-red-600 shrink-0"
                                aria-label="ฉุกเฉิน"
                              />
                            )}
                            {ticket.subject}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {ticket.category}
                            {ticket.source ? ` · ${ticket.source}` : ""}
                          </div>
                        </td>
                        <td
                          className="px-2 py-2 text-slate-600 hidden sm:table-cell truncate max-w-[100px]"
                          title={ticket.userId}
                        >
                          {ticket.userId}
                        </td>
                        <td className="px-2 py-2 hidden md:table-cell">
                          {ticket.ai_mode_enabled ? (
                            <span className="text-emerald-600 font-bold">
                              ON
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ========== ฝั่งขวา: Chat Window (เนื้อหาแชท) ========== */}
        <div
          className={`flex-1 flex flex-col bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden min-h-0 ${embeddedInDashboard ? "min-h-[320px] xl:max-h-[70vh]" : ""}`}
        >
          <div className="p-4 border-b border-slate-100 flex justify-between items-start bg-slate-50/30 flex-wrap gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 flex-wrap">
                {selectedTicket?.subject ?? "เลือกตั๋ว"}
                {selectedTicket && (
                  <span className="px-2 py-0.5 rounded-full bg-slate-200 text-xs font-normal text-slate-600">
                    {selectedTicket.id}
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                <Clock size={12} /> SLA:{" "}
                {selectedTicket?.slaDueAt
                  ? `ครบกำหนดตอบ ${new Date(selectedTicket.slaDueAt).toLocaleString("th-TH")}`
                  : "—"}
                {selectedTicket?.firstAdminReplyAt && (
                  <span className="text-emerald-700">
                    {" "}
                    · ตอบแรก:{" "}
                    {new Date(selectedTicket.firstAdminReplyAt).toLocaleString(
                      "th-TH",
                    )}
                  </span>
                )}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                อัปเดตทันทีผ่าน Socket.IO + polling สำรอง ~12 วินาที
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                PII safety: เลขบัตร / เบอร์ / อีเมล ถูก mask ก่อนส่งเข้า AI
                ที่เซิร์ฟเวอร์
              </p>
              {selectedTicket?.isEmergency && (
                <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs font-bold">
                  <AlertTriangle size={14} /> ฉุกเฉิน / ความปลอดภัย
                  {selectedTicket.emergencyKind
                    ? ` · ${selectedTicket.emergencyKind}`
                    : ""}
                </div>
              )}
              {selectedTicket?.invited_provider_id && (
                <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold">
                  <Briefcase size={14} /> Three-way:{" "}
                  {selectedTicket.invited_provider_name || "Verified Pro"}{" "}
                  ในแชทแล้ว
                </div>
              )}
              {selectedTicket &&
                (selectedTicket.care_timeline || []).length > 0 && (
                  <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-bold text-emerald-900">
                        Care Timeline ·{" "}
                        {selectedTicket.reroute_sla?.stage || "running"}
                      </p>
                      <span className="text-[10px] font-semibold text-emerald-700">
                        {selectedTicket.reroute_sla?.status || "active"}
                      </span>
                    </div>
                    <button
                      onClick={handleRunCareReroute}
                      disabled={reroutingCare || !selectedTicket.jobId}
                      className="mt-2 inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-bold text-emerald-800 disabled:opacity-50"
                      title={
                        selectedTicket.jobId
                          ? `Run real reroute for job ${selectedTicket.jobId}`
                          : "เคสนี้ยังไม่มี jobId ต้องเปิด support จากหน้ารายละเอียดงาน"
                      }
                    >
                      <Rocket size={13} />
                      {reroutingCare
                        ? "กำลังตรวจงานจริง..."
                        : "Run real reroute now"}
                    </button>
                    {selectedTicket.reroute_sla?.accept_deadline_at && (
                      <p className="mt-1 text-[10px] font-medium text-emerald-800">
                        Provider accept window ถึง{" "}
                        {new Date(
                          selectedTicket.reroute_sla.accept_deadline_at,
                        ).toLocaleTimeString("th-TH")}
                        {selectedTicket.reroute_sla.invited_count != null
                          ? ` · ส่งคำเชิญ ${selectedTicket.reroute_sla.invited_count} คน`
                          : ""}
                      </p>
                    )}
                    {(selectedTicket.replacement_candidates || []).length >
                      0 && (
                      <div className="mt-2 rounded-lg border border-emerald-100 bg-white/80 p-2">
                        <p className="text-[11px] font-bold text-slate-800">
                          Candidate แนะนำ
                        </p>
                        {(selectedTicket.replacement_candidates || [])
                          .slice(0, 3)
                          .map((candidate) => (
                            <div
                              key={candidate.id}
                              className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px]"
                            >
                              <span className="text-slate-700">
                                {candidate.full_name || candidate.id} · Grade{" "}
                                {candidate.worker_grade || "C"}
                                {candidate.avg_rating != null
                                  ? ` · ${Number(candidate.avg_rating).toFixed(1)}★`
                                  : ""}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  void handleCareAction(
                                    "confirm_replacement",
                                    candidate.id,
                                  )
                                }
                                disabled={
                                  !!careActionLoading ||
                                  selectedTicket.reroute_sla?.status ===
                                    "confirmed"
                                }
                                className="rounded-md bg-emerald-600 px-2 py-1 font-bold text-white disabled:opacity-50"
                              >
                                ยืนยันคนแทน
                              </button>
                            </div>
                          ))}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {[
                        ["refund", "คืนเงิน"],
                        ["coupon", "ให้คูปอง"],
                        ["insurance", "ใช้ประกัน"],
                        ["review_provider", "รีวิว provider"],
                      ].map(([action, label]) => (
                        <button
                          key={action}
                          type="button"
                          onClick={() =>
                            void handleCareAction(
                              action as
                                | "refund"
                                | "coupon"
                                | "insurance"
                                | "review_provider",
                            )
                          }
                          disabled={!!careActionLoading}
                          className="rounded-lg border border-white bg-white px-2 py-1 text-[10px] font-bold text-slate-700 shadow-sm disabled:opacity-50"
                        >
                          {careActionLoading === action ? "..." : label}
                        </button>
                      ))}
                    </div>
                    {selectedTicket.last_care_outcome && (
                      <p className="mt-2 rounded-lg bg-white/70 px-2 py-1 text-[10px] font-semibold text-indigo-700">
                        Outcome ล่าสุด: {selectedTicket.last_care_outcome.label}
                      </p>
                    )}
                    <div className="mt-2 grid gap-1">
                      {(selectedTicket.care_timeline || [])
                        .slice(-5)
                        .map((event) => (
                          <div
                            key={event.id}
                            className="flex gap-2 text-[11px] text-emerald-900"
                          >
                            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                            <span>
                              <strong>{event.label}</strong>
                              {event.candidate_count != null
                                ? ` · พบ ${event.candidate_count} คน`
                                : ""}
                              {event.detail ? ` · ${event.detail}` : ""}
                            </span>
                          </div>
                        ))}
                    </div>
                    {(selectedTicket.situation_cards || []).length > 0 && (
                      <div className="mt-2 grid gap-1 sm:grid-cols-2">
                        {(selectedTicket.situation_cards || [])
                          .slice(0, 4)
                          .map((card) => (
                            <div
                              key={card.id}
                              className="rounded-lg border border-white bg-white/80 p-2"
                            >
                              <p className="text-[11px] font-bold text-slate-800">
                                {card.recommended ? "แนะนำ: " : ""}
                                {card.title}
                              </p>
                              <p className="text-[10px] text-slate-500">
                                {card.description}
                              </p>
                            </div>
                          ))}
                      </div>
                    )}
                    {selectedTicket.provider_reliability_signal && (
                      <p className="mt-2 text-[10px] text-amber-700">
                        Provider Reliability Shield:{" "}
                        {selectedTicket.provider_reliability_signal.severity} ·{" "}
                        {
                          selectedTicket.provider_reliability_signal
                            .ranking_effect
                        }
                      </p>
                    )}
                  </div>
                )}
              {selectedTicket && (
                <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-600">
                  <span>
                    {(selectedUserDetail?.full_name ||
                      selectedTicket?.full_name ||
                      selectedTicket?.userId) ??
                      "—"}
                  </span>
                  {(selectedUserDetail?.email || selectedTicket?.email) && (
                    <span className="flex items-center gap-1">
                      <Mail size={12} />{" "}
                      {selectedUserDetail?.email || selectedTicket?.email}
                    </span>
                  )}
                  {(selectedUserDetail?.phone || selectedTicket?.phone) && (
                    <span className="flex items-center gap-1">
                      <Phone size={12} />{" "}
                      {selectedUserDetail?.phone || selectedTicket?.phone}
                    </span>
                  )}
                </div>
              )}
              {selectedTicket && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => void handleAssignMe()}
                    className="px-2 py-1 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50"
                    disabled={!selectedTicketId}
                  >
                    รับเคสนี้
                  </button>
                  <label className="flex items-center gap-1 text-slate-600">
                    ป้ายรอ
                    <select
                      className="border border-slate-200 rounded px-1 py-0.5 text-xs bg-white"
                      value={selectedTicket.waitingOn || "none"}
                      onChange={(e) =>
                        void handleWaitingOnChange(e.target.value)
                      }
                    >
                      <option value="none">ดำเนินการ</option>
                      <option value="customer">รอลูกค้า</option>
                      <option value="internal">รอภายใน</option>
                    </select>
                  </label>
                  {selectedTicket.assignedToName && (
                    <span className="text-slate-500">
                      ผู้รับผิดชอบ: {selectedTicket.assignedToName}
                    </span>
                  )}
                  {onOpenUserInAdmin &&
                    selectedTicket.userId &&
                    selectedTicket.userId !== "anonymous" && (
                      <button
                        type="button"
                        onClick={() => onOpenUserInAdmin(selectedTicket.userId)}
                        className="inline-flex items-center gap-1 text-indigo-600 font-semibold hover:underline"
                      >
                        <ExternalLink size={12} /> User Management
                      </button>
                    )}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleAiSuggest}
                disabled={!selectedTicketId || aiLoading}
                title={
                  !aiMode
                    ? "Draft from chat + job context — review then Send"
                    : "Generate reply from Minnie / KB"
                }
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold disabled:opacity-50 ${
                  !aiMode
                    ? "bg-amber-50 border-amber-200 text-amber-800"
                    : "bg-purple-50 border-purple-100 text-purple-700"
                }`}
              >
                <Zap size={16} />
                {aiLoading ? "Generating…" : "AI Suggest Response"}
              </button>
              <button
                type="button"
                onClick={() => setMessageInput(CANNED_REPLY_429)}
                disabled={!selectedTicketId}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 rounded-lg border border-amber-200 text-amber-800 text-xs font-bold disabled:opacity-50 hover:bg-amber-100"
                title="ใช้คำตอบแนะนำสำหรับปัญหา 429 Rate Limit"
              >
                <AlertTriangle size={14} /> คำตอบ 429
              </button>
              <button
                type="button"
                onClick={() => setMessageInput(CANNED_REPLY_403)}
                disabled={!selectedTicketId}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 rounded-lg border border-rose-200 text-rose-800 text-xs font-bold disabled:opacity-50 hover:bg-rose-100"
                title="ใช้คำตอบแนะนำสำหรับปัญหา 403 Forbidden"
              >
                <Shield size={14} /> คำตอบ 403
              </button>
              <button
                type="button"
                onClick={() => setKbOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 text-slate-700 text-xs font-bold"
                title="ดูคลังความรู้ที่ Admin เทรนไว้"
              >
                <BookOpen size={14} /> ดูคลังความรู้ AI
              </button>
              <button
                type="button"
                onClick={handleInviteProvider}
                disabled={
                  !selectedTicketId ||
                  !selectedTicket?.jobId ||
                  invitingPro ||
                  !!selectedTicket?.invited_provider_id
                }
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-200 text-amber-900 text-xs font-bold disabled:opacity-50"
                title={
                  selectedTicket?.jobId
                    ? "เชิญผู้ให้บริการที่รับงานนี้เข้าแชท (ข้อพิพาท)"
                    : "ต้องมีงานผูกกับตั๋ว (เช่น Dispute)"
                }
              >
                <UserPlus size={14} />{" "}
                {invitingPro ? "กำลังเชิญ…" : "เชิญ Verified Pro"}
              </button>
              <button
                type="button"
                onClick={handleGenerateFaqDraft}
                disabled={!selectedTicketId || faqDraftLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 hover:bg-violet-100 rounded-lg border border-violet-200 text-violet-900 text-xs font-bold disabled:opacity-50"
                title="Minnie สรุปบทสนทนาเป็น FAQ → knowledge_base_drafts"
              >
                <Sparkles size={14} />{" "}
                {faqDraftLoading ? "กำลังสร้าง…" : "Generate FAQ Draft"}
              </button>
              <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer select-none max-w-[140px]">
                <input
                  type="checkbox"
                  checked={draftFaqOnResolve}
                  onChange={(e) => setDraftFaqOnResolve(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600"
                />
                Draft as FAQ ตอนปิดตั๋ว
              </label>
              <button
                type="button"
                onClick={handleMarkResolved}
                disabled={!selectedTicketId || faqDraftLoading}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-1 transition-colors disabled:opacity-50"
              >
                <CheckCircle size={14} /> Mark Resolved
              </button>
            </div>
          </div>

          {selectedTicketId && (
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80 space-y-2">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                AI Summary (รูป / สื่อ)
              </p>
              {selectedTicket?.ai_summary ? (
                <p className="text-xs text-slate-800 whitespace-pre-wrap border border-slate-200 rounded-lg p-2 bg-white">
                  {selectedTicket.ai_summary}
                </p>
              ) : (
                <p className="text-[11px] text-slate-400">
                  ยังไม่มี — แนบ URL รูปด้านล่าง (Vision) หรือสร้าง FAQ draft
                  หลังแก้เคส
                </p>
              )}
              <div className="flex flex-wrap gap-2 items-end">
                <input
                  type="url"
                  value={mediaUrlInput}
                  onChange={(e) => setMediaUrlInput(e.target.value)}
                  placeholder="https://… รูป (jpg/png/webp) สาธารณะ"
                  className="flex-1 min-w-[200px] px-2 py-1.5 text-xs border border-slate-200 rounded-lg"
                />
                <button
                  type="button"
                  onClick={handleAddMediaUrl}
                  disabled={!mediaUrlInput.trim() || mediaSaving}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold rounded-lg disabled:opacity-50"
                >
                  {mediaSaving ? "กำลังแนบ…" : "แนบ & สรุปภาพ"}
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/50">
            {!selectedTicketId && (
              <div className="text-center text-slate-500 py-12">
                เลือกตั๋วจากรายการด้านซ้าย
              </div>
            )}
            {selectedTicketId && messages.length === 0 && !loading && (
              <div className="text-center text-slate-500 py-12">
                ยังไม่มีข้อความ
              </div>
            )}
            {messages.map((msg, idx) => {
              const prevUserMsg = [...messages]
                .slice(0, idx)
                .reverse()
                .find((m) => m.sender === "USER");
              const questionForFaq =
                msg.sender === "ADMIN" ||
                msg.sender === "BOT" ||
                msg.sender === "PROVIDER"
                  ? (
                      prevUserMsg?.message ||
                      selectedTicket?.subject ||
                      ""
                    ).trim() || undefined
                  : undefined;
              return (
                <MessageBubble
                  key={msg.id}
                  sender={msg.sender}
                  message={msg.message}
                  timestamp={msg.timestamp}
                  questionForFaq={questionForFaq}
                  ticketId={selectedTicketId ?? undefined}
                  saved={savedMessageIds.has(msg.id)}
                  source={msg.source}
                  faqScore={msg.faqScore}
                  canSaveAsBestAnswer={canManageKnowledge}
                  onSaveAsBestAnswer={async (q, a, tid) => {
                    if (!canManageKnowledge) {
                      setError(
                        "ต้องเป็น Super Admin หรือผู้ที่ได้รับสิทธิ์ support_knowledge:approve เพื่อบันทึกคลังความรู้",
                      );
                      return;
                    }
                    try {
                      await saveSupportBestAnswer({
                        question: q,
                        best_answer: a,
                        ticket_id: tid,
                      });
                      setSavedMessageIds((prev) => new Set(prev).add(msg.id));
                      setToastMessage("Knowledge Saved");
                      setToastVisible(true);
                      fetchKb();
                    } catch (err) {
                      setError(
                        (err as Error)?.message ||
                          "บันทึกลงคลังความรู้ไม่สำเร็จ",
                      );
                    }
                  }}
                />
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <form
            onSubmit={handleSendMessage}
            className="p-4 bg-white border-t border-slate-100 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <AiModeToggle
                enabled={aiMode}
                onChange={async (enabled) => {
                  if (!selectedTicketId) return;
                  setAiMode(enabled);
                  try {
                    await setSupportTicketAiMode(selectedTicketId, enabled);
                    setAllTickets((prev) =>
                      prev.map((t) =>
                        t.id === selectedTicketId
                          ? { ...t, ai_mode_enabled: enabled }
                          : t,
                      ),
                    );
                  } catch {
                    setAiMode(!enabled);
                  }
                }}
                disabled={!selectedTicketId}
              />
              {!aiMode && selectedTicketId && (
                <span className="text-xs text-slate-500">
                  Manual: กด <strong>AI Suggest Response</strong>{" "}
                  แล้วตรวจทานก่อน Send — ระบบบันทึกความต่างลง{" "}
                  <strong>learning_feedback</strong> อัตโนมัติ
                </span>
              )}
            </div>
            {!aiMode && selectedTicket?.invited_provider_id && (
              <label className="flex items-center gap-2 text-xs text-amber-900 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={sendAsProvider}
                  onChange={(e) => setSendAsProvider(e.target.checked)}
                  className="rounded border-amber-400 text-amber-700 focus:ring-amber-500"
                />
                ส่งในชื่อ Verified Pro (three-way chat)
              </label>
            )}
            <textarea
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              placeholder={
                !aiMode
                  ? "Type a reply, or use AI Suggest Response (Help Center + context)"
                  : "พิมพ์คำตอบ..."
              }
              rows={3}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50 focus:bg-white transition-all resize-y min-h-[60px]"
            />
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={!messageInput.trim() || sending || !selectedTicketId}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send size={18} /> Send
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ========== Knowledge Base Modal ========== */}
      {kbOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setKbOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <BookOpen size={20} /> คลังความรู้ AI
              </h3>
              <button
                type="button"
                onClick={() => setKbOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div
                className={`mb-4 rounded-lg border p-3 text-xs ${canManageKnowledge ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}
              >
                {canManageKnowledge
                  ? "คุณมีสิทธิ์อนุมัติ FAQ Draft เข้า Knowledge Base ได้ ระบบจะนำคำตอบที่อนุมัติแล้วไปตอบอัตโนมัติเมื่อ match ชัดเจน"
                  : "โหมดดูอย่างเดียว: การ promote/delete/save Knowledge Base จำกัดให้ Super Admin หรือผู้ที่ได้รับสิทธิ์ support_knowledge:approve เท่านั้น"}
              </div>
              {kbLoading && (
                <p className="text-slate-500 text-sm">กำลังโหลด...</p>
              )}
              {!kbLoading && kbItems.length === 0 && kbDrafts.length === 0 && (
                <p className="text-slate-500 text-sm">
                  ยังไม่มีข้อมูลในคลังความรู้ กดปุ่มดาว ⭐ที่ข้อความ Admin
                  หรือใช้ Generate FAQ Draft หลังแก้เคส
                </p>
              )}
              {!kbLoading && kbDrafts.length > 0 && (
                <div className="mb-6">
                  <h4 className="font-bold text-sm text-violet-800 mb-2 flex items-center gap-1">
                    <Sparkles size={16} /> FAQ Drafts (knowledge_base_drafts)
                  </h4>
                  <div className="space-y-3">
                    {kbDrafts.map((d) => (
                      <div
                        key={d.id}
                        className="p-3 rounded-lg border border-violet-200 bg-violet-50/50"
                      >
                        <p className="text-xs text-violet-700 mb-0.5">คำถาม</p>
                        <p className="text-sm text-slate-800">{d.question}</p>
                        <p className="text-xs text-violet-700 mt-2 mb-0.5">
                          คำตอบ (draft)
                        </p>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">
                          {d.draft_answer}
                        </p>
                        <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                          <p className="text-[10px] text-slate-400 mb-0">
                            {d.category} •{" "}
                            {d.created_at
                              ? new Date(d.created_at).toLocaleString("th-TH")
                              : ""}
                          </p>
                          <button
                            type="button"
                            disabled={
                              promotingDraftId === d.id || !canManageKnowledge
                            }
                            onClick={async () => {
                              setError(null);
                              setPromotingDraftId(d.id);
                              try {
                                await promoteKnowledgeDraft(d.id);
                                setToastMessage(
                                  "One-Click Promote: เข้าคลังจริง (faq_knowledge) แล้ว",
                                );
                                setToastVisible(true);
                                await fetchKb();
                              } catch (e: unknown) {
                                setError(
                                  (e as Error)?.message ||
                                    "โปรโมท draft ไม่สำเร็จ",
                                );
                              } finally {
                                setPromotingDraftId(null);
                              }
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            title={
                              canManageKnowledge
                                ? "บันทึก draft เข้า faq_knowledge ในคลิกเดียว"
                                : "ต้องเป็น Super Admin หรือผู้ที่ได้รับสิทธิ์ support_knowledge:approve"
                            }
                          >
                            <Rocket size={14} />
                            {promotingDraftId === d.id
                              ? "กำลังโปรโมท…"
                              : "One-Click Promote"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {!kbLoading && kbItems.length > 0 && (
                <div className="space-y-4">
                  {kbItems.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 rounded-lg border border-slate-200 bg-slate-50/50"
                    >
                      <p className="text-xs text-slate-500 mb-1">คำถาม</p>
                      <p className="text-sm text-slate-800 mb-1 truncate">
                        {item.question}
                      </p>
                      <p className="text-xs text-slate-500 mb-1">คำตอบ</p>
                      <p className="text-sm text-slate-800 whitespace-pre-wrap">
                        {item.best_answer}
                      </p>
                      <div className="flex justify-between items-center mt-2">
                        <span className="text-[10px] text-slate-400">
                          {item.category} •{" "}
                          {item.created_at
                            ? new Date(item.created_at).toLocaleDateString(
                                "th-TH",
                              )
                            : ""}
                        </span>
                        <button
                          type="button"
                          disabled={!canManageKnowledge}
                          onClick={async () => {
                            if (!canManageKnowledge) return;
                            if (!confirm("ลบรายการนี้จากคลังความรู้?")) return;
                            await deleteFaqKnowledge(item.id);
                            fetchKb();
                          }}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                          title={
                            canManageKnowledge
                              ? "ลบ"
                              : "ต้องเป็น Super Admin หรือผู้ที่ได้รับสิทธิ์ support_knowledge:approve"
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Toast
        message={toastMessage}
        visible={toastVisible}
        onHide={() => setToastVisible(false)}
      />
    </div>
  );
};
