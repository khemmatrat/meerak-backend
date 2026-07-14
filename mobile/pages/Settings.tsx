import React, { useState, useEffect, useRef, useMemo } from "react";
import { App } from "@capacitor/app";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useNotification } from "../context/NotificationContext";
import { useMobileAppConfig } from "../context/MobileAppConfigContext";
import { api } from "../services/api";
import { MockApi } from "../services/mockApi";
import { subscribeSupportTicketRoom } from "../services/supportSocket";
import {
  createUserSupportTicket,
  getUserSupportMessages,
  postSupportAiFeedback,
  postSupportAiBridgeReply,
  postUserSupportMessage,
  selfUnlockRateLimit,
  startSupportCareReroute,
  type SupportCareTimelineEvent,
  type SupportQuickAction,
  type SupportRerouteSla,
  type SupportSituationCard,
} from "../services/supportTicketApi";
import { sendSupportAiMessage } from "../services/supportAiApi";
import {
  fetchBrandAdviserRules,
  type BrandAdviserRules,
} from "../services/brandAdviserRulesService";
import {
  verifyDocumentWithOCR,
  fileToBase64,
  type DocumentType,
} from "../services/documentVerifyService";
import {
  createCardToken,
  formatCardNumber,
  formatExpiry,
  ensureCardTokenSdkReady,
  parseExpiry,
} from "../services/cardTokenization";
import {
  uploadDocumentToSecure,
  fileToBlobUrl,
  revokeBlobUrl,
  isBlobUrl,
} from "../services/secureDocumentUploadService";
import {
  canEditKycDocuments,
  isKycDocLocked,
  isKycDocVerified,
  kycSettingsRowBadge,
  type KycDocumentVerification,
} from "../utils/kycDocumentGate";
import {
  companyLegal,
  getCompanyLineOpenUrl,
  getLineContactListSubtitle,
  hasLineContactInApp,
} from "../config/companyLegal";
import {
  User,
  Bell,
  Lock,
  HelpCircle,
  Globe,
  LogOut,
  ChevronRight,
  Trash2,
  Shield,
  FileText,
  X,
  MessageSquare,
  Mail,
  Phone,
  Edit,
  ToggleLeft,
  ToggleRight,
  CreditCard,
  Plus,
  Building,
  Smartphone,
  Send,
  Bot,
  Info,
  Heart,
  Zap,
  MapPin,
  IdCard,
  Car,
  Camera,
  Upload,
  CheckCircle,
  Briefcase,
  Moon,
  Palette,
  Award,
  RotateCcw,
  Loader2,
  Sailboat,
  AlertCircle,
  Wifi,
  Download,
  AlertTriangle,
  ArrowLeft,
  Copy,
  ExternalLink,
  Maximize2,
  Minimize2,
  Share2,
  Crown,
  QrCode,
  BookOpen,
  Megaphone,
} from "lucide-react";
import { useFloatingFabPrefs } from "../hooks/useFloatingFabPrefs";
import { saveFloatingFabPrefs } from "../utils/floatingFabPrefs";
import { useTheme } from "../context/ThemeContext";
import { VIPBadge } from "../components/VIPBadge";
import {
  BrandAdviserBadge,
  BrandAdviserSuspendBanner,
  BrandAdviserProgramOffNotice,
  BrandAdviserReputationHint,
} from "../components/BrandAdviserBadge";
import { CoachConnectionSection } from "../components/CoachConnection";
import { BankAccount } from "../types";

function parseKycVehiclesJson(raw: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(raw)) return raw as Array<Record<string, unknown>>;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? (p as Array<Record<string, unknown>>) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** PDPA: แสดงเลขบัตรแบบปิดบางส่วน (รายการ Settings) */
function maskID(value: string | null | undefined): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "—";
  if (digits.length <= 4) return "••••";
  if (digits.length <= 9) return `${digits.slice(0, 2)}••••${digits.slice(-2)}`;
  return `${digits.slice(0, 3)}•••••${digits.slice(-4)}`;
}

/** PaySo PromptPay / เบอร์มือถือ — 10 หลัก เริ่ม 0 */
function normalizePromptPayAccount(raw: string): string | null {
  let s = String(raw || "").replace(/\D/g, "");
  if (s.startsWith("66") && s.length >= 11) s = `0${s.slice(2)}`;
  if (s.length === 9 && s.startsWith("9")) s = `0${s}`;
  if (s.length !== 10 || !s.startsWith("0")) return null;
  return s;
}

// Theme Card for Personalization
const ThemeCard = ({
  id,
  label,
  desc,
  locked,
  comingSoon,
  currentTheme,
  onSelect,
}: {
  id: "vip-silver" | "vip-gold" | "vip-platinum";
  label: string;
  desc: string;
  locked: boolean;
  comingSoon?: boolean;
  currentTheme: string;
  onSelect: (
    t: "standard" | "vip-silver" | "vip-gold" | "vip-platinum",
  ) => void;
}) => {
  const isDisabled = locked || comingSoon;
  return (
    <button
      type="button"
      onClick={() => !isDisabled && onSelect(id)}
      disabled={isDisabled}
      className={`p-4 rounded-xl border-2 text-left transition-all relative ${
        currentTheme === id && !isDisabled
          ? "border-emerald-500 bg-emerald-50"
          : isDisabled
            ? "border-gray-200 bg-gray-50 opacity-70 cursor-not-allowed"
            : "border-gray-200 hover:border-gray-300"
      }`}
    >
      {comingSoon && (
        <span className="absolute top-2 right-2 text-amber-600 text-[10px] font-bold uppercase">
          Coming Soon
        </span>
      )}
      {locked && !comingSoon && (
        <span
          className="absolute top-2 right-2 text-gray-400"
          title="สมัคร VIP เพื่อปลดล็อค"
        >
          <Lock size={14} />
        </span>
      )}
      <p className="font-bold text-gray-800 text-sm">{label}</p>
      <p className="text-xs text-gray-500 mt-0.5">
        {comingSoon ? "Coming Soon..." : desc}
      </p>
    </button>
  );
};

// Reusable Components within file
const Section = ({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
      <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide">
        {title}
      </h3>
    </div>
    <div className="divide-y divide-gray-50">{children}</div>
  </div>
);

const Item = ({
  icon: Icon,
  label,
  onClick,
  value,
  danger,
  toggle,
  onToggle,
}: any) => (
  <button
    onClick={onClick}
    className="w-full flex items-center justify-between px-4 py-4 hover:bg-gray-50 transition-colors text-left relative"
  >
    <div className="flex items-center">
      <Icon
        size={20}
        className={`mr-3 ${danger ? "text-red-500" : "text-gray-400"}`}
      />
      <span
        className={`text-sm font-medium ${danger ? "text-red-600" : "text-gray-700"}`}
      >
        {label}
      </span>
    </div>
    <div className="flex items-center">
      {toggle !== undefined ? (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onToggle && onToggle();
          }}
          className="cursor-pointer text-emerald-600"
        >
          {toggle ? (
            <ToggleRight size={32} fill="#10B981" className="text-white" />
          ) : (
            <ToggleLeft size={32} className="text-gray-300" />
          )}
        </div>
      ) : (
        <>
          {value && <span className="text-sm text-gray-400 mr-2">{value}</span>}
          <ChevronRight size={16} className="text-gray-300" />
        </>
      )}
    </div>
  </button>
);

const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  fullscreen = false,
  onBack,
  headerAction,
}: any) => {
  if (!isOpen) return null;
  return (
    <div
      className={`fixed inset-0 z-50 flex bg-black/50 backdrop-blur-sm animate-in fade-in ${
        fullscreen
          ? "items-stretch justify-stretch p-0"
          : "items-center justify-center p-4"
      }`}
    >
      <div
        className={`settings-modal-content flex w-full flex-col overflow-hidden bg-white shadow-xl animate-in zoom-in-95 ${
          fullscreen
            ? "h-[100dvh] max-h-[100dvh] rounded-none"
            : "max-h-[90vh] max-w-md rounded-2xl"
        }`}
      >
        <div className="px-4 sm:px-6 py-3 border-b border-gray-100 flex justify-between items-center bg-gray-50 flex-shrink-0">
          <div className="flex min-w-0 items-center gap-2">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="rounded-full p-1 text-gray-500 hover:bg-white hover:text-gray-800"
                aria-label="Back"
              >
                <ArrowLeft size={20} />
              </button>
            )}
            <h3 className="truncate font-bold text-gray-800">{title}</h3>
          </div>
          <div className="flex items-center gap-1">
            {headerAction}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 hover:bg-white"
            >
              <X size={20} className="text-gray-400 hover:text-gray-600" />
            </button>
          </div>
        </div>
        <div
          className={`${fullscreen ? "p-3 sm:p-6" : "p-6"} overflow-y-auto flex-1`}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

// --- Support Chat (รับค่าจริงจาก Backend + AI ตอบอัตโนมัติ) ---
const EMERGENCY_KIND_OPTIONS: { value: string; label: string }[] = [
  { value: "sexual_harassment", label: "คุกคามทางเพศ / Sexual harassment" },
  { value: "physical_assault", label: "ทำร้ายร่างกาย / Physical assault" },
  { value: "life_threatening", label: "อันตรายถึงชีวิต / Life-threatening" },
  {
    value: "natural_disaster",
    label: "ภัยธรรมชาติรุนแรง / Severe natural disaster",
  },
  { value: "other_safety", label: "ความปลอดภัยอื่น (ระบุด้านล่าง)" },
];

type SupportChatMessage = {
  id?: string;
  text: string;
  isBot: boolean;
  quickActions?: SupportQuickAction[];
  diagnosticSummary?: string | null;
  aiActions?: string[];
  source?: string;
  careTimeline?: SupportCareTimelineEvent[];
  situationCards?: SupportSituationCard[];
  rerouteSla?: SupportRerouteSla | null;
};

