import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { MockApi } from "../services/mockApi";
import { listConnections } from "../services/connectionService";
import { consumeTopUpHintAmount } from "../utils/coursePurchasePending";
import { navigateToMarketplace } from "../services/marketplaceHandoff";
import CourseSkillBadgesStrip from "../components/courseMarketplace/CourseSkillBadgesStrip";
import { reverseGeocode } from "../services/geoService";
import { api } from "../services/api";
import {
  getModule2PassedCategories,
  type Module2PassedCategory,
} from "../services/nexusExamService";
import paymentGatewayService, {
  PaymentGateway,
  PaymentStatus as GatewayPaymentStatus,
  MIN_WITHDRAWAL_THB,
} from "../services/paymentGatewayService";
import type { PaymentChannel } from "../services/paymentFeeConfig";
import { recordPaymentCreated } from "../services/ledgerService";
import {
  UserProfile,
  Transaction,
  Review,
  UserRole,
  BankAccount,
  TrainingModule,
  TrainingStatus,
  JobCategory,
  AvailabilitySlot,
} from "../types";
import type {
  WalletDepositCreateResponse,
  WalletDepositManualCreateResponse,
  WalletDepositM1Step,
  WalletDepositPreviewResponse,
  WalletDepositStatusReconcile,
  WalletDepositStatusResponse,
} from "../types/walletDepositContract";
import {
  buildWalletDepositPreviewRows,
  formatDepositAmountThb,
} from "../utils/walletDepositPreviewLabels";
import {
  Shield,
  Car,
  User,
  Phone,
  Mail,
  Camera,
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
  Clock,
  CheckCircle,
  Star,
  Rocket,
  Scan,
  BookOpen,
  PlayCircle,
  Lock,
  ShieldCheck,
  ChevronLeft,
  XCircle,
  Trash2,
  CreditCard,
  Briefcase,
  GraduationCap,
  Award,
  Plus,
  Edit2,
  Loader2,
  FileText,
  X,
  Network,
  Copy,
  MapPin,
  QrCode,
  Eye,
  HelpCircle,
  ChevronDown,
  ChevronRight,
  ClipboardList,
} from "lucide-react";
import { WorkerGradeBadge } from "../components/WorkerGradeBadge";
import { WalletGuideModal } from "../components/WalletGuideModal";
import { WalletDepositM1HeaderStepper } from "../components/wallet/WalletDepositM1HeaderStepper";
import { WalletDepositMethodPicker } from "../components/wallet/WalletDepositMethodPicker";
import { WalletDepositFeeSummaryCard } from "../components/wallet/WalletDepositFeeSummaryCard";
import { WalletDepositCardVisual } from "../components/wallet/WalletDepositCardVisual";
import { ProfileCalendarEmbed } from "../components/ProfileCalendarEmbed";
import { PortfolioExpertTab } from "./profileTabs/PortfolioExpertTab";
import { StoryWorkClipsTab } from "./profileTabs/StoryWorkClipsTab";
import CoursePurchasesTab from "./profileTabs/CoursePurchasesTab";
import {
  kycProfileShowsVerified,
  needsKycDocumentResubmit,
  type KycDocumentVerification,
} from "../utils/kycDocumentGate";

const WALLET_MANUAL_KTB_QR = "/deposit/ktb-promptpay-manual-qr.png";

const EMPTY_BANK_ACCOUNTS: BankAccount[] = [];

function formatPayoutQuoteClientError(e: unknown): string {
  const resp = (
    e as {
      response?: {
        status?: number;
        headers?: unknown;
        data?: {
          error?: string;
          retryAfter?: number;
          resetEpochMs?: number;
        };
      };
    }
  )?.response;
  const status = resp?.status;
  if (status === 429) {
    const resetEp = resp?.data?.resetEpochMs;
    if (
      typeof resetEp === "number" &&
      Number.isFinite(resetEp) &&
      resetEp > Date.now()
    ) {
      const s = Math.ceil((resetEp - Date.now()) / 1000);
      const waitLabel =
        s >= 3600
          ? `ประมาณ ${Math.max(1, Math.round(s / 3600))} ชั่วโมง`
          : s >= 120
            ? `ประมาณ ${Math.max(1, Math.round(s / 60))} นาที`
            : `ประมาณ ${s} วินาที`;
      return `เกินขีดจำกัดการเรียกระบบ — รอ ${waitLabel} แล้วกด 「ลองอีกครั้ง」`;
    }
    const bodyRetry = resp?.data?.retryAfter;
    if (typeof bodyRetry === "number" && bodyRetry > 0) {
      const s = Math.ceil(bodyRetry);
      const waitLabel =
        s >= 3600
          ? `ประมาณ ${Math.max(1, Math.round(s / 3600))} ชั่วโมง`
          : s >= 120
            ? `ประมาณ ${Math.max(1, Math.round(s / 60))} นาที`
            : `ประมาณ ${s} วินาที`;
      return `เรียกคำนวณถี่เกินกำหนด — รอ ${waitLabel} แล้วกด 「ลองอีกครั้ง」`;
    }
    const hdrs = resp?.headers as
      | { get?: (k: string) => string | null | undefined }
      | Record<string, string>
      | undefined;
    let raw: string | undefined;
    if (
      hdrs &&
      typeof (hdrs as { get?: (k: string) => unknown }).get === "function"
    ) {
      const getter = (hdrs as { get: (k: string) => unknown }).get;
      raw =
        String(
          getter.call(hdrs, "retry-after") ??
            getter.call(hdrs, "Retry-After") ??
            "",
        ) || undefined;
    } else if (hdrs && typeof hdrs === "object") {
      const o = hdrs as Record<string, string>;
      raw = o["retry-after"] ?? o["Retry-After"];
    }
    const sec = raw != null ? parseInt(String(raw), 10) : NaN;
    if (Number.isFinite(sec) && sec > 0) {
      const s = Math.ceil(sec);
      const waitLabel =
        s >= 3600
          ? `ประมาณ ${Math.max(1, Math.round(s / 3600))} ชั่วโมง`
          : s >= 120
            ? `ประมาณ ${Math.max(1, Math.round(s / 60))} นาที`
            : `ประมาณ ${s} วินาที`;
      return `เรียกคำนวณถี่เกินกำหนด — รอ ${waitLabel} แล้วกด 「ลองอีกครั้ง」`;
    }
    return "เรียกคำนวณถี่เกินกำหนด — รอสักครู่ แล้วกด 「ลองอีกครั้ง」";
  }
  const axiosErr = e as { response?: { data?: { error?: string } } };
  const msg = axiosErr.response?.data?.error;
  if (typeof msg === "string" && msg.trim()) return msg.trim();
  if (e instanceof Error && e.message) return e.message;
  return "ไม่สามารถประมาณการค่าธรรมเนียมได้ กรุณาลองใหม่";
}

function throttleErrorLikeMessage(msg: string): boolean {
  return /เรียกคำนวณถี่|เกินขีด|ถี่เกิน|ถึงจำนวน|คำขอถอนในช่วง|ถึงขีดจำกัด|ถึงจำกัด|Too many|rate limit|limit reached|\b429\b/i.test(
    msg,
  );
}

function mergeThrottleEndsAt(
  prev: number | null,
  next: number | null,
): number | null {
  if (next == null || !Number.isFinite(next)) return prev;
  if (prev == null || !Number.isFinite(prev)) return next;
  return Math.max(prev, next);
}

/** epoch ms เมื่อ rate limit พ้นจาก response ของ 429 */
function extract429ThrottleEndsAtMs(e: unknown): number | null {
  const r = (
    e as {
      response?: {
        status?: number;
        data?: { retryAfter?: number; resetEpochMs?: number };
        headers?: unknown;
      };
    }
  ).response;
  if (!r || r.status !== 429) return null;
  const d = r.data;
  if (
    typeof d?.resetEpochMs === "number" &&
    Number.isFinite(d.resetEpochMs) &&
    d.resetEpochMs > Date.now() - 1000 * 3600 * 48
  ) {
    return d.resetEpochMs;
  }
  if (typeof d?.retryAfter === "number" && d.retryAfter > 0) {
    return Date.now() + d.retryAfter * 1000;
  }
  const hdrs = r.headers as
    | { get?: (k: string) => unknown }
    | Record<string, string>
    | undefined;
  let raw: string | undefined;
  if (
    hdrs &&
    typeof (hdrs as { get?: (k: string) => unknown }).get === "function"
  ) {
    const getter = (hdrs as { get: (k: string) => unknown }).get;
    raw =
      String(
        getter.call(hdrs, "retry-after") ??
          getter.call(hdrs, "Retry-After") ??
          "",
      ) || undefined;
  } else if (hdrs && typeof hdrs === "object") {
    const o = hdrs as Record<string, string>;
    raw = o["retry-after"] ?? o["Retry-After"];
  }
  const sec = raw != null ? parseInt(String(raw), 10) : NaN;
  if (Number.isFinite(sec) && sec > 0) return Date.now() + sec * 1000;
  return null;
}

function formatHmsCountdown(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (hh > 0) return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
  return `${pad(mm)}:${pad(ss)}`;
}

const PROFILE_AGENT_LOG_URL =
  "http://127.0.0.1:7638/ingest/0fd4d8e7-61a2-4558-83aa-540c669e45fd";
const PROFILE_AGENT_LOG_SESSION_ID = "1d8d58";

type ProfileAgentLogPayload = {
  hypothesisId: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
};

function isProfileAgentLogEnabled(): boolean {
  const env =
    typeof import.meta !== "undefined" ? (import.meta as any).env : null;
  return String(env?.VITE_PROFILE_AGENT_LOG || "").trim() === "1";
}

function profileAgentLog(payload: ProfileAgentLogPayload) {
  if (!isProfileAgentLogEnabled()) return;
  fetch(PROFILE_AGENT_LOG_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": PROFILE_AGENT_LOG_SESSION_ID,
    },
    body: JSON.stringify({
      sessionId: PROFILE_AGENT_LOG_SESSION_ID,
      runId: "m1-smoke",
      hypothesisId: payload.hypothesisId,
      location: payload.location,
      message: payload.message,
      data: payload.data || {},
      timestamp: Date.now(),
    }),
  }).catch(() => {});
}

type PaysoAnalyticsEvent =
  | "deposit_payso_step"
  | "deposit_payso_reconcile_error_code";

function trackPaysoDepositEvent(
  event: PaysoAnalyticsEvent,
  data: Record<string, unknown> = {},
) {
  profileAgentLog({
    hypothesisId:
      event === "deposit_payso_step" ? "UX_PAYSO_STEP" : "UX_PAYSO_RECONCILE",
    location: "mobile/pages/Profile.tsx:paysoDepositUx",
    message: event,
    // Keep payload intentionally small and free of user identifiers / raw gateway payloads.
    data,
  });
}

const PAYSO_UX_TEXT = {
  statusTitle: "สถานะการเติมเงิน",
  paysoQrTitle: "PromptPay QR (PaySo)",
  paysoQrSubtitle: "QR นี้ออกโดย Pay Solutions (PaySo) — สแกนจ่ายผ่านแอปธนาคาร",
  webhookCopy:
    "เมื่อธนาคารยืนยันการโอน ระบบจะรับแจ้งจาก PaySo อัตโนมัติ — การตรวจสอบซ้ำด้านล่างเป็นเส้นทางสำรอง",
  checkingPayment: "กำลังรอการชำระเงิน...",
  manualRetry: "ตรวจสอบอีกครั้ง",
  copyReference: "คัดลอกเลขอ้างอิง",
  copiedReference: "คัดลอกเลขอ้างอิงแล้ว",
  supportReference: "เลขอ้างอิง (แจ้งทีมงาน)",
  safeRetryCopy: "กดตรวจสอบซ้ำได้เมื่อระบบช้า — ไม่ทำให้เสียเงินซ้ำ",
  autoTimeoutTitle: "ยังไม่ได้รับการยืนยันครบภายในเวลาตรวจอัตโนมัติ",
  autoTimeoutBody:
    "คุณยังสแกนจ่ายหรือกดตรวจสอบอีกครั้งได้ — หากโอนแล้วยอดจะเข้าเมื่อระบบยืนยัน",
  closeToWalletHistory: "ปิดและดูประวัติวอลเล็ต",
  gatewayAutoConfirmTitle: "ไม่ต้องแนบสลิปสำหรับ PaySo",
  gatewayAutoConfirmBody:
    "ระบบจะยืนยันผลจาก payment gateway/webhook อัตโนมัติ เมื่อยืนยันสำเร็จยอดจะเข้าวอลเล็ตทันที",
  successTitle: "เติมเงินสำเร็จแล้ว",
  successCountdown: (seconds: number) =>
    `ระบบจะอัปเดตเครดิตและปิดหน้าต่างอัตโนมัติใน ${seconds} วินาที`,
  softTimeoutNotify:
    "หมดเวลาตรวจสอบอัตโนมัติ — คุณยังสแกนจ่ายหรือกดตรวจสอบอีกครั้งได้ หากจ่ายแล้วยอดจะเข้าเมื่อระบบยืนยัน",
  copiedAmount: "คัดลอกยอดเงินแล้ว",
  savedQr: "บันทึก QR Code แล้ว",
  retryTooSoon: "รอสักครู่ก่อนลองใหม่",
  authExpired:
    "สิทธิ์เข้าถึงหมดอายุหรือถูกปฏิเสธ — ลองเข้าสู่ระบบใหม่ หรือกดลองอีกครั้งด้านล่าง",
  serverTemporary: "เซิร์ฟเวอร์ชั่วคราวไม่พร้อม — ลองอีกครั้งในอีกสักครู่",
  networkTemporary: "เชื่อมต่อไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง",
} as const;

const PAYSO_STEPPER_LABELS = [
  "สร้าง QR แล้ว",
  "รอชำระจากธนาคาร",
  "กำลังยืนยันกับผู้ให้บริการ",
  "เติมเงินสำเร็จ",
] as const;

type PaysoReconcileNoticeCode =
  | "awaiting_bank"
  | "status_auth_failed"
  | "status_endpoint_missing"
  | "status_endpoint_wrong_path"
  | "status_upstream_error"
  | "credit_failed";

const PAYSO_RECONCILE_NOTICE: Record<
  PaysoReconcileNoticeCode,
  { tone: "info" | "warning" | "danger"; title: string; body: string }
> = {
  awaiting_bank: {
    tone: "info",
    title: "ยังรอผลชำระจากธนาคาร",
    body: "หากคุณเพิ่งสแกนจ่าย ระบบอาจต้องใช้เวลาสั้นๆ เพื่อรับผลยืนยันจากธนาคาร",
  },
  status_auth_failed: {
    tone: "danger",
    title: "ระบบยังไม่ได้รับสิทธิ์เช็คสถานะจาก PaySo",
    body: "รายการนี้ยังปลอดภัยและมีเลขอ้างอิงแล้ว แต่ระบบต้องตั้งค่า Inquiry API credential ให้ถูกต้องก่อนจึงจะยืนยันยอดได้",
  },
  status_endpoint_missing: {
    tone: "warning",
    title: "ระบบตรวจสอบกับผู้ให้บริการยังไม่พร้อม",
    body: "ถ้าจ่ายแล้วเงินจะเข้าอัตโนมัติเมื่อระบบยืนยันได้ — เก็บเลขอ้างอิงไว้ติดต่อทีมงานหากยอดยังไม่เข้า",
  },
  status_endpoint_wrong_path: {
    tone: "warning",
    title: "ระบบตรวจสอบกับผู้ให้บริการชั่วคราวไม่สำเร็จ",
    body: "ถ้าจ่ายแล้วเงินจะเข้าอัตโนมัติเมื่อระบบยืนยันได้ — เก็บเลขอ้างอิงไว้ติดต่อทีมงานหากยอดยังไม่เข้า",
  },
  status_upstream_error: {
    tone: "warning",
    title: "ผู้ให้บริการชำระเงินยังตอบกลับไม่สมบูรณ์",
    body: "ถ้าจ่ายแล้วเงินจะเข้าอัตโนมัติเมื่อระบบยืนยันได้ — คุณกดตรวจสอบอีกครั้งได้โดยไม่เสียเงินซ้ำ",
  },
  credit_failed: {
    tone: "danger",
    title: "ยืนยันชำระแล้ว แต่เครดิตวอลเล็ตมีปัญหา",
    body: "กรุณาเก็บเลขอ้างอิงไว้ ทีมงานสามารถใช้ตรวจสอบและเครดิตรายการนี้ได้",
  },
};