const renderCareTimeline = (m: SupportChatMessage) => {
  const timeline = m.careTimeline || [];
  const cards = m.situationCards || [];
  if (timeline.length === 0 && cards.length === 0) return null;
  return (
    <div className="mt-2 space-y-2 rounded-xl border border-emerald-100 bg-emerald-50/60 p-2 text-left">
      {m.rerouteSla?.accept_deadline_at && (
        <p className="rounded-lg bg-white/80 px-2 py-1 text-[10px] font-semibold text-emerald-800">
          ส่งคำเชิญแล้ว {m.rerouteSla.invited_count ?? 0} คน · รอตอบรับถึง{" "}
          {new Date(m.rerouteSla.accept_deadline_at).toLocaleTimeString(
            "th-TH",
          )}
        </p>
      )}
      {timeline.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-bold text-emerald-800">
            Care Timeline
          </p>
          <div className="space-y-1">
            {timeline.slice(-5).map((event, idx) => (
              <div
                key={event.id || `${event.stage}-${idx}`}
                className="flex gap-2 text-[11px] text-emerald-900"
              >
                <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
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
        </div>
      )}
      {cards.length > 0 && (
        <div className="grid gap-1">
          {cards.slice(0, 4).map((card) => (
            <div
              key={card.id}
              className="rounded-lg border border-white/70 bg-white px-2 py-1.5"
            >
              <p className="text-[11px] font-bold text-slate-800">
                {card.recommended ? "แนะนำ: " : ""}
                {card.title}
              </p>
              <p className="text-[10px] text-slate-500">{card.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const SupportChat = ({
  user: supportUser,
  initialDraft,
  authToken,
  fullscreen = false,
}: {
  user?: { name?: string; phone?: string; email?: string } | null;
  initialDraft?: string;
  authToken?: string | null;
  fullscreen?: boolean;
}) => {
  const userId =
    typeof window !== "undefined"
      ? localStorage.getItem("meerak_user_id")
      : null;
  const [messages, setMessages] = useState<SupportChatMessage[]>([
    {
      text: "สวัสดีครับ! นี่คือระบบช่วยเหลืออัตโนมัติ Meerak ต้องการสอบถามเรื่องอะไรครับ?",
      isBot: true,
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [aiSessionId, setAiSessionId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [useBackend, setUseBackend] = useState(true);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [emergencyKind, setEmergencyKind] = useState("life_threatening");
  const [emergencyDetail, setEmergencyDetail] = useState("");
  const [emergencySending, setEmergencySending] = useState(false);
  const [activeQuickTopic, setActiveQuickTopic] = useState<string | null>(
    "account",
  );
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialDraft && initialDraft.trim()) {
      setInput(initialDraft.trim());
    }
  }, [initialDraft]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    if (!userId || !useBackend) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/support/tickets", {
          params: { userId, limit: 10 },
        });
        const tickets = data?.tickets || [];
        const open = (tickets || []).find(
          (t: any) => t.status === "OPEN" || t.status === "IN_PROGRESS",
        );
        if (cancelled || !open) return;
        setTicketId(open.id);
        const msgs = await getUserSupportMessages(open.id);
        if (cancelled) return;
        setMessages(
          (msgs || []).map((m: any) => ({
            id: m.id,
            text: m.message,
            isBot: m.sender === "BOT" || m.sender === "ADMIN",
            quickActions: m.quick_actions || [],
            diagnosticSummary: m.diagnostic_summary || null,
            aiActions: m.ai_actions || [],
            source: m.source,
            careTimeline: m.care_timeline || [],
            situationCards: m.situation_cards || [],
            rerouteSla: m.reroute_sla || null,
          })),
        );
        setLoadError(null);
      } catch (e) {
        if (!cancelled) setLoadError(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, useBackend]);

  useEffect(() => {
    if (!ticketId || !useBackend || !authToken) return;
    return subscribeSupportTicketRoom(ticketId, authToken, async () => {
      try {
        const msgs = await getUserSupportMessages(ticketId);
        setMessages(
          (msgs || []).map((m: any) => ({
            id: m.id,
            text: m.message,
            isBot: m.sender === "BOT" || m.sender === "ADMIN",
            quickActions: m.quick_actions || [],
            diagnosticSummary: m.diagnostic_summary || null,
            aiActions: m.ai_actions || [],
            source: m.source,
            careTimeline: m.care_timeline || [],
            situationCards: m.situation_cards || [],
            rerouteSla: m.reroute_sla || null,
          })),
        );
      } catch {
        /* ignore */
      }
    });
  }, [ticketId, useBackend, authToken]);

  const reloadMessages = async (tid: string) => {
    const msgs = await getUserSupportMessages(tid);
    setMessages(
      (msgs || []).map((m: any) => ({
        id: m.id,
        text: m.message,
        isBot: m.sender === "BOT" || m.sender === "ADMIN",
        quickActions: m.quick_actions || [],
        diagnosticSummary: m.diagnostic_summary || null,
        aiActions: m.ai_actions || [],
        source: m.source,
        careTimeline: m.care_timeline || [],
        situationCards: m.situation_cards || [],
        rerouteSla: m.reroute_sla || null,
      })),
    );
  };

  const handleSend = async (text: string) => {
    if (!text.trim()) return;
    setMessages((prev) => [...prev, { text, isBot: false }]);
    setInput("");
    setIsTyping(true);
    setLoadError(null);

    try {
      if (useBackend) {
        if (!ticketId) {
          const { ticket } = await createUserSupportTicket({
            userId: userId || undefined,
            message: text,
            subject: text.slice(0, 80),
            category: "General",
            email: supportUser?.email,
            full_name: supportUser?.name,
            phone: supportUser?.phone,
          });
          setTicketId(ticket.id);
          const ai = await sendSupportAiMessage({
            message: text,
            session_id: aiSessionId,
            ticket_id: ticket.id,
            source: "settings",
          });
          setAiSessionId(ai.session_id);
          await postSupportAiBridgeReply(ticket.id, ai.message, {
            source: ai.source || "support_ai_bridge",
            score: ai.score ?? null,
            ai_actions: ai.actions || [],
            quick_actions: ai.quick_actions || [],
            diagnostic_summary: ai.diagnostic_summary || null,
            escalation: ai.escalation || null,
          });
          await reloadMessages(ticket.id);
        } else {
          await postUserSupportMessage(ticketId, text);
          const ai = await sendSupportAiMessage({
            message: text,
            session_id: aiSessionId,
            ticket_id: ticketId,
            source: "settings",
          });
          setAiSessionId(ai.session_id);
          await postSupportAiBridgeReply(ticketId, ai.message, {
            source: ai.source || "support_ai_bridge",
            score: ai.score ?? null,
            ai_actions: ai.actions || [],
            quick_actions: ai.quick_actions || [],
            diagnostic_summary: ai.diagnostic_summary || null,
            escalation: ai.escalation || null,
          });
          await reloadMessages(ticketId);
        }
      } else {
        const reply = await MockApi.getBotResponse(text);
        setMessages((prev) => [...prev, { text: reply, isBot: true }]);
      }
    } catch (e) {
      setLoadError("ไม่สามารถส่งได้ กรุณาลองใหม่หรือติดต่อ support@aqond.com");
      const reply = await MockApi.getBotResponse(text);
      setMessages((prev) => [...prev, { text: reply, isBot: true }]);
    } finally {
      setIsTyping(false);
    }
  };

  const submitEmergency = async () => {
    const detail = emergencyDetail.trim();
    if (!detail || !userId) return;
    setEmergencySending(true);
    setLoadError(null);
    try {
      const subject = `[ฉุกเฉิน] ${EMERGENCY_KIND_OPTIONS.find((k) => k.value === emergencyKind)?.label || emergencyKind}`;
      const message = `[EMERGENCY:${emergencyKind}] ${detail}`;
      const { ticket } = await createUserSupportTicket({
        userId: userId || undefined,
        subject: subject.slice(0, 80),
        message,
        category: "General",
        email: supportUser?.email,
        full_name: supportUser?.name,
        phone: supportUser?.phone,
        is_emergency: true,
        emergency_kind: emergencyKind,
      });
      setTicketId(ticket.id);
      setEmergencyOpen(false);
      setEmergencyDetail("");
      await reloadMessages(ticket.id);
      setMessages((prev) => [
        ...prev,
        {
          text: "แจ้งฉุกเฉินถูกส่งถึงทีมแล้ว — หากอยู่ในอันตรายทันที โปรดโทร 191 หรือ 1669",
          isBot: true,
        },
      ]);
    } catch {
      setLoadError(
        "ส่งแจ้งฉุกเฉินไม่สำเร็จ — โปรดโทร 191 / 1669 หากเป็นเหตุเร่งด่วน",
      );
    } finally {
      setEmergencySending(false);
    }
  };

  const renderMessageText = (text: string) => {
    const parts = String(text || "").split(/(https?:\/\/[^\s]+)/g);
    return parts.map((part, idx) =>
      /^https?:\/\//.test(part) ? (
        <a
          key={`${part}-${idx}`}
          href={part}
          className="font-semibold text-emerald-700 underline break-all"
        >
          {part}
        </a>
      ) : (
        <React.Fragment key={idx}>{part}</React.Fragment>
      ),
    );
  };

  const handleQuickAction = async (
    action: SupportQuickAction,
    message?: SupportChatMessage,
  ) => {
    if (action.type === "self_unlock_rate_limit") {
      try {
        const res = await selfUnlockRateLimit();
        const remaining = res.unlock?.self_unlocks_remaining_today;
        setMessages((prev) => [
          ...prev,
          {
            text:
              remaining != null
                ? `ปลดล็อก Rate Limit แล้ว เหลือสิทธิ์วันนี้ ${remaining} ครั้ง`
                : res.message || "ปลดล็อก Rate Limit แล้ว",
            isBot: true,
            source: "self_unlock_rate_limit",
          },
        ]);
      } catch (e: any) {
        setMessages((prev) => [
          ...prev,
          {
            text:
              e?.response?.data?.message ||
              e?.message ||
              "ปลดล็อก Rate Limit ไม่สำเร็จ",
            isBot: true,
            source: "self_unlock_rate_limit_failed",
          },
        ]);
      }
      return;
    }
    if (action.type === "feedback_not_helpful") {
      if (ticketId) {
        try {
          await postSupportAiFeedback(ticketId, {
            message_id: message?.id,
            helpful: false,
            reason: action.label,
          });
          await reloadMessages(ticketId);
          return;
        } catch {
          /* fall through to local message */
        }
      }
      setMessages((prev) => [
        ...prev,
        {
          text: "รับทราบค่ะ เราจะส่งต่อให้เจ้าหน้าที่ตรวจสอบต่อ",
          isBot: true,
          source: "ai_feedback_escalation",
        },
      ]);
      return;
    }
    if (action.type === "check_account_status") {
      await handleSend(
        "ช่วยตรวจสถานะบัญชี KYC และสิทธิ์การใช้งานของฉันให้หน่อย",
      );
      return;
    }
    if (action.type === "refresh_session") {
      setMessages((prev) => [
        ...prev,
        {
          text: "แนะนำให้ออกจากระบบแล้วเข้าสู่ระบบใหม่เพื่อรีเฟรชสิทธิ์ หากยังไม่หายกด 'ยังไม่หาย ส่งให้เจ้าหน้าที่' ได้เลยค่ะ",
          isBot: true,
          source: "refresh_session_guidance",
        },
      ]);
      return;
    }
    if (action.type === "open_job_detail") {
      setMessages((prev) => [
        ...prev,
        {
          text: "กรณีนี้ต้องเปิดจากหน้า “รายละเอียดงาน” ของงานนั้น หากคุณมีงานที่เกี่ยวข้อง ให้กลับไปที่งานแล้วกดติดต่อ support จากหน้านั้นเพื่อให้ระบบแนบ job context ให้ค่ะ",
          isBot: true,
          source: "open_job_detail_guidance",
        },
      ]);
      return;
    }
    if (action.type === "open_ticket") {
      if (action.id === "urgent_reroute" && ticketId) {
        try {
          const res = await startSupportCareReroute(ticketId);
          await reloadMessages(ticketId);
          setMessages((prev) => [
            ...prev,
            {
              text:
                res.candidate_count != null
                  ? `ระบบตรวจผู้รับงานว่างแล้ว พบ ${res.candidate_count} คน`
                  : "เริ่มจับคู่ใหม่ด่วนแล้ว",
              isBot: true,
              source: "care_reroute_engine",
            },
          ]);
        } catch {
          setMessages((prev) => [
            ...prev,
            {
              text: "เคสนี้ยังไม่มี jobId จึงยังจับคู่ใหม่จากระบบจริงไม่ได้ กรุณาเปิด support จากหน้า “รายละเอียดงาน” ของงานนั้นเพื่อให้ระบบส่งต่องานได้ตรงจุดค่ะ",
              isBot: true,
              source: "missing_job_context",
            },
          ]);
        }
        return;
      }
      await handleSend(
        action.id === "urgent_reroute"
          ? "ต้องการจับคู่ใหม่ด่วน งานนี้ใกล้ถึงเวลาเริ่มแล้ว"
          : "ต้องการให้เจ้าหน้าที่ช่วยดูเคสนี้แบบเร่งด่วน",
      );
      return;
    }
    if (action.url) {
      window.location.href = action.url;
    }
  };

  const handleFeedback = async (
    message: SupportChatMessage,
    helpful: boolean,
  ) => {
    if (!ticketId) return;
    try {
      await postSupportAiFeedback(ticketId, {
        message_id: message.id,
        helpful,
        reason: helpful ? "helpful" : "not_helpful",
      });
      if (helpful) {
        setMessages((prev) => [
          ...prev,
          {
            text: "ขอบคุณสำหรับ feedback ค่ะ",
            isBot: true,
            source: "feedback_thanks",
          },
        ]);
      } else {
        await reloadMessages(ticketId);
      }
    } catch {
      setLoadError("ส่ง feedback ไม่สำเร็จ กรุณาลองใหม่");
    }
  };

  const quickReplyGroups = [
    {
      id: "account",
      title: "บัญชี / เข้าสู่ระบบ",
      items: [
        "แจ้งปัญหา 403 Forbidden",
        "แจ้งปัญหา 429 Rate Limit",
        "เข้าแอปไม่ได้",
        "เซสชันหมดอายุ / ต้อง login ใหม่",
        "ลืมรหัสผ่านหรือ OTP ไม่มา",
        "บัญชีถูกล็อกหรือถูกจำกัดสิทธิ์",
      ],
    },
    {
      id: "jobs",
      title: "งาน / การจับคู่",
      items: [
        "งานหายไปไหน?",
        "ผู้รับงานยกเลิกกะทันหัน",
        "ต้องการจับคู่ใหม่ด่วน",
        "เปิด Care Timeline ให้เคสนี้",
        "provider ไม่มาตามเวลา",
        "ต้องการแจ้งปัญหาหน้างาน",
      ],
    },
    {
      id: "payment",
      title: "เงิน / ชำระเงิน / ถอนเงิน",
      items: [
        "เงินไม่เข้า",
        "ถอนเงินยังไง",
        "ชำระเงินแล้วแต่สถานะไม่เปลี่ยน",
        "ขอคืนเงิน / refund",
        "ยอดเงินใน wallet ไม่ตรง",
        "ค่าธรรมเนียมหรือภาษีไม่เข้าใจ",
      ],
    },
    {
      id: "kyc",
      title: "KYC / เอกสาร / ผู้ให้บริการ",
      items: [
        "KYC ไม่ผ่าน",
        "อัปโหลดเอกสารไม่ได้",
        "ต้องการแก้ข้อมูลบัตรประชาชน",
        "ทดสอบ provider ไม่ผ่าน",
        "สถานะ Verified Provider ไม่ขึ้น",
      ],
    },
    {
      id: "safety",
      title: "ความปลอดภัย / ประกัน / เคลม",
      items: [
        "ใช้สิทธิประกันงาน",
        "ต้องการเคลมประกัน",
        "แจ้งเหตุฉุกเฉินด้านความปลอดภัย",
        "ถูกคุกคามหรือรู้สึกไม่ปลอดภัย",
        "ต้องการส่งหลักฐานประกอบเคส",
      ],
    },
  ];

  return (
    <div
      className={`relative flex flex-col ${
        fullscreen ? "h-[calc(100dvh-96px)] min-h-[560px]" : "h-[400px]"
      }`}
    >
      {emergencyOpen && (
        <div className="absolute inset-0 z-30 flex flex-col rounded-lg bg-white p-3 shadow-lg ring-1 ring-red-200">
          <div className="flex items-start gap-2 mb-2">
            <AlertTriangle
              className="h-5 w-5 shrink-0 text-red-600"
              aria-hidden
            />
            <div className="text-xs text-gray-800 space-y-1">
              <p className="font-semibold text-red-800">
                แจ้งเหตุความปลอดภัย / ฉุกเฉิน
              </p>
              <p>
                ใช้เมื่อตกอยู่ในอันตรายจริง (เช่น ถูกคุกคาม ถูกทำร้าย
                อันตรายถึงชีวิต หรือภัยธรรมชาติรุนแรง)
              </p>
              <p className="text-red-700 font-medium">
                AQOND ไม่ใช่เลขฉุกเฉิน — หากต้องการความช่วยเหลือทันที โทร 191
                (ตำรวจ) หรือ 1669 (แพทย์ฉุกเฉิน)
              </p>
            </div>
          </div>
          <label className="block text-[11px] font-medium text-gray-600 mb-1">
            ประเภทเหตุ
          </label>
          <select
            className="mb-2 w-full rounded border border-gray-300 text-sm py-1.5 px-2"
            value={emergencyKind}
            onChange={(e) => setEmergencyKind(e.target.value)}
          >
            {EMERGENCY_KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <textarea
            className="mb-2 w-full flex-1 min-h-[72px] rounded border border-gray-300 text-sm p-2"
            placeholder="อธิบายสถานการณ์ สถานที่ และสิ่งที่เกิดขึ้น (บังคับ)"
            value={emergencyDetail}
            onChange={(e) => setEmergencyDetail(e.target.value)}
          />
          <div className="flex gap-2 mt-auto">
            <button
              type="button"
              className="flex-1 rounded-lg border border-gray-300 py-2 text-sm"
              onClick={() => {
                setEmergencyOpen(false);
                setEmergencyDetail("");
              }}
              disabled={emergencySending}
            >
              ยกเลิก
            </button>
            <button
              type="button"
              className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={!emergencyDetail.trim() || emergencySending}
              onClick={() => void submitEmergency()}
            >
              {emergencySending ? "กำลังส่ง…" : "ยืนยันส่งแจ้งเตือนทีม"}
            </button>
          </div>
        </div>
      )}
      {loadError && (
        <div className="mb-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
          {loadError}
        </div>
      )}
      <button
        type="button"
        className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 py-2 text-xs font-semibold text-red-800 hover:bg-red-100"
        onClick={() => setEmergencyOpen(true)}
      >
        <AlertTriangle className="h-4 w-4" />
        ปุ่มฉุกเฉิน — ความปลอดภัย / ชีวิต / ภัยธรรมชาติ
      </button>
      <div className="flex-1 overflow-y-auto space-y-3 pr-2 mb-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.isBot ? "justify-start" : "justify-end"}`}
          >
            {m.isBot && (
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-2">
                <Bot size={16} className="text-blue-600" />
              </div>
            )}
            <div
              className={`px-4 py-2 rounded-2xl text-sm ${
                fullscreen ? "max-w-[92%] sm:max-w-[78%]" : "max-w-[80%]"
              } ${m.isBot ? "bg-gray-100 text-gray-800 rounded-tl-none whitespace-pre-wrap" : "bg-emerald-600 text-white rounded-tr-none"}`}
            >
              {renderMessageText(m.text)}
              {m.diagnosticSummary && (
                <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50 px-2 py-1 text-[11px] text-blue-800">
                  ตรวจแล้ว: {m.diagnosticSummary}
                </div>
              )}
              {m.isBot && renderCareTimeline(m)}
              {m.isBot && (m.quickActions || []).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(m.quickActions || []).map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => void handleQuickAction(action, m)}
                      className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
              {m.isBot && m.source?.includes("support_ai") && (
                <div className="mt-2 flex gap-1.5 border-t border-slate-200 pt-2">
                  <button
                    type="button"
                    onClick={() => void handleFeedback(m, true)}
                    className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"
                  >
                    ช่วยได้
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleFeedback(m, false)}
                    className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
                  >
                    ยังไม่หาย
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-2">
              <Bot size={16} className="text-blue-600" />
            </div>
            <div className="bg-gray-100 px-4 py-2 rounded-2xl rounded-tl-none text-gray-400 text-xs animate-pulse">
              กำลังพิมพ์...
            </div>
          </div>
        )}
        <div ref={endRef}></div>
      </div>

      <div className="mb-3 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-2">
        <div className="mb-1 flex items-center justify-between px-1">
          <p className="text-[11px] font-bold text-emerald-900">
            เลือกหัวข้อปัญหา
          </p>
          <button
            type="button"
            onClick={() => setActiveQuickTopic(null)}
            className="text-[10px] font-semibold text-emerald-700"
          >
            พับทั้งหมด
          </button>
        </div>
        <div
          className={`grid gap-1.5 ${
            fullscreen ? "sm:grid-cols-2" : "grid-cols-1"
          }`}
        >
          {quickReplyGroups.map((group) => {
            const open = activeQuickTopic === group.id;
            return (
              <div
                key={group.id}
                className="overflow-hidden rounded-xl border border-white/80 bg-white"
              >
                <button
                  type="button"
                  onClick={() =>
                    setActiveQuickTopic((current) =>
                      current === group.id ? null : group.id,
                    )
                  }
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-bold text-slate-800"
                >
                  <span className="truncate">{group.title}</span>
                  <ChevronRight
                    size={14}
                    className={`shrink-0 text-emerald-600 transition-transform ${
                      open ? "rotate-90" : ""
                    }`}
                  />
                </button>
                {open && (
                  <div className="flex flex-wrap gap-1.5 border-t border-emerald-50 px-2 py-2">
                    {group.items.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => handleSend(q)}
                        className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
        <input
          type="text"
          className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
          placeholder="พิมพ์คำถามของคุณ..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend(input)}
        />
        <button
          onClick={() => handleSend(input)}
          disabled={!input.trim() || isTyping}
          className="p-2 bg-emerald-600 text-white rounded-full hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          <Send size={18} />
        </button>
      </div>
      <div className="mt-2 space-y-1 text-center">
        <a
          href="mailto:support@aqond.com"
          className="text-[10px] text-gray-400 hover:text-emerald-600 underline block"
        >
          อีเมล support@aqond.com (คิวแยกจากตั๋วในแอป — ใช้เมื่อเข้าแอปไม่ได้)
        </a>
      </div>
    </div>
  );
};

export const Settings: React.FC = () => {
  const { user, logout, login, token, refreshUser } = useAuth();
  const {
    theme,
    setTheme,
    setBadgeDisplay,
    badgeDisplay,
    restoreDefault,
    availableVipThemes,
  } = useTheme();
  const { t, language, setLanguage } = useLanguage();
  const { notify } = useNotification();
  const { config: mobileAppConfig } = useMobileAppConfig();
  const navigate = useNavigate();
  const location = useLocation();
  const lineContactUrl = useMemo(() => getCompanyLineOpenUrl(), []);
  const lineContactSubtitle = useMemo(() => getLineContactListSubtitle(), []);
  const showLineContactRow = useMemo(() => hasLineContactInApp(), []);
  const floatingFabPrefs = useFloatingFabPrefs();

  const setFloatingFab = (patch: Partial<typeof floatingFabPrefs>) => {
    saveFloatingFabPrefs({ ...floatingFabPrefs, ...patch });
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search || "");
    if (params.get("unlock_rate_limit") !== "1") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await selfUnlockRateLimit();
        if (cancelled) return;
        const remaining = res.unlock?.self_unlocks_remaining_today;
        notify(
          remaining != null
            ? `ปลดล็อก Rate Limit แล้ว เหลือสิทธิ์วันนี้ ${remaining} ครั้ง`
            : res.message || "ปลดล็อก Rate Limit แล้ว",
          "success",
        );
      } catch (e: any) {
        if (!cancelled) {
          notify(
            e?.response?.data?.message ||
              e?.message ||
              "ปลดล็อก Rate Limit ไม่สำเร็จ",
            "error",
          );
        }
      } finally {
        if (!cancelled) {
          params.delete("unlock_rate_limit");
          const nextSearch = params.toString();
          navigate(
            `${location.pathname}${nextSearch ? `?${nextSearch}` : ""}`,
            { replace: true, state: location.state },
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.search, location.state, navigate, notify]);

  // State for Modals
  const [activeModal, setActiveModal] = useState<
    | "profile"
    | "password"
    | "support"
    | "payment_methods"
    | "add_payment"
    | "about"
    | "thai_id"
    | "marine_kyc"
    | "line_contact"
    | null
  >(null);
  const [supportInitialDraft, setSupportInitialDraft] = useState("");
  const [supportFullscreen, setSupportFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [dataExportLoading, setDataExportLoading] = useState(false);
  /** จาก Android versionName / versionCode — ไม่ใช่ข้อความฮาร์ดโค้ดใน i18n */
  const [nativeAppVersion, setNativeAppVersion] = useState<string | null>(null);

  // Forms Data
  const [profileForm, setProfileForm] = useState({
    name: "",
    phone: "",
    email: "",
    bio: "",
    blood_type: "",
    allergies: "",
    emergency_contact: "",
  });
  const [passwordForm, setPasswordForm] = useState({
    old: "",
    new: "",
    confirm: "",
  });
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [paymentForm, setPaymentForm] = useState<{
    type: "bank" | "truemoney" | "payso" | "card";
    provider_name: string;
    account_number: string;
    account_name: string;
    bank_book_url?: string;
    card_brand?: string;
    card_expiry?: string;
    card_cvc?: string;
  }>({
    type: "bank",
    provider_name: "KBANK",
    account_number: "",
    account_name: "",
    bank_book_url: "",
    card_brand: "",
    card_expiry: "",
    card_cvc: "",
  });
  const [paymentBookUploading, setPaymentBookUploading] = useState(false);
  const bankBookRef = useRef<HTMLInputElement>(null);

  // Power to the User: Role & Peace Mode
  const [modeStatus, setModeStatus] = useState<{
    role: string;
    is_peace_mode: boolean;
    peace_mode_until: string | null;
    is_banned: boolean;
    provider_available: boolean;
  } | null>(null);
  const [peaceHours, setPeaceHours] = useState<number>(8);

  /** Brand Adviser — จาก backend profile (ไม่ sync ทุกครั้งใน AuthContext) */
  const [baProfile, setBaProfile] = useState<{
    is_brand_adviser?: boolean;
    adviser_status?: string | null;
    brand_adviser_program_enabled?: boolean;
    adviser_reputation_score?: number;
    brand_adviser_suspend_warning?: boolean;
    days_until_suspend_estimate?: number | null;
  } | null>(null);
  const [baRules, setBaRules] = useState<BrandAdviserRules | null>(null);

  // Thai ID Form State — SECURITY: OCR data in React state only; never localStorage.
  // Preview: Blob URL or backend URL. Pending files stored in ref for upload.
  const [thaiIDForm, setThaiIDForm] = useState<{
    national_id: string;
    id_card_expiry: string;
    id_card_front: string | null;
    id_card_back: string | null;
    driver_license_number: string;
    driver_license_photo: string | null;
    driver_license_expiry: string;
    vehicle_license_plate: string;
    vehicle_registration_photo: string | null;
    vehicle_brand: string;
    vehicle_category: "standard" | "premium" | null;
    yellow_plate_photo: string | null;
    public_transport_license_front: string | null;
    public_transport_license_back: string | null;
    wants_public_transport: boolean;
  }>({
    national_id: "",
    id_card_expiry: "",
    id_card_front: null,
    id_card_back: null,
    driver_license_number: "",
    driver_license_photo: null,
    driver_license_expiry: "",
    vehicle_license_plate: "",
    vehicle_registration_photo: null,
    vehicle_brand: "",
    vehicle_category: null,
    yellow_plate_photo: null,
    public_transport_license_front: null,
    public_transport_license_back: null,
    wants_public_transport: false,
  });
  const [thaiIDOcrVerified, setThaiIDOcrVerified] = useState(false);
  const [thaiIDUploading, setThaiIDUploading] = useState<string | null>(null);
  /** มีแถว kyc_submissions ล่าสุดจาก backend (Wizard) */
  const [kycSubmissionHint, setKycSubmissionHint] = useState<{
    status?: string;
    submittedAt?: string;
  } | null>(null);
  const [kycDocGate, setKycDocGate] = useState<KycDocumentVerification | null>(
    null,
  );
  const [kycSupplementRequest, setKycSupplementRequest] = useState<{
    requested_docs?: string[];
  } | null>(null);
  const [marineKYCForm, setMarineKYCForm] = useState<{
    skipper_license_number: string;
    skipper_license_expiry: string;
    skipper_license_photo: string | null;
    boat_registration_number: string;
    boat_brand: string;
    boat_registration_photo: string | null;
  }>({
    skipper_license_number: "",
    skipper_license_expiry: "",
    skipper_license_photo: null,
    boat_registration_number: "",
    boat_brand: "",
    boat_registration_photo: null,
  });
  const [marineKYCUploading, setMarineKYCUploading] = useState<string | null>(
    null,
  );
  const skipperLicenseRef = useRef<HTMLInputElement>(null);
  const boatRegRef = useRef<HTMLInputElement>(null);
  const marinePendingFilesRef = useRef<Record<string, File>>({});
  const idCardFrontRef = useRef<HTMLInputElement>(null);
  const idCardBackRef = useRef<HTMLInputElement>(null);
  const driverLicenseRef = useRef<HTMLInputElement>(null);
  const vehicleRegRef = useRef<HTMLInputElement>(null);
  const yellowPlateRef = useRef<HTMLInputElement>(null);
  const ptLicenseFrontRef = useRef<HTMLInputElement>(null);
  const ptLicenseBackRef = useRef<HTMLInputElement>(null);
  const pendingFilesRef = useRef<Record<string, File>>({});

  useEffect(() => {
    void ensureCardTokenSdkReady().catch(() => {});
  }, []);

  useEffect(() => {
    if (user) {
      MockApi.getModeStatus()
        .then(setModeStatus)
        .catch(() => setModeStatus(null));
    }
  }, [user]);

  useEffect(() => {
    void App.getInfo()
      .then((info) => {
        setNativeAppVersion(`${info.version} · build ${info.build}`);
      })
      .catch(() => setNativeAppVersion(null));
  }, []);

  useEffect(() => {
    fetchBrandAdviserRules()
      .then((d) => setBaRules(d.rules))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setBaProfile(null);
      return;
    }
    MockApi.getProfile(user.id, { refresh: false })
      .then((p) => {
        setBaProfile({
          is_brand_adviser: p.is_brand_adviser,
          adviser_status: p.adviser_status,
          brand_adviser_program_enabled: p.brand_adviser_program_enabled,
          adviser_reputation_score: p.adviser_reputation_score,
          brand_adviser_suspend_warning: p.brand_adviser_suspend_warning,
          days_until_suspend_estimate: p.days_until_suspend_estimate ?? null,
        });
      })
      .catch(() => setBaProfile(null));
  }, [user?.id]);

  useEffect(() => {
    if (user) {
      setProfileForm({
        name: user.name || "",
        phone: user.phone || "",
        email: user.email || "",
        bio: user.bio || "",
        blood_type: (user as any).blood_type || "",
        allergies: (user as any).allergies || "",
        emergency_contact: (user as any).emergency_contact || "",
      });
      setNotifEnabled(user.notifications_enabled !== false);
    }
  }, [user]);

  /** เปิด Thai ID จาก Profile เมื่อแอดมินขอเอกสารเพิ่ม */
  useEffect(() => {
    const st = location.state as { openThaiId?: boolean } | undefined;
    if (!st?.openThaiId) return;
    setActiveModal("thai_id");
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, navigate]);

  /** เปิดศูนย์ช่วยเหลือจากหน้างาน (แจ้งปัญหา) — navigate state: { openSupport: true, supportPrefill?: string } */
  useEffect(() => {
    const st = location.state as
      | { openSupport?: boolean; supportPrefill?: string }
      | undefined;
    if (!st?.openSupport) return;
    setActiveModal("support");
    if (typeof st.supportPrefill === "string" && st.supportPrefill.trim()) {
      setSupportInitialDraft(st.supportPrefill.trim());
    } else {
      setSupportInitialDraft("");
    }
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    if (user?.id) {
      MockApi.checkKYCStatus()
        .then((st) => setKycDocGate(st?.documentVerification ?? null))
        .catch(() => setKycDocGate(null));
    }
  }, [user?.id]);

  // Load KYC data when Thai ID modal opens
  useEffect(() => {
    if (activeModal === "thai_id" && user) {
      loadKYCData();
    }
  }, [activeModal, user]);

  // SECURITY: Cleanup on Thai ID modal close — revoke Blob URLs, clear temp buffers
  const handleThaiIDModalClose = () => {
    const urls = [
      thaiIDForm.id_card_front,
      thaiIDForm.id_card_back,
      thaiIDForm.driver_license_photo,
      thaiIDForm.vehicle_registration_photo,
      thaiIDForm.yellow_plate_photo,
      thaiIDForm.public_transport_license_front,
      thaiIDForm.public_transport_license_back,
    ].filter(Boolean) as string[];
    urls.forEach(revokeBlobUrl);
    pendingFilesRef.current = {};
    setActiveModal(null);
  };

  const handleMarineKYCModalClose = () => {
    [marineKYCForm.skipper_license_photo, marineKYCForm.boat_registration_photo]
      .filter((url): url is string => Boolean(url))
      .forEach(revokeBlobUrl);
    marinePendingFilesRef.current = {};
    setActiveModal(null);
  };

  useEffect(() => {
    if (activeModal === "marine_kyc" && user) {
      setMarineKYCForm({
        skipper_license_number: (user as any).skipper_license_number || "",
        skipper_license_expiry: (user as any).skipper_license_expiry || "",
        skipper_license_photo: (user as any).skipper_license_photo_url || null,
        boat_registration_number: (user as any).boat_registration_number || "",
        boat_brand: (user as any).boat_brand || "",
        boat_registration_photo:
          (user as any).boat_registration_photo_url || null,
      });
    }
  }, [activeModal, user]);

  const handleMarineKYCFileChange = async (
    field: "skipper_license_photo" | "boat_registration_photo",
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/")) {
      notify("กรุณาเลือกไฟล์รูปภาพเท่านั้น", "error");
      return;
    }
    setMarineKYCUploading(field);
    try {
      const blobUrl = fileToBlobUrl(file);
      marinePendingFilesRef.current[field] = file;
      setMarineKYCForm((prev) => ({ ...prev, [field]: blobUrl }));
      notify("อัปโหลดรูปสำเร็จ", "success");
    } catch {
      notify("อัปโหลดไม่สำเร็จ", "error");
    } finally {
      setMarineKYCUploading(null);
    }
  };

  // โหลดข้อมูลช่องทางรับเงินล่าสุดเมื่อเปิดโมดอล (ยกเว้นเมื่อเพิ่งบันทึกจาก add_payment)
  useEffect(() => {
    if (activeModal === "payment_methods" && !skipPaymentRefreshRef.current) {
      refreshUser();
    }
  }, [activeModal, refreshUser]);

  // โหลดจากโปรไฟล์ + แถวล่าสุดใน kyc_submissions (Wizard → backend)
  const loadKYCData = async () => {
    if (!user) return;

    try {
      const profile = await MockApi.getProfile(user.id, { refresh: true });

      type LatestKycPack = Awaited<
        ReturnType<typeof MockApi.getMyLatestKycSubmission>
      >;
      let sub: LatestKycPack["submission"] = null;
      try {
        const pack = await MockApi.getMyLatestKycSubmission();
        if (pack?.found && pack.submission) sub = pack.submission;
      } catch {
        /* ไม่มีสิทธิ์หรือ endpoint ยังไม่ deploy — ใช้แค่โปรไฟล์ */
      }

      let kycStatusPack: Awaited<
        ReturnType<typeof MockApi.checkKYCStatus>
      > | null = null;
      try {
        kycStatusPack = await MockApi.checkKYCStatus();
        setKycDocGate(kycStatusPack?.documentVerification ?? null);
        setKycSupplementRequest(kycStatusPack?.kycSupplementRequest ?? null);
      } catch {
        setKycDocGate(null);
        setKycSupplementRequest(null);
      }

      const vehicles = parseKycVehiclesJson(sub?.vehicles_json);
      const v0 = vehicles[0];

      const national_from_profile =
        profile.national_id ||
        profile.kyc_id_card_number ||
        profile.id_card_number ||
        "";
      const national_from_kyc = sub?.id_card_number
        ? String(sub.id_card_number).replace(/\D/g, "").slice(0, 13)
        : "";
      const national_id = national_from_kyc || national_from_profile;

      const id_card_front =
        sub?.id_card_front_url ||
        profile.id_card_front_url ||
        profile.kyc_docs?.id_card_front ||
        null;
      const id_card_back =
        sub?.id_card_back_url ||
        profile.id_card_back_url ||
        profile.kyc_docs?.id_card_back ||
        null;

      const driver_license_photo =
        sub?.driving_license_front_url ||
        profile.driver_license_photo_url ||
        profile.kyc_docs?.driving_license_front ||
        null;

      let vehicle_license_plate = profile.vehicle_license_plate || "";
      let vehicle_registration_photo =
        profile.vehicle_registration_photo_url ||
        (profile as any)?.vehicle_registration_photo_url ||
        null;
      let vehicle_brand = (profile as any)?.vehicle_brand || "";

      if (v0) {
        const plate = [v0.license_plate, v0.vehicle_province]
          .filter(Boolean)
          .join(" ")
          .trim();
        if (plate) vehicle_license_plate = plate;
        const regUrl = v0.registration_book_photo_url;
        if (typeof regUrl === "string" && regUrl.trim())
          vehicle_registration_photo = regUrl.trim();
        const vb = v0.vehicle_brand;
        if (typeof vb === "string" && vb.trim()) vehicle_brand = vb.trim();
      }

      const vehicleCategory =
        (profile as any)?.vehicle_category === "premium"
          ? "premium"
          : (profile as any)?.vehicle_category === "standard"
            ? "standard"
            : null;

      setThaiIDForm({
        national_id,
        id_card_expiry:
          (sub as any)?.id_card_expiry_date ||
          (profile as any)?.id_card_expiry ||
          (profile as any)?.id_card_expiry_date ||
          "",
        id_card_front,
        id_card_back,
        driver_license_number:
          profile.driver_license_number ||
          (sub as any)?.driver_license_number ||
          "",
        driver_license_photo,
        driver_license_expiry:
          profile.driver_license_expiry ||
          (sub as any)?.driver_license_expiry ||
          "",
        vehicle_license_plate,
        vehicle_registration_photo,
        vehicle_brand,
        vehicle_category: vehicleCategory,
        yellow_plate_photo:
          (sub as any)?.yellow_plate_photo_url?.trim?.() || null,
        public_transport_license_front:
          (sub as any)?.public_transport_license_front_url?.trim?.() || null,
        public_transport_license_back:
          (sub as any)?.public_transport_license_back_url?.trim?.() || null,
        wants_public_transport:
          !!(sub as any)?.wants_public_transport ||
          !!(sub as any)?.yellow_plate_photo_url ||
          !!(sub as any)?.public_transport_license_front_url ||
          !!kycStatusPack?.kycSupplementMode,
      });

      if (sub) {
        setKycSubmissionHint({
          status: sub.status,
          submittedAt:
            typeof sub.submitted_at === "string" ? sub.submitted_at : undefined,
        });
      } else {
        setKycSubmissionHint(null);
      }

      const hasId13 = national_id.length === 13;
      const hasAnyImage = !!(
        id_card_front ||
        id_card_back ||
        driver_license_photo ||
        vehicle_registration_photo
      );
      setThaiIDOcrVerified(hasId13 && hasAnyImage);
    } catch (error) {
      console.error("❌ Error loading KYC data:", error);
      setKycSubmissionHint(null);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const updatedUser = await MockApi.updateProfile({
        name: profileForm.name,
        bio: profileForm.bio,
        email: profileForm.email,
        phone: profileForm.phone,
        blood_type: profileForm.blood_type || null,
        allergies: profileForm.allergies || null,
        emergency_contact: profileForm.emergency_contact || null,
      });
      if (token) login(updatedUser, token);
      notify(t("settings.saved"), "success");
      setActiveModal(null);
    } catch (e: any) {
      console.error(
        "[Settings] Profile update failed:",
        e?.response?.data || e?.message,
        e,
      );
      notify(e?.message || "Update failed", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.new !== passwordForm.confirm) {
      notify("Passwords do not match", "error");
      return;
    }
    if (passwordForm.new.length < 6) {
      notify("Password too short", "error");
      return;
    }
    setIsLoading(true);
    try {
      await MockApi.changePassword(passwordForm.old, passwordForm.new);
      notify(t("settings.pass_updated"), "success");
      setActiveModal(null);
      setPasswordForm({ old: "", new: "", confirm: "" });
    } catch (e) {
      notify("Failed to change password", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleNotif = async () => {
    const newState = !notifEnabled;
    setNotifEnabled(newState);
    try {
      const updatedUser = await MockApi.updateProfile({
        notifications_enabled: newState,
      });
      if (token) login(updatedUser, token);
      notify(`Notifications ${newState ? "On" : "Off"}`, "info");
    } catch (e) {
      setNotifEnabled(!newState); // Revert
    }
  };

  const skipPaymentRefreshRef = useRef(false);
  const PAYMENT_LOCK_MS = 5000; // Prevent refreshUser from overwriting for 5s after save

  const handleThaiIDFileChange = async (
    docType: DocumentType,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/")) {
      notify("กรุณาเลือกไฟล์รูปภาพเท่านั้น", "error");
      return;
    }
    setThaiIDUploading(docType);
    try {
      const base64 = await fileToBase64(file);
      const result = await verifyDocumentWithOCR(base64, docType);
      if (result.status === "success" && result.data) {
        const blobUrl = fileToBlobUrl(file);
        const key =
          docType === "thai_id_front"
            ? "id_card_front"
            : docType === "thai_id_back"
              ? "id_card_back"
              : docType === "driver_license"
                ? "driver_license_photo"
                : "vehicle_registration_photo";
        pendingFilesRef.current[key] = file;
        setThaiIDOcrVerified(true);
        setThaiIDForm((prev) => {
          const next = { ...prev };
          if (docType === "thai_id_front" || docType === "thai_id_back") {
            next[
              docType === "thai_id_front" ? "id_card_front" : "id_card_back"
            ] = blobUrl;
            if (result.data?.national_id)
              next.national_id = result.data.national_id;
            if (result.data?.expiry_date)
              next.id_card_expiry = result.data.expiry_date;
          } else if (docType === "driver_license") {
            next.driver_license_photo = blobUrl;
            if (result.data?.driver_license_number)
              next.driver_license_number = result.data.driver_license_number;
            if (result.data?.expiry_date)
              next.driver_license_expiry = result.data.expiry_date;
          } else if (docType === "vehicle_registration") {
            next.vehicle_registration_photo = blobUrl;
            if (result.data?.vehicle_license_plate)
              next.vehicle_license_plate = result.data.vehicle_license_plate;
            if (result.data?.vehicle_brand)
              next.vehicle_brand = result.data.vehicle_brand;
          }
          return next;
        });
        notify(result.message || "ตรวจสอบเอกสารสำเร็จ", "success");
      } else {
        notify(result.message || "Document unclear", "error");
      }
    } catch (err) {
      notify("เกิดข้อผิดพลาดในการอ่านเอกสาร", "error");
    } finally {
      setThaiIDUploading(null);
    }
  };

  const handleThaiIDPtFileChange = async (
    key:
      | "yellow_plate_photo"
      | "public_transport_license_front"
      | "public_transport_license_back",
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/")) {
      notify("กรุณาเลือกไฟล์รูปภาพเท่านั้น", "error");
      return;
    }
    setThaiIDUploading(key);
    try {
      const blobUrl = fileToBlobUrl(file);
      pendingFilesRef.current[key] = file;
      setThaiIDForm((prev) => ({
        ...prev,
        wants_public_transport: true,
        [key]: blobUrl,
      }));
      notify("เลือกรูปแล้ว — กดบันทึกเพื่อส่ง", "success");
    } catch {
      notify("อัปโหลดรูปไม่สำเร็จ", "error");
    } finally {
      setThaiIDUploading(null);
    }
  };

  const canSaveThaiID =
    thaiIDOcrVerified && thaiIDForm.national_id.length === 13;

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentForm.account_name?.trim()) {
      notify("Please fill all fields", "error");
      return;
    }
    if (paymentForm.type === "bank") {
      if (!paymentForm.account_number || !paymentForm.bank_book_url?.trim()) {
        notify("กรุณากรอกเลขบัญชีและอัปโหลดรูปสมุดบัญชีธนาคาร", "error");
        return;
      }
    } else if (paymentForm.type === "payso") {
      const pp = normalizePromptPayAccount(paymentForm.account_number);
      if (!pp) {
        notify(
          "กรุณากรอก PromptPay / เบอร์มือถือ 10 หลัก (เช่น 0812345678)",
          "error",
        );
        return;
      }
    } else if (paymentForm.type !== "card" && !paymentForm.account_number) {
      notify("Please fill all fields", "error");
      return;
    }
    if (paymentForm.type === "card") {
      const { account_number, account_name, card_expiry, card_cvc } =
        paymentForm;
      if (!account_number.trim() || !card_expiry?.trim() || !card_cvc?.trim()) {
        notify("กรุณากรอกข้อมูลบัตรให้ครบถ้วน", "error");
        return;
      }
      const parsed = parseExpiry(card_expiry);
      if (!parsed) {
        notify("วันหมดอายุไม่ถูกต้อง (ใช้ MM/YY)", "error");
        return;
      }
      setIsLoading(true);
      const prevUser = user;
      try {
        const tokenData = await createCardToken({
          number: account_number,
          name: account_name.trim(),
          expiryMonth: parsed.month,
          expiryYear: parsed.year,
          cvc: card_cvc,
        });
        if (!tokenData?.id) {
          notify("ไม่สามารถสร้าง Card Token ได้", "error");
          return;
        }
        skipPaymentRefreshRef.current = true;
        setActiveModal("payment_methods");
        setPaymentForm({
          type: "bank",
          provider_name: "KBANK",
          account_number: "",
          account_name: "",
          bank_book_url: "",
          card_brand: "",
          card_expiry: "",
          card_cvc: "",
        });
        const updatedUser = await MockApi.addCardPaymentMethod({
          cardToken: tokenData.id,
          holderName: account_name.trim(),
        });
        if (token) login(updatedUser, token);
        notify(t("settings.add_success"), "success");
      } catch (err: any) {
        if (token && prevUser) login(prevUser, token);
        notify(
          err?.response?.data?.error ||
            err?.message ||
            "ไม่สามารถบันทึกบัตรได้",
          "error",
        );
      } finally {
        setIsLoading(false);
        setTimeout(() => {
          skipPaymentRefreshRef.current = false;
        }, PAYMENT_LOCK_MS);
      }
      return;
    }
    setIsLoading(true);
    const prevUser = user;
    const paysoNumber =
      paymentForm.type === "payso"
        ? normalizePromptPayAccount(paymentForm.account_number) ||
          paymentForm.account_number
        : paymentForm.account_number;
    const optimisticAccount: BankAccount = {
      id: `bank-${Date.now()}`,
      type: paymentForm.type,
      provider_name: paymentForm.provider_name,
      account_number: paysoNumber,
      account_name: paymentForm.account_name,
      ...(paymentForm.type === "bank" && paymentForm.bank_book_url
        ? { bank_book_url: paymentForm.bank_book_url }
        : {}),
      ...(paymentForm.type === "payso"
        ? { gateway: "payso", promptpay_id: paysoNumber }
        : {}),
    };
    try {
      // Optimistic update: show new account in UI immediately
      if (token && prevUser) {
        const optimisticUser = {
          ...prevUser,
          bank_accounts: [...(prevUser.bank_accounts || []), optimisticAccount],
        };
        login(optimisticUser, token);
      }
      skipPaymentRefreshRef.current = true;
      setActiveModal("payment_methods");
      const savedAccountNumber = paymentForm.account_number;
      const savedAccountName = paymentForm.account_name;
      const formToSave = { ...optimisticAccount };
      setPaymentForm({
        type: "bank",
        provider_name: "KBANK",
        account_number: "",
        account_name: "",
        bank_book_url: "",
        card_brand: "",
        card_expiry: "",
        card_cvc: "",
      });

      const updatedUser = await MockApi.addBankAccount(formToSave);
      const hasNewAccount = (updatedUser?.bank_accounts || []).some(
        (a) =>
          a.account_number === savedAccountNumber &&
          a.account_name === savedAccountName,
      );
      if (token) {
        const finalUser = hasNewAccount
          ? updatedUser
          : {
              ...updatedUser,
              bank_accounts: [
                ...(updatedUser?.bank_accounts || []),
                optimisticAccount,
              ],
            };
        login(finalUser, token);
      }
      notify(t("settings.add_success"), "success");
    } catch (e: any) {
      if (token && prevUser) login(prevUser, token);
      const msg =
        e?.response?.data?.error ||
        e?.message ||
        "ไม่สามารถบันทึกช่องทางรับเงินได้";
      notify(msg, "error");
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        skipPaymentRefreshRef.current = false;
      }, PAYMENT_LOCK_MS);
    }
  };

  const handleRemovePayment = async (id: string) => {
    if (
      window.confirm(
        t("settings.remove_payment_confirm") || "Remove this payment method?",
      )
    ) {
      try {
        const updatedUser = await MockApi.removeBankAccount(id);
        if (token) login(updatedUser, token);
        await refreshUser();
        notify("Payment method removed", "success");
      } catch (e) {
        notify("Failed to remove", "error");
      }
    }
  };

  const handleDelete = () => {
    if (
      window.confirm(
        "Are you sure you want to delete your account? This action cannot be undone.",
      )
    ) {
      logout();
    }
  };

  const handleDataExportRequest = async () => {
    if (
      !window.confirm(
        "ส่งคำขอรับสำเนาข้อมูลส่วนบุคคล (PDPA) ไปยังทีมงาน?\n\nคำขอจะเข้าคิวดำเนินการภายในระยะเวลาที่กฎหมายกำหนด (โดยทั่วไปไม่เกิน 30 วัน)",
      )
    ) {
      return;
    }
    setDataExportLoading(true);
    try {
      const res = await api.post("/account/data-export-request");
      const msg =
        (res.data as { message?: string })?.message || "ส่งคำขอสำเร็จ";
      notify(msg, "success");
    } catch (e: unknown) {
      const err = e as {
        response?: { data?: { error?: string } };
        message?: string;
      };
      notify(
        err?.response?.data?.error || err?.message || "ส่งคำขอไม่สำเร็จ",
        "error",
      );
    } finally {
      setDataExportLoading(false);
    }
  };

  return (
    <div className="settings-page max-w-2xl mx-auto pb-20">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {t("settings.title")}
      </h1>

      <div className="flex items-center mb-8 bg-white p-4 rounded-xl shadow-sm border border-gray-100 relative overflow-hidden">
        <img
          src={user?.avatar_url}
          alt="Profile"
          className="w-16 h-16 rounded-full mr-4 border-2 border-emerald-100 object-cover"
        />
        <div className="flex-1">
          <h2 className="text-lg font-bold text-gray-900">{user?.name}</h2>
          <p className="text-sm text-gray-500">{user?.email || user?.phone}</p>
        </div>
        <button
          onClick={() => setActiveModal("profile")}
          className="p-2 bg-gray-100 rounded-full text-gray-500 hover:bg-emerald-50 hover:text-emerald-600 transition-colors absolute top-4 right-4"
        >
          <Edit size={18} />
        </button>
      </div>

      {baProfile?.brand_adviser_suspend_warning && (
        <BrandAdviserSuspendBanner
          show
          tone="light"
          daysLeft={baProfile.days_until_suspend_estimate ?? undefined}
          inactivityDays={baRules?.inactivity_days}
          warnDaysBeforeSuspend={baRules?.warn_days_before_suspend}
          className="mb-4"
        />
      )}

      {(baProfile?.is_brand_adviser ||
        baProfile?.brand_adviser_program_enabled) && (
        <div className="mb-6 bg-white rounded-xl shadow-sm border border-amber-100 p-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Award size={20} className="text-amber-600" />
              <span className="text-sm font-bold text-gray-800">
                Brand Adviser
              </span>
              <BrandAdviserBadge
                isBrandAdviser={baProfile?.is_brand_adviser}
                adviserStatus={baProfile?.adviser_status}
                tone="light"
              />
            </div>
            {typeof baProfile?.adviser_reputation_score === "number" &&
              baProfile.adviser_reputation_score > 0 && (
                <span className="text-xs text-gray-500">
                  Reputation{" "}
                  {baProfile.adviser_reputation_score.toLocaleString()}
                </span>
              )}
          </div>
          {baProfile?.is_brand_adviser &&
            baProfile?.brand_adviser_program_enabled === false && (
              <BrandAdviserProgramOffNotice className="mt-2" />
            )}
          {baProfile?.is_brand_adviser && (
            <BrandAdviserReputationHint
              rules={baRules}
              className="mt-2 text-gray-500"
            />
          )}
          {baRules &&
            (baProfile?.is_brand_adviser ||
              baProfile?.brand_adviser_program_enabled) && (
              <p className="text-[11px] text-gray-500 mt-2 leading-relaxed border-t border-amber-100 pt-2">
                เกณฑ์เวลาจากแอดมิน: ไม่มีกิจกรรมอ้างอิงต่อเนื่องเกิน{" "}
                {baRules.inactivity_days} วัน · แจ้งเตือนก่อนพัก{" "}
                {baRules.warn_days_before_suspend} วัน
                {baRules.program_enabled === false
                  ? " — โปรแกรม BA ปิดบนแพลตฟอร์ม"
                  : ""}
              </p>
            )}
        </div>
      )}

      <Section title={t("settings.account")}>
        <Item
          icon={User}
          label={t("settings.edit_profile")}
          onClick={() => setActiveModal("profile")}
        />
        <Item
          icon={Wifi}
          label={t("settings.connectivity_services")}
          onClick={() => navigate("/internet-packages")}
        />
        <Item
          icon={CreditCard}
          label={t("settings.payment_methods")}
          onClick={() => setActiveModal("payment_methods")}
        />
        <Item
          icon={IdCard}
          label="Thai ID & Documents"
          onClick={() => setActiveModal("thai_id")}
          value={
            kycSettingsRowBadge(kycDocGate) ||
            (user?.national_id ||
            user?.kyc_id_card_number ||
            user?.id_card_number
              ? `✓ ${maskID(user?.national_id || user?.kyc_id_card_number || user?.id_card_number)}`
              : "")
          }
        />
        <Item
          icon={Sailboat}
          label="Marine Captain (ใบอนุญาตขับขี่เรือ)"
          onClick={() => setActiveModal("marine_kyc")}
          value={(user as any)?.skipper_license_number ? "✓ Registered" : ""}
        />
        <Item
          icon={Lock}
          label={t("settings.password")}
          onClick={() => setActiveModal("password")}
        />
        <Item
          icon={Bell}
          label={t("settings.notifications")}
          toggle={notifEnabled}
          onToggle={handleToggleNotif}
        />
        <Item
          icon={Share2}
          label="การแชร์โพสต์ · รีมิกซ์และดาวน์โหลด"
          onClick={() => navigate("/settings/post-sharing")}
        />
        <Item
          icon={Megaphone}
          label="Ads on marketplace"
          onClick={() => navigate("/settings/ads-marketplace")}
        />
        <Item
          icon={Shield}
          label="แสดงปุ่ม SOS ลอย (ฉุกเฉิน)"
          toggle={floatingFabPrefs.showSos}
          onToggle={() =>
            setFloatingFab({ showSos: !floatingFabPrefs.showSos })
          }
        />
        <Item
          icon={Crown}
          label="แสดงปุ่ม VIP ลอย (มงกุฎ)"
          toggle={floatingFabPrefs.showVip}
          onToggle={() =>
            setFloatingFab({ showVip: !floatingFabPrefs.showVip })
          }
        />
        <div className="px-4 py-4 flex items-center justify-between hover:bg-gray-50 cursor-pointer">
          <div className="flex items-center">
            <Globe size={20} className="mr-3 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">
              {t("settings.language")}
            </span>
          </div>
          <select
            value={language}
            onChange={(e) => {
              setLanguage(e.target.value as any);
              notify("Language Updated", "success");
            }}
            className="bg-transparent text-sm text-emerald-600 font-medium focus:outline-none cursor-pointer"
          >
            <option value="en">English</option>
            <option value="th">ไทย</option>
            <option value="zh">中文</option>
            <option value="ja">日本語</option>
            <option value="fr">Français</option>
            <option value="ru">Русский</option>
          </select>
        </div>
      </Section>

      <Section title="Power to the User">
        <div className="px-4 py-3">
          <p className="text-xs text-gray-500 mb-3">สลับบทบาทและโหมดสงบ</p>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">
                บทบาท (Level 1)
              </p>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    try {
                      await MockApi.setAppMode("employer");
                      setModeStatus((prev) =>
                        prev ? { ...prev, role: "user" } : null,
                      );
                      if (token) await refreshUser?.();
                      window.dispatchEvent(
                        new CustomEvent("peace-mode-changed"),
                      );
                      notify("สลับเป็นโหมดจ้างงานแล้ว", "success");
                    } catch (e: any) {
                      notify(e?.message || "ไม่สามารถเปลี่ยนได้", "error");
                    }
                  }}
                  className={`role-employer-btn flex-1 py-2 rounded-lg text-sm font-medium ${["user", "employer"].includes(modeStatus?.role || user?.role || "") ? "role-employer-active bg-rose-500 text-white" : "bg-gray-100 text-gray-600"}`}
                >
                  <Briefcase size={16} className="inline mr-1" /> Employer
                </button>
                <button
                  onClick={async () => {
                    try {
                      await MockApi.setAppMode("provider");
                      setModeStatus((prev) =>
                        prev ? { ...prev, role: "provider" } : null,
                      );
                      if (token) await refreshUser?.();
                      window.dispatchEvent(
                        new CustomEvent("peace-mode-changed"),
                      );
                      notify("สลับเป็นโหมดรับงานแล้ว", "success");
                    } catch (e: any) {
                      notify(e?.message || "ไม่สามารถเปลี่ยนได้", "error");
                    }
                  }}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium ${(modeStatus?.role || user?.role) === "provider" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"}`}
                >
                  <User size={16} className="inline mr-1" /> Provider
                </button>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">
                Peace Mode (Level 2)
              </p>
              <p className="text-xs text-gray-500 mb-2">
                ปิด Push งานใหม่ + ซ่อนจาก search
              </p>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">
                  กลับมาออนไลน์ใน (ชม.)
                </span>
                <select
                  value={peaceHours}
                  onChange={(e) => setPeaceHours(parseInt(e.target.value, 10))}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-sm w-20"
                >
                  <option value={4}>4 ชม.</option>
                  <option value={8}>8 ชม.</option>
                  <option value={12}>12 ชม.</option>
                  <option value={24}>24 ชม.</option>
                </select>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                <span className="text-sm text-gray-600 flex items-center gap-1">
                  <Moon size={16} className="text-gray-400" />
                  {modeStatus?.is_peace_mode
                    ? "โหมดสงบเปิดอยู่"
                    : "โหมดสงบปิดอยู่"}
                </span>
                <div onClick={(e) => e.stopPropagation()}>
                  {modeStatus?.is_peace_mode ? (
                    <ToggleRight
                      size={32}
                      fill="#10B981"
                      className="text-emerald-600"
                    />
                  ) : (
                    <ToggleLeft size={32} className="text-gray-300" />
                  )}
                </div>
              </div>
              <button
                onClick={async () => {
                  const newState = !modeStatus?.is_peace_mode;
                  try {
                    await MockApi.setPeaceMode(
                      newState,
                      newState ? peaceHours : undefined,
                    );
                    setModeStatus((prev) =>
                      prev ? { ...prev, is_peace_mode: newState } : null,
                    );
                    window.dispatchEvent(new CustomEvent("peace-mode-changed"));
                    notify(
                      newState
                        ? `โหมดสงบเปิด — กลับมาออนไลน์ใน ${peaceHours} ชม.`
                        : "โหมดสงบปิดแล้ว",
                      "success",
                    );
                  } catch (e: any) {
                    notify(e?.message || "ไม่สามารถเปลี่ยนได้", "error");
                  }
                }}
                className={`mt-2 w-full py-2 rounded-lg text-sm font-medium ${modeStatus?.is_peace_mode ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}
              >
                {modeStatus?.is_peace_mode ? "ปิดโหมดสงบ" : "เปิดโหมดสงบ"}
              </button>
              {modeStatus?.is_banned && (
                <p className="mt-2 text-xs text-rose-600">
                  บัญชีถูก Lock 24 ชม. เนื่องจาก Collision
                </p>
              )}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Theme & Personalization">
        <div className="p-4 space-y-6">
          <div>
            <p className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
              <Palette size={18} /> Theme Selection
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button
                type="button"
                onClick={() => setTheme("standard")}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  theme === "standard"
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <p className="font-bold text-gray-800 text-sm">Standard</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  ฟรี · เน้นความสะอาด
                </p>
              </button>
              <ThemeCard
                id="vip-silver"
                label="Silver"
                desc="Metallic Slate"
                locked={!availableVipThemes.includes("vip-silver")}
                currentTheme={theme}
                onSelect={setTheme}
              />
              <ThemeCard
                id="vip-gold"
                label="Gold"
                desc="Royal Obsidian"
                locked={true}
                comingSoon
                currentTheme={theme}
                onSelect={setTheme}
              />
              <ThemeCard
                id="vip-platinum"
                label="Platinum"
                desc="Midnight Platinum"
                locked={true}
                comingSoon
                currentTheme={theme}
                onSelect={setTheme}
              />
            </div>
          </div>
          <div>
            <p className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
              <Award size={18} /> Badge Display
            </p>
            <p className="text-xs text-gray-500 mb-2">
              เลือก Badge ที่จะแสดงข้างชื่อคุณ
            </p>
            <div className="flex flex-wrap gap-2">
              {(["none", "member", "vip", "coach"] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBadgeDisplay(b)}
                  className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                    badgeDisplay === b
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-gray-200 hover:border-gray-300 text-gray-600"
                  }`}
                >
                  {b === "none" && "ไม่แสดง"}
                  {b === "member" && "Member"}
                  {b === "vip" && (
                    <span className="flex items-center gap-1">
                      <VIPBadge tier={user?.vip_tier} size="sm" showLabel /> VIP
                    </span>
                  )}
                  {b === "coach" && "Coach"}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={restoreDefault}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RotateCcw size={16} /> Restore Default
          </button>
        </div>
      </Section>

      <Section title="โค้ช & ศิษย์ (Connection)">
        <div className="p-4">
          <CoachConnectionSection notify={notify} />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => navigate("/course-studio")}
              className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left hover:bg-emerald-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <BookOpen size={20} className="text-emerald-700" />
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    ลงขายคอร์ส / Course Studio
                  </p>
                  <p className="text-xs text-slate-500">
                    สร้างคอร์ส ส่ง review และดูรายได้ผู้สอน
                  </p>
                </div>
              </div>
              <ChevronRight size={18} className="text-emerald-700" />
            </button>
            <button
              type="button"
              onClick={() => navigate("/courses")}
              className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-left hover:bg-blue-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Award size={20} className="text-blue-700" />
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    ตลาดคอร์ส AQOND
                  </p>
                  <p className="text-xs text-slate-500">
                    ซื้อคอร์สเพิ่มทักษะผ่าน Wallet
                  </p>
                </div>
              </div>
              <ChevronRight size={18} className="text-blue-700" />
            </button>
          </div>
        </div>
      </Section>

      <Section title="ข้อมูลส่วนบุคคล (PDPA)">
        <button
          type="button"
          disabled={dataExportLoading}
          onClick={handleDataExportRequest}
          className="w-full flex items-center justify-between px-4 py-4 hover:bg-gray-50 transition-colors text-left disabled:opacity-60"
        >
          <div className="flex items-center min-w-0">
            <Download size={20} className="mr-3 text-emerald-600 shrink-0" />
            <span className="text-sm font-medium text-gray-700">
              ขอส่งออกสำเนาข้อมูล (PDPA)
            </span>
          </div>
          <span className="text-xs text-gray-400 shrink-0 ml-2">
            {dataExportLoading ? "กำลังส่ง…" : "ส่งคำขอ"}
          </span>
        </button>
        <Item
          icon={Shield}
          label="การลบบัญชี / ลบหรือแก้ไขข้อมูลบางส่วน"
          onClick={() => navigate("/account-deletion")}
        />
      </Section>

      <Section title={t("settings.help")}>
        {showLineContactRow ? (
          <button
            type="button"
            onClick={() => setActiveModal("line_contact")}
            className="w-full flex items-center justify-between px-4 py-4 hover:bg-[#06C755]/[0.06] transition-colors text-left"
          >
            <div className="flex items-center min-w-0">
              <MessageSquare
                size={20}
                className="mr-3 text-[#06C755] shrink-0"
                aria-hidden
              />
              <div className="min-w-0 text-left">
                <span className="block text-sm font-medium text-gray-800">
                  {t("settings.line_contact")}
                </span>
                {lineContactSubtitle ? (
                  <span className="block text-xs text-[#06C755] font-medium mt-0.5 truncate">
                    {lineContactSubtitle}
                  </span>
                ) : null}
                <span className="block text-[11px] text-gray-500 mt-0.5">
                  {t("settings.line_contact_desc")}
                </span>
              </div>
            </div>
            <div className="flex items-center shrink-0 ml-2">
              <ChevronRight size={16} className="text-gray-300" aria-hidden />
            </div>
          </button>
        ) : null}
        <Item
          icon={HelpCircle}
          label={t("settings.help")}
          value={t("settings.support_desc")}
          onClick={() => setActiveModal("support")}
        />
        <Item
          icon={FileText}
          label="Legal & Terms"
          onClick={() => navigate("/legal")}
        />
        <Item
          icon={Shield}
          label={t("settings.about")}
          onClick={() => setActiveModal("about")}
        />
      </Section>

      <div className="mt-8 space-y-3">
        <button
          onClick={logout}
          className="w-full py-3 bg-white border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 flex items-center justify-center"
        >
          <LogOut size={18} className="mr-2" /> {t("nav.logout")}
        </button>

        <button
          onClick={handleDelete}
          className="w-full py-3 bg-white border border-red-100 text-red-500 font-medium rounded-xl hover:bg-red-50 flex items-center justify-center"
        >
          <Trash2 size={18} className="mr-2" /> {t("settings.delete")}
        </button>
      </div>

      <div className="mt-8 text-center">
        <p className="text-xs text-gray-400">
          AQOND App · {nativeAppVersion ?? t("settings.current_ver")}
        </p>
      </div>

      {/* --- MODALS --- */}

      {/* Edit Profile Modal */}
      <Modal
        isOpen={activeModal === "profile"}
        onClose={() => setActiveModal(null)}
        title={t("settings.edit_profile")}
      >
        <form onSubmit={handleUpdateProfile} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
              {t("auth.name")}
            </label>
            <div className="relative">
              <User className="absolute top-3 left-3 text-gray-400" size={16} />
              <input
                type="text"
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
                value={profileForm.name}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, name: e.target.value })
                }
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
              {t("auth.phone")}
            </label>
            <div className="relative">
              <Phone
                className="absolute top-3 left-3 text-gray-400"
                size={16}
              />
              <input
                type="text"
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
                value={profileForm.phone}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, phone: e.target.value })
                }
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute top-3 left-3 text-gray-400" size={16} />
              <input
                type="email"
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
                value={profileForm.email}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, email: e.target.value })
                }
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
              Bio
            </label>
            <textarea
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
              rows={3}
              value={profileForm.bio}
              onChange={(e) =>
                setProfileForm({ ...profileForm, bio: e.target.value })
              }
            />
          </div>
          {/* ข้อมูลฉุกเฉิน (SOS) — สำคัญสำหรับระบบ SOS */}
          <div className="pt-4 border-t border-gray-100">
            <p className="text-xs font-bold text-gray-600 mb-3 flex items-center gap-2">
              <AlertCircle size={14} className="text-amber-500" /> ข้อมูลฉุกเฉิน
              (SOS)
            </p>
            <p className="text-[11px] text-gray-500 mb-3">
              ข้อมูลนี้จะถูกส่งให้หน่วยกู้ภัยเมื่อกด SOS
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
                  กรุ๊ปเลือด
                </label>
                <select
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
                  value={profileForm.blood_type}
                  onChange={(e) =>
                    setProfileForm({
                      ...profileForm,
                      blood_type: e.target.value,
                    })
                  }
                >
                  <option value="">— เลือก —</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="AB">AB</option>
                  <option value="O">O</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
                  โรคประจำตัว / แพ้ยา
                </label>
                <input
                  type="text"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="เช่น แพ้เพนิซิลลิน, เบาหวาน"
                  value={profileForm.allergies}
                  onChange={(e) =>
                    setProfileForm({
                      ...profileForm,
                      allergies: e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
                  เบอร์ติดต่อฉุกเฉิน
                </label>
                <div className="relative">
                  <Phone
                    className="absolute top-3 left-3 text-gray-400"
                    size={16}
                  />
                  <input
                    type="tel"
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="08X-XXX-XXXX"
                    value={profileForm.emergency_contact}
                    onChange={(e) =>
                      setProfileForm({
                        ...profileForm,
                        emergency_contact: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
            </div>
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-emerald-600 text-white py-2 rounded-lg font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading && <Loader2 size={18} className="animate-spin" />}
            {isLoading
              ? t("settings.saving") || "Saving..."
              : t("settings.save")}
          </button>
        </form>
      </Modal>

      {/* Payment Methods List Modal */}
      <Modal
        isOpen={activeModal === "payment_methods"}
        onClose={() => setActiveModal(null)}
        title={t("settings.payment_methods")}
      >
        <div className="space-y-4">
          {(!user?.bank_accounts || user.bank_accounts.length === 0) && (
            <p className="text-center text-gray-500 text-sm py-4">
              {t("settings.no_payment_methods")}
            </p>
          )}

          {user?.bank_accounts?.map((acc) => (
            <div
              key={acc.id}
              className="relative overflow-hidden rounded-xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`p-3 rounded-xl ${
                      acc.type === "truemoney"
                        ? "bg-orange-50"
                        : acc.type === "payso" || acc.type === "stripe"
                          ? "bg-emerald-50"
                          : acc.type === "bank"
                            ? "bg-blue-50"
                            : "bg-purple-50"
                    }`}
                  >
                    {acc.type === "truemoney" ? (
                      <Smartphone size={24} className="text-orange-500" />
                    ) : acc.type === "payso" || acc.type === "stripe" ? (
                      <QrCode size={24} className="text-emerald-600" />
                    ) : acc.type === "bank" ? (
                      <Building size={24} className="text-blue-600" />
                    ) : (
                      <CreditCard size={24} className="text-purple-600" />
                    )}
                  </div>
                  <div>
                    <p className="font-bold text-gray-900">
                      {acc.type === "bank" || acc.type === "truemoney"
                        ? t(`bank.${acc.provider_name?.toLowerCase?.()}`) ||
                          acc.provider_name
                        : acc.type === "payso" || acc.type === "stripe"
                          ? "PaySo PromptPay"
                          : acc.provider_name === "PaySo" ||
                              acc.gateway === "payso"
                            ? "PaySo"
                            : "บัตรเครดิต / เดบิต"}
                    </p>
                    <p className="text-sm text-gray-600 mt-0.5">
                      {acc.account_name}
                    </p>
                    <p className="text-xs text-gray-500 font-mono mt-1">
                      •••• {String(acc.account_number).slice(-4)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleRemovePayment(acc.id)}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="ลบ"
                >
                  <Trash2 size={18} />
                </button>
              </div>
              {acc.is_default && (
                <span className="absolute top-2 right-12 text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                  ค่าเริ่มต้น
                </span>
              )}
            </div>
          ))}

          <button
            onClick={() => setActiveModal("add_payment")}
            className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 font-medium hover:bg-gray-50 hover:border-emerald-300 hover:text-emerald-600 flex items-center justify-center transition-colors"
          >
            <Plus size={18} className="mr-2" /> {t("settings.add_payment")}
          </button>
        </div>
      </Modal>

      {/* Add Payment Modal */}
      <Modal
        isOpen={activeModal === "add_payment"}
        onClose={() => setActiveModal("payment_methods")}
        title={t("settings.add_payment")}
      >
        <form
          onSubmit={handleAddPayment}
          className="settings-add-payment-form space-y-4"
        >
          <div>
            <label className="block text-xs font-bold text-gray-800 uppercase mb-1">
              Type
            </label>
            <select
              className="settings-payment-select w-full p-2 border border-gray-300 rounded-lg text-gray-900 font-medium bg-white"
              value={paymentForm.type}
              onChange={(e) => {
                const v = e.target.value;
                const provider =
                  v === "truemoney"
                    ? "TrueMoney"
                    : v === "payso"
                      ? "PaySo"
                      : v === "card"
                        ? "PaySo"
                        : "KBANK";
                setPaymentForm({
                  ...paymentForm,
                  type: v as any,
                  provider_name: provider,
                });
              }}
            >
              <option value="bank">Bank Transfer</option>
              <option value="truemoney">TrueMoney Wallet</option>
              <option value="payso">PaySo PromptPay</option>
              <option value="card">บัตรเครดิต / เดบิต (PaySo)</option>
            </select>
          </div>

          {paymentForm.type === "payso" && (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              รับเงินถอนผ่าน PaySo PromptPay — ใช้เบอร์มือถือหรือเลข PromptPay
              ที่ลงทะเบียนแล้ว (ระบบเติมเงิน Wallet ใช้ PaySo เหมือนกัน)
            </p>
          )}

          {paymentForm.type === "bank" && (
            <div>
              <label className="block text-xs font-bold text-gray-800 uppercase mb-1">
                Bank
              </label>
              <select
                className="settings-payment-select w-full p-2 border border-gray-300 rounded-lg text-gray-900 font-medium bg-white"
                value={paymentForm.provider_name}
                onChange={(e) =>
                  setPaymentForm({
                    ...paymentForm,
                    provider_name: e.target.value,
                  })
                }
              >
                <option value="KBANK">Kasikorn Bank (KBANK)</option>
                <option value="SCB">Siam Commercial Bank (SCB)</option>
                <option value="BBL">Bangkok Bank (BBL)</option>
                <option value="KTB">Krungthai Bank (KTB)</option>
                <option value="TTB">TMBThanachart (TTB)</option>
                <option value="BAY">Krungsri (BAY)</option>
                <option value="GSB">Government Savings Bank (GSB)</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-800 uppercase mb-1">
              {paymentForm.type === "card"
                ? "เลขบัตร"
                : paymentForm.type === "payso"
                  ? "PromptPay / เบอร์มือถือ"
                  : t("settings.acc_no")}
            </label>
            <input
              type="text"
              required={paymentForm.type !== "card"}
              inputMode={paymentForm.type === "card" ? "numeric" : "text"}
              className="w-full p-2 border border-gray-300 rounded-lg text-gray-900 font-medium"
              placeholder={
                paymentForm.type === "card"
                  ? "4111 1111 1111 1111"
                  : paymentForm.type === "payso" ||
                      paymentForm.type === "truemoney"
                    ? "08X-XXX-XXXX"
                    : "Account Number"
              }
              value={paymentForm.account_number}
              onChange={(e) =>
                setPaymentForm({
                  ...paymentForm,
                  account_number:
                    paymentForm.type === "card"
                      ? formatCardNumber(e.target.value)
                      : e.target.value,
                })
              }
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-800 uppercase mb-1">
              {t("settings.acc_name")}
            </label>
            <input
              type="text"
              required
              className="w-full p-2 border border-gray-300 rounded-lg text-gray-900 font-medium"
              placeholder="Account Holder Name"
              value={paymentForm.account_name}
              onChange={(e) =>
                setPaymentForm({ ...paymentForm, account_name: e.target.value })
              }
            />
          </div>

          {paymentForm.type === "bank" && (
            <div>
              <label className="block text-xs font-bold text-gray-800 uppercase mb-1">
                รูปสมุดบัญชีธนาคาร *
              </label>
              <input
                type="file"
                ref={bankBookRef}
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  setPaymentBookUploading(true);
                  try {
                    const { url } = await uploadDocumentToSecure(
                      file,
                      "bank_book",
                      { allowBlobFallback: false },
                    );
                    if (url) {
                      setPaymentForm((p) => ({ ...p, bank_book_url: url }));
                      notify("อัปโหลดสมุดบัญชีสำเร็จ", "success");
                    }
                  } catch {
                    notify("อัปโหลดสมุดบัญชีไม่สำเร็จ", "error");
                  } finally {
                    setPaymentBookUploading(false);
                  }
                }}
              />
              <button
                type="button"
                onClick={() => bankBookRef.current?.click()}
                disabled={paymentBookUploading}
                className={`w-full py-3 border-2 border-dashed rounded-lg text-sm font-medium ${
                  paymentForm.bank_book_url
                    ? "border-green-400 bg-green-50 text-green-800"
                    : "border-gray-300 text-gray-600 hover:border-blue-400"
                }`}
              >
                {paymentBookUploading
                  ? "กำลังอัปโหลด…"
                  : paymentForm.bank_book_url
                    ? "✓ อัปโหลดสมุดบัญชีแล้ว — กดเปลี่ยนรูป"
                    : "อัปโหลดรูปหน้าสมุดบัญชี"}
              </button>
            </div>
          )}

          {paymentForm.type === "card" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-800 uppercase mb-1">
                    หมดอายุ (MM/YY)
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full p-2 border border-gray-300 rounded-lg"
                    placeholder="12/28"
                    value={paymentForm.card_expiry || ""}
                    onChange={(e) =>
                      setPaymentForm({
                        ...paymentForm,
                        card_expiry: formatExpiry(e.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-800 uppercase mb-1">
                    CVC
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    required
                    maxLength={4}
                    className="w-full p-2 border border-gray-300 rounded-lg"
                    placeholder="123"
                    value={paymentForm.card_cvc || ""}
                    onChange={(e) =>
                      setPaymentForm({
                        ...paymentForm,
                        card_cvc: e.target.value.replace(/\D/g, "").slice(0, 4),
                      })
                    }
                  />
                </div>
              </div>
              <p className="text-[11px] text-gray-500">
                บัตรถูก tokenize ผ่าน PaySo — ไม่เก็บเลขบัตรเต็มบนเซิร์ฟเวอร์
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-emerald-600 text-white py-2 rounded-lg font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {isLoading ? "Adding..." : t("settings.save")}
          </button>
        </form>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        isOpen={activeModal === "password"}
        onClose={() => setActiveModal(null)}
        title={t("settings.password")}
      >
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
              {t("settings.old_password")}
            </label>
            <input
              type="password"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
              value={passwordForm.old}
              onChange={(e) =>
                setPasswordForm({ ...passwordForm, old: e.target.value })
              }
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
              {t("settings.new_password")}
            </label>
            <input
              type="password"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
              value={passwordForm.new}
              onChange={(e) =>
                setPasswordForm({ ...passwordForm, new: e.target.value })
              }
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
              {t("settings.confirm_password")}
            </label>
            <input
              type="password"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
              value={passwordForm.confirm}
              onChange={(e) =>
                setPasswordForm({ ...passwordForm, confirm: e.target.value })
              }
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-emerald-600 text-white py-2 rounded-lg font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {isLoading ? "Updating..." : t("settings.save")}
          </button>
        </form>
      </Modal>

      {/* Support Chat Modal */}
      <Modal
        isOpen={activeModal === "support"}
        onClose={() => {
          setActiveModal(null);
          setSupportInitialDraft("");
          setSupportFullscreen(false);
        }}
        onBack={
          supportFullscreen ? () => setSupportFullscreen(false) : undefined
        }
        fullscreen={supportFullscreen}
        headerAction={
          <button
            type="button"
            onClick={() => setSupportFullscreen((v) => !v)}
            className="rounded-full p-1 text-gray-500 hover:bg-white hover:text-gray-800"
            aria-label={
              supportFullscreen ? "Restore support chat" : "Expand support chat"
            }
            title={supportFullscreen ? "ย่อหน้าต่าง" : "ขยายเต็มจอ"}
          >
            {supportFullscreen ? (
              <Minimize2 size={18} />
            ) : (
              <Maximize2 size={18} />
            )}
          </button>
        }
        title={t("settings.contact_support")}
      >
        <SupportChat
          user={
            user
              ? { name: user.name, phone: user.phone, email: user.email }
              : null
          }
          initialDraft={supportInitialDraft || undefined}
          authToken={token || undefined}
          fullscreen={supportFullscreen}
        />
      </Modal>

      <Modal
        isOpen={activeModal === "line_contact"}
        onClose={() => setActiveModal(null)}
        title={t("settings.line_contact")}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 leading-relaxed">
            {t("settings.line_contact_sheet_hint")}
          </p>
          {companyLegal.lineQrImageUrl.trim() ? (
            <div className="flex justify-center rounded-xl bg-white p-4 border border-gray-100">
              <img
                src={companyLegal.lineQrImageUrl.trim()}
                alt="LINE Add Friend QR"
                className="w-44 h-44 object-contain"
                loading="lazy"
              />
            </div>
          ) : null}
          <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
              {t("settings.line_contact_id_label")}
            </p>
            <p className="text-sm font-semibold text-slate-900 font-mono mt-0.5 break-all">
              {lineContactSubtitle || "—"}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {lineContactUrl ? (
              <button
                type="button"
                onClick={() =>
                  window.open(lineContactUrl, "_blank", "noopener,noreferrer")
                }
                className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#06C755] text-white py-3 px-4 font-semibold text-sm hover:brightness-95 transition-[filter]"
              >
                <ExternalLink size={18} aria-hidden />
                {t("settings.line_contact_open_line")}
              </button>
            ) : null}
            {lineContactUrl ? (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(lineContactUrl);
                    notify(t("settings.line_contact_copied"), "success");
                  } catch {
                    notify("Could not copy", "error");
                  }
                }}
                className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-3 px-4 font-semibold text-sm text-gray-800 hover:bg-gray-50"
              >
                <Copy size={18} aria-hidden />
                {t("settings.line_contact_copy_link")}
              </button>
            ) : null}
          </div>
          {!lineContactUrl && companyLegal.lineQrImageUrl.trim() ? (
            <p className="text-xs text-amber-900 bg-amber-50 border border-amber-100 rounded-lg p-3 leading-snug">
              ตั้งค่า <span className="font-mono">VITE_COMPANY_LINE_URL</span>{" "}
              ตอน build เพื่อให้ปุ่มเปิดลิงก์เพิ่มเพื่อนทำงาน — ตอนนี้ใช้สแกน QR
              ได้ตามปกติ
            </p>
          ) : null}
        </div>
      </Modal>

      {/* Thai ID & Documents Modal */}
      <Modal
        isOpen={activeModal === "thai_id"}
        onClose={handleThaiIDModalClose}
        title="Thai ID & Documents"
      >
        {/* Info Banner */}
        {/* PDPA: Thai ID shown masked in summaries; full value only in secure View with re-auth */}
        {(kycSubmissionHint ||
          user?.national_id ||
          user?.kyc_docs?.id_card_front) && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-2">
              <Shield
                className="text-blue-600 flex-shrink-0 mt-0.5"
                size={16}
              />
              <div className="text-xs text-blue-800">
                <span className="font-bold">ข้อมูลเอกสาร:</span>{" "}
                {kycSubmissionHint ? (
                  <>
                    ดึงจากใบสมัคร KYC ล่าสุดที่ส่งไปยังระบบ
                    {kycSubmissionHint.status
                      ? ` (สถานะ: ${kycSubmissionHint.status})`
                      : ""}
                    {kycSubmissionHint.submittedAt
                      ? ` · ส่งเมื่อ ${new Date(kycSubmissionHint.submittedAt).toLocaleString()}`
                      : ""}
                    ส่วนที่ยังว่างสามารถอัปโหลดเพิ่มด้านล่าง
                  </>
                ) : (
                  <>
                    ข้อมูลด้านล่างมาจากโปรไฟล์ / การยืนยันตัวตนของคุณ
                    <span className="text-blue-700">
                      {" "}
                      แก้ไขและบันทึกได้ตามต้องการ
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {kycDocGate?.resubmitRequired && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-300 rounded-lg text-sm text-amber-950">
            <p className="font-bold flex items-center gap-1">
              <AlertCircle size={16} /> ทีมงานขอเอกสารใหม่
              {kycDocGate.resubmitTrigger === "id_expired"
                ? " (บัตรหมดอายุ)"
                : ""}
            </p>
            {kycDocGate.adminInstruction && (
              <p className="mt-1 whitespace-pre-wrap text-xs">
                {kycDocGate.adminInstruction}
              </p>
            )}
            <p className="mt-2 text-xs">
              ช่องด้านล่างปลดล็อกแล้ว — อัปโหลดและบันทึกเอกสารที่ต้องการได้
            </p>
          </div>
        )}

        <div className="space-y-6">
          {/* National ID Section */}
          <div>
            <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <IdCard size={18} className="text-blue-600" />
              บัตรประชาชน
              {isKycDocVerified(kycDocGate, "national_id") && (
                <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle size={12} /> Verified
                </span>
              )}
            </h4>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
                  เลขบัตรประชาชน (13 หลัก)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    maxLength={13}
                    readOnly={isKycDocLocked(kycDocGate, "national_id")}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-blue-500 focus:border-blue-500 ${
                      isKycDocLocked(kycDocGate, "national_id")
                        ? "border-green-300 bg-green-50/80 text-gray-800 cursor-not-allowed pr-10"
                        : "border-gray-300"
                    }`}
                    placeholder="1234567890123"
                    value={thaiIDForm.national_id}
                    onChange={(e) =>
                      setThaiIDForm({
                        ...thaiIDForm,
                        national_id: e.target.value,
                      })
                    }
                  />
                  {isKycDocVerified(kycDocGate, "national_id") && (
                    <CheckCircle
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-green-600"
                      size={20}
                    />
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
                  วันหมดอายุบัตรประชาชน
                </label>
                <input
                  type="date"
                  readOnly={isKycDocLocked(kycDocGate, "national_id")}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-blue-500 focus:border-blue-500 ${
                    isKycDocLocked(kycDocGate, "national_id")
                      ? "border-green-300 bg-green-50/80 text-gray-800 cursor-not-allowed"
                      : "border-gray-300"
                  }`}
                  value={thaiIDForm.id_card_expiry?.slice(0, 10) || ""}
                  onChange={(e) =>
                    setThaiIDForm({
                      ...thaiIDForm,
                      id_card_expiry: e.target.value,
                    })
                  }
                />
                <p className="mt-1 text-[11px] text-gray-500">
                  อ่านจาก OCR อัตโนมัติเมื่ออัปโหลดรูปบัตร — ใช้แจ้งเตือนหมดอายุ
                </p>
              </div>

              <input
                type="file"
                ref={idCardFrontRef}
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleThaiIDFileChange("thai_id_front", e)}
              />
              <input
                type="file"
                ref={idCardBackRef}
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleThaiIDFileChange("thai_id_back", e)}
              />
              <input
                type="file"
                ref={driverLicenseRef}
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleThaiIDFileChange("driver_license", e)}
              />
              <input
                type="file"
                ref={vehicleRegRef}
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) =>
                  handleThaiIDFileChange("vehicle_registration", e)
                }
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
                    บัตรหน้า
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => idCardFrontRef.current?.click()}
                      disabled={
                        !!thaiIDUploading ||
                        (!canEditKycDocuments(kycDocGate) &&
                          isKycDocVerified(kycDocGate, "id_card_front"))
                      }
                      className={`w-full h-24 border-2 border-dashed rounded-lg transition-colors flex flex-col items-center justify-center ${
                        thaiIDForm.id_card_front
                          ? "border-green-300 bg-green-50"
                          : "border-gray-300 hover:border-blue-500 text-gray-500 hover:text-blue-600"
                      }`}
                    >
                      {thaiIDForm.id_card_front ? (
                        <>
                          <img
                            src={thaiIDForm.id_card_front}
                            alt="ID Front"
                            className="w-full h-full object-cover rounded-lg absolute inset-0"
                          />
                          <div className="absolute inset-0 bg-green-500/20 rounded-lg flex items-center justify-center">
                            <CheckCircle className="text-green-600" size={24} />
                          </div>
                        </>
                      ) : thaiIDUploading === "thai_id_front" ? (
                        <Loader2 size={20} className="animate-spin" />
                      ) : (
                        <>
                          <Camera size={20} className="mb-1" />
                          <span className="text-xs">อัปโหลดรูป</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
                    บัตรหลัง
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => idCardBackRef.current?.click()}
                      disabled={
                        !!thaiIDUploading ||
                        (!canEditKycDocuments(kycDocGate) &&
                          isKycDocVerified(kycDocGate, "id_card_back"))
                      }
                      className={`w-full h-24 border-2 border-dashed rounded-lg transition-colors flex flex-col items-center justify-center ${
                        thaiIDForm.id_card_back
                          ? "border-green-300 bg-green-50"
                          : "border-gray-300 hover:border-blue-500 text-gray-500 hover:text-blue-600"
                      }`}
                    >
                      {thaiIDForm.id_card_back ? (
                        <>
                          <img
                            src={thaiIDForm.id_card_back}
                            alt="ID Back"
                            className="w-full h-full object-cover rounded-lg absolute inset-0"
                          />
                          <div className="absolute inset-0 bg-green-500/20 rounded-lg flex items-center justify-center">
                            <CheckCircle className="text-green-600" size={24} />
                          </div>
                        </>
                      ) : thaiIDUploading === "thai_id_back" ? (
                        <Loader2 size={20} className="animate-spin" />
                      ) : (
                        <>
                          <Camera size={20} className="mb-1" />
                          <span className="text-xs">อัปโหลดรูป</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Driver License Section */}
          <div className="pt-4 border-t border-gray-200">
            <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <CreditCard size={18} className="text-purple-600" />
              ใบขับขี่ (ถ้ามี)
              {isKycDocVerified(kycDocGate, "driver_license") && (
                <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle size={12} /> Verified
                </span>
              )}
            </h4>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
                  เลขใบขับขี่
                </label>
                <input
                  type="text"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500"
                  placeholder="12345678"
                  value={thaiIDForm.driver_license_number}
                  onChange={(e) =>
                    setThaiIDForm({
                      ...thaiIDForm,
                      driver_license_number: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
                  วันหมดอายุ
                </label>
                <input
                  type="date"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500"
                  value={thaiIDForm.driver_license_expiry}
                  onChange={(e) =>
                    setThaiIDForm({
                      ...thaiIDForm,
                      driver_license_expiry: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
                  รูปใบขับขี่
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => driverLicenseRef.current?.click()}
                    disabled={
                      !!thaiIDUploading ||
                      (!canEditKycDocuments(kycDocGate) &&
                        isKycDocVerified(kycDocGate, "driver_license"))
                    }
                    className={`w-full h-24 border-2 border-dashed rounded-lg transition-colors flex flex-col items-center justify-center ${
                      thaiIDForm.driver_license_photo
                        ? "border-green-300 bg-green-50"
                        : "border-gray-300 hover:border-purple-500 text-gray-500 hover:text-purple-600"
                    }`}
                  >
                    {thaiIDForm.driver_license_photo ? (
                      <>
                        <img
                          src={thaiIDForm.driver_license_photo}
                          alt="Driver License"
                          className="w-full h-full object-cover rounded-lg absolute inset-0"
                        />
                        <div className="absolute inset-0 bg-green-500/20 rounded-lg flex items-center justify-center">
                          <CheckCircle className="text-green-600" size={24} />
                        </div>
                      </>
                    ) : thaiIDUploading === "driver_license" ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : (
                      <>
                        <Upload size={20} className="mb-1" />
                        <span className="text-xs">อัปโหลดรูป</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Vehicle Registration Section */}
          <div className="pt-4 border-t border-gray-200">
            <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <Car size={18} className="text-emerald-600" />
              ทะเบียนรถ (ถ้ามี)
              {isKycDocVerified(kycDocGate, "vehicle_registration") && (
                <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle size={12} /> Verified
                </span>
              )}
            </h4>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
                  เลขทะเบียนรถ
                </label>
                <input
                  type="text"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="กก 1234 กรุงเทพมหานคร"
                  value={thaiIDForm.vehicle_license_plate}
                  onChange={(e) =>
                    setThaiIDForm({
                      ...thaiIDForm,
                      vehicle_license_plate: e.target.value,
                    })
                  }
                />
                {thaiIDForm.vehicle_category && (
                  <p className="mt-2 text-xs font-medium">
                    <span
                      className={`px-2 py-0.5 rounded-full ${thaiIDForm.vehicle_category === "premium" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}
                    >
                      เกรดรถ:{" "}
                      {thaiIDForm.vehicle_category === "premium"
                        ? "Premium"
                        : "Standard"}
                    </span>
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
                  รูปเล่มทะเบียนรถ
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => vehicleRegRef.current?.click()}
                    disabled={
                      !!thaiIDUploading ||
                      (!canEditKycDocuments(kycDocGate) &&
                        isKycDocVerified(kycDocGate, "vehicle_registration"))
                    }
                    className={`w-full h-24 border-2 border-dashed rounded-lg transition-colors flex flex-col items-center justify-center ${
                      thaiIDForm.vehicle_registration_photo
                        ? "border-green-300 bg-green-50"
                        : "border-gray-300 hover:border-emerald-500 text-gray-500 hover:text-emerald-600"
                    }`}
                  >
                    {thaiIDForm.vehicle_registration_photo ? (
                      <>
                        <img
                          src={thaiIDForm.vehicle_registration_photo}
                          alt="Vehicle Registration"
                          className="w-full h-full object-cover rounded-lg absolute inset-0"
                        />
                        <div className="absolute inset-0 bg-green-500/20 rounded-lg flex items-center justify-center">
                          <CheckCircle className="text-green-600" size={24} />
                        </div>
                      </>
                    ) : thaiIDUploading === "vehicle_registration" ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : (
                      <>
                        <Upload size={20} className="mb-1" />
                        <span className="text-xs">อัปโหลดรูป</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Public Transport (Yellow Plate) Section */}
          <div className="pt-4 border-t border-gray-200">
            <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <Car size={18} className="text-amber-600" />
              รถสาธารณะ (ป้ายเหลือง)
              {isKycDocVerified(kycDocGate, "yellow_plate") &&
                isKycDocVerified(kycDocGate, "public_transport_license") && (
                  <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle size={12} /> Verified
                  </span>
                )}
            </h4>

            <label className="flex items-center gap-2 mb-3 cursor-pointer">
              <input
                type="checkbox"
                checked={thaiIDForm.wants_public_transport}
                disabled={
                  !canEditKycDocuments(kycDocGate) &&
                  isKycDocVerified(kycDocGate, "yellow_plate")
                }
                onChange={(e) =>
                  setThaiIDForm({
                    ...thaiIDForm,
                    wants_public_transport: e.target.checked,
                  })
                }
                className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
              />
              <span className="text-sm text-gray-700">
                ขับรถสาธารณะ / มีป้ายเหลือง
              </span>
            </label>

            {kycDocGate?.supplementRequired && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                แอดมินขอเอกสารเพิ่ม — กรุณาอัปโหลดป้ายเหลืองและใบขับขี่สาธารณะ
              </p>
            )}

            {(thaiIDForm.wants_public_transport ||
              kycDocGate?.supplementRequired) && (
              <div className="space-y-3">
                <input
                  type="file"
                  ref={yellowPlateRef}
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) =>
                    handleThaiIDPtFileChange("yellow_plate_photo", e)
                  }
                />
                <input
                  type="file"
                  ref={ptLicenseFrontRef}
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) =>
                    handleThaiIDPtFileChange(
                      "public_transport_license_front",
                      e,
                    )
                  }
                />
                <input
                  type="file"
                  ref={ptLicenseBackRef}
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) =>
                    handleThaiIDPtFileChange("public_transport_license_back", e)
                  }
                />

                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
                    ใบขออนุญาตป้ายเหลือง *
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => yellowPlateRef.current?.click()}
                      disabled={
                        !!thaiIDUploading ||
                        (!canEditKycDocuments(kycDocGate) &&
                          isKycDocVerified(kycDocGate, "yellow_plate"))
                      }
                      className={`w-full h-24 border-2 border-dashed rounded-lg transition-colors flex flex-col items-center justify-center ${
                        thaiIDForm.yellow_plate_photo
                          ? "border-amber-300 bg-amber-50"
                          : "border-gray-300 hover:border-amber-500 text-gray-500 hover:text-amber-600"
                      }`}
                    >
                      {thaiIDForm.yellow_plate_photo ? (
                        <>
                          <img
                            src={thaiIDForm.yellow_plate_photo}
                            alt="Yellow plate permit"
                            className="w-full h-full object-cover rounded-lg absolute inset-0"
                          />
                          <div className="absolute inset-0 bg-amber-500/20 rounded-lg flex items-center justify-center">
                            <CheckCircle className="text-amber-700" size={24} />
                          </div>
                        </>
                      ) : thaiIDUploading === "yellow_plate_photo" ? (
                        <Loader2 size={20} className="animate-spin" />
                      ) : (
                        <>
                          <Upload size={20} className="mb-1" />
                          <span className="text-xs">อัปโหลดรูปป้ายเหลือง</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
                    ใบขับขี่สาธารณะ (ด้านหน้า) *
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => ptLicenseFrontRef.current?.click()}
                      disabled={
                        !!thaiIDUploading ||
                        (!canEditKycDocuments(kycDocGate) &&
                          isKycDocVerified(
                            kycDocGate,
                            "public_transport_license",
                          ))
                      }
                      className={`w-full h-24 border-2 border-dashed rounded-lg transition-colors flex flex-col items-center justify-center ${
                        thaiIDForm.public_transport_license_front
                          ? "border-amber-300 bg-amber-50"
                          : "border-gray-300 hover:border-amber-500 text-gray-500 hover:text-amber-600"
                      }`}
                    >
                      {thaiIDForm.public_transport_license_front ? (
                        <>
                          <img
                            src={thaiIDForm.public_transport_license_front}
                            alt="Public transport license front"
                            className="w-full h-full object-cover rounded-lg absolute inset-0"
                          />
                          <div className="absolute inset-0 bg-amber-500/20 rounded-lg flex items-center justify-center">
                            <CheckCircle className="text-amber-700" size={24} />
                          </div>
                        </>
                      ) : thaiIDUploading ===
                        "public_transport_license_front" ? (
                        <Loader2 size={20} className="animate-spin" />
                      ) : (
                        <>
                          <Upload size={20} className="mb-1" />
                          <span className="text-xs">
                            อัปโหลดใบขับขี่สาธารณะ (หน้า)
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
                    ใบขับขี่สาธารณะ (ด้านหลัง)
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => ptLicenseBackRef.current?.click()}
                      disabled={
                        !!thaiIDUploading || !canEditKycDocuments(kycDocGate)
                      }
                      className={`w-full h-24 border-2 border-dashed rounded-lg transition-colors flex flex-col items-center justify-center ${
                        thaiIDForm.public_transport_license_back
                          ? "border-amber-300 bg-amber-50"
                          : "border-gray-300 hover:border-amber-500 text-gray-500 hover:text-amber-600"
                      }`}
                    >
                      {thaiIDForm.public_transport_license_back ? (
                        <>
                          <img
                            src={thaiIDForm.public_transport_license_back}
                            alt="Public transport license back"
                            className="w-full h-full object-cover rounded-lg absolute inset-0"
                          />
                          <div className="absolute inset-0 bg-amber-500/20 rounded-lg flex items-center justify-center">
                            <CheckCircle className="text-amber-700" size={24} />
                          </div>
                        </>
                      ) : thaiIDUploading ===
                        "public_transport_license_back" ? (
                        <Loader2 size={20} className="animate-spin" />
                      ) : (
                        <>
                          <Upload size={20} className="mb-1" />
                          <span className="text-xs">
                            อัปโหลดใบขับขี่สาธารณะ (หลัง)
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={
              !canEditKycDocuments(kycDocGate) ||
              !thaiIDOcrVerified ||
              thaiIDForm.national_id.length !== 13
            }
            className={`w-full py-3 rounded-lg font-bold transition-colors ${
              thaiIDOcrVerified && thaiIDForm.national_id.length === 13
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "bg-gray-300 text-gray-500 cursor-not-allowed"
            }`}
            onClick={async () => {
              try {
                const pending = pendingFilesRef.current;
                let idCardFrontUrl = thaiIDForm.id_card_front;
                let idCardBackUrl = thaiIDForm.id_card_back;
                let driverLicenseUrl = thaiIDForm.driver_license_photo;
                let vehicleRegUrl = thaiIDForm.vehicle_registration_photo;
                let yellowPlateUrl = thaiIDForm.yellow_plate_photo;
                let ptFrontUrl = thaiIDForm.public_transport_license_front;
                let ptBackUrl = thaiIDForm.public_transport_license_back;

                if (pending.id_card_front) {
                  const { url } = await uploadDocumentToSecure(
                    pending.id_card_front,
                    "thai_id_front",
                    token || undefined,
                  );
                  if (!isBlobUrl(url)) idCardFrontUrl = url;
                }
                if (pending.id_card_back) {
                  const { url } = await uploadDocumentToSecure(
                    pending.id_card_back,
                    "thai_id_back",
                    token || undefined,
                  );
                  if (!isBlobUrl(url)) idCardBackUrl = url;
                }
                if (pending.driver_license_photo) {
                  const { url } = await uploadDocumentToSecure(
                    pending.driver_license_photo,
                    "driver_license",
                    token || undefined,
                  );
                  if (!isBlobUrl(url)) driverLicenseUrl = url;
                }
                if (pending.vehicle_registration_photo) {
                  const { url } = await uploadDocumentToSecure(
                    pending.vehicle_registration_photo,
                    "vehicle_registration",
                    token || undefined,
                  );
                  if (!isBlobUrl(url)) vehicleRegUrl = url;
                }
                if (pending.yellow_plate_photo) {
                  const { url } = await uploadDocumentToSecure(
                    pending.yellow_plate_photo,
                    "yellow_plate",
                    token || undefined,
                  );
                  if (!isBlobUrl(url)) yellowPlateUrl = url;
                }
                if (pending.public_transport_license_front) {
                  const { url } = await uploadDocumentToSecure(
                    pending.public_transport_license_front,
                    "public_transport_license_front",
                    token || undefined,
                  );
                  if (!isBlobUrl(url)) ptFrontUrl = url;
                }
                if (pending.public_transport_license_back) {
                  const { url } = await uploadDocumentToSecure(
                    pending.public_transport_license_back,
                    "public_transport_license_back",
                    token || undefined,
                  );
                  if (!isBlobUrl(url)) ptBackUrl = url;
                }

                const payload: Record<string, unknown> = {
                  national_id: thaiIDForm.national_id,
                  id_card_expiry: thaiIDForm.id_card_expiry,
                  driver_license_number: thaiIDForm.driver_license_number,
                  driver_license_expiry: thaiIDForm.driver_license_expiry,
                  vehicle_license_plate: thaiIDForm.vehicle_license_plate,
                };
                if (idCardFrontUrl && !isBlobUrl(idCardFrontUrl))
                  payload.id_card_front_url = idCardFrontUrl;
                if (idCardBackUrl && !isBlobUrl(idCardBackUrl))
                  payload.id_card_back_url = idCardBackUrl;
                if (driverLicenseUrl && !isBlobUrl(driverLicenseUrl))
                  payload.driver_license_photo_url = driverLicenseUrl;
                if (vehicleRegUrl && !isBlobUrl(vehicleRegUrl))
                  payload.vehicle_registration_photo_url = vehicleRegUrl;
                if (thaiIDForm.vehicle_brand)
                  payload.vehicle_brand = thaiIDForm.vehicle_brand;

                const updatedUser = await MockApi.updateProfile(payload as any);
                if (
                  thaiIDForm.id_card_expiry?.trim() ||
                  thaiIDForm.driver_license_expiry?.trim()
                ) {
                  try {
                    await MockApi.syncKycDocumentMeta({
                      idCardExpiryDate: thaiIDForm.id_card_expiry || undefined,
                      driverLicenseExpiry:
                        thaiIDForm.driver_license_expiry || undefined,
                    });
                  } catch (syncErr) {
                    console.warn("syncKycDocumentMeta:", syncErr);
                  }
                }

                const ptActive =
                  thaiIDForm.wants_public_transport ||
                  kycDocGate?.supplementRequired;
                const yellowHttps =
                  yellowPlateUrl && !isBlobUrl(yellowPlateUrl)
                    ? yellowPlateUrl
                    : undefined;
                const ptFrontHttps =
                  ptFrontUrl && !isBlobUrl(ptFrontUrl) ? ptFrontUrl : undefined;
                const ptBackHttps =
                  ptBackUrl && !isBlobUrl(ptBackUrl) ? ptBackUrl : undefined;

                if (ptActive) {
                  if (!yellowHttps || !ptFrontHttps) {
                    notify(
                      "รถสาธารณะ: กรุณาอัปโหลดใบขออนุญาตป้ายเหลืองและใบขับขี่สาธารณะ (หน้า)",
                      "error",
                    );
                    return;
                  }
                  try {
                    if (kycDocGate?.supplementRequired) {
                      await MockApi.submitKycSupplement({
                        yellowPlatePhotoUrl: yellowHttps,
                        publicTransportLicenseFrontUrl: ptFrontHttps,
                        publicTransportLicenseBackUrl: ptBackHttps,
                        requestedDocs: kycSupplementRequest?.requested_docs,
                      });
                    } else {
                      await MockApi.syncKycPublicTransportDocs({
                        wantsPublicTransport: true,
                        yellowPlatePhotoUrl: yellowHttps,
                        publicTransportLicenseFrontUrl: ptFrontHttps,
                        publicTransportLicenseBackUrl: ptBackHttps,
                      });
                    }
                  } catch (ptErr: any) {
                    notify(
                      ptErr?.response?.data?.error ||
                        ptErr?.message ||
                        "บันทึกเอกสารรถสาธารณะไม่สำเร็จ",
                      "error",
                    );
                    return;
                  }
                }

                if (token) login(updatedUser, token);
                notify("✅ บันทึกข้อมูลสำเร็จ", "success");
                handleThaiIDModalClose();
              } catch (error) {
                notify("❌ บันทึกข้อมูลไม่สำเร็จ", "error");
                console.error("Error saving Thai ID:", error);
              }
            }}
          >
            บันทึกข้อมูล
          </button>
        </div>
      </Modal>

      {/* Marine KYC Modal — ใบอนุญาตขับขี่เรือ & ทะเบียนเรือ */}
      <Modal
        isOpen={activeModal === "marine_kyc"}
        onClose={handleMarineKYCModalClose}
        title="Marine Captain (ใบอนุญาตขับขี่เรือ)"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            สำหรับกัปตันเรือที่ต้องการลงทะเบียนใน AQOND Marine
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ใบอนุญาตขับขี่เรือ
            </label>
            <input
              type="file"
              ref={skipperLicenseRef}
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) =>
                handleMarineKYCFileChange("skipper_license_photo", e)
              }
            />
            <button
              type="button"
              onClick={() => skipperLicenseRef.current?.click()}
              className="w-full py-3 rounded-xl border border-gray-200 flex items-center justify-center gap-2 hover:bg-gray-50"
            >
              {marineKYCUploading === "skipper_license_photo" ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <Upload size={20} />
              )}
              {marineKYCForm.skipper_license_photo
                ? "เปลี่ยนรูป"
                : "อัปโหลดรูป"}
            </button>
            {marineKYCForm.skipper_license_photo && (
              <img
                src={marineKYCForm.skipper_license_photo}
                alt="Skipper"
                className="mt-2 w-full max-h-32 object-contain rounded-lg border"
              />
            )}
            <input
              type="text"
              value={marineKYCForm.skipper_license_number}
              onChange={(e) =>
                setMarineKYCForm((p) => ({
                  ...p,
                  skipper_license_number: e.target.value,
                }))
              }
              placeholder="เลขที่ใบอนุญาต"
              className="mt-2 w-full px-4 py-2 rounded-lg border border-gray-200"
            />
            <input
              type="date"
              value={marineKYCForm.skipper_license_expiry}
              onChange={(e) =>
                setMarineKYCForm((p) => ({
                  ...p,
                  skipper_license_expiry: e.target.value,
                }))
              }
              placeholder="วันหมดอายุ"
              className="mt-2 w-full px-4 py-2 rounded-lg border border-gray-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ทะเบียนเรือ / ใบอนุญาตใช้เรือ
            </label>
            <input
              type="file"
              ref={boatRegRef}
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) =>
                handleMarineKYCFileChange("boat_registration_photo", e)
              }
            />
            <button
              type="button"
              onClick={() => boatRegRef.current?.click()}
              className="w-full py-3 rounded-xl border border-gray-200 flex items-center justify-center gap-2 hover:bg-gray-50"
            >
              {marineKYCUploading === "boat_registration_photo" ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <Upload size={20} />
              )}
              {marineKYCForm.boat_registration_photo
                ? "เปลี่ยนรูป"
                : "อัปโหลดรูป"}
            </button>
            {marineKYCForm.boat_registration_photo && (
              <img
                src={marineKYCForm.boat_registration_photo}
                alt="Boat"
                className="mt-2 w-full max-h-32 object-contain rounded-lg border"
              />
            )}
            <input
              type="text"
              value={marineKYCForm.boat_registration_number}
              onChange={(e) =>
                setMarineKYCForm((p) => ({
                  ...p,
                  boat_registration_number: e.target.value,
                }))
              }
              placeholder="เลขทะเบียนเรือ"
              className="mt-2 w-full px-4 py-2 rounded-lg border border-gray-200"
            />
            <input
              type="text"
              value={marineKYCForm.boat_brand}
              onChange={(e) =>
                setMarineKYCForm((p) => ({ ...p, boat_brand: e.target.value }))
              }
              placeholder="ยี่ห้อ/ประเภทเรือ (เช่น Longtail, Speedboat, Yacht)"
              className="mt-2 w-full px-4 py-2 rounded-lg border border-gray-200"
            />
          </div>
          <button
            type="button"
            className="w-full py-3 rounded-xl font-bold text-white"
            style={{ backgroundColor: "#0891b2" }}
            onClick={async () => {
              try {
                const payload: Record<string, unknown> = {
                  skipper_license_number: marineKYCForm.skipper_license_number,
                  skipper_license_expiry:
                    marineKYCForm.skipper_license_expiry || null,
                  boat_registration_number:
                    marineKYCForm.boat_registration_number,
                  boat_brand: marineKYCForm.boat_brand || null,
                };
                const pending = marinePendingFilesRef.current;
                if (pending.skipper_license_photo) {
                  const { url } = await uploadDocumentToSecure(
                    pending.skipper_license_photo,
                    "skipper_license",
                    token || undefined,
                  );
                  if (!isBlobUrl(url)) payload.skipper_license_photo_url = url;
                } else if (
                  marineKYCForm.skipper_license_photo &&
                  !isBlobUrl(marineKYCForm.skipper_license_photo)
                ) {
                  payload.skipper_license_photo_url =
                    marineKYCForm.skipper_license_photo;
                }
                if (pending.boat_registration_photo) {
                  const { url } = await uploadDocumentToSecure(
                    pending.boat_registration_photo,
                    "boat_registration",
                    token || undefined,
                  );
                  if (!isBlobUrl(url))
                    payload.boat_registration_photo_url = url;
                } else if (
                  marineKYCForm.boat_registration_photo &&
                  !isBlobUrl(marineKYCForm.boat_registration_photo)
                ) {
                  payload.boat_registration_photo_url =
                    marineKYCForm.boat_registration_photo;
                }
                const updatedUser = await MockApi.updateProfile(payload as any);
                if (token) login(updatedUser, token);
                notify("✅ บันทึกข้อมูล Marine KYC สำเร็จ", "success");
                handleMarineKYCModalClose();
              } catch (error) {
                notify("❌ บันทึกข้อมูลไม่สำเร็จ", "error");
                console.error("Error saving Marine KYC:", error);
              }
            }}
          >
            บันทึกข้อมูล
          </button>
        </div>
      </Modal>

      {/* About Us Modal */}
      <Modal
        isOpen={activeModal === "about"}
        onClose={() => setActiveModal(null)}
        title={t("settings.about")}
      >
        <div className="text-center space-y-6">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-emerald-200 overflow-hidden bg-white">
            <img
              src="/logo.png"
              alt="AQOND"
              className="w-full h-full object-contain p-1"
            />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              AQOND Applications
            </h2>
            <p className="text-sm text-gray-500">
              People2People Services Platform
            </p>
          </div>

          <div className="bg-emerald-50 p-4 rounded-xl text-left border border-emerald-100">
            <h3 className="font-bold text-emerald-800 text-sm mb-2 flex items-center">
              <Heart size={16} className="mr-2" /> Mission
            </h3>
            <p className="text-emerald-700 text-xs leading-relaxed">
              To connect people with reliable local services and lifestyle
              companions, fostering trust, economic opportunity, and community
              support in a safe environment.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex flex-col items-center">
              <Shield className="text-emerald-500 mb-1" size={20} />
              <span className="text-[10px] font-bold text-gray-600">Trust</span>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex flex-col items-center">
              <Zap className="text-amber-500 mb-1" size={20} />
              <span className="text-[10px] font-bold text-gray-600">Speed</span>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex flex-col items-center">
              <Info className="text-blue-500 mb-1" size={20} />
              <span className="text-[10px] font-bold text-gray-600">
                Support
              </span>
            </div>
          </div>

          <div className="space-y-2 text-left pt-2">
            <div className="flex items-center text-sm text-gray-600">
              <Mail size={16} className="mr-3 text-gray-400" />{" "}
              {mobileAppConfig.remote.complianceSupportEmail?.trim() ? (
                <a
                  href={`mailto:${mobileAppConfig.remote.complianceSupportEmail.trim()}`}
                  className="text-emerald-600 hover:underline"
                >
                  {mobileAppConfig.remote.complianceSupportEmail.trim()}
                </a>
              ) : (
                <a
                  href="mailto:support@aqond.com"
                  className="text-gray-600 hover:underline"
                >
                  support@aqond.com
                </a>
              )}
            </div>
            <div className="flex items-center text-sm text-gray-600">
              <Phone size={16} className="mr-3 text-gray-400" /> +66 2 123 4567
            </div>
            <div className="flex items-center text-sm text-gray-600">
              <MapPin size={16} className="mr-3 text-gray-400" /> Bangkok,
              Thailand
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400">Version 1.1.2</p>
            <p className="text-[10px] text-gray-300 mt-1">
              © 2025 AQOND. All rights reserved.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
};