import { videoService } from "../services/videoService";
import FirebaseApi from "../services/firebase";
import {
  gradeService,
  type GradeData,
  type ReviewStats,
} from "../services/gradeService";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { VIPBadge } from "../components/VIPBadge";
import { UserDisplayBadge } from "../components/UserDisplayBadge";
import {
  BrandAdviserBadge,
  BrandAdviserSuspendBanner,
  BrandAdviserProgramOffNotice,
  BrandAdviserReputationHint,
} from "../components/BrandAdviserBadge";
import { formatDateThaiShort } from "../utils/dateFormat";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
// --- TAX DOCUMENTS SECTION ---
const TaxDocumentsSection: React.FC<{
  api: {
    get: (url: string, config?: any) => Promise<{ data: any }>;
    post: (url: string, body?: any) => Promise<{ data: any }>;
  };
  notify: (msg: string, type: "success" | "error" | "info") => void;
  user: UserProfile | null;
  profile: UserProfile | null;
  onRefresh?: () => Promise<void>;
}> = ({ api, notify, user, profile, onRefresh }) => {
  const [documents, setDocuments] = useState<
    Array<{
      id: string;
      type: string;
      document_type?: string;
      document_no?: string | null;
      status?: string;
      amount: number;
      vat_amount?: number;
      bill_no?: string | null;
      tax_ref_id?: string | null;
      pdf_url?: string | null;
      created_at: string;
    }>
  >([]);
  const [statements, setStatements] = useState<
    Array<{
      id: string;
      period_from: string;
      period_to: string;
      fee_amount: number;
      status: string;
      qr_verification_code?: string;
      pdf_url?: string | null;
      created_at: string;
    }>
  >([]);
  const [month, setMonth] = useState<string>(
    String(new Date().getMonth() + 1).padStart(2, "0"),
  );
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [loading, setLoading] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [taxProfileSaving, setTaxProfileSaving] = useState(false);
  const [taxProfile, setTaxProfile] = useState<any>(null);
  const [taxProfileDraft, setTaxProfileDraft] = useState({
    legal_name: "",
    tax_id: "",
    tax_entity_type: "individual",
    registered_address: "",
    branch_code: "",
    branch_name: "",
    country: "TH",
    email: profile?.email || user?.email || "",
    phone_optional: "",
  });

  const loadTaxDocs = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(
        `/wallet/tax-documents?month=${month}&year=${year}`,
      );
      setDocuments(data?.documents || []);
      setStatements(data?.statements || []);
      try {
        const taxRes = await api.get("/tax/profile/me");
        const p = taxRes.data?.profile || null;
        setTaxProfile(p);
        if (p) {
          setTaxProfileDraft({
            legal_name: p.legal_name || profile?.name || user?.name || "",
            tax_id: p.tax_id || "",
            tax_entity_type: p.tax_entity_type || "individual",
            registered_address: p.registered_address || "",
            branch_code: p.branch_code || "",
            branch_name: p.branch_name || "",
            country: p.country || "TH",
            email: p.email || profile?.email || user?.email || "",
            phone_optional: p.phone_optional || "",
          });
        }
      } catch {
        setTaxProfile(null);
      }
    } catch {
      setDocuments([]);
      setStatements([]);
    } finally {
      setLoading(false);
    }
  }, [
    api,
    month,
    year,
    profile?.email,
    profile?.name,
    user?.email,
    user?.name,
  ]);

  useEffect(() => {
    loadTaxDocs();
  }, [loadTaxDocs]);

  const handleRequestStatement = async () => {
    const from = `${year}-${month}-01`;
    const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
    const to = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
    if (
      !confirm(
        `ขอใบรับรองรายได้ ${month}/${year} — ค่าธรรมเนียม 50 บาท จะถูกหักจากกระเป๋า ต้องการดำเนินการต่อ?`,
      )
    )
      return;
    setRequesting(true);
    try {
      const { data } = await api.post("/wallet/request-certified-statement", {
        period_from: from,
        period_to: to,
      });
      notify(data?.message || "ขอใบรับรองสำเร็จ", "success");
      loadTaxDocs();
      await onRefresh?.();
      if (data?.pdf_url) {
        notify("กดดาวน์โหลด PDF ได้จากรายการด้านล่าง", "info");
      }
    } catch (e: any) {
      notify(
        e?.response?.data?.error || e?.message || "ขอใบรับรองไม่สำเร็จ",
        "error",
      );
    } finally {
      setRequesting(false);
    }
  };

  const saveTaxProfile = async () => {
    setTaxProfileSaving(true);
    try {
      const { data } = await api.post("/tax/profile/me", taxProfileDraft);
      setTaxProfile(data?.profile || null);
      notify("บันทึกข้อมูลภาษีแล้ว ฝ่ายบัญชีจะตรวจสอบก่อนออกเอกสาร", "success");
    } catch (e: any) {
      notify(
        e?.response?.data?.error || e?.message || "บันทึกข้อมูลภาษีไม่สำเร็จ",
        "error",
      );
    } finally {
      setTaxProfileSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-emerald-900">
              ข้อมูลภาษีสำหรับขอใบกำกับภาษี
            </p>
            <p className="text-xs text-emerald-800">
              กรอกเมื่อคุณต้องการ Tax Invoice / ใบกำกับภาษี
              ข้อมูลนี้ไม่กระทบการใช้งานปกติของวอลเล็ต
            </p>
          </div>
          <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-emerald-700">
            {taxProfile?.verified_status || "ยังไม่ส่งข้อมูล"}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            className="px-3 py-2 border border-emerald-100 rounded-lg text-sm"
            placeholder="ชื่อกฎหมาย / Legal name"
            value={taxProfileDraft.legal_name}
            onChange={(e) =>
              setTaxProfileDraft((p) => ({ ...p, legal_name: e.target.value }))
            }
          />
          <input
            className="px-3 py-2 border border-emerald-100 rounded-lg text-sm font-mono"
            placeholder="เลขประจำตัวผู้เสียภาษี / Tax ID"
            value={taxProfileDraft.tax_id}
            onChange={(e) =>
              setTaxProfileDraft((p) => ({ ...p, tax_id: e.target.value }))
            }
          />
          <select
            className="px-3 py-2 border border-emerald-100 rounded-lg text-sm"
            value={taxProfileDraft.tax_entity_type}
            onChange={(e) =>
              setTaxProfileDraft((p) => ({
                ...p,
                tax_entity_type: e.target.value,
              }))
            }
          >
            <option value="individual">บุคคลธรรมดา</option>
            <option value="company">บริษัท/นิติบุคคล</option>
            <option value="foreign">ต่างประเทศ</option>
          </select>
          <input
            className="px-3 py-2 border border-emerald-100 rounded-lg text-sm"
            placeholder="อีเมลสำหรับเอกสาร"
            value={taxProfileDraft.email}
            onChange={(e) =>
              setTaxProfileDraft((p) => ({ ...p, email: e.target.value }))
            }
          />
          <input
            className="px-3 py-2 border border-emerald-100 rounded-lg text-sm"
            placeholder="รหัสสาขา (ถ้ามี)"
            value={taxProfileDraft.branch_code}
            onChange={(e) =>
              setTaxProfileDraft((p) => ({ ...p, branch_code: e.target.value }))
            }
          />
          <input
            className="px-3 py-2 border border-emerald-100 rounded-lg text-sm"
            placeholder="ชื่อสาขา (ถ้ามี)"
            value={taxProfileDraft.branch_name}
            onChange={(e) =>
              setTaxProfileDraft((p) => ({ ...p, branch_name: e.target.value }))
            }
          />
        </div>
        <textarea
          className="w-full px-3 py-2 border border-emerald-100 rounded-lg text-sm min-h-20"
          placeholder="ที่อยู่จดทะเบียนสำหรับเอกสารภาษี"
          value={taxProfileDraft.registered_address}
          onChange={(e) =>
            setTaxProfileDraft((p) => ({
              ...p,
              registered_address: e.target.value,
            }))
          }
        />
        <button
          type="button"
          onClick={saveTaxProfile}
          disabled={taxProfileSaving}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {taxProfileSaving ? "กำลังบันทึก..." : "บันทึกข้อมูลภาษี"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
        >
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
            <option key={m} value={String(m).padStart(2, "0")}>
              {m}
            </option>
          ))}
        </select>
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
        >
          {[
            new Date().getFullYear(),
            new Date().getFullYear() - 1,
            new Date().getFullYear() - 2,
          ].map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>
        <button
          onClick={loadTaxDocs}
          disabled={loading}
          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {loading ? "โหลด..." : "กรอง"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleRequestStatement}
          disabled={requesting || (profile?.wallet_balance ?? 0) < 50}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
        >
          <QrCode size={16} />
          {requesting ? "กำลังดำเนินการ..." : "ขอใบรับรองรายได้ (50 บาท)"}
        </button>
      </div>
      <p className="text-xs text-amber-600">
        ค่าธรรมเนียม 25–100 บาท ต่อใบ — หักจากกระเป๋า
      </p>
      {documents.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">ใบเสร็จ/รายการ</p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {documents.map((d) => (
              <div
                key={d.id}
                className="flex justify-between items-center gap-3 py-2 px-3 bg-gray-50 rounded-lg text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium text-gray-800">
                    {(d.document_type || d.type) === "credit_note"
                      ? "Credit Note"
                      : "Tax Invoice"}{" "}
                    · ฿{d.amount.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {d.document_no || d.tax_ref_id || d.bill_no || d.id}
                    {typeof d.vat_amount === "number" && d.vat_amount > 0
                      ? ` · VAT ฿${d.vat_amount.toLocaleString()}`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {d.pdf_url ? (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const { data } = await api.get(
                            d.pdf_url!.replace(/^https?:\/\/[^/]+/, ""),
                            { responseType: "blob" },
                          );
                          const url = URL.createObjectURL(data);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `${d.document_type || "tax-invoice"}-${d.document_no || d.id}.pdf`;
                          a.click();
                          URL.revokeObjectURL(url);
                        } catch {
                          notify("ดาวน์โหลด Tax Invoice ไม่สำเร็จ", "error");
                        }
                      }}
                      className="text-xs px-2 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700"
                    >
                      ดาวน์โหลด PDF
                    </button>
                  ) : (
                    <span className="text-xs text-amber-600">
                      รอฝ่ายบัญชีออกเอกสาร
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {statements.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">ใบรับรองที่ขอแล้ว</p>
          <div className="space-y-1">
            {statements.map((s) => (
              <div
                key={s.id}
                className="flex justify-between items-center py-2 px-3 bg-emerald-50 rounded-lg text-sm"
              >
                <span>
                  {s.period_from} – {s.period_to} · ฿{s.fee_amount}
                </span>
                <div className="flex items-center gap-2">
                  {s.pdf_url && (
                    <button
                      onClick={async () => {
                        try {
                          const { data } = await api.get(
                            `/wallet/certified-statement/${s.id}/pdf`,
                            { responseType: "blob" },
                          );
                          const url = URL.createObjectURL(data);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `certified-statement-${s.period_from}-${s.period_to}.pdf`;
                          a.click();
                          URL.revokeObjectURL(url);
                        } catch (e) {
                          notify("ดาวน์โหลดไม่สำเร็จ", "error");
                        }
                      }}
                      className="text-xs px-2 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700"
                    >
                      ดาวน์โหลด PDF
                    </button>
                  )}
                  <span className="text-xs text-emerald-600">
                    {s.qr_verification_code ? "มี QR" : s.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// --- TRAINING COMPONENTS ---

const CourseView: React.FC<{
  course: TrainingModule;
  onStartQuiz: (id: string) => void;
  onBack: () => void;
}> = ({ course, onStartQuiz, onBack }) => (
  <div className="space-y-4 animate-in fade-in">
    <div className="flex items-center space-x-2 mb-4">
      <button
        onClick={onBack}
        className="text-gray-500 hover:text-gray-700 transition-colors"
      >
        <ChevronLeft size={20} />
      </button>
      <h2 className="text-2xl font-bold">{course.name}</h2>
    </div>
    <p className="text-gray-600">{course.description}</p>

    <div className="aspect-video bg-black rounded-lg overflow-hidden shadow-lg relative group">
      {course.videoUrl ? (
        <iframe
          className="w-full h-full"
          src={course.videoUrl}
          title={course.name}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        ></iframe>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-500">
          Video Placeholder
        </div>
      )}
    </div>

    <div className="flex justify-end pt-4">
      <button
        onClick={() => onStartQuiz(course.id)}
        disabled={!course.quiz || course.quiz.length === 0}
        className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <BookOpen size={20} className="mr-2" /> Start Quiz (
        {course.quiz?.length || 0} Qs)
      </button>
    </div>
  </div>
);

const Quiz: React.FC<{
  course: TrainingModule;
  onQuizComplete: (score: number) => void;
  onCancel: () => void;
}> = ({ course, onQuizComplete, onCancel }) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<{ [key: string]: number }>({});
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);

  const question = course.quiz?.[currentQuestionIndex];
  const totalQuestions = course.quiz?.length || 0;

  const handleAnswer = (questionId: string, selectedIndex: number) => {
    setAnswers((prev) => ({ ...prev, [questionId]: selectedIndex }));
  };

  const calculateScore = () => {
    let correctCount = 0;
    course.quiz?.forEach((q) => {
      if (answers[q.id] === q.correctAnswerIndex) {
        correctCount++;
      }
    });
    const finalScore = Math.round((correctCount / totalQuestions) * 100);
    setScore(finalScore);
    setShowResult(true);
  };

  if (showResult) {
    const isPassed = score >= (course.passingScore || 80);
    return (
      <div className="bg-white p-8 rounded-xl shadow-lg text-center space-y-6 animate-in zoom-in-95">
        <h2 className="text-3xl font-bold">Quiz Result</h2>
        <div
          className={`p-6 rounded-xl text-lg font-semibold border-2 ${
            isPassed
              ? "bg-green-50 border-green-200 text-green-700"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          <div className="flex justify-center mb-2">
            {isPassed ? <CheckCircle size={48} /> : <XCircle size={48} />}
          </div>
          Your Score: {score}% ({isPassed ? "Passed" : "Failed"})
        </div>
        <p className="text-gray-600">
          Required: {course.passingScore}% | Correct:{" "}
          {Math.round((score / 100) * totalQuestions)}/{totalQuestions}
        </p>
        {isPassed ? (
          <button
            onClick={() => onQuizComplete(score)}
            className="w-full px-6 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition shadow-lg shadow-indigo-200"
          >
            Complete Training & Unlock Skill
          </button>
        ) : (
          <button
            onClick={onCancel}
            className="w-full px-6 py-3 bg-gray-500 text-white font-bold rounded-lg hover:bg-gray-600 transition"
          >
            Try Again Later
          </button>
        )}
      </div>
    );
  }

  if (!question) return <div>No questions available.</div>;

  return (
    <div className="bg-white p-6 rounded-xl shadow-lg space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center border-b pb-4">
        <h2 className="text-xl font-bold text-gray-800">{course.name} Quiz</h2>
        <span className="text-sm font-medium bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full">
          Q {currentQuestionIndex + 1} / {totalQuestions}
        </span>
      </div>

      <p className="text-gray-800 text-lg font-medium leading-relaxed">
        {question.question}
      </p>

      <div className="space-y-3">
        {question.options.map((option, index) => (
          <button
            key={index}
            onClick={() => handleAnswer(question.id, index)}
            className={`w-full text-left p-4 border-2 rounded-xl transition-all ${
              answers[question.id] === index
                ? "bg-indigo-50 border-indigo-500 text-indigo-700 ring-1 ring-indigo-500"
                : "bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            <span className="font-bold mr-2">
              {String.fromCharCode(65 + index)}.
            </span>{" "}
            {option}
          </button>
        ))}
      </div>

      <div className="flex justify-between pt-6 border-t mt-6">
        <button
          onClick={() =>
            setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))
          }
          disabled={currentQuestionIndex === 0}
          className="px-4 py-2 text-gray-500 hover:text-gray-700 disabled:opacity-30 font-medium"
        >
          Previous
        </button>

        {currentQuestionIndex < totalQuestions - 1 ? (
          <button
            onClick={() => setCurrentQuestionIndex((prev) => prev + 1)}
            disabled={answers[question.id] === undefined}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            Next
          </button>
        ) : (
          <button
            onClick={calculateScore}
            disabled={answers[question.id] === undefined}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-bold shadow-lg shadow-green-200"
          >
            Submit Quiz
          </button>
        )}
      </div>
    </div>
  );
};

/** ข้อความเมื่อ getCurrentPosition ล้มเหลว — ช่วยให้ผู้ใช้แก้สิทธิ์/GPS/เครือข่าย */
function formatGeolocationFailure(
  language: string,
  err: GeolocationPositionError,
): string {
  const en = language === "en";
  if (err.code === err.PERMISSION_DENIED) {
    return en
      ? "Location blocked — allow it via the lock icon in the address bar, or enter coordinates below."
      : "ถูกปฏิเสธการเข้าถึงตำแหน่ง — คลิกไอคอนแม่กุญแจข้าง URL แล้วอนุญาต หรือกรอกพิกัดในช่องด้านล่าง";
  }
  if (err.code === err.TIMEOUT) {
    return en
      ? "Location request timed out — try again, or open the app on a phone with GPS."
      : "หมดเวลารอพิกัด — ลองกดอีกครั้ง หรือใช้บนมือถือที่เปิด GPS";
  }
  if (err.code === err.POSITION_UNAVAILABLE) {
    return en
      ? "Current position unavailable — check GPS/network, or try Chrome DevTools → Sensors to set a location."
      : "ไม่ได้รับพิกัด — เปิด GPS/เครือข่าย หรือใน DevTools เลือก Sensors กำหนดตำแหน่งทดสอบ";
  }
  return en
    ? "Could not get your location — check permissions and connection."
    : "ไม่สามารถระบุตำแหน่งได้ — ตรวจสอบสิทธิ์และการเชื่อมต่อ";
}

// ── Provider: สวิตซ์รับงาน + ที่อยู่ + ปักหมุด ─────────────────────────────
const ProviderAvailabilityBlock: React.FC<{
  profile: UserProfile | null;
  onUpdate: () => void;
  notify: (msg: string, type: "success" | "error" | "info") => void;
}> = ({ profile, onUpdate, notify }) => {
  const { language } = useLanguage();
  const [available, setAvailable] = useState(
    !!(profile as any)?.provider_available,
  );
  const [residentialAddress, setResidentialAddress] = useState(
    (profile as any)?.residential_address || "",
  );
  const [saving, setSaving] = useState(false);
  const [pinnedLocation, setPinnedLocation] = useState<{
    lat: number;
    lng: number;
    address?: string;
  } | null>(() => {
    const loc = (profile as any)?.location;
    if (loc && typeof loc === "object" && loc.lat != null && loc.lng != null) {
      return { lat: loc.lat, lng: loc.lng, address: loc.address };
    }
    return null;
  });
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  useEffect(() => {
    const loc = (profile as any)?.location;
    if (loc && typeof loc === "object" && loc.lat != null && loc.lng != null) {
      setPinnedLocation({ lat: loc.lat, lng: loc.lng, address: loc.address });
      setManualLat(String(loc.lat));
      setManualLng(String(loc.lng));
    }
  }, [profile]);

  const toggleAvailability = async () => {
    setSaving(true);
    try {
      const res = await MockApi.setProviderAvailability(!available);
      if (res.success) {
        setAvailable(!!res.provider_available);
        notify(
          res.provider_available ? "เปิดรับงานแล้ว" : "ปิดรับงานแล้ว",
          "success",
        );
        onUpdate();
      } else {
        notify("ไม่สามารถเปลี่ยนสถานะได้", "error");
      }
    } catch (_) {
      notify("เกิดข้อผิดพลาด", "error");
    } finally {
      setSaving(false);
    }
  };

  const saveAddress = async () => {
    setSaving(true);
    try {
      const res = await MockApi.setResidentialAddress(residentialAddress);
      if (res.success) {
        notify("บันทึกที่อยู่แล้ว", "success");
        onUpdate();
      } else {
        notify("บันทึกไม่สำเร็จ", "error");
      }
    } catch (_) {
      notify("เกิดข้อผิดพลาด", "error");
    } finally {
      setSaving(false);
    }
  };

  const parseManualCoords = (): { lat: number; lng: number } | null => {
    const lat = Number.parseFloat(manualLat.replace(",", ".").trim());
    const lng = Number.parseFloat(manualLng.replace(",", ".").trim());
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng };
  };

  type PinPersistSource = "gps" | "manual" | "manual_fallback";

  /** ปักหมุดจาก GPS / ฟอร์ม และ reverse geocode เป็นที่อยู่เมื่อเป็นไปได้ */
  const persistPinLatLng = async (
    lat: number,
    lng: number,
    source: PinPersistSource = "gps",
  ): Promise<boolean> => {
    let displayAddress = "";
    try {
      const rev = await reverseGeocode(lat, lng);
      if (rev) displayAddress = rev;
    } catch {
      /* ถ้าดึงที่อยู่ไม่ได้ ยังบันทึกพิกัดได้ */
    }
    displayAddress = displayAddress.slice(0, 500);
    const res = await MockApi.pinProviderLocation(
      lat,
      lng,
      displayAddress.trim() ? displayAddress : undefined,
    );
    if (res.success) {
      setPinnedLocation({
        lat,
        lng,
        address: displayAddress.trim() ? displayAddress : undefined,
      });
      setManualLat(String(lat));
      setManualLng(String(lng));
      if (source === "manual_fallback") {
        notify(
          language === "en"
            ? "Saved from the coordinates you entered (browser GPS was unavailable or denied)."
            : "บันทึกจากพิกัดที่คุณกรอกแล้ว (เบราว์เซอร์ไม่อนุญาต GPS หรือไม่ได้รับพิกัด)",
          "success",
        );
      } else {
        notify(
          language === "en"
            ? "Location saved — nearby jobs can find you."
            : "ปักหมุดตำแหน่งแล้ว — งานใกล้เคียงจะเห็นคุณ",
          "success",
        );
      }
      onUpdate();
      return true;
    }
    notify(
      res.error ||
        (language === "en" ? "Could not save location." : "ปักหมุดไม่สำเร็จ"),
      "error",
    );
    return false;
  };

  const pinManualCoordinates = () => {
    const c = parseManualCoords();
    if (!c) {
      notify(
        language === "en"
          ? "Enter valid latitude and longitude."
          : "กรุณากรอกละติจูดและลองจิจูดให้ถูกต้อง",
        "info",
      );
      return;
    }
    setSaving(true);
    void (async () => {
      try {
        await persistPinLatLng(c.lat, c.lng, "manual");
      } catch (_) {
        notify(
          language === "en" ? "Something went wrong." : "เกิดข้อผิดพลาด",
          "error",
        );
      } finally {
        setSaving(false);
      }
    })();
  };

  const pinCurrentLocation = () => {
    if (typeof window === "undefined") return;

    const host = (window.location.hostname || "").toLowerCase();
    const isLocal =
      host === "localhost" || host === "127.0.0.1" || host === "[::1]";

    const tryPersistFromManualFields = (): Promise<boolean> => {
      const c = parseManualCoords();
      if (!c) return Promise.resolve(false);
      return persistPinLatLng(c.lat, c.lng, "manual_fallback");
    };

    void (async () => {
      if (!navigator.geolocation) {
        setSaving(true);
        try {
          if (!(await tryPersistFromManualFields())) {
            notify(
              language === "en"
                ? "This browser does not support GPS. Enter latitude/longitude below, then tap Save."
                : "เบราว์เซอร์นี้ไม่มี GPS — กรอกละติจูด/ลองจิจูดด้านล่างแล้วกดบันทึก",
              "info",
            );
          }
        } finally {
          setSaving(false);
        }
        return;
      }

      if (!window.isSecureContext && !isLocal) {
        setSaving(true);
        try {
          if (!(await tryPersistFromManualFields())) {
            notify(
              language === "en"
                ? "HTTPS is required for browser GPS. Enter coordinates below to pin your location."
                : "เปิดผ่าน HTTPS ถึงจะใช้ GPS จากเบราว์เซอร์ได้ — กรอกพิกัดด้านล่างเพื่อปักหมุด",
              "info",
            );
          }
        } finally {
          setSaving(false);
        }
        return;
      }

      setSaving(true);

      const applyPosition = (pos: GeolocationPosition) => {
        void (async () => {
          try {
            await persistPinLatLng(
              pos.coords.latitude,
              pos.coords.longitude,
              "gps",
            );
          } catch (_) {
            notify(
              language === "en" ? "Something went wrong." : "เกิดข้อผิดพลาด",
              "error",
            );
          } finally {
            setSaving(false);
          }
        })();
      };

      const onFinalError = (err: GeolocationPositionError) => {
        void (async () => {
          if (await tryPersistFromManualFields()) {
            /* toast จาก persistPinLatLng */
          } else {
            notify(formatGeolocationFailure(language, err), "error");
          }
          setSaving(false);
        })();
      };

      const optsFresh: PositionOptions = {
        enableHighAccuracy: false,
        timeout: 28000,
        maximumAge: 0,
      };
      const optsCached: PositionOptions = {
        enableHighAccuracy: false,
        timeout: 20000,
        maximumAge: 600000,
      };

      navigator.geolocation.getCurrentPosition(
        applyPosition,
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            onFinalError(err);
            return;
          }
          navigator.geolocation.getCurrentPosition(
            applyPosition,
            onFinalError,
            optsCached,
          );
        },
        optsFresh,
      );
    })();
  };

  return (
    <div className="border border-gold/10 rounded-[20px] p-6 bg-charcoal-800/50">
      <h3 className="text-lg font-bold text-slate-100 mb-4">การรับงาน</h3>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-slate-300">สวิตซ์รับงาน</span>
          <button
            onClick={toggleAvailability}
            disabled={saving}
            data-tour="talent-online-toggle"
            className={`relative w-12 h-6 rounded-full transition-colors ${available ? "bg-emerald-600" : "bg-slate-600"}`}
          >
            <span
              className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${available ? "translate-x-6" : ""}`}
            />
          </button>
        </div>
        <div>
          <label className="block text-slate-400 text-sm mb-2">
            ปักหมุดตำแหน่ง (รอรับงานใกล้เคียง)
          </label>
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={pinCurrentLocation}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              <MapPin size={16} />{" "}
              {pinnedLocation ? "อัปเดตตำแหน่ง" : "ปักหมุดตำแหน่งปัจจุบัน"}
            </button>
            {pinnedLocation && (
              <span className="text-slate-400 text-sm">
                {pinnedLocation.lat.toFixed(4)}, {pinnedLocation.lng.toFixed(4)}
              </span>
            )}
          </div>
          {pinnedLocation?.address ? (
            <p
              className="mb-2 text-xs leading-snug text-slate-300"
              title={pinnedLocation.address}
            >
              {pinnedLocation.address}
            </p>
          ) : null}
          <p className="text-xs leading-relaxed text-slate-500">
            {language === "en"
              ? "If Chrome blocked location after ignoring prompts: use the fields below or reset via the lock icon → Site settings → Location."
              : "ถ้า Chrome ปฏิเสธตำแหน่งจากการกดผ่าน prompt หลายครั้ง: กรอกพิกัดด้านล่าง หรือรีเซ็ตที่แม่กุญแจ → การตั้งค่าไซต์ → ตำแหน่ง"}
          </p>
          <div className="mt-3 rounded-xl border border-slate-600 bg-slate-900/35 p-3">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              {language === "en"
                ? "Or pin by latitude / longitude"
                : "หรือปักหมุดจากตัวเลข (ใช้ได้แม้เบราว์เซอร์บล็อก GPS)"}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="min-w-0 flex-1 sm:flex-initial sm:w-[calc(50%-4px)]">
                <label className="block text-[10px] text-slate-500">
                  {language === "en" ? "Latitude" : "ละติจูด"}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="13.7367"
                  value={manualLat}
                  onChange={(e) => setManualLat(e.target.value)}
                  disabled={saving}
                  className="mt-0.5 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500"
                />
              </div>
              <div className="min-w-0 flex-1 sm:flex-initial sm:w-[calc(50%-4px)]">
                <label className="block text-[10px] text-slate-500">
                  {language === "en" ? "Longitude" : "ลองจิจูด"}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="100.5232"
                  value={manualLng}
                  onChange={(e) => setManualLng(e.target.value)}
                  disabled={saving}
                  className="mt-0.5 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500"
                />
              </div>
              <button
                type="button"
                onClick={pinManualCoordinates}
                disabled={saving}
                className="w-full shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 sm:ml-auto sm:w-auto"
              >
                {language === "en"
                  ? "Save these coordinates"
                  : "ปักหมุดพิกัดนี้"}
              </button>
            </div>
          </div>
        </div>
        <div>
          <label className="block text-slate-400 text-sm mb-2">
            ที่อยู่อาศัยปัจจุบัน (สำหรับติดตามกรณีฉุกเฉิน)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={residentialAddress}
              onChange={(e) => setResidentialAddress(e.target.value)}
              placeholder="เลขที่ ถนน ตำบล อำเภอ จังหวัด"
              className="flex-1 px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500"
            />
            <button
              onClick={saveAddress}
              disabled={saving}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              บันทึก
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Connection Tab: UID:Key, Coach-Trainee ─────────────────────────────────
const ConnectionTab: React.FC<{ userId?: string }> = ({ userId }) => {
  const { notify } = useNotification();
  const [keyData, setKeyData] = useState<{
    connection_key?: string;
    uid_key?: string;
  } | null>(null);
  const [connections, setConnections] = useState<{
    as_coach: any[];
    as_trainee: any[];
  }>({ as_coach: [], as_trainee: [] });
  const [traineeKey, setTraineeKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [keyRes, listRes] = await Promise.all([
        MockApi.getConnectionKey(),
        MockApi.getConnectionList(),
      ]);
      setKeyData(keyRes);
      setConnections(listRes);
    } catch (e) {
      notify("โหลดข้อมูลล้มเหลว", "error");
    } finally {
      setLoading(false);
    }
  }, [userId, notify]);

  useEffect(() => {
    load();
  }, [load]);

  const copyKey = () => {
    if (keyData?.uid_key) {
      navigator.clipboard.writeText(keyData.uid_key);
      notify("คัดลอก UID:Key แล้ว", "success");
    }
  };

  const addTrainee = async () => {
    const k = traineeKey.trim().toUpperCase();
    if (!k) {
      notify("กรุณากรอกรหัสศิษย์", "error");
      return;
    }
    setAdding(true);
    try {
      const res = await MockApi.coachAddTrainee(k);
      if (res.success) {
        notify(
          res.needs_trainee_confirm
            ? "เพิ่มแล้ว — รอศิษย์กดยืนยัน"
            : "เชื่อมต่อสำเร็จ",
          "success",
        );
        setTraineeKey("");
        load();
      } else {
        notify("ไม่พบรหัสหรือไม่สามารถเพิ่มได้", "error");
      }
    } catch (e: any) {
      notify(e.response?.data?.error || "เพิ่มไม่สำเร็จ", "error");
    } finally {
      setAdding(false);
    }
  };

  const confirmConn = async (connId: string, asTrainee: boolean) => {
    try {
      await MockApi.confirmConnection(connId, asTrainee);
      notify("ยืนยันแล้ว", "success");
      load();
    } catch (e: any) {
      notify(e.response?.data?.error || "ยืนยันไม่สำเร็จ", "error");
    }
  };

  if (!userId) return null;
  return (
    <div className="connection-tab luxury-card rounded-b-[20px] rounded-t-none border-t-0 p-6 sm:p-8 animate-in fade-in space-y-6">
      <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
        <Network size={20} /> Connection
      </h3>
      <p className="text-slate-400 text-sm">
        รหัส UID:Key ของคุณ — โค้ชกรอกรหัสศิษย์เพื่อเชื่อมต่อ
        ต้องทั้งสองฝ่ายกดยืนยัน
      </p>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
          <Loader2 size={32} className="animate-spin mb-4" />
          <span>กำลังโหลด...</span>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-4 p-4 bg-charcoal-800/50 rounded-xl border border-gold/10">
            <span className="text-slate-400">UID:Key ของคุณ:</span>
            <code className="px-4 py-2 bg-slate-900 rounded-lg font-mono text-emerald-400">
              {keyData?.uid_key || keyData?.connection_key || "—"}
            </code>
            <button
              onClick={copyKey}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-900/30 text-emerald-400 border border-emerald-700/40 rounded-lg hover:bg-emerald-800/30"
            >
              <Copy size={16} /> คัดลอก
            </button>
          </div>

          <div className="space-y-6">
            <h4 className="font-semibold text-slate-200">โค้ชกรอกรหัสศิษย์</h4>
            <div className="flex gap-2">
              <input
                type="text"
                value={traineeKey}
                onChange={(e) => setTraineeKey(e.target.value.toUpperCase())}
                placeholder="กรอกรหัสศิษย์ (เช่น ABC12345)"
                className="flex-1 px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500"
              />
              <button
                onClick={addTrainee}
                disabled={adding}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                {adding ? "กำลังเพิ่ม..." : "เพิ่มศิษย์"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold text-slate-200 mb-3">
                ศิษย์ที่คุณเทรนด์
              </h4>
              {connections.as_coach.length === 0 ? (
                <p className="text-slate-500 text-sm">ยังไม่มีศิษย์</p>
              ) : (
                <ul className="space-y-2">
                  {connections.as_coach.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg"
                    >
                      <span className="text-slate-200">
                        {c.trainee_name || c.trainee_key}
                      </span>
                      <span
                        className={`text-xs px-2 py-1 rounded ${c.status === "active" ? "bg-emerald-900/30 text-emerald-400" : c.status === "graduated" ? "bg-amber-900/30 text-amber-400" : "bg-slate-700 text-slate-400"}`}
                      >
                        {c.status === "pending" && c.needs_confirm
                          ? "รอศิษย์ยืนยัน"
                          : c.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h4 className="font-semibold text-slate-200 mb-3">โค้ชของคุณ</h4>
              {connections.as_trainee.length === 0 ? (
                <p className="text-slate-500 text-sm">ยังไม่มีโค้ช</p>
              ) : (
                <ul className="space-y-2">
                  {connections.as_trainee.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg"
                    >
                      <span className="text-slate-200">
                        {c.coach_name || c.coach_key}
                      </span>
                      <span
                        className={`text-xs px-2 py-1 rounded ${c.status === "active" ? "bg-emerald-900/30 text-emerald-400" : "bg-slate-700 text-slate-400"}`}
                      >
                        {c.status}
                      </span>
                      {c.needs_confirm && (
                        <button
                          onClick={() => confirmConn(c.id, true)}
                          className="text-xs px-2 py-1 bg-amber-600 text-white rounded"
                        >
                          ยืนยัน
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

/** PaySo status poll: upstream returned error / bad HTTP — not “user has not paid yet”. */
function hasPaysoUpstreamFailure(
  reconcile: WalletDepositStatusReconcile | null | undefined,
): boolean {
  if (!reconcile?.checked || reconcile.paid) return false;
  const q = reconcile.query;
  if (q && typeof q === "object") {
    const err = String((q as { error?: unknown }).error ?? "").trim();
    if (err) return true;
    const sc = Number((q as { statusCode?: unknown }).statusCode ?? 0);
    if (sc >= 400) return true;
  }
  const ex = String(reconcile.explain ?? "");
  if (ex.includes("Parameter incomplete")) return true;
  if (ex.includes("PAYSO_DEPOSIT_STATUS_PATH")) return true;
  if (ex.includes("not configured")) return true;
  return false;
}

function getPaysoReconcileNoticeCode(
  reconcile: WalletDepositStatusReconcile | null | undefined,
): PaysoReconcileNoticeCode | null {
  if (!reconcile?.checked) return null;
  const q = reconcile.query;
  const errorText = String(q?.error || reconcile.explain || "").toLowerCase();
  const pathText = String(q?.path || "").toLowerCase();
  const configWarning = String(q?.config_warning || "").toLowerCase();
  const statusCode = Number(q?.statusCode || 0);

  if (
    reconcile.creditError ||
    reconcile.explain === "status_paid_but_credit_failed"
  ) {
    return "credit_failed";
  }
  if (reconcile.paid) return null;
  if (
    statusCode === 401 ||
    errorText.includes("invalid authentication credentials")
  ) {
    return "status_auth_failed";
  }
  if (
    errorText.includes("not configured") ||
    errorText.includes("deposit_status_path")
  ) {
    return "status_endpoint_missing";
  }
  if (
    errorText.includes("parameter incomplete") ||
    errorText.includes("deposit-create endpoint") ||
    pathText.includes("promptpaynew") ||
    configWarning.includes("http method")
  ) {
    return "status_endpoint_wrong_path";
  }
  if (statusCode >= 400 || q?.error) {
    return "status_upstream_error";
  }
  if (String(reconcile.explain || "").startsWith("status_check_not_paid")) {
    return "awaiting_bank";
  }
  return null;
}

function getPaysoReconcileNotice(
  reconcile: WalletDepositStatusReconcile | null | undefined,
) {
  const code = getPaysoReconcileNoticeCode(reconcile);
  return code ? { code, ...PAYSO_RECONCILE_NOTICE[code] } : null;
}

function isPaysoAwaitingBankOnly(
  reconcile: WalletDepositStatusReconcile | null | undefined,
): boolean {
  if (!reconcile?.checked || reconcile.paid) return false;
  if (hasPaysoUpstreamFailure(reconcile)) return false;
  return String(reconcile.explain ?? "").startsWith("status_check_not_paid");
}

function computePaysoPollDelayMs(completedPollCount: number): number {
  if (completedPollCount < 20) return 3000;
  if (completedPollCount < 60) return 5000;
  return 10000;
}

function paysoStepperActiveIndex(
  payStatus: string,
  reconcile: WalletDepositStatusReconcile | null | undefined,
): number {
  const st = String(payStatus ?? "").toLowerCase();
  if (st === "success") return 3;
  if (hasPaysoUpstreamFailure(reconcile)) return 2;
  if (isPaysoAwaitingBankOnly(reconcile)) return 1;
  if (reconcile?.checked && !reconcile.paid) return 2;
  return 1;
}

/** POST /api/payouts/quote response (subset used by withdraw modal) */
type PayoutQuoteResponse = {
  ok?: boolean;
  blocking_reason: string | null;
  blocking_message_th: string | null;
  withdrawal_rules_eligible?: boolean;
  balance_sufficient?: boolean;
  available_balance?: number;
  amount_requested?: number;
  fee_thb?: number;
  net_receive?: number;
  total_deduct?: number;
  eta_label_th?: string | null;
  fee_lane?: string;
};

function formatThb2(n: number | null | undefined, empty = "—"): string {
  if (n == null || Number.isNaN(Number(n))) return empty;
  return Number(n).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function roundThb2(n: number): number {
  return Math.round(n * 100) / 100;
}

// --- MAIN PROFILE COMPONENT ---

export const Profile: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isCoach, setIsCoach] = useState(false);
  const [certifiedSkills, setCertifiedSkills] = useState<
    Module2PassedCategory[]
  >([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [workerGrade, setWorkerGrade] = useState<GradeData | null>(null);
  const [reviewStats, setReviewStats] = useState<ReviewStats | null>(null);
  /** รายการจาก Backend (payment_ledger_audit) — แสดง "จากงาน Advance Job ID" + Commission + ค่าประกัน + ทิป */
  const [walletLedgerTransactions, setWalletLedgerTransactions] = useState<
    Array<{
      id: string;
      amount: number;
      direction: string;
      description: string;
      status?: string;
      commission_deducted?: number;
      insurance_amount?: number;
      tips_amount?: number;
      created_at: string;
      event_type?: string;
      job_id?: string;
      gross_earnings?: number;
      handling_fee?: number;
      commission_fee?: number;
      commission_percent?: number;
    }>
  >([]);
  const [feeTooltipId, setFeeTooltipId] = useState<string | null>(null);
  /** Wallet history filter: all | deposit | withdrawal | income — default All */
  const [walletHistoryFilter, setWalletHistoryFilter] = useState<
    "all" | "deposit" | "withdrawal" | "income"
  >("all");
  /** คำขอถอนเงินจาก Backend (GET /api/payouts/me) */
  const [payoutRequests, setPayoutRequests] = useState<
    Array<{
      id: string;
      amount: number;
      bank_details: Record<string, unknown>;
      status: string;
      admin_notes?: string;
      transaction_id?: string;
      created_at: string;
      processed_at?: string;
    }>
  >([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [activeTab, setActiveTab] = useState<
    | "info"
    | "reviews"
    | "wallet"
    | "coursePurchases"
    | "earnings"
    | "training"
    | "calendar"
    | "portfolio"
    | "story"
    | "connection"
  >("info");
  /** ช่วงเวลาที่เลือกดูรายได้: สัปดาห์ / เดือน / ปี */
  const [earningsTimeRange, setEarningsTimeRange] = useState<
    "week" | "month" | "year"
  >("month");
  const [profileWorkClips, setProfileWorkClips] = useState<
    { id: string; url: string; type?: string }[]
  >([]);
  const [backendWorkClips, setBackendWorkClips] = useState<
    { id: string; url: string; title?: string; description?: string }[]
  >([]);

  const { t, language } = useLanguage();
  const { token, login, user } = useAuth();
  const { notify } = useNotification();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    let alive = true;
    if (!user?.id) {
      setIsCoach(false);
      return;
    }
    listConnections()
      .then((list) => {
        if (!alive) return;
        setIsCoach((list.as_coach || []).some((c) => c.status === "active"));
      })
      .catch(() => {
        if (alive) setIsCoach(false);
      });
    return () => {
      alive = false;
    };
  }, [user?.id]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (
      tab === "info" ||
      tab === "reviews" ||
      tab === "wallet" ||
      tab === "coursePurchases" ||
      tab === "earnings" ||
      tab === "training" ||
      tab === "calendar" ||
      tab === "portfolio" ||
      tab === "story" ||
      tab === "connection"
    ) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  // บัญชีรับเงินจาก Payment Methods (Settings) — ผูกความว่างเป็น ref ถาวร ไม่สร้าง [] ใหม่ทุก render (กัน useEffect withdraw วนรัว)
  const bankAccounts = useMemo(
    () => user?.bank_accounts ?? profile?.bank_accounts ?? EMPTY_BANK_ACCOUNTS,
    [user?.bank_accounts, profile?.bank_accounts],
  );

  // Wallet Modal State
  const [showWalletGuide, setShowWalletGuide] = useState(false);
  const [activeModal, setActiveModal] = useState<"deposit" | "withdraw" | null>(
    null,
  );
  const [amount, setAmount] = useState("");
  const [processing, setProcessing] = useState(false);
  const [depositMethod, setDepositMethod] = useState<
    | "promptpay"
    | "truemoney"
    | "mobile_banking"
    | "bank_transfer"
    | "card"
    | null
  >(null);
  const [bankTransferRef, setBankTransferRef] = useState<{
    refId: string;
    bill_no: string;
    transaction_no: string;
  } | null>(null);
  const [depositStep, setDepositStep] = useState<
    "amount" | "qr" | "bank_show" | "manual_static"
  >("amount");
  /** ช่องทางรอง: บัตร / TrueMoney / โอนบริษัท */
  const [depositOtherChannelsOpen, setDepositOtherChannelsOpen] =
    useState(false);
  /** สลิปสำหรับเส้นทาง QR นิ่ง KTB (แยกจาก slip โอนบริษัท) */
  const [manualStaticSlipFile, setManualStaticSlipFile] = useState<File | null>(
    null,
  );
  const [manualStaticQrExpanded, setManualStaticQrExpanded] = useState(true);
  const [depositQrUrl, setDepositQrUrl] = useState<string | null>(null);
  const [depositPaymentId, setDepositPaymentId] = useState<string | null>(null);
  const [showRefundPolicy, setShowRefundPolicy] = useState(false);
  const [refundPolicyContent, setRefundPolicyContent] = useState("");
  const [refundPolicyVersion, setRefundPolicyVersion] = useState<string>("");
  const [refundPolicyUpdated, setRefundPolicyUpdated] = useState<string>("");
  const [selectedWithdrawAccount, setSelectedWithdrawAccount] =
    useState<BankAccount | null>(null);
  const [withdrawChannel, setWithdrawChannel] =
    useState<PaymentChannel>("bank_transfer");
  /** Provider: Batch (35) vs Instant (50) — ใช้กับ /api/payouts/request */
  const [withdrawSpeed, setWithdrawSpeed] = useState<"batch" | "instant">(
    "batch",
  );
  /** Provider: ข้อมูลสิทธิ์ถอนจาก GET /api/payouts/eligibility (10 งาน หรือ 650 บาท) */
  const [payoutEligibility, setPayoutEligibility] = useState<{
    eligible: boolean;
    reason: string | null;
    min_jobs: number;
    completed_jobs: number;
    min_balance_thb: number;
    balance: number;
    pending: number;
    fee_standard_thb: number;
    fee_instant_thb: number;
  } | null>(null);

  /** ถอนเงิน — stepper UX + POST /api/payouts/quote */
  const [withdrawFlowStep, setWithdrawFlowStep] = useState<1 | 2 | 3>(1);
  const [payoutQuote, setPayoutQuote] = useState<PayoutQuoteResponse | null>(
    null,
  );
  const [payoutQuoteLoading, setPayoutQuoteLoading] = useState(false);
  const [payoutQuoteError, setPayoutQuoteError] = useState<string | null>(null);
  const [payoutQuoteProvisional, setPayoutQuoteProvisional] = useState(false);
  const [withdrawSuccessRequestId, setWithdrawSuccessRequestId] = useState<
    string | null
  >(null);
  const [withdrawMaxNetEstimate, setWithdrawMaxNetEstimate] = useState<
    number | null
  >(null);
  const [withdrawMaxNetLoading, setWithdrawMaxNetLoading] = useState(false);
  const payoutQuoteReqSeqRef = useRef(0);
  const payoutQuoteDebounceTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const payoutQuoteLastSuccessKeyRef = useRef<string | null>(null);
  const [payoutQuoteRetryNonce, setPayoutQuoteRetryNonce] = useState(0);
  /** พ้นช่วง rate limit เมื่อใด (epoch ms) — จาก 429 + resetEpochMs / Retry-After */
  const [withdrawThrottleEndsAtMs, setWithdrawThrottleEndsAtMs] = useState<
    number | null
  >(null);
  /** Re-render ต่อวินาทีเพื่ออัปเดตเลขในนับถอยหลัง */
  const [withdrawThrottleClockTick, setWithdrawThrottleClockTick] = useState(0);
  const postWithdrawQuoteRawRef = useRef<
    (amt: number) => Promise<PayoutQuoteResponse>
  >(async () => {
    throw new Error("postWithdrawQuoteRaw not ready");
  });
  const buildWithdrawBankDetailsRef = useRef<
    () => Record<string, unknown> | null
  >(() => null);
  const computeWithdrawMaxNetRef = useRef<() => Promise<number>>(async () => 0);

  const withdrawMaxNetSeqRef = useRef(0);
  const withdrawMaxNetDebounceTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const withdrawPrevModalRef = useRef<"deposit" | "withdraw" | null>(null);

  // Company Bank Accounts for Bank Transfer Deposit
  const [companyBankAccounts, setCompanyBankAccounts] = useState<
    Array<{
      id: string;
      bank_name: string;
      account_number: string;
      account_name: string;
      branch: string | null;
    }>
  >([]);
  const [uploadingSlip, setUploadingSlip] = useState(false);
  const [slipFile, setSlipFile] = useState<File | null>(null);
  /** แนบสลิปครบแล้วสำหรับรายการที่มี charge_id (PromptPay / บัตร / TrueMoney) — ใช้ ref ใน poll เพื่อไม่ให้ closure ล้าสมัย */
  const depositSlipUploadedRef = useRef(false);
  /** ค่าจาก API `source_type` (เช่น payso) — ไม่ต้องบังคับสลิปก่อนสำเร็จเมื่อชำระยืนยันฝั่งเกตเวย์แล้ว */
  const walletDepositChargeSourceRef = useRef<string | null>(null);
  const [depositChargeSourceType, setDepositChargeSourceType] = useState<
    string | null
  >(null);
  const depositPendingSuccessMessageRef = useRef("เติมเงินสำเร็จ");
  /** ชำระสำเร็จแล้วแต่ยังไม่มีสลิป — แสดงหน้าจอแนบสลิป */
  const [depositSuccessPendingSlip, setDepositSuccessPendingSlip] =
    useState(false);

  const [paysoAutoCloseCountdown, setPaysoAutoCloseCountdown] = useState<
    number | null
  >(null);
  const paysoAutoCloseTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const paysoSuccessHandledRef = useRef(false);
  const paysoPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paysoPollStopRef = useRef(false);
  const paysoPollCountRef = useRef(0);
  const paysoManualPollAtRef = useRef(0);
  const paysoPollTickRef = useRef<
    ((fromManual?: boolean) => Promise<void>) | null
  >(null);
  const paysoSoftTimeoutRef = useRef(false);
  const depositModalRef = useRef<HTMLDivElement | null>(null);
  type PaysoPollBanner = {
    kind: "network" | "server" | "auth";
    message: string;
  };
  const [paysoPollBanner, setPaysoPollBanner] =
    useState<PaysoPollBanner | null>(null);
  const [paysoGatewayWarn, setPaysoGatewayWarn] = useState(false);
  const [paysoCreditErrBanner, setPaysoCreditErrBanner] = useState<
    string | null
  >(null);
  const [paysoLastStatusPayload, setPaysoLastStatusPayload] =
    useState<WalletDepositStatusResponse | null>(null);
  const [paysoPollSoftTimeout, setPaysoPollSoftTimeout] = useState(false);

  /** M0: fee breakdown จาก GET /wallet/deposit/preview เท่านั้น */
  const [walletDepositPreview, setWalletDepositPreview] =
    useState<WalletDepositPreviewResponse | null>(null);
  const [walletDepositPreviewError, setWalletDepositPreviewError] = useState<
    string | null
  >(null);
  const [walletDepositPreviewLoading, setWalletDepositPreviewLoading] =
    useState(false);
  const walletDepositPreviewRequestSeqRef = useRef(0);

  /** Phase M1 — deposit modal flow (Manual + gateway auto-credit channels). */
  const [walletDepositM1Step, setWalletDepositM1Step] =
    useState<WalletDepositM1Step | null>(null);
  const [walletM1Method, setWalletM1Method] = useState<
    | "manual_slip"
    | "payso_promptpay"
    | "gateway_card"
    | "gateway_truemoney"
    | "gateway_mobile_banking"
    | null
  >(null);
  const [manualDepositSubmitResult, setManualDepositSubmitResult] =
    useState<Pick<
      WalletDepositManualCreateResponse,
      "id" | "status" | "amount"
    > | null>(null);

  useEffect(() => {
    if (!activeModal) return;
    window.setTimeout(() => {
      depositModalRef.current?.focus();
    }, 0);
  }, [activeModal, walletDepositM1Step]);

  /** M1: WalletDashboard → Profile opens deposit modal once. */
  useEffect(() => {
    if (searchParams.get("openDeposit") !== "1") return;
    profileAgentLog({
      hypothesisId: "H1",
      location: "mobile/pages/Profile.tsx:openDeposit-useEffect",
      message: "openDeposit query consumed and modal bootstrap started",
      data: {
        openDeposit: searchParams.get("openDeposit"),
        tab: searchParams.get("tab"),
      },
    });
    setActiveTab("wallet");
    setActiveModal("deposit");
    setWalletDepositM1Step("choose_method");
    setWalletM1Method(null);
    setManualDepositSubmitResult(null);
    const topUpHint = consumeTopUpHintAmount();
    setAmount(topUpHint || "");
    setWalletDepositPreview(null);
    setWalletDepositPreviewError(null);
    setWalletDepositPreviewLoading(false);
    setDepositStep("amount");
    setDepositMethod(null);
    setDepositQrUrl(null);
    setDepositPaymentId(null);
    setDepositSuccessPendingSlip(false);
    depositSlipUploadedRef.current = false;
    walletDepositChargeSourceRef.current = null;
    setDepositChargeSourceType(null);
    setManualStaticSlipFile(null);
    setDepositOtherChannelsOpen(false);
    const next = new URLSearchParams(searchParams);
    next.delete("openDeposit");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const fetchWalletDepositPreviewOnDemand = useCallback(
    async (opts?: {
      notifyOnInvalid?: boolean;
      source?: "button" | "auto";
    }) => {
      const notifyOnInvalid = opts?.notifyOnInvalid ?? true;
      const isAuto = opts?.source === "auto";

      const amt = Number(amount);
      profileAgentLog({
        hypothesisId: "H2",
        location:
          "mobile/pages/Profile.tsx:fetchWalletDepositPreviewOnDemand:start",
        message: isAuto
          ? "preview auto-triggered (debounced)"
          : "preview button triggered",
        data: {
          amountRaw: amount,
          amountParsed: amt,
          walletM1Method,
          source: opts?.source ?? "button",
        },
      });

      if (!Number.isFinite(amt) || amt < 1) {
        if (notifyOnInvalid) {
          notify("กรุณากรอกยอดตั้งแต่ 1 บาทขึ้นไป", "error");
        }
        return;
      }

      if (!walletM1Method) {
        return;
      }

      const payment_method =
        walletM1Method === "payso_promptpay"
          ? "promptpay"
          : walletM1Method === "gateway_card"
            ? "card"
            : walletM1Method === "gateway_truemoney"
              ? "truemoney"
              : walletM1Method === "gateway_mobile_banking"
                ? "mobile_banking"
                : "manual";

      const seq = ++walletDepositPreviewRequestSeqRef.current;
      setWalletDepositPreviewLoading(true);
      setWalletDepositPreviewError(null);
      if (!isAuto) {
        setWalletDepositPreview(null);
      }

      try {
        const { data } = await api.get<WalletDepositPreviewResponse>(
          `/wallet/deposit/preview`,
          {
            params: { amount: amt, payment_method },
          },
        );
        if (seq !== walletDepositPreviewRequestSeqRef.current) return;
        profileAgentLog({
          hypothesisId: "H2",
          location:
            "mobile/pages/Profile.tsx:fetchWalletDepositPreviewOnDemand:success",
          message: "preview response received",
          data: {
            payment_method,
            gross_amount: data?.gross_amount,
            processing_fee: data?.processing_fee,
            net_to_wallet: data?.net_to_wallet,
          },
        });
        setWalletDepositPreview(data);
      } catch (e: unknown) {
        if (seq !== walletDepositPreviewRequestSeqRef.current) return;
        const msg =
          (e as any)?.response?.data?.error ||
          (e instanceof Error ? e.message : String(e));
        setWalletDepositPreview(null);
        setWalletDepositPreviewError(
          typeof msg === "string" ? msg : "โหลดค่าธรรมเนียมไม่ได้",
        );
        profileAgentLog({
          hypothesisId: "H2",
          location:
            "mobile/pages/Profile.tsx:fetchWalletDepositPreviewOnDemand:error",
          message: "preview request failed",
          data: {
            payment_method,
            error: typeof msg === "string" ? msg : "unknown",
          },
        });
      } finally {
        if (seq === walletDepositPreviewRequestSeqRef.current) {
          setWalletDepositPreviewLoading(false);
        }
      }
    },
    [amount, walletM1Method, notify],
  );

  useEffect(() => {
    if (activeModal !== "deposit") return;
    if (walletDepositM1Step !== "enter_amount") return;
    if (!walletM1Method) return;
    if (processing) return;

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 1) return;

    const t = window.setTimeout(() => {
      void fetchWalletDepositPreviewOnDemand({
        notifyOnInvalid: false,
        source: "auto",
      });
    }, 400);

    return () => window.clearTimeout(t);
  }, [
    activeModal,
    amount,
    fetchWalletDepositPreviewOnDemand,
    processing,
    walletDepositM1Step,
    walletM1Method,
  ]);

  // Receipt Modal State
  const [receiptModal, setReceiptModal] = useState<{
    id: string;
    receipt_no: string;
    transaction_no: string;
    date: string;
    amount: number;
    currency: string;
    payment_method: string;
    description: string;
    tax_ref_id?: string | null;
    employer_expense?: number | null;
    provider_income?: number | null;
    company_fee?: number | null;
    insurance_amount?: number | null;
    document_label?: string;
    is_tax_invoice?: boolean;
    company: {
      name: string;
      address?: string | null;
      tax_id?: string | null;
      phone?: string | null;
      branch_code?: string | null;
      branch_name?: string | null;
      support_email?: string | null;
      support_line?: string | null;
      help_center_url?: string | null;
    };
    customer: {
      name: string;
      email: string;
      tax_id?: string | null;
      registered_address?: string | null;
    };
  } | null>(null);

  // KYC State
  const [fullName, setFullName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [idCardNumber, setIdCardNumber] = useState("");

  const [idCardImage, setIdCardImage] = useState<string | null>(null);
  const [idCardBackImage, setIdCardBackImage] = useState<string | null>(null); // ควรมีแต่ไม่มีในโค้ด
  const [selfieImage, setSelfieImage] = useState<string | null>(null);
  const [drivingLicenseFrontImage, setDrivingLicenseFrontImage] =
    useState(null);
  const [drivingLicenseBackImage, setDrivingLicenseBackImage] = useState(null);

  const [idCardPreview, setIdCardPreview] = useState<string | null>(null);
  const [idCardBackPreview, setIdCardBackPreview] = useState<string | null>(
    null,
  );
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [drivingLicenseFrontPreview, setDrivingLicenseFrontPreview] = useState<
    string | null
  >(null);
  const [drivingLicenseBackPreview, setDrivingLicenseBackPreview] = useState<
    string | null
  >(null);
  const [submittingKYC, setSubmittingKYC] = useState(false);
  const [kycNeedsReverify, setKycNeedsReverify] = useState(false);
  const [kycReverifyLoading, setKycReverifyLoading] = useState(false);
  const [kycDocGate, setKycDocGate] = useState<KycDocumentVerification | null>(
    null,
  );
  const [kycAdminInstruction, setKycAdminInstruction] = useState<string | null>(
    null,
  );

  // ซิงค์บัญชีรับเงินกับ Payment Methods (Settings) — เมื่อ user อัปเดตใน Settings ให้ใช้บัญชีแรก
  useEffect(() => {
    if (bankAccounts.length > 0) {
      setSelectedWithdrawAccount(bankAccounts[0]);
    } else {
      setSelectedWithdrawAccount(null);
    }
  }, [bankAccounts]);

  // State สำหรับรูปภาพ (ทั้ง preview และ base64)
  const [idCardFront, setIdCardFront] = useState({
    preview: "", // สำหรับแสดงผล
    base64: "", // สำหรับส่งไป backend
  });

  const [idCardBack, setIdCardBack] = useState({
    preview: "",
    base64: "",
  });

  const [selfiePhoto, setSelfiePhoto] = useState({
    preview: "",
    base64: "",
  });

  const [drivingLicenseFront, setDrivingLicenseFront] = useState({
    preview: "",
    base64: "",
  });

  const [drivingLicenseBack, setDrivingLicenseBack] = useState({
    preview: "",
    base64: "",
  });

  const idCardInputRef = useRef<HTMLInputElement>(null);
  const selfieInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const idCardBackInputRef = useRef<HTMLInputElement>(null);
  const drivingLicenseFrontInputRef = useRef<HTMLInputElement>(null);
  const drivingLicenseBackInputRef = useRef<HTMLInputElement>(null);
  const [isAvatarAnalyzing, setIsAvatarAnalyzing] = useState(false);

  // Training Center State
  const [courses, setCourses] = useState<TrainingModule[]>([]);
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "learn" | "quiz">("list");
  const [loading, setLoading] = useState(true);

  // Calendar State
  const [newSlot, setNewSlot] = useState({
    date: "",
    startTime: "09:00",
    endTime: "17:00",
  });

  useEffect(() => {
    const fetchCompanyBanks = async () => {
      try {
        const { data } = await api.get<{
          accounts: Array<{
            id: string;
            bank_name: string;
            account_number: string;
            account_name: string;
            branch: string | null;
          }>;
        }>("/bank-accounts");
        setCompanyBankAccounts(data.accounts || []);
      } catch (e) {
        console.warn("Failed to load company bank accounts:", e);
        setCompanyBankAccounts([]);
      }
    };
    fetchCompanyBanks();

    const fetchData = async () => {
      console.log("🔄 Starting fetchData...");

      try {
        // 1. ดึงข้อมูลผู้ใช้ (refresh=true เพื่อให้ MyWallet ปรับตามหลังส่งทิป/รับทิป)
        const data = await MockApi.getProfile(user?.id, { refresh: true });
        console.log("✅ User data loaded:", {
          name: data.name,
          role: data.role,
          wallet_balance: data.wallet_balance,
          wallet_pending: data.wallet_pending,
        });

        setProfile(data);

        // ซิงค์ wallet ไป AuthContext — เพื่อให้ Mywallet ใน Profile ปรับตามหลังส่งทิป/รับทิป
        if (user && token && data) {
          login(
            {
              ...user,
              wallet_balance: data.wallet_balance,
              wallet_pending: data.wallet_pending,
            },
            token,
          );
        }

        // 1b. ดึง Module 2 certified skills จาก backend
        // ใช้ user.id จาก AuthContext (PostgreSQL UUID จาก login) แทน data.id
        // เพื่อหลีกเลี่ยงกรณี Firestore fallback คืน Firebase UID เป็น id
        const certUserId = user?.id || data.id;
        if (certUserId) {
          getModule2PassedCategories(certUserId)
            .then((cats) => {
              console.log(
                "✅ [Profile] Certified skills loaded:",
                cats.length,
                cats,
              );
              setCertifiedSkills(cats);
            })
            .catch((e) =>
              console.warn("[Profile] getModule2PassedCategories failed:", e),
            );
        }

        // 2. ดึง transaction พร้อมกรองตาม role
        const txData = await MockApi.getTransactions();
        setTransactions(txData);
        console.log("✅ Transactions loaded:", txData.length);

        // 2a. ดึงประวัติกระเป๋าจาก Backend (Advance Job + Commission)
        try {
          const { data } = await api.get<{
            transactions?: Array<{
              id: string;
              amount: number;
              direction: string;
              description: string;
              status?: string;
              event_type?: string;
              commission_deducted?: number;
              created_at: string;
            }>;
          }>("/wallet/transactions");
          const txs = data.transactions || [];
          setWalletLedgerTransactions(txs);
          profileAgentLog({
            hypothesisId: "H11",
            location:
              "mobile/pages/Profile.tsx:loadProfile:/wallet/transactions",
            message: "wallet transactions loaded for profile",
            data: {
              total: txs.length,
              pending_count: txs.filter(
                (x) => String(x?.status || "").toLowerCase() === "pending",
              ).length,
              deposit_count: txs.filter(
                (x) => String(x?.event_type || "") === "wallet_deposit",
              ).length,
            },
          });
        } catch (e) {
          setWalletLedgerTransactions([]);
        }
        // 2a-2. ดึงประวัติคำขอถอน (GET /api/payouts/me)
        try {
          const { data: payoutsData } = await api.get<{
            requests?: Array<{
              id: string;
              amount: number;
              bank_details: Record<string, unknown>;
              status: string;
              admin_notes?: string;
              transaction_id?: string;
              created_at: string;
              processed_at?: string;
            }>;
          }>("/payouts/me");
          setPayoutRequests(payoutsData.requests || []);
        } catch (e) {
          setPayoutRequests([]);
        }
        // 2a-3. Provider: ดึงสิทธิ์ถอน (10 งาน หรือ 650 บาท)
        if (data.role === UserRole.PROVIDER || data.role === "provider") {
          try {
            const { data: eligData } = await api.get<{
              eligible: boolean;
              reason: string | null;
              min_jobs: number;
              completed_jobs: number;
              min_balance_thb: number;
              balance: number;
              pending: number;
              fee_standard_thb: number;
              fee_instant_thb: number;
            }>("/payouts/eligibility");
            setPayoutEligibility(eligData);
          } catch {
            setPayoutEligibility(null);
          }
        }

        // 2b. KYC status (Re-Verify banner + ปลดล็อกเมื่อแอดมินขอเอกสาร)
        try {
          const kycStatus = await MockApi.checkKYCStatus();
          setKycNeedsReverify(!!kycStatus?.needsReverify);
          setKycDocGate(kycStatus?.documentVerification ?? null);
          setKycAdminInstruction(kycStatus?.kycAdminInstruction ?? null);
        } catch (_) {
          setKycNeedsReverify(false);
          setKycDocGate(null);
          setKycAdminInstruction(null);
        }

        // 2c. ดึง Verified Work Clips จาก Firestore + Backend talent_videos (Provider เท่านั้น)
        if (
          data.id &&
          (data.role === UserRole.PROVIDER || data.role === "provider")
        ) {
          FirebaseApi.getProviderWorkClips(data.id)
            .then(setProfileWorkClips)
            .catch(() => setProfileWorkClips([]));
          videoService
            .getMyVideos()
            .then((list) => {
              setBackendWorkClips(
                (list || []).map((v) => ({
                  id: v.id,
                  url: v.video_url,
                  title: v.title || undefined,
                  description: v.description || undefined,
                })),
              );
            })
            .catch(() => setBackendWorkClips([]));
        }

        // 3. ดึง reviews ถ้ามี user id
        if (data.id) {
          try {
            const reviewData = await MockApi.getReviews(data.id);
            setReviews(reviewData);
            console.log("✅ Reviews loaded:", reviewData.length);
          } catch (reviewError) {
            console.warn("Could not load reviews:", reviewError);
            setReviews([]);
          }

          // ตั้งค่าบัญชีธนาคารสำหรับถอนเงิน — ใช้จาก user (Auth) หรือ data (getProfile) ให้ตรงกับ Payment Methods
          const accounts = user?.bank_accounts ?? data.bank_accounts ?? [];
          if (accounts.length > 0) {
            setSelectedWithdrawAccount(accounts[0]);
          }
        }

        // 4. ดึงคอร์สเรียนและ merge กับ progress
        try {
          const allCourses = await MockApi.getAllCourses();
          const safeCourses = allCourses || [];

          const mergedCourses = safeCourses.map((c) => {
            const userTraining = data.trainings?.find((t) => t.id === c.id);
            return {
              ...c,
              status:
                userTraining?.status ||
                (data.skills?.includes(c.category)
                  ? TrainingStatus.COMPLETED
                  : TrainingStatus.NOT_ENROLLED),
            } as TrainingModule;
          });
          setCourses(mergedCourses);
          console.log("✅ Courses loaded:", mergedCourses.length);
        } catch (courseError) {
          console.warn("Could not load courses:", courseError);
          setCourses([]);
        }

        // 5. Earnings — ใช้ข้อมูลจาก walletLedgerTransactions (โหลดในข้อ 2a) โดยตรง

        // ✅ สำคัญ: สำหรับ Provider ให้ตรวจสอบและ sync wallet_pending
        if (data.role === UserRole.PROVIDER) {
          // คำนวณยอด pending จาก transaction
          const pendingFromTransactions = txData
            .filter(
              (tx) => tx.status === "pending_release" && tx.type === "income",
            )
            .reduce((sum, tx) => sum + tx.amount, 0);

          console.log("📊 Wallet check:", {
            current_pending: data.wallet_pending || 0,
            from_transactions: pendingFromTransactions,
            difference: pendingFromTransactions - (data.wallet_pending || 0),
          });

          // ถ้ามีความแตกต่างมากกว่า 1 บาท ให้ sync
          const currentPending = data.wallet_pending || 0;
          if (Math.abs(pendingFromTransactions - currentPending) > 1) {
            console.log(
              `🔄 Syncing wallet_pending: ${currentPending} → ${pendingFromTransactions}`,
            );
            try {
              await MockApi.updateProfile({
                wallet_pending: pendingFromTransactions,
              });

              // ดึงข้อมูล user ใหม่
              const updatedUser = await MockApi.getProfile();
              setProfile(updatedUser);
              console.log("✅ Wallet synced successfully");
            } catch (syncError) {
              console.error("Failed to sync wallet:", syncError);
            }
          }
        }

        console.log("✅ All data loaded successfully!");

        // โหลด Worker Grade (เฉพาะ provider)
        const currentUserId = user?.id || data?.id;
        if (currentUserId) {
          gradeService.getWorkerGrade(currentUserId).then((g) => {
            if (g) setWorkerGrade(g);
          });
          gradeService.getWorkerReviews(currentUserId, 5, 0).then((r) => {
            if (r?.stats) setReviewStats(r.stats);
          });
        }
      } catch (e) {
        console.error("❌ Failed to fetch profile data:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  /** Re-fetch wallet history (transactions + payouts) — call after deposit/withdraw or when wallet tab focused */
  const refreshWalletHistory = useCallback(async () => {
    try {
      const { data } = await api.get<{
        transactions?: Array<{
          id: string;
          amount: number;
          direction: string;
          description: string;
          status?: string;
          commission_deducted?: number;
          insurance_amount?: number;
          tips_amount?: number;
          created_at: string;
          event_type?: string;
          job_id?: string;
          gross_earnings?: number;
          handling_fee?: number;
          commission_fee?: number;
          commission_percent?: number;
        }>;
      }>("/wallet/transactions");
      const txs = data.transactions || [];
      setWalletLedgerTransactions(txs);
      profileAgentLog({
        hypothesisId: "H11",
        location: "mobile/pages/Profile.tsx:refreshWalletTransactions",
        message: "wallet transactions refreshed",
        data: {
          total: txs.length,
          pending_count: txs.filter(
            (x) => String(x?.status || "").toLowerCase() === "pending",
          ).length,
          deposit_count: txs.filter(
            (x) => String(x?.event_type || "") === "wallet_deposit",
          ).length,
        },
      });
    } catch {
      setWalletLedgerTransactions([]);
    }
    try {
      const { data: payoutsData } = await api.get<{
        requests?: Array<{
          id: string;
          amount: number;
          bank_details: Record<string, unknown>;
          status: string;
          admin_notes?: string;
          transaction_id?: string;
          created_at: string;
          processed_at?: string;
        }>;
      }>("/payouts/me");
      setPayoutRequests(payoutsData?.requests || []);
    } catch {
      setPayoutRequests([]);
    }
  }, []);

  const buildWithdrawBankDetails = useCallback((): Record<
    string,
    unknown
  > | null => {
    const isProvider = user?.role === UserRole.PROVIDER;
    const account = selectedWithdrawAccount ?? bankAccounts[0];
    if (isProvider || withdrawChannel === "bank_transfer") {
      if (!account) return null;
      return {
        provider_name: account.provider_name,
        account_number: account.account_number,
        account_name: account.account_name,
        channel: "bank_transfer",
      };
    }
    if (withdrawChannel === "promptpay") return { channel: "promptpay" };
    if (withdrawChannel === "truemoney") return { channel: "truemoney" };
    return null;
  }, [user?.role, withdrawChannel, selectedWithdrawAccount, bankAccounts]);

  const postWithdrawQuoteRaw = useCallback(
    async (amt: number): Promise<PayoutQuoteResponse> => {
      const bank_details = buildWithdrawBankDetails();
      if (!bank_details) {
        throw new Error("missing_bank");
      }
      const isProvider = user?.role === UserRole.PROVIDER;
      const rounded = roundThb2(amt);
      const body = isProvider
        ? {
            amount: rounded,
            bank_details,
            instant_payout: withdrawSpeed === "instant",
          }
        : { amount: rounded, bank_details };
      const { data } = await api.post<PayoutQuoteResponse>(
        "/payouts/quote",
        body,
      );
      return data;
    },
    [buildWithdrawBankDetails, user?.role, withdrawSpeed],
  );

  const computeWithdrawMaxNet = useCallback(async (): Promise<number> => {
    try {
      const qMin = await postWithdrawQuoteRaw(MIN_WITHDRAWAL_THB);
      if (
        qMin.blocking_reason === "wallet_frozen" ||
        qMin.blocking_reason === "withdrawal_rules_not_met"
      ) {
        return 0;
      }
      if (qMin.blocking_reason === "insufficient_balance") return 0;
      const quoteOk = (q: PayoutQuoteResponse) =>
        !q.blocking_reason && !!q.balance_sufficient;
      if (!quoteOk(qMin)) return 0;
      let lo = MIN_WITHDRAWAL_THB;
      const hi = roundThb2(qMin.available_balance ?? 0);
      if (hi < lo) return 0;
      const qHi = await postWithdrawQuoteRaw(hi);
      if (quoteOk(qHi)) return hi;
      let best = lo;
      let hiEff = hi;
      for (let i = 0; i < 28; i++) {
        if (hiEff - lo < 0.01) break;
        const mid = roundThb2((lo + hiEff) / 2);
        if (mid <= lo || mid >= hiEff) break;
        const q = await postWithdrawQuoteRaw(mid);
        if (quoteOk(q)) {
          best = mid;
          lo = mid;
        } else {
          hiEff = mid;
        }
      }
      return roundThb2(best);
    } catch {
      return 0;
    }
  }, [postWithdrawQuoteRaw]);

  buildWithdrawBankDetailsRef.current = buildWithdrawBankDetails;
  postWithdrawQuoteRawRef.current = postWithdrawQuoteRaw;
  computeWithdrawMaxNetRef.current = computeWithdrawMaxNet;

  const withdrawPayoutContextFingerprint = useMemo(() => {
    const accKey = bankAccounts
      .map((a) => `${a.provider_name}:${a.account_number}`)
      .join("|");
    const sel =
      selectedWithdrawAccount?.account_number ??
      bankAccounts[0]?.account_number ??
      "";
    return `${String(user?.role ?? "")}|${withdrawChannel}|${withdrawSpeed}|${accKey}|${sel}|ba${bankAccounts.length}`;
  }, [
    bankAccounts,
    selectedWithdrawAccount?.account_number,
    withdrawChannel,
    withdrawSpeed,
    user?.role,
  ]);

  useEffect(() => {
    if (
      activeModal === "withdraw" &&
      withdrawPrevModalRef.current !== "withdraw"
    ) {
      setWithdrawFlowStep(1);
      setWithdrawSuccessRequestId(null);
      setPayoutQuote(null);
      setPayoutQuoteError(null);
      setPayoutQuoteProvisional(false);
      setAmount("");
      setWithdrawMaxNetEstimate(null);
      payoutQuoteLastSuccessKeyRef.current = null;
      setPayoutQuoteRetryNonce(0);
      setWithdrawThrottleEndsAtMs((prev) =>
        prev != null && Date.now() >= prev ? null : prev,
      );
    }
    withdrawPrevModalRef.current = activeModal;
  }, [activeModal]);

  useEffect(() => {
    if (activeModal !== "withdraw" || withdrawFlowStep === 3) return;
    if (!bankAccounts.length) return;
    if (!buildWithdrawBankDetailsRef.current()) return;

    if (payoutQuoteDebounceTimerRef.current)
      clearTimeout(payoutQuoteDebounceTimerRef.current);

    payoutQuoteDebounceTimerRef.current = setTimeout(() => {
      void (async () => {
        const bd = buildWithdrawBankDetailsRef.current();
        if (!bd) return;

        const seq = ++payoutQuoteReqSeqRef.current;

        let roundedAmt: number;
        let provisional: boolean;
        if (withdrawFlowStep === 1) {
          roundedAmt = MIN_WITHDRAWAL_THB;
          provisional = true;
        } else {
          const rawStr = amount.replace(/,/g, "").trim();
          const raw = parseFloat(rawStr);
          if (!Number.isFinite(raw) || raw <= 0) {
            if (seq !== payoutQuoteReqSeqRef.current) return;
            setPayoutQuote(null);
            setPayoutQuoteProvisional(false);
            setPayoutQuoteError(null);
            setPayoutQuoteLoading(false);
            payoutQuoteLastSuccessKeyRef.current = null;
            return;
          }
          roundedAmt = roundThb2(raw);
          provisional = roundedAmt < MIN_WITHDRAWAL_THB;
        }

        const quotePayloadKey = `${withdrawFlowStep}|${roundedAmt}|${provisional}|${withdrawPayoutContextFingerprint}|s${amount}`;

        if (
          payoutQuoteRetryNonce === 0 &&
          payoutQuoteLastSuccessKeyRef.current === quotePayloadKey
        ) {
          return;
        }

        if (seq !== payoutQuoteReqSeqRef.current) return;
        setPayoutQuoteLoading(true);
        setPayoutQuoteError(null);
        try {
          const data = await postWithdrawQuoteRawRef.current(roundedAmt);
          if (seq !== payoutQuoteReqSeqRef.current) return;
          setPayoutQuote(data);
          setPayoutQuoteProvisional(provisional);
          payoutQuoteLastSuccessKeyRef.current = quotePayloadKey;
          setPayoutQuoteRetryNonce(0);
        } catch (e: unknown) {
          if (seq !== payoutQuoteReqSeqRef.current) return;
          setPayoutQuote(null);
          payoutQuoteLastSuccessKeyRef.current = null;
          const limEnds = extract429ThrottleEndsAtMs(e);
          if (limEnds != null) {
            setWithdrawThrottleEndsAtMs((p) => mergeThrottleEndsAt(p, limEnds));
          }
          setPayoutQuoteError(formatPayoutQuoteClientError(e));
        } finally {
          if (seq !== payoutQuoteReqSeqRef.current) return;
          setPayoutQuoteLoading(false);
        }
      })();
    }, 420);

    return () => {
      if (payoutQuoteDebounceTimerRef.current) {
        clearTimeout(payoutQuoteDebounceTimerRef.current);
        payoutQuoteDebounceTimerRef.current = null;
      }
    };
  }, [
    activeModal,
    withdrawFlowStep,
    amount,
    withdrawPayoutContextFingerprint,
    payoutQuoteRetryNonce,
  ]);

  useEffect(() => {
    if (activeModal !== "withdraw" || withdrawFlowStep !== 2) {
      if (withdrawMaxNetDebounceTimerRef.current) {
        clearTimeout(withdrawMaxNetDebounceTimerRef.current);
        withdrawMaxNetDebounceTimerRef.current = null;
      }
      return;
    }
    if (!bankAccounts.length) return;
    if (!buildWithdrawBankDetailsRef.current()) return;

    if (withdrawMaxNetDebounceTimerRef.current)
      clearTimeout(withdrawMaxNetDebounceTimerRef.current);

    withdrawMaxNetDebounceTimerRef.current = setTimeout(() => {
      void (async () => {
        const seq = ++withdrawMaxNetSeqRef.current;
        setWithdrawMaxNetLoading(true);
        try {
          const maxN = await computeWithdrawMaxNetRef.current();
          if (seq !== withdrawMaxNetSeqRef.current) return;
          setWithdrawMaxNetEstimate(maxN);
        } finally {
          if (seq === withdrawMaxNetSeqRef.current)
            setWithdrawMaxNetLoading(false);
        }
      })();
    }, 900);

    return () => {
      if (withdrawMaxNetDebounceTimerRef.current) {
        clearTimeout(withdrawMaxNetDebounceTimerRef.current);
        withdrawMaxNetDebounceTimerRef.current = null;
      }
    };
  }, [
    activeModal,
    withdrawFlowStep,
    withdrawPayoutContextFingerprint,
    bankAccounts.length,
  ]);

  /** ถอนเงิน — แสดงนับถอยหลัง rate limit และล้าง error ประเภท quota เมื่อพ้นช่วง */
  useEffect(() => {
    if (withdrawThrottleEndsAtMs == null) return;
    const deadline = withdrawThrottleEndsAtMs;
    const clearThrottleBanner = () => {
      setWithdrawThrottleEndsAtMs(null);
      setPayoutQuoteError((prev) =>
        typeof prev === "string" && throttleErrorLikeMessage(prev)
          ? null
          : prev,
      );
    };
    if (Date.now() >= deadline) {
      clearThrottleBanner();
      return;
    }
    const id = window.setInterval(() => {
      setWithdrawThrottleClockTick((c) => c + 1);
      if (Date.now() >= deadline) {
        window.clearInterval(id);
        clearThrottleBanner();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [withdrawThrottleEndsAtMs]);

  /** Refetch wallet when switching to wallet tab or tab becomes visible */
  useEffect(() => {
    if (activeTab !== "wallet") return;
    refreshWalletHistory();
    const onVisible = () => refreshWalletHistory();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [activeTab, refreshWalletHistory]);

  // โหลด Refund Policy จาก Legal Documents (Admin)
  useEffect(() => {
    api
      .get<{
        policy?: { content: string; version: string; published_at: string };
      }>("/compliance/refund")
      .then((res) => {
        const p = res.data?.policy;
        if (p?.content) {
          setRefundPolicyContent(p.content);
          setRefundPolicyVersion(p.version || "");
          if (p.published_at) {
            const d = new Date(p.published_at);
            const day = d.getDate();
            const month = d.getMonth() + 1;
            const year = d.getFullYear() + 543; // พ.ศ.
            setRefundPolicyUpdated(`${day}/${month}/${year}`);
          }
        }
      })
      .catch((err) => console.error("Failed to load refund policy:", err));
  }, []);

  // --- Handlers ---

  const handleFileSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type:
      | "id"
      | "selfie"
      | "avatar"
      | "id_back"
      | "dl_front"
      | "dl_back"
      | "id_front",
  ) => {
    console.log(`handleFileSelect called for type: ${type}`);
    console.log(`Event target files:`, e.target.files);

    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      console.log(
        `File selected for ${type}:`,
        file.name,
        file.size,
        file.type,
      );

      try {
        const base64 = await convertToBase64(file);
        console.log(
          `Base64 conversion successful for ${type}, length: ${base64.length}`,
        );

        const previewUrl = URL.createObjectURL(file);
        console.log(`Preview URL created for ${type}`);
        // ตรวจสอบและจัดการกับ type ที่ต่างกัน
        let actualType = type;
        if (type === "id") {
          console.warn(
            "Warning: Using deprecated type 'id', should use 'id_front'",
          );
          actualType = "id_front";
        }

        switch (type) {
          case "id_front":
            console.log(`Setting idCardImage and idCardPreview`);
            setIdCardImage(base64);
            setIdCardPreview(previewUrl);
            break;
          case "id_back":
            console.log(`Setting idCardBackImage and idCardBackPreview`);
            setIdCardBackImage(base64);
            setIdCardBackPreview(previewUrl);
            break;
          case "selfie":
            console.log(`Setting selfieImage and selfiePreview`);
            setSelfieImage(base64);
            setSelfiePreview(previewUrl);
            break;
          case "dl_front":
            console.log(
              `Setting drivingLicenseFrontImage and drivingLicenseFrontPreview`,
            );
            setDrivingLicenseFrontImage(base64);
            setDrivingLicenseFrontPreview(previewUrl);
            break;
          case "dl_back":
            console.log(
              `Setting drivingLicenseBackImage and drivingLicenseBackPreview`,
            );
            setDrivingLicenseBackImage(base64);
            setDrivingLicenseBackPreview(previewUrl);
            break;
          case "avatar":
            handleAvatarUpload(file);
            break;
        }

        // ตรวจสอบ state ทันทีหลังเซ็ต
        setTimeout(() => {
          console.log(`After setting ${type}:`, {
            idCardImage: idCardImage ? "set" : "null",
            idCardPreview: idCardPreview ? "set" : "null",
          });
        }, 100);
      } catch (error) {
        console.error(`Error processing file for ${type}:`, error);
      }
    } else {
      console.log(`No file selected for ${type}`);
    }
  };

  // ฟังก์ชันแปลง File เป็น Base64
  const convertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };
  const handleAvatarUpload = async (file: File) => {
    setIsAvatarAnalyzing(true);
    try {
      const updatedUser = await MockApi.updateAvatar(file);
      setProfile(updatedUser);
      if (token) login(updatedUser, token);
      notify("Profile picture updated", "success");
    } catch (e: any) {
      notify(e.message, "error");
    } finally {
      setIsAvatarAnalyzing(false);
    }
  };

  // const handleSubmitKYC = async () => {
  //   if (!idCardImage || !selfieImage ) {
  //    notify("Please upload both documents", "error");
  //     return;
  //   }
  //   setSubmittingKYC(true);
  //   try {
  //     const updatedUser = await MockApi.submitKYC({
  //       front: idCardImage,
  //       selfie: selfieImage,
  //     });
  //     setProfile(updatedUser);
  //     if (token) login(updatedUser, token);
  //     notify("KYC submitted successfully", "success");
  //     setIdCardPreview(null);
  //      setSelfiePreview(null);
  //      setIdCardImage(null);
  //     setSelfieImage(null);
  //   } catch (e: any) {
  //     notify(e.message, "error");
  //   } finally {
  //     setSubmittingKYC(false);
  //   }
  // };
  const handleSubmitKYC = async () => {
    console.log("handleSubmitKYC called");
    console.log("FullName:", fullName);
    //console.log("ID Card Preview:", idCardPreview ? "Exists" : "Null");
    // console.log("ID Card Back Preview:", idCardBackPreview ? "Exists" : "Null");
    // console.log("DL Front Preview:",drivingLicenseFrontPreview ? "Exists" : "Null");
    // console.log("DL Back Preview:",drivingLicenseBackPreview ? "Exists" : "Null");
    console.log("2. BirthDate:", birthDate);
    console.log("3. ID Card Number:", idCardNumber);
    console.log(
      "4. idCardImage:",
      idCardImage ? `Base64 (${idCardImage.length} chars)` : "NULL",
    );
    console.log(
      "5. selfieImage:",
      selfieImage ? `Base64 (${selfieImage.length} chars)` : "NULL",
    );
    console.log("6. idCardPreview:", idCardPreview || "NULL");
    console.log("7. selfiePreview:", selfiePreview || "NULL");

    if (!fullName || !birthDate || !idCardNumber) {
      notify("กรุณากรอกข้อมูลพื้นฐาน (ชื่อ, วันเกิด, เลขบัตรประชาชน)", "error");
      return;
    }

    // ตรวจสอบ Base64
    if (!idCardImage) {
      console.error("idCardImage is null - front ID card not uploaded");
      notify("กรุณาอัปโหลดบัตรประชาชนหน้า", "error");
      return;
    }

    if (!selfieImage) {
      console.error("selfieImage is null - selfie not uploaded");
      notify("กรุณาอัปโหลดรูปเซลฟี่", "error");
      return;
    }

    // ตรวจสอบว่าเป็น Base64 จริง
    if (!idCardImage.startsWith("data:image/")) {
      console.error(
        "idCardImage is not valid Base64:",
        idCardImage.substring(0, 50),
      );
      notify("รูปบัตรประชาชนไม่ถูกต้อง กรุณาอัปโหลดใหม่", "error");
      return;
    }

    if (!idCardFrontFile || !selfiePhotoFile) {
      notify(
        "ไม่พบไฟล์รูป — โปรดเลือกอัปโหลดรูปบัตรหน้าและเซลฟี่อีกครั้งแล้วกดส่ง",
        "error",
      );
      return;
    }

    console.log("All checks passed, submitting KYC...");
    setSubmittingKYC(true);
    try {
      const result = await MockApi.submitEnhancedKYC({
        fullName: fullName.trim(),
        birthDate,
        idCardNumber: idCardNumber.trim(),
        idCardFront: idCardFrontFile,
        selfiePhoto: selfiePhotoFile,
        idCardBack: idCardBackFile ?? undefined,
        drivingLicenseFront: drivingLicenseFrontFile ?? undefined,
        drivingLicenseBack: drivingLicenseBackFile ?? undefined,
      });

      notify(result.message || "ส่งข้อมูลยืนยันตัวตนสำเร็จ", "success");

      if (idCardPreview) URL.revokeObjectURL(idCardPreview);
      if (idCardBackPreview) URL.revokeObjectURL(idCardBackPreview);
      if (selfiePreview) URL.revokeObjectURL(selfiePreview);
      if (drivingLicenseFrontPreview)
        URL.revokeObjectURL(drivingLicenseFrontPreview);
      if (drivingLicenseBackPreview)
        URL.revokeObjectURL(drivingLicenseBackPreview);

      // อัพเดทโปรไฟล์
      const updatedUser = await MockApi.getProfile();
      setProfile(updatedUser);
      setFullName("");
      setBirthDate("");
      setIdCardNumber("");
      setIdCardPreview(null);
      setIdCardBackPreview(null);
      setSelfiePreview(null);
      setDrivingLicenseFrontPreview(null);
      setDrivingLicenseBackPreview(null);
      setIdCardFrontFile(null);
      setIdCardBackFile(null);
      setSelfiePhotoFile(null);
      setDrivingLicenseFrontFile(null);
      setDrivingLicenseBackFile(null);
    } catch (e: any) {
      notify(e.message || "ส่งข้อมูลไม่สำเร็จ", "error");
    } finally {
      setSubmittingKYC(false);
    }
  };
  // ฟังก์ชันรีเซ็ตฟอร์ม
  const resetForm = () => {
    console.log("resetForm called!");
    // ลบ Blob URLs เพื่อปล่อย memory
    if (idCardPreview) URL.revokeObjectURL(idCardPreview);
    if (idCardBackPreview) URL.revokeObjectURL(idCardBackPreview);
    if (selfiePreview) URL.revokeObjectURL(selfiePreview);
    if (drivingLicenseFrontPreview)
      URL.revokeObjectURL(drivingLicenseFrontPreview);
    if (drivingLicenseBackPreview)
      URL.revokeObjectURL(drivingLicenseBackPreview);

    // รีเซ็ต state
    setFullName("");
    setBirthDate("");
    setIdCardNumber("");

    // รีเซ็ต Base64
    setIdCardImage(null);
    setIdCardBackImage(null);
    setSelfieImage(null);
    setDrivingLicenseFrontImage(null);
    setDrivingLicenseBackImage(null);

    // รีเซ็ต Preview URLs
    setIdCardPreview(null);
    setIdCardBackPreview(null);
    setSelfiePreview(null);
    setDrivingLicenseFrontPreview(null);
    setDrivingLicenseBackPreview(null);

    // รีเซ็ต input files
    if (idCardInputRef.current) idCardInputRef.current.value = "";
    if (idCardBackInputRef.current) idCardBackInputRef.current.value = "";
    if (selfieInputRef.current) selfieInputRef.current.value = "";
    if (drivingLicenseFrontInputRef.current)
      drivingLicenseFrontInputRef.current.value = "";
    if (drivingLicenseBackInputRef.current)
      drivingLicenseBackInputRef.current.value = "";
  };

  const handleEnrollCourse = async (courseId: string) => {
    try {
      const updatedUser = await MockApi.enrollTraining(courseId);
      setProfile(updatedUser);
      setCourses((prev) =>
        prev.map((c) =>
          c.id === courseId ? { ...c, status: TrainingStatus.IN_PROGRESS } : c,
        ),
      );
      notify("Enrolled successfully!", "success");
      setActiveCourseId(courseId);
      setViewMode("learn");
    } catch (e) {
      notify("Enrollment failed", "error");
    }
  };

  const handleContinueCourse = (courseId: string) => {
    setActiveCourseId(courseId);
    setViewMode("learn");
  };

  const handleQuizComplete = async (score: number) => {
    if (!activeCourseId) return;
    try {
      const updatedUser = await MockApi.completeTraining(activeCourseId, score);
      setProfile(updatedUser);
      if (token) login(updatedUser, token);

      setCourses((prev) =>
        prev.map((c) =>
          c.id === activeCourseId
            ? { ...c, status: TrainingStatus.COMPLETED }
            : c,
        ),
      );

      notify("Course Completed! Skill Unlocked.", "success");
      setViewMode("list");
      setActiveCourseId(null);
    } catch (e) {
      notify("Failed to update progress", "error");
    }
  };

  const uploadWalletDepositSlipToServer = async (
    file: File,
    chargeId: string,
  ) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("charge_id", chargeId);
    const { data } = await api.post<{
      success?: boolean;
      error?: string;
      url?: string;
    }>("/wallet/deposit-slip", fd);
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const isGatewayAutoSourceType = (sourceType: string | null | undefined) => {
    const st = String(sourceType || "").toLowerCase();
    if (!st) return false;
    return ["payso", "ksher", "card", "truemoney", "mobile_banking"].includes(
      st,
    );
  };

  const clearPaysoAutoCloseCountdown = () => {
    if (paysoAutoCloseTimerRef.current) {
      clearInterval(paysoAutoCloseTimerRef.current);
      paysoAutoCloseTimerRef.current = null;
    }
    setPaysoAutoCloseCountdown(null);
  };

  const startPaysoAutoCloseCountdown = (successMessage = "เติมเงินสำเร็จ") => {
    if (paysoAutoCloseTimerRef.current || paysoAutoCloseCountdown !== null)
      return;
    setPaysoAutoCloseCountdown(5);
    paysoAutoCloseTimerRef.current = setInterval(() => {
      setPaysoAutoCloseCountdown((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          if (paysoAutoCloseTimerRef.current) {
            clearInterval(paysoAutoCloseTimerRef.current);
            paysoAutoCloseTimerRef.current = null;
          }
          void finishDepositSuccessUi(successMessage);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const clearPaysoDepositPolling = useCallback(() => {
    if (paysoPollTimerRef.current) {
      clearTimeout(paysoPollTimerRef.current);
      paysoPollTimerRef.current = null;
    }
  }, []);

  const triggerPaysoManualStatusCheck = useCallback(() => {
    const now = Date.now();
    if (now - paysoManualPollAtRef.current < 2000) {
      notify(PAYSO_UX_TEXT.retryTooSoon, "info");
      return;
    }
    paysoManualPollAtRef.current = now;
    if (paysoSoftTimeoutRef.current) {
      paysoPollCountRef.current = 0;
    }
    paysoSoftTimeoutRef.current = false;
    setPaysoPollSoftTimeout(false);
    clearPaysoDepositPolling();
    void paysoPollTickRef.current?.(true);
  }, [notify, clearPaysoDepositPolling]);

  useEffect(() => {
    return () => {
      clearPaysoDepositPolling();
      paysoPollStopRef.current = true;
      if (paysoAutoCloseTimerRef.current) {
        clearInterval(paysoAutoCloseTimerRef.current);
        paysoAutoCloseTimerRef.current = null;
      }
    };
  }, [clearPaysoDepositPolling]);

  const refreshProfileFromBackend = useCallback(async () => {
    const targetId =
      user?.id ||
      profile?.id ||
      localStorage.getItem("meerak_user_id") ||
      undefined;
    const updatedUser = await MockApi.getProfile(targetId, { refresh: true });
    if (updatedUser) {
      setProfile(updatedUser);
      if (token) login(updatedUser, token);
    }
    return updatedUser;
  }, [user?.id, profile?.id, token, login]);

  const finishDepositSuccessUi = async (successMessage = "เติมเงินสำเร็จ") => {
    clearPaysoAutoCloseCountdown();
    clearPaysoDepositPolling();
    paysoPollStopRef.current = true;
    setPaysoPollBanner(null);
    setPaysoGatewayWarn(false);
    setPaysoCreditErrBanner(null);
    setPaysoLastStatusPayload(null);
    setPaysoPollSoftTimeout(false);
    paysoSoftTimeoutRef.current = false;
    paysoSuccessHandledRef.current = false;
    await refreshProfileFromBackend();
    await refreshWalletHistory();
    notify(successMessage, "success");
    setActiveModal(null);
    setAmount("");
    setDepositStep("amount");
    setDepositQrUrl(null);
    setDepositPaymentId(null);
    walletDepositChargeSourceRef.current = null;
    setDepositChargeSourceType(null);
    setDepositMethod(null);
    setDepositSuccessPendingSlip(false);
    setSlipFile(null);
    setManualStaticSlipFile(null);
    setDepositOtherChannelsOpen(false);
    setManualStaticQrExpanded(true);
    setCardFormData({ number: "", name: "", expiry: "", cvc: "" });
    setProcessing(false);
    setWalletDepositM1Step(null);
    setWalletM1Method(null);
    setManualDepositSubmitResult(null);
    setWalletDepositPreview(null);
    setWalletDepositPreviewError(null);
  };

  /** Shared PaySo status polling for PromptPay QR and Mobile Banking when PaySo returns QR. */
  const startPaysoWalletStatusPolling = useCallback(
    (chargeId: string) => {
      const pollMax = 120;

      const scheduleAfter = (delayMs: number) => {
        clearPaysoDepositPolling();
        paysoPollTimerRef.current = setTimeout(() => {
          void runPollTick(false);
        }, delayMs);
      };

      const runPollTick = async (fromManual?: boolean) => {
        const manual = Boolean(fromManual);
        if (paysoPollStopRef.current) return;
        if (paysoSoftTimeoutRef.current && !manual) return;

        if (paysoPollCountRef.current >= pollMax) {
          if (!paysoSoftTimeoutRef.current) {
            paysoSoftTimeoutRef.current = true;
            setPaysoPollSoftTimeout(true);
            notify(PAYSO_UX_TEXT.softTimeoutNotify, "info");
          }
          return;
        }

        paysoPollCountRef.current += 1;
        const pollIteration = paysoPollCountRef.current;

        try {
          const st = await api.get<WalletDepositStatusResponse>(
            `/wallet/deposit/status/${chargeId}`,
          );
          const payload = st.data;
          setPaysoLastStatusPayload(payload ?? null);
          setPaysoPollBanner(null);

          const payStatus = String(payload?.status ?? "").toLowerCase();
          const rec = payload?.reconcile ?? null;
          const noticeCode = getPaysoReconcileNoticeCode(rec);

          if (
            pollIteration === 1 ||
            payStatus === "success" ||
            payStatus === "failed" ||
            payStatus === "expired"
          ) {
            trackPaysoDepositEvent("deposit_payso_step", {
              step: "poll_observed",
              pollIteration,
              payStatus,
              reconcileChecked: rec?.checked === true,
              reconcilePaid: rec?.paid === true,
              reconcileNoticeCode: noticeCode,
            });
          }
          if (noticeCode && noticeCode !== "awaiting_bank") {
            trackPaysoDepositEvent("deposit_payso_reconcile_error_code", {
              code: noticeCode,
              statusCode: rec?.query?.statusCode ?? null,
            });
          }
          if (noticeCode === "status_auth_failed") {
            setProcessing(false);
            clearPaysoDepositPolling();
            return;
          }

          setPaysoGatewayWarn(hasPaysoUpstreamFailure(rec));
          if (rec?.creditError) {
            setPaysoCreditErrBanner(String(rec.creditError).slice(0, 200));
          } else {
            setPaysoCreditErrBanner(null);
          }

          if (payStatus === "success") {
            paysoPollStopRef.current = true;
            clearPaysoDepositPolling();
            if (paysoSuccessHandledRef.current) return;
            paysoSuccessHandledRef.current = true;
            trackPaysoDepositEvent("deposit_payso_step", {
              step: "success_gate",
              depositSlipUploaded: depositSlipUploadedRef.current,
              sourceType: walletDepositChargeSourceRef.current,
            });
            setPaysoGatewayWarn(false);
            setPaysoCreditErrBanner(null);
            if (
              !depositSlipUploadedRef.current &&
              !isGatewayAutoSourceType(walletDepositChargeSourceRef.current)
            ) {
              depositPendingSuccessMessageRef.current = "เติมเงินสำเร็จ";
              setDepositSuccessPendingSlip(true);
              setProcessing(false);
              return;
            }
            await finishDepositSuccessUi("เติมเงินสำเร็จ");
            return;
          }

          if (payStatus === "failed" || payStatus === "expired") {
            paysoPollStopRef.current = true;
            clearPaysoDepositPolling();
            notify(
              payStatus === "expired"
                ? "QR หมดอายุแล้ว — ลองสร้าง QR ใหม่ได้จากขั้นตอนก่อนหน้า"
                : "การชำระไม่สำเร็จ — ลองสร้าง QR ใหม่หรือติดต่อทีมงานหากมีปัญหา",
              "error",
            );
            setWalletDepositM1Step("enter_amount");
            setDepositQrUrl(null);
            setDepositPaymentId(null);
            clearPaysoAutoCloseCountdown();
            paysoSuccessHandledRef.current = false;
            walletDepositChargeSourceRef.current = null;
            setDepositChargeSourceType(null);
            setProcessing(false);
            setPaysoLastStatusPayload(null);
            setPaysoGatewayWarn(false);
            setPaysoCreditErrBanner(null);
            return;
          }

          const delayMs = computePaysoPollDelayMs(pollIteration);
          scheduleAfter(delayMs);
        } catch (e: unknown) {
          const ax = e as { response?: { status?: number }; message?: string };
          const status = ax?.response?.status;
          if (status === 401 || status === 403) {
            setPaysoPollBanner({
              kind: "auth",
              message: PAYSO_UX_TEXT.authExpired,
            });
          } else if (typeof status === "number" && status >= 500) {
            setPaysoPollBanner({
              kind: "server",
              message: PAYSO_UX_TEXT.serverTemporary,
            });
          } else {
            setPaysoPollBanner({
              kind: "network",
              message: PAYSO_UX_TEXT.networkTemporary,
            });
          }
          const delayMs = computePaysoPollDelayMs(paysoPollCountRef.current);
          scheduleAfter(delayMs);
        }
      };

      paysoPollTickRef.current = runPollTick;
      scheduleAfter(3000);
    },
    [
      clearPaysoDepositPolling,
      notify,
      trackPaysoDepositEvent,
      finishDepositSuccessUi,
    ],
  );

  const handleDeposit = async () => {
    if (!amount || isNaN(Number(amount))) return;
    setProcessing(true);
    try {
      const updatedUser = await MockApi.walletTopUp(Number(amount));
      setProfile(updatedUser);
      if (token) login(updatedUser, token);
      refreshWalletHistory();
      notify("Deposit successful", "success");
      setActiveModal(null);
      setAmount("");
      setDepositStep("amount");
      setDepositQrUrl(null);
      setDepositPaymentId(null);
    } catch (e) {
      notify("Deposit failed", "error");
    }
    setProcessing(false);
  };

  const handleDepositWithPromptPay = async () => {
    if (!user || !amount || isNaN(Number(amount))) return;
    const amt = Number(amount);
    trackPaysoDepositEvent("deposit_payso_step", {
      step: "create_requested",
      amount: amt,
    });
    clearPaysoDepositPolling();
    paysoPollStopRef.current = false;
    paysoSoftTimeoutRef.current = false;
    paysoPollCountRef.current = 0;
    paysoPollTickRef.current = null;
    setPaysoPollSoftTimeout(false);
    setPaysoPollBanner(null);
    setPaysoGatewayWarn(false);
    setPaysoCreditErrBanner(null);
    setPaysoLastStatusPayload(null);
    depositSlipUploadedRef.current = false;
    walletDepositChargeSourceRef.current = null;
    setDepositChargeSourceType(null);
    setDepositSuccessPendingSlip(false);
    setSlipFile(null);
    setProcessing(true);
    setDepositQrUrl(null);
    setDepositPaymentId(null);
    clearPaysoAutoCloseCountdown();
    paysoSuccessHandledRef.current = false;
    try {
      const returnUri =
        typeof window !== "undefined"
          ? `${window.location.origin}/profile`
          : "";
      const { data } = await api.post<WalletDepositCreateResponse>(
        "/wallet/deposit/payso",
        {
          amount: amt,
          payment_method: "promptpay",
          return_uri: returnUri,
        },
      );
      if (data?.error) {
        notify(data.error, "error");
        setProcessing(false);
        return;
      }
      const chargeId = data?.charge_id;
      const qrOrUri = data?.qr_code_url || data?.authorization_uri;
      if (!chargeId) {
        notify("ไม่ได้รับ charge_id จากระบบ", "error");
        setProcessing(false);
        return;
      }
      setDepositPaymentId(chargeId);
      const ctype = "payso";
      walletDepositChargeSourceRef.current = ctype;
      setDepositChargeSourceType(ctype);
      setDepositQrUrl(qrOrUri || null);
      setWalletDepositM1Step("payso_qr");
      trackPaysoDepositEvent("deposit_payso_step", {
        step: "qr_created",
        hasQrCodeUrl: !!data?.qr_code_url,
        hasAuthorizationUri: !!data?.authorization_uri,
      });

      startPaysoWalletStatusPolling(chargeId);
    } catch (e: any) {
      notify(
        e?.response?.data?.error || e?.message || "Deposit failed",
        "error",
      );
      trackPaysoDepositEvent("deposit_payso_step", {
        step: "create_failed",
        statusCode: e?.response?.status ?? null,
      });
      setWalletDepositM1Step("enter_amount");
      setDepositQrUrl(null);
      setDepositPaymentId(null);
      clearPaysoAutoCloseCountdown();
      paysoSuccessHandledRef.current = false;
      walletDepositChargeSourceRef.current = null;
      setDepositChargeSourceType(null);
      setProcessing(false);
      clearPaysoDepositPolling();
      setPaysoPollBanner(null);
      setPaysoGatewayWarn(false);
      setPaysoCreditErrBanner(null);
      setPaysoLastStatusPayload(null);
      setPaysoPollSoftTimeout(false);
    }
  };

  const handleDepositWithPaysoRedirect = async (
    paymentMethod: "card" | "truemoney" | "mobile_banking",
    opts: {
      trackStep: string;
      openNotify: string;
      missingUriError: string;
      failNotify: string;
    },
  ) => {
    if (!user || !amount || isNaN(Number(amount))) return;
    const amt = Number(amount);
    trackPaysoDepositEvent("deposit_payso_step", {
      step: opts.trackStep,
      amount: amt,
      paymentMethod,
    });
    clearPaysoDepositPolling();
    paysoPollStopRef.current = false;
    paysoSoftTimeoutRef.current = false;
    paysoPollCountRef.current = 0;
    paysoPollTickRef.current = null;
    setPaysoPollSoftTimeout(false);
    setPaysoPollBanner(null);
    setPaysoGatewayWarn(false);
    setPaysoCreditErrBanner(null);
    setPaysoLastStatusPayload(null);
    depositSlipUploadedRef.current = false;
    walletDepositChargeSourceRef.current = null;
    setDepositChargeSourceType(null);
    setDepositSuccessPendingSlip(false);
    setSlipFile(null);
    setProcessing(true);
    setDepositQrUrl(null);
    setDepositPaymentId(null);
    clearPaysoAutoCloseCountdown();
    paysoSuccessHandledRef.current = false;
    try {
      const returnUri =
        typeof window !== "undefined"
          ? `${window.location.origin}/profile`
          : "";
      const { data } = await api.post<WalletDepositCreateResponse>(
        "/wallet/deposit",
        {
          amount: amt,
          payment_method: paymentMethod,
          return_uri: returnUri,
        },
      );
      if (data?.error) {
        notify(data.error, "error");
        setProcessing(false);
        return;
      }
      const chargeId = data?.charge_id;
      const authUri = data?.authorization_uri ?? null;
      if (!chargeId || !authUri) {
        notify(data?.error || opts.missingUriError, "error");
        setProcessing(false);
        return;
      }

      setDepositPaymentId(chargeId);
      const ctype = String(data?.source_type || "payso").toLowerCase();
      walletDepositChargeSourceRef.current = ctype;
      setDepositChargeSourceType(ctype);
      trackPaysoDepositEvent("deposit_payso_step", {
        step: `${paymentMethod}_redirect_created`,
        amount: amt,
        hasAuthUri: true,
      });
      notify(opts.openNotify, "info");
      window.open(authUri, "_blank", "noopener,noreferrer");
      startPaysoWalletStatusPolling(chargeId);
    } catch (e: unknown) {
      const ax = e as {
        response?: { data?: { error?: string } };
        message?: string;
      };
      notify(
        ax?.response?.data?.error || ax?.message || opts.failNotify,
        "error",
      );
      setProcessing(false);
    }
  };

  const handleDepositWithCard = async () => {
    await handleDepositWithPaysoRedirect("card", {
      trackStep: "card_create_requested",
      openNotify:
        "เปิดหน้า Pay Solutions เพื่อกรอกข้อมูลบัตรอย่างปลอดภัย — ระบบจะเครดิตอัตโนมัติหลังชำระสำเร็จ",
      missingUriError:
        "ไม่ได้รับลิงก์ชำระบัตรจาก PaySo — ลองใหม่หรือติดต่อฝ่ายสนับสนุน",
      failNotify: "การเติมเงินด้วยบัตรล้มเหลว",
    });
  };

  const handleDepositTrueMoney = async () => {
    await handleDepositWithPaysoRedirect("truemoney", {
      trackStep: "truemoney_create_requested",
      openNotify:
        "เปิดหน้า Pay Solutions เพื่อชำระด้วย TrueMoney — ระบบจะเครดิตอัตโนมัติหลังชำระสำเร็จ",
      missingUriError:
        "ไม่ได้รับลิงก์ชำระ TrueMoney จาก PaySo — ลองใหม่หรือติดต่อฝ่ายสนับสนุน",
      failNotify: "การเติมเงินผ่าน TrueMoney ล้มเหลว",
    });
  };

  const handleDepositMobileBanking = async () => {
    await handleDepositWithPaysoRedirect("mobile_banking", {
      trackStep: "mobile_banking_create_requested",
      openNotify:
        "เปิดหน้า Pay Solutions เพื่อชำระผ่าน Mobile Banking — ระบบจะเครดิตอัตโนมัติหลังชำระสำเร็จ",
      missingUriError:
        "ไม่ได้รับลิงก์ชำระ Mobile Banking จาก PaySo — ลองใหม่หรือติดต่อฝ่ายสนับสนุน",
      failNotify: "การเติมเงินผ่าน Mobile Banking ล้มเหลว",
    });
  };

  const handleDepositBankTransfer = async () => {
    if (!user || !amount || isNaN(Number(amount))) return;
    if (!bankAccounts.length) {
      notify(
        "กรุณาเพิ่มบัญชีใน Settings → Payment Methods ก่อนเติมเงินผ่านโอนธนาคาร",
        "error",
      );
      return;
    }
    const amt = Number(amount);
    const refIdLocal = `topup_${user.id}_${Date.now()}`;
    const billNo = `BL-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;
    const txNo = `TX-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;
    setBankTransferRef({
      refId: refIdLocal,
      bill_no: billNo,
      transaction_no: txNo,
    });
    try {
      await recordPaymentCreated({
        payment_id: refIdLocal,
        gateway: "bank_transfer",
        job_id: refIdLocal,
        amount: amt,
        currency: "THB",
        bill_no: billNo,
        transaction_no: txNo,
        user_id: user.id,
        metadata: { source: "wallet_topup" },
      });
    } catch (e) {
      console.warn("Ledger recordPaymentCreated failed:", e);
    }
    setDepositStep("bank_show");
  };

  const handleConfirmBankTransferDone = async () => {
    if (!user || !amount || isNaN(Number(amount)) || !bankTransferRef) return;
    if (!slipFile) {
      notify("กรุณาแนบสลิปการโอนเป็นหลักฐาน", "error");
      return;
    }
    const amt = Number(amount);
    setProcessing(true);
    try {
      const fd = new FormData();
      fd.append("file", slipFile);
      const { data: up } = await api.post<{ url?: string; success?: boolean }>(
        "/upload/form",
        fd,
      );
      const slipUrl = up?.url || (up as { secure_url?: string }).secure_url;
      if (!slipUrl) throw new Error("อัปโหลดสลิปไม่สำเร็จ");
      const updatedUser = await MockApi.walletTopUp(amt, {
        gateway: "bank_transfer",
        payment_id: bankTransferRef.refId,
        job_id: bankTransferRef.refId,
        bill_no: bankTransferRef.bill_no,
        transaction_no: bankTransferRef.transaction_no,
        slip_url: slipUrl,
      });
      setProfile(updatedUser);
      if (token) login(updatedUser, token);
      refreshWalletHistory();
      notify(
        "ยืนยันการโอนแล้ว — ยอดจะเข้าภายใน 24 ชม. (หรือเมื่อตรวจสอบแล้ว)",
        "success",
      );
      setActiveModal(null);
      setAmount("");
      setBankTransferRef(null);
      setDepositStep("amount");
      setDepositMethod(null);
      setSlipFile(null);
    } catch (e: any) {
      notify(e?.response?.data?.error || e?.message || "Failed", "error");
    }
    setProcessing(false);
  };

  /** เติมเงินแบบ QR พร้อมเพย์นิ่ง (KTB) + สลิป — คิวรอแอดมิน (ไม่เครดิตทันที / ไม่สร้าง ledger ฝั่ง client) */
  const handleSubmitManualStaticSlip = async () => {
    if (!user || !amount || isNaN(Number(amount))) return;
    if (!manualStaticSlipFile) {
      notify("กรุณาเลือกไฟล์สลิป", "error");
      return;
    }
    const amt = Number(amount);
    profileAgentLog({
      hypothesisId: "H3",
      location: "mobile/pages/Profile.tsx:handleSubmitManualStaticSlip:start",
      message: "manual deposit submit requested",
      data: { amount: amt, filePresent: !!manualStaticSlipFile },
    });
    setProcessing(true);
    try {
      const fd = new FormData();
      fd.append("amount", String(amt));
      fd.append("file", manualStaticSlipFile);
      const { data } = await api.post<WalletDepositManualCreateResponse>(
        "/wallet/deposit/manual",
        fd,
      );
      setManualDepositSubmitResult({
        id: data?.id,
        status: data?.status ?? "manual_pending_verification",
        amount: data?.amount,
      });
      profileAgentLog({
        hypothesisId: "H3",
        location:
          "mobile/pages/Profile.tsx:handleSubmitManualStaticSlip:success",
        message: "manual deposit submit succeeded",
        data: {
          status: data?.status || null,
          amount: data?.amount || null,
          nextStep: "manual_done",
        },
      });
      setWalletDepositM1Step("manual_done");
      setManualStaticSlipFile(null);
      notify("ส่งสลิปแล้ว — รอทีมตรวจสอบ", "success");
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || "ล้มเหลว";
      profileAgentLog({
        hypothesisId: "H3",
        location: "mobile/pages/Profile.tsx:handleSubmitManualStaticSlip:error",
        message: "manual deposit submit failed",
        data: { error: msg },
      });
      notify(msg, "error");
    }
    setProcessing(false);
  };

  const handleWithdraw = async () => {
    if (!amount || isNaN(Number(amount))) return;
    const amt = roundThb2(parseFloat(String(amount).replace(/,/g, "")));
    if (amt < MIN_WITHDRAWAL_THB) {
      notify(`ขั้นต่ำถอน ${MIN_WITHDRAWAL_THB} บาท`, "error");
      return;
    }
    const isProvider = user?.role === UserRole.PROVIDER;
    const account = selectedWithdrawAccount ?? bankAccounts[0];
    if (isProvider && !account) {
      notify(
        "กรุณาเพิ่มบัญชีรับเงินใน Settings → Payment Methods ก่อนถอนเงิน",
        "error",
      );
      return;
    }
    if (withdrawChannel === "bank_transfer" && !isProvider && !account) {
      notify(
        "กรุณาเพิ่มบัญชีรับเงินใน Settings → Payment Methods ก่อนถอนเงิน",
        "error",
      );
      return;
    }
    const bank_details = buildWithdrawBankDetails();
    if (!bank_details) {
      notify(
        "กรุณาเพิ่มบัญชีรับเงินใน Settings → Payment Methods ก่อนถอนเงิน",
        "error",
      );
      return;
    }
    setProcessing(true);
    try {
      const q = await postWithdrawQuoteRaw(amt);
      setPayoutQuote(q);
      setPayoutQuoteProvisional(false);
      if (q.blocking_reason && q.blocking_message_th) {
        notify(q.blocking_message_th, "error");
        return;
      }
      if (q.blocking_reason) {
        notify("ไม่สามารถถอนได้ในขณะนี้", "error");
        return;
      }
      const { data } = await api.post<{
        request?: { id: string };
        error?: string;
      }>(
        "/payouts/request",
        isProvider
          ? {
              amount: amt,
              bank_details,
              instant_payout: withdrawSpeed === "instant",
            }
          : { amount: amt, bank_details },
      );
      if (data?.error) {
        notify(data.error, "error");
        return;
      }
      const reqId = data?.request?.id;
      const updatedUser = await MockApi.getProfile();
      if (updatedUser) {
        setProfile(updatedUser);
        if (token) login(updatedUser, token);
      }
      await refreshWalletHistory();
      if (user?.role === UserRole.PROVIDER) {
        try {
          const { data: eligData } = await api
            .get<{
              eligible: boolean;
              completed_jobs: number;
              balance: number;
              min_jobs: number;
              min_balance_thb: number;
              reason: string | null;
              pending: number;
              fee_standard_thb: number;
              fee_instant_thb: number;
            }>("/payouts/eligibility")
            .catch(() => ({ data: null }));
          if (eligData) setPayoutEligibility(eligData);
        } catch (_) {}
      }
      notify("ส่งคำขอถอนแล้ว — เก็บเลขอ้างอิงไว้สำหรับติดตาม", "success");
      if (reqId) setWithdrawSuccessRequestId(reqId);
      setWithdrawFlowStep(3);
      setAmount("");
    } catch (e: unknown) {
      const limEnds = extract429ThrottleEndsAtMs(e);
      if (limEnds != null) {
        setWithdrawThrottleEndsAtMs((p) => mergeThrottleEndsAt(p, limEnds));
      }
      const msg =
        (e as { response?: { data?: { error?: string } } }).response?.data
          ?.error ??
        (e instanceof Error ? e.message : null) ??
        "เกิดข้อผิดพลาด";
      notify(msg, "error");
    } finally {
      setProcessing(false);
    }
  };

  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    const slot: AvailabilitySlot = { id: Date.now(), ...newSlot };
    const updatedAvail = [...(profile?.availability || []), slot];
    const updatedUser = await MockApi.updateProfile({
      availability: updatedAvail,
    });
    setProfile(updatedUser);
    if (token) login(updatedUser, token);
    notify("Slot added", "success");
  };

  const handleDeleteSlot = async (id: number) => {
    const updatedAvail = profile?.availability?.filter((s) => s.id !== id);
    const updatedUser = await MockApi.updateProfile({
      availability: updatedAvail,
    });
    setProfile(updatedUser);
    if (token) login(updatedUser, token);
    notify("Slot removed", "success");
  };

  if (!profile)
    return (
      <div className="p-8 text-center text-slate-400">
        {t("common.loading")}
      </div>
    );

  const activeCourse = courses.find((c) => c.id === activeCourseId);
  const isPlatinum =
    (profile?.vip_tier ?? user?.vip_tier ?? "").toLowerCase() === "platinum";

  const isProviderProfile =
    profile.role === UserRole.PROVIDER || profile.role === "provider";

  const goProfileTab = (
    tab:
      | "info"
      | "reviews"
      | "wallet"
      | "earnings"
      | "calendar"
      | "portfolio"
      | "story"
      | "connection",
  ) => {
    setActiveTab(tab);
    setSearchParams(tab === "info" ? {} : { tab }, { replace: true });
  };

  const providerQuickNav = [
    {
      id: "portfolio" as const,
      icon: Briefcase,
      title: language === "en" ? "Portfolio" : "ผลงาน / Expert",
      desc:
        language === "en"
          ? "Skills, photos, services"
          : "ทักษะ รูปผลงาน บริการ",
    },
    {
      id: "story" as const,
      icon: PlayCircle,
      title: language === "en" ? "Work clips" : "คลิปผลงาน",
      desc:
        language === "en" ? "Upload & promote clips" : "อัปโหลดและโปรโมตคลิป",
    },
    {
      id: "connection" as const,
      icon: Network,
      title: language === "en" ? "Connection" : "เครือข่าย",
      desc: language === "en" ? "Coach & trainee links" : "โค้ช / ลูกทีม",
    },
  ];

  return (
    <div className="profile-page max-w-5xl mx-auto space-y-8 pb-20">
      {profile.brand_adviser_suspend_warning && (
        <BrandAdviserSuspendBanner
          show
          daysLeft={profile.days_until_suspend_estimate ?? undefined}
          className="mb-2"
        />
      )}
      {profile.is_brand_adviser &&
        profile.brand_adviser_program_enabled === false && (
          <BrandAdviserProgramOffNotice className="mb-2" />
        )}
      {profile.is_brand_adviser && (
        <BrandAdviserReputationHint className="mb-4 max-w-2xl mx-auto md:mx-0 text-center md:text-left" />
      )}
      <CourseSkillBadgesStrip />
      {/* Profile Header - Dark Premium / Platinum */}
      <div
        className={
          isPlatinum
            ? "platinum-card-premium rounded-[20px] p-6 sm:p-8 flex flex-col md:flex-row items-center md:items-start gap-6 relative overflow-hidden platinum-glow"
            : "luxury-card rounded-[20px] p-6 sm:p-8 flex flex-col md:flex-row items-center md:items-start gap-6 relative overflow-hidden"
        }
      >
        <div className="relative group">
          <div
            className={
              isPlatinum
                ? "w-24 h-24 rounded-[20px] overflow-hidden border-2 border-gold/30 shadow-gold-badge"
                : "w-24 h-24 rounded-[20px] overflow-hidden border-2 border-gold/10"
            }
          >
            <img
              src={
                profile.avatar_url ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || "U")}&background=6366f1&color=fff`
              }
              alt={profile.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || "U")}&background=6366f1&color=fff`;
              }}
            />
            {isAvatarAnalyzing && (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white text-xs">
                <Scan className="animate-pulse mb-1" size={20} /> Analyzing...
              </div>
            )}
          </div>
          <button
            onClick={() => avatarInputRef.current?.click()}
            className="absolute bottom-0 right-0 bg-charcoal-800 p-1.5 rounded-xl shadow border border-gold-subtle text-slate-400 hover:text-white hover:bg-charcoal-700"
          >
            <Camera size={14} />
          </button>
          <input
            type="file"
            ref={avatarInputRef}
            className="hidden"
            accept="image/*"
            onChange={(e) => handleFileSelect(e, "avatar")}
          />
        </div>

        <div className="flex-1 text-center md:text-left">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-50 flex items-center justify-center md:justify-start gap-2 flex-wrap font-sans">
            {profile.name}
            <UserDisplayBadge
              vipTier={profile?.vip_tier ?? user?.vip_tier}
              isCoach={isCoach}
              size="md"
              showLabel
            />
            <BrandAdviserBadge
              isBrandAdviser={profile.is_brand_adviser}
              adviserStatus={profile.adviser_status}
              tone="dark"
            />
            {kycProfileShowsVerified(profile.kyc_level, kycDocGate) && (
              <ShieldCheck className="text-emerald-400" size={20} />
            )}
          </h1>
          <p className="text-slate-400 text-sm mb-3">
            {profile.email || profile.phone}
          </p>
          <div className="flex flex-wrap gap-2 justify-center md:justify-start">
            <span
              className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wide ${
                profile.role === UserRole.PROVIDER ||
                profile.role === "provider"
                  ? "bg-purple-500/20 text-purple-300"
                  : "bg-slate-600/50 text-slate-300"
              }`}
            >
              {profile.role}
            </span>
            {profile.is_boosted && (
              <span className="px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wide bg-amber-500/20 text-amber-300 flex items-center">
                <Rocket size={12} className="mr-1" /> Boosted
              </span>
            )}
            {(profile?.vip_expiry ?? user?.vip_expiry) &&
              (profile?.vip_tier ?? user?.vip_tier) &&
              (profile?.vip_tier ?? user?.vip_tier) !== "none" && (
                <span className="text-xs text-slate-500">
                  VIP หมดอายุ:{" "}
                  {formatDateThaiShort(profile?.vip_expiry ?? user?.vip_expiry)}
                </span>
              )}
            {typeof (profile?.vip_quota_balance ?? user?.vip_quota_balance) ===
              "number" &&
              (profile?.vip_tier ?? user?.vip_tier) &&
              (profile?.vip_tier ?? user?.vip_tier) !== "none" && (
                <span className="text-xs text-slate-500">
                  สิทธิ์ส่วนลดคงเหลือ:{" "}
                  {(profile?.vip_quota_balance ?? user?.vip_quota_balance) ===
                  999
                    ? "ไม่จำกัด"
                    : (profile?.vip_quota_balance ??
                      user?.vip_quota_balance)}{" "}
                  ครั้ง
                </span>
              )}
            <Link
              to="/vip"
              className="text-xs text-emerald-500 hover:text-emerald-400 font-medium"
            >
              ดู/อัปเกรด VIP
            </Link>
            {/* Worker Grade Badge */}
            {workerGrade && (
              <WorkerGradeBadge
                userId={user?.id || profile?.id || ""}
                variant="compact"
              />
            )}
            {/* Mutual Assurance Badge: Top Guardian / Verified Secure Payer */}
            {(profile?.assurance_badge ?? user?.assurance_badge) ===
              "top_guardian" && (
              <span
                className="px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wide bg-amber-500/20 text-amber-300 border border-amber-400/40 flex items-center gap-1"
                title="Top Guardian — จ่ายประกันสะสมสูง"
              >
                <Shield size={12} /> Top Guardian
              </span>
            )}
            {(profile?.assurance_badge ?? user?.assurance_badge) ===
              "verified_secure_payer" && (
              <span
                className="px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wide bg-blue-500/20 text-blue-300 border border-blue-400/40 flex items-center gap-1"
                title="Verified Secure Payer — มีประกันสะสม"
              >
                <Shield size={12} /> Verified Secure Payer
              </span>
            )}
          </div>

          {isProviderProfile && (
            <div className="mt-4 w-full max-w-xl mx-auto md:mx-0">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 text-center md:text-left">
                {language === "en" ? "Profile shortcuts" : "ทางลัดโปรไฟล์"}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                {providerQuickNav.map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => goProfileTab(item.id)}
                      className={`flex items-center gap-3 w-full p-3 sm:p-3.5 rounded-2xl border text-left transition-all shadow-sm ${
                        active
                          ? "border-emerald-500/50 bg-emerald-500/10 ring-1 ring-emerald-400/30"
                          : "border-gold/15 bg-charcoal-800/40 hover:border-gold/30 hover:bg-charcoal-800/55 active:scale-[0.98]"
                      }`}
                    >
                      <span
                        className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                          active
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-slate-600/40 text-slate-200"
                        }`}
                      >
                        <Icon size={20} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-slate-100 leading-tight">
                          {item.title}
                        </span>
                        <span className="block text-[11px] text-slate-500 mt-0.5 leading-snug">
                          {item.desc}
                        </span>
                      </span>
                      <ChevronRight
                        size={18}
                        className={`shrink-0 ${active ? "text-emerald-400" : "text-slate-500"}`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div className="luxury-card p-5 rounded-[20px] min-w-[200px] text-center md:text-right">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 font-wallet-title">
            {t("profile.wallet_title")}
          </p>
          <p className="text-2xl font-bold number-wallet number-wallet-gold">
            {profile.wallet_balance?.toLocaleString()} ฿
            {(profile?.wallet_frozen ?? user?.wallet_frozen) && (
              <span className="ml-2 text-sm font-normal text-amber-500">
                (ระงับ)
              </span>
            )}
          </p>
          {(profile?.insurance_credit_balance ??
            user?.insurance_credit_balance ??
            0) > 0 && (
            <p className="text-sm font-semibold text-amber-600 mt-2 flex items-center justify-end gap-1">
              <Shield size={14} />
              ยอดคุ้มครองสะสม:{" "}
              {(
                profile?.insurance_credit_balance ??
                user?.insurance_credit_balance ??
                0
              ).toLocaleString()}{" "}
              ฿
            </p>
          )}
        </div>
      </div>

      {/* Tabs - Dark */}
      <div className="flex border-b border-gold/10 bg-charcoal-800/80 rounded-t-[20px] px-4 overflow-x-auto no-scrollbar">
        {["info", "training", "reviews", "wallet", "coursePurchases", "calendar"].map((tab) => (
          <button
            key={tab}
            onClick={() => {
              if (tab === "training") {
                navigate("/training/dashboard");
              } else {
                setActiveTab(tab as any);
                setSearchParams({ tab });
              }
            }}
            className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap capitalize rounded-t-xl ${
              activeTab === tab
                ? "border-slate-400 text-slate-100"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            {tab === "training"
              ? t("profile.tab_training")
              : tab === "coursePurchases"
                ? t("profile.tab_course_purchases")
              : tab === "calendar"
                ? t("profile.tab_calendar")
                : t(`profile.tab_${tab}`)}
          </button>
        ))}
        {(profile.role === UserRole.PROVIDER ||
          profile.role === "provider") && (
          <>
            <button
              onClick={() => setActiveTab("earnings")}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === "earnings"
                  ? "border-slate-400 text-slate-100"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              {t("profile.tab_earnings")}
            </button>
            <button
              onClick={() => setActiveTab("portfolio")}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === "portfolio"
                  ? "border-slate-400 text-slate-100"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              Portfolio / Expert
            </button>
            <button
              onClick={() => setActiveTab("story")}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
                activeTab === "story"
                  ? "border-slate-400 text-slate-100"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              <PlayCircle size={16} /> คลิปผลงาน
            </button>
            <button
              onClick={() => setActiveTab("connection")}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
                activeTab === "connection"
                  ? "border-slate-400 text-slate-100"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              <Network size={16} /> Connection
            </button>
          </>
        )}
      </div>

      {/* --- CONTENT --- */}

      {activeTab === "info" && (
        <div className="luxury-card rounded-b-[20px] rounded-t-none border-t-0 p-6 sm:p-8 animate-in fade-in space-y-8">
          {/* Identity Verification */}
          <div
            className={`border rounded-[20px] p-6 bg-charcoal-800/50 ${
              kycProfileShowsVerified(profile.kyc_level, kycDocGate)
                ? "border-emerald-400/60 bg-emerald-50/30 kyc-card-verified"
                : needsKycDocumentResubmit(kycDocGate)
                  ? "border-amber-400/80 bg-amber-50/95 kyc-card-resubmit"
                  : "border-gold/10"
            }`}
          >
            {needsKycDocumentResubmit(kycDocGate) && (
              <div className="mb-4 p-4 bg-amber-100 border border-amber-300 rounded-2xl space-y-3">
                <p className="text-amber-950 font-semibold leading-relaxed">
                  {kycDocGate?.supplementRequired
                    ? "ทีมงานขอเอกสารเพิ่ม — กรุณาอัปโหลดป้ายเหลือง / ใบขับขี่สาธารณะ"
                    : "ต้องส่งเอกสารยืนยันตัวตนใหม่"}
                </p>
                {kycAdminInstruction?.trim() && (
                  <p className="text-sm text-amber-900 leading-relaxed whitespace-pre-wrap">
                    {kycAdminInstruction.trim()}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() =>
                    kycDocGate?.supplementRequired
                      ? navigate("/settings", { state: { openThaiId: true } })
                      : navigate("/kyc")
                  }
                  className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium"
                >
                  {kycDocGate?.supplementRequired
                    ? "อัปโหลดเอกสารเพิ่ม"
                    : "ส่ง KYC ใหม่"}
                </button>
              </div>
            )}
            {kycNeedsReverify && (
              <div className="mb-4 p-4 bg-amber-100 border border-amber-300 rounded-2xl flex items-center justify-between flex-wrap gap-2">
                <p className="text-amber-950 font-semibold leading-relaxed">
                  ต้องยืนยันตัวตนใหม่ (Re-Verify) —
                  ครบกำหนดหรือมีการเปลี่ยนข้อมูลสำคัญ
                </p>
                <button
                  onClick={async () => {
                    setKycReverifyLoading(true);
                    try {
                      const result = await MockApi.reVerifyKYC();
                      if (result.success) {
                        notify("บันทึกการยืนยันตัวตนใหม่แล้ว", "success");
                        setKycNeedsReverify(false);
                        const data = await MockApi.getProfile();
                        setProfile(data);
                      } else {
                        notify(
                          result.message || "ไม่สามารถ Re-Verify ได้",
                          "error",
                        );
                      }
                    } finally {
                      setKycReverifyLoading(false);
                    }
                  }}
                  disabled={kycReverifyLoading}
                  className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium disabled:opacity-50"
                >
                  {kycReverifyLoading
                    ? "กำลังบันทึก..."
                    : "ยืนยันตัวตนใหม่ (Re-Verify)"}
                </button>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                    needsKycDocumentResubmit(kycDocGate)
                      ? "bg-amber-200/80"
                      : "bg-slate-600/50"
                  }`}
                >
                  <ShieldCheck
                    className={
                      needsKycDocumentResubmit(kycDocGate)
                        ? "text-amber-900"
                        : "text-slate-200"
                    }
                    size={28}
                  />
                </div>
                <div>
                  <h3
                    className={`text-lg font-bold flex items-center gap-2 flex-wrap ${
                      needsKycDocumentResubmit(kycDocGate)
                        ? "text-gray-900"
                        : "text-slate-100"
                    }`}
                  >
                    Identity Verification (KYC)
                    {kycProfileShowsVerified(profile.kyc_level, kycDocGate) && (
                      <span className="kyc-verified-badge inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl shadow-sm">
                        <ShieldCheck size={16} className="flex-shrink-0" />
                        Verified
                      </span>
                    )}
                    {needsKycDocumentResubmit(kycDocGate) && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-sm font-semibold rounded-xl shadow-sm">
                        <FileText size={16} className="flex-shrink-0" />
                        {kycDocGate?.supplementRequired
                          ? "เอกสารเพิ่ม"
                          : "ต้องส่งใหม่"}
                      </span>
                    )}
                  </h3>
                  <p
                    className={`text-sm mt-1 ${
                      needsKycDocumentResubmit(kycDocGate)
                        ? "text-amber-900"
                        : "text-slate-400"
                    }`}
                  >
                    {kycProfileShowsVerified(profile.kyc_level, kycDocGate)
                      ? "บัญชีของคุณได้รับการยืนยันตัวตนแล้ว"
                      : needsKycDocumentResubmit(kycDocGate)
                        ? "กรุณาอัปโหลดเอกสารตามที่ทีมงานขอ — ช่องกรอกจะปลดล็อกใน Settings"
                        : "ยืนยันตัวตนเพื่อเพิ่มความน่าเชื่อถือและปลดล็อกฟีเจอร์พิเศษ"}
                  </p>
                </div>
              </div>

              {(!kycProfileShowsVerified(profile.kyc_level, kycDocGate) ||
                needsKycDocumentResubmit(kycDocGate)) && (
                <button
                  onClick={() =>
                    needsKycDocumentResubmit(kycDocGate) &&
                    kycDocGate?.supplementRequired
                      ? navigate("/settings", { state: { openThaiId: true } })
                      : navigate("/kyc")
                  }
                  className="px-6 py-3 bg-amber-700 text-white rounded-2xl hover:bg-amber-800 transition-all flex items-center gap-2 font-semibold shadow-sm"
                >
                  <ShieldCheck size={20} />
                  {needsKycDocumentResubmit(kycDocGate)
                    ? kycDocGate?.supplementRequired
                      ? "อัปโหลดเอกสาร"
                      : "ส่ง KYC ใหม่"
                    : "ยืนยันตัวตน"}
                </button>
              )}
            </div>

            {!kycProfileShowsVerified(profile.kyc_level, kycDocGate) &&
              !needsKycDocumentResubmit(kycDocGate) && (
                <div className="mt-4 pt-4 border-t border-gold-subtle">
                  <div className="grid grid-cols-3 gap-4 text-center text-sm">
                    <div className="flex flex-col items-center">
                      <CheckCircle className="text-blue-600 mb-1" size={20} />
                      <span className="text-gray-700 font-medium">
                        เพิ่มความน่าเชื่อถือ
                      </span>
                    </div>
                    <div className="flex flex-col items-center">
                      <CheckCircle className="text-purple-600 mb-1" size={20} />
                      <span className="text-gray-700 font-medium">
                        รับงานได้มากขึ้น
                      </span>
                    </div>
                    <div className="flex flex-col items-center">
                      <CheckCircle className="text-pink-600 mb-1" size={20} />
                      <span className="text-gray-700 font-medium">
                        ปลอดภัยยิ่งขึ้น
                      </span>
                    </div>
                  </div>
                </div>
              )}
          </div>

          {/* พ.ร.บ. — ต่อด่วน + ติดตามสถานะ */}
          <div className="border border-sky-400/25 rounded-[20px] p-5 sm:p-6 bg-gradient-to-br from-sky-500/10 via-blue-600/5 to-transparent">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-sky-500/20 flex items-center justify-center">
                <Shield className="text-sky-300" size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-100">
                  บริการ พ.ร.บ.
                </h3>
                <p className="text-sm text-slate-400">
                  ต่อ พ.ร.บ. ออนไลน์และติดตามเอกสารหลังแจ้งที่อยู่จัดส่ง
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
              <Link
                to="/prb"
                className="flex items-center gap-3 p-3.5 rounded-2xl border border-sky-400/30 bg-charcoal-800/40 hover:border-sky-300/50 hover:bg-charcoal-800/55 transition-all active:scale-[0.98]"
              >
                <span className="shrink-0 w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center">
                  <Shield size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-slate-100">
                    ต่อ พ.ร.บ.
                  </span>
                  <span className="block text-[11px] text-slate-500 mt-0.5">
                    กรอกข้อมูลและชำระผ่าน Wallet
                  </span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-slate-500" />
              </Link>
              <Link
                to="/prb/orders"
                className="flex items-center gap-3 p-3.5 rounded-2xl border border-sky-400/30 bg-charcoal-800/40 hover:border-sky-300/50 hover:bg-charcoal-800/55 transition-all active:scale-[0.98]"
              >
                <span className="shrink-0 w-10 h-10 rounded-xl bg-blue-500/20 text-blue-300 flex items-center justify-center">
                  <ClipboardList size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-slate-100">
                    ติดตาม พ.ร.บ.
                  </span>
                  <span className="block text-[11px] text-slate-500 mt-0.5">
                    สถานะจัดส่ง · ยืนยันรับเอกสาร
                  </span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-slate-500" />
              </Link>
            </div>
          </div>

          {/* Marketplace v2 — บัญชีเดียว เปิดร้าน/ส่งของ */}
          <div className="border border-emerald-400/25 rounded-[20px] p-5 bg-charcoal-800/50">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-xl">
                🛒
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-100">Marketplace & ส่งของ</h3>
                <p className="text-sm text-slate-400">
                  บัญชี AQOND เดียว — เปิดร้าน รับงานส่ง ลงขาย (ไม่ต้องสมัครใหม่)
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
              {(
                [
                  ["account", "ศูนย์บัญชี", "ดูบทบาททั้งหมด"],
                  ["merchant_shops", "เปิดร้าน", "อาหาร · Marketplace"],
                  ["rider_setup", "ส่งของ", "อาหาร · พัสดุ"],
                  ["sell", "ลงขายสินค้า", "Hermes AI"],
                ] as const
              ).map(([target, title, sub]) => (
                <button
                  key={target}
                  type="button"
                  onClick={() => navigateToMarketplace(navigate, target)}
                  className="flex items-center gap-3 p-3.5 rounded-2xl border border-emerald-400/30 bg-charcoal-800/40 hover:border-emerald-300/50 hover:bg-charcoal-800/55 transition-all active:scale-[0.98] text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-slate-100">{title}</span>
                    <span className="block text-[11px] text-slate-500 mt-0.5">{sub}</span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-slate-500" />
                </button>
              ))}
            </div>
          </div>

          {/* Provider: สวิตซ์รับงาน + ที่อยู่ (สำหรับ Provider) */}
          {(user?.role === "provider" ||
            profile?.role === UserRole.PROVIDER ||
            profile?.role === "provider") && (
            <ProviderAvailabilityBlock
              profile={profile}
              onUpdate={() => MockApi.getProfile().then(setProfile)}
              notify={notify}
            />
          )}

          {/* 🎯 RESUME/CV Section - LinkedIn Style */}

          {/* About/Summary */}
          <div className="border border-gold-transparent rounded-[20px] p-6 bg-charcoal-800/50">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <User className="mr-2 text-blue-600" size={24} />
              About
            </h2>
            <p className="text-gray-700 leading-relaxed">
              {profile.bio ||
                "เพิ่มข้อมูลเกี่ยวกับตัวคุณ ประสบการณ์ และความเชี่ยวชาญ..."}
            </p>
            <button className="mt-4 text-blue-600 hover:text-blue-700 font-medium text-sm flex items-center">
              <Edit2 size={14} className="mr-1" />
              แก้ไข
            </button>
          </div>

          {/* Skills Section */}
          <div className="border border-gold/10 rounded-[20px] p-6 bg-charcoal-800/50">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center justify-between">
              <div className="flex items-center">
                <Star className="mr-2 text-amber-500" size={24} />
                Skills & Expertise
              </div>
              <button className="text-blue-600 hover:text-blue-700 font-medium text-sm flex items-center">
                <Plus size={16} className="mr-1" />
                เพิ่มทักษะ
              </button>
            </h2>

            {certifiedSkills.length > 0 ? (
              <div className="flex flex-wrap gap-3">
                {certifiedSkills.map((cs) => (
                  <div
                    key={cs.skill_name}
                    className="group relative px-4 py-2 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-300 rounded-full hover:shadow-md transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800">
                        {cs.skill_name}
                      </span>
                      <CheckCircle size={16} className="text-emerald-600" />
                    </div>
                    <span className="absolute -top-2 -right-2 px-2 py-0.5 bg-emerald-500 text-white text-xs rounded-full">
                      Certified
                    </span>
                  </div>
                ))}
                {/* แสดง skill อื่นที่ไม่มี cert */}
                {(profile.skills || [])
                  .filter(
                    (s) => !certifiedSkills.some((cs) => cs.skill_name === s),
                  )
                  .map((skill, idx) => (
                    <div
                      key={`other-${idx}`}
                      className="px-4 py-2 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-full hover:shadow-md transition-all"
                    >
                      <span className="font-medium text-gray-800">{skill}</span>
                    </div>
                  ))}
              </div>
            ) : profile.skills && profile.skills.length > 0 ? (
              <div className="flex flex-wrap gap-3">
                {profile.skills.map((skill, index) => (
                  <div
                    key={index}
                    className="px-4 py-2 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-full hover:shadow-md transition-all"
                  >
                    <span className="font-medium text-gray-800">{skill}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="inline-flex p-4 bg-gray-100 rounded-full mb-4">
                  <Star className="text-gray-400" size={32} />
                </div>
                <p className="text-gray-500 font-medium mb-2">ยังไม่มีทักษะ</p>
                <p className="text-sm text-gray-400 mb-4">
                  {t("training.module2_cert_desc")}
                </p>
                <button
                  onClick={() => navigate("/training/nexus-module2")}
                  className="px-6 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700"
                >
                  {t("training.go_module2")}
                </button>
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-gray-100 mt-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-emerald-600">
                  {certifiedSkills.length}
                </p>
                <p className="text-xs text-gray-500">ทักษะที่ผ่านการรับรอง</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">
                  {(profile.skills?.length || 0) +
                    certifiedSkills.filter(
                      (cs) => !(profile.skills || []).includes(cs.skill_name),
                    ).length}
                </p>
                <p className="text-xs text-gray-500">ทักษะทั้งหมด</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-amber-600">
                  {profile.rating || 0}/5
                </p>
                <p className="text-xs text-gray-500">คะแนนรีวิว</p>
              </div>
            </div>
          </div>

          {/* Experience Section */}
          <div className="border border-gold/10 rounded-[20px] p-6 bg-charcoal-800/50">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center justify-between">
              <div className="flex items-center">
                <Briefcase className="mr-2 text-purple-600" size={24} />
                Experience
              </div>
              <button className="text-blue-600 hover:text-blue-700 font-medium text-sm flex items-center">
                <Plus size={16} className="mr-1" />
                เพิ่มประสบการณ์
              </button>
            </h2>

            <div className="space-y-6">
              {/* Example Experience Item */}
              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center text-white font-bold text-lg">
                    {profile.name?.[0] || "M"}
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900">Service Provider</h3>
                  <p className="text-sm text-gray-600">Meerak Platform</p>
                  <p className="text-xs text-gray-500 mt-1">
                    2024 - Present · 6 months
                  </p>
                  <p className="text-sm text-gray-700 mt-2">
                    ให้บริการงานช่างและงานต่างๆ ผ่านแพลตฟอร์ม Meerak
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {profile.skills?.slice(0, 3).map((skill, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1 bg-gray-100 text-gray-700 text-xs rounded-full"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="text-center py-4 border-t border-gray-100">
                <button className="text-blue-600 hover:text-blue-700 font-medium text-sm">
                  ดูประสบการณ์ทั้งหมด →
                </button>
              </div>
            </div>
          </div>

          {/* Education Section */}
          <div className="border border-gold/10 rounded-[20px] p-6 bg-charcoal-800/50">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center justify-between">
              <div className="flex items-center">
                <GraduationCap className="mr-2 text-green-600" size={24} />
                Education
              </div>
              <button className="text-blue-600 hover:text-blue-700 font-medium text-sm flex items-center">
                <Plus size={16} className="mr-1" />
                เพิ่มการศึกษา
              </button>
            </h2>

            <div className="text-center py-8">
              <div className="inline-flex p-4 bg-gray-100 rounded-full mb-4">
                <GraduationCap className="text-gray-400" size={32} />
              </div>
              <p className="text-gray-500 font-medium mb-2">
                ยังไม่มีข้อมูลการศึกษา
              </p>
              <p className="text-sm text-gray-400">
                เพิ่มประวัติการศึกษาเพื่อเพิ่มความน่าเชื่อถือ
              </p>
            </div>
          </div>

          {/* Certifications Section */}
          <div className="border border-gold/10 rounded-[20px] p-6 bg-charcoal-800/50">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center justify-between">
              <div className="flex items-center">
                <Award className="mr-2 text-amber-600" size={24} />
                Licenses & Certifications
              </div>
              {certifiedSkills.length > 0 && (
                <span className="text-sm text-amber-700 font-medium bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
                  {certifiedSkills.length} ใบ
                </span>
              )}
            </h2>

            {certifiedSkills.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {certifiedSkills.map((cs) => (
                  <div
                    key={cs.skill_name}
                    className="relative overflow-hidden rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 shadow-sm hover:shadow-md transition-all cursor-pointer"
                    onClick={() => navigate("/training/certificate-readiness")}
                    title="กดเพื่อดูใบ Certificate"
                  >
                    {/* Certificate header strip */}
                    <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 flex items-center justify-between">
                      <span className="text-white text-xs font-bold uppercase tracking-wider">
                        Nexus Platform
                      </span>
                      <Award className="text-white" size={16} />
                    </div>

                    {/* Certificate body */}
                    <div className="px-4 py-4">
                      <p className="text-xs text-amber-700 font-semibold uppercase tracking-wider mb-1">
                        Certificate of Skill
                      </p>
                      <h3 className="text-lg font-bold text-gray-900 mb-1">
                        {cs.skill_name}
                      </h3>
                      <p className="text-xs text-gray-500 mb-3">
                        {t("training.professional_module2")}
                      </p>

                      {/* Cert ID */}
                      <p className="text-xs text-gray-400 font-mono truncate mb-3">
                        {cs.certification_id}
                      </p>

                      {/* Issued date + verified badge */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">
                          {cs.certified_at
                            ? new Date(cs.certified_at).toLocaleDateString(
                                "th-TH",
                                {
                                  year: "numeric",
                                  month: "long",
                                  day: "numeric",
                                },
                              )
                            : ""}
                        </span>
                        <div className="flex items-center gap-1 px-2 py-0.5 bg-emerald-100 rounded-full">
                          <CheckCircle size={12} className="text-emerald-600" />
                          <span className="text-xs text-emerald-700 font-medium">
                            Verified
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="inline-flex p-4 bg-gray-100 rounded-full mb-4">
                  <Award className="text-gray-400" size={32} />
                </div>
                <p className="text-gray-500 font-medium mb-2">
                  ยังไม่มีใบรับรอง
                </p>
                <p className="text-sm text-gray-400 mb-4">
                  {t("training.module2_cert_tip")}
                </p>
                <button
                  onClick={() => navigate("/training/nexus-module2")}
                  className="px-6 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700"
                >
                  {t("training.go_module2")}
                </button>
              </div>
            )}
          </div>

          {/* Contact Info */}
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-center">
              <Phone size={16} className="mr-3" /> {profile.phone}
            </div>
            <div className="flex items-center">
              <Mail size={16} className="mr-3" /> {profile.email}
            </div>
            <div className="flex items-center">
              <User size={16} className="mr-3" /> {profile.bio || "No bio"}
            </div>
          </div>
        </div>
      )}

      {/* CALENDAR — ปฏิทินรวมงาน จอง เวลาว่าง */}
      {activeTab === "calendar" && (
        <div className="luxury-card rounded-b-[20px] rounded-t-none border-t-0 p-4 sm:p-6 animate-in fade-in">
          <ProfileCalendarEmbed userId={user?.id} navigate={navigate} />
        </div>
      )}

      {activeTab === "coursePurchases" && (
        <div className="luxury-card rounded-b-[20px] rounded-t-none border-t-0 p-4 sm:p-6 animate-in fade-in">
          <CoursePurchasesTab />
        </div>
      )}

      {/* WALLET */}
      {activeTab === "wallet" && (
        <div className="luxury-card rounded-b-[20px] rounded-t-none border-t-0 p-6 sm:p-8 animate-in fade-in">
          {/* Platform Safety Authority: แสดงเมื่อวอลเล็ตถูกระงับ */}
          {(profile?.wallet_frozen ?? user?.wallet_frozen) && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
              <Lock className="flex-shrink-0 w-6 h-6 text-amber-600" />
              <div>
                <p className="font-bold text-amber-800">วอลเล็ตถูกระงับ</p>
                <p className="text-sm text-amber-700 mt-1">
                  บัญชีกระเป๋าของคุณถูกระงับชั่วคราว — ไม่สามารถเติมเงิน ถอนเงิน
                  หรือใช้จ่ายได้ กรุณาติดต่อฝ่ายสนับสนุน
                </p>
              </div>
            </div>
          )}

          {/* ✅ เพิ่มส่วนแสดงยอดเงิน (เฉพาะ Provider) */}
          {user?.role === UserRole.PROVIDER && (
            <div className="mb-8 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl">
              <h3 className="font-bold text-lg mb-4 text-gray-800">
                💰 ยอดเงินของคุณ
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                {/* Available — ถอนได้ทันที */}
                <div className="p-4 bg-white border border-emerald-200 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">
                    Available (ถอนได้ทันที)
                  </p>
                  <p className="text-2xl font-bold text-emerald-600 number-wallet">
                    {(user.wallet_balance || 0).toLocaleString()} บาท
                  </p>
                  <p className="text-xs text-gray-500 mt-1">สามารถถอนได้เลย</p>
                </div>

                {/* Pending — เงินรอการปล่อย (Escrow 24-48 ชม.) */}
                <div className="p-4 bg-white border border-blue-200 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">
                    Pending (รอการปล่อย)
                  </p>
                  <p className="text-2xl font-bold text-blue-600 number-wallet">
                    {(user.wallet_pending || 0).toLocaleString()} บาท
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    พร้อมถอนใน 24-48 ชม. ⏳
                  </p>
                </div>

                {/* ยอดรวมทั้งหมด */}
                <div className="p-4 bg-white border border-purple-200 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">รวมทั้งหมด</p>
                  <p className="text-2xl font-bold text-purple-600 number-wallet">
                    {(
                      (user.wallet_balance || 0) + (user.wallet_pending || 0)
                    ).toLocaleString()}{" "}
                    บาท
                  </p>
                  <p className="text-xs text-gray-500 mt-1">รายได้ทั้งหมด</p>
                </div>
              </div>

              {/* ⚠️ ยังไม่สามารถถอนเงินได้ — กติกา 10 งาน หรือ 650 บาท */}
              {payoutEligibility && !payoutEligibility.eligible && (
                <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="font-bold text-amber-800 mb-1">
                    ⚠️ ยังไม่สามารถถอนเงินได้
                  </p>
                  <p className="text-sm text-amber-700">
                    คุณต้องการอีก{" "}
                    {Math.max(
                      0,
                      payoutEligibility.min_jobs -
                        payoutEligibility.completed_jobs,
                    )}{" "}
                    งาน หรือยอดเงินรวมต้องถึง 650.-
                    เพื่อดำเนินการถอนเงินรอบถัดไป (Batch Payout)
                  </p>
                </div>
              )}

              {/* แสดงเวลาปล่อยเงินล่าสุด (ถ้ามี) */}
              {(user.wallet_pending || 0) > 0 && (
                <div className="text-sm text-blue-600 bg-blue-50 p-3 rounded-lg border border-blue-100">
                  ⏳ คุณมีเงินรอการปล่อย{" "}
                  {(user.wallet_pending || 0).toLocaleString()} บาท
                  ที่จะพร้อมถอนใน 24-48 ชั่วโมงทำการ
                </div>
              )}
            </div>
          )}

          {/* ✅ สำหรับ Client แสดงแค่ยอดคงเหลือ */}
          {user?.role === UserRole.USER && (
            <div className="mb-8 p-6 bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-100 rounded-xl">
              <h3 className="font-bold text-lg mb-2 text-gray-800">
                💰 ยอดเงินคงเหลือ
              </h3>
              <p className="text-3xl font-bold text-emerald-600 mb-2 number-wallet">
                {(user.wallet_balance || 0).toLocaleString()} บาท
              </p>
              <p className="text-sm text-gray-600">
                ยอดเงินที่สามารถใช้จ่ายได้ทันที
              </p>
            </div>
          )}

          {/* Total Guarantee Credit (ยอดคุ้มครองสะสม) — Virtual Credit from insurance */}
          {(profile?.insurance_credit_balance ??
            user?.insurance_credit_balance ??
            0) > 0 && (
            <div className="mb-8 p-6 bg-gradient-to-r from-amber-50 to-amber-100 border-2 border-amber-200 rounded-xl">
              <h3 className="font-bold text-lg mb-2 text-amber-900 flex items-center gap-2">
                <Shield size={20} className="text-amber-600" />
                ยอดคุ้มครองสะสม (Total Guarantee Credit)
              </h3>
              <p className="text-2xl font-bold text-amber-700 number-wallet">
                {(
                  profile?.insurance_credit_balance ??
                  user?.insurance_credit_balance ??
                  0
                ).toLocaleString()}{" "}
                ฿
              </p>
              <p className="text-sm text-amber-700 mt-1">
                เครดิตจากค่าประกันที่จ่ายสะสม — ใช้เป็นส่วนลดได้เมื่อครบเงื่อนไข
                Maturity Rewards
              </p>
            </div>
          )}

          {/* ปุ่ม Deposit/Withdraw */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <button
              onClick={() => {
                if (profile?.wallet_frozen ?? user?.wallet_frozen) return;
                depositSlipUploadedRef.current = false;
                walletDepositChargeSourceRef.current = null;
                setDepositChargeSourceType(null);
                setDepositSuccessPendingSlip(false);
                setSlipFile(null);
                setWalletDepositM1Step("choose_method");
                setWalletM1Method(null);
                setManualDepositSubmitResult(null);
                setAmount("");
                setWalletDepositPreview(null);
                setWalletDepositPreviewError(null);
                setDepositStep("amount");
                setDepositMethod(null);
                setDepositQrUrl(null);
                setDepositPaymentId(null);
                setManualStaticSlipFile(null);
                setDepositOtherChannelsOpen(false);
                setActiveModal("deposit");
              }}
              disabled={profile?.wallet_frozen ?? user?.wallet_frozen}
              className="p-6 bg-emerald-600 border border-emerald-500 rounded-xl text-white flex flex-col items-center justify-center hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-emerald-600/50"
            >
              <ArrowDownCircle size={32} className="mb-2" />
              <span className="font-bold">เติมเงิน</span>
            </button>
            <button
              onClick={() =>
                !(profile?.wallet_frozen ?? user?.wallet_frozen) &&
                setActiveModal("withdraw")
              }
              disabled={
                (profile?.wallet_frozen ?? user?.wallet_frozen) ||
                (user?.role === UserRole.PROVIDER &&
                  (user.wallet_balance || 0) <= 0) ||
                (user?.role === UserRole.PROVIDER &&
                  payoutEligibility &&
                  !payoutEligibility.eligible)
              }
              className="p-6 bg-blue-600 border border-blue-500 rounded-xl text-white flex flex-col items-center justify-center hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-blue-600/50"
            >
              <ArrowUpCircle size={32} className="mb-2" />
              <span className="font-bold">
                {user?.role === UserRole.PROVIDER ? "ถอนเงิน" : "Withdraw"}
              </span>
              {(profile?.wallet_frozen ?? user?.wallet_frozen) ? (
                <span className="text-xs text-white/80 mt-1">
                  วอลเล็ตถูกระงับ
                </span>
              ) : user?.role === UserRole.PROVIDER &&
                (user.wallet_balance || 0) <= 0 ? (
                <span className="text-xs text-white/80 mt-1">
                  ไม่มีเงินถอนได้
                </span>
              ) : user?.role === UserRole.PROVIDER &&
                payoutEligibility &&
                !payoutEligibility.eligible ? (
                <span className="text-xs text-white/80 mt-1">
                  ยังไม่ถึงเงื่อนไข (10 งาน หรือ 650 บาท)
                </span>
              ) : null}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowWalletGuide(true)}
            className="mb-6 flex items-center justify-center gap-2 py-2.5 text-sm text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800 transition-colors"
          >
            <BookOpen size={18} />
            {t("wallet_guide.title")}
          </button>

          <h3 className="font-bold mb-1">ประวัติการเคลื่อนไหวกระเป๋า</h3>
          <p className="text-xs text-gray-500 mb-4">
            เติมเงินเข้า · ถอนเงินออก · รายได้ · จากงาน Advance Job (โชว์
            Commission)
          </p>
          {/* Filter tabs — default All */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {(["all", "deposit", "withdrawal", "income"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setWalletHistoryFilter(f)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  walletHistoryFilter === f
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {f === "all"
                  ? "แสดงทั้งหมด"
                  : f === "deposit"
                    ? "เติมเงิน"
                    : f === "withdrawal"
                      ? "ถอนเงิน"
                      : "รายได้"}
              </button>
            ))}
          </div>
          <div className="space-y-0 rounded-xl border border-gray-200 overflow-hidden">
            {(() => {
              const ledgerAsList = walletLedgerTransactions.map((t) => {
                const isTip =
                  t.event_type === "wallet_tip" && t.direction === "in";
                const isDeposit = t.event_type === "wallet_deposit";
                const isWithdrawal = t.event_type === "user_payout_withdrawal";
                const type = isTip
                  ? "tip"
                  : isDeposit
                    ? "deposit"
                    : isWithdrawal
                      ? "withdrawal"
                      : t.direction === "in"
                        ? "income"
                        : "payment_out";
                return {
                  id: t.id,
                  type: type as "income" | "payment_out" | "tip",
                  amount: Math.abs(t.amount),
                  date: t.created_at,
                  description: t.description,
                  status:
                    (t.status as
                      | "completed"
                      | "pending"
                      | "failed"
                      | "pending_release"
                      | "waiting_admin") || "completed",
                  commission_deducted: t.commission_deducted,
                  insurance_amount: t.insurance_amount,
                  tips_amount: t.tips_amount,
                  gross_earnings: t.gross_earnings,
                  handling_fee: t.handling_fee,
                  commission_fee: t.commission_fee,
                  commission_percent: t.commission_percent,
                  event_type: t.event_type,
                  job_id: t.job_id,
                  fromLedger: true,
                };
              });
              const payoutAsList = payoutRequests.map((p) => ({
                id: `payout-${p.id}`,
                type: "withdrawal" as const,
                amount: p.amount,
                date: p.processed_at || p.created_at,
                description: "คำขอถอนเงิน",
                status:
                  p.status === "approved"
                    ? "completed"
                    : p.status === "rejected"
                      ? "failed"
                      : "pending",
                fromPayoutRequest: true,
                payoutStatus: p.status,
              }));
              const combined = [...ledgerAsList, ...payoutAsList].sort(
                (a, b) =>
                  new Date(b.date).getTime() - new Date(a.date).getTime(),
              );
              const filtered =
                walletHistoryFilter === "all"
                  ? combined
                  : combined.filter((tx) => {
                      if (walletHistoryFilter === "deposit")
                        return tx.type === "deposit";
                      if (walletHistoryFilter === "withdrawal")
                        return tx.type === "withdrawal";
                      if (walletHistoryFilter === "income")
                        return tx.type === "income" || tx.type === "tip";
                      return true;
                    });
              if (filtered.length === 0) {
                return (
                  <div className="p-8 text-center bg-gray-50">
                    <Wallet
                      className="mx-auto mb-2 w-10 h-10"
                      color="#D4AF37"
                    />
                    <p className="text-gray-500 font-medium">
                      {combined.length === 0
                        ? "ยังไม่มีประวัติการเคลื่อนไหว"
                        : "ไม่มีรายการในหมวดนี้"}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {combined.length === 0
                        ? "เมื่อมีการเติมเงิน ถอนเงิน หรือรายได้จากงาน จะแสดงที่นี่"
                        : 'ลองเปลี่ยนตัวกรองเป็น "แสดงทั้งหมด"'}
                    </p>
                  </div>
                );
              }
              return filtered.map((tx) => {
                const isIn =
                  tx.type === "deposit" ||
                  tx.type === "income" ||
                  tx.type === "tip";
                const typeLabel =
                  "description" in tx && tx.description
                    ? tx.description
                    : tx.type === "deposit"
                      ? "เติมเงินเข้า"
                      : tx.type === "withdrawal"
                        ? "ถอนเงินออก"
                        : tx.type === "income"
                          ? "รายได้จากงาน"
                          : tx.type === "payment" || tx.type === "payment_out"
                            ? "ชำระงาน"
                            : tx.type === "tip"
                              ? "ทิป"
                              : (tx as Transaction).description;
                const statusLabel =
                  "payoutStatus" in tx && tx.payoutStatus
                    ? tx.payoutStatus === "approved"
                      ? "อนุมัติแล้ว"
                      : tx.payoutStatus === "rejected"
                        ? "ปฏิเสธ"
                        : "รอดำเนินการ"
                    : tx.status === "completed"
                      ? "สำเร็จ"
                      : tx.status === "pending_release"
                        ? "รอถอนใน 24 ชม."
                        : tx.status === "pending"
                          ? "รอดำเนินการ"
                          : tx.status === "failed"
                            ? "ไม่สำเร็จ"
                            : tx.status === "waiting_admin"
                              ? "รอตรวจสอบ"
                              : null;
                const commissionDeducted =
                  "commission_deducted" in tx
                    ? tx.commission_deducted
                    : undefined;
                const hasEarningsBreakdown =
                  tx.type === "income" &&
                  "gross_earnings" in tx &&
                  tx.gross_earnings != null &&
                  tx.gross_earnings > 0;
                return (
                  <div
                    key={tx.id}
                    className="flex items-center gap-3 p-4 border-b border-gray-100 last:border-0 bg-white hover:bg-gray-50/80 transition"
                  >
                    <div
                      className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                        isIn
                          ? "bg-emerald-100 text-emerald-600"
                          : "bg-red-50 text-red-600"
                      }`}
                    >
                      {isIn ? (
                        <ArrowDownCircle size={20} />
                      ) : (
                        <ArrowUpCircle size={20} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-800 truncate">
                        {typeLabel}
                      </p>
                      {hasEarningsBreakdown && (
                        <div className="text-xs mt-1 space-y-0.5 text-slate-600">
                          <p>
                            <span className="text-slate-500">
                              {t("detail.wallet_gross_wage")}:
                            </span>{" "}
                            ฿
                            {Number(
                              (tx as any).gross_earnings,
                            ).toLocaleString()}
                          </p>
                          {(tx as any).handling_fee != null &&
                            (tx as any).handling_fee > 0 && (
                              <p className="text-amber-700 flex items-center gap-1">
                                {t("detail.wallet_handling_fee")}: -฿
                                {Number(
                                  (tx as any).handling_fee,
                                ).toLocaleString()}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setFeeTooltipId(
                                      feeTooltipId === `${tx.id}-handling`
                                        ? null
                                        : `${tx.id}-handling`,
                                    );
                                  }}
                                  className="inline-flex text-slate-400 hover:text-blue-600"
                                  title={t("detail.fee_tooltip_handling")}
                                >
                                  <HelpCircle size={12} />
                                </button>
                              </p>
                            )}
                          {(tx as any).commission_fee != null &&
                            (tx as any).commission_fee > 0 && (
                              <p className="text-amber-700 flex items-center gap-1">
                                {t("detail.wallet_platform_commission")} (
                                {(tx as any).commission_percent ?? 24}%): -฿
                                {Number(
                                  (tx as any).commission_fee,
                                ).toLocaleString()}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setFeeTooltipId(
                                      feeTooltipId === `${tx.id}-commission`
                                        ? null
                                        : `${tx.id}-commission`,
                                    );
                                  }}
                                  className="inline-flex text-slate-400 hover:text-blue-600"
                                  title={t("detail.fee_tooltip_commission")}
                                >
                                  <HelpCircle size={12} />
                                </button>
                              </p>
                            )}
                          <p className="font-medium text-emerald-700">
                            {t("detail.wallet_net_credited")}: ฿
                            {tx.amount.toLocaleString()}
                          </p>
                          {feeTooltipId === `${tx.id}-handling` && (
                            <p className="text-[10px] text-blue-600 bg-blue-50 px-2 py-1 rounded mt-0.5">
                              {t("detail.fee_tooltip_handling")}
                            </p>
                          )}
                          {feeTooltipId === `${tx.id}-commission` && (
                            <p className="text-[10px] text-blue-600 bg-blue-50 px-2 py-1 rounded mt-0.5">
                              {t("detail.fee_tooltip_commission")}
                            </p>
                          )}
                        </div>
                      )}
                      {!hasEarningsBreakdown &&
                        commissionDeducted != null &&
                        commissionDeducted > 0 && (
                          <p className="text-xs text-amber-600 mt-0.5">
                            หัก Commission ฿
                            {commissionDeducted.toLocaleString()}
                          </p>
                        )}
                      {"insurance_amount" in tx &&
                        tx.insurance_amount != null &&
                        tx.insurance_amount > 0 && (
                          <p className="text-xs text-emerald-600 mt-0.5">
                            ค่าประกัน ฿
                            {Number(tx.insurance_amount).toLocaleString()}
                          </p>
                        )}
                      {"tips_amount" in tx &&
                        tx.tips_amount != null &&
                        tx.tips_amount > 0 && (
                          <p className="text-xs text-pink-600 mt-0.5">
                            ทิป ฿{Number(tx.tips_amount).toLocaleString()}
                          </p>
                        )}
                      <p className="text-xs text-gray-500 mt-0.5">
                        {new Date(tx.date).toLocaleDateString("th-TH", {
                          day: "numeric",
                          month: "short",
                          year: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      {statusLabel && (
                        <span
                          className={`inline-flex mt-1.5 px-2 py-0.5 rounded text-xs font-medium ${
                            tx.status === "completed"
                              ? "bg-emerald-100 text-emerald-800"
                              : tx.status === "pending_release"
                                ? "bg-blue-100 text-blue-800"
                                : tx.status === "pending"
                                  ? "bg-amber-100 text-amber-800"
                                  : tx.status === "failed"
                                    ? "bg-red-100 text-red-800"
                                    : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {statusLabel}
                        </span>
                      )}
                    </div>
                    <div className="flex-shrink-0 text-right flex flex-col items-end gap-2">
                      <span
                        className={`font-bold tabular-nums ${
                          isIn ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {isIn ? "+" : "-"}
                        {tx.amount.toLocaleString()} ฿
                      </span>
                      {tx.status === "completed" &&
                        "fromLedger" in tx &&
                        tx.fromLedger && (
                          <button
                            onClick={async () => {
                              try {
                                const { data } = await api.get<{
                                  receipt: any;
                                }>(`/wallet/receipt/${tx.id}`);
                                if (data?.receipt) {
                                  setFeeTooltipId(null);
                                  setReceiptModal(data.receipt);
                                }
                              } catch (e) {
                                notify("ไม่สามารถโหลดใบเสร็จได้", "error");
                              }
                            }}
                            className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 font-medium"
                          >
                            📄 ใบเสร็จ
                          </button>
                        )}
                    </div>
                  </div>
                );
              });
            })()}
          </div>

          {/* Tax Documents — Virtual Tax Folder */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <h3 className="font-bold mb-1 flex items-center gap-2">
              <FileText size={18} className="text-slate-600" />
              เอกสารภาษี
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              ใบเสร็จ · ใบรับรองรายได้ · WHT Certificate
            </p>
            <TaxDocumentsSection
              api={api}
              notify={notify}
              user={user}
              profile={profile}
              onRefresh={async () => {
                try {
                  const { data } = await api.get("/wallet/transactions");
                  setWalletLedgerTransactions(data?.transactions || []);
                  const uid = user?.id || profile?.id;
                  if (uid) {
                    const { data: p } = await api.get(`/users/profile/${uid}`);
                    if (p) setProfile(p);
                  }
                } catch (_) {}
              }}
            />
          </div>
        </div>
      )}

      {/* PORTFOLIO / EXPERT (Provider only) */}
      {activeTab === "portfolio" &&
        (user?.role === UserRole.PROVIDER ||
          profile?.role === UserRole.PROVIDER ||
          profile?.role === "provider") && (
          <PortfolioExpertTab
            profile={profile}
            setProfile={setProfile}
            user={user}
            navigate={navigate}
            notify={notify}
            t={t}
          />
        )}

      {/* STORY — Verified Work Clips (Provider only) */}
      {activeTab === "story" &&
        (profile?.role === UserRole.PROVIDER ||
          profile?.role === "provider") && (
          <StoryWorkClipsTab
            profile={profile}
            notify={notify}
            backendWorkClips={backendWorkClips}
            setBackendWorkClips={setBackendWorkClips}
            profileWorkClips={profileWorkClips}
          />
        )}

      {/* CONNECTION TAB — UID:Key, Coach-Trainee */}
      {activeTab === "connection" && (
        <ConnectionTab userId={user?.id || profile?.id} />
      )}

      {/* EARNINGS — ข้อมูลจริงจาก Backend (walletLedgerTransactions) */}
      {activeTab === "earnings" &&
        (() => {
          // รายได้จากงาน: direction === 'in' และไม่ใช่ wallet_deposit
          const incomeTxs = walletLedgerTransactions.filter(
            (t) =>
              t.direction === "in" &&
              (t as { event_type?: string }).event_type !== "wallet_deposit" &&
              !(t.description || "").startsWith("เติมเงิน"),
          );
          const now = new Date();
          const getWeekStart = (d: Date) => {
            const x = new Date(d);
            const day = x.getDay();
            const diff = x.getDate() - day + (day === 0 ? -6 : 1);
            x.setDate(diff);
            x.setHours(0, 0, 0, 0);
            return x;
          };
          const weekStart = getWeekStart(now);
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          const yearStart = new Date(now.getFullYear(), 0, 1);
          const sumInRange = (start: Date, end?: Date) =>
            incomeTxs.reduce((s, t) => {
              const tDate = new Date(t.created_at);
              if (tDate >= start && (!end || tDate <= end))
                return s + (t.amount || 0);
              return s;
            }, 0);
          const weekly = sumInRange(weekStart);
          const monthly = sumInRange(monthStart);
          const yearly = sumInRange(yearStart);
          const totalCommission = incomeTxs.reduce(
            (s, t) => s + (t.commission_deducted || 0),
            0,
          );
          const pending = profile?.wallet_pending ?? user?.wallet_pending ?? 0;

          // กราฟรายเดือน (6 เดือนล่าสุด)
          const monthNames = [
            "ม.ค.",
            "ก.พ.",
            "มี.ค.",
            "เม.ย.",
            "พ.ค.",
            "มิ.ย.",
            "ก.ค.",
            "ส.ค.",
            "ก.ย.",
            "ต.ค.",
            "พ.ย.",
            "ธ.ค.",
          ];
          const chartData = Array.from({ length: 6 }, (_, i) => {
            const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
            const next = new Date(d.getFullYear(), d.getMonth() + 1, 0);
            const amt = sumInRange(d, next);
            return {
              name: `${monthNames[d.getMonth()]} ${d.getFullYear()}`,
              amount: amt,
              commission: incomeTxs
                .filter((t) => {
                  const tDate = new Date(t.created_at);
                  return tDate >= d && tDate <= next;
                })
                .reduce((s, t) => s + (t.commission_deducted || 0), 0),
            };
          });

          const hasAnyIncome =
            incomeTxs.length > 0 || weekly > 0 || monthly > 0 || yearly > 0;

          return (
            <div className="luxury-card rounded-b-[20px] rounded-t-none border-t-0 p-6 sm:p-8 animate-in fade-in space-y-6">
              <h3 className="font-bold text-lg text-slate-100">รายได้</h3>

              {/* Time range selector — เลือกช่วงเวลาที่ต้องการดู */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-slate-400">ดูตามช่วง:</span>
                <div className="flex gap-2">
                  {(["week", "month", "year"] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setEarningsTimeRange(r)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                        earningsTimeRange === r
                          ? "bg-emerald-600 text-white"
                          : "bg-slate-700/50 text-slate-300 hover:bg-slate-600/50"
                      }`}
                    >
                      {r === "week"
                        ? t("profile.earnings_period_week")
                        : r === "month"
                          ? t("profile.earnings_period_month")
                          : t("profile.earnings_period_year")}
                    </button>
                  ))}
                </div>
                <span className="text-sm font-bold text-emerald-400">
                  {earningsTimeRange === "week"
                    ? weekly
                    : earningsTimeRange === "month"
                      ? monthly
                      : yearly}{" "}
                  ฿
                </span>
              </div>

              {hasAnyIncome ? (
                <>
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
                      <p className="text-xs text-slate-400 mb-1">
                        {t("profile.weekly_inc")}
                      </p>
                      <p className="text-xl font-bold text-emerald-400">
                        {weekly.toLocaleString()} ฿
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
                      <p className="text-xs text-slate-400 mb-1">
                        {t("profile.monthly_inc")}
                      </p>
                      <p className="text-xl font-bold text-emerald-400">
                        {monthly.toLocaleString()} ฿
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
                      <p className="text-xs text-slate-400 mb-1">
                        {t("profile.yearly_inc")}
                      </p>
                      <p className="text-xl font-bold text-emerald-400">
                        {yearly.toLocaleString()} ฿
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
                      <p className="text-xs text-slate-400 mb-1">
                        {t("profile.earnings_pending")}
                      </p>
                      <p className="text-xl font-bold text-amber-400">
                        {(pending || 0).toLocaleString()} ฿
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 col-span-2 sm:col-span-4">
                      <p className="text-xs text-slate-400 mb-1">
                        {t("profile.earnings_commission")}
                      </p>
                      <p className="text-lg font-bold text-slate-300">
                        {totalCommission.toLocaleString()} ฿
                      </p>
                    </div>
                  </div>

                  {/* Chart */}
                  <div>
                    <p className="text-sm font-medium text-slate-300 mb-3">
                      {t("profile.earnings_chart")}
                    </p>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={chartData}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="#334155"
                        />
                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                        <YAxis
                          stroke="#94a3b8"
                          fontSize={12}
                          tickFormatter={(v) => `${v}`}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1e293b",
                            border: "1px solid #334155",
                            borderRadius: "8px",
                          }}
                          formatter={(value: number) => [
                            `${value.toLocaleString()} ฿`,
                            "",
                          ]}
                          labelFormatter={(label) => label}
                        />
                        <Bar
                          dataKey="amount"
                          fill="#10B981"
                          radius={[4, 4, 0, 0]}
                          name="รายได้"
                        />
                        <Bar
                          dataKey="commission"
                          fill="#64748b"
                          radius={[4, 4, 0, 0]}
                          name="ค่าคอม"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Recent income list */}
                  <div>
                    <p className="text-sm font-medium text-slate-300 mb-3">
                      {t("profile.earnings_recent")}
                    </p>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {incomeTxs.slice(0, 20).map((tx) => (
                        <div
                          key={tx.id}
                          className="flex items-center justify-between py-3 px-4 rounded-xl bg-slate-800/30 border border-slate-700/50 text-sm"
                        >
                          <div>
                            <p className="text-slate-200 truncate max-w-[200px] sm:max-w-none">
                              {tx.description || "รายได้จากงาน"}
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {formatDateThaiShort(tx.created_at)}
                              {(tx as { job_id?: string }).job_id && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    navigate(
                                      `/jobs/${(tx as { job_id?: string }).job_id}`,
                                    )
                                  }
                                  className="ml-2 text-emerald-500 hover:text-emerald-400"
                                >
                                  ดูงาน
                                </button>
                              )}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-emerald-400">
                              +{tx.amount.toLocaleString()} ฿
                            </span>
                            {tx.commission_deducted != null &&
                              tx.commission_deducted > 0 && (
                                <p className="text-xs text-slate-500">
                                  หัก {tx.commission_deducted.toLocaleString()}{" "}
                                  ฿
                                </p>
                              )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                /* Empty State */
                <div className="py-12 px-6 text-center rounded-xl bg-slate-800/30 border border-slate-700/50">
                  <Wallet className="mx-auto mb-4 w-14 h-14 text-slate-500" />
                  <p className="text-slate-300 font-medium mb-2">
                    {t("profile.earnings_empty")}
                  </p>
                  <div className="flex flex-wrap gap-3 justify-center mt-4">
                    <button
                      type="button"
                      onClick={() => navigate("/jobs")}
                      className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition"
                    >
                      {t("profile.view_jobs")}
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate("/")}
                      className="px-6 py-2.5 rounded-xl bg-slate-600 hover:bg-slate-500 text-white font-medium text-sm transition"
                    >
                      {t("profile.view_home")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

      {/* REVIEWS SECTION */}
      {activeTab === "reviews" && (
        <div className="luxury-card rounded-b-[20px] rounded-t-none border-t-0 p-6 sm:p-8 animate-in fade-in space-y-6">
          {/* ── Worker Grade Card (full) ── */}
          {(user?.role === "provider" ||
            profile?.role === UserRole.PROVIDER ||
            profile?.role === "provider") &&
            (user?.id || profile?.id) && (
              <WorkerGradeBadge
                userId={user?.id || profile?.id || ""}
                variant="full"
                reviewStats={reviewStats ?? undefined}
              />
            )}

          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold text-slate-100">รีวิวทั้งหมด</h3>
              <div className="flex items-center mt-1">
                <div className="flex text-yellow-400 mr-2">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      size={16}
                      fill={
                        i <
                        Math.round(workerGrade?.avg_rating || user?.rating || 0)
                          ? "currentColor"
                          : "none"
                      }
                      className={
                        i <
                        Math.round(workerGrade?.avg_rating || user?.rating || 0)
                          ? ""
                          : "text-slate-600"
                      }
                    />
                  ))}
                </div>
                <span className="text-slate-400 text-sm">
                  {(workerGrade?.avg_rating || user?.rating || 0).toFixed(1)} (
                  {workerGrade?.total_reviews ?? reviews.length} รีวิว)
                </span>
              </div>
            </div>

            {user?.role === "provider" && (
              <button
                onClick={() => navigate("/provider/dashboard")}
                data-tour="talent-dashboard-link"
                className="px-4 py-2 bg-blue-600 text-white border border-blue-500 rounded-xl hover:bg-blue-700 text-sm font-medium transition-colors"
              >
                👷 ดูงานที่รับ
              </button>
            )}
          </div>

          {reviews.length === 0 ? (
            <div className="text-center py-12">
              <Star className="mx-auto text-gray-300 mb-4" size={48} />
              <p className="text-gray-400">ยังไม่มีรีวิว</p>
              <p className="text-sm text-gray-400 mt-1">
                {user?.role === "provider"
                  ? "เมื่อมีคนรีวิวงานของคุณ จะปรากฏที่นี่"
                  : "รีวิวที่คุณเขียนจะปรากฏที่นี่"}
              </p>
            </div>
          ) : (
            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
              {reviews.map((review) => (
                <div
                  key={review.id}
                  className="p-5 border border-gray-100 rounded-xl hover:border-emerald-100 hover:bg-emerald-50/30 transition-all"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center">
                      <img
                        src={
                          review.reviewer_avatar ||
                          `https://ui-avatars.com/api/?name=${review.reviewer_name}&background=random`
                        }
                        alt={review.reviewer_name}
                        className="w-10 h-10 rounded-full mr-3 border-2 border-white shadow-sm"
                      />
                      <div>
                        <p className="font-bold text-gray-900">
                          {review.reviewer_name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(review.created_at).toLocaleDateString(
                            "th-TH",
                            {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            },
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center bg-yellow-50 px-3 py-1 rounded-full">
                      <div className="flex text-yellow-400 mr-1">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            size={14}
                            fill={i < review.rating ? "currentColor" : "none"}
                            className={i < review.rating ? "" : "text-gray-300"}
                          />
                        ))}
                      </div>
                      <span className="text-sm font-bold text-yellow-700">
                        {review.rating}.0
                      </span>
                    </div>
                  </div>

                  {review.comment && (
                    <p className="text-gray-700 mb-4 leading-relaxed">
                      {review.comment}
                    </p>
                  )}

                  {review.tags && review.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {review.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full border border-emerald-200"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {review.job_id && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <p className="text-xs text-gray-500 mb-1">สำหรับงาน:</p>
                      <button
                        onClick={() => navigate(`/jobs/${review.job_id}`)}
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                      >
                        ดูงานที่เกี่ยวข้อง →
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* คู่มือเติมเงินและถอนเงิน */}
      <WalletGuideModal
        isOpen={showWalletGuide}
        onClose={() => setShowWalletGuide(false)}
      />

      {/* --- MODALS (Deposit / Withdraw) - Portal เพื่อให้แสดงเหนือทุก element --- */}
      {activeModal &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
            <div
              ref={depositModalRef}
              role="dialog"
              aria-modal="true"
              aria-label={
                activeModal === "deposit" ? "เติมเงินวอลเล็ต" : "ถอนเงินวอลเล็ต"
              }
              tabIndex={-1}
              className={
                activeModal === "deposit"
                  ? "my-8 flex max-h-[min(92vh,780px)] w-full max-w-md flex-col overflow-hidden animate-in zoom-in-95 rounded-[1.35rem] bg-gradient-to-b from-slate-50 via-white to-white p-0 shadow-2xl shadow-indigo-900/10 outline-none ring-1 ring-slate-200/80"
                  : "my-8 w-full max-w-md animate-in zoom-in-95 rounded-xl bg-white p-6 shadow-xl outline-none"
              }
            >
              {activeModal === "deposit" &&
              depositSuccessPendingSlip &&
              depositPaymentId ? (
                <div className="flex flex-1 min-h-0 flex-col overflow-y-auto p-6 sm:p-7">
                  <div className="mb-5 rounded-2xl border border-emerald-200/85 bg-gradient-to-b from-emerald-50/55 via-white to-white px-4 py-5 text-center shadow-sm shadow-emerald-900/8 ring-1 ring-emerald-100/75">
                    <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 shadow-inner shadow-emerald-900/10 ring-1 ring-emerald-200/80">
                      <CheckCircle
                        className="text-emerald-700"
                        size={32}
                        strokeWidth={2}
                      />
                    </div>
                    <h3 className="text-xl font-bold tracking-tight text-slate-900">
                      ชำระเงินแล้ว — แนบสลิปเป็นหลักฐาน
                    </h3>
                    <p className="mt-2 px-0.5 text-xs leading-relaxed text-slate-600">
                      อัปโหลดรูปหรือ PDF สลิปการชำระ{" "}
                      <span className="font-semibold text-amber-900">
                        (บังคับทุกรายการ)
                      </span>
                    </p>
                    <p className="mt-3 font-mono text-lg font-bold tabular-nums tracking-tight text-emerald-900">
                      ฿{Number(amount || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="mb-4 rounded-xl border-2 border-dashed border-slate-300/95 bg-gradient-to-b from-white to-slate-50/90 p-4 shadow-inner shadow-slate-200/40 ring-1 ring-slate-100/80">
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      เลือกไฟล์สลิป
                    </label>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      disabled={uploadingSlip}
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f || !depositPaymentId) return;
                        setUploadingSlip(true);
                        try {
                          await uploadWalletDepositSlipToServer(
                            f,
                            depositPaymentId,
                          );
                          depositSlipUploadedRef.current = true;
                          await finishDepositSuccessUi(
                            depositPendingSuccessMessageRef.current,
                          );
                        } catch (err: any) {
                          notify(
                            err?.response?.data?.error ||
                              err?.message ||
                              "อัปโหลดล้มเหลว",
                            "error",
                          );
                        } finally {
                          setUploadingSlip(false);
                          e.target.value = "";
                        }
                      }}
                      className="w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
                    />
                    {uploadingSlip && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-600">
                        <Loader2 size={14} className="animate-spin shrink-0" />{" "}
                        กำลังอัปโหลด...
                      </p>
                    )}
                  </div>
                  <div className="rounded-xl border border-amber-300/90 bg-amber-50/95 p-3 shadow-sm ring-1 ring-amber-200/55">
                    <p className="text-xs font-semibold leading-relaxed text-amber-950">
                      ต้องอัปโหลดสลิปเพื่อบันทึกหลักฐานรายการนี้ให้ครบถ้วน —
                      กรุณาทำให้เสร็จก่อนปิดหน้าต่าง
                    </p>
                  </div>
                </div>
              ) : activeModal === "deposit" && walletDepositM1Step ? (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-2 pt-6 sm:px-7 sm:pb-3 sm:pt-7">
                    <WalletDepositM1HeaderStepper
                      walletDepositM1Step={walletDepositM1Step}
                      walletM1Method={walletM1Method}
                    />
                    {walletDepositM1Step === "choose_method" && (
                      <WalletDepositMethodPicker
                        onSelectMethod={(method) => {
                          setWalletM1Method(method);
                          setWalletDepositM1Step("enter_amount");
                          setWalletDepositPreview(null);
                          setWalletDepositPreviewError(null);
                        }}
                        onCancel={() => {
                          setActiveModal(null);
                          setWalletDepositM1Step(null);
                          setWalletM1Method(null);
                          setManualDepositSubmitResult(null);
                          setAmount("");
                          setWalletDepositPreview(null);
                          setWalletDepositPreviewError(null);
                          setManualStaticSlipFile(null);
                        }}
                      />
                    )}
                    {walletDepositM1Step === "enter_amount" && walletM1Method
                      ? (() => {
                          const previewRowsLocal =
                            buildWalletDepositPreviewRows(walletDepositPreview);
                          const netLine = previewRowsLocal?.find(
                            (r) => r.key === "net",
                          )?.valueDisplay;
                          const netHint = netLine
                            ? ` — เข้าวอลเล็ต ~฿${netLine}`
                            : "";
                          return (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setWalletDepositM1Step("choose_method");
                                  setWalletM1Method(null);
                                  setWalletDepositPreview(null);
                                  setWalletDepositPreviewError(null);
                                }}
                                className="mb-4 flex w-full items-center gap-2 rounded-xl border border-indigo-200/90 bg-white px-3 py-2.5 text-left text-sm font-medium text-indigo-900 shadow-sm ring-1 ring-indigo-100/60 transition hover:bg-indigo-50/80 active:scale-[0.99]"
                              >
                                ← เลือกช่องทางใหม่
                              </button>
                              <h3 className="mb-2 text-xl font-bold tracking-tight text-slate-900">
                                {walletM1Method === "manual_slip"
                                  ? "แนบสลิป (Manual)"
                                  : walletM1Method === "payso_promptpay"
                                    ? "PromptPay QR (PaySo)"
                                    : walletM1Method === "gateway_card"
                                      ? "Credit / Debit Card"
                                      : walletM1Method === "gateway_truemoney"
                                        ? "TrueMoney Wallet"
                                        : "Mobile Banking"}
                              </h3>
                              <p className="mb-4 text-[11px] leading-relaxed text-slate-600">
                                ยอดที่พิมพ์อยู่เป็นเพียงตัวอย่างในเครื่อง —
                                จำนวนที่ต้องชำระ ค่าธรรมเนียม
                                และเงินเข้าวอลเล็ตต้องดูจากสรุปจากระบบเมื่อโหลดได้
                                (ปุ่มด้านล่างหรือเมื่อหยุดพิมพ์สักครู่)
                                ไม่ควรเชื่อเลขที่เห็นก่อนมีสรุปนั้น
                              </p>
                              <label className="text-xs font-bold text-slate-600">
                                ยอดเติม (บาท)
                              </label>
                              <input
                                type="number"
                                className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 font-mono text-base shadow-sm outline-none ring-1 ring-transparent transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-indigo-100 disabled:bg-slate-50 disabled:opacity-60"
                                value={amount}
                                onChange={(e) => {
                                  setAmount(e.target.value);
                                  setWalletDepositPreview(null);
                                  setWalletDepositPreviewError(null);
                                }}
                                disabled={processing}
                                placeholder="เช่น 500"
                              />
                              {walletM1Method === "gateway_truemoney" && (
                                <p className="mb-3 rounded-xl border border-orange-100 bg-orange-50/80 px-3 py-3 text-xs leading-relaxed text-orange-950">
                                  ชำระผ่านหน้า Pay Solutions — กดปุ่มด้านล่าง
                                  แล้วเลือก &quot;วอลเล็ท&quot; → TrueMoney
                                  ในหน้าที่เปิดขึ้น
                                  ระบบจะเครดิตอัตโนมัติหลังชำระสำเร็จ
                                  (ไม่ต้องแนบสลิป)
                                </p>
                              )}
                              {walletM1Method === "gateway_mobile_banking" && (
                                <p className="mb-3 rounded-xl border border-violet-100 bg-violet-50/80 px-3 py-3 text-xs leading-relaxed text-violet-950">
                                  ชำระผ่านหน้า Pay Solutions — กดปุ่มด้านล่าง
                                  แล้วเลือก &quot;อินเทอร์เน็ต แบงกิ้ง&quot;
                                  จากนั้นเลือกธนาคารในหน้าที่เปิดขึ้น
                                  ระบบจะเครดิตอัตโนมัติหลังชำระสำเร็จ
                                  (ไม่ต้องแนบสลิป)
                                </p>
                              )}
                              {walletM1Method === "gateway_card" && (
                                <>
                                  <WalletDepositCardVisual
                                    numberFormatted="•••• •••• •••• ••••"
                                    cardholderName="PAY SOLUTIONS"
                                    expiryMmYy="MM/YY"
                                  />
                                  <p className="mb-3 rounded-xl border border-blue-100 bg-blue-50/80 px-3 py-3 text-xs leading-relaxed text-blue-900">
                                    ชำระผ่านหน้า Pay Solutions อย่างปลอดภัย —
                                    กดปุ่มด้านล่างแล้วกรอกข้อมูลบัตรในหน้าที่เปิดขึ้น
                                    ระบบจะเครดิตอัตโนมัติหลังชำระสำเร็จ
                                    (ไม่ต้องแนบสลิป)
                                  </p>
                                </>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  void fetchWalletDepositPreviewOnDemand({
                                    notifyOnInvalid: true,
                                    source: "button",
                                  })
                                }
                                disabled={
                                  walletDepositPreviewLoading || processing
                                }
                                className="mb-4 w-full rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-slate-100/80 py-3 text-sm font-bold text-slate-800 shadow-sm ring-1 ring-slate-200/80 transition hover:from-slate-100 hover:to-white disabled:opacity-50"
                              >
                                {walletDepositPreviewLoading ? (
                                  <span className="flex items-center justify-center gap-2">
                                    <Loader2
                                      size={16}
                                      className="animate-spin"
                                    />{" "}
                                    กำลังโหลด...
                                  </span>
                                ) : (
                                  "รีเฟรชสรุป"
                                )}
                              </button>
                              {walletDepositPreviewError && (
                                <p className="text-xs text-rose-600 mb-2">
                                  {walletDepositPreviewError}
                                </p>
                              )}
                              {previewRowsLocal ? (
                                <WalletDepositFeeSummaryCard
                                  rows={previewRowsLocal}
                                  tip={walletDepositPreview?.tip}
                                  loading={walletDepositPreviewLoading}
                                />
                              ) : null}
                              <div className="sticky bottom-0 z-[1] mt-5 space-y-2 border-t border-slate-200/80 bg-white/90 pt-4 backdrop-blur-[2px]">
                                {walletM1Method === "payso_promptpay" ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleDepositWithPromptPay()
                                    }
                                    disabled={
                                      processing ||
                                      !amount ||
                                      isNaN(Number(amount)) ||
                                      Number(amount) < 1
                                    }
                                    className="mb-1 w-full rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 py-3.5 text-[15px] font-bold text-white shadow-lg shadow-emerald-900/20 transition hover:brightness-[1.03] active:scale-[0.99] disabled:opacity-50"
                                  >
                                    {processing
                                      ? "กำลังสร้าง QR..."
                                      : `สร้าง QR รับเงิน (PaySo)${netHint}`}
                                  </button>
                                ) : walletM1Method === "manual_slip" ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const amt = Number(amount);
                                      if (!Number.isFinite(amt) || amt < 1) {
                                        notify(
                                          "กรุณากรอกยอดตั้งแต่ 1 บาทขึ้นไป",
                                          "error",
                                        );
                                        return;
                                      }
                                      setWalletDepositM1Step("manual_slip");
                                    }}
                                    disabled={
                                      processing ||
                                      !amount ||
                                      isNaN(Number(amount)) ||
                                      Number(amount) < 1
                                    }
                                    className="mb-1 w-full rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 py-3.5 text-[15px] font-bold text-white shadow-lg shadow-amber-900/20 transition hover:brightness-[1.03] active:scale-[0.99] disabled:opacity-50"
                                  >
                                    {`ถัดไป — แนบสลิป${netHint}`}
                                  </button>
                                ) : walletM1Method === "gateway_card" ? (
                                  <button
                                    type="button"
                                    onClick={() => void handleDepositWithCard()}
                                    disabled={
                                      processing ||
                                      !amount ||
                                      isNaN(Number(amount)) ||
                                      Number(amount) < 1
                                    }
                                    className="mb-1 w-full rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 py-3.5 text-[15px] font-bold text-white shadow-lg shadow-blue-900/20 transition hover:brightness-[1.03] active:scale-[0.99] disabled:opacity-50"
                                  >
                                    {processing
                                      ? "กำลังเปิดหน้าชำระ..."
                                      : `ชำระด้วยบัตร (PaySo)${netHint}`}
                                  </button>
                                ) : walletM1Method === "gateway_truemoney" ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleDepositTrueMoney()
                                    }
                                    disabled={
                                      processing ||
                                      !amount ||
                                      isNaN(Number(amount)) ||
                                      Number(amount) < 1
                                    }
                                    className="mb-1 w-full rounded-2xl bg-gradient-to-r from-orange-500 to-rose-500 py-3.5 text-[15px] font-bold text-white shadow-lg shadow-orange-900/20 transition hover:brightness-[1.03] active:scale-[0.99] disabled:opacity-50"
                                  >
                                    {processing
                                      ? "กำลังเปิดหน้าชำระ..."
                                      : `ชำระด้วย TrueMoney (PaySo)${netHint}`}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleDepositMobileBanking()
                                    }
                                    disabled={
                                      processing ||
                                      !amount ||
                                      isNaN(Number(amount)) ||
                                      Number(amount) < 1
                                    }
                                    className="mb-1 w-full rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 py-3.5 text-[15px] font-bold text-white shadow-lg shadow-violet-900/25 transition hover:brightness-[1.03] active:scale-[0.99] disabled:opacity-50"
                                  >
                                    {processing
                                      ? "กำลังเปิดหน้าชำระ..."
                                      : `ชำระด้วย Mobile Banking (PaySo)${netHint}`}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveModal(null);
                                    setWalletDepositM1Step(null);
                                    setWalletM1Method(null);
                                    setManualDepositSubmitResult(null);
                                    setAmount("");
                                    setWalletDepositPreview(null);
                                    setWalletDepositPreviewError(null);
                                    setManualStaticSlipFile(null);
                                  }}
                                  className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 font-bold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.99]"
                                >
                                  ยกเลิก
                                </button>
                                <div className="pt-1 text-center text-xs text-slate-500">
                                  <button
                                    type="button"
                                    onClick={() => setShowRefundPolicy(true)}
                                    className="font-medium text-indigo-600 hover:underline"
                                  >
                                    นโยบายการคืนเงิน
                                  </button>
                                </div>
                              </div>
                            </>
                          );
                        })()
                      : null}
                    {walletDepositM1Step === "manual_slip" && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setWalletDepositM1Step("enter_amount");
                            setManualStaticSlipFile(null);
                          }}
                          className="w-full mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-left text-sm font-medium text-emerald-800 shadow-sm shadow-emerald-900/5 transition-colors duration-150 hover:bg-emerald-100/90 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                        >
                          ← กลับไปแก้ยอด
                        </button>
                        <div className="space-y-4">
                          <div>
                            <h3 className="mb-1 text-xl font-bold tracking-tight text-slate-800">
                              แนบสลิป
                            </h3>
                            <p className="text-xs leading-relaxed text-slate-600">
                              ยอดคำขอ{" "}
                              <span className="font-mono font-semibold tabular-nums text-slate-800">
                                ฿{formatDepositAmountThb(Number(amount) || 0)}
                              </span>
                            </p>
                          </div>
                          <div className="rounded-xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/90 p-3 shadow-sm ring-1 ring-slate-100/80">
                            <button
                              type="button"
                              onClick={() =>
                                setManualStaticQrExpanded((v) => !v)
                              }
                              className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200/90 bg-white px-3 py-2.5 text-left text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                            >
                              <span className="min-w-0 text-left leading-snug">
                                QR พร้อมเพย์นิ่ง (อ้างอิงโอน — ไม่บังคับ)
                              </span>
                              <ChevronDown
                                className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${manualStaticQrExpanded ? "rotate-180" : ""}`}
                              />
                            </button>
                            {manualStaticQrExpanded && (
                              <div className="mt-3 rounded-lg border border-slate-200/80 bg-slate-50/90 p-3">
                                <div className="mb-3 flex justify-center rounded-xl bg-white p-3 shadow-inner shadow-slate-200/60 ring-1 ring-slate-100/80">
                                  <img
                                    src={WALLET_MANUAL_KTB_QR}
                                    alt="PromptPay QR Static"
                                    className="max-w-[240px] w-full object-contain"
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const a = document.createElement("a");
                                    a.href = WALLET_MANUAL_KTB_QR;
                                    a.download = "ktb-promptpay-qr.png";
                                    a.rel = "noopener";
                                    a.click();
                                    notify("บันทึก QR ลงเครื่อง", "success");
                                  }}
                                  className="w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white shadow-md shadow-slate-900/15 transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white active:scale-[0.99]"
                                >
                                  บันทึก QR ลงเครื่อง
                                </button>
                              </div>
                            )}
                          </div>
                          <div className="rounded-xl border-2 border-dashed border-slate-300/90 bg-white p-3 shadow-sm shadow-slate-900/5 ring-1 ring-slate-100/70">
                            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                              อัปโหลดสลิป
                            </p>
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              disabled={processing}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                setManualStaticSlipFile(f || null);
                              }}
                              className="w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleSubmitManualStaticSlip()}
                            disabled={
                              processing ||
                              !amount ||
                              isNaN(Number(amount)) ||
                              Number(amount) <= 0 ||
                              !manualStaticSlipFile
                            }
                            className="mb-1 w-full rounded-xl bg-sky-600 py-3.5 text-sm font-bold text-white shadow-md shadow-sky-900/10 transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white active:scale-[0.99]"
                          >
                            {processing ? "กำลังส่ง..." : "ส่งสลิปเพื่อตรวจสอบ"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveModal(null);
                              setWalletDepositM1Step(null);
                              setWalletM1Method(null);
                              setManualDepositSubmitResult(null);
                              setAmount("");
                              setManualStaticSlipFile(null);
                              setWalletDepositPreview(null);
                              setWalletDepositPreviewError(null);
                            }}
                            className="w-full rounded-xl border-2 border-slate-300 bg-white py-3 text-sm font-semibold text-slate-800 shadow-sm transition-colors duration-150 hover:border-slate-400 hover:bg-slate-50 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                          >
                            ยกเลิก
                          </button>
                        </div>
                      </>
                    )}
                    {walletDepositM1Step === "manual_done" &&
                      manualDepositSubmitResult && (
                        <>
                          <div className="mb-5 rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/90 p-5 text-center shadow-sm shadow-slate-900/5 ring-1 ring-slate-100/90">
                            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 shadow-inner shadow-amber-900/5 ring-1 ring-amber-200/70">
                              <Clock
                                className="text-amber-600"
                                size={30}
                                strokeWidth={2}
                              />
                            </div>
                            <h3 className="text-xl font-bold tracking-tight text-slate-800">
                              รอตรวจสอบ
                            </h3>
                            <p className="mt-2 text-sm leading-relaxed text-slate-600">
                              สถานะจากระบบ:{" "}
                              <span className="font-mono text-sm font-semibold text-slate-800">
                                {manualDepositSubmitResult.status}
                              </span>
                            </p>
                            {manualDepositSubmitResult.id ? (
                              <p className="mt-3 text-xs leading-relaxed text-slate-500">
                                เลขอ้างอิงคำขอ:{" "}
                                <span className="font-mono text-xs font-medium text-slate-700 break-all">
                                  {manualDepositSubmitResult.id}
                                </span>
                              </p>
                            ) : null}
                            {manualDepositSubmitResult.amount != null ? (
                              <p className="mt-2 text-sm font-medium text-slate-800">
                                ยอด:{" "}
                                <span className="font-mono tabular-nums font-semibold">
                                  ฿
                                  {formatDepositAmountThb(
                                    Number(manualDepositSubmitResult.amount),
                                  )}
                                </span>
                              </p>
                            ) : null}
                            <p className="mt-4 rounded-xl border border-amber-200/90 bg-amber-50/90 p-3 text-left text-xs leading-relaxed text-amber-900">
                              ยอดวอลเล็ตจะอัปเดตหลังทีมอนุมัติ — ไม่เครดิตทันที
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              await refreshWalletHistory();
                              setActiveModal(null);
                              setWalletDepositM1Step(null);
                              setWalletM1Method(null);
                              setManualDepositSubmitResult(null);
                              setAmount("");
                              setManualStaticSlipFile(null);
                              setWalletDepositPreview(null);
                              setWalletDepositPreviewError(null);
                            }}
                            className="w-full rounded-xl bg-slate-900 py-3.5 text-sm font-bold text-white shadow-md shadow-slate-900/20 transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white active:scale-[0.99]"
                          >
                            ปิด
                          </button>
                        </>
                      )}
                    {walletDepositM1Step === "payso_qr" && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            paysoPollStopRef.current = true;
                            clearPaysoDepositPolling();
                            setPaysoPollBanner(null);
                            setPaysoGatewayWarn(false);
                            setPaysoCreditErrBanner(null);
                            setPaysoLastStatusPayload(null);
                            setPaysoPollSoftTimeout(false);
                            paysoSoftTimeoutRef.current = false;
                            paysoPollTickRef.current = null;
                            setWalletDepositM1Step("enter_amount");
                            setDepositQrUrl(null);
                            setDepositPaymentId(null);
                            clearPaysoAutoCloseCountdown();
                            paysoSuccessHandledRef.current = false;
                            walletDepositChargeSourceRef.current = null;
                            setDepositChargeSourceType(null);
                            setProcessing(false);
                            setDepositSuccessPendingSlip(false);
                            depositSlipUploadedRef.current = false;
                          }}
                          className="w-full mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-left text-sm font-medium text-emerald-800 shadow-sm shadow-emerald-900/5 transition-colors duration-150 hover:bg-emerald-100/90 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                        >
                          ← กลับไปแก้ยอด / สร้าง QR ใหม่
                        </button>
                        <div className="mb-5 space-y-4">
                          <div className="text-center">
                            <div className="mb-3 flex justify-center">
                              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 shadow-sm ring-1 ring-emerald-200/80">
                                <Scan
                                  className="text-emerald-600"
                                  size={22}
                                  strokeWidth={2}
                                />
                              </span>
                            </div>
                            <h3 className="text-xl font-bold tracking-tight text-slate-800">
                              {PAYSO_UX_TEXT.paysoQrTitle}
                            </h3>
                            <p className="mt-2 px-1 text-xs leading-relaxed text-slate-600">
                              {PAYSO_UX_TEXT.paysoQrSubtitle}
                            </p>
                          </div>
                          {(() => {
                            const paysoS = String(
                              paysoLastStatusPayload?.status ?? "",
                            ).toLowerCase();
                            const paysoR =
                              paysoLastStatusPayload?.reconcile ?? null;
                            const activeIdx = paysoStepperActiveIndex(
                              paysoS,
                              paysoR,
                            );
                            return (
                              <div className="rounded-xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/90 p-3 shadow-sm ring-1 ring-slate-100/80">
                                <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                                  {PAYSO_UX_TEXT.statusTitle}
                                </p>
                                <div className="grid grid-cols-4 gap-1 text-[10px] leading-tight sm:gap-1.5 sm:text-xs">
                                  {PAYSO_STEPPER_LABELS.map((label, i) => {
                                    const isSuccessStep =
                                      i === 3 && paysoS === "success";
                                    const done =
                                      i === 0 || i < activeIdx || isSuccessStep;
                                    const active =
                                      i === activeIdx &&
                                      paysoS !== "success" &&
                                      !isSuccessStep;
                                    return (
                                      <div
                                        key={label}
                                        className={`flex flex-col items-center text-center rounded-lg px-0.5 py-1.5 ${
                                          isSuccessStep || (done && !active)
                                            ? "bg-emerald-100 text-emerald-900 border border-emerald-200"
                                            : active
                                              ? "bg-blue-50 text-blue-900 border border-blue-200 ring-1 ring-blue-200"
                                              : "text-slate-400 border border-transparent"
                                        }`}
                                      >
                                        <span className="mb-0.5 flex h-4 items-center justify-center">
                                          {isSuccessStep ||
                                          (done && !active) ? (
                                            <CheckCircle
                                              className="text-emerald-600"
                                              size={16}
                                            />
                                          ) : active ? (
                                            <Loader2
                                              className="animate-spin text-blue-600"
                                              size={16}
                                            />
                                          ) : (
                                            <span className="inline-block h-3.5 w-3.5 rounded-full border border-slate-300 bg-white" />
                                          )}
                                        </span>
                                        <span className="font-medium">
                                          {label}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })()}
                          <div className="rounded-xl border-2 border-dashed border-emerald-200/90 bg-gradient-to-br from-emerald-50/80 via-white to-slate-50/40 p-4 shadow-sm shadow-emerald-900/5 ring-1 ring-emerald-100/60">
                            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                              ยอดที่ต้องชำระ
                            </p>
                            <p className="mt-1 text-3xl font-bold tracking-tight text-emerald-950 tabular-nums">
                              ฿{Number(amount || 0).toLocaleString()}
                            </p>
                            {(() => {
                              const rows =
                                buildWalletDepositPreviewRows(
                                  walletDepositPreview,
                                );
                              if (!rows?.length) {
                                return (
                                  <p className="mt-2 text-xs leading-relaxed text-emerald-700">
                                    กด &quot;รีเฟรชสรุป&quot; ในขั้นตอนก่อนหน้า
                                    หรือรอให้ระบบโหลดสรุปอัตโนมัติเพื่อดูยอดหักล่วงหน้า
                                  </p>
                                );
                              }
                              return (
                                <div className="mt-3 space-y-1 border-t border-emerald-200/60 pt-3 text-left text-xs text-emerald-900">
                                  {rows.map((r) => (
                                    <div
                                      key={r.key}
                                      className="flex items-baseline justify-between gap-2"
                                    >
                                      <span className="text-emerald-800/90">
                                        {r.labelTh}
                                      </span>
                                      <span className="font-mono font-semibold tabular-nums text-emerald-950">
                                        ฿{r.valueDisplay}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}
                          </div>

                          {depositQrUrl ? (
                            <div className="flex justify-center rounded-2xl border border-slate-200/90 bg-gradient-to-br from-slate-50 to-white p-6 shadow-md shadow-slate-900/8 ring-1 ring-slate-200/50">
                              <img
                                src={depositQrUrl}
                                alt="PromptPay QR Code"
                                className="h-56 w-56 object-contain"
                                id="promptpay-qr-image"
                              />
                            </div>
                          ) : null}
                        </div>
                        <p className="mb-4 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2.5 text-center text-[11px] leading-relaxed text-slate-600">
                          {PAYSO_UX_TEXT.webhookCopy}
                        </p>
                        {/* Upstream: if reconcile errors persist, check PAYSO_DEPOSIT_STATUS_PATH in backend/.env */}
                        <div className="space-y-2 mb-3" aria-live="polite">
                          {paysoPollBanner ? (
                            <div
                              className={`rounded-xl border p-3 text-sm ${
                                paysoPollBanner.kind === "auth"
                                  ? "border-rose-200 bg-rose-50 text-rose-900"
                                  : "border-amber-200 bg-amber-50 text-amber-950"
                              }`}
                            >
                              <p className="font-medium">
                                {paysoPollBanner.message}
                              </p>
                              <button
                                type="button"
                                className="mt-2 w-full py-2 rounded-lg bg-white/80 border border-slate-200 font-semibold text-slate-800 text-sm hover:bg-white"
                                onClick={() => triggerPaysoManualStatusCheck()}
                              >
                                {PAYSO_UX_TEXT.manualRetry}
                              </button>
                            </div>
                          ) : null}
                          {(() => {
                            const notice =
                              getPaysoReconcileNotice(
                                paysoLastStatusPayload?.reconcile,
                              ) ||
                              (paysoGatewayWarn
                                ? {
                                    code: "status_upstream_error" as const,
                                    ...PAYSO_RECONCILE_NOTICE.status_upstream_error,
                                  }
                                : paysoCreditErrBanner
                                  ? {
                                      code: "credit_failed" as const,
                                      ...PAYSO_RECONCILE_NOTICE.credit_failed,
                                    }
                                  : null);
                            if (!notice || notice.code === "awaiting_bank")
                              return null;
                            const toneClass =
                              notice.tone === "danger"
                                ? "border-red-200 bg-red-50 text-red-900"
                                : notice.tone === "warning"
                                  ? "border-amber-300 bg-amber-50 text-amber-950"
                                  : "border-blue-200 bg-blue-50 text-blue-900";
                            return (
                              <div
                                className={`rounded-xl border p-3 text-sm ${toneClass}`}
                              >
                                <p className="font-semibold">{notice.title}</p>
                                <p className="mt-1 text-xs leading-relaxed">
                                  {notice.body}
                                </p>
                                <p className="mt-2 text-[10px] font-mono opacity-70">
                                  code: {notice.code}
                                </p>
                              </div>
                            );
                          })()}
                          {paysoPollSoftTimeout ? (
                            <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-3 text-sm text-amber-950">
                              <p className="font-semibold">
                                {PAYSO_UX_TEXT.autoTimeoutTitle}
                              </p>
                              <p className="text-xs mt-1 leading-relaxed">
                                {PAYSO_UX_TEXT.autoTimeoutBody}
                              </p>
                              <div className="mt-2 flex flex-col gap-2">
                                <button
                                  type="button"
                                  className="w-full py-2.5 rounded-lg bg-white border border-amber-300 font-bold text-amber-950 text-sm hover:bg-amber-100"
                                  onClick={() =>
                                    triggerPaysoManualStatusCheck()
                                  }
                                >
                                  {PAYSO_UX_TEXT.manualRetry}
                                </button>
                                <button
                                  type="button"
                                  className="w-full py-2.5 rounded-lg border border-slate-300 font-bold text-slate-800 text-sm hover:bg-slate-50"
                                  onClick={() => {
                                    paysoPollStopRef.current = true;
                                    clearPaysoDepositPolling();
                                    setPaysoPollBanner(null);
                                    setPaysoGatewayWarn(false);
                                    setPaysoCreditErrBanner(null);
                                    setPaysoLastStatusPayload(null);
                                    setPaysoPollSoftTimeout(false);
                                    paysoSoftTimeoutRef.current = false;
                                    paysoPollTickRef.current = null;
                                    setActiveModal(null);
                                    setWalletDepositM1Step(null);
                                    setWalletM1Method(null);
                                    setManualDepositSubmitResult(null);
                                    setDepositStep("amount");
                                    setDepositQrUrl(null);
                                    setDepositPaymentId(null);
                                    walletDepositChargeSourceRef.current = null;
                                    setDepositChargeSourceType(null);
                                    setDepositMethod(null);
                                    setDepositSuccessPendingSlip(false);
                                    depositSlipUploadedRef.current = false;
                                    setManualStaticSlipFile(null);
                                    setDepositOtherChannelsOpen(false);
                                    setAmount("");
                                    setWalletDepositPreview(null);
                                    setWalletDepositPreviewError(null);
                                    setProcessing(false);
                                    setActiveTab("wallet");
                                    void refreshWalletHistory();
                                  }}
                                >
                                  {PAYSO_UX_TEXT.closeToWalletHistory}
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                        {!paysoPollSoftTimeout &&
                        processing &&
                        paysoAutoCloseCountdown === null ? (
                          <div className="mb-4 flex items-center justify-center gap-2 rounded-xl border border-blue-200/90 bg-blue-50/90 py-3 shadow-sm shadow-blue-900/5">
                            <Loader2
                              size={18}
                              className="animate-spin text-blue-600"
                            />
                            <span className="text-sm font-medium text-blue-700">
                              {PAYSO_UX_TEXT.checkingPayment}
                            </span>
                          </div>
                        ) : null}
                        {paysoAutoCloseCountdown !== null && (
                          <div className="mb-4 rounded-xl border border-emerald-200/90 bg-emerald-50/90 p-3 text-center shadow-sm shadow-emerald-900/5">
                            <p className="text-sm font-bold text-emerald-900">
                              {PAYSO_UX_TEXT.successTitle}
                            </p>
                            <p className="mt-1 text-xs text-emerald-800">
                              {PAYSO_UX_TEXT.successCountdown(
                                paysoAutoCloseCountdown,
                              )}
                            </p>
                          </div>
                        )}
                        <div className="mb-4 rounded-xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/90 p-3 shadow-sm ring-1 ring-slate-100/80">
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            {PAYSO_UX_TEXT.supportReference}
                          </p>
                          <p className="break-all font-mono text-xs text-slate-900 sm:text-sm">
                            {depositPaymentId ?? "—"}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={!depositPaymentId}
                              className="min-w-[120px] flex-1 rounded-xl border border-slate-300 bg-white py-2.5 text-sm font-bold text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:opacity-50"
                              onClick={() => {
                                if (!depositPaymentId) return;
                                void navigator.clipboard?.writeText(
                                  depositPaymentId,
                                );
                                notify(
                                  PAYSO_UX_TEXT.copiedReference,
                                  "success",
                                );
                              }}
                            >
                              <span className="flex items-center justify-center gap-1">
                                <Copy size={14} />
                                {PAYSO_UX_TEXT.copyReference}
                              </span>
                            </button>
                            <button
                              type="button"
                              className="min-w-[120px] flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white shadow-sm shadow-blue-900/15 transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                              onClick={() => triggerPaysoManualStatusCheck()}
                            >
                              {PAYSO_UX_TEXT.manualRetry}
                            </button>
                          </div>
                          <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
                            {PAYSO_UX_TEXT.safeRetryCopy}
                          </p>
                        </div>
                        <div className="mb-4 rounded-xl border border-slate-200/80 bg-white/90 p-3 shadow-sm shadow-slate-900/5">
                          <div className="flex items-start gap-2.5 border-b border-slate-100 pb-2 text-xs leading-relaxed text-slate-600">
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200/80">
                              1
                            </span>
                            <span>บันทึกหรือแคปหน้าจอ QR Code</span>
                          </div>
                          <div className="flex items-start gap-2.5 border-b border-slate-100 py-2 text-xs leading-relaxed text-slate-600">
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200/80">
                              2
                            </span>
                            <span>เปิดแอปธนาคารหรือ Mobile Banking</span>
                          </div>
                          <div className="flex items-start gap-2.5 pt-2 text-xs leading-relaxed text-slate-600">
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200/80">
                              3
                            </span>
                            <span>สแกน QR Code เพื่อชำระเงิน</span>
                          </div>
                        </div>
                        <div className="mb-3 rounded-xl border-2 border-dashed border-emerald-300/80 bg-emerald-50/50 p-3 shadow-sm ring-1 ring-emerald-100/60">
                          <p className="mb-1 text-sm font-bold text-emerald-900">
                            {PAYSO_UX_TEXT.gatewayAutoConfirmTitle}
                          </p>
                          <p className="text-xs leading-relaxed text-emerald-800/90">
                            {PAYSO_UX_TEXT.gatewayAutoConfirmBody}
                          </p>
                        </div>
                        <div className="mb-3 flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const amt = Number(amount).toFixed(2);
                              navigator.clipboard?.writeText(amt);
                              notify(PAYSO_UX_TEXT.copiedAmount, "success");
                            }}
                            className="flex-1 rounded-xl border border-blue-200 bg-blue-50 py-3 text-sm font-bold text-blue-700 shadow-sm transition-colors hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white active:scale-[0.99]"
                          >
                            <span className="flex items-center justify-center gap-1">
                              Copy Amount
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!depositQrUrl) return;
                              const link = document.createElement("a");
                              link.href = depositQrUrl;
                              link.download = `promptpay-qr-${Date.now()}.png`;
                              link.click();
                              notify(PAYSO_UX_TEXT.savedQr, "success");
                            }}
                            className="flex-1 rounded-xl border border-emerald-200 bg-emerald-50 py-3 text-sm font-bold text-emerald-700 shadow-sm transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white active:scale-[0.99]"
                          >
                            <span className="flex items-center justify-center gap-1">
                              Save QR
                            </span>
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            paysoPollStopRef.current = true;
                            clearPaysoDepositPolling();
                            setPaysoPollBanner(null);
                            setPaysoGatewayWarn(false);
                            setPaysoCreditErrBanner(null);
                            setPaysoLastStatusPayload(null);
                            setPaysoPollSoftTimeout(false);
                            paysoSoftTimeoutRef.current = false;
                            paysoPollTickRef.current = null;
                            setActiveModal(null);
                            setWalletDepositM1Step(null);
                            setWalletM1Method(null);
                            setManualDepositSubmitResult(null);
                            setDepositStep("amount");
                            setDepositQrUrl(null);
                            setDepositPaymentId(null);
                            walletDepositChargeSourceRef.current = null;
                            setDepositChargeSourceType(null);
                            setDepositMethod(null);
                            setDepositSuccessPendingSlip(false);
                            depositSlipUploadedRef.current = false;
                            setManualStaticSlipFile(null);
                            setDepositOtherChannelsOpen(false);
                            setAmount("");
                            setWalletDepositPreview(null);
                            setWalletDepositPreviewError(null);
                            setProcessing(false);
                          }}
                          className="w-full rounded-xl border-2 border-slate-300 bg-white py-3 text-sm font-semibold text-slate-800 shadow-sm transition-colors duration-150 hover:border-slate-400 hover:bg-slate-50 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                        >
                          ยกเลิก
                        </button>
                        <div className="mt-3 text-center text-xs text-slate-500">
                          <button
                            type="button"
                            onClick={() => setShowRefundPolicy(true)}
                            className="text-emerald-600 hover:underline"
                          >
                            นโยบายการคืนเงิน
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ) : activeModal === "withdraw" ? (
                (() => {
                  const rawStr = amount.replace(/,/g, "").trim();
                  const parsedAmt = parseFloat(rawStr);
                  const amtRounded = Number.isFinite(parsedAmt)
                    ? roundThb2(parsedAmt)
                    : NaN;
                  const withdrawAmtValid =
                    withdrawFlowStep === 2 &&
                    Number.isFinite(amtRounded) &&
                    amtRounded >= MIN_WITHDRAWAL_THB;
                  const quoteAligned =
                    withdrawAmtValid &&
                    payoutQuote &&
                    !payoutQuoteProvisional &&
                    payoutQuote.amount_requested != null &&
                    Math.abs(
                      roundThb2(payoutQuote.amount_requested) - amtRounded,
                    ) < 0.005;
                  const quoteBlocksSubmit =
                    !!payoutQuote &&
                    !payoutQuoteProvisional &&
                    payoutQuote.blocking_reason != null;
                  const withdrawSubmitDisabled =
                    withdrawFlowStep !== 2 ||
                    processing ||
                    !withdrawAmtValid ||
                    payoutQuoteLoading ||
                    payoutQuoteError != null ||
                    !quoteAligned ||
                    quoteBlocksSubmit;
                  const channelSummaryLabel =
                    user?.role === UserRole.PROVIDER
                      ? withdrawSpeed === "instant"
                        ? "โอนด่วน (Instant)"
                        : "รอบปกติ (Batch)"
                      : withdrawChannel === "promptpay"
                        ? "PromptPay"
                        : withdrawChannel === "truemoney"
                          ? "TrueMoney Wallet"
                          : "โอนธนาคาร";
                  const maxNetPctBase = withdrawMaxNetEstimate ?? 0;
                  const withdrawThrottleRemainSec =
                    withdrawThrottleEndsAtMs != null
                      ? Math.max(
                          0,
                          Math.ceil(
                            (withdrawThrottleEndsAtMs - Date.now()) / 1000,
                          ),
                        )
                      : null;
                  void withdrawThrottleClockTick;
                  return (
                    <>
                      <h3 className="text-lg font-bold mb-1">ถอนเงิน</h3>
                      <p className="text-xs text-slate-500 mb-4">
                        ระบบคิดค่าธรรมเนียมจากเซิร์ฟเวอร์ก่อนยืนยันคำขอ
                      </p>

                      {withdrawThrottleRemainSec != null &&
                      withdrawThrottleRemainSec > 0 ? (
                        <div
                          role="status"
                          aria-live="polite"
                          className="mb-4 rounded-2xl border-2 border-amber-400/80 bg-gradient-to-br from-amber-50 via-white to-orange-50/80 p-4 shadow-md ring-1 ring-amber-200/70"
                        >
                          <p className="text-center text-[11px] font-bold uppercase tracking-wide text-amber-950">
                            อยู่ในช่วงจำกัดการเรียกระบบ
                          </p>
                          <p className="mt-2 text-center text-[13px] leading-snug text-slate-800">
                            พอครบเวลาด้านล่าง
                            โควตาการถอนหรือการคิดคำนวณจากเซิร์ฟเวอร์ในรอบนี้จะเริ่มใหม่ให้ใช้งานได้
                          </p>
                          <div className="mt-4 flex flex-col items-center gap-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              พ้นช่วงจำกัดประมาณใน
                            </span>
                            <span className="font-mono text-4xl font-bold tabular-nums tracking-tight text-amber-950">
                              {formatHmsCountdown(withdrawThrottleRemainSec)}
                            </span>
                            <span className="mt-1 text-center text-[10px] leading-tight text-slate-600">
                              นับถอยหลังจากเซิร์ฟเวอร์เมื่อครบเป็น 00:00
                              &nbsp;—&nbsp;
                              <span className="font-semibold text-slate-800">
                                กด 「ลองอีกครั้ง」ด้านล่าง
                              </span>
                              หากหน้าจอยังเก่าอยู่
                            </span>
                          </div>
                        </div>
                      ) : null}

                      {/* Step indicator */}
                      <div className="flex items-start justify-between gap-1 mb-5">
                        {(
                          [
                            { s: 1 as const, t: "เลือกช่องทาง" },
                            { s: 2 as const, t: "ตรวจสอบยอดสุทธิ" },
                            { s: 3 as const, t: "ส่งคำขอแล้ว" },
                          ] as const
                        ).map(({ s, t }, idx) => {
                          const active = withdrawFlowStep === s;
                          const done = withdrawFlowStep > s;
                          return (
                            <div
                              key={s}
                              className="flex-1 flex flex-col items-center text-center min-w-0"
                            >
                              <div className="flex w-full items-center mb-2">
                                {idx > 0 ? (
                                  <div
                                    className={`h-0.5 flex-1 rounded ${withdrawFlowStep > s - 1 ? "bg-emerald-400" : "bg-slate-200"}`}
                                  />
                                ) : (
                                  <div className="flex-1" />
                                )}
                                <div
                                  className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 mx-1 ${
                                    done || active
                                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                                      : "border-slate-200 bg-white text-slate-400"
                                  }`}
                                >
                                  {done ? "✓" : s}
                                </div>
                                {idx < 2 ? (
                                  <div
                                    className={`h-0.5 flex-1 rounded ${withdrawFlowStep > s ? "bg-emerald-400" : "bg-slate-200"}`}
                                  />
                                ) : (
                                  <div className="flex-1" />
                                )}
                              </div>
                              <p
                                className={`text-[10px] leading-tight px-0.5 ${active ? "font-bold text-slate-800" : "text-slate-500"}`}
                              >
                                {t}
                              </p>
                            </div>
                          );
                        })}
                      </div>

                      {withdrawFlowStep === 3 ? (
                        <div className="text-center py-1">
                          <CheckCircle
                            className="w-14 h-14 text-emerald-500 mx-auto mb-3"
                            aria-hidden
                          />
                          <p className="font-bold text-lg text-slate-800 mb-1">
                            ส่งคำขอถอนแล้ว
                          </p>
                          <p className="text-xs text-slate-600 mb-3">
                            เลขอ้างอิงคำขอ (เลือกคัดลอกได้ทั้งหมด)
                          </p>
                          <div className="rounded-xl border-2 border-slate-200 bg-slate-50 p-3 mb-3 select-text text-left">
                            <p className="font-mono text-sm break-all text-slate-900">
                              {withdrawSuccessRequestId ?? "—"}
                            </p>
                          </div>
                          <div className="flex flex-col gap-2">
                            <button
                              type="button"
                              disabled={!withdrawSuccessRequestId}
                              onClick={() => {
                                if (!withdrawSuccessRequestId) return;
                                void navigator.clipboard?.writeText(
                                  withdrawSuccessRequestId,
                                );
                                notify("คัดลอกเลขคำขอถอนแล้ว", "success");
                              }}
                              className="w-full py-2.5 rounded-xl bg-slate-100 text-slate-800 font-bold text-sm border border-slate-200 hover:bg-slate-200 flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                              <Copy size={16} />
                              คัดลอกเลขคำขอ
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setWithdrawFlowStep(1);
                                setWithdrawSuccessRequestId(null);
                                setAmount("");
                                setPayoutQuote(null);
                                setPayoutQuoteError(null);
                                setPayoutQuoteProvisional(false);
                                payoutQuoteLastSuccessKeyRef.current = null;
                                setPayoutQuoteRetryNonce(0);
                              }}
                              className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700"
                            >
                              ถอนอีกครั้ง
                            </button>
                          </div>
                        </div>
                      ) : !bankAccounts.length ? (
                        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                          <p className="text-sm font-medium text-amber-800 mb-2">
                            กรุณาเพิ่มบัญชีธนาคารก่อนถอนเงิน
                          </p>
                          <p className="text-xs text-amber-700 mb-3">
                            เพื่อความปลอดภัยและป้องกันการทุจริต
                            การถอนเงินจะทำได้เฉพาะเมื่อได้ลงทะเบียนบัญชีรับเงินใน
                            <strong> Settings → Payment Methods </strong>
                            แล้วเท่านั้น
                            และระบบอนุญาตให้ถอนเข้าบัญชีได้เพียงบัญชีเดียว
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveModal(null);
                              navigate("/settings");
                            }}
                            className="w-full py-2.5 bg-amber-600 text-white rounded-xl font-bold text-sm"
                          >
                            ไปที่ Settings → Payment Methods
                          </button>
                        </div>
                      ) : (
                        <>
                          {withdrawFlowStep === 1 && (
                            <>
                              <p className="text-xs text-gray-500 mb-2 font-medium">
                                1 เลือกช่องทางการถอน
                              </p>
                              {user?.role === UserRole.PROVIDER ? (
                                <div className="grid grid-cols-2 gap-2 mb-3">
                                  <button
                                    type="button"
                                    onClick={() => setWithdrawSpeed("batch")}
                                    className={`py-3 px-3 rounded-xl border-2 text-center text-sm font-medium transition ${
                                      withdrawSpeed === "batch"
                                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                                        : "border-gray-200 hover:border-gray-300 text-gray-600"
                                    }`}
                                  >
                                    <span className="block font-medium">
                                      📅 รอบปกติ (Batch)
                                    </span>
                                    <span className="block text-xs opacity-80 mt-0.5 tabular-nums">
                                      ~
                                      {typeof payoutEligibility?.fee_standard_thb ===
                                      "number"
                                        ? payoutEligibility.fee_standard_thb
                                        : "—"}{" "}
                                      บ.
                                      {payoutQuote &&
                                      withdrawSpeed === "batch" &&
                                      payoutQuoteLoading === false
                                        ? ` • จากยอดตัวอย่างค่าธรรมเนียม ${formatThb2(payoutQuote.fee_thb)}`
                                        : ""}
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setWithdrawSpeed("instant")}
                                    className={`py-3 px-3 rounded-xl border-2 text-center text-sm font-medium transition ${
                                      withdrawSpeed === "instant"
                                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                                        : "border-gray-200 hover:border-gray-300 text-gray-600"
                                    }`}
                                  >
                                    <span className="block font-medium">
                                      ⚡ โอนด่วน (Instant)
                                    </span>
                                    <span className="block text-xs opacity-80 mt-0.5 tabular-nums">
                                      ~
                                      {typeof payoutEligibility?.fee_instant_thb ===
                                      "number"
                                        ? payoutEligibility.fee_instant_thb
                                        : "—"}{" "}
                                      บ.
                                      {payoutQuote &&
                                      withdrawSpeed === "instant" &&
                                      payoutQuoteLoading === false
                                        ? ` • จากยอดตัวอย่างค่าธรรมเนียม ${formatThb2(payoutQuote.fee_thb)}`
                                        : ""}
                                    </span>
                                  </button>
                                </div>
                              ) : (
                                <div className="grid grid-cols-3 gap-2 mb-3">
                                  {(
                                    [
                                      {
                                        channel: "promptpay" as PaymentChannel,
                                        label: "PromptPay QR",
                                      },
                                      {
                                        channel:
                                          "bank_transfer" as PaymentChannel,
                                        label: "โอนธนาคาร",
                                      },
                                      {
                                        channel: "truemoney" as PaymentChannel,
                                        label: "TrueMoney",
                                      },
                                    ] as const
                                  ).map(({ channel, label }) => (
                                    <button
                                      key={channel}
                                      type="button"
                                      onClick={() =>
                                        setWithdrawChannel(channel)
                                      }
                                      className={`py-3 px-2 rounded-xl border-2 text-center text-sm font-medium transition ${
                                        withdrawChannel === channel
                                          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                                          : "border-gray-200 hover:border-gray-300 text-gray-600"
                                      }`}
                                    >
                                      <span className="block font-medium">
                                        {label}
                                      </span>
                                      <span className="block text-[10px] opacity-75 mt-0.5 leading-tight">
                                        ค่าธรรมเนียมจากระบบ
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              )}
                              <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3 mb-4 text-xs text-slate-700 space-y-1.5">
                                <div className="flex justify-between gap-2">
                                  <span className="text-slate-500 shrink-0">
                                    ช่องทางที่เลือก
                                  </span>
                                  <span className="font-medium text-right">
                                    {channelSummaryLabel}
                                  </span>
                                </div>
                                {(user?.role === UserRole.PROVIDER ||
                                  withdrawChannel === "bank_transfer") && (
                                  <div className="flex justify-between gap-2">
                                    <span className="text-slate-500 shrink-0">
                                      บัญชีรับเงิน
                                    </span>
                                    <span className="font-medium text-right break-all">
                                      {selectedWithdrawAccount
                                        ? `${selectedWithdrawAccount.provider_name} · ${selectedWithdrawAccount.account_number}`
                                        : bankAccounts[0]
                                          ? `${bankAccounts[0].provider_name} · ${bankAccounts[0].account_number}`
                                          : "—"}
                                    </span>
                                  </div>
                                )}
                                {payoutQuote?.eta_label_th ? (
                                  <div className="flex justify-between gap-2 pt-1 border-t border-slate-200/80">
                                    <span className="text-slate-500 shrink-0">
                                      ETA โดยประมาณ
                                    </span>
                                    <span className="font-medium text-right">
                                      {payoutQuote.eta_label_th}
                                    </span>
                                  </div>
                                ) : null}
                                {payoutQuoteProvisional &&
                                  withdrawFlowStep === 1 && (
                                    <p className="text-[10px] text-slate-500 pt-1">
                                      ใช้ยอดขั้นต่ำ {MIN_WITHDRAWAL_THB}{" "}
                                      บาทเป็นตัวอย่าง —
                                      ขั้นตอนถัดไปให้ระบุจำนวนจริง
                                    </p>
                                  )}
                              </div>

                              {payoutQuoteError && withdrawFlowStep === 1 ? (
                                <div className="mb-3 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800">
                                  <p className="mb-2">{payoutQuoteError}</p>
                                  <button
                                    type="button"
                                    disabled={payoutQuoteLoading}
                                    onClick={() =>
                                      setPayoutQuoteRetryNonce((n) => n + 1)
                                    }
                                    className="w-full py-2 rounded-lg border border-red-300 bg-white font-semibold text-red-900 hover:bg-red-50 disabled:opacity-50"
                                  >
                                    ลองอีกครั้ง
                                  </button>
                                </div>
                              ) : null}

                              <button
                                type="button"
                                onClick={() => setWithdrawFlowStep(2)}
                                disabled={
                                  payoutQuoteLoading || payoutQuoteError != null
                                }
                                className="w-full py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                ถัดไป — ตรวจสอบยอดสุทธิ
                              </button>
                            </>
                          )}

                          {withdrawFlowStep === 2 && (
                            <>
                              <div className="flex items-center gap-2 mb-3">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setWithdrawFlowStep(1);
                                    setPayoutQuoteError(null);
                                  }}
                                  className="p-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                                  aria-label="กลับ"
                                >
                                  <ChevronLeft size={18} />
                                </button>
                                <p className="text-sm font-bold text-slate-800">
                                  2 ตรวจสอบยอดสุทธิก่อนส่งคำขอ
                                </p>
                              </div>

                              <p className="text-[11px] text-slate-600 mb-1">
                                ช่องทาง:{" "}
                                <span className="font-semibold text-slate-800">
                                  {channelSummaryLabel}
                                </span>
                                {user?.role === UserRole.PROVIDER ||
                                withdrawChannel === "bank_transfer" ? (
                                  <span className="block mt-1 break-all font-mono text-[11px] text-slate-700">
                                    บัญชีรับเงิน:{" "}
                                    {selectedWithdrawAccount
                                      ? `${selectedWithdrawAccount.provider_name} · ${selectedWithdrawAccount.account_number}`
                                      : bankAccounts[0]
                                        ? `${bankAccounts[0].provider_name} · ${bankAccounts[0].account_number}`
                                        : "—"}
                                  </span>
                                ) : (
                                  <span className="block mt-1 text-slate-600">
                                    {withdrawChannel === "promptpay"
                                      ? "ถอนผ่าน PromptPay ตามเบอร์ที่ลงทะเบียน"
                                      : "ถอนเข้า TrueMoney Wallet ตามเบอร์ที่ลงทะเบียน"}
                                  </span>
                                )}
                              </p>

                              <div className="flex justify-between text-xs text-slate-600 mb-1">
                                <span>ยอดถอนได้ (สุทธิสูงสุดโดยประมาณ)</span>
                                {withdrawMaxNetLoading ? (
                                  <span className="text-slate-400">
                                    กำลังคำนวณ…
                                  </span>
                                ) : (
                                  <span className="font-bold text-slate-800 tabular-nums">
                                    {formatThb2(maxNetPctBase)} บาท
                                  </span>
                                )}
                              </div>
                              {payoutQuote &&
                              typeof payoutQuote.available_balance ===
                                "number" ? (
                                <p className="text-[10px] text-slate-500 mb-2 tabular-nums">
                                  ยอดในกระเป๋าปัจจุบัน{" "}
                                  {formatThb2(payoutQuote.available_balance)}{" "}
                                  บาท
                                </p>
                              ) : null}

                              <label className="block text-xs font-bold text-slate-700 mb-1">
                                จำนวนที่ต้องการถอน
                              </label>
                              <input
                                type="number"
                                inputMode="decimal"
                                placeholder={`ขั้นต่ำ ${MIN_WITHDRAWAL_THB} บาท`}
                                className="w-full p-3 border border-slate-200 rounded-xl mb-3 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                disabled={processing}
                              />

                              <p className="text-xs text-gray-600 mb-2">
                                ขั้นต่ำถอน {MIN_WITHDRAWAL_THB} บาท
                              </p>
                              <div className="flex flex-wrap gap-2 mb-3">
                                {([25, 50, 75] as const).map((pct) => {
                                  const val =
                                    maxNetPctBase <= 0
                                      ? 0
                                      : Math.floor(
                                          (pct / 100) * maxNetPctBase * 100,
                                        ) / 100;
                                  return (
                                    <button
                                      key={pct}
                                      type="button"
                                      onClick={() =>
                                        val > 0 && setAmount(String(val))
                                      }
                                      disabled={
                                        maxNetPctBase <= 0 ||
                                        processing ||
                                        withdrawMaxNetLoading
                                      }
                                      className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium disabled:opacity-50"
                                    >
                                      {pct}%
                                    </button>
                                  );
                                })}
                                <button
                                  type="button"
                                  onClick={() =>
                                    void (async () => {
                                      if (withdrawMaxNetLoading || processing)
                                        return;
                                      const m = await computeWithdrawMaxNet();
                                      setWithdrawMaxNetEstimate(m);
                                      if (m > 0) setAmount(String(m));
                                    })()
                                  }
                                  disabled={
                                    processing ||
                                    withdrawMaxNetLoading ||
                                    maxNetPctBase <= 0
                                  }
                                  className="px-3 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg text-sm font-bold disabled:opacity-50"
                                >
                                  ถอนเต็ม (Max)
                                </button>
                              </div>

                              {payoutQuoteError ? (
                                <div className="mb-3 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 space-y-2">
                                  <p>{payoutQuoteError}</p>
                                  <button
                                    type="button"
                                    disabled={payoutQuoteLoading}
                                    onClick={() =>
                                      setPayoutQuoteRetryNonce((n) => n + 1)
                                    }
                                    className="w-full py-2 rounded-lg border border-red-300 bg-white font-semibold text-red-900 hover:bg-red-50 disabled:opacity-50"
                                  >
                                    ลองอีกครั้ง
                                  </button>
                                </div>
                              ) : null}

                              {!payoutQuoteProvisional &&
                              payoutQuote?.blocking_reason &&
                              payoutQuote.blocking_message_th ? (
                                <div className="mb-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                                  <span className="font-bold block mb-1">
                                    ไม่พร้อมถอนตามเงื่อนไขระบบ
                                  </span>
                                  {payoutQuote.blocking_message_th}
                                </div>
                              ) : null}

                              <div className="relative rounded-xl border-2 border-dashed border-slate-200 bg-white p-4 mb-3 space-y-2">
                                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                                  สรุปรายการ
                                </p>
                                {payoutQuoteLoading ? (
                                  <p className="text-sm text-slate-400">
                                    กำลังคำนวณจากระบบ…
                                  </p>
                                ) : payoutQuote ? (
                                  <>
                                    <div className="flex justify-between text-sm text-slate-800 font-medium">
                                      <span>จำนวนที่ต้องการถอน</span>
                                      <span className="tabular-nums">
                                        {formatThb2(
                                          payoutQuote.amount_requested ??
                                            amtRounded,
                                        )}{" "}
                                        บาท
                                      </span>
                                    </div>
                                    <div className="flex justify-between text-sm text-slate-700">
                                      <span>ค่าธรรมเนียม</span>
                                      <span className="tabular-nums">
                                        {formatThb2(payoutQuote.fee_thb ?? 0)}{" "}
                                        บาท
                                      </span>
                                    </div>
                                    <div className="flex justify-between text-sm font-bold text-emerald-800 pt-2 border-t border-slate-100">
                                      <span>ยอดสุทธิที่จะได้รับ</span>
                                      <span className="tabular-nums">
                                        {formatThb2(
                                          payoutQuote.net_receive ?? 0,
                                        )}{" "}
                                        บาท
                                      </span>
                                    </div>
                                    <div className="flex justify-between text-sm font-bold text-slate-900 pt-1">
                                      <span>ยอดรวมที่ถูกหักจากกระเป๋า</span>
                                      <span className="tabular-nums">
                                        {formatThb2(
                                          payoutQuote.total_deduct ?? 0,
                                        )}{" "}
                                        บาท
                                      </span>
                                    </div>
                                    {payoutQuote.eta_label_th ? (
                                      <div className="flex justify-between text-xs text-slate-600 pt-1 border-t border-slate-100">
                                        <span>ETA</span>
                                        <span className="font-medium text-right">
                                          {payoutQuote.eta_label_th}
                                        </span>
                                      </div>
                                    ) : null}
                                    {payoutQuoteProvisional ? (
                                      <p className="text-[11px] text-amber-800 bg-amber-50 rounded-lg px-2 py-1 mt-2">
                                        เป็นตัวอย่างสำหรับยอดต่ำกว่าขั้นต่ำหรือกำลังกรอก
                                        — เลือกยืนยันหลังกรอกจำนวนจริง
                                      </p>
                                    ) : null}
                                    <p className="text-[10px] text-slate-500 leading-relaxed pt-2 border-t border-slate-100">
                                      ค่าธรรมเนียมถูกล็อกเมื่อส่งคำขอแล้ว
                                      แม้แอดมินเปลี่ยนราคาในภายหลัง
                                    </p>
                                  </>
                                ) : rawStr === "" ? (
                                  <p className="text-sm text-slate-500">
                                    กรอกจำนวนเพื่อดูสรุปยอด
                                  </p>
                                ) : (
                                  <p className="text-sm text-slate-400">
                                    สรุปจะแสดงเมื่อประมาณการสำเร็จ
                                  </p>
                                )}
                              </div>

                              <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3 mb-4 space-y-2">
                                <div className="flex gap-2 text-xs text-emerald-900">
                                  <ShieldCheck
                                    size={18}
                                    className="shrink-0 text-emerald-600 mt-0.5"
                                    aria-hidden
                                  />
                                  <p>
                                    <span className="font-bold">
                                      ความโปร่งใสของค่าธรรมเนียม
                                    </span>{" "}
                                    — ระบบคำนวณค่าธรรมเนียมจาก backend
                                    ก่อนยืนยัน
                                  </p>
                                </div>
                                <div className="flex gap-2 text-xs text-emerald-900">
                                  <Lock
                                    size={16}
                                    className="shrink-0 text-emerald-600 mt-0.5"
                                    aria-hidden
                                  />
                                  <p className="font-medium">
                                    คำขอนี้จะถูกบันทึกพร้อมค่าธรรมเนียม ณ
                                    เวลาส่งคำขอ
                                  </p>
                                </div>
                              </div>

                              {/* Final actions for step 2 */}
                              <div className="flex flex-col gap-2">
                                <button
                                  type="button"
                                  onClick={() => void handleWithdraw()}
                                  disabled={withdrawSubmitDisabled}
                                  className="w-full py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 disabled:opacity-50"
                                >
                                  {processing
                                    ? "กำลังดำเนินการ…"
                                    : "ยืนยันส่งคำขอถอน"}
                                </button>
                              </div>
                            </>
                          )}
                        </>
                      )}

                      <div className="flex gap-3 mt-6">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveModal(null);
                            setWithdrawFlowStep(1);
                            setWithdrawSuccessRequestId(null);
                            setPayoutQuote(null);
                            setPayoutQuoteError(null);
                            setPayoutQuoteProvisional(false);
                            setDepositStep("amount");
                            setDepositQrUrl(null);
                            setDepositPaymentId(null);
                            setDepositMethod(null);
                            setBankTransferRef(null);
                            setDepositSuccessPendingSlip(false);
                            depositSlipUploadedRef.current = false;
                            walletDepositChargeSourceRef.current = null;
                            setDepositChargeSourceType(null);
                            setSlipFile(null);
                            setManualStaticSlipFile(null);
                            setDepositOtherChannelsOpen(false);
                            setWalletDepositM1Step(null);
                            setWalletM1Method(null);
                            setManualDepositSubmitResult(null);
                            setWalletDepositPreview(null);
                            setWalletDepositPreviewError(null);
                            setAmount("");
                          }}
                          className="flex-1 py-2 border rounded-xl font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          {withdrawFlowStep === 3 ? "ปิด" : "Cancel"}
                        </button>
                        {withdrawFlowStep ===
                        3 ? null : !bankAccounts.length ? (
                          <div className="flex-1 py-2 text-center text-sm text-gray-500 flex items-center justify-center">
                            เพิ่มบัญชีใน Settings ก่อน
                          </div>
                        ) : withdrawFlowStep === 1 ? (
                          <div className="flex-1 py-2" />
                        ) : (
                          /* spacer — primary action is Confirm above in step 2 */
                          <div className="flex-1 py-2" />
                        )}
                      </div>
                    </>
                  );
                })()
              ) : null}
            </div>
          </div>,
          document.body,
        )}

      {/* Receipt Modal - Portal */}
      {receiptModal &&
        createPortal(
          <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md animate-in zoom-in-95">
              {/* Company Header */}
              <div className="text-center border-b-2 border-slate-200 pb-6 mb-6">
                <h2 className="text-2xl font-bold text-slate-800 mb-1">
                  {receiptModal.company.name}
                </h2>
                {receiptModal.company.address && (
                  <p className="text-xs text-slate-500">
                    {receiptModal.company.address}
                  </p>
                )}
                {receiptModal.company.tax_id && (
                  <p className="text-xs text-slate-500">
                    เลขประจำตัวผู้เสียภาษี / Tax ID:{" "}
                    {receiptModal.company.tax_id}
                    {receiptModal.company.branch_name
                      ? ` · ${receiptModal.company.branch_name}`
                      : ""}
                  </p>
                )}
                {receiptModal.company.phone ? (
                  <p className="text-xs text-slate-500">
                    โทร: {receiptModal.company.phone}
                  </p>
                ) : receiptModal.company.support_email ? (
                  <p className="text-xs text-slate-500">
                    ติดต่อฝ่ายสนับสนุน: {receiptModal.company.support_email}
                  </p>
                ) : null}
              </div>

              {/* Receipt Title */}
              <div className="text-center mb-6">
                <h3 className="text-xl font-bold text-slate-800 mb-2">
                  {receiptModal.document_label || "ใบเสร็จรับเงิน / Receipt"}
                </h3>
                {!receiptModal.is_tax_invoice && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-2">
                    เอกสารนี้เป็นใบเสร็จรับเงินเบื้องต้น
                    ไม่ใช่ใบกำกับภาษีเต็มรูปแบบจนกว่าข้อมูลภาษีบริษัทและผู้ขอเอกสารจะครบถ้วน
                  </p>
                )}
                <p className="text-xs text-slate-600">
                  เลขที่: {receiptModal.receipt_no}
                </p>
                <p className="text-xs text-slate-500">
                  วันที่:{" "}
                  {new Date(receiptModal.date).toLocaleDateString("th-TH", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>

              {/* Customer Info */}
              <div className="bg-slate-50 rounded-xl p-4 mb-6">
                <p className="text-xs font-bold text-slate-600 mb-2">
                  ลูกค้า / Customer
                </p>
                <p className="text-sm font-medium text-slate-800">
                  {receiptModal.customer.name}
                </p>
                <p className="text-xs text-slate-600">
                  {receiptModal.customer.email}
                </p>
                {receiptModal.customer.tax_id && (
                  <p className="text-xs text-slate-600">
                    Tax ID: {receiptModal.customer.tax_id}
                  </p>
                )}
                {receiptModal.customer.registered_address && (
                  <p className="text-xs text-slate-500 mt-1">
                    {receiptModal.customer.registered_address}
                  </p>
                )}
              </div>

              {/* Transaction Details */}
              <div className="space-y-3 mb-6">
                <div className="flex justify-between items-center py-2 border-b border-slate-200">
                  <span className="text-sm text-slate-600">รายการ</span>
                  <span className="text-sm font-medium text-slate-800">
                    {receiptModal.description}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-200">
                  <span className="text-sm text-slate-600">ช่องทางชำระ</span>
                  <span className="text-sm font-medium text-slate-800 uppercase">
                    {receiptModal.payment_method}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-200">
                  <span className="text-sm text-slate-600">
                    เลขอ้างอิง / Tax Ref
                  </span>
                  <span className="text-xs font-mono text-slate-700">
                    {receiptModal.tax_ref_id || receiptModal.transaction_no}
                  </span>
                </div>
                {/* Earnings Breakdown (Talent/Provider — Match Job) */}
                {(receiptModal as any).gross_earnings != null &&
                  (receiptModal as any).gross_earnings > 0 && (
                    <div className="mt-4 p-4 bg-emerald-50/80 rounded-xl border border-emerald-200 space-y-2">
                      <p className="text-xs font-bold text-slate-600 mb-2">
                        {t("detail.income_breakdown")}
                      </p>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">
                          {t("detail.wallet_gross_wage")}
                        </span>
                        <span className="font-medium text-slate-800 tabular-nums">
                          ฿
                          {Number(
                            (receiptModal as any).gross_earnings,
                          ).toLocaleString()}
                        </span>
                      </div>
                      {(receiptModal as any).handling_fee != null &&
                        (receiptModal as any).handling_fee > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-600">
                              {t("detail.wallet_handling_fee")}
                            </span>
                            <span className="font-medium text-amber-700 tabular-nums">
                              -฿
                              {Number(
                                (receiptModal as any).handling_fee,
                              ).toLocaleString()}
                            </span>
                          </div>
                        )}
                      {(receiptModal as any).commission_fee != null &&
                        (receiptModal as any).commission_fee > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-600">
                              {t("detail.wallet_platform_commission")} (
                              {(receiptModal as any).commission_percent ?? 24}%)
                            </span>
                            <span className="font-medium text-amber-700 tabular-nums">
                              -฿
                              {Number(
                                (receiptModal as any).commission_fee,
                              ).toLocaleString()}
                            </span>
                          </div>
                        )}
                      <div className="flex justify-between text-sm font-bold pt-2 border-t border-emerald-200">
                        <span className="text-emerald-800">
                          {t("detail.wallet_net_credited")}
                        </span>
                        <span className="text-emerald-900 tabular-nums">
                          ฿{receiptModal.amount.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  )}
                {/* รายละเอียดค่าใช้จ่าย-ผลตอบแทนบริษัท-รายได้ผู้รับงาน (ชัดเจนตรงไปตรงมา) */}
                {!(
                  (receiptModal as any).gross_earnings != null &&
                  (receiptModal as any).gross_earnings > 0
                ) &&
                  (receiptModal.employer_expense != null ||
                    receiptModal.provider_income != null ||
                    receiptModal.company_fee != null ||
                    receiptModal.insurance_amount != null) && (
                    <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                      <p className="text-xs font-bold text-slate-600 mb-2">
                        รายละเอียดตามบิล
                      </p>
                      {receiptModal.employer_expense != null &&
                        receiptModal.employer_expense > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-600">
                              ค่าใช้จ่ายผู้จ้าง
                            </span>
                            <span className="font-medium text-slate-800">
                              ฿
                              {Number(
                                receiptModal.employer_expense,
                              ).toLocaleString()}
                            </span>
                          </div>
                        )}
                      {receiptModal.insurance_amount != null &&
                        receiptModal.insurance_amount > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-600">ค่าประกันงาน</span>
                            <span className="font-medium text-emerald-700">
                              ฿
                              {Number(
                                receiptModal.insurance_amount,
                              ).toLocaleString()}
                            </span>
                          </div>
                        )}
                      {receiptModal.provider_income != null &&
                        receiptModal.provider_income > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-600">
                              รายได้ผู้รับงาน
                            </span>
                            <span className="font-medium text-slate-800">
                              ฿
                              {Number(
                                receiptModal.provider_income,
                              ).toLocaleString()}
                            </span>
                          </div>
                        )}
                      {receiptModal.company_fee != null &&
                        receiptModal.company_fee > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-600">
                              ผลตอบแทนบริษัท (ค่าธรรมเนียม)
                            </span>
                            <span className="font-medium text-slate-800">
                              ฿
                              {Number(
                                receiptModal.company_fee,
                              ).toLocaleString()}
                            </span>
                          </div>
                        )}
                    </div>
                  )}
              </div>

              {/* Total Amount */}
              <div className="bg-gradient-to-r from-emerald-50 to-emerald-100 border-2 border-emerald-200 rounded-xl p-4 mb-6">
                <div className="flex justify-between items-center">
                  <span className="text-base font-bold text-emerald-800">
                    ยอดเงิน / Amount
                  </span>
                  <span className="text-2xl font-bold text-emerald-900">
                    ฿{receiptModal.amount.toLocaleString()}{" "}
                    {receiptModal.currency}
                  </span>
                </div>
              </div>

              {/* Footer */}
              <div className="text-center mb-4">
                <p className="text-xs text-slate-400">
                  ใบเสร็จนี้สร้างโดยระบบอัตโนมัติ · ไม่ต้องลงนาม
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  This is a computer-generated receipt
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => window.print()}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700"
                >
                  🖨️ พิมพ์
                </button>
                <button
                  onClick={() => setReceiptModal(null)}
                  className="flex-1 py-2.5 border-2 border-slate-300 rounded-xl font-bold text-slate-700 hover:bg-slate-50"
                >
                  ปิด
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Refund Policy Modal - Portal เพื่อให้แสดงเหนือทุก element */}
      {showRefundPolicy &&
        createPortal(
          <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
              <div className="p-6 border-b border-slate-200 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <FileText size={20} className="text-emerald-600" />
                    {`Refund Policy v${refundPolicyVersion || "2.1"}`}
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">
                    อัปเดต: {refundPolicyUpdated || "25/2/2569"}
                  </p>
                </div>
                <button
                  onClick={() => setShowRefundPolicy(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <XCircle size={24} />
                </button>
              </div>
              <div className="p-6 overflow-y-auto flex-1 bg-white">
                {refundPolicyContent ? (
                  <div
                    className="legal-content"
                    dangerouslySetInnerHTML={{
                      __html: refundPolicyContent,
                    }}
                  />
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center">
                    <p className="text-sm font-medium text-slate-600">
                      กำลังโหลดนโยบายการคืนเงิน…
                    </p>
                    <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                      ถ้ารอแล้วยังว่างเปล่า ให้เปิดจากเมนู Legal
                      หรือลองใหม่ภายหลัง
                    </p>
                  </div>
                )}
              </div>
              <div className="p-6 border-t border-slate-200 flex justify-end">
                <button
                  onClick={() => setShowRefundPolicy(false)}
                  className="px-6 py-2 border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-50"
                >
                  ปิด
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};
