import React, { useCallback, useEffect, useState, useRef, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  Navigation,
  MapPin,
  Clock,
  CreditCard,
  User,
  Shield,
  Send,
  CheckCircle,
  AlertTriangle,
  Image as ImageIcon,
  Paperclip,
  XCircle,
  X,
  Flag,
  Wallet,
  Hourglass,
  Loader2,
  Star,
  Timer,
  AlertOctagon,
  Share2,
  Facebook,
  Twitter,
  MessageCircle,
  Copy,
  Eye,
  ThumbsUp,
  Heart,
  HelpCircle,
  Gift,
  DollarSign,
  PenTool as Tool,
  Activity,
  Camera,
  ClipboardList,
  Calendar,
  Phone,
  RefreshCw,
  Radio,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Utensils,
  Minimize2,
  Maximize2,
  MessagesSquare,
} from "lucide-react";
// UPDATED IMPORT PATHS
import { MockApi } from "../services/mockApi";
import { BackendPaymentService, type PaymentProcessError } from "../services/backendPaymentService";
import { getBackendBase, api } from "../services/api";
import {
  createUserSupportTicket,
  getUserSupportMessages,
  mapSupportMessagesToStaffUi,
  postUserSupportMessage,
} from "../services/supportTicketApi";
import { subscribeSupportTicketRoom } from "../services/supportSocket";
import {
  Job,
  ChatMessage,
  JobStatus,
  UserRole,
  MessageType,
  PaymentMethod,
  type JobCompletionExtras,
} from "../types";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useNotification } from "../context/NotificationContext";
import { useMobileAppConfig } from "../context/MobileAppConfigContext";
import DriverTracking from "../components/DriverTracking";
import { BackendBannersSection } from "../components/BackendBannersSection";
import { sendSOS } from "../services/marineService";
import LocationService from "../services/locationService";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  CircleMarker,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  query,
  where,
  Timestamp,
  onSnapshot,
  Unsubscribe,
  limit,
  runTransaction,
  orderBy,
} from "firebase/firestore";
import { db } from "../services/firebase";
import FirebaseApi from "../services/firebase";
import { StorageService } from "../services/storage";
import PaymentService from "../services/paymentService";
import ReviewService from "../services/reviewService";
import StarRating from "../components/StarRating";
import { REVIEW_TAGS } from "../types";
import {
  VipThemeWrapper,
  VipDiscountDisplay,
  VipQuotaInfo,
} from "../components/VipThemeWrapper";
import { WorkInsuranceProgress } from "../components/WorkInsuranceProgress";
import JobDetailFlowStepper from "../components/JobDetailFlowStepper";
import { VIPBadge } from "../components/VIPBadge";
import {
  BrandAdviserBadge,
  BrandAdviserSuspendBanner,
  BrandAdviserProgramOffNotice,
} from "../components/BrandAdviserBadge";
import EarningsReceipt, { type ReceiptData } from "../components/EarningsReceipt";
import { createPortal } from "react-dom";
import { validateJobProofImage } from "../utils/imageProofValidation";
import { capturePhotoFromCamera } from "../utils/captureJobPhoto";
import { verifyJobProofImage } from "../services/jobProofApi";
import {
  messageForJobCompleteError,
  messageForProofVerifyError,
} from "../utils/jobApiErrors";
import { getJobFlowState, type JobFlowState } from "../utils/jobFlowStep";
import { formatJobReferenceCode } from "../utils/jobDisplayCode";
import { applyPostJobContactPolicy } from "../utils/postJobContactPolicy";
import {
  getJobLocationDisplayLines,
  formatJobPrimaryAddress,
} from "../utils/jobLocationDisplay";
import { calcMatchJobTalentBreakdown } from "../constants/matchJobFeeStructure";
import {
  fetchFeeEstimates,
  estimateMatchTalentBreakdown,
  type FeeEstimatesResponse,
} from "../services/feeEstimatesService";
import { fetchBrandAdviserRules, type BrandAdviserRules } from "../services/brandAdviserRulesService";
import {
  getTravelEtaWithFallback,
  fetchOsrmDrivingRouteGeometry,
} from "../utils/osrmRoute";
import { getJobPaymentBadgeVariant } from "../utils/jobPaymentDisplay";
import {
  getEmployerQuestionsForProvider,
  getDriverTransportStops,
  isDriverCategory,
} from "../utils/providerJobExtras";
import { jobRequiresProofPhotos } from "../utils/jobProofRequirement";
import {
  shouldRequireKycForHighValueJob,
  shouldRequireKycForWithdraw,
  HIGH_VALUE_JOB_THRESHOLD_THB,
} from "../utils/kycProgressiveGate";
import {
  getEmployerBidAcceptFeedback,
  copyPlainTextToClipboard,
} from "../utils/employerBidAcceptFeedback";

/** สอดคล้อง backend JOB_MEET_CODE_REQUIRED — ใน Vite ใช้ VITE_JOB_MEET_CODE_REQUIRED (ไม่ใช่ REACT_APP_* ที่ไม่ถูกฝังใน client) ปิดเมื่อตั้งเป็น "0" */
function readJobMeetCodeRequired(): boolean {
  const viteVal = import.meta.env?.VITE_JOB_MEET_CODE_REQUIRED;
  const legacy =
    typeof process !== "undefined" && process.env?.REACT_APP_JOB_MEET_CODE_REQUIRED;
  const raw =
    viteVal !== undefined && String(viteVal).trim() !== ""
      ? viteVal
      : legacy !== undefined && String(legacy).trim() !== ""
        ? legacy
        : "1";
  return String(raw).trim() !== "0";
}
const MEET_CODE_REQUIRED = readJobMeetCodeRequired();

/** งาน physical ที่เคยมีช่อง OTP ส่งมอบแยก — ซ่อนเมื่อใช้โฟลว์รหัสพบกัน (ไม่ให้มีสองช่องรหัส 6 หลัก) */
const DELIVERY_HANDOFF_OTP_CATEGORY_HINTS = [
  "maid",
  "plumbing",
  "electrician",
  "ac_cleaning",
  "logistics",
  "cleaning",
  "repair",
  "delivery",
  "handyman",
] as const;

function categoryUsesDeliveryHandoffOtp(category: unknown): boolean {
  if (!category) return false;
  const c = String(category).toLowerCase();
  return DELIVERY_HANDOFF_OTP_CATEGORY_HINTS.some((k) => c.includes(k));
}

/** ทิป — UI แบบ preset (อ้างอิง Lineman) + เพดานสูงสุดต่อครั้ง */
const TIP_PRESET_AMOUNTS = [10, 20, 50, 100] as const;
const TIP_MAX_AMOUNT = 500;

/** หัวข้อศูนย์ช่วยเหลือ (แท็บแจ้งปัญหา) — อ้างอิง Lineman */
const HELP_TOPIC_TKEYS = [
  "detail.help_topic_unblock",
  "detail.help_topic_complaint",
  "detail.help_topic_complaint_other",
  "detail.help_topic_compliment",
  "detail.help_topic_usage",
  "detail.help_topic_partner",
  "detail.help_topic_other",
  "detail.help_topic_foreign",
  "detail.help_topic_finance",
  "detail.help_topic_general",
] as const;

/** หัวข้อย่อยต่อหมวด (สไตล์ Lineman — radio ก่อนแชทเจ้าหน้าที่) */
const HELP_SUB_BY_TOPIC: Record<(typeof HELP_TOPIC_TKEYS)[number], readonly string[]> = {
  "detail.help_topic_unblock": ["detail.help_sub_unblock_1", "detail.help_sub_unblock_2"],
  "detail.help_topic_complaint": [
    "detail.help_sub_complaint_1",
    "detail.help_sub_complaint_2",
    "detail.help_sub_complaint_3",
    "detail.help_sub_complaint_4",
    "detail.help_sub_complaint_5",
    "detail.help_sub_complaint_6",
    "detail.help_sub_complaint_7",
    "detail.help_sub_complaint_8",
  ],
  "detail.help_topic_complaint_other": [
    "detail.help_sub_othercomplaint_1",
    "detail.help_sub_othercomplaint_2",
    "detail.help_sub_othercomplaint_3",
    "detail.help_sub_othercomplaint_4",
    "detail.help_sub_othercomplaint_5",
    "detail.help_sub_othercomplaint_6",
  ],
  "detail.help_topic_compliment": [
    "detail.help_sub_compliment_1",
    "detail.help_sub_compliment_2",
    "detail.help_sub_compliment_3",
    "detail.help_sub_compliment_4",
  ],
  "detail.help_topic_usage": [
    "detail.help_sub_usage_1",
    "detail.help_sub_usage_2",
    "detail.help_sub_usage_3",
    "detail.help_sub_usage_4",
    "detail.help_sub_usage_5",
    "detail.help_sub_usage_6",
  ],
  "detail.help_topic_partner": ["detail.help_sub_partner_1"],
  "detail.help_topic_other": [
    "detail.help_sub_otherreq_1",
    "detail.help_sub_otherreq_2",
    "detail.help_sub_otherreq_3",
    "detail.help_sub_otherreq_4",
    "detail.help_sub_otherreq_5",
    "detail.help_sub_otherreq_6",
  ],
  "detail.help_topic_foreign": ["detail.help_sub_foreign_1", "detail.help_sub_foreign_2"],
  "detail.help_topic_finance": [
    "detail.help_sub_finance_1",
    "detail.help_sub_finance_2",
    "detail.help_sub_finance_3",
    "detail.help_sub_finance_4",
    "detail.help_sub_finance_5",
  ],
  "detail.help_topic_general": [
    "detail.help_sub_general_1",
    "detail.help_sub_general_2",
    "detail.help_sub_general_3",
  ],
};

function HelpOrderSummaryCard({
  job,
  jobReferenceCode,
  language,
  t,
}: {
  job: Job;
  jobReferenceCode: string;
  language: string;
  t: (k: string) => string;
}) {
  const timeStr = (() => {
    const raw = job.updated_at || job.completed_at || job.created_at;
    if (!raw) return "—";
    try {
      return new Date(raw).toLocaleString(
        language === "th" ? "th-TH" : "en-US",
        {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }
      );
    } catch {
      return "—";
    }
  })();
  const statusUpper = String(job.status || "").replace(/_/g, " ").toUpperCase();
  const completed = String(job.status).toLowerCase() === "completed";
  const addr = formatJobPrimaryAddress(job) || t("detail.loc_unknown");

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pink-100">
            <Utensils className="text-pink-600" size={20} aria-hidden />
          </div>
          <div>
            <p
              className={`text-xs font-bold uppercase ${
                completed ? "text-pink-600" : "text-slate-600"
              }`}
            >
              {statusUpper}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-slate-500">
              {jobReferenceCode || job.id}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-bold tabular-nums text-slate-900">
            ฿{Number(job.price || 0).toLocaleString()}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">{timeStr}</p>
        </div>
      </div>
      <div className="flex justify-between gap-2 border-b border-slate-100 py-2 text-[11px] text-slate-500">
        <span className="font-mono">{jobReferenceCode || job.id}</span>
        <span>{timeStr}</span>
      </div>
      <div className="space-y-2 pt-3 text-sm text-slate-800">
        <div className="flex gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden />
          <span className="min-w-0 font-medium leading-snug">{job.title}</span>
        </div>
        <div className="flex gap-2 text-xs text-slate-600">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
          <span className="min-w-0 leading-snug">{addr}</span>
        </div>
      </div>
    </div>
  );
}

function PreAcceptBoundsFitter({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length < 2) return;
    const b = L.latLngBounds(positions);
    map.fitBounds(b, { padding: [40, 40], maxZoom: 14 });
  }, [map, positions]);
  return null;
}

const vehicleTypeLabel: Record<string, string> = {
  motorcycle: "มอเตอร์ไซค์",
  sedan: "รถยนต์",
  pickup: "รถกระบะ",
  truck_6wheeler: "รถบรรทุก 6 ล้อ",
  truck_10wheeler: "รถบรรทุก 10 ล้อ",
  truck_18wheeler: "รถบรรทุก 18 ล้อ",
  car: "รถยนต์",
  truck: "รถบรรทุก",
  tricycle: "สามล้อ / ตุ๊กตุ๊ก",
};

function getVehicleTypeLabel(v: string): string {
  return vehicleTypeLabel[v?.toLowerCase()] || v || "—";
}

/** ข้อมูล BA สั้นๆ จาก getProfile (ผู้โพสต์ / ผู้รับงาน / ตัวเอง) */
type JobBaLite = {
  is_brand_adviser?: boolean;
  adviser_status?: string | null;
  brand_adviser_program_enabled?: boolean;
  brand_adviser_suspend_warning?: boolean;
  days_until_suspend_estimate?: number | null;
};

function showJobBaBadge(ba: JobBaLite | null): boolean {
  return !!(ba?.is_brand_adviser && ba.brand_adviser_program_enabled !== false);
}

type StaffSupportPhase =
  | null
  | "connecting"
  | "queueing"
  | "chat"
  | "csat_staff"
  | "csat_app";

type StaffSupportMsg = {
  id: string;
  text: string;
  isMe: boolean;
  timestamp: number;
  /** ข้อความกลางจอ (เช่น เจ้าหน้าที่เข้าร่วม) */
  variant?: "system";
};

export const JobDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, login, token } = useAuth();
  const { t, language } = useLanguage();
  const { notify } = useNotification();
  const { config: mobileAppConfig } = useMobileAppConfig();
  const paymentsEnabled = mobileAppConfig.featureFlags.enablePayments;
  const [job, setJob] = useState<Job | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [processingPay, setProcessingPay] = useState(false);
  const [submittingWork, setSubmittingWork] = useState(false);
  const [showMap, setShowMap] = useState(false);
  /** แชทเต็มจอ — ไม่แสดงคอลัมน์แชทข้างหน้างาน (ลดความวุ่นวาย) */
  const [chatOverlayOpen, setChatOverlayOpen] = useState(false);
  /** แชท | แจ้งปัญหา / ศูนย์ช่วยเหลือ (สไตล์ Lineman) */
  const [chatOverlayTab, setChatOverlayTab] = useState<"chat" | "help">("chat");
  /** ศูนย์ช่วยเหลือ — หมวดที่เลือก (หน้า Lineman ย่อย) */
  const [helpSelectedTopicKey, setHelpSelectedTopicKey] = useState<string | null>(null);
  const [helpSelectedSubKey, setHelpSelectedSubKey] = useState<string | null>(null);
  /** แชทกับเจ้าหน้าที่ — โฟลว์เชื่อมต่อ → คิว → แชท → CSAT */
  const [staffSupportPhase, setStaffSupportPhase] = useState<StaffSupportPhase>(null);
  const [staffSupportPrefill, setStaffSupportPrefill] = useState("");
  const [queueAheadDisplay, setQueueAheadDisplay] = useState("—");
  const [staffSupportMessages, setStaffSupportMessages] = useState<StaffSupportMsg[]>([]);
  const [staffChatInput, setStaffChatInput] = useState("");
  const [staffCsatStars, setStaffCsatStars] = useState(0);
  /** Ticket ฝั่ง backend — เดียวกับที่ nexus-admin-core (Support) ดู */
  const [staffSupportTicketId, setStaffSupportTicketId] = useState<string | null>(
    null
  );
  /** กดแจ้งปัญหา — แสดง bottom sheet ยืนยันก่อนเข้าศูนย์ช่วยเหลือ (แบบ Lineman) */
  const [showHelpCenterGateModal, setShowHelpCenterGateModal] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  // Security States
  const [hasReviewedProof, setHasReviewedProof] = useState(false);
  const [gpsVerifying, setGpsVerifying] = useState(false);
  const [completionOtp, setCompletionOtp] = useState("");
  const [otpRequesting, setOtpRequesting] = useState(false);
  const [otpRequestedAt, setOtpRequestedAt] = useState<number | null>(null);

  // Job Expiration State
  const [expirationTime, setExpirationTime] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);

  // Review Modal State
  const [showReviewModal, setShowReviewModal] = useState<boolean>(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewTags, setReviewTags] = useState<string[]>([]);
  const [submittingReview, setSubmittingReview] = useState(false);
  /** ผู้จ้างให้รีวิวผู้รับงานแล้วหรือยัง — ใช้โชว์ปุ่มให้คะแนน (LINE MAN สไตล์) */
  const [employerHasReviewed, setEmployerHasReviewed] = useState<boolean | null>(
    null
  );

  // Tip Modal State
  const [showTipModal, setShowTipModal] = useState(false);
  const [tipAmount, setTipAmount] = useState("");
  const [tipPresetSelected, setTipPresetSelected] = useState<number | null>(null);
  const [sendingTip, setSendingTip] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

  // Cancellation Countdown Modal State
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelSeconds, setCancelSeconds] = useState(10);
  /** เหมาข้ามจังหวัด: ค่าธรรมเนียมยกเลิกก่อนนับถอยหลัง */
  const [showIntercityCancelFeeModal, setShowIntercityCancelFeeModal] = useState(false);
  const [pendingIntercityCancelFee, setPendingIntercityCancelFee] = useState<{
    totalFeeThb?: number;
    reason?: string;
    tier?: string;
  } | null>(null);

  /** มิเตอร์/ทางด่วน + สรุปเก็บเงิน ก่อนส่งมอบงาน */
  const [showCompletionExtrasModal, setShowCompletionExtrasModal] = useState(false);
  const [showCompletionSummaryModal, setShowCompletionSummaryModal] = useState(false);
  const [pendingCompletionExtras, setPendingCompletionExtras] = useState<
    JobCompletionExtras | undefined
  >(undefined);
  const [completionMeter, setCompletionMeter] = useState("");
  const [completionToll, setCompletionToll] = useState("");
  const [completionParking, setCompletionParking] = useState("");
  const [completionOther, setCompletionOther] = useState("");
  const [completionExtrasNote, setCompletionExtrasNote] = useState("");

  // Dispute Modal State
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [useInsuranceClaimInDispute, setUseInsuranceClaimInDispute] = useState(false);
  const [submittingDispute, setSubmittingDispute] = useState(false);

  // Share Modal State
  const [showShareModal, setShowShareModal] = useState(false);

  // Collision Conflict Modal (Power to the User: 24hr ban warning)
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [acceptingWithConflict, setAcceptingWithConflict] = useState(false);

  const [employerBa, setEmployerBa] = useState<JobBaLite | null>(null);
  const [providerBa, setProviderBa] = useState<JobBaLite | null>(null);
  const [selfBa, setSelfBa] = useState<JobBaLite | null>(null);

  // 🗺️ Location Tracking State
  const [locationWatchId, setLocationWatchId] = useState<number | null>(null);
  const [isLocationTracking, setIsLocationTracking] = useState(false);

  // 📍 Phase 3: Arrival Confirmation State
  const [confirmingArrival, setConfirmingArrival] = useState(false);
  const [distanceToDestination, setDistanceToDestination] = useState<number | null>(null);
  const [currentProviderLocation, setCurrentProviderLocation] = useState<{lat: number, lng: number} | null>(null);

  // 📸 Phase 4: Before/After Photos State
  const [beforePhoto, setBeforePhoto] = useState<File | null>(null);
  const [afterPhoto, setAfterPhoto] = useState<File | null>(null);
  const [beforePhotoPreview, setBeforePhotoPreview] = useState<string | null>(null);
  const [afterPhotoPreview, setAfterPhotoPreview] = useState<string | null>(null);
  const [cameraHelpOpen, setCameraHelpOpen] = useState<null | "before" | "after">(null);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [capturingProof, setCapturingProof] = useState<"before" | "after" | null>(null);

  // ต้องประกาศก่อน setHasInsurance เพราะใช้ใน useCallback
  const isOwner = user?.id === job?.created_by;

  // 💰 Insurance (เบี้ยประกัน) — ค้างติ๊กไว้เมื่อสลับหน้า (localStorage)
  const insuranceStorageKey = (jid: string) => `job_insurance_${jid}`;
  const [hasInsurance, setHasInsuranceState] = useState(false);
  const setHasInsurance = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    setHasInsuranceState(prev => {
      const next = typeof v === 'function' ? v(prev) : v;
      if (id) {
        try { localStorage.setItem(insuranceStorageKey(id), String(next)); } catch (_) {}
        if (user?.id === job?.created_by) BackendPaymentService.saveInsurancePreference(id, next).catch(() => {});
      }
      return next;
    });
  }, [id, user?.id, job?.created_by]);
  const [insuranceRatePercent, setInsuranceRatePercent] = useState(10);

  // 🛡️ Insurance Claim State
  const [insuranceClaim, setInsuranceClaim] = useState<{
    id: string; claim_status: string; original_price: number;
    replacement_payout: number; reserve_amount: number;
    evidence_text?: string; claimed_at?: string;
  } | null>(null);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [claimEvidenceText, setClaimEvidenceText] = useState('');
  const [submittingClaim, setSubmittingClaim] = useState(false);

  // 💰 Phase 5: Escrow Payment State
  const [disputeWindowRemaining, setDisputeWindowRemaining] = useState<string | null>(null);
  const [filingDispute, setFilingDispute] = useState(false);
  /** ผู้จ้างสร้างรหัสพบกัน — แสดง QR / รหัสให้ผู้รับงาน */
  const [employerMeet, setEmployerMeet] = useState<{
    code: string;
    expiresAt: string;
    qrPayload: string;
  } | null>(null);
  const [creatingMeetCode, setCreatingMeetCode] = useState(false);
  const [providerMeetCodeInput, setProviderMeetCodeInput] = useState("");
  const [providerMeetCodeVerifying, setProviderMeetCodeVerifying] = useState(false);
  const [providerMeetCodeVerified, setProviderMeetCodeVerified] = useState(false);
  const [providerMeetCodeVerifyError, setProviderMeetCodeVerifyError] = useState<string | null>(null);
  const [feeEstimates, setFeeEstimates] = useState<FeeEstimatesResponse | null>(null);
  const [baRules, setBaRules] = useState<BrandAdviserRules | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const staffChatScrollRef = useRef<HTMLDivElement>(null);
  const uploadedPhotosRef = useRef<{ before?: string; after?: string }>({});
  useEffect(() => {
    if (job?.before_photo_url) uploadedPhotosRef.current.before = job.before_photo_url;
    if (job?.after_photo_url) uploadedPhotosRef.current.after = job.after_photo_url;
  }, [job?.before_photo_url, job?.after_photo_url]);
  useEffect(() => {
    if (id) uploadedPhotosRef.current = {};
  }, [id]);
  useEffect(() => {
    void fetchFeeEstimates().then(setFeeEstimates).catch(() => {});
  }, []);
  useEffect(() => {
    fetchBrandAdviserRules()
      .then((d) => setBaRules(d.rules))
      .catch(() => {});
  }, []);
  const [paymentHeld, setPaymentHeld] = useState(false);
  const [clientViewedJob, setClientViewedJob] = useState(false);

  /** Intercity charter — counter-offers (backend UUID jobs only) */
  const [intercityBids, setIntercityBids] = useState<
    Array<{
      id: string;
      job_id: string;
      provider_id: string;
      proposed_job_fee_thb: number;
      proposed_final_price_thb: number;
      status: string;
      created_at: string;
      provider_name?: string | null;
    }>
  >([]);
  const [intercityBidFloor, setIntercityBidFloor] = useState<{
    min_job_fee_thb: number;
    insurance_amount: number;
    listed_final_price_thb: number;
  } | null>(null);
  const [bidsLoading, setBidsLoading] = useState(false);
  const [showCounterOfferModal, setShowCounterOfferModal] = useState(false);
  const [counterOfferAmount, setCounterOfferAmount] = useState("");
  const [submittingBid, setSubmittingBid] = useState(false);
  const [acceptingBidId, setAcceptingBidId] = useState<string | null>(null);

  const [preAcceptEta, setPreAcceptEta] = useState<{
    loading: boolean;
    minutes?: number;
    distanceKm?: number;
    source?: "osrm" | "straight";
    denied?: boolean;
  }>({ loading: false });
  const [preAcceptRouteCoords, setPreAcceptRouteCoords] = useState<
    [number, number][] | null
  >(null);
  const [preAcceptUserLatLng, setPreAcceptUserLatLng] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  const tags = [
    "tag_polite",
    "tag_professional",
    "tag_safe",
    "tag_punctual",
    "tag_service",
  ];
  const isAssignedProvider = user?.id === job?.accepted_by;

  const paymentBadgeVariant = useMemo(
    () => getJobPaymentBadgeVariant(job),
    [job]
  );

  const providerNavDest = useMemo(() => {
    if (!job || !isAssignedProvider) return null;
    const stops = getDriverTransportStops(job);
    if (job.status === JobStatus.ACCEPTED && !job.arrived_at && stops.pickup) {
      return { lat: stops.pickup.lat, lng: stops.pickup.lng };
    }
    if (job.status === JobStatus.IN_PROGRESS && stops.dropoff) {
      return { lat: stops.dropoff.lat, lng: stops.dropoff.lng };
    }
    if (job.location?.lat != null && job.location?.lng != null) {
      return { lat: Number(job.location.lat), lng: Number(job.location.lng) };
    }
    return null;
  }, [job, isAssignedProvider]);

  const isDemoJobLike = Boolean(
    job &&
      // จำกัดเฉพาะ marker ที่ตั้งใจใช้กับงาน demo/review จริงๆ เท่านั้น
      // (เดิม match กว้างเกินไปจนบล็อกงานจริง ทำให้กล่องรหัสพบกันไม่ขึ้น)
      ((job.created_by_name &&
        /(demo employer|apple review|apple_review|demo_employer)/i.test(
          String(job.created_by_name)
        )) ||
        (job.title &&
          /(apple review|apple_review|demo employer|demo_employer)/i.test(
            String(job.title)
          )))
  );

  // #region agent log
  useEffect(() => {
    if (!job) return;
    try {
      const st = String(job.status || "").toLowerCase();
      fetch("http://127.0.0.1:7638/ingest/0fd4d8e7-61a2-4558-83aa-540c669e45fd", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "1d8d58",
        },
        body: JSON.stringify({
          sessionId: "1d8d58",
          runId: "meetcode-missing-1",
          hypothesisId: "H_env_or_conditions",
          location: "JobDetails.tsx:meet_code_gate",
          message: "meet_code_render_gates",
          data: {
            meetCodeRequired: !!MEET_CODE_REQUIRED,
            isDemoJobLike: !!isDemoJobLike,
            isAssignedProvider: !!isAssignedProvider,
            jobStatus: st,
            jobStatusIsAcceptedOrInProgress: st === "accepted" || st === "in_progress",
            hasProviderMeetInput: true,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
    } catch {
      /* ignore */
    }
  }, [job?.id, job?.status, isDemoJobLike, isAssignedProvider]);
  // #endregion

  const showDeliveryHandoffOtpUi = useMemo(() => {
    if (!job?.category || MEET_CODE_REQUIRED) return false;
    return categoryUsesDeliveryHandoffOtp(job.category);
  }, [job?.category]);

  // #region agent log
  useEffect(() => {
    if (!job) return;
    fetch("http://127.0.0.1:7638/ingest/0fd4d8e7-61a2-4558-83aa-540c669e45fd", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "1d8d58",
      },
      body: JSON.stringify({
        sessionId: "1d8d58",
        hypothesisId: "H_dedupe_two_code_strips",
        location: "JobDetails.tsx:delivery_otp_visibility",
        message: "provider_delivery_otp_strip_visible",
        data: {
          jobId: job.id,
          category: job.category,
          meetCodeRequired: MEET_CODE_REQUIRED,
          showDeliveryHandoffOtpUi,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }, [job?.id, job?.category, showDeliveryHandoffOtpUi]);
  // #endregion

  /** Transport Hub — แสดง badge ประเภทงานจาก payment_details.transport_contract.job_kind */
  const transportHubJobKind = useMemo(() => {
    if (!job || job.category !== "Driver") return null;
    const pd = job.payment_details;
    if (!pd || typeof pd !== "object") return null;
    const src = (pd as { transport_source?: string }).transport_source;
    const tc = (pd as { transport_contract?: { job_kind?: string } }).transport_contract;
    if (src !== "transport_hub" && !tc) return null;
    return (tc?.job_kind as string) || "local_on_demand";
  }, [job]);

  const showIntercityBidding = useMemo(() => {
    if (!job || !id) return false;
    if (job.status !== JobStatus.OPEN) return false;
    if (transportHubJobKind !== "intercity_charter") return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  }, [job, id, transportHubJobKind]);

  /** รหัสอ้างอิงแบบ PREFIX-YYMMDD-XXXXXX — แยกตามหมวด (แสดง/คัดลอก ไม่แทน UUID ภายใน) */
  const jobReferenceCode = useMemo(
    () => (job ? formatJobReferenceCode(job) : ""),
    [job]
  );

  const copyJobReference = useCallback(async () => {
    if (!jobReferenceCode) return;
    try {
      await navigator.clipboard.writeText(jobReferenceCode);
      notify(t("detail.job_ref_copied"), "success");
    } catch {
      notify(t("detail.copy_link"), "error");
    }
  }, [jobReferenceCode, notify, t]);

  const chatCounterpartPhone = useMemo(() => {
    if (!job) return "";
    const fallbackProviderPhone =
      (job as any)?.provider_profile?.phone ||
      (job as any)?.provider_profile?.phone_number ||
      (job as any)?.accepted_by_phone ||
      null;
    const fallbackOwnerPhone =
      (job as any)?.created_by_phone ||
      (job as any)?.employer_profile?.phone ||
      (job as any)?.employer_profile?.phone_number ||
      null;
    const raw = isOwner ? job.accepted_by_phone || fallbackProviderPhone : job.created_by_phone || fallbackOwnerPhone;
    return String(raw || "").trim();
  }, [job, isOwner]);

  /** สิ้นสุดการโทร — จาก API `contact_phone_visible_until` หรือคำนวณจาก completed_at + grace (สอดคล้อง backend) */
  const chatCallUntilTime = useMemo(() => {
    if (!job) return null;
    const j = job as Job & { contact_phone_visible_until?: string };
    if (j.contact_phone_visible_until) {
      const d = new Date(j.contact_phone_visible_until);
      if (!isNaN(d.getTime())) return d;
    }
    if (!job?.completed_at) return null;
    const d = new Date(job.completed_at);
    if (isNaN(d.getTime())) return null;
    const graceH = Number(import.meta.env.VITE_POST_JOB_PHONE_GRACE_HOURS ?? 24);
    const hrs = Number.isFinite(graceH) && graceH > 0 ? graceH : 24;
    return new Date(d.getTime() + hrs * 3600000);
  }, [job]);

  const chatCallWindowClosed = useMemo(() => {
    if (!chatCallUntilTime) return false;
    return Date.now() > chatCallUntilTime.getTime();
  }, [chatCallUntilTime]);

  const callChatCounterpart = useCallback(() => {
    if (chatCallWindowClosed) {
      notify(t("detail.chat_call_expired"), "info");
      return;
    }
    if (!chatCounterpartPhone) {
      notify(t("detail.chat_call_no_phone"), "info");
      return;
    }
    const safe = chatCounterpartPhone.replace(/[^\d+]/g, "");
    window.location.href = `tel:${safe}`;
  }, [chatCounterpartPhone, chatCallWindowClosed, notify, t]);

  const refreshIntercityBids = useCallback(async () => {
    if (!id || !showIntercityBidding) return;
    const uid = user?.id || localStorage.getItem("meerak_user_id");
    if (!uid) return;
    setBidsLoading(true);
    try {
      const data = await MockApi.getJobBids(id, uid);
      setIntercityBids(data.bids || []);
      setIntercityBidFloor(data.floor);
    } catch {
      setIntercityBids([]);
    } finally {
      setBidsLoading(false);
    }
  }, [id, showIntercityBidding, user?.id]);

  useEffect(() => {
    if (!showIntercityBidding || !id) return;
    void refreshIntercityBids();
    const iv = setInterval(() => void refreshIntercityBids(), 8000);
    return () => clearInterval(iv);
  }, [showIntercityBidding, id, refreshIntercityBids]);

  const handleAcceptIntercityBid = useCallback(
    async (bidId: string) => {
      if (!id) return;
      const uid = user?.id || localStorage.getItem("meerak_user_id");
      if (!uid) return;
      setAcceptingBidId(bidId);
      try {
        const res = await MockApi.acceptJobBid(id, bidId, uid);
        if (res.job) setJob(res.job as Job);
        notify("เลือกผู้รับงานแล้ว — ราคาตกลงตามข้อเสนอ (รวมค่าบริการแพลตฟอร์มแล้ว)", "success");
        await refreshIntercityBids();
      } catch (e: unknown) {
        const fb = getEmployerBidAcceptFeedback(e);
        notify(fb.message, fb.notificationType, {
          durationMs: fb.durationMs,
          ...(fb.textToCopyForDriver
            ? {
                action: {
                  label: "คัดลอกข้อความแจ้งคนขับ",
                  onClick: () => {
                    void (async () => {
                      const ok = await copyPlainTextToClipboard(
                        fb.textToCopyForDriver!,
                      );
                      if (ok) {
                        notify(
                          "คัดลอกแล้ว — วางส่งในแชทหรือ LINE ได้",
                          "success",
                        );
                      } else {
                        notify(
                          "คัดลอกไม่สำเร็จ — กรุณาลองอีกครั้งหรือคัดลอกข้อความด้วยมือ",
                          "error",
                        );
                      }
                    })();
                  },
                },
              }
            : {}),
        });
      } finally {
        setAcceptingBidId(null);
      }
    },
    [id, user?.id, notify, refreshIntercityBids]
  );

  const handleSubmitCounterOffer = useCallback(async () => {
    if (!id) return;
    const uid = user?.id || localStorage.getItem("meerak_user_id");
    if (!uid) return;
    const raw = counterOfferAmount.replace(/,/g, "").trim();
    const n = parseFloat(raw);
    const minF = intercityBidFloor?.min_job_fee_thb ?? 0;
    if (!Number.isFinite(n) || n < minF - 0.0001) {
      notify(`ค่าจ้างต้องไม่ต่ำกว่า ${minF.toLocaleString()} บาท`, "error");
      return;
    }
    setSubmittingBid(true);
    try {
      await MockApi.submitJobBid(id, n, uid);
      notify("ส่งข้อเสนอราคาแล้ว — ผู้จ้างจะได้รับแจ้งเตือน", "success");
      setShowCounterOfferModal(false);
      await refreshIntercityBids();
    } catch (e: any) {
      const msg =
        e?.response?.data?.error ||
        e?.response?.data?.message ||
        e?.message ||
        "ส่งไม่สำเร็จ";
      notify(typeof msg === "string" ? msg : "ส่งไม่สำเร็จ", "error");
    } finally {
      setSubmittingBid(false);
    }
  }, [id, user?.id, counterOfferAmount, intercityBidFloor?.min_job_fee_thb, notify, refreshIntercityBids]);

  const verifyProofAfterUpload = useCallback(
    async (uploadedUrl: string, phase: "before" | "after"): Promise<boolean> => {
      const uid = user?.id || localStorage.getItem("meerak_user_id");
      if (!id || !uid) return true;
      try {
        const compareUrl =
          phase === "after"
            ? job?.before_photo_url || uploadedPhotosRef.current.before
            : undefined;
        const capLat = currentLocation?.lat ?? currentProviderLocation?.lat;
        const capLng = currentLocation?.lng ?? currentProviderLocation?.lng;
        await verifyJobProofImage(id, {
          userId: uid,
          imageUrl: uploadedUrl,
          phase,
          compareUrl,
          ...(capLat != null && capLng != null ? { captureLat: capLat, captureLng: capLng } : {}),
        });
        return true;
      } catch (e: any) {
        notify(messageForProofVerifyError(e, t), "error");
        return false;
      }
    },
    [id, job?.before_photo_url, user?.id, currentLocation, currentProviderLocation, notify, t]
  );

  const uploadProofFileAndSave = useCallback(
    async (file: File, phase: "before" | "after"): Promise<boolean> => {
      if (!id || !db) return false;
      setUploadingPhotos(true);
      try {
        const url = await FirebaseApi.uploadJobProof(id, file, phase);
        const ok = await verifyProofAfterUpload(url, phase);
        if (!ok) return false;
        const field = phase === "before" ? "before_photo_url" : "after_photo_url";
        await setDoc(
          doc(db, "jobs", id),
          {
            [field]: url,
            photos_uploaded_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { merge: true }
        );
        uploadedPhotosRef.current[phase] = url;
        setJob((prev) => (prev ? { ...prev, [field]: url } : null));
        if (phase === "before") {
          setBeforePhoto(null);
          setBeforePhotoPreview(null);
        } else {
          setAfterPhoto(null);
          setAfterPhotoPreview(null);
        }
        notify(
          phase === "before"
            ? t("detail.proof_upload_before_ok")
            : t("detail.proof_upload_after_ok"),
          "success"
        );
        return true;
      } catch (err) {
        console.error("uploadProofFileAndSave:", err);
        notify(t("detail.proof_upload_error"), "error");
        return false;
      } finally {
        setUploadingPhotos(false);
      }
    },
    [id, notify, t, verifyProofAfterUpload]
  );

  const roleStr = (user?.role as string)?.toLowerCase?.() || "";
  const isUserProvider =
    user?.role === UserRole.PROVIDER ||
    roleStr === "provider" ||
    (user as any)?.provider_status === "VERIFIED_PROVIDER";
  // canAcceptJob: เฉพาะ provider เท่านั้นที่เห็นปุ่มรับงาน — user (role=user) ไม่เห็น
  const canAcceptJob = !isOwner && isUserProvider;

  // แชทถามนายจ้างก่อนรับงาน — ปิดด้วย VITE_CHAT_BEFORE_ACCEPT=0
  const CHAT_BEFORE_ACCEPT =
    String(import.meta.env?.VITE_CHAT_BEFORE_ACCEPT ?? "1") !== "0";

  // 🔍 Debug: Check Accept Button Visibility
  useEffect(() => {
    if (job && user) {
      console.log("🔍 Accept Button Debug:", {
        isUserProvider,
        userRole: user?.role,
        jobStatus: job?.status,
        isOwner,
        isExpired,
        userId: user?.id,
        jobCreatedBy: job?.created_by,
        shouldShowButton: canAcceptJob && job.status === JobStatus.OPEN && !isExpired
      });
    }
  }, [job, user, canAcceptJob, isExpired]);

  useEffect(() => {
    if (!job || loading) return;
    if (!canAcceptJob || job.status !== JobStatus.OPEN || isExpired) {
      setPreAcceptEta({ loading: false });
      setPreAcceptRouteCoords(null);
      setPreAcceptUserLatLng(null);
      return;
    }
    const { pickup, dropoff } = getDriverTransportStops(job);
    const usePickup = isDriverCategory(job) && pickup;
    const to =
      usePickup && pickup
        ? { lat: pickup.lat, lng: pickup.lng }
        : job.location?.lat != null && job.location?.lng != null
          ? {
              lat: Number(job.location.lat),
              lng: Number(job.location.lng),
            }
          : null;
    if (!to) {
      setPreAcceptEta({ loading: false });
      setPreAcceptRouteCoords(null);
      setPreAcceptUserLatLng(null);
      return;
    }
    let cancelled = false;
    setPreAcceptEta({ loading: true });
    if (!navigator.geolocation) {
      setPreAcceptEta({ loading: false, denied: true });
      setPreAcceptRouteCoords(null);
      setPreAcceptUserLatLng(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (cancelled) return;
        const from = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setPreAcceptUserLatLng(from);
        const r = await getTravelEtaWithFallback(from, to);
        if (cancelled) return;
        setPreAcceptEta({
          loading: false,
          minutes: r.durationMinutes,
          distanceKm: r.distanceKm,
          source: r.source,
        });

        let waypoints: { lat: number; lng: number }[];
        if (isDriverCategory(job) && pickup && dropoff) {
          waypoints = [
            from,
            { lat: pickup.lat, lng: pickup.lng },
            { lat: dropoff.lat, lng: dropoff.lng },
          ];
        } else {
          waypoints = [from, to];
        }
        const geo = await fetchOsrmDrivingRouteGeometry(waypoints);
        if (cancelled) return;
        setPreAcceptRouteCoords(geo?.coordinates ?? null);
      },
      () => {
        if (cancelled) return;
        setPreAcceptEta({ loading: false, denied: true });
        setPreAcceptRouteCoords(null);
        setPreAcceptUserLatLng(null);
      },
      { enableHighAccuracy: true, timeout: 14000, maximumAge: 60000 }
    );
    return () => {
      cancelled = true;
    };
  }, [
    job?.id,
    job?.status,
    job?.location,
    job?.payment_details,
    job?.category,
    loading,
    canAcceptJob,
    isExpired,
  ]);

  // เพิ่มฟังก์ชันนี้ก่อน return statement
  const calculateDistance = (
    loc1: { lat: number; lng: number },
    loc2: { lat: number; lng: number }
  ): number => {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(loc2.lat - loc1.lat);
    const dLon = deg2rad(loc2.lng - loc1.lng);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(deg2rad(loc1.lat)) *
        Math.cos(deg2rad(loc2.lat)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const deg2rad = (deg: number) => {
    return deg * (Math.PI / 180);
  };
  // 1. สร้าง custom icon ไว้ก่อน
  const createCustomIcon = (color: string = "blue") => {
    return L.divIcon({
      html: `
      <div style="
        background-color: ${color};
        width: 25px;
        height: 25px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: 12px;
      ">
        ${color === "blue" ? "📍" : "👤"}
      </div>
    `,
      className: "custom-marker",
      iconSize: [25, 25],
      iconAnchor: [12, 12],
    });
  };
  // เพิ่มฟังก์ชันดึงตำแหน่งปัจจุบัน
  const getCurrentLocation = (): Promise<{ lat: number; lng: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported"));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          reject(error);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  };
  // ใน JobDetails.tsx
  // เมื่อผู้จ้าง (เจ้าของงาน) โหลดหน้านี้
  useEffect(() => {
    if (isOwner && job?.status === JobStatus.WAITING_FOR_APPROVAL) {
      // บันทึกว่าผู้จ้างได้เห็นงานแล้ว
      markJobAsViewedByClient();
    }
  }, [isOwner, job?.status]);

  const markJobAsViewedByClient = async () => {
    if (!id || !isOwner) return;

    try {
      const jobRef = doc(db, "jobs", id);
      await updateDoc(jobRef, {
        client_viewed_notification: true,
        client_viewed_at: new Date().toISOString(),
      });

      setClientViewedJob(true);
    } catch (error) {
      console.error("Failed to mark job as viewed:", error);
    }
  };
  const handleSaveJob = async () => {
    if (!user || !job) return;

    try {
      const jobInfo = {
        jobId: job.id,
        title: job.title,
        customer: job.created_by_name,
        phone: job.created_by_phone,
        address: job.location.fullAddress,
        price: jobFeeRounded,
        time: job.datetime,
        category: job.category,
        location: job.location,
      };

      const result = await StorageService.saveJobForUser(user.id, jobInfo);

      if (result.success) {
        notify(result.message, "success");
      } else {
        notify(result.message, "info");
      }
    } catch (error) {
      notify("บันทึกงานไม่สำเร็จ", "error");
      console.error("Save job error:", error);
    }
  };

  // ใช้ใน useEffect
  useEffect(() => {
    if (user?.role === UserRole.PROVIDER && job?.location) {
      getCurrentLocation()
        .then(setCurrentLocation)
        .catch(() => {
          // ถ้าไม่ได้ให้ใช้ตำแหน่ง default
          setCurrentLocation({ lat: 13.7563, lng: 100.5018 });
        });
    }
  }, [user?.role, job?.location]);
  useEffect(() => {
    if (
      job?.status === JobStatus.ACCEPTED ||
      job?.status === JobStatus.IN_PROGRESS
    ) {
      setPaymentHeld(true); // ถ้างานถูกจับคู่แล้ว วงเงินควรถูกกันไว้แล้ว
    }
  }, [job]);

  // เบี้ยประกัน: ดึง % จาก Backend ตามหมวดงาน (job.category) — เชื่อมกับ InsuranceManager (Admin เปลี่ยนแล้วยอดตรง)
  const fetchInsuranceRate = useCallback(() => {
    const base = getBackendBase();
    const category = job?.category ? encodeURIComponent(String(job.category).trim()) : "";
    const url = category ? `${base}/api/settings/insurance-rate?category=${category}` : `${base}/api/settings/insurance-rate`;
    fetch(url)
      .then((r) => (r.headers.get("content-type")?.includes("json") ? r.json() : {}))
      .then((d) => setInsuranceRatePercent(d?.insurance_rate_percent ?? 10))
      .catch(() => setInsuranceRatePercent(10));
  }, [job?.category]);

  useEffect(() => {
    fetchInsuranceRate();
  }, [job?.id, job?.category, fetchInsuranceRate]);

  // เมื่อผู้ใช้กลับมาเปิดแท็บ (เช่น ไปแก้อัตราใน Admin แล้วกลับมา) ให้ดึงอัตราประกันล่าสุด
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && job?.id) fetchInsuranceRate();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [job?.id, fetchInsuranceRate]);

  // 🛡️ ดึงสถานะ Insurance Claim (ถ้างานมีประกัน)
  useEffect(() => {
    if (!job?.id || !job?.has_insurance) return;
    const base = getBackendBase();
    const token = localStorage.getItem('meerak_token') || localStorage.getItem('authToken') || '';
    fetch(`${base}/api/insurance/claim/${job.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((r) => (r.headers.get("content-type")?.includes("json") ? r.json() : {}))
      .then((d) => setInsuranceClaim(d?.claim || null))
      .catch(() => {});
  }, [job?.id, job?.has_insurance]);

  // 🛡️ ยื่นเคลมประกัน
  const handleSubmitInsuranceClaim = async () => {
    if (!job?.id || !user) return;
    setSubmittingClaim(true);
    try {
      const base = getBackendBase();
      const token = localStorage.getItem('meerak_token') || localStorage.getItem('authToken') || '';
      const res = await fetch(`${base}/api/insurance/claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ job_id: job.id, evidence_text: claimEvidenceText }),
      });
      const text = await res.text();
      const data = text && text.startsWith("{") ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(data.error || 'ไม่สามารถยื่นเคลมได้');
      setInsuranceClaim({
        id: data.claim_id, claim_status: 'pending',
        original_price: data.original_price,
        replacement_payout: data.replacement_payout,
        reserve_amount: data.reserve_amount,
        claimed_at: new Date().toISOString(),
      });
      setShowClaimModal(false);
      setClaimEvidenceText('');
      notify('✅ ยื่นเคลมประกันเรียบร้อย ทีมงานจะพิจารณาภายใน 24-48 ชั่วโมง', 'success');
    } catch (err: any) {
      notify(`❌ ${err.message}`, 'error');
    } finally {
      setSubmittingClaim(false);
    }
  };

  // 💰 Phase 5: Dispute Window Countdown Timer (รองรับ submitted_at สำหรับงานจาก Backend)
  const disputeEndsAt = job?.dispute_window_ends_at || (job?.submitted_at
    ? new Date(new Date(job.submitted_at).getTime() + 5 * 60 * 1000).toISOString()
    : null);
  useEffect(() => {
    if (!job || job.status !== JobStatus.WAITING_FOR_APPROVAL || !disputeEndsAt) {
      setDisputeWindowRemaining(null);
      return;
    }

    const interval = setInterval(() => {
      const result = PaymentService.checkDisputeWindow(disputeEndsAt);
      setDisputeWindowRemaining(result.remainingText);
    }, 1000);

    return () => clearInterval(interval);
  }, [job?.status, job?.dispute_status, disputeEndsAt]);

  // โหลดงานจาก Backend หรือ Firestore ก่อน (รองรับงานที่สร้างจาก Backend ที่ไม่มีใน Firestore)
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    MockApi.getJobDetails(id).then((j) => {
      if (cancelled) return;
      if (j) {
        setJob(j);
      } else {
        navigate("/jobs");
      }
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [id, navigate]);

  // ค้างติ๊กประกัน: โหลดจาก localStorage หรือ job.has_insurance เมื่อ job โหลด
  useEffect(() => {
    if (!id || !job) return;
    const fromJob = !!(job as any).has_insurance;
    const fromStorage = (() => { try { return localStorage.getItem(insuranceStorageKey(id)) === 'true'; } catch { return false; } })();
    setHasInsuranceState(fromJob || fromStorage);
  }, [id, job?.id]);

  // --- POLLING สำหรับงานจาก Backend (real-time ฝั่งผู้จ้าง — งานไม่มีใน Firestore)
  const ACTIVE_STATUSES = ["accepted", "in_progress", "waiting_for_approval", "waiting_for_payment"];
  useEffect(() => {
    if (!id || !job) return;
    const status = (job.status || "").toLowerCase();
    if (!ACTIVE_STATUSES.includes(status)) return;

    const poll = async () => {
      try {
        const refreshed = await MockApi.getJobDetails(id);
        if (refreshed) {
          setJob((prev) => (prev ? { ...prev, ...refreshed, provider_profile: refreshed.provider_profile ?? prev.provider_profile } : refreshed));
        }
      } catch (_) {}
    };
    const interval = setInterval(poll, 4000); // ทุก 4 วินาที
    return () => clearInterval(interval);
  }, [id, job?.status]);

  // เมื่อ provider อยู่หน้า completed job — poll งานเพื่อจับ tips_amount + รอ profile poll ด้านบนจับ wallet
  const isProviderViewingCompleted = !isOwner && job?.accepted_by && String(job.accepted_by) === String(user?.id) && (job.status || "").toLowerCase() === "completed";
  useEffect(() => {
    if (!id || !isProviderViewingCompleted) return;
    const poll = async () => {
      try {
        const refreshed = await MockApi.getJobDetails(id);
        if (refreshed) setJob((prev) => (prev ? { ...prev, ...refreshed, provider_profile: refreshed.provider_profile ?? prev?.provider_profile } : refreshed));
      } catch (_) {}
    };
    const iv = setInterval(poll, 12000);
    return () => clearInterval(iv);
  }, [id, isProviderViewingCompleted]);

  // --- REAL-TIME SUBSCRIPTIONS (อัปเดตเมื่อ Firestore มีข้อมูล — ถ้างานมีแค่ใน Backend จะไม่ได้ null แล้ว redirect)
  useEffect(() => {
    if (!id) return;

    const unsubJob = MockApi.subscribeToJob(id, (updatedJob) => {
      if (updatedJob) {
        setJob((prev) => {
          const merged = {
            ...prev,
            ...updatedJob,
            provider_profile:
              updatedJob.provider_profile ?? prev?.provider_profile,
          } as Record<string, unknown>;
          return applyPostJobContactPolicy(merged) as unknown as Job;
        });
      }
      setLoading(false);
    });

    const unsubChat = MockApi.subscribeToMessages(id, (msgs) => {
      // ใช้ meerak_user_id เดียวกับ sendMessage เพื่อให้ is_me ตรงกัน
      const myId = localStorage.getItem("meerak_user_id") || user?.id || (user as any)?.userId;
      const myIdStr = myId ? String(myId).trim().toLowerCase() : "";
      const withIsMe = (msgs || []).map((m: any) => {
        const sid = m.sender_id ? String(m.sender_id).trim().toLowerCase() : "";
        return {
          ...m,
          is_me: !!myIdStr && sid === myIdStr,
          timestamp: m.timestamp || m.created_at || new Date().toISOString(),
        };
      });
      setMessages(withIsMe);
      setLoading(false);
    });

    return () => {
      unsubJob();
      unsubChat();
    };
  }, [id, user?.id, (user as any)?.userId]);

  // ตรวจว่าผู้จ้างรีวิวผู้รับงานแล้วหรือยัง — ไม่เปิด modal บังคับทันที (ให้กดปุ่มให้คะแนนแทน)
  useEffect(() => {
    if (!id || !job || !user?.id || !isOwner) {
      setEmployerHasReviewed(null);
      return;
    }
    const status = (job.status || "").toLowerCase();
    if (status !== "completed") {
      setEmployerHasReviewed(null);
      return;
    }
    try {
      if (localStorage.getItem(`job_reviewed_${job.id}`) === "true") {
        setEmployerHasReviewed(true);
        return;
      }
    } catch (_) {}
    ReviewService.hasReviewed(id, user.id)
      .then((has) => setEmployerHasReviewed(!!has))
      .catch(() => setEmployerHasReviewed(false));
  }, [id, job?.id, job?.status, user?.id, isOwner]);

  // รีเฟรช profile เมื่องาน completed — ผู้รับงานต้องเห็น wallet อัปเดตเมื่อได้รับทิป
  // 1) รีเฟรชทันทีครั้งแรก  2) Poll ทุก 15 วินาทีเมื่อ provider อยู่หน้านี้ (จับทิปที่นายจ้างส่งทีหลัง)
  const profileRefreshedForJobRef = useRef<string | null>(null);
  useEffect(() => {
    if (!job?.id || !user?.id || !token) return;
    const status = (job.status || "").toLowerCase();
    if (status !== "completed") return;
    const isProvider = job.accepted_by && String(job.accepted_by) === String(user.id);
    if (!isProvider) return;
    const doRefresh = () => {
      MockApi.getProfile(user.id, { refresh: true }).then((fresh) => {
        login(fresh, token);
      }).catch(() => {});
    };
    doRefresh();
    const iv = setInterval(doRefresh, 15000); // ทุก 15 วินาที จับทิปที่เข้ามา
    return () => clearInterval(iv);
  }, [job?.id, job?.status, job?.accepted_by, user?.id, token]);

  // Brand Adviser: โหลดสรุป BA แบบ batch (ลด getProfile ซ้ำ)
  useEffect(() => {
    let cancelled = false;
    const ids = [
      job?.created_by ? String(job.created_by) : "",
      job?.accepted_by ? String(job.accepted_by) : "",
      user?.id ? String(user.id) : "",
    ].filter(Boolean);
    const unique = [...new Set(ids)];

    if (unique.length === 0) {
      setEmployerBa(null);
      setProviderBa(null);
      setSelfBa(null);
      return;
    }

    MockApi.getBrandAdviserProfilesSummary(unique)
      .then((map) => {
        if (cancelled) return;
        const pick = (id: string | undefined) => {
          if (!id) return null;
          return map[String(id)] ?? null;
        };
        setEmployerBa(job?.created_by ? pick(String(job.created_by)) : null);
        setProviderBa(job?.accepted_by ? pick(String(job.accepted_by)) : null);
        setSelfBa(user?.id ? pick(String(user.id)) : null);
      })
      .catch(() => {
        if (!cancelled) {
          setEmployerBa(null);
          setProviderBa(null);
          setSelfBa(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [job?.created_by, job?.accepted_by, user?.id]);

  // 🚗 Auto-start Location Tracking สำหรับ Provider เมื่อรับงาน
  useEffect(() => {
    // ✅ เริ่ม tracking เมื่อ Provider รับงานแล้ว (status = accepted หรือ in_progress)
    if (
      user?.id &&
      job?.id &&
      isAssignedProvider &&
      (job.status === 'accepted' || job.status === 'in_progress') &&
      !locationWatchId
    ) {
      console.log('🚀 Starting location tracking for Provider:', user.id);
      
      const watchId = LocationService.startTracking(
        user.id,
        job.id,
        (error) => {
          console.error('❌ Geolocation error:', error);
          notify('ไม่สามารถเข้าถึงตำแหน่งได้ กรุณาเปิด GPS', 'error');
        }
      );
      
      if (watchId) {
        setLocationWatchId(watchId);
        setIsLocationTracking(true);
        notify('📍 เริ่มติดตามตำแหน่งแล้ว', 'success');
      }
    }

    // 🛑 หยุด tracking เมื่องานเสร็จสิ้น
    if (
      locationWatchId &&
      job?.status &&
      !['accepted', 'in_progress'].includes(job.status)
    ) {
      console.log('🛑 Stopping location tracking');
      LocationService.stopTracking(locationWatchId);
      setLocationWatchId(null);
      setIsLocationTracking(false);
    }

    // Cleanup on unmount
    return () => {
      if (locationWatchId) {
        LocationService.stopTracking(locationWatchId);
        setLocationWatchId(null);
        setIsLocationTracking(false);
      }
    };
  }, [user?.id, job?.id, job?.status, isAssignedProvider, locationWatchId]);

  // 📍 Calculate distance to destination for arrival confirmation
  useEffect(() => {
    if (!isAssignedProvider || !job?.location || job.status !== 'accepted') return;

    // Subscribe to provider's location to check distance
    const unsubscribe = LocationService.subscribeToProviderLocation(
      user!.id,
      job.id,
      (location) => {
        if (location && job.location) {
          const distance = LocationService.calculateDistance(
            location.lat,
            location.lng,
            job.location.lat,
            job.location.lng
          );
          setDistanceToDestination(distance);
          setCurrentProviderLocation({ lat: location.lat, lng: location.lng });
          
          console.log('📏 Distance to destination:', distance, 'km');
        }
      }
    );

    return () => unsubscribe();
  }, [isAssignedProvider, user?.id, job?.id, job?.location, job?.status]);

  // Expiration Timer Logic — งาน open มีเวลา 36 ชม. ให้ผู้รับกดรับ
  useEffect(() => {
    if (!job) return;
    if ((job.status || '').toLowerCase() === 'expired') {
      setIsExpired(true);
      setExpirationTime("00:00:00");
      return;
    }
    if (job.status === JobStatus.OPEN) {
      const createdAt = new Date(job.created_at || job.datetime).getTime();
      const expiration = createdAt + 36 * 60 * 60 * 1000; // 36 ชม. ให้ผู้รับกดรับ

      // เช็คทันทีว่าหมดอายุแล้วหรือยัง (ไม่ต้องรอ 1 วินาที)
      if (Date.now() >= expiration) {
        setIsExpired(true);
        setExpirationTime("00:00:00");
        return;
      }
      setIsExpired(false); // รีเซ็ตเมื่อโหลดงานใหม่ที่ยังไม่หมดอายุ

      const timer = setInterval(() => {
        const now = Date.now();
        const diff = expiration - now;

        if (diff <= 0) {
          setIsExpired(true);
          setExpirationTime("00:00:00");
          clearInterval(timer);
          
          // 🔥 Auto-cancel job when expired
          if (id && job.status === JobStatus.OPEN) {
            MockApi.cancelJob(id, "Job expired after 36 hours")
              .then(() => notify("งานหมดอายุและถูกยกเลิกอัตโนมัติ", "info"))
              .catch((error) => console.error("Failed to auto-cancel:", error));
          }
        } else {
          const hours = Math.floor(diff / (1000 * 60 * 60));
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((diff % (1000 * 60)) / 1000);
          setExpirationTime(
            `${hours.toString().padStart(2, "0")}:${minutes
              .toString()
              .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
          );
        }
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [job, id, notify]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (location.hash === "#chat") setChatOverlayOpen(true);
  }, [location.hash]);

  useEffect(() => {
    if (!chatOverlayOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [chatOverlayOpen]);

  const handleHelpTopicBack = useCallback(() => {
    setHelpSelectedTopicKey(null);
    setHelpSelectedSubKey(null);
  }, []);

  const resetStaffSupportFlow = useCallback(() => {
    setStaffSupportPhase(null);
    setStaffSupportPrefill("");
    setQueueAheadDisplay("—");
    setStaffSupportMessages([]);
    setStaffChatInput("");
    setStaffCsatStars(0);
    setStaffSupportTicketId(null);
  }, []);

  /** เริ่มแชทกับเจ้าหน้าที่: สร้าง ticket จริง → คิว (UX) → ดึงข้อความจาก API (แอดมินเห็นใน nexus-admin-core) */
  const startStaffSupportFlow = useCallback(
    (prefill: string) => {
      setStaffSupportPrefill(prefill);
      setQueueAheadDisplay("—");
      setStaffSupportMessages([]);
      setStaffChatInput("");
      setStaffCsatStars(0);
      setStaffSupportTicketId(null);
      setStaffSupportPhase("connecting");

      void (async () => {
        try {
          const uid =
            user?.id != null
              ? String(user.id)
              : (user as { userId?: string })?.userId != null
                ? String((user as { userId?: string }).userId)
                : undefined;
          const { ticket } = await createUserSupportTicket({
            userId: uid,
            subject: `[${jobReferenceCode || id || "—"}] Meerak job — Help`,
            message: prefill,
            category: "General",
            email: user?.email ?? null,
            full_name:
              (user as { name?: string; full_name?: string })?.name ??
              (user as { full_name?: string })?.full_name ??
              null,
            phone: (user as { phone?: string })?.phone ?? null,
            jobId: id ?? null,
          });
          setStaffSupportTicketId(ticket.id);
          await new Promise((r) => setTimeout(r, 1400));
          setStaffSupportPhase("queueing");
          setQueueAheadDisplay(String(Math.floor(Math.random() * 3) + 1));
          await new Promise((r) => setTimeout(r, 1800));
          setStaffSupportPhase("chat");
        } catch (err: unknown) {
          const ax = err as { response?: { data?: { error?: string } }; message?: string };
          const msg =
            ax?.response?.data?.error ||
            ax?.message ||
            (language === "th"
              ? "เชื่อมต่อศูนย์ช่วยเหลือไม่สำเร็จ กรุณาลองใหม่"
              : "Could not reach support. Please try again.");
          notify(msg, "error");
          resetStaffSupportFlow();
        }
      })();
    },
    [user, jobReferenceCode, id, language, notify, resetStaffSupportFlow]
  );

  /** ปุ่มซ้าย: ย้อนกลับแบบสอบถาม / จบแชท → CSAT / ยกเลิกเชื่อมต่อ */
  const handleStaffSupportHeaderLeft = useCallback(() => {
    if (staffSupportPhase === "csat_staff") {
      setStaffSupportPhase("chat");
      return;
    }
    if (staffSupportPhase === "csat_app") {
      setStaffSupportPhase("csat_staff");
      return;
    }
    if (staffSupportPhase === "chat") {
      setStaffSupportPhase("csat_staff");
      return;
    }
    resetStaffSupportFlow();
  }, [staffSupportPhase, resetStaffSupportFlow]);

  /** ปุ่ม X ขวา (CSAT) — ปิดแบบสอบถามและกลับหน้าหมวดช่วยเหลือ */
  const handleStaffSupportDismiss = useCallback(() => {
    resetStaffSupportFlow();
  }, [resetStaffSupportFlow]);

  const finishStaffSupportAfterCsat = useCallback(() => {
    notify(
      language === "th" ? "ขอบคุณสำหรับฟีดแบค" : "Thank you for your feedback",
      "success"
    );
    resetStaffSupportFlow();
    setHelpSelectedTopicKey(null);
    setHelpSelectedSubKey(null);
  }, [notify, language, resetStaffSupportFlow]);

  const handleStaffSendMessage = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const text = staffChatInput.trim();
      if (!text) return;
      if (!staffSupportTicketId) {
        notify(
          language === "th"
            ? "ยังไม่มีเซสชันแชท — กรุณาเริ่มใหม่"
            : "No chat session — please start again.",
          "error"
        );
        return;
      }
      setStaffChatInput("");
      try {
        await postUserSupportMessage(staffSupportTicketId, text);
        const rows = await getUserSupportMessages(staffSupportTicketId);
        setStaffSupportMessages(mapSupportMessagesToStaffUi(rows));
      } catch (err: unknown) {
        const ax = err as { response?: { data?: { error?: string } }; message?: string };
        notify(
          ax?.response?.data?.error ||
            ax?.message ||
            (language === "th" ? "ส่งข้อความไม่สำเร็จ" : "Failed to send message"),
          "error"
        );
      }
    },
    [staffChatInput, staffSupportTicketId, notify, language]
  );

  /** ดึงข้อความจาก API — Socket.IO แบบเรียลไทม์ + fallback polling */
  useEffect(() => {
    if (staffSupportPhase !== "chat" || !staffSupportTicketId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const rows = await getUserSupportMessages(staffSupportTicketId);
        if (!cancelled) setStaffSupportMessages(mapSupportMessagesToStaffUi(rows));
      } catch {
        /* คงข้อความเดิม */
      }
    };
    void load();
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("meerak_token") || localStorage.getItem("authToken") || ""
        : "";
    const unsub = subscribeSupportTicketRoom(staffSupportTicketId, token || null, () => {
      void load();
    });
    const iv = window.setInterval(load, 20000);
    return () => {
      cancelled = true;
      clearInterval(iv);
      unsub();
    };
  }, [staffSupportPhase, staffSupportTicketId]);

  useEffect(() => {
    if (!staffChatScrollRef.current) return;
    staffChatScrollRef.current.scrollTop = staffChatScrollRef.current.scrollHeight;
  }, [staffSupportMessages, staffSupportPhase]);

  const closeChatOverlay = useCallback(() => {
    resetStaffSupportFlow();
    setChatOverlayOpen(false);
    setChatOverlayTab("chat");
    setHelpSelectedTopicKey(null);
    setHelpSelectedSubKey(null);
    if (location.hash === "#chat") {
      navigate(
        { pathname: location.pathname, search: location.search, hash: "" },
        { replace: true }
      );
    }
  }, [
    location.hash,
    location.pathname,
    location.search,
    navigate,
    resetStaffSupportFlow,
  ]);

  const openChatOverlay = useCallback(() => {
    setChatOverlayOpen(true);
    navigate(
      { pathname: location.pathname, search: location.search, hash: "#chat" },
      { replace: true }
    );
  }, [location.pathname, location.search, navigate]);

  /** แจ้งปัญหา — แสดง modal ยืนยันก่อน แล้วค่อยเข้าศูนย์ช่วยเหลือ */
  const openHelpCenterGateModal = useCallback(() => {
    setShowHelpCenterGateModal(true);
  }, []);

  /** เปิดแชทเต็มจอที่แท็บศูนย์ช่วยเหลือ (หลังกดติดต่อศูนย์ช่วยเหลือใน gate modal) */
  const openHelpCenterOverlay = useCallback(() => {
    setChatOverlayTab("help");
    setHelpSelectedTopicKey(null);
    setHelpSelectedSubKey(null);
    setChatOverlayOpen(true);
    navigate(
      { pathname: location.pathname, search: location.search, hash: "#chat" },
      { replace: true }
    );
  }, [location.pathname, location.search, navigate]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !id) return;
    const text = newMessage;
    setNewMessage("");
    await MockApi.sendMessage(id, text);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && id) {
      const file = e.target.files[0];
      try {
        notify("Uploading image...", "info");
        const url = await MockApi.uploadImage(file);
        await MockApi.sendMessage(id, url, MessageType.IMAGE);
        notify("Image sent", "success");
      } catch (err) {
        notify("Failed to upload image", "error");
      }
    }
  };

  const doAcceptJob = async (forceIgnoreConflict = false) => {
    if (!id || !user || !job) return;
    try {
      await MockApi.acceptJob(id, { forceIgnoreConflict });
      try {
        const effIns = hasInsurance || (() => { try { return localStorage.getItem(insuranceStorageKey(id)) === 'true'; } catch { return false; } })();
        const holdSuccess = await MockApi.holdPayment(id, undefined, effIns);
        if (!holdSuccess) console.warn('Hold payment returned false');
      } catch (holdErr: any) {
        const msg = holdErr?.response?.data?.message || holdErr?.message;
        if (holdErr?.response?.status === 400 && holdErr?.response?.data?.error === 'insufficient_balance') {
          notify('⚠️ ผู้จ้างยอด Wallet ไม่พอ — กรุณาให้ผู้จ้างเติมเงินก่อนรับงาน', 'error');
          throw holdErr;
        }
        console.warn('Hold payment skipped or failed:', msg);
      }
      notify("✅ " + t("detail.action_success"), "success");
      console.log('✅ Job accepted');
      setShowConflictModal(false);
      // รีเฟรชงานจาก Backend — งานอยู่ที่ Backend ไม่มีใน Firestore ดังนั้น subscribeToJob จะไม่อัปเดต
      const refreshed = await MockApi.getJobDetails(id);
      if (refreshed) setJob(refreshed);
    } catch (err: any) {
      throw err;
    }
  };

  const ensureProviderKycForHighValueAccept = async (): Promise<boolean> => {
    if (!user || !job) return false;
    if (user.role !== UserRole.PROVIDER) return true;
    const jobFeeThb =
      Math.round((Number(job.price) + Number.EPSILON) * 100) / 100;
    if (
      !Number.isFinite(jobFeeThb) ||
      jobFeeThb < HIGH_VALUE_JOB_THRESHOLD_THB
    ) {
      return true;
    }
    try {
      const kyc = await MockApi.checkKYCStatus();
      if (
        shouldRequireKycForHighValueJob(jobFeeThb, {
          kycStatus: kyc?.kycStatus,
          kycLevel: kyc?.kycLevel,
          needsReverify: !!kyc?.needsReverify,
        })
      ) {
        notify(
          `งานมูลค่า ${jobFeeThb.toLocaleString()} บาทขึ้นไปต้องยืนยันตัวตน (KYC) ก่อนรับงาน`,
          "warning",
        );
        navigate("/kyc?reason=high_value_job");
        return false;
      }
    } catch {
      notify("ไม่สามารถตรวจสถานะ KYC ได้ ลองใหม่อีกครั้ง", "error");
      return false;
    }
    return true;
  };

  const handleAcceptJob = async () => {
    if (!id || !user || !job) return;
    if (!(await ensureProviderKycForHighValueAccept())) return;
    try {
      await doAcceptJob(false);
    } catch (err: any) {
      if (err?.conflict) {
        setShowConflictModal(true);
        return;
      }
      console.error('❌ Error accepting job:', err);
      notify(err.message || "Failed to accept job", "error");
    }
  };

  const handleAcceptJobForceConflict = async () => {
    if (!id || !user || !job) return;
    if (!(await ensureProviderKycForHighValueAccept())) return;
    setAcceptingWithConflict(true);
    try {
      await doAcceptJob(true);
    } catch (err: any) {
      notify(err.message || "Failed to accept job", "error");
    } finally {
      setAcceptingWithConflict(false);
    }
  };

  // 📍 Phase 3: Confirm Arrival
  const handleConfirmArrival = async () => {
    if (!id || !user || !isAssignedProvider) return;
    if (job?.arrived_at || job?.status !== JobStatus.ACCEPTED) return;

    // ✅ ตรวจสอบระยะทาง (ต้องใกล้จุดหมาย < 0.5 km หรือ 500 เมตร)
    if (distanceToDestination !== null && distanceToDestination > 0.5) {
      notify(`⚠️ คุณยังอยู่ห่างจากจุดหมาย ${distanceToDestination.toFixed(2)} km กรุณาเดินทางให้ใกล้กว่า 500 เมตรก่อน`, 'error');
      return;
    }

    try {
      setConfirmingArrival(true);

      /** ตรงกับ mockApi.getJobDetails: Firebase-only id = alphanumeric ยาว ~20 ไม่มีขีด */
      const firestoreJobIdPattern = /^[a-zA-Z0-9]{19,22}$/;
      const isFirestoreOnlyJob =
        !!id &&
        firestoreJobIdPattern.test(id) &&
        !id.includes("-");

      if (isFirestoreOnlyJob) {
        await FirebaseApi.confirmArrival(id, user.id);
      } else {
        const res = await api.post<{ success?: boolean }>(
          `/jobs/${encodeURIComponent(id)}/confirm-arrival`,
          { userId: user.id }
        );
        if (!res.data?.success) {
          throw new Error("ไม่สามารถยืนยันการมาถึงได้");
        }
      }

      const refreshed = await MockApi.getJobDetails(id);
      if (refreshed) setJob(refreshed);
      
      // Update provider location status to 'arrived'
      if (currentProviderLocation) {
        await LocationService.updateProviderStatus(user.id, id, 'arrived');
      }
      
      notify('✅ ยืนยันการมาถึงสำเร็จ! เริ่มทำงานได้เลย', 'success');
      
      console.log('✅ Arrival confirmed at:', new Date().toISOString());
    } catch (error) {
      console.error('❌ Error confirming arrival:', error);
      const axErr = error as {
        response?: { data?: { error?: string; message?: string } };
        message?: string;
      };
      const upstream =
        (typeof axErr.response?.data?.error === 'string' && axErr.response.data.error) ||
        (typeof axErr.response?.data?.message === 'string' && axErr.response.data.message) ||
        '';
      const msg =
        upstream ||
        (error instanceof Error && error.message ? error.message : '') ||
        'ไม่สามารถยืนยันการมาถึงได้';
      notify(msg, 'error');
    } finally {
      setConfirmingArrival(false);
    }
  };

  /** ถ่ายรูปก่อนเริ่มงาน — เก็บในเครื่องก่อน ยังไม่อัปโหลด (กด «ถัดไป» เพื่อส่ง) */
  const captureProofBeforeDraft = async () => {
    if (!id || !db) return;
    setCapturingProof("before");
    try {
      const file = await capturePhotoFromCamera();
      if (!file) {
        notify(t("detail.proof_camera_unavailable"), "error");
        setCameraHelpOpen("before");
        return;
      }
      const v = await validateJobProofImage(file, "before");
      if (!v.ok) {
        notify(v.message || t("detail.proof_verify_failed"), "error");
        return;
      }
      setBeforePhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => setBeforePhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
    } finally {
      setCapturingProof(null);
    }
  };

  /** อัปโหลดรูปก่อนเริ่มงาน แล้วไปขั้นถ่ายหลัง (แบบ book) */
  const handleProofBookNextAfterBefore = async () => {
    if (!id || !beforePhoto) {
      notify("กรุณาถ่ายรูปก่อนเริ่มงานจากกล้องก่อน", "error");
      return;
    }
    if (!db) {
      notify("ระบบยังไม่พร้อม กรุณาลองใหม่", "error");
      return;
    }
    const v = await validateJobProofImage(beforePhoto, "before");
    if (!v.ok) {
      notify(v.message || "รูปไม่ผ่านการตรวจสอบ", "error");
      return;
    }
    await uploadProofFileAndSave(beforePhoto, "before");
  };

  /** ถ่ายรูปหลังเสร็จงาน — บังคับกล้อง อัปโหลดทันที */
  const handleCaptureProofAfter = async () => {
    if (!id || !db) return;
    setCapturingProof("after");
    try {
      const file = await capturePhotoFromCamera();
      if (!file) {
        notify(t("detail.proof_camera_unavailable"), "error");
        setCameraHelpOpen("after");
        return;
      }
      const v = await validateJobProofImage(file, "after");
      if (!v.ok) {
        notify(v.message || t("detail.proof_verify_failed"), "error");
        return;
      }
      setAfterPhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => setAfterPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
      const saved = await uploadProofFileAndSave(file, "after");
      if (!saved) {
        setAfterPhoto(null);
        setAfterPhotoPreview(null);
      }
    } finally {
      setCapturingProof(null);
    }
  };

  const parseThbInput = (s: string) => {
    const n = parseFloat(String(s).replace(/,/g, "").trim());
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.round(n * 100) / 100;
  };

  const buildExtrasFromInputs = useCallback((): JobCompletionExtras | undefined => {
    const meter = parseThbInput(completionMeter);
    const toll = parseThbInput(completionToll);
    const parking = parseThbInput(completionParking);
    const other = parseThbInput(completionOther);
    const note = completionExtrasNote.trim().slice(0, 500);
    const total = meter + toll + parking + other;
    if (total <= 0 && !note) return undefined;
    return {
      meter_thb: meter,
      toll_thb: toll,
      parking_thb: parking,
      other_thb: other,
      ...(note ? { note } : {}),
    };
  }, [completionMeter, completionToll, completionParking, completionOther, completionExtrasNote]);

  const handleVerifyProviderMeetCode = useCallback(async () => {
    if (!id || !providerMeetCodeInput.trim()) return;
    setProviderMeetCodeVerifying(true);
    setProviderMeetCodeVerified(false);
    setProviderMeetCodeVerifyError(null);
    try {
      const { data } = await api.post<{ ok: boolean; error?: string; message?: string }>(
        `/jobs/${encodeURIComponent(id)}/meet-code/verify`,
        { meetCode: providerMeetCodeInput.trim() }
      );
      if (data?.ok) {
        setProviderMeetCodeVerified(true);
        notify("ยืนยันรหัสพบกันสำเร็จ — เชื่อมกับผู้จ้างแล้ว", "success");
      } else {
        setProviderMeetCodeVerifyError(data?.message || "ไม่สามารถตรวจสอบรหัสได้");
      }
    } catch (e: any) {
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        e?.message ||
        "ไม่สามารถตรวจสอบรหัสได้";
      setProviderMeetCodeVerifyError(String(msg));
    } finally {
      setProviderMeetCodeVerifying(false);
    }
  }, [id, providerMeetCodeInput, notify]);

  /** เปิดขั้นตอนมิเตอร์/ทางด่วน → สรุปเก็บเงิน → GPS/ส่งมอบ */
  const openCompletionFlow = () => {
    if (!id || !job) return;
    if (submittingWork || gpsVerifying) return;
    const beforeUrl = job.before_photo_url || uploadedPhotosRef.current.before;
    const afterUrl = job.after_photo_url || uploadedPhotosRef.current.after;
    const hasPhotoProof = !!beforeUrl && !!afterUrl;
    if (jobRequiresProofPhotos(job) && !hasPhotoProof) {
      notify("❌ กรุณาอัปโหลดรูปก่อนและหลังทำงานก่อนส่งงาน", "error");
      return;
    }
    if (MEET_CODE_REQUIRED && providerMeetCodeInput.trim().length !== 6) {
      notify("❌ กรุณากรอกรหัส 6 หลักจากผู้จ้าง (QR/ตัวเลข) ให้ครบ", "error");
      return;
    }
    if (MEET_CODE_REQUIRED && !providerMeetCodeVerified) {
      notify("❌ กดปุ่มใหญ่ «ยืนยันรหัสพบกันผู้จ้าง» ให้สำเร็จก่อน จึงจะส่งมอบงานได้", "error");
      return;
    }
    setShowCompletionExtrasModal(true);
  };

  const runSubmitWorkWithExtras = async (extras: JobCompletionExtras | undefined) => {
    if (!id || !job) return;
    if (submittingWork || gpsVerifying) return;
    setShowCompletionExtrasModal(false);
    setShowCompletionSummaryModal(false);
    setSubmittingWork(true);

    const meetCodeForApi = MEET_CODE_REQUIRED ? providerMeetCodeInput.trim() : undefined;

    const doSubmit = async (providerLocation: { lat: number; lng: number; timestamp?: number }) => {
      const loc = {
        ...providerLocation,
        timestamp: providerLocation.timestamp ?? Date.now(),
      };
      try {
        await MockApi.markJobAsDone(
          id,
          loc,
          completionOtp.trim() || undefined,
          meetCodeForApi,
          extras
        );
        try {
          console.log("⏱️ Starting 5-minute dispute window...");
          await PaymentService.startDisputeWindow(id);
        } catch (dwErr) {
          console.warn("Dispute window (optional):", dwErr);
        }
        notify("✅ " + t("detail.action_success") + " — รอให้ผู้จ้างตรวจสอบและกดอนุมัติ", "success");
      } catch (err: any) {
        console.error("❌ Error submitting work:", err);
        notify(messageForJobCompleteError(err, t), "error");
      } finally {
        setGpsVerifying(false);
        setSubmittingWork(false);
      }
    };

    if (isDemoJobLike && job?.location?.lat != null && job?.location?.lng != null) {
      setGpsVerifying(true);
      doSubmit({
        lat: job.location.lat,
        lng: job.location.lng,
        timestamp: Date.now(),
      });
      return;
    }

    if (navigator.geolocation) {
      setGpsVerifying(true);
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          await doSubmit({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            timestamp: Date.now(),
          });
        },
        () => {
          setGpsVerifying(false);
          setSubmittingWork(false);
          notify(t("detail.err_gps_required"), "error");
        }
      );
    } else {
      setSubmittingWork(false);
      notify(t("detail.err_gps_unsupported"), "error");
    }
  };

  const handleCreateEmployerMeetCode = async () => {
    if (!id || !user || !isOwner) return;
    setCreatingMeetCode(true);
    try {
      const base = getBackendBase();
      const res = await fetch(`${base}/api/jobs/${encodeURIComponent(id)}/meet-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || t("detail.employer_meet_fail"));
      setEmployerMeet({
        code: String(data.code),
        expiresAt: data.expiresAt || "",
        qrPayload: String(data.qrPayload || `meerak:meet:${id}:${data.code}`),
      });
      notify(t("detail.employer_meet_success"), "success");
    } catch (e: any) {
      notify(e?.message || t("detail.employer_meet_fail"), "error");
    } finally {
      setCreatingMeetCode(false);
    }
  };

  const handleApproveWork = async () => {
    if (!id || !job || !user) return;
    if (!paymentsEnabled) {
      notify("การชำระเงินถูกปิดชั่วคราวโดยผู้ดูแลระบบ", "warning");
      return;
    }

    if (jobRequiresProofPhotos(job) && !hasReviewedProof) {
      alert(t("detail.must_view_proof_alert"));
      return;
    }

    const confirmMsg = hasInsurance
      ? `ยืนยันการอนุมัติงานและโอนเงิน ${totalPrice.toLocaleString()} บาท (รวมค่าประกัน ${insuranceAmount.toLocaleString()} บาท) ให้ผู้รับงาน?`
      : `ยืนยันการอนุมัติงานและโอนเงิน ${jobFeeRounded} บาทให้ผู้รับงาน?`;
    if (window.confirm(confirmMsg)) {
      setProcessingPay(true);
      try {
        // 1. อนุมัติงาน
        const approveSuccess = await MockApi.approveJob(id);
        if (!approveSuccess) {
          notify("อนุมัติงานไม่สำเร็จ", "error");
          return;
        }

        // 2. โอนเงินให้ผู้รับงาน — ส่ง has_insurance ถ้าติ๊กซื้อประกัน (ใช้ localStorage fallback)
        const effIns = hasInsurance || (() => { try { return localStorage.getItem(insuranceStorageKey(id)) === 'true'; } catch { return false; } })();
        await MockApi.processPayment(
          id,
          PaymentMethod.WALLET,
          0,
          effIns
        );

        // 2b. ปล่อย pending → balance หลังครบช่วงกันเงิน (backend: provider_release_after)
        void MockApi.pollReleasePayment(id)
          .then((ok) => {
            if (ok) {
              notify("ระบบปล่อยเงินให้ผู้รับงานแล้ว (ครบช่วงกันเงินตามกลาง)", "success");
            }
            if (token && user?.id) {
              MockApi.getProfile(user.id, { refresh: true }).then((u) => login(u, token)).catch(() => {});
            }
          })
          .catch((releaseErr: any) => {
            console.warn("pollReleasePayment:", releaseErr?.message);
          });

        if (token) {
          // รีเฟรช profile เพื่อให้ wallet แสดงยอดล่าสุดหลังหักเงิน
          const freshUser = await MockApi.getProfile(user.id, { refresh: true });
          login(freshUser, token);

          // ✅ 3. อัปเดต status เป็น COMPLETED (สำคัญมาก!)
          console.log('✅ Updating job status to COMPLETED...');
          try {
            await updateDoc(doc(db, 'jobs', id), {
              status: JobStatus.COMPLETED,
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
          } catch (fireErr) {
            // งานจาก Backend อาจไม่มีใน Firestore — ไม่เป็นไร
            console.warn('Firestore update (optional):', (fireErr as Error)?.message);
          }

          notify("อนุมัติงานแล้ว — เงินอยู่ระหว่างกันตามกลาง 5 นาที ก่อนโอนเข้าผู้รับงาน", "success");

          // 4. แสดง modal รีวิวหลังจากอนุมัติ
          setTimeout(() => {
            setShowReviewModal(true);
          }, 1500);

          // 5. รีเฟรช profile อีกครั้งเพื่อให้ wallet ตรงกับ DB
          const finalUser = await MockApi.getProfile(user.id, { refresh: true });
          login(finalUser, token);
        } else {
          notify("โอนเงินไม่สำเร็จ", "error");
        }
      } catch (error: any) {
        const pe = error as PaymentProcessError;
        if (pe?.code === "INSUFFICIENT_WALLET_FOR_CASH_DELTA") {
          notify(
            t("detail.cash_delta_insufficient")
              .replace("{delta}", String(pe.required_delta ?? "—"))
              .replace("{balance}", String(pe.balance ?? "—")),
            "error"
          );
        } else {
          notify(error.message || "อนุมัติงานไม่สำเร็จ", "error");
        }
      } finally {
        setProcessingPay(false);
      }
    }
  };

  const handleCancelClick = async () => {
    if (!id || !job || !user?.id) return;
    const icIntercity =
      transportHubJobKind === "intercity_charter" &&
      isOwner &&
      (job.status === JobStatus.ACCEPTED || job.status === JobStatus.IN_PROGRESS);
    if (icIntercity) {
      try {
        const q = await MockApi.getJobCancelQuote(id, user.id);
        if (q.applies && q.cancel_fee && (Number(q.cancel_fee.totalFeeThb) || 0) > 0) {
          setPendingIntercityCancelFee(q.cancel_fee);
          setShowIntercityCancelFeeModal(true);
          return;
        }
      } catch (e) {
        console.warn("getJobCancelQuote:", e);
      }
    }
    setPendingIntercityCancelFee(null);
    setCancelSeconds(10);
    setShowCancelModal(true);
  };

  const performCancellation = useCallback(async () => {
    if (!id || !job) return;
    const needConfirm =
      !!pendingIntercityCancelFee && (Number(pendingIntercityCancelFee.totalFeeThb) || 0) > 0;
    try {
      await MockApi.cancelJob(id, undefined, user?.id, {
        confirmIntercityCancelFee: needConfirm,
      });
      notify(t("detail.action_success"), "success");
      setPendingIntercityCancelFee(null);
    } catch (err: any) {
      const msg = err?.message || "Failed to cancel";
      notify(msg, "error");
    } finally {
      setShowCancelModal(false);
    }
  }, [id, job, user?.id, pendingIntercityCancelFee, notify, t]);

  // Cancellation Countdown Logic (หลัง performCancellation เพื่อไม่ให้อ้างก่อนประกาศ)
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    if (showCancelModal && cancelSeconds > 0) {
      timer = setInterval(() => {
        setCancelSeconds((prev) => prev - 1);
      }, 1000);
    } else if (showCancelModal && cancelSeconds === 0) {
      void performCancellation();
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [showCancelModal, cancelSeconds, performCancellation]);

  const handlePay = () => {
    if (!id) return;
    if (!paymentsEnabled) {
      notify("การชำระเงินถูกปิดชั่วคราวโดยผู้ดูแลระบบ", "warning");
      return;
    }
    navigate(`/payment/${id}`);
  };

  const handleApproveAndPay = async () => {
    if (!id || !job || !user) return;
    if (!paymentsEnabled) {
      notify("การชำระเงินถูกปิดชั่วคราวโดยผู้ดูแลระบบ", "warning");
      return;
    }

    if (jobRequiresProofPhotos(job) && !hasReviewedProof) {
      alert(
        "Please review the proof of work image in the chat before approving."
      );
      return;
    }

    const confirmMsg = t("detail.auto_pay_confirm").replace(
      "{amount}",
      String(hasInsurance ? totalPrice : jobFeeRounded)
    );
    if (window.confirm(confirmMsg)) {
      setProcessingPay(true);
      try {
        // 1. อนุมัติงานก่อน
        const approveResult = await MockApi.approveJob(id);
        if (!approveResult) {
          notify("อนุมัติงานไม่สำเร็จ", "error");
          return;
        }

        // 2. โอนเงินให้ผู้รับงาน — ส่ง has_insurance ถ้าติ๊กซื้อประกัน (ใช้ localStorage fallback)
        const effIns = hasInsurance || (() => { try { return localStorage.getItem(insuranceStorageKey(id)) === 'true'; } catch { return false; } })();
        await MockApi.processPayment(
          id,
          PaymentMethod.WALLET,
          0,
          effIns
        );
        void MockApi.pollReleasePayment(id)
          .then((ok) => {
            if (ok) notify("ระบบปล่อยเงินให้ผู้รับงานแล้ว (ครบช่วงกันเงินตามกลาง)", "success");
            if (token && user?.id) {
              MockApi.getProfile(user.id, { refresh: true }).then((u) => login(u, token)).catch(() => {});
            }
          })
          .catch((releaseErr: any) => console.warn("pollReleasePayment:", releaseErr?.message));
        // รีเฟรช profile เพื่อให้ wallet แสดงยอดล่าสุด
        if (token && user?.id) {
          const freshUser = await MockApi.getProfile(user.id, { refresh: true });
          login(freshUser, token);
        }
        notify("อนุมัติแล้ว — เงินอยู่ระหว่างกันตามกลาง 5 นาที ก่อนโอนเข้าผู้รับงาน", "success");
        if (job.accepted_by) {
          setTimeout(() => {
            setShowReviewModal(true);
          }, 1500);
        }
      } catch (error: any) {
        const pe = error as PaymentProcessError;
        if (pe?.code === "INSUFFICIENT_WALLET_FOR_CASH_DELTA") {
          notify(
            t("detail.cash_delta_insufficient")
              .replace("{delta}", String(pe.required_delta ?? "—"))
              .replace("{balance}", String(pe.balance ?? "—")),
            "error"
          );
        } else {
          notify(error.message || "Payment failed", "error");
        }
      } finally {
        setProcessingPay(false);
      }
    }
  };
  const onReviewSubmitted = () => {
    // 1. ปิด modal
    setShowReviewModal(false);
    setEmployerHasReviewed(true);

    // 2. แสดงข้อความสำเร็จ
    notify("รีวิวของคุณถูกบันทึกเรียบร้อยแล้ว", "success");

    // 3. เก็บใน localStorage เพื่อไม่ให้แสดง modal ซ้ำ
    if (job?.id) {
      localStorage.setItem(`job_reviewed_${job.id}`, "true");
    }

    // 4. รีเซ็ตฟอร์ม (ถ้ายังไม่ได้ทำใน handleSubmitReview)
    setReviewRating(0);
    setReviewComment("");
    setReviewTags([]);
  };
  const toggleTag = (tag: string) => {
    if (reviewTags.includes(tag)) {
      setReviewTags((prev) => prev.filter((t) => t !== tag));
    } else {
      setReviewTags((prev) => [...prev, tag]);
    }
  };

  // ⭐ Phase 6: Updated Review Submission Handler
  const handleSubmitReview = async () => {
    if (!id || !job || !job.accepted_by || !user) {
      notify("ข้อมูลไม่ครบถ้วน", "error");
      return;
    }

    if (reviewRating === 0) {
      notify("❌ กรุณาให้ดาวคะแนน", "error");
      return;
    }

    setSubmittingReview(true);
    try {
      // ⭐ Use ReviewService instead of MockApi
      await ReviewService.submitReview({
        job_id: id,
        reviewer_id: user.id,
        reviewer_name: user.name || 'ผู้ใช้งาน',
        reviewee_id: job.accepted_by,
        reviewer_type: 'employer',
        reviewee_type: 'provider',
        target_user_id: job.accepted_by,
        rating: reviewRating,
        comment: reviewComment,
        tags: reviewTags,
        is_verified_job: true
      });

      notify(`✅ ส่งรีวิวสำเร็จ! คุณให้ ${reviewRating} ดาว`, "success");
      setEmployerHasReviewed(true);
      if (job.id) {
        try {
          localStorage.setItem(`job_reviewed_${job.id}`, "true");
        } catch (_) {}
      }

      // ส่ง notification ให้ผู้รับงาน (non-critical)
      try {
        await MockApi.sendNotification({
          user_id: job.accepted_by,
          title: "⭐ คุณได้รับรีวิวใหม่!",
          message: `${user.name} ให้คะแนนคุณ ${reviewRating} ดาว สำหรับงาน "${job.title}"`,
          type: "system",
          related_id: id,
          is_read: false,
          created_at: new Date().toISOString(),
        });
      } catch (notifErr) {
        console.log('Notification failed (non-critical):', notifErr);
      }

      // ปิด modal รีวิว → แสดง modal ส่งทิป (optional) และรีเซ็ตข้อมูล
      setTimeout(() => {
        setShowReviewModal(false);
        setReviewRating(0);
        setReviewComment("");
        setReviewTags([]);
        setShowTipModal(true); // เปิดให้ส่งทิปได้ทันทีหลังรีวิว (optional)

        // อัปเดตหน้าจอเพื่อแสดงรีวิวใหม่
        if (onReviewSubmitted) {
          onReviewSubmitted();
        }
      }, 1500);
    } catch (error: any) {
      console.error("Submit review error:", error);
      notify(error.message || "ส่งรีวิวไม่สำเร็จ", "error");
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleReportProblem = async () => {
    if (!id || !disputeReason.trim()) return;
    setSubmittingDispute(true);
    try {
      await MockApi.reportJob(id, disputeReason);
      notify(t("detail.dispute_submitted"), "success");
      setShowDisputeModal(false);
    } catch (err) {
      notify("Failed to submit report", "error");
    } finally {
      setSubmittingDispute(false);
    }
  };

  // ยื่นรายงานปัญหา — employer ใช้ API ล็อค escrow, provider ใช้ reportJob; ถ้าติ๊กใช้สิทธิประกันให้ยื่นเคลมด้วย
  const handleDisputeModalSubmit = async () => {
    if (!id || !user || !job || !disputeReason.trim()) return;
    setSubmittingDispute(true);
    try {
      const isOwnerDispute = isOwner && job.status === JobStatus.WAITING_FOR_APPROVAL;
      if (isOwnerDispute) {
        try {
          await MockApi.createDisputeSupportTicket(id, user.id, disputeReason, useInsuranceClaimInDispute);
        } catch (apiErr) {
          await PaymentService.fileDispute(id, user.id, disputeReason);
        }
      } else {
        await handleReportProblem();
        return;
      }
      const hasIns = job?.has_insurance || hasInsurance;
      if (useInsuranceClaimInDispute && hasIns) {
        try {
          const base = getBackendBase();
          const token = localStorage.getItem('meerak_token') || localStorage.getItem('authToken') || '';
          const res = await fetch(`${base}/api/insurance/claim`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ job_id: id, evidence_text: disputeReason }),
          });
          const text = await res.text();
          const data = text && text.startsWith("{") ? JSON.parse(text) : {};
          if (!res.ok) throw new Error(data.error || 'ไม่สามารถยื่นเคลมได้');
          setInsuranceClaim({
            id: data.claim_id, claim_status: 'pending',
            original_price: data.original_price,
            replacement_payout: data.replacement_payout,
            reserve_amount: data.reserve_amount,
            claimed_at: new Date().toISOString(),
          });
        } catch (claimErr) {
          console.warn('Insurance claim in dispute failed:', claimErr);
        }
      }
      notify('✅ ยื่น Dispute สำเร็จ - ระบบจะพิจารณาภายใน 24-48 ชั่วโมง', 'success');
      setShowDisputeModal(false);
      setDisputeReason('');
      setUseInsuranceClaimInDispute(false);
    } catch (err: any) {
      console.error('Error filing dispute:', err);
      notify(err.message || 'ไม่สามารถยื่น dispute ได้', 'error');
    } finally {
      setSubmittingDispute(false);
    }
  };

  // เฉพาะนายจ้าง→ผู้รับงาน เท่านั้น (ผู้รับงานส่งทิปให้นายจ้างไม่ได้)
  const handleSendTip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !job || !user || !tipAmount || isNaN(Number(tipAmount)) || !isOwner) return;
    if (!paymentsEnabled) {
      notify("การชำระเงินถูกปิดชั่วคราวโดยผู้ดูแลระบบ", "warning");
      return;
    }

    const toUserId = job.accepted_by;
    if (!toUserId) {
      notify("❌ ไม่พบผู้รับทิป", "error");
      return;
    }

    const amount = Number(tipAmount);
    if (amount < 10) {
      notify("❌ ทิปขั้นต่ำ 10 บาท", "error");
      return;
    }
    if (amount > TIP_MAX_AMOUNT) {
      notify(t("detail.tip_max_hint"), "error");
      return;
    }

    setSendingTip(true);
    try {
      // ⭐ Use ReviewService — ทำงานได้ทั้งบัญชี Demo (Apple Review) และบัญชีทั่วไป
      const tipRes = await ReviewService.sendTip(id, user.id, toUserId, amount);
      notify(`✅ ส่งทิป ${amount} บาทสำเร็จ!`, "success");
      setShowTipModal(false);
      setTipAmount("");
      setTipPresetSelected(null);
      if (user && token) {
        const bal = tipRes.employer_wallet_balance;
        if (bal != null) {
          login({ ...user, wallet_balance: bal, wallet_pending: tipRes.employer_wallet_pending ?? user.wallet_pending }, token);
        } else {
          const updatedProfile = await MockApi.getProfile(user.id, { refresh: true });
          login(updatedProfile, token);
        }
        const refreshedJob = await MockApi.getJobDetails(id);
        if (refreshedJob) setJob(refreshedJob);
      }
    } catch (e: any) {
      notify(e.message || "Failed to send tip", "error");
    } finally {
      setSendingTip(false);
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: `${job?.title} | Meerak App`,
      text: `Check out this job: ${job?.title}. Budget: ${job?.price} THB.`,
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.log("Share cancelled");
      }
    } else {
      setShowShareModal(true);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(window.location.href);
    notify(t("detail.link_copied"), "success");
    setShowShareModal(false);
  };

  const openSocialShare = (platform: "facebook" | "twitter" | "line") => {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(
      `Check out this job: ${job?.title} on Meerak!`
    );
    let shareUrl = "";

    if (platform === "facebook")
      shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${url}`;
    if (platform === "twitter")
      shareUrl = `https://twitter.com/intent/tweet?text=${text}&url=${url}`;
    if (platform === "line")
      shareUrl = `https://social-plugins.line.me/lineit/share?url=${url}`;

    window.open(shareUrl, "_blank", "width=600,height=400");
    setShowShareModal(false);
  };

  const handleViewProof = (url: string) => {
    setHasReviewedProof(true);
    window.open(url, "_blank");
  };

  const [progressUpdateOpen, setProgressUpdateOpen] = useState(false);
  const [progressUpdatePreset, setProgressUpdatePreset] = useState<
    "on_the_way" | "arrived" | "working" | "need_more_info" | "delayed" | "done_soon" | "custom" | null
  >(null);
  const [progressUpdateNote, setProgressUpdateNote] = useState("");

  const openEmployerChatFromTools = useCallback(() => {
    setChatOverlayTab("chat");
    setChatOverlayOpen(true);
    navigate(
      { pathname: location.pathname, search: location.search, hash: "#chat" },
      { replace: true }
    );
    // #region agent log
    fetch("http://127.0.0.1:7638/ingest/0fd4d8e7-61a2-4558-83aa-540c669e45fd", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "1d8d58" },
      body: JSON.stringify({
        sessionId: "1d8d58",
        runId: "tools-open-chat",
        hypothesisId: "H_tools_link_to_chat",
        location: "JobDetails.tsx:openEmployerChatFromTools",
        message: "provider_tools_open_chat",
        data: { jobId: id || null, isAssignedProvider: !!isAssignedProvider },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [id, isAssignedProvider, location.pathname, location.search, navigate]);

  const submitProgressUpdate = useCallback(async () => {
    if (!id || !job) return;
    const note = progressUpdateNote.trim();
    const preset = progressUpdatePreset;
    const map: Record<string, string> = {
      on_the_way: "กำลังเดินทางไปหน้างาน",
      arrived: "ถึงหน้างานแล้ว",
      working: "กำลังดำเนินงาน",
      need_more_info: "ขอข้อมูลเพิ่มเติมจากผู้จ้าง",
      delayed: "อาจล่าช้าเล็กน้อย",
      done_soon: "ใกล้เสร็จแล้ว",
      custom: "อัปเดทความคืบหน้า",
    };
    const headline = preset ? map[preset] || "อัปเดทความคืบหน้า" : "อัปเดทความคืบหน้า";
    const msg = note ? `📍 ${headline}\n${note}` : `📍 ${headline}`;
    try {
      // #region agent log
      fetch("http://127.0.0.1:7638/ingest/0fd4d8e7-61a2-4558-83aa-540c669e45fd", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "1d8d58" },
        body: JSON.stringify({
          sessionId: "1d8d58",
          runId: "tools-update-progress",
          hypothesisId: "H_progress_update_to_chat",
          location: "JobDetails.tsx:submitProgressUpdate",
          message: "provider_tools_submit_progress",
          data: { jobId: id, preset: preset || null, hasNote: !!note },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      await MockApi.sendMessage(id, msg);

      let employerBellNotified = false;
      const uidLocal = user?.id || (typeof window !== "undefined" ? localStorage.getItem("meerak_user_id") : null);

      const notifyEmployerBellFallback = async () => {
        const employerKey = job.created_by ? String(job.created_by).trim() : "";
        const pname = user?.name || job.accepted_by_name || "ผู้รับงาน";
        const fallbackMsg = note ? `${headline} — ${note}` : headline;
        if (!employerKey) return false;
        await MockApi.sendNotification({
          user_id: employerKey,
          title: "📍 ผู้รับงานอัปเดทความคืบหน้า",
          message: `${pname}: ${fallbackMsg}`.slice(0, 280),
          type: "system",
          related_id: id,
        });
        return true;
      };

      if (uidLocal) {
        try {
          await api.post(`/jobs/${encodeURIComponent(id)}/notify-employer-progress`, {
            userId: uidLocal,
            headline,
            note,
          });
          employerBellNotified = true;
        } catch {
          try {
            employerBellNotified = await notifyEmployerBellFallback();
          } catch {
            employerBellNotified = false;
          }
        }
      } else {
        try {
          employerBellNotified = await notifyEmployerBellFallback();
        } catch {
          employerBellNotified = false;
        }
      }

      // #region agent log
      fetch("http://127.0.0.1:7638/ingest/0fd4d8e7-61a2-4558-83aa-540c669e45fd", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "1d8d58" },
        body: JSON.stringify({
          sessionId: "1d8d58",
          runId: "progress-employer-notify",
          hypothesisId: "H_employer_bell_on_progress",
          location: "JobDetails.tsx:submitProgressUpdate:afterNotify",
          message: "employer_progress_notification_result",
          data: { jobId: id, employerBellNotified },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion

      notify(
        employerBellNotified
          ? language === "en"
            ? "Sent in chat — your employer gets a bell notification."
            : "ส่งในแชทแล้ว — แจ้งเตือนผู้จ้างในกระดิ่งแล้ว"
          : language === "en"
            ? "Sent in chat — bell notification unavailable; employer can still read chat."
            : "ส่งในแชทแล้ว — แจ้งเตือนกระดิ่งไม่สำเร็จ ให้ผู้จ้างเปิดแชทของงาน",
        employerBellNotified ? "success" : "warning"
      );
      setProgressUpdateOpen(false);
      setProgressUpdatePreset(null);
      setProgressUpdateNote("");
      openEmployerChatFromTools();
    } catch (e: any) {
      notify(e?.message || "ส่งอัปเดทไม่สำเร็จ", "error");
    }
  }, [
    id,
    job,
    language,
    notify,
    user?.id,
    user?.name,
    openEmployerChatFromTools,
    progressUpdateNote,
    progressUpdatePreset,
  ]);

  // In-Progress Actions
  const handleUpdateProgress = () => {
    setProgressUpdateOpen(true);
    setProgressUpdatePreset("working");
    // #region agent log
    fetch("http://127.0.0.1:7638/ingest/0fd4d8e7-61a2-4558-83aa-540c669e45fd", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "1d8d58" },
      body: JSON.stringify({
        sessionId: "1d8d58",
        runId: "tools-update-progress-open",
        hypothesisId: "H_progress_update_to_chat",
        location: "JobDetails.tsx:handleUpdateProgress",
        message: "provider_tools_open_progress_modal",
        data: { jobId: id || null },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  };
  const handleUploadProof = () => fileInputRef.current?.click();
  const handleViewDetails = () =>
    notify(job?.description || "No details", "info");
  const handleReportIssue = () => openHelpCenterGateModal();

  const handleContactSupportFromDispute = useCallback(() => {
    if (!id) return;
    const prefill = `[${jobReferenceCode || id}] ${t("รายงานปัญหา")}`;
    navigate("/settings", {
      state: { openSupport: true, supportPrefill: prefill },
    });
  }, [id, jobReferenceCode, navigate, t]);

  // 💰 Phase 5: Handle Dispute Filing — Backend jobs ใช้ API, Firestore jobs ใช้ fileDispute
  const handleFileDispute = async () => {
    if (!id || !user || !job || !disputeReason.trim()) {
      notify('❌ กรุณาระบุเหตุผลในการยื่น dispute', 'error');
      return;
    }

    try {
      setFilingDispute(true);
      try {
        await MockApi.createDisputeSupportTicket(id, user.id, disputeReason, useInsuranceClaimInDispute);
      } catch (apiErr) {
        await PaymentService.fileDispute(id, user.id, disputeReason);
      }
      const hasIns = job?.has_insurance || hasInsurance;
      if (useInsuranceClaimInDispute && hasIns) {
        try {
          const base = getBackendBase();
          const token = localStorage.getItem('meerak_token') || localStorage.getItem('authToken') || '';
          const res = await fetch(`${base}/api/insurance/claim`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ job_id: id, evidence_text: disputeReason }),
          });
          const text = await res.text();
          const data = text && text.startsWith("{") ? JSON.parse(text) : {};
          if (res.ok) setInsuranceClaim({ id: data.claim_id, claim_status: 'pending', original_price: data.original_price, replacement_payout: data.replacement_payout, reserve_amount: data.reserve_amount, claimed_at: new Date().toISOString() });
        } catch (claimErr) { console.warn('Insurance claim in dispute failed:', claimErr); }
      }
      notify('✅ ยื่น Dispute สำเร็จ - ระบบจะพิจารณาภายใน 24-48 ชั่วโมง', 'success');
      setShowDisputeModal(false);
      setDisputeReason('');
      setUseInsuranceClaimInDispute(false);
    } catch (err: any) {
      console.error('❌ Error filing dispute:', err);
      notify(err.message || 'ไม่สามารถยื่น dispute ได้', 'error');
    } finally {
      setFilingDispute(false);
    }
  };

  // 💰 Phase 5: Handle Provider Withdrawal Request
  const handleRequestWithdrawal = async () => {
    if (!id || !user || !job) return;

    if (!job.payment_released) {
      notify('❌ ยังไม่สามารถถอนเงินได้ กรุณารอการอนุมัติงาน', 'error');
      return;
    }

    try {
      const kyc = await MockApi.checkKYCStatus();
      if (
        shouldRequireKycForWithdraw({
          kycStatus: kyc?.kycStatus,
          kycLevel: kyc?.kycLevel,
          needsReverify: !!kyc?.needsReverify,
        })
      ) {
        notify(
          'ยืนยันตัวตน (KYC) ครบถึงจะถอนเงินได้ — กรุณาทำ KYC ให้ครบก่อน',
          'warning',
        );
        navigate('/kyc?reason=withdraw');
        return;
      }
    } catch {
      notify('ไม่สามารถตรวจสถานะ KYC ได้ ลองใหม่อีกครั้ง', 'error');
      return;
    }

    const confirmMsg = `ยืนยันการขอถอนเงิน ${jobFeeRounded} บาท?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await PaymentService.requestWithdrawal(id, user.id);
      notify('✅ ขอถอนเงินสำเร็จ - ระบบจะโอนเงินภายใน 24 ชั่วโมง', 'success');
    } catch (err: any) {
      console.error('❌ Error requesting withdrawal:', err);
      notify(err.message || 'ไม่สามารถขอถอนเงินได้', 'error');
    }
  };

  const proofPhotosRequired = useMemo(
    () => jobRequiresProofPhotos(job),
    [job]
  );

  const hasBothProofImages =
    (!!job?.before_photo_url && !!job?.after_photo_url) ||
    (!!uploadedPhotosRef.current.before && !!uploadedPhotosRef.current.after);
  const hasProofFromChat = messages.some(
    (m) => m.sender_id === user?.id && m.type === MessageType.IMAGE
  );

  /** งาน Driver ไม่บังคับรูป — ถือว่าผ่านขั้นหลักฐานใน flow */
  const hasProof = proofPhotosRequired
    ? hasProofFromChat || hasBothProofImages
    : true;

  /** Grab-style step bar + ยุบรายละเอียดงานเมื่อกำลังดำเนินการ */
  const showFlowChrome =
    !!job &&
    (isOwner || isAssignedProvider) &&
    (job.status === JobStatus.ACCEPTED ||
      job.status === JobStatus.IN_PROGRESS ||
      job.status === JobStatus.WAITING_FOR_APPROVAL);

  const jobFlow: JobFlowState | null = useMemo(() => {
    if (!job || !showFlowChrome) return null;
    return getJobFlowState({
      role: isOwner ? "employer" : "provider",
      jobStatus: job.status,
      hasArrived: job.status === JobStatus.IN_PROGRESS && !!job.arrived_at,
      hasProof,
      waitingApproval: job.status === JobStatus.WAITING_FOR_APPROVAL,
    });
  }, [job, showFlowChrome, isOwner, hasProof]);

  const flowScrollSigRef = useRef<string>("");

  useEffect(() => {
    flowScrollSigRef.current = "";
  }, [job?.id]);

  useEffect(() => {
    if (!jobFlow || !job) return;
    const sig = `${jobFlow.role}:${jobFlow.stepKey}`;
    if (flowScrollSigRef.current === sig) return;
    flowScrollSigRef.current = sig;

    let scrollId: string | null = null;
    if (jobFlow.role === "provider") {
      switch (jobFlow.stepKey) {
        case "go":
          scrollId = "job-flow-provider-map";
          break;
        case "arrive":
          scrollId = "job-flow-provider-arrival";
          break;
        case "photo":
          scrollId = "job-flow-provider-proof";
          break;
        case "submit":
          scrollId = "job-flow-provider-submit";
          break;
        case "done":
          scrollId = "job-detail-flow-stepper";
          break;
        default:
          break;
      }
    } else {
      switch (jobFlow.stepKey) {
        case "track":
        case "work":
          scrollId = "job-flow-employer-live";
          break;
        case "review":
          scrollId =
            job.status === JobStatus.WAITING_FOR_APPROVAL
              ? "job-flow-employer-review"
              : "job-flow-employer-live";
          break;
        case "done":
          scrollId = "job-detail-flow-stepper";
          break;
        default:
          break;
      }
    }
    if (!scrollId) return;
    const t = window.setTimeout(() => {
      document.getElementById(scrollId)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);
    return () => window.clearTimeout(t);
  }, [jobFlow, job]);

  const round2 = (v: number) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
  const jobFeeRounded = job != null ? round2(job.price) : 0;

  const talentPreviewBreakdown = useMemo(() => {
    if (feeEstimates?.fee_rates) {
      return estimateMatchTalentBreakdown(jobFeeRounded, user?.vip_tier, feeEstimates.fee_rates);
    }
    return calcMatchJobTalentBreakdown(jobFeeRounded, user?.vip_tier);
  }, [jobFeeRounded, user?.vip_tier, feeEstimates]);
  const employerQuestionsPreview = useMemo(
    () => (job ? getEmployerQuestionsForProvider(job) : []),
    [job]
  );
  const preAcceptMapModel = useMemo(() => {
    if (!job || !canAcceptJob || job.status !== JobStatus.OPEN || isExpired) return null;
    const stops = getDriverTransportStops(job);
    if (isDriverCategory(job) && stops.pickup && stops.dropoff) {
      return { kind: "two" as const, pickup: stops.pickup, dropoff: stops.dropoff };
    }
    if (job.location?.lat != null && job.location?.lng != null) {
      return {
        kind: "one" as const,
        lat: Number(job.location.lat),
        lng: Number(job.location.lng),
      };
    }
    return null;
  }, [job, canAcceptJob, isExpired]);

  if (loading)
    return (
      <div className="p-8 text-center">
        {t("common.loading") || "Loading..."}
      </div>
    );
  if (!job)
    return (
      <div className="p-8 text-center">
        {t("detail.not_found") || "Job not found"}
      </div>
    );

  const locationDisplayLines = getJobLocationDisplayLines(job);
  const canShowJobChat =
    (!!job.accepted_by &&
      (isOwner || isAssignedProvider) &&
      [
        JobStatus.ACCEPTED,
        JobStatus.IN_PROGRESS,
        JobStatus.WAITING_FOR_APPROVAL,
        JobStatus.WAITING_FOR_PAYMENT,
        JobStatus.COMPLETED,
        JobStatus.DISPUTE,
        JobStatus.CANCELLED,
      ].includes(job.status)) ||
    (CHAT_BEFORE_ACCEPT &&
      canAcceptJob &&
      job.status === JobStatus.OPEN &&
      !isExpired);
  // Use job.insurance_amount only when job was PAID with insurance; otherwise compute from rate when hasInsurance ticked
  const insuranceAmount = (job?.has_insurance && job?.insurance_amount != null && Number(job.insurance_amount) > 0)
    ? round2(Number(job.insurance_amount))
    : (job && hasInsurance ? round2(jobFeeRounded * (insuranceRatePercent / 100)) : 0);
  // For Insurance Price Breakdown card: same logic — use job data only when paid; else compute from rate
  const cardInsuranceAmount = (job?.has_insurance && job?.insurance_amount != null && Number(job.insurance_amount) > 0)
    ? round2(Number(job.insurance_amount))
    : (job && (job?.has_insurance || hasInsurance) ? round2(jobFeeRounded * (insuranceRatePercent / 100)) : 0);
  // Final Price = (Job Fee + Insurance) × (1 + markup%) — sync กับ payout_config / fee-estimates
  const paymentMarkupPercent = feeEstimates?.fee_rates?.payment_markup_percent ?? 5;
  const markupRate = paymentMarkupPercent / 100;
  const totalPrice = job ? round2((jobFeeRounded + insuranceAmount) * (1 + markupRate)) : 0;
  const cardTotalPrice = job ? round2((jobFeeRounded + cardInsuranceAmount) * (1 + markupRate)) : 0;
  const canAutoPay = (user?.wallet_balance || 0) >= totalPrice;

  /** แชท/ติดต่อซ้ำ: ถ้ามีการ์ดลูกค้าในแผนที่ (โทร·แชท·ปฏิทิน) แล้ว ไม่ต้องแสดงแถบแชทสีเขียวด้านบน */
  const contactStripInProviderMap =
    isAssignedProvider &&
    !!job?.location &&
    (job.status === JobStatus.ACCEPTED || job.status === JobStatus.IN_PROGRESS);

  const flowRing = (active: boolean) =>
    showFlowChrome && active
      ? "ring-2 ring-emerald-500/35 shadow-md scroll-mt-24 transition-shadow duration-300 rounded-2xl"
      : "";

  const jobDetailsBlock =
    job ? (
      <>
        <div className="flex items-start space-x-4">
          <div className="flex-shrink-0">
            <img
              src={
                job.created_by_avatar ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(
                  job.created_by_name || "U"
                )}`
              }
              alt="User"
              className="w-12 h-12 rounded-full border-2 border-white shadow-sm"
            />
          </div>
          <div>
            <p className="text-sm text-slate-600">{t("detail.posted_by")}</p>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-slate-900 m-0">
                {job.created_by_name || t("detail.unverified")}
              </p>
              {showJobBaBadge(employerBa) && (
                <BrandAdviserBadge
                  isBrandAdviser
                  adviserStatus={employerBa?.adviser_status}
                  tone="light"
                />
              )}
            </div>
            <div className="flex items-center text-emerald-600 text-xs mt-1">
              <Shield size={12} className="mr-1" /> {t("detail.kyc")}
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">
            {t("create.desc")}
          </h3>
          <p className="text-description text-gray-700 leading-relaxed">{job.description}</p>
        </div>

        <div className="job-detail-info-cards grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="job-detail-info-card info-box-item p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center text-gray-500 mb-1">
              <Clock size={16} className="mr-2" />
              <span className="text-xs font-medium uppercase">
                {t("detail.time")}
              </span>
            </div>
            <p className="text-gray-900 font-medium leading-snug">
              {new Date(job.datetime).toLocaleString(
                language === "th" ? "th-TH" : "en-US",
                {
                  dateStyle: "medium",
                  timeStyle: "short",
                }
              )}
            </p>
            {job.duration_hours && (
              <p className="text-xs text-gray-500 mt-1">
                Duration: {job.duration_hours} hrs
              </p>
            )}
          </div>
          <div
            className={`job-detail-info-card info-box-item p-4 bg-gray-50 rounded-lg ${
              locationDisplayLines.isTransportRoute ? "sm:col-span-2" : ""
            }`}
          >
            <div className="flex items-center text-gray-500 mb-1">
              <MapPin size={16} className="mr-2" />
              <span className="text-xs font-medium uppercase">
                {t("detail.loc")}
              </span>
            </div>
            {locationDisplayLines.isTransportRoute ? (
              <div className="space-y-2 text-sm text-gray-900">
                <p className="flex gap-2">
                  <span className="text-red-500 shrink-0" aria-hidden>
                    ●
                  </span>
                  <span>{locationDisplayLines.line1}</span>
                </p>
                <p className="flex gap-2">
                  <span className="text-emerald-600 shrink-0" aria-hidden>
                    ●
                  </span>
                  <span>{locationDisplayLines.line2}</span>
                </p>
              </div>
            ) : (
              <p className="text-gray-900 font-medium leading-relaxed">
                {formatJobPrimaryAddress(job) ||
                  t("detail.loc_unknown") ||
                  "—"}
              </p>
            )}
          </div>
        </div>
      </>
    ) : null;

  const otherAvatar = isOwner
    ? (job as any).provider_profile?.avatar_url ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(
        job.accepted_by_name || "Provider"
      )}&background=pink&color=fff`
    : isAssignedProvider
    ? job.created_by_avatar ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(
        job.created_by_name || "User"
      )}&background=pink&color=fff`
    : `https://ui-avatars.com/api/?name=User&background=pink&color=fff`;
  // 1. เอาไปวางไว้ใต้ useState ทั้งหมด แต่ก่อน return JSX

  // Phase 3: Luxury UI — CSS variables for theming (Glassmorphism, high contrast, typography)
  const luxuryVars = {
    '--luxury-glass': 'rgba(255,255,255,0.72)',
    '--luxury-glass-border': 'rgba(255,255,255,0.9)',
    '--luxury-text': '#0f172a',
    '--luxury-text-muted': '#475569',
    '--luxury-accent': '#059669',
  } as React.CSSProperties;

  return (
    <>
      {cameraHelpOpen && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-base font-bold text-slate-900">เปิดกล้องไม่ได้</div>
                <div className="mt-1 text-xs leading-relaxed text-slate-600">
                  ถ้ายังไม่อนุญาตสิทธิ์กล้อง ให้เปิดสิทธิ์กล้องของเบราว์เซอร์ แล้วกลับมาถ่ายรูปอีกครั้ง
                </div>
              </div>
              <button
                type="button"
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                onClick={() => setCameraHelpOpen(null)}
                aria-label={t("chat_close")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
              <div className="font-semibold text-slate-800">ทำตามนี้</div>
              <ol className="mt-1 list-decimal pl-5 space-y-1">
                <li>ตรวจสอบว่าเปิดผ่าน HTTPS (ยกเว้น localhost)</li>
                <li>อนุญาตสิทธิ์กล้องให้เว็บนี้ในตั้งค่าเบราว์เซอร์</li>
                <li>กลับมากด “ถ่ายจากกล้อง” อีกครั้ง</li>
              </ol>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700"
                onClick={() => {
                  const k = cameraHelpOpen;
                  setCameraHelpOpen(null);
                  if (k === "before") void captureProofBeforeDraft();
                  else void handleCaptureProofAfter();
                }}
              >
                ลองขอสิทธิ์อีกครั้ง
              </button>

              <button
                type="button"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                onClick={() => {
                  const ua = String(navigator?.userAgent || "").toLowerCase();
                  const isAndroid = ua.includes("android");
                  const isChrome = ua.includes("chrome") || ua.includes("crios");
                  // Android Chrome รองรับ deep-link ไปหน้าตั้งค่ากล้องได้บางกรณี
                  const target = isAndroid && isChrome ? "chrome://settings/content/camera" : "https://support.google.com/chrome/answer/2693767";
                  window.open(target, "_blank", "noopener,noreferrer");
                }}
              >
                ไปที่ตั้งค่ากล้อง
              </button>
            </div>
          </div>
        </div>
      )}
    <VipThemeWrapper vip_tier={user?.vip_tier}>
      <div
        className="min-h-screen antialiased font-sans selection:bg-emerald-500/20 text-slate-900"
        style={luxuryVars}
      >
        {/* Glassmorphism background + high contrast (Platinum: overridden by .vip-theme-platinum .job-detail-page in CSS) */}
        <div className="job-detail-page job-detail-container min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100/90 bg-[length:100%_100%] scroll-mt-20">
          <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 pb-24 md:pb-10 scroll-mt-20">
    <div className="grid grid-cols-1 gap-6 relative">
      <BackendBannersSection
        variant="compact"
        placement="job_detail"
        jobCategory={job?.category}
        className="col-span-full"
      />
      {/* Share Modal */}
      {showShareModal && (
        <div
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in"
          onClick={() => setShowShareModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-in slide-in-from-bottom-10 sm:zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">
                {t("detail.share_via")}
              </h3>
              <button onClick={() => setShowShareModal(false)}>
                <XCircle className="text-gray-400" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-4 mb-4">
              <button
                onClick={() => openSocialShare("facebook")}
                className="flex flex-col items-center gap-2"
              >
                <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center">
                  <Facebook size={24} />
                </div>
                <span className="text-xs font-medium text-gray-600">
                  Facebook
                </span>
              </button>
              <button
                onClick={() => openSocialShare("line")}
                className="flex flex-col items-center gap-2"
              >
                <div className="w-12 h-12 bg-[#00C300] text-white rounded-full flex items-center justify-center">
                  <MessageCircle size={24} />
                </div>
                <span className="text-xs font-medium text-gray-600">LINE</span>
              </button>
              <button
                onClick={() => openSocialShare("twitter")}
                className="flex flex-col items-center gap-2"
              >
                <div className="w-12 h-12 bg-sky-500 text-white rounded-full flex items-center justify-center">
                  <Twitter size={24} />
                </div>
                <span className="text-xs font-medium text-gray-600">
                  Twitter
                </span>
              </button>
              <button
                onClick={copyToClipboard}
                className="flex flex-col items-center gap-2"
              >
                <div className="w-12 h-12 bg-gray-100 text-gray-600 rounded-full flex items-center justify-center">
                  <Copy size={24} />
                </div>
                <span className="text-xs font-medium text-gray-600">Copy</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* แจ้งปัญหา — bottom sheet ยืนยันก่อนเข้าศูนย์ช่วยเหลือ (แบบ Lineman) */}
      {showHelpCenterGateModal && (
        <div className="fixed inset-0 z-[61] flex flex-col justify-end sm:items-center sm:justify-center sm:p-4 animate-in fade-in duration-200">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            aria-label={t("detail.chat_close")}
            onClick={() => setShowHelpCenterGateModal(false)}
          />
          <div
            className="relative z-10 w-full max-w-lg animate-in slide-in-from-bottom rounded-t-[24px] bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_40px_rgba(0,0,0,0.14)] duration-300 sm:rounded-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-gate-title"
          >
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                onClick={() => setShowHelpCenterGateModal(false)}
                aria-label={t("detail.chat_close")}
              >
                <X size={22} />
              </button>
            </div>
            <h3
              id="help-gate-title"
              className="mb-1 px-2 text-center text-lg font-bold text-slate-900"
            >
              {t("detail.help_contact_sheet_title")}
            </h3>
            <p className="mb-5 px-2 text-center text-sm text-slate-500">
              {t("detail.help_contact_sheet_sub")}
            </p>
            <button
              type="button"
              onClick={() => {
                setShowHelpCenterGateModal(false);
                openHelpCenterOverlay();
              }}
              className="mb-2 w-full rounded-2xl bg-pink-500 py-3.5 text-center text-base font-bold text-white shadow-lg shadow-pink-200 transition-colors hover:bg-pink-600"
            >
              {t("detail.help_contact_primary")}
            </button>
            <button
              type="button"
              onClick={() => setShowHelpCenterGateModal(false)}
              className="mb-4 w-full rounded-2xl bg-slate-100 py-3.5 text-center text-base font-semibold text-slate-800 transition-colors hover:bg-slate-200"
            >
              {t("detail.help_contact_back")}
            </button>
            <p className="text-center text-[11px] leading-relaxed text-slate-500">
              {t("detail.help_contact_footer")}
            </p>
          </div>
        </div>
      )}

      {/* Tip Modal — bottom sheet สไตล์ Lineman + ธีมชมพู Meerak */}
      {showTipModal && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end sm:items-center sm:justify-center sm:p-4 animate-in fade-in duration-200">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            aria-label={t("chat_close")}
            onClick={() => {
              setShowTipModal(false);
              setTipAmount("");
              setTipPresetSelected(null);
            }}
          />
          <div
            className="relative z-10 flex max-h-[min(90vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] bg-white shadow-[0_-8px_40px_rgba(0,0,0,0.14)] animate-in slide-in-from-bottom duration-300 sm:rounded-3xl sm:shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tip-sheet-title"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-5 pb-3 pt-5">
              <div className="min-w-0 pr-2">
                <div className="mb-1 flex items-center gap-2">
                  <Heart className="h-5 w-5 shrink-0 fill-pink-500 text-pink-500" aria-hidden />
                  <h3 id="tip-sheet-title" className="text-lg font-bold leading-tight text-gray-900">
                    {t("detail.tip_modal_title")}
                  </h3>
                </div>
                <p className="text-sm leading-snug text-gray-500">
                  {t("detail.tip_modal_subtitle")}
                </p>
              </div>
              <button
                type="button"
                className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100"
                onClick={() => {
                  setShowTipModal(false);
                  setTipAmount("");
                  setTipPresetSelected(null);
                }}
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form
              onSubmit={handleSendTip}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-2 pt-4">
                <div className="rounded-2xl border border-pink-200 bg-gradient-to-br from-pink-50 to-white px-4 py-3.5">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-pink-600">
                    {t("detail.tip_wallet_balance_label")}
                  </div>
                  <div className="text-xl font-bold tabular-nums text-pink-900">
                    {(user?.wallet_balance ?? 0).toLocaleString()} THB
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {TIP_PRESET_AMOUNTS.map((amt) => {
                    const selected = tipPresetSelected === amt;
                    return (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => {
                          setTipPresetSelected(amt);
                          setTipAmount(String(amt));
                        }}
                        className={`rounded-2xl py-3.5 text-center text-base font-semibold transition-all ${
                          selected
                            ? "bg-pink-500 text-white shadow-md shadow-pink-200"
                            : "border border-gray-200 bg-gray-50 text-gray-900 hover:border-pink-200 hover:bg-pink-50/60"
                        }`}
                      >
                        ฿{amt}
                      </button>
                    );
                  })}
                </div>

                <div>
                  <label
                    htmlFor="tip-custom-amount"
                    className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500"
                  >
                    {t("detail.tip_custom_label")}
                  </label>
                  <div className="flex items-center border-b-2 border-pink-200 pb-1.5 transition-colors focus-within:border-pink-500">
                    <span className="select-none pr-2 text-xl font-bold text-pink-500" aria-hidden>
                      ฿
                    </span>
                    <input
                      id="tip-custom-amount"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder={t("detail.tip_placeholder")}
                      className="min-w-0 flex-1 border-0 bg-transparent text-lg font-semibold text-gray-900 outline-none placeholder:text-gray-400"
                      value={tipAmount}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^\d]/g, "");
                        setTipPresetSelected(null);
                        setTipAmount(v);
                      }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-gray-500">{t("detail.tip_max_hint")}</p>
                </div>

                <div>
                  <div className="mb-2 text-sm font-bold text-gray-900">
                    {t("detail.tip_payment_method")}
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pink-100">
                        <Wallet className="text-pink-600" size={20} />
                      </div>
                      <span className="truncate font-medium text-gray-900">
                        {t("detail.tip_pay_from_wallet")}
                      </span>
                    </div>
                    <ChevronRight className="shrink-0 text-gray-300" size={20} aria-hidden />
                  </div>
                </div>
              </div>

              <div className="shrink-0 border-t border-gray-100 bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
                {(() => {
                  const parsed = Number(tipAmount);
                  const wallet = user?.wallet_balance ?? 0;
                  const tipOk =
                    tipAmount !== "" &&
                    Number.isFinite(parsed) &&
                    parsed >= 10 &&
                    parsed <= TIP_MAX_AMOUNT &&
                    parsed <= wallet;
                  return (
                    <button
                      type="submit"
                      disabled={sendingTip || !tipOk}
                      className="flex w-full items-center justify-center rounded-2xl py-3.5 text-base font-bold text-white transition-colors disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-white enabled:bg-pink-500 enabled:shadow-lg enabled:shadow-pink-200 enabled:hover:bg-pink-600"
                    >
                      {sendingTip ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          กำลังโอนเงิน...
                        </>
                      ) : (
                        t("detail.tip_confirm")
                      )}
                    </button>
                  );
                })()}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Intercity — แจ้งค่าธรรมเนียมยกเลิกก่อนนับถอยหลัง */}
      {showIntercityCancelFeeModal && pendingIntercityCancelFee && (
        <div className="fixed inset-0 z-[61] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95">
            <h3 className="text-lg font-bold text-amber-900 mb-2 flex items-center gap-2">
              <AlertTriangle className="text-amber-500" size={22} />
              ยืนยันยกเลิกงาน
            </h3>
            <p className="text-sm text-slate-700 leading-relaxed mb-4">
              การยกเลิกงานนี้จะมีค่าธรรมเนียม{" "}
              <span className="font-mono font-bold text-amber-900">
                {Number(pendingIntercityCancelFee.totalFeeThb || 0).toLocaleString()}
              </span>{" "}
              บาท เนื่องจากคนขับเตรียมออกเดินทางแล้ว ยืนยันหรือไม่?
            </p>
            {pendingIntercityCancelFee.reason ? (
              <p className="text-xs text-slate-500 mb-4">({pendingIntercityCancelFee.reason})</p>
            ) : null}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowIntercityCancelFeeModal(false);
                  setPendingIntercityCancelFee(null);
                }}
                className="flex-1 py-3 border border-slate-300 text-slate-800 font-bold rounded-xl hover:bg-slate-50"
              >
                ไม่ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowIntercityCancelFeeModal(false);
                  setCancelSeconds(10);
                  setShowCancelModal(true);
                }}
                className="flex-1 py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl"
              >
                ยืนยัน
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Countdown Modal */}
      {showCompletionExtrasModal && isAssignedProvider && job && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-in zoom-in-95 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-2 mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{t("detail.completion_extras_title")}</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{t("detail.completion_extras_sub")}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCompletionExtrasModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100"
                aria-label="Close"
              >
                <X size={22} className="text-slate-500" />
              </button>
            </div>
            <div className="space-y-3">
              {(
                [
                  { key: "meter", label: t("detail.completion_meter"), val: completionMeter, set: setCompletionMeter },
                  { key: "toll", label: t("detail.completion_toll"), val: completionToll, set: setCompletionToll },
                  { key: "park", label: t("detail.completion_parking"), val: completionParking, set: setCompletionParking },
                  { key: "other", label: t("detail.completion_other"), val: completionOther, set: setCompletionOther },
                ] as const
              ).map((row) => (
                <div key={row.key}>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{row.label}</label>
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <span className="text-slate-500 text-sm">฿</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      value={row.val}
                      onChange={(e) => row.set(e.target.value.replace(/[^\d.,]/g, ""))}
                      className="flex-1 min-w-0 bg-transparent text-slate-900 font-semibold tabular-nums outline-none"
                    />
                  </div>
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">{t("detail.completion_note")}</label>
                <textarea
                  value={completionExtrasNote}
                  onChange={(e) => setCompletionExtrasNote(e.target.value.slice(0, 500))}
                  rows={2}
                  placeholder={t("detail.completion_note_ph")}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400"
                />
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setPendingCompletionExtras(undefined);
                  setShowCompletionExtrasModal(false);
                  setShowCompletionSummaryModal(true);
                }}
                className="w-full py-3 rounded-xl border-2 border-slate-200 text-slate-800 font-semibold hover:bg-slate-50"
              >
                {t("detail.completion_skip_extras")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingCompletionExtras(buildExtrasFromInputs());
                  setShowCompletionExtrasModal(false);
                  setShowCompletionSummaryModal(true);
                }}
                className="w-full py-3 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 shadow-md"
              >
                {t("detail.completion_next_summary")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCompletionSummaryModal && isAssignedProvider && job && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-in zoom-in-95 p-5 sm:p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-1">{t("detail.completion_summary_title")}</h3>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">{t("detail.completion_summary_sub")}</p>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 space-y-2 text-sm mb-4">
              <div className="flex justify-between gap-3">
                <span className="text-slate-600">{t("detail.job_fee")}</span>
                <span className="font-semibold tabular-nums">฿{jobFeeRounded.toLocaleString()}</span>
              </div>
              {pendingCompletionExtras ? (
                <>
                  {(pendingCompletionExtras.meter_thb || 0) > 0 && (
                    <div className="flex justify-between gap-3 text-xs">
                      <span className="text-slate-500">{t("detail.completion_meter")}</span>
                      <span className="tabular-nums">+฿{(pendingCompletionExtras.meter_thb || 0).toLocaleString()}</span>
                    </div>
                  )}
                  {(pendingCompletionExtras.toll_thb || 0) > 0 && (
                    <div className="flex justify-between gap-3 text-xs">
                      <span className="text-slate-500">{t("detail.completion_toll")}</span>
                      <span className="tabular-nums">+฿{(pendingCompletionExtras.toll_thb || 0).toLocaleString()}</span>
                    </div>
                  )}
                  {(pendingCompletionExtras.parking_thb || 0) > 0 && (
                    <div className="flex justify-between gap-3 text-xs">
                      <span className="text-slate-500">{t("detail.completion_parking")}</span>
                      <span className="tabular-nums">+฿{(pendingCompletionExtras.parking_thb || 0).toLocaleString()}</span>
                    </div>
                  )}
                  {(pendingCompletionExtras.other_thb || 0) > 0 && (
                    <div className="flex justify-between gap-3 text-xs">
                      <span className="text-slate-500">{t("detail.completion_other")}</span>
                      <span className="tabular-nums">+฿{(pendingCompletionExtras.other_thb || 0).toLocaleString()}</span>
                    </div>
                  )}
                  {pendingCompletionExtras.note ? (
                    <p className="text-xs text-slate-600 pt-1 border-t border-slate-200">{pendingCompletionExtras.note}</p>
                  ) : null}
                </>
              ) : (
                <p className="text-xs text-slate-500">{t("detail.completion_no_extras")}</p>
              )}
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5 mb-4">
              <p className="text-[11px] font-semibold text-amber-900 uppercase tracking-wide">{t("payment.method")}</p>
              <p className="text-sm font-bold text-amber-950 mt-0.5">
                {getJobPaymentBadgeVariant(job)?.variant === "cash"
                  ? t("detail.payment_badge_cash")
                  : getJobPaymentBadgeVariant(job)?.variant === "wallet"
                  ? t("detail.payment_badge_wallet")
                  : t("detail.payment_badge_online")}
              </p>
              <p className="text-xs text-amber-900/90 mt-2 leading-relaxed">{t("detail.completion_collect_hint")}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowCompletionSummaryModal(false);
                  setShowCompletionExtrasModal(true);
                }}
                className="flex-1 py-3 rounded-xl border border-slate-200 font-semibold text-slate-800 hover:bg-slate-50"
              >
                {t("detail.completion_back")}
              </button>
              <button
                type="button"
                onClick={() => void runSubmitWorkWithExtras(pendingCompletionExtras)}
                disabled={submittingWork || gpsVerifying}
                className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-50"
              >
                {submittingWork || gpsVerifying ? (
                  <Loader2 className="inline animate-spin" size={18} />
                ) : (
                  t("detail.completion_confirm_submit")
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCancelModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 text-center p-8">
            <div className="w-20 h-20 rounded-full border-4 border-red-500 flex items-center justify-center mx-auto mb-6">
              <span className="text-4xl font-bold text-red-600">
                {cancelSeconds}
              </span>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              {t("detail.cancelling_title")}
            </h3>
            <p className="text-gray-500 mb-6">
              {t("detail.cancelling_desc")} {cancelSeconds}s
            </p>
            <button
              onClick={() => {
                setShowCancelModal(false);
                setPendingIntercityCancelFee(null);
              }}
              className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl transition-colors"
            >
              {t("detail.keep_job")}
            </button>
          </div>
        </div>
      )}

      {/* Dispute Modal */}
      {showDisputeModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900 flex items-center">
                <AlertOctagon className="text-red-500 mr-2" />{" "}
                {t("detail.report")}
              </h3>
              <button onClick={() => setShowDisputeModal(false)}>
                <XCircle className="text-gray-400" />
              </button>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              {(
                [
                  "detail.report_preset_late",
                  "detail.report_preset_quality",
                  "detail.report_preset_payment",
                  "detail.report_preset_safety",
                ] as const
              ).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    setDisputeReason((prev) => {
                      const line = t(key);
                      if (!line || line === key) return prev;
                      return prev?.trim()
                        ? `${prev.trim()}\n• ${line}`
                        : `• ${line}`;
                    })
                  }
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-white"
                >
                  {t(key)}
                </button>
              ))}
            </div>
            <textarea
              className="w-full p-3 border border-gray-300 rounded-lg text-sm mb-4 focus:ring-2 focus:ring-red-500 outline-none"
              rows={4}
              placeholder={t("detail.dispute_placeholder")}
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
            />
            {(job?.has_insurance || hasInsurance) && isOwner && (
              <>
                {useInsuranceClaimInDispute && (
                  <div className="mb-4 p-3 bg-slate-100 border border-slate-300 rounded-lg text-[11px] text-slate-700">
                    <p className="font-semibold text-slate-800">📋 นโยบายความมั่นคงของแพลตฟอร์ม</p>
                    <p>According to the Platform Stability Policy, 60% of the guarantee fund is reserved for network security and liquidity maintenance. Only 40% is eligible for immediate disbursement.</p>
                  </div>
                )}
                <label className="flex items-center gap-4 p-4 mb-4 rounded-xl border-2 border-amber-300/90 bg-gradient-to-br from-amber-50 via-yellow-50/70 to-amber-50 cursor-pointer select-none hover:from-amber-100/90 hover:to-amber-100/70 transition-all duration-200 shadow-lg shadow-amber-300/25 hover:shadow-xl hover:shadow-amber-400/30 ring-1 ring-amber-200/60">
                  <div className="flex-shrink-0 flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 shadow-lg shadow-amber-500/40 ring-2 ring-amber-400/50">
                    <Shield size={30} className="text-yellow-500 drop-shadow-md" strokeWidth={2.5} fill="currentColor" />
                  </div>
                  <input
                    type="checkbox"
                    checked={useInsuranceClaimInDispute}
                    onChange={(e) => setUseInsuranceClaimInDispute(e.target.checked)}
                    className="sr-only"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold text-amber-900 tracking-tight">
                      ใช้สิทธิประกันที่ตนได้ซื้อไว้
                    </p>
                    <p className="text-xs text-amber-800/80 mt-0.5 font-medium">
                      Premium Protect — มีใบการันตีรองรับ (40% เบิกจ่ายได้ทันที)
                    </p>
                  </div>
                  <div className={`flex-shrink-0 w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all ${useInsuranceClaimInDispute ? 'border-amber-600 bg-amber-500 text-white shadow-inner' : 'border-amber-400 bg-white'}`}>
                    {useInsuranceClaimInDispute && <span className="font-bold">✓</span>}
                  </div>
                </label>
              </>
            )}
            <button
              onClick={handleDisputeModalSubmit}
              disabled={submittingDispute || !disputeReason.trim()}
              className="w-full py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center"
            >
              {submittingDispute ? (
                <Loader2 className="animate-spin" />
              ) : (
                t("detail.report")
              )}
            </button>
          </div>
        </div>
      )}

      {/* Collision Conflict Modal — Power to the User: 24hr ban warning */}
      {showConflictModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-amber-800 flex items-center">
                <AlertTriangle className="text-amber-500 mr-2" /> งานทับซ้อน
              </h3>
              <button onClick={() => setShowConflictModal(false)}>
                <XCircle className="text-gray-400" />
              </button>
            </div>
            <p className="text-gray-700 text-sm mb-4">
              คุณมีงานที่ทับซ้อนกับช่วงเวลานี้ หากดำเนินการต่อจะถูก Lock บัญชี 24 ชั่วโมง
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConflictModal(false)}
                className="flex-1 py-3 border border-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleAcceptJobForceConflict}
                disabled={acceptingWithConflict}
                className="flex-1 py-3 bg-amber-600 text-white font-bold rounded-lg hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center"
              >
                {acceptingWithConflict ? <Loader2 className="animate-spin" size={20} /> : "รับงานต่อ (Lock 24 ชม.)"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Intercity charter — counter-offer modal (driver) */}
      {showCounterOfferModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-amber-900 flex items-center gap-2">
                <DollarSign className="text-amber-600" size={22} />
                เสนอราคาใหม่ (ค่าจ้างก่อนค่าบริการ)
              </h3>
              <button
                type="button"
                onClick={() => setShowCounterOfferModal(false)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                <X size={22} />
              </button>
            </div>
            <p className="text-sm text-slate-600 mb-3">
              ระบุค่าจ้างที่ต้องการ (บาท) ต้องไม่ต่ำกว่า{" "}
              <span className="font-mono font-semibold">
                {intercityBidFloor?.min_job_fee_thb != null
                  ? `฿${intercityBidFloor.min_job_fee_thb.toLocaleString()}`
                  : "ราคาพื้น"}
              </span>{" "}
              — ยอดที่ผู้จ้างจ่ายจะรวมค่าบริการแพลตฟอร์มตามที่กำหนด
            </p>
            <input
              type="number"
              inputMode="decimal"
              min={intercityBidFloor?.min_job_fee_thb ?? 0}
              step="1"
              value={counterOfferAmount}
              onChange={(e) => setCounterOfferAmount(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-4 py-3 text-lg font-mono mb-4 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              placeholder="เช่น 3500"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowCounterOfferModal(false)}
                className="flex-1 py-3 border border-slate-300 text-slate-700 font-bold rounded-xl hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => void handleSubmitCounterOffer()}
                disabled={submittingBid}
                className="flex-1 py-3 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submittingBid ? <Loader2 className="animate-spin" size={20} /> : "ส่งข้อเสนอ"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🛡️ Insurance Claim Modal */}
      {showClaimModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
            <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-5 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield size={22} />
                  <h3 className="text-lg font-bold">ยื่นเคลมประกัน</h3>
                </div>
                <button onClick={() => setShowClaimModal(false)} className="text-amber-200 hover:text-white">
                  <X size={20} />
                </button>
              </div>
              <p className="text-amber-100 text-xs mt-1">การเคลมจะได้รับการพิจารณาภายใน 24–48 ชั่วโมง</p>
            </div>

            <div className="p-6 space-y-4">
              {/* Platform Stability Policy Disclaimer (Mandatory) */}
              <div className="bg-slate-100 border border-slate-300 rounded-xl p-4 text-xs text-slate-700 leading-relaxed">
                <p className="font-bold text-slate-800 mb-1">📋 นโยบายความมั่นคงของแพลตฟอร์ม</p>
                <p>
                  According to the Platform Stability Policy, 60% of the guarantee fund is reserved for network security and liquidity maintenance. Only 40% is eligible for immediate disbursement.
                </p>
                <p className="mt-1 text-slate-600">
                  ตามนโยบายความมั่นคงของแพลตฟอร์ม 60% ของกองทุนการันตีถูกสำรองไว้เพื่อความปลอดภัยของเครือข่ายและการรักษาสภาพคล่อง มีเพียง 40% ที่สามารถเบิกจ่ายได้ทันที
                </p>
              </div>
              {/* 40% Rule Info */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 space-y-2">
                <p className="font-bold flex items-center gap-1"><Shield size={14} /> วงเงินคุ้มครอง</p>
                <div className="flex justify-between text-xs">
                  <span>วงเงินประกัน</span>
                  <span className="font-semibold">฿{(job ? Math.round(parseFloat(String(job.insurance_amount || job.price)) || 0) : 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>ค่าจ้างผู้รับงานใหม่ (40%)</span>
                  <span className="font-bold text-amber-700">
                    ฿{(job ? Math.round((parseFloat(String(job.insurance_amount || job.price)) || 0) * 0.4) : 0).toLocaleString()}
                  </span>
                </div>
                <div className="border-t border-amber-200 pt-2 text-[11px] text-amber-600 leading-relaxed">
                  ⚠️ การเคลมประกันคุ้มครองสูงสุดไม่เกินวงเงินประกัน และครอบคลุมการจัดหาผู้รับงานใหม่ในวงเงิน 40% ของวงเงินประกัน สิทธิ์เคลมได้เพียง 1 ครั้งต่องาน
                </div>
              </div>

              {/* Evidence Text */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  อธิบายเหตุการณ์ที่เกิดขึ้น <span className="text-red-500">*</span>
                </label>
                <textarea
                  className="w-full border border-slate-300 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                  rows={4}
                  placeholder="เช่น ผู้รับงานไม่มาทำงาน / งานไม่เสร็จตามที่ตกลง / เกิดเหตุฉุกเฉินระหว่างงาน..."
                  value={claimEvidenceText}
                  onChange={(e) => setClaimEvidenceText(e.target.value)}
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowClaimModal(false)}
                  className="flex-1 py-2.5 border border-slate-300 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-colors text-sm"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleSubmitInsuranceClaim}
                  disabled={submittingClaim || !claimEvidenceText.trim()}
                  className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition-colors text-sm disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  {submittingClaim ? <Loader2 size={16} className="animate-spin" /> : <Shield size={16} />}
                  {submittingClaim ? 'กำลังส่ง...' : 'ยืนยันเคลม'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Review Modal - แบบสมบูรณ์ */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 relative">
            <button
              type="button"
              onClick={() => setShowReviewModal(false)}
              className="absolute right-3 top-3 z-10 rounded-full p-2 text-white/90 hover:bg-white/15"
              aria-label={t("detail.chat_close")}
            >
              <X size={22} />
            </button>
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-500 to-green-500 p-6 text-center text-white">
              <div className="mx-auto w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-4">
                <Star
                  size={32}
                  className="text-yellow-300"
                  fill="currentColor"
                />
              </div>
              <h3 className="text-xl font-bold">รีวิวผู้รับงาน</h3>
              <p className="text-emerald-100 text-sm mt-1">
                ช่วยให้คะแนนและรีวิว {job?.accepted_by_name || "ผู้รับงาน"}
              </p>
            </div>

            {/* Content */}
            <div className="p-6">
              {/* Star Rating */}
              <div className="flex justify-center space-x-1 mb-6">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setReviewRating(star)}
                    className="transition-transform hover:scale-125 focus:outline-none"
                  >
                    <Star
                      size={40}
                      fill={star <= reviewRating ? "#FBBF24" : "none"}
                      className={
                        star <= reviewRating
                          ? "text-yellow-400"
                          : "text-gray-300"
                      }
                    />
                  </button>
                ))}
              </div>

              {/* Rating Text */}
              <div className="text-center mb-6">
                <p className="text-lg font-bold text-gray-800">
                  {reviewRating === 5
                    ? "ยอดเยี่ยมมาก! ⭐⭐⭐⭐⭐"
                    : reviewRating === 4
                    ? "ดีมาก! ⭐⭐⭐⭐"
                    : reviewRating === 3
                    ? "ดี ⭐⭐⭐"
                    : reviewRating === 2
                    ? "พอใช้ ⭐⭐"
                    : reviewRating === 1
                    ? "ต้องปรับปรุง ⭐"
                    : "ให้ดาวเลย!"}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {reviewRating > 0
                    ? "ขอบคุณสำหรับการให้คะแนน!"
                    : "เลือกระดับดาว"}
                </p>
              </div>

              {/* Tags */}
              <div className="mb-6">
                <p className="text-sm font-bold text-gray-700 mb-3 text-center">
                  เลือกข้อดีของผู้รับงาน (เลือกได้หลายข้อ)
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {[
                    {
                      key: "professional",
                      label: "🧑‍💼 เป็นมืออาชีพ",
                      icon: "briefcase",
                    },
                    { key: "punctual", label: "⏰ ตรงเวลา", icon: "clock" },
                    { key: "friendly", label: "😊 นิสัยดี", icon: "smile" },
                    { key: "quality", label: "✨ งานคุณภาพ", icon: "award" },
                    {
                      key: "communicate",
                      label: "💬 ติดต่อดี",
                      icon: "message-circle",
                    },
                    {
                      key: "clean",
                      label: "🧹 สะอาดเรียบร้อย",
                      icon: "sparkles",
                    },
                  ].map((tag) => (
                    <button
                      key={tag.key}
                      onClick={() => {
                        const newTag = tag.label;
                        if (reviewTags.includes(newTag)) {
                          setReviewTags((prev) =>
                            prev.filter((t) => t !== newTag)
                          );
                        } else {
                          setReviewTags((prev) => [...prev, newTag]);
                        }
                      }}
                      className={`px-4 py-2 rounded-full text-xs font-medium border transition-all flex items-center ${
                        reviewTags.includes(tag.label)
                          ? "bg-emerald-100 text-emerald-700 border-emerald-200 shadow-sm scale-105"
                          : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      {reviewTags.includes(tag.label) && (
                        <CheckCircle
                          size={12}
                          className="mr-1 text-emerald-600"
                        />
                      )}
                      {tag.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Comment */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ความคิดเห็นเพิ่มเติม (ถ้ามี)
                </label>
                <textarea
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="บอกเล่าประสบการณ์ในการใช้บริการ..."
                  rows={3}
                  className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">
                  ความคิดเห็นของคุณจะช่วยให้ผู้รับงานพัฒนาตนเอง
                </p>
              </div>

              <p className="text-xs text-slate-500 mb-3 text-center">
                {t("detail.review_encourage")}
              </p>
              <div className="flex">
                <button
                  onClick={handleSubmitReview}
                  disabled={submittingReview || reviewRating === 0}
                  className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-green-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-200 hover:from-emerald-600 hover:to-green-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submittingReview ? (
                    <>
                      <Loader2 className="animate-spin" size={18} />
                      กำลังส่งรีวิว...
                    </>
                  ) : (
                    "ส่งรีวิว"
                  )}
                </button>
              </div>

              {/* Tips — แสดงหลังส่งรีวิวสำเร็จ (handleSubmitReview จะเปิด tip modal ให้อัตโนมัติ) */}
              <p className="mt-4 text-center text-xs text-slate-500">
                <Heart className="inline mr-1" size={12} />
                หลังส่งรีวิวแล้ว สามารถส่งทิปให้ผู้รับงานได้
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Job Info — เต็มความกว้าง ไม่แบ่งคอลัมน์กับแชท (แชทเปิดเต็มจอแยก) */}
      <div className="w-full max-w-4xl mx-auto space-y-6">
        <div className="job-detail-main-card job-main-card bg-white/95 backdrop-blur-2xl rounded-2xl shadow-2xl shadow-slate-300/40 border border-slate-200/60 overflow-hidden ring-1 ring-slate-200/50">
          <div
            className={`job-detail-header p-6 sm:p-8 border-b border-white/20 text-white ${
              job.status === JobStatus.CANCELLED
                ? "bg-gray-600/95"
                : job.status === JobStatus.DISPUTE
                ? "bg-red-700/95"
                : "bg-gradient-to-br from-emerald-700 to-emerald-900"
            }`}
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span
                    className={`badge-category inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider opacity-95 ${
                      job.status === JobStatus.CANCELLED
                        ? "bg-gray-700"
                        : job.status === JobStatus.DISPUTE
                        ? "bg-red-900"
                        : "bg-emerald-900/50"
                    }`}
                  >
                    {t(`cat.${job.category}`) || job.category}
                  </span>
                  {transportHubJobKind ? (
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-xs font-bold tracking-wide border border-white/25 ${
                        transportHubJobKind === "intercity_charter"
                          ? "bg-amber-500/95 text-white"
                          : transportHubJobKind === "relay_leg"
                          ? "bg-violet-600/95 text-white"
                          : "bg-white/20 text-white"
                      }`}
                    >
                      {transportHubJobKind === "intercity_charter"
                        ? t("transport.kind_intercity_charter")
                        : transportHubJobKind === "relay_leg"
                        ? t("transport.kind_relay_leg")
                        : t("transport.kind_local_on_demand")}
                    </span>
                  ) : null}
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white drop-shadow-sm">{job.title}</h1>
                {jobReferenceCode ? (
                  <div className="mt-4 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-100/90">
                        {t("detail.job_reference")}
                      </span>
                      <span className="font-mono text-sm sm:text-base font-bold tracking-tight text-white bg-black/20 px-2.5 py-1 rounded-lg border border-white/25">
                        {jobReferenceCode}
                      </span>
                      <button
                        type="button"
                        onClick={() => void copyJobReference()}
                        className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white hover:bg-white/30 transition-colors"
                        aria-label={t("detail.copy_ref")}
                      >
                        <Copy size={14} strokeWidth={2.25} />
                        {t("detail.copy_ref")}
                      </button>
                    </div>
                    {job.created_at && (
                      <p className="text-sm text-emerald-100/95">
                        {t("detail.order_placed_at")}{" "}
                        {new Date(job.created_at).toLocaleString("th-TH", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                      <button
                        type="button"
                        onClick={openHelpCenterGateModal}
                        className="text-sm font-semibold text-emerald-100 hover:text-white underline-offset-2 hover:underline"
                      >
                        {t("detail.report_issue")}
                      </button>
                      {job.accepted_by &&
                        (isOwner || isAssignedProvider) && (
                          <button
                            type="button"
                            onClick={() => openChatOverlay()}
                            className="text-sm text-white/75 hover:text-white underline-offset-2 hover:underline"
                          >
                            {t("detail.chat_history_link")}
                          </button>
                        )}
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="text-right">
                <button
                  onClick={handleShare}
                  className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors mb-2 ml-auto block"
                >
                  <Share2 size={20} />
                </button>
                <p className="text-3xl font-bold flex items-center justify-end">
                  {jobFeeRounded}{" "}
                  <span className="text-sm ml-1 font-normal opacity-80">
                    {t("detail.thb")}
                  </span>
                </p>
                {job.tips_amount && job.tips_amount > 0 ? (
                  <p className="text-sm text-emerald-100 flex items-center justify-end mt-1">
                    <Heart size={12} className="mr-1 fill-current" /> +{" "}
                    {job.tips_amount} Tips
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {showFlowChrome && job && (
              <div
                id="job-detail-flow-stepper"
                className={flowRing(!!jobFlow && jobFlow.stepKey === "done")}
              >
                <JobDetailFlowStepper
                  role={isOwner ? "employer" : "provider"}
                  jobStatus={job.status}
                  hasArrived={
                    job.status === JobStatus.IN_PROGRESS && !!job.arrived_at
                  }
                  hasProof={hasProof}
                  waitingApproval={
                    job.status === JobStatus.WAITING_FOR_APPROVAL
                  }
                  category={job.category}
                  appointmentAt={job.datetime}
                />
              </div>
            )}
            {canShowJobChat && !contactStripInProviderMap && (
              <div className="rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50/95 to-white px-4 py-3 shadow-sm flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {(() => {
                    const avatarUrl = isOwner
                      ? (job as any).provider_profile?.avatar_url
                      : (job as any).created_by_avatar;
                    const name = isOwner
                      ? job.accepted_by_name || "Provider"
                      : job.created_by_name || "Owner";
                    return (
                      <>
                        {avatarUrl ? (
                          <img
                            src={avatarUrl}
                            alt=""
                            className="h-12 w-12 shrink-0 rounded-full object-cover border-2 border-emerald-200 shadow-sm"
                          />
                        ) : (
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 border-2 border-emerald-200">
                            <User size={24} className="text-emerald-700" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                            {t("detail.chat")}
                          </p>
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {t("detail.chat_with")} {name}
                          </p>
                          {job.status === JobStatus.OPEN && canAcceptJob ? (
                            <p className="text-xs text-slate-500 mt-1 leading-snug">
                              {t("detail.chat_pre_accept_hint")}
                            </p>
                          ) : null}
                        </div>
                      </>
                    );
                  })()}
                </div>
                <button
                  type="button"
                  onClick={openChatOverlay}
                  className="inline-flex w-full sm:w-auto shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.99]"
                >
                  <MessageCircle size={18} strokeWidth={2} />
                  {t("detail.chat_open_fab")}
                </button>
              </div>
            )}
            {job.status === JobStatus.COMPLETED &&
              job.accepted_by &&
              (isOwner || isAssignedProvider) && (
                <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
                  {isOwner &&
                    (employerHasReviewed === false ||
                      employerHasReviewed === null) && (
                      <button
                        type="button"
                        onClick={() => setShowReviewModal(true)}
                        className="flex w-full items-center justify-between gap-3 border-b border-emerald-100 bg-gradient-to-r from-emerald-600 to-green-600 px-4 py-3.5 text-left text-white shadow-sm transition hover:from-emerald-700 hover:to-green-700"
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/20">
                            <Star
                              size={22}
                              className="text-amber-200"
                              fill="currentColor"
                            />
                          </span>
                          <span className="min-w-0">
                            <span className="block font-bold leading-tight">
                              {t("detail.rate_provider")}
                            </span>
                            <span className="mt-0.5 block text-xs text-emerald-100">
                              {job.accepted_by_name
                                ? `${job.accepted_by_name}`
                                : t("detail.rate_provider_sub")}
                            </span>
                          </span>
                        </span>
                        <ChevronRight
                          className="shrink-0 text-white/90"
                          size={22}
                          strokeWidth={2.5}
                        />
                      </button>
                    )}
                  {isOwner && employerHasReviewed === true && (
                    <div className="flex items-center gap-3 border-b border-emerald-100 bg-emerald-50/80 px-4 py-3">
                      <CheckCircle
                        className="shrink-0 text-emerald-600"
                        size={22}
                        strokeWidth={2.5}
                      />
                      <p className="text-sm font-semibold text-emerald-900">
                        {t("detail.rated_provider_done")}
                      </p>
                    </div>
                  )}
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => setShowTipModal(true)}
                      className="flex w-full gap-3 p-4 text-left transition-colors hover:bg-emerald-50/80"
                    >
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                        <Gift size={22} strokeWidth={2} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-900">
                          {t("detail.tip_banner_title")}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {t("detail.tip_banner_sub")}
                        </p>
                      </div>
                    </button>
                  )}
                  {!isOwner &&
                    (job.tips_amount ?? 0) > 0 && (
                      <div className="flex gap-3 border-b border-slate-100 p-4">
                        <Gift
                          className="shrink-0 text-emerald-600"
                          size={22}
                        />
                        <p className="text-sm text-slate-700">
                          {t("detail.tip_received_line")}{" "}
                          <span className="font-bold tabular-nums">
                            {job.tips_amount} {t("detail.thb")}
                          </span>
                        </p>
                      </div>
                    )}
                  <div className="grid grid-cols-2 gap-2 border-t border-slate-100 bg-slate-50/70 p-3">
                    <button
                      type="button"
                      onClick={() => openChatOverlay()}
                      className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                    >
                      <MessageCircle size={18} />
                      {t("detail.chat_history_link")}
                    </button>
                    <button
                      type="button"
                      onClick={openHelpCenterGateModal}
                      className="flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white py-2.5 text-sm font-semibold text-red-700 shadow-sm hover:bg-red-50"
                    >
                      <Flag size={18} />
                      {t("detail.report_issue")}
                    </button>
                  </div>
                </div>
              )}
            {/* 🛡️ Protected by Aqond Insurance Banner */}
            {job.has_insurance && (
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                <Shield size={24} className="text-emerald-600 flex-shrink-0" />
                <div>
                  <p className="font-bold text-emerald-800">Protected by Aqond Insurance</p>
                  {job.policy_number && (
                    <p className="text-sm text-emerald-700">Policy: {job.policy_number}</p>
                  )}
                </div>
              </div>
            )}

            {/* Report Issue / File Claim — visible when coverage is active */}
            {job.has_insurance &&
              job.insurance_coverage_status === "active" &&
              !insuranceClaim &&
              isOwner && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm text-amber-800 mb-3">
                    งานนี้คุ้มครองโดย Aqond Insurance — หากมีปัญหาระหว่างงาน สามารถยื่นเคลมได้
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowClaimModal(true)}
                    className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
                  >
                    <Shield size={16} />
                    Report Issue / File Claim
                  </button>
                </div>
              )}

            {/* Expiration Timer */}
            {job.status === JobStatus.OPEN && (
              <div
                className={`p-3 rounded-lg flex items-center justify-between ${
                  isExpired
                    ? "bg-red-50 text-red-800"
                    : "bg-blue-50 text-blue-800"
                }`}
              >
                <div className="flex items-center">
                  <Timer size={18} className="mr-2" />
                  <span className="font-bold text-sm">
                    {isExpired ? t("detail.expired") : t("detail.expires_in")}
                  </span>
                </div>
                <span className="font-mono font-bold text-lg">
                  {expirationTime || "--:--:--"}
                </span>
              </div>
            )}

            {showIntercityBidding && isOwner && (
              <div className="rounded-xl border border-amber-300 bg-gradient-to-br from-amber-50 to-white p-4 space-y-3 shadow-sm">
                <h4 className="text-sm font-bold text-amber-950 flex items-center gap-2">
                  <DollarSign size={18} className="text-amber-600" />
                  ข้อเสนอราคาจากคนขับ (เหมาข้ามจังหวัด)
                </h4>
                <p className="text-xs text-amber-900/85 leading-relaxed">
                  เลือก &quot;ยอมรับราคา&quot; กับคนที่ต้องการ — ระบบจะคำนวณยอดรวมที่ผู้จ้างจ่าย (รวมค่าบริการแพลตฟอร์ม) ให้อัตโนมัติ
                </p>
                {bidsLoading && intercityBids.length === 0 ? (
                  <p className="text-xs text-amber-800 flex items-center gap-2">
                    <Loader2 className="animate-spin" size={14} /> กำลังโหลดข้อเสนอ...
                  </p>
                ) : null}
                {intercityBids.filter((b) => b.status === "pending").length === 0 && !bidsLoading ? (
                  <p className="text-xs text-amber-900/75">ยังไม่มีข้อเสนอ — รอคนขับกด &quot;เสนอราคาใหม่&quot; จากบอร์ดงาน</p>
                ) : null}
                <ul className="space-y-2">
                  {intercityBids
                    .filter((b) => b.status === "pending")
                    .map((b) => (
                      <li
                        key={b.id}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl bg-white border border-amber-200/80 p-3 shadow-sm"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 truncate">
                            {b.provider_name || "คนขับ"}
                          </p>
                          <p className="text-xs text-slate-600 mt-0.5">
                            เสนอค่าจ้าง (ก่อนค่าบริการ){" "}
                            <span className="font-mono font-semibold">
                              ฿{Number(b.proposed_job_fee_thb).toLocaleString()}
                            </span>
                            {" · "}
                            รวมที่คุณจ่าย{" "}
                            <span className="font-mono font-semibold text-emerald-800">
                              ฿{Number(b.proposed_final_price_thb).toLocaleString()}
                            </span>
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleAcceptIntercityBid(String(b.id))}
                          disabled={!!acceptingBidId}
                          className="shrink-0 w-full sm:w-auto py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {acceptingBidId === String(b.id) ? (
                            <Loader2 className="animate-spin" size={18} />
                          ) : (
                            <CheckCircle size={18} />
                          )}
                          ยอมรับราคา
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            )}

            {/* Status Banners */}
            {job.status === JobStatus.CANCELLED && (
              <div className="bg-red-50 text-red-800 p-4 rounded-lg border border-red-100 flex items-center justify-center font-bold">
                <XCircle className="mr-2" /> {t("detail.cancelled")}
              </div>
            )}

            {job.status === JobStatus.DISPUTE && (
              <div className="space-y-3">
                <div className="bg-red-50 text-red-800 p-4 rounded-lg border border-red-100 flex items-center justify-center font-bold animate-pulse">
                  <AlertOctagon className="mr-2" /> {t("detail.under_review")}
                </div>

                {/* 🛡️ Insurance Claim Section (เฉพาะงานที่มีประกัน) */}
                {job.has_insurance && (
                  <div className={`rounded-xl border p-4 ${
                    insuranceClaim?.claim_status === 'approved'
                      ? 'bg-emerald-50 border-emerald-200'
                      : insuranceClaim?.claim_status === 'pending'
                      ? 'bg-amber-50 border-amber-200'
                      : insuranceClaim?.claim_status === 'rejected'
                      ? 'bg-red-50 border-red-200'
                      : 'bg-amber-50 border-amber-300'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <Shield size={18} className={
                        insuranceClaim?.claim_status === 'approved' ? 'text-emerald-600' :
                        insuranceClaim?.claim_status === 'rejected' ? 'text-red-500' : 'text-amber-600'
                      } />
                      <span className="font-bold text-sm">
                        {insuranceClaim?.claim_status === 'approved'
                          ? '✅ ประกันได้รับการอนุมัติแล้ว'
                          : insuranceClaim?.claim_status === 'pending'
                          ? '⏳ รอการพิจารณาจากทีมงาน'
                          : insuranceClaim?.claim_status === 'rejected'
                          ? '❌ คำขอเคลมถูกปฏิเสธ'
                          : '🛡️ มีประกันคุ้มครอง'}
                      </span>
                    </div>

                    {insuranceClaim?.claim_status === 'approved' && (
                      <div className="text-sm text-emerald-700 space-y-1">
                        <p>จ่ายให้ผู้รับงานใหม่: <strong>฿{Number(insuranceClaim.replacement_payout).toLocaleString()}</strong> (40% ของวงเงินประกัน)</p>
                      </div>
                    )}

                    {!insuranceClaim && isOwner && (
                      <>
                        <p className="text-xs text-amber-700 mb-3 leading-relaxed">
                          การเคลมประกันคุ้มครองสูงสุดไม่เกินวงเงินประกัน และครอบคลุมการจัดหาผู้รับงานใหม่ในวงเงิน 40% ของวงเงินประกัน (60% สำรองเพื่อความมั่นคงของแพลตฟอร์ม)
                        </p>
                        <button
                          onClick={() => setShowClaimModal(true)}
                          className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
                        >
                          <Shield size={16} /> ยื่นเคลมประกัน
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 🚨 Marine SOS — แสดงให้ทั้งผู้จ้างและกัปตันเมื่ออยู่บนเรือ */}
            {(job.category === "Marine" || (job as any).marine_status) &&
              (job.status === JobStatus.ACCEPTED || job.status === JobStatus.IN_PROGRESS) &&
              (isOwner || isAssignedProvider) && (
              <button
                onClick={async () => {
                  try {
                    const pos = await new Promise<{ lat: number; lng: number }>((res, rej) => {
                      navigator.geolocation.getCurrentPosition(
                        (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
                        rej,
                        { enableHighAccuracy: true }
                      );
                    });
                    await sendSOS(job.id, pos.lat, pos.lng, token || undefined);
                    notify("SOS ส่งแล้ว — หน่วยกู้ภัยจะติดต่อคุณ", "success");
                  } catch (e: any) {
                    notify(e?.message || "ส่ง SOS ไม่สำเร็จ", "error");
                  }
                }}
                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 border-2 border-red-700"
              >
                <Radio size={20} />
                🚨 SOS ฉุกเฉินทางทะเล
              </button>
            )}

            {isOwner &&
              (job.status === JobStatus.ACCEPTED ||
                job.status === JobStatus.IN_PROGRESS) && (
              <div className="space-y-2">
                <div className="bg-blue-50 text-blue-800 p-4 rounded-lg border border-blue-100 flex items-center">
                  <CheckCircle className="mr-2" /> {t("detail.accepted")}
                </div>
                {/* 🛡️ Insurance badge เมื่อมีประกัน */}
                {job.has_insurance && (
                  <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700 font-semibold">
                    <Shield size={14} className="text-amber-500" /> มีประกันคุ้มครอง — คุ้มครองการจัดหาผู้รับงานใหม่สูงสุด 40%
                  </div>
                )}
                {MEET_CODE_REQUIRED && (
                  <div className="rounded-xl border border-slate-200 bg-white p-4 text-slate-800 shadow-sm">
                    <p className="font-semibold text-sm mb-2 flex items-center gap-2">
                      <Radio size={16} className="text-indigo-600" />
                      {t("detail.employer_meet_title")}
                    </p>
                    <p className="text-xs text-slate-600 mb-3">
                      {t("detail.employer_meet_desc")}
                    </p>
                    <button
                      type="button"
                      onClick={handleCreateEmployerMeetCode}
                      disabled={creatingMeetCode}
                      className="w-full py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
                    >
                      {creatingMeetCode ? t("detail.employer_meet_creating") : t("detail.employer_meet_btn")}
                    </button>
                    {employerMeet && (
                      <div className="mt-3 flex flex-col items-center gap-2">
                        <img
                          alt="QR meet code"
                          className="w-40 h-40 border border-slate-200 rounded-lg bg-white p-1"
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(employerMeet.qrPayload)}`}
                        />
                        <p className="text-2xl font-mono font-bold tracking-widest text-indigo-900">
                          {employerMeet.code}
                        </p>
                        <p className="text-xs text-slate-500">
                          หมดอายุ: {employerMeet.expiresAt ? new Date(employerMeet.expiresAt).toLocaleString("th-TH") : "—"}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {job.status === JobStatus.WAITING_FOR_APPROVAL && (
              <div className="bg-purple-50 text-purple-800 p-4 rounded-lg border border-purple-100 space-y-2">
                <div className="flex items-center">
                  <Hourglass className="mr-2 shrink-0" />
                  <span className="font-bold">{t("detail.waiting_approval")}</span>
                </div>
                <p className="text-sm text-purple-700">{t("detail.waiting_manual_approval_hint")}</p>
                {disputeWindowRemaining && (
                  <p className="text-xs text-purple-600">
                    ช่วงตรวจสอบ (อ้างอิง): {disputeWindowRemaining}
                  </p>
                )}
              </div>
            )}

            {job.status === JobStatus.WAITING_FOR_APPROVAL &&
              isAssignedProvider &&
              job.payment_details?.provider_completion_extras &&
              typeof job.payment_details.provider_completion_extras === "object" && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800">
                  <p className="font-semibold text-slate-900">{t("detail.provider_extras_submitted_title")}</p>
                  <p className="text-xs text-slate-600 mt-1">
                    {t("detail.completion_extras_total")}: ฿
                    {(
                      Number(
                        (job.payment_details.provider_completion_extras as { extras_total_thb?: number })
                          .extras_total_thb
                      ) ||
                      (Number(
                        (job.payment_details.provider_completion_extras as { meter_thb?: number }).meter_thb
                      ) || 0) +
                        (Number(
                          (job.payment_details.provider_completion_extras as { toll_thb?: number }).toll_thb
                        ) || 0) +
                        (Number(
                          (job.payment_details.provider_completion_extras as { parking_thb?: number })
                            .parking_thb
                        ) || 0) +
                        (Number(
                          (job.payment_details.provider_completion_extras as { other_thb?: number }).other_thb
                        ) || 0)
                    ).toLocaleString()}
                  </p>
                </div>
              )}

            {job.status === JobStatus.WAITING_FOR_PAYMENT && (
              <div className="bg-amber-50 text-amber-800 p-4 rounded-lg border border-amber-100 flex items-center">
                <Clock className="mr-2" /> {t("detail.waiting_payment")}
              </div>
            )}

            {job.status === JobStatus.COMPLETED && (
              <div className="bg-green-50 text-green-800 p-4 rounded-lg border border-green-100 flex items-center justify-center font-bold">
                <CheckCircle className="mr-2" /> {t("detail.completed")}
              </div>
            )}

            {/* AQOND Wow 3: Work Insurance Progress */}
            {(job.status === JobStatus.ACCEPTED ||
              job.status === JobStatus.IN_PROGRESS ||
              job.status === JobStatus.WAITING_FOR_APPROVAL ||
              job.status === JobStatus.COMPLETED) && (
              <WorkInsuranceProgress
                phase={
                  job.status === JobStatus.COMPLETED
                    ? "released"
                    : job.status === JobStatus.IN_PROGRESS
                    ? "in_progress"
                    : job.status === JobStatus.WAITING_FOR_APPROVAL
                    ? "in_progress"
                    : "matched"
                }
                className="mt-4"
                variant={
                  isAssignedProvider && showFlowChrome ? "compact" : "default"
                }
              />
            )}

            {/* Insurance Price Breakdown — แสดงเมื่อซื้อประกัน (ใต้ Work Insurance status bar) */}
            {(job.has_insurance === true || (job.insurance_amount != null && Number(job.insurance_amount) > 0)) && (
              <div className="mt-4 overflow-hidden rounded-xl border border-amber-200 bg-amber-50/80 shadow-sm">
                <div className="px-4 py-3 border-b border-amber-200/80 bg-amber-100/50">
                  <div className="flex items-center gap-2">
                    <Shield size={18} className="text-amber-700" />
                    <span className="font-bold text-amber-900 text-sm">{t("detail.insurance_title") || "Price Breakdown"}</span>
                  </div>
                </div>
                <div className="px-4 py-4 space-y-2 text-sm">
                  <div className="flex justify-between items-center gap-4 text-slate-700">
                    <span>{t("detail.job_fee") || "Job Fee"}</span>
                    <span className="font-semibold text-slate-800 tabular-nums text-right min-w-[72px]">฿ {jobFeeRounded.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center gap-4 text-amber-800 font-medium">
                    <span>{t("detail.insurance_fee") || "Insurance Premium"}</span>
                    <span className="font-semibold tabular-nums text-right min-w-[72px]">+฿ {cardInsuranceAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center gap-4 text-slate-700">
                    <span>{t("detail.service_fee")} ({paymentMarkupPercent}%)</span>
                    <span className="font-semibold text-slate-800 tabular-nums text-right min-w-[72px]">+฿ {round2((jobFeeRounded + cardInsuranceAmount) * markupRate).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center gap-4 border-t border-amber-200 pt-3 mt-2 font-bold text-slate-900">
                    <span>{t("detail.total_pay") || "Total Paid"}</span>
                    <span className="tabular-nums text-right min-w-[72px]">฿ {cardTotalPrice.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Employer Final Invoice — แสดงเมื่องานเสร็จ (เจ้าของงานเห็นใบแจ้งหนี้สุดท้าย) */}
            {job.status === JobStatus.COMPLETED && isOwner && (
              <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/80 shadow-sm">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-100/80">
                  <div className="flex items-center gap-2">
                    <ClipboardList size={18} className="text-slate-700" />
                    <span className="font-bold text-slate-900 text-sm">{t("detail.final_invoice") || "Final Invoice"}</span>
                  </div>
                </div>
                <div className="px-4 py-4 space-y-2 text-sm">
                  <div className="flex justify-between items-center gap-4 text-slate-700">
                    <span>{t("detail.job_fee") || "Job Fee"}</span>
                    <span className="font-semibold text-slate-800 tabular-nums text-right min-w-[72px]">฿ {jobFeeRounded.toLocaleString()}</span>
                  </div>
                  {(job.has_insurance || cardInsuranceAmount > 0) && (
                    <div className="flex justify-between items-center gap-4 text-amber-800 font-medium">
                      <span>{t("detail.insurance_fee") || "Insurance Premium"}</span>
                      <span className="font-semibold tabular-nums text-right min-w-[72px]">+฿ {cardInsuranceAmount.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center gap-4 text-slate-700">
                    <span>{t("detail.service_fee")} ({paymentMarkupPercent}%)</span>
                    <span className="font-semibold text-slate-800 tabular-nums text-right min-w-[72px]">+฿ {round2((jobFeeRounded + cardInsuranceAmount) * markupRate).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center gap-4 border-t border-slate-200 pt-3 mt-2 font-bold text-slate-900">
                    <span>{t("detail.total_pay") || "Total Paid"}</span>
                    <span className="tabular-nums text-right min-w-[72px]">฿ {cardTotalPrice.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Provider Earnings Receipt — ใบเสร็จรายได้ (ผู้รับงานเห็นรายละเอียดค่าธรรมเนียมแพลตฟอร์ม + รายรับคงเหลือ) */}
            {job.status === JobStatus.COMPLETED && isAssignedProvider && (
              <div className="mt-4 overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50/80 shadow-sm">
                <div className="px-4 py-3 border-b border-emerald-200 bg-emerald-100/50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign size={18} className="text-emerald-700" />
                    <span className="font-bold text-emerald-900 text-sm">รายได้จากงานนี้</span>
                  </div>
                  <button
                    onClick={async () => {
                      if (!id) return;
                      try {
                        const { data } = await api.get<ReceiptData>(`/earnings/receipt/job/${id}`);
                        setReceiptData(data);
                      } catch (e) {
                        notify("โหลดใบเสร็จไม่สำเร็จ", "error");
                      }
                    }}
                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-medium text-sm hover:bg-emerald-700 transition-colors flex items-center gap-2"
                  >
                    <Eye size={16} />
                    ดูใบเสร็จรายได้
                  </button>
                </div>
                <p className="px-4 py-3 text-sm text-emerald-800">
                  ดูรายละเอียดค่าธรรมเนียมแพลตฟอร์มและรายรับคงเหลือหลังหักค่าใช้จ่าย
                </p>
              </div>
            )}

            {showFlowChrome ? (
              <details className="group rounded-2xl border border-slate-200/90 bg-slate-50/40 open:bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
                  <span>{t("detail.flow_job_details_toggle")}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
                </summary>
                <div className="space-y-4 border-t border-slate-100 px-4 pb-4 pt-3">{jobDetailsBlock}</div>
              </details>
            ) : (
              jobDetailsBlock
            )}

            {/* Provider — สรุปรายได้โดยประมาณ + คำถามจากนายจ้าง (ก่อนรับ) */}
            {canAcceptJob && job.status === JobStatus.OPEN && !isExpired && (
              <>
                {paymentBadgeVariant && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {t("payment.method")}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold shadow-sm ${
                        paymentBadgeVariant.variant === "cash"
                          ? "bg-amber-100 text-amber-900 ring-1 ring-amber-200"
                          : paymentBadgeVariant.variant === "wallet"
                          ? "bg-violet-100 text-violet-900 ring-1 ring-violet-200"
                          : "bg-sky-100 text-sky-900 ring-1 ring-sky-200"
                      }`}
                    >
                      {paymentBadgeVariant.variant === "cash"
                        ? t("detail.payment_badge_cash")
                        : paymentBadgeVariant.variant === "wallet"
                        ? t("detail.payment_badge_wallet")
                        : t("detail.payment_badge_online")}
                    </span>
                  </div>
                )}
                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/95 p-4 shadow-sm ring-1 ring-slate-100/80">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <DollarSign size={18} className="text-emerald-700 shrink-0" />
                      <h3 className="text-sm font-bold text-slate-900">
                        {t("detail.provider_earnings_preview_title")}
                      </h3>
                    </div>
                  </div>
                  <div className="rounded-xl bg-emerald-600/95 px-4 py-3 text-white shadow-inner mb-3">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-100/95">
                      {t("detail.provider_earnings_net_highlight")}
                    </p>
                    <p className="text-2xl font-bold tabular-nums mt-0.5">
                      ฿{talentPreviewBreakdown.talentNet.toLocaleString()}
                    </p>
                  </div>
                  <div className="text-sm space-y-1.5 text-slate-800">
                    <div className="flex justify-between gap-4 text-xs">
                      <span className="text-slate-600">{t("detail.provider_earnings_gross")}</span>
                      <span className="font-semibold tabular-nums">
                        ฿{jobFeeRounded.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4 text-xs text-slate-600">
                      <span>{t("detail.provider_earnings_sourcing")}</span>
                      <span className="tabular-nums text-red-700">
                        −฿{talentPreviewBreakdown.sourcingFee.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4 text-xs text-slate-600">
                      <span>{t("detail.provider_earnings_commission")}</span>
                      <span className="tabular-nums text-red-700">
                        −฿{talentPreviewBreakdown.commission.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4 text-xs text-slate-600">
                      <span>{t("detail.provider_earnings_tax")}</span>
                      <span className="tabular-nums text-red-700">
                        −฿{talentPreviewBreakdown.taxService.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4 pt-2 border-t border-slate-200 font-bold text-emerald-900 text-sm">
                      <span>{t("detail.provider_earnings_net")}</span>
                      <span className="tabular-nums">
                        ฿{talentPreviewBreakdown.talentNet.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-3 leading-relaxed">
                    {t("detail.provider_earnings_preview_note")}
                  </p>
                </div>
                {employerQuestionsPreview.length > 0 ? (
                  <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/95 p-4 shadow-sm">
                    <p className="text-xs font-bold text-amber-900 mb-2">
                      {t("detail.employer_questions_title")}
                    </p>
                    <ul className="list-disc pl-5 space-y-1.5 text-sm text-amber-950">
                      {employerQuestionsPreview.map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            )}

            {/* Provider — แผนที่ก่อนรับ (หมุดเดียวหรือสองหมุด Driver) + ETA */}
            {preAcceptMapModel && (
              <div className="mt-4 overflow-hidden rounded-2xl border border-emerald-200/90 bg-white shadow-sm ring-1 ring-emerald-100/50">
                <div className="flex flex-col gap-2 border-b border-emerald-100 bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <MapPin size={18} className="shrink-0" />
                      {preAcceptMapModel.kind === "two"
                        ? t("detail.provider_pre_map_title_driver")
                        : t("detail.provider_pre_map_title")}
                    </h3>
                    {preAcceptMapModel.kind === "two" ? (
                      <div className="mt-2 space-y-1 text-xs text-emerald-50/95">
                        <p className="flex gap-2">
                          <span className="text-red-200 shrink-0">●</span>
                          <span>
                            {t("detail.pin_pickup_label")}:{" "}
                            {preAcceptMapModel.pickup.label?.trim() ||
                              t("detail.loc_unknown")}
                          </span>
                        </p>
                        <p className="flex gap-2">
                          <span className="text-emerald-200 shrink-0">●</span>
                          <span>
                            {t("detail.pin_dropoff_label")}:{" "}
                            {preAcceptMapModel.dropoff.label?.trim() ||
                              t("detail.loc_unknown")}
                          </span>
                        </p>
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-emerald-50/95 line-clamp-3 break-words">
                        {formatJobPrimaryAddress(job) || t("detail.loc_unknown")}
                      </p>
                    )}
                    {preAcceptEta.loading ? (
                      <p className="mt-2 text-[11px] text-emerald-100 flex items-center gap-2">
                        <Loader2 className="animate-spin" size={12} />
                        {t("detail.provider_pre_eta_loading")}
                      </p>
                    ) : preAcceptEta.denied ? (
                      <p className="mt-2 text-[11px] text-amber-100/95">
                        {t("detail.provider_pre_eta_denied")}
                      </p>
                    ) : preAcceptEta.minutes != null && preAcceptEta.distanceKm != null ? (
                      <p className="mt-2 text-[11px] text-emerald-50 leading-relaxed">
                        {t("detail.provider_pre_eta_prefix")}{" "}
                        <strong className="text-white">
                          {Math.round(preAcceptEta.minutes)}
                        </strong>{" "}
                        {t("detail.provider_pre_eta_min")} ·{" "}
                        <strong className="text-white">
                          {preAcceptEta.distanceKm.toFixed(1)}
                        </strong>{" "}
                        km (
                        {preAcceptEta.source === "osrm"
                          ? t("detail.provider_pre_eta_source_osrm")
                          : t("detail.provider_pre_eta_source_straight")}
                        )
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    {preAcceptMapModel.kind === "two" ? (
                      <>
                        <a
                          href={`https://www.google.com/maps/dir/${preAcceptMapModel.pickup.lat},${preAcceptMapModel.pickup.lng}/${preAcceptMapModel.dropoff.lat},${preAcceptMapModel.dropoff.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-2 rounded-lg bg-white/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/25"
                        >
                          <Navigation size={16} />
                          {t("detail.provider_pre_map_route_gmaps")}
                        </a>
                      </>
                    ) : (
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${preAcceptMapModel.lat},${preAcceptMapModel.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-white/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/25"
                      >
                        <Navigation size={16} />
                        {t("detail.provider_pre_map_open_maps")}
                      </a>
                    )}
                  </div>
                </div>
                <div className="h-[240px] w-full sm:h-[280px]">
                  <MapContainer
                    center={
                      preAcceptMapModel.kind === "two"
                        ? [
                            (preAcceptMapModel.pickup.lat + preAcceptMapModel.dropoff.lat) / 2,
                            (preAcceptMapModel.pickup.lng + preAcceptMapModel.dropoff.lng) / 2,
                          ]
                        : [preAcceptMapModel.lat, preAcceptMapModel.lng]
                    }
                    zoom={preAcceptMapModel.kind === "two" ? 11 : 15}
                    style={{ height: "100%", width: "100%" }}
                    scrollWheelZoom
                  >
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    />
                    {preAcceptRouteCoords && preAcceptRouteCoords.length >= 2 && (
                      <>
                        <PreAcceptBoundsFitter positions={preAcceptRouteCoords} />
                        <Polyline
                          positions={preAcceptRouteCoords}
                          pathOptions={{
                            color: "#059669",
                            weight: 5,
                            opacity: 0.92,
                            lineCap: "round",
                            lineJoin: "round",
                          }}
                        />
                      </>
                    )}
                    {preAcceptUserLatLng && (
                      <CircleMarker
                        center={[preAcceptUserLatLng.lat, preAcceptUserLatLng.lng]}
                        radius={9}
                        pathOptions={{
                          color: "#ffffff",
                          weight: 3,
                          fillColor: "#2563eb",
                          fillOpacity: 1,
                        }}
                      />
                    )}
                    {preAcceptMapModel.kind === "two" ? (
                      <>
                        <Marker
                          position={[preAcceptMapModel.pickup.lat, preAcceptMapModel.pickup.lng]}
                          icon={L.divIcon({
                            html: `<div style="background-color:#ef4444;width:30px;height:30px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:bold;">A</div>`,
                            className: "",
                            iconSize: [30, 30],
                            iconAnchor: [15, 15],
                          })}
                        />
                        <Marker
                          position={[preAcceptMapModel.dropoff.lat, preAcceptMapModel.dropoff.lng]}
                          icon={L.divIcon({
                            html: `<div style="background-color:#10b981;width:30px;height:30px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:bold;">B</div>`,
                            className: "",
                            iconSize: [30, 30],
                            iconAnchor: [15, 15],
                          })}
                        />
                      </>
                    ) : (
                      <Marker
                        position={[preAcceptMapModel.lat, preAcceptMapModel.lng]}
                        icon={L.divIcon({
                          html: `<div style="background-color:#059669;width:34px;height:34px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;font-size:16px;">📍</div>`,
                          className: "",
                          iconSize: [34, 34],
                          iconAnchor: [17, 17],
                        })}
                      />
                    )}
                  </MapContainer>
                </div>
                <p className="px-4 py-2.5 text-[11px] leading-relaxed text-slate-600 bg-slate-50/90 border-t border-slate-100">
                  {t("detail.provider_pre_map_hint")}
                </p>
              </div>
            )}

            {job.accepted_by &&
              showJobBaBadge(providerBa) &&
              String(providerBa?.adviser_status || "").toLowerCase() === "active" && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-950">
                  <strong className="font-semibold">ค่าธรรมเนียมแพลตฟอร์ม:</strong> ผู้รับงานคนนี้เป็นสมาชิก Brand Adviser ที่ใช้สิทธิ์ได้ — ยอดค่าธรรมเนียมแพลตฟอร์มอาจถูกยกเว้นตามเงื่อนไขโปรแกรม (ยืนยันจากระบบเมื่อปิดงาน)
                </div>
              )}

            {/* ผู้รับงาน: โทร/แชท/ปฏิทิน รวมที่การ์ดลูกค้าใต้แผนที่แล้ว — ไม่ใช้แถบดำซ้ำ */}

            {/* Action Box */}
            <div className="border-t border-gray-100 pt-6">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4">
                {showFlowChrome ? t("detail.flow_actions_title") : t("detail.action_title")}
              </h3>
              <div className="space-y-4">
                {/* 1. ACCEPT JOB: แสดงให้ผู้ที่ไม่ใช่เจ้าของเมื่องาน open — ผู้รับงานกดรับได้ (backend validate provider_status) */}
                {canAcceptJob &&
                  job.status === JobStatus.OPEN &&
                  !isExpired && (
                    <>
                      {selfBa?.is_brand_adviser && selfBa?.brand_adviser_program_enabled === false && (
                        <BrandAdviserProgramOffNotice className="mb-3" />
                      )}
                      {(showJobBaBadge(employerBa) || showJobBaBadge(selfBa)) && (
                        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
                          <span className="font-semibold text-slate-600">สถานะ BA ในดีลนี้:</span>
                          {showJobBaBadge(employerBa) && (
                            <span className="inline-flex items-center gap-1">
                              ผู้จ้าง
                              <BrandAdviserBadge
                                isBrandAdviser
                                adviserStatus={employerBa?.adviser_status}
                                tone="light"
                              />
                            </span>
                          )}
                          {showJobBaBadge(selfBa) && (
                            <span className="inline-flex items-center gap-1">
                              คุณ (ผู้รับงาน)
                              <BrandAdviserBadge
                                isBrandAdviser
                                adviserStatus={selfBa?.adviser_status}
                                tone="light"
                              />
                            </span>
                          )}
                        </div>
                      )}
                      {selfBa?.brand_adviser_suspend_warning && (
                        <BrandAdviserSuspendBanner
                          show
                          tone="light"
                          daysLeft={selfBa.days_until_suspend_estimate ?? undefined}
                          inactivityDays={baRules?.inactivity_days}
                          warnDaysBeforeSuspend={baRules?.warn_days_before_suspend}
                          className="mb-3"
                        />
                      )}
                      {showJobBaBadge(selfBa) &&
                        String(selfBa?.adviser_status || "").toLowerCase() === "active" && (
                          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                            <BrandAdviserBadge
                              isBrandAdviser
                              adviserStatus={selfBa?.adviser_status}
                              tone="light"
                            />
                            <span>
                              คุณเป็นสมาชิก Brand Adviser — สิทธิ์ยกเว้นค่าธรรมเนียมแพลตฟอร์มตามเงื่อนไขโปรแกรม
                            </span>
                          </div>
                        )}
                      <div className="flex flex-col gap-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => navigate(-1)}
                            className="w-full py-3 border-2 border-slate-200 bg-white text-slate-800 font-bold rounded-lg transition-colors flex items-center justify-center hover:bg-slate-50"
                          >
                            <XCircle className="mr-2 shrink-0" size={20} />
                            {t("detail.decline_job")}
                          </button>
                          <button
                            onClick={handleAcceptJob}
                            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center shadow-lg shadow-emerald-200"
                          >
                            <CheckCircle className="mr-2" /> {t("detail.accept")}
                          </button>
                        </div>
                        {showIntercityBidding && (
                          <button
                            type="button"
                            onClick={() => {
                              const min = intercityBidFloor?.min_job_fee_thb;
                              setCounterOfferAmount(
                                min != null ? String(min) : job?.price != null ? String(job.price) : ""
                              );
                              setShowCounterOfferModal(true);
                            }}
                            className="w-full py-3 border-2 border-amber-500 text-amber-900 bg-amber-50 hover:bg-amber-100 font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                          >
                            <DollarSign size={20} />
                            เสนอราคาใหม่
                          </button>
                        )}
                      </div>
                    </>
                  )}

                {/* 2. SUBMIT WORK & IN_PROGRESS ACTIONS: Visible ONLY to the Assigned Provider */}
                {isAssignedProvider &&
                  (job.status === JobStatus.ACCEPTED ||
                    job.status === JobStatus.IN_PROGRESS) && (
                    <div className="space-y-3">
                      {MEET_CODE_REQUIRED && (
                        <div
                          id="job-flow-provider-meet-code"
                          className="rounded-2xl border-2 border-indigo-300 bg-gradient-to-b from-indigo-50 to-white p-4 shadow-md ring-1 ring-indigo-100 sm:p-5 scroll-mt-24"
                        >
                          <p className="font-bold text-base text-indigo-950 mb-1 flex items-center gap-2">
                            <Radio size={20} className="text-indigo-600 shrink-0" />
                            {t("detail.provider_meet_title")}
                          </p>
                          <p className="text-xs text-indigo-900/90 mb-4 leading-relaxed">
                            {t("detail.provider_meet_desc")}
                            <span className="mt-2 block font-semibold text-indigo-950">
                              {language === "en"
                                ? "Enter the 6-digit code from the employer, then tap the purple confirm button here before handing over work."
                                : "กรอกรหัส 6 หลักจากผู้จ้าง แล้วกดปุ่มม่วง «ยืนยันรหัสพบกันผู้จ้าง» ในส่วนนี้ให้สำเร็จ ก่อนส่งมอบงาน"}
                            </span>
                          </p>
                          <label className="block text-xs font-semibold text-indigo-950 mb-1">
                            {t("detail.meet_code_label")}
                          </label>
                          <p className="text-[11px] text-indigo-800/90 mb-2">{t("detail.meet_code_hint")}</p>
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            placeholder="000000"
                            value={providerMeetCodeInput}
                            onChange={(e) => {
                              const next = e.target.value.replace(/\D/g, "");
                              setProviderMeetCodeInput(next);
                              setProviderMeetCodeVerified(false);
                              setProviderMeetCodeVerifyError(null);
                            }}
                            className="w-full px-4 py-3.5 border-2 border-indigo-300 rounded-xl text-center font-mono text-2xl tracking-[0.35em] bg-white text-slate-900 placeholder:text-slate-400 shadow-inner"
                          />
                          <button
                            type="button"
                            onClick={() => void handleVerifyProviderMeetCode()}
                            disabled={
                              providerMeetCodeVerifying ||
                              providerMeetCodeInput.trim().length !== 6
                            }
                            className={`mt-4 w-full rounded-2xl px-4 py-4 text-base font-bold shadow-lg transition flex items-center justify-center gap-2 min-h-[52px] ${
                              providerMeetCodeVerifying ||
                              providerMeetCodeInput.trim().length !== 6
                                ? "bg-slate-200 text-slate-500 cursor-not-allowed shadow-none"
                                : "bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.99] shadow-indigo-300/50"
                            }`}
                          >
                            {providerMeetCodeVerifying ? (
                              <>
                                <Loader2 size={22} className="animate-spin shrink-0" />
                                กำลังเชื่อมกับผู้จ้าง...
                              </>
                            ) : (
                              <>
                                <Radio size={22} className="shrink-0" />
                                ยืนยันรหัสพบกันผู้จ้าง
                              </>
                            )}
                          </button>
                          {providerMeetCodeVerified && (
                            <p className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-emerald-50 py-3 text-sm font-bold text-emerald-900 ring-2 ring-emerald-200">
                              <CheckCircle size={18} strokeWidth={2.25} />
                              เชื่อมกับผู้จ้างแล้ว — พร้อมส่งมอบงานเมื่อถ่ายครบ
                            </p>
                          )}
                          {providerMeetCodeVerifyError && (
                            <p className="mt-2 text-center text-sm font-semibold text-red-600">
                              {providerMeetCodeVerifyError}
                            </p>
                          )}
                        </div>
                      )}

                      {proofPhotosRequired ? (
                      <>
                      {/* 📸 หลักฐานแบบ book: ขั้น 1 ถ่ายก่อน → ถัดไป → ขั้น 2 ถ่ายหลัง (กล้องเท่านั้น) */}
                      <div
                        id="job-flow-provider-proof"
                        className={`rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/90 p-4 shadow-sm ring-1 ring-slate-100/80 sm:p-5 ${flowRing(
                          !!jobFlow &&
                            jobFlow.role === "provider" &&
                            jobFlow.stepKey === "photo"
                        )}`}
                      >
                        <div className="mb-3 flex items-start gap-3 border-b border-slate-100 pb-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                            <Camera size={20} strokeWidth={2.25} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                              ถ่ายหลักฐาน
                            </p>
                            <h4 className="text-base font-bold text-slate-900">
                              {t("detail.proof_section_title")}
                            </h4>
                            <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                              {t("detail.proof_vision_hint")}
                            </p>
                            <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[10px] font-medium leading-snug text-amber-900 ring-1 ring-amber-100">
                              บังคับถ่ายจากกล้องเท่านั้น — ไม่รองรับการอัปโหลดจากแกลเลอรี
                            </p>
                          </div>
                        </div>

                        {job.before_photo_url && job.after_photo_url ? (
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div className="overflow-hidden rounded-xl border border-orange-200 bg-white p-2 shadow-sm">
                                <p className="mb-1 text-center text-[10px] font-bold text-orange-800">ก่อนเริ่มงาน</p>
                                <img
                                  src={job.before_photo_url}
                                  alt=""
                                  className="aspect-[4/3] w-full rounded-lg object-cover"
                                />
                              </div>
                              <div className="overflow-hidden rounded-xl border border-emerald-200 bg-white p-2 shadow-sm">
                                <p className="mb-1 text-center text-[10px] font-bold text-emerald-900">หลังเสร็จงาน</p>
                                <img
                                  src={job.after_photo_url}
                                  alt=""
                                  className="aspect-[4/3] w-full rounded-lg object-cover"
                                />
                              </div>
                            </div>
                            <p className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 py-2.5 text-xs font-semibold text-emerald-900 ring-1 ring-emerald-100">
                              <CheckCircle size={15} strokeWidth={2.25} />
                              ครบทั้ง 2 ขั้นตอน — พร้อมส่งมอบงาน
                            </p>
                          </div>
                        ) : !job.before_photo_url ? (
                          <div className="rounded-2xl border-2 border-orange-200/90 bg-white p-4 shadow-inner">
                            <div className="mb-3 flex items-center gap-3">
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-500 text-base font-bold text-white shadow-md ring-2 ring-orange-200">
                                1
                              </span>
                              <div>
                                <p className="text-sm font-bold text-slate-900">ก่อนเริ่มงาน</p>
                                <p className="text-[11px] text-slate-500">ถ่ายจากกล้อง แล้วกด «ถัดไป» เพื่อไปขั้นถัดไป</p>
                              </div>
                            </div>
                            {beforePhotoPreview ? (
                              <div className="space-y-3">
                                <img
                                  src={beforePhotoPreview}
                                  alt=""
                                  className="max-h-56 w-full rounded-xl border border-orange-100 object-contain sm:max-h-64"
                                />
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setBeforePhoto(null);
                                      setBeforePhotoPreview(null);
                                    }}
                                    className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
                                  >
                                    ถ่ายใหม่
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleProofBookNextAfterBefore()}
                                    disabled={uploadingPhotos}
                                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-3 text-sm font-bold text-white shadow-md transition hover:from-orange-600 hover:to-amber-600 disabled:opacity-50"
                                  >
                                    {uploadingPhotos ? (
                                      <Loader2 size={18} className="animate-spin" />
                                    ) : (
                                      <>
                                        ถัดไป — หลังเสร็จงาน
                                        <ChevronRight size={18} strokeWidth={2.5} />
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void captureProofBeforeDraft()}
                                disabled={uploadingPhotos || capturingProof === "before"}
                                className="flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-orange-300 bg-orange-50/50 py-14 transition hover:border-orange-400 hover:bg-orange-50 disabled:opacity-50"
                              >
                                {capturingProof === "before" ? (
                                  <Loader2 size={36} className="animate-spin text-orange-500" />
                                ) : (
                                  <Camera size={36} className="mb-2 text-orange-500" strokeWidth={1.75} />
                                )}
                                <span className="text-base font-bold text-orange-900">ถ่ายจากกล้อง</span>
                                <span className="mt-1 text-center text-[11px] text-orange-700/90">หน้าจอนี้เป็นขั้นตอนที่ 1 เท่านั้น</span>
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="rounded-2xl border-2 border-emerald-200/90 bg-white p-4 shadow-inner">
                            <div className="mb-3 flex items-center gap-3">
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-base font-bold text-white shadow-md ring-2 ring-emerald-200">
                                2
                              </span>
                              <div>
                                <p className="text-sm font-bold text-slate-900">หลังเสร็จงาน</p>
                                <p className="text-[11px] text-slate-500">ถ่ายจากกล้องเมื่องานเสร็จ — ระบบจะบันทึกทันที</p>
                              </div>
                            </div>
                            {job.before_photo_url ? (
                              <div className="mb-4 flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/90 p-2">
                                <img
                                  src={job.before_photo_url}
                                  alt=""
                                  className="h-14 w-14 shrink-0 rounded-lg border border-white object-cover shadow-sm"
                                />
                                <div className="min-w-0 text-[11px] text-slate-600">
                                  <span className="font-semibold text-slate-800">รูปก่อนเริ่มงาน</span>
                                  <span className="ml-1.5 inline-flex items-center gap-0.5 text-emerald-700">
                                    <CheckCircle size={12} /> บันทึกแล้ว
                                  </span>
                                </div>
                              </div>
                            ) : null}
                            {!job.after_photo_url ? (
                              <button
                                type="button"
                                onClick={() => void handleCaptureProofAfter()}
                                disabled={uploadingPhotos || capturingProof === "after"}
                                className="flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/50 py-14 transition hover:border-emerald-400 hover:bg-emerald-50 disabled:opacity-50"
                              >
                                {capturingProof === "after" ? (
                                  <Loader2 size={36} className="animate-spin text-emerald-600" />
                                ) : (
                                  <Camera size={36} className="mb-2 text-emerald-600" strokeWidth={1.75} />
                                )}
                                <span className="text-base font-bold text-emerald-950">ถ่ายจากกล้อง</span>
                                <span className="mt-1 text-center text-[11px] text-emerald-800/90">หลังทำงานครบแล้วค่อยถ่าย</span>
                              </button>
                            ) : null}
                          </div>
                        )}
                      </div>
                      </>
                      ) : (
                      <div
                        id="job-flow-provider-proof"
                        className={`rounded-2xl border border-slate-200/80 bg-slate-50/90 p-4 shadow-sm ring-1 ring-slate-100/80 sm:p-5 ${flowRing(
                          !!jobFlow &&
                            jobFlow.role === "provider" &&
                            jobFlow.stepKey === "photo"
                        )}`}
                      >
                        <p className="text-sm font-bold text-slate-900">งานขนส่งคนขับ</p>
                        <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                          ประเภทงานนี้ไม่บังคับถ่ายรูปก่อน–หลัง — ส่งมอบงานได้เมื่อเสร็จตามที่ตกลง (ไม่ต้องอัปโหลดหลักฐานภาพ)
                        </p>
                      </div>
                      )}

                      {proofPhotosRequired && !hasProof && (
                        <div className="mb-2 text-xs text-red-500 flex items-center justify-center">
                          <AlertTriangle size={12} className="mr-1" />
                          {t("detail.req_proof")}
                        </div>
                      )}

                      {/* Safety: OTP ส่งมอบ (เฉพาะเมื่อไม่ใช้รหัสพบกัน — ถ้ามีโฟลว์ม่วงแล้ว ไม่แสดงช่องนี้เพื่อไม่ให้เหมือนสองชุดกรอกรหัส) */}
                      {showDeliveryHandoffOtpUi && (
                        <div className="mb-3">
                          <label className="block text-xs text-gray-600 mb-1">
                            รหัส OTP จากผู้จ้าง (ถ้าผู้จ้างส่งให้)
                            <span className="ml-1 inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!id || otpRequesting) return;
                                  setOtpRequesting(true);
                                  try {
                                    const res = await MockApi.requestJobCompletionOtp(id);
                                    if (res.success) {
                                      setOtpRequestedAt(Date.now());
                                      notify("✅ ขอรหัส OTP แล้ว — ผู้จ้างจะได้รับแจ้งเตือนและรหัส กรุณารอให้ผู้จ้างส่งรหัสให้", "success");
                                    } else {
                                      notify(res.message || "ขอรหัส OTP ไม่สำเร็จ", "error");
                                    }
                                  } catch (e: any) {
                                    const msg = e?.response?.data?.message || e?.message || "ขอรหัส OTP ไม่สำเร็จ";
                                    notify(msg, "error");
                                  } finally {
                                    setOtpRequesting(false);
                                  }
                                }}
                                disabled={otpRequesting}
                                className="text-amber-600 hover:text-amber-700 text-xs font-medium underline disabled:opacity-50"
                              >
                                {otpRequesting ? "กำลังส่ง..." : otpRequestedAt ? "ส่งซ้ำ" : "ขอรหัส OTP"}
                              </button>
                            </span>
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            placeholder="000000"
                            value={completionOtp}
                            onChange={(e) => setCompletionOtp(e.target.value.replace(/\D/g, ""))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-center font-mono text-lg"
                          />
                        </div>
                      )}

                      <div
                        id="job-flow-provider-submit"
                        className={flowRing(
                          !!jobFlow &&
                            jobFlow.role === "provider" &&
                            jobFlow.stepKey === "submit"
                        )}
                      >
                      {MEET_CODE_REQUIRED &&
                        hasProof &&
                        (!providerMeetCodeVerified ||
                          providerMeetCodeInput.trim().length !== 6) && (
                        <p className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs font-semibold text-amber-900">
                          ยังส่งมอบไม่ได้: กรอกรหัส 6 หลักจากผู้จ้าง แล้วกดปุ่มใหญ่ม่วง «ยืนยันรหัสพบกันผู้จ้าง» ด้านบนให้สำเร็จก่อน
                        </p>
                      )}
                      <button
                        onClick={openCompletionFlow}
                        disabled={
                          submittingWork ||
                          !hasProof ||
                          gpsVerifying ||
                          (MEET_CODE_REQUIRED &&
                            (!providerMeetCodeVerified ||
                              providerMeetCodeInput.trim().length !== 6))
                        }
                        className={`w-full py-4 text-base font-bold rounded-2xl transition-colors flex items-center justify-center shadow-lg min-h-[52px] ${
                          !hasProof
                            ? "bg-gray-200 text-gray-400 cursor-not-allowed shadow-none"
                            : MEET_CODE_REQUIRED &&
                                (!providerMeetCodeVerified ||
                                  providerMeetCodeInput.trim().length !== 6)
                              ? "bg-amber-100 text-amber-900 border-2 border-amber-300 cursor-not-allowed shadow-none"
                              : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200"
                        }`}
                      >
                        {submittingWork || gpsVerifying ? (
                          <>
                            <Loader2 className="mr-2 animate-spin" />{" "}
                            {gpsVerifying
                              ? "Verifying GPS..."
                              : "Processing..."}
                          </>
                        ) : (
                          <>
                            <Flag className="mr-2" /> {t("detail.mark_done")}
                          </>
                        )}
                      </button>
                      </div>

                      {/* Additional In-Progress Tools */}
                      {job.status === JobStatus.IN_PROGRESS && (
                        <div className="space-y-3 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                          <p className="text-sm font-bold text-yellow-800 flex items-center">
                            <Tool size={16} className="mr-2" />
                            {t("detail.in_progress_actions") ||
                              "Provider Actions"}
                          </p>

                          <button
                            onClick={handleUpdateProgress}
                            className="w-full py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 font-medium rounded-lg transition-colors flex items-center justify-center"
                          >
                            <Activity size={18} className="mr-2" />{" "}
                            {t("action.update_progress") || "Update Progress"}
                          </button>

                          <button
                            onClick={handleUploadProof}
                            className="w-full py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 font-medium rounded-lg transition-colors flex items-center justify-center"
                          >
                            <Camera size={18} className="mr-2" />{" "}
                            {t("action.upload_proof") || "Upload Proof"}
                          </button>

                          <button
                            onClick={() =>
                      openEmployerChatFromTools()
                            }
                            className="w-full py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 font-medium rounded-lg transition-colors flex items-center justify-center"
                          >
                            <User size={18} className="mr-2" />{" "}
                            {t("action.contact_owner_chat") || "Contact Owner"}
                          </button>

                          <button
                            onClick={handleViewDetails}
                            className="w-full py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 font-medium rounded-lg transition-colors flex items-center justify-center"
                          >
                            <ClipboardList size={18} className="mr-2" />{" "}
                            {t("action.view_instructions") || "View Details"}
                          </button>

                          <button
                            onClick={() =>
                              window.open(
                                `https://www.google.com/maps/dir/?api=1&destination=${job.location.lat},${job.location.lng}`,
                                "_blank"
                              )
                            }
                            className="w-full py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 font-medium rounded-lg transition-colors flex items-center justify-center"
                          >
                            <MapPin size={18} className="mr-2" />{" "}
                            {t("action.check_location") || "Check Location"}
                          </button>

                          <button
                            onClick={handleReportIssue}
                            className="w-full py-2 bg-white border border-red-200 text-red-600 hover:bg-red-50 font-medium rounded-lg transition-colors flex items-center justify-center"
                          >
                            <AlertTriangle size={18} className="mr-2" />{" "}
                            {t("action.report_issue") || "Report Issue"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

      {progressUpdateOpen && isAssignedProvider && job && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-[2px] p-4 animate-in fade-in">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close"
            onClick={() => setProgressUpdateOpen(false)}
          />
          <div
            className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl animate-in slide-in-from-bottom-10 sm:zoom-in-95"
            role="dialog"
            aria-modal="true"
          >
            <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900">อัปเดทความคืบหน้า</div>
                <div className="text-xs text-slate-500">ระบบจะส่งข้อความนี้ไปในแชทให้ผู้จ้างเห็น</div>
              </div>
              <button
                type="button"
                onClick={() => setProgressUpdateOpen(false)}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { k: "on_the_way", label: "กำลังเดินทาง" },
                  { k: "arrived", label: "ถึงหน้างานแล้ว" },
                  { k: "working", label: "กำลังทำงาน" },
                  { k: "done_soon", label: "ใกล้เสร็จ" },
                  { k: "delayed", label: "ล่าช้า" },
                  { k: "need_more_info", label: "ขอข้อมูลเพิ่ม" },
                ].map((it) => {
                  const active = progressUpdatePreset === (it.k as any);
                  return (
                    <button
                      key={it.k}
                      type="button"
                      onClick={() => setProgressUpdatePreset(it.k as any)}
                      className={`rounded-2xl px-3 py-2.5 text-xs font-semibold border transition ${
                        active
                          ? "bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-200/70"
                          : "bg-white text-slate-800 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {it.label}
                    </button>
                  );
                })}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  รายละเอียดเพิ่มเติม (ไม่บังคับ)
                </label>
                <textarea
                  rows={3}
                  value={progressUpdateNote}
                  onChange={(e) => setProgressUpdateNote(e.target.value.slice(0, 280))}
                  placeholder="เช่น ถึงหน้างานแล้ว รอเข้าบ้าน / เริ่มทำความสะอาดโซนห้องครัว..."
                  className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-400"
                />
                <div className="mt-1 text-[11px] text-slate-500 text-right">
                  {progressUpdateNote.length}/280
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 px-5 py-4 flex gap-2">
              <button
                type="button"
                onClick={() => setProgressUpdateOpen(false)}
                className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => void submitProgressUpdate()}
                className="flex-1 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700"
              >
                ส่งให้ผู้จ้าง
              </button>
            </div>
          </div>
        </div>
      )}

                {/* 3. ACTIONS FOR OWNER: Visible ONLY to Job Owner */}
                {isOwner && (
                  <>
                    {/* WAITING_FOR_APPROVAL: Approve & Pay / Report (รวมข้อความคำแนะนำและการเตือน) */}
                    {job.status === JobStatus.WAITING_FOR_APPROVAL && (
                      <div
                        id="job-flow-employer-review"
                        className={`space-y-4 scroll-mt-24 ${flowRing(
                          !!jobFlow &&
                            jobFlow.role === "employer" &&
                            jobFlow.stepKey === "review" &&
                            job.status === JobStatus.WAITING_FOR_APPROVAL
                        )}`}
                      >
                        {/* 💰 Phase 5: Dispute Window Countdown */}
                        {disputeWindowRemaining && (
                          <div className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl">
                            <div className="flex items-center justify-between mb-4">
                              <div>
                                <h4 className="font-bold text-lg text-blue-900 flex items-center">
                                  <Clock size={24} className="mr-2" />
                                  ⏱️ ระยะเวลาตรวจสอบงาน
                                </h4>
                                <p className="text-blue-700 text-sm mt-1">
                                  คุณมีเวลา 5 นาทีในการตรวจสอบและยื่น Dispute (ถ้าจำเป็น)
                                </p>
                              </div>
                              <div className="text-center">
                                <div className="text-4xl font-bold text-blue-600">
                                  {disputeWindowRemaining}
                                </div>
                                <p className="text-blue-500 text-sm">เหลือเวลา</p>
                              </div>
                            </div>
                            <div className="bg-white p-4 rounded-lg border border-blue-200">
                              <p className="text-blue-900 font-bold mb-2">ℹ️ ข้อมูลสำคัญ:</p>
                              <ul className="text-blue-700 text-sm space-y-1">
                                <li>✅ หากคุณพอใจกับผลงาน สามารถอนุมัติได้ทันที</li>
                                <li>⚠️ หากมีปัญหา กด "ยื่น Dispute" ภายใน 5 นาที</li>
                                <li>⏰ หมดเวลาช่วงนี้ไม่ได้หมายความว่าระบบจะอนุมัติให้อัตโนมัติ — ต้องกดอนุมัติด้วยตนเอง</li>
                              </ul>
                            </div>
                          </div>
                        )}

                        {(() => {
                          const ex = job.payment_details?.provider_completion_extras;
                          if (!ex || typeof ex !== "object") return null;
                          const total =
                            Number((ex as { extras_total_thb?: number }).extras_total_thb) ||
                            (Number((ex as { meter_thb?: number }).meter_thb) || 0) +
                              (Number((ex as { toll_thb?: number }).toll_thb) || 0) +
                              (Number((ex as { parking_thb?: number }).parking_thb) || 0) +
                              (Number((ex as { other_thb?: number }).other_thb) || 0);
                          const hasLine =
                            total > 0 ||
                            !!(ex as { note?: string }).note ||
                            (Number((ex as { meter_thb?: number }).meter_thb) || 0) > 0 ||
                            (Number((ex as { toll_thb?: number }).toll_thb) || 0) > 0 ||
                            (Number((ex as { parking_thb?: number }).parking_thb) || 0) > 0 ||
                            (Number((ex as { other_thb?: number }).other_thb) || 0) > 0;
                          if (!hasLine) return null;
                          return (
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 p-4 text-sm text-emerald-950">
                              <h4 className="font-bold text-emerald-900 mb-2 flex items-center gap-2">
                                <ClipboardList size={18} />
                                {t("detail.employer_extras_reported_title")}
                              </h4>
                              <p className="text-xs text-emerald-800/90 mb-3">{t("detail.employer_extras_reported_sub")}</p>
                              <ul className="space-y-1 text-xs tabular-nums">
                                {(Number((ex as { meter_thb?: number }).meter_thb) || 0) > 0 && (
                                  <li className="flex justify-between gap-2">
                                    <span>{t("detail.completion_meter")}</span>
                                    <span>฿{(Number((ex as { meter_thb?: number }).meter_thb) || 0).toLocaleString()}</span>
                                  </li>
                                )}
                                {(Number((ex as { toll_thb?: number }).toll_thb) || 0) > 0 && (
                                  <li className="flex justify-between gap-2">
                                    <span>{t("detail.completion_toll")}</span>
                                    <span>฿{(Number((ex as { toll_thb?: number }).toll_thb) || 0).toLocaleString()}</span>
                                  </li>
                                )}
                                {(Number((ex as { parking_thb?: number }).parking_thb) || 0) > 0 && (
                                  <li className="flex justify-between gap-2">
                                    <span>{t("detail.completion_parking")}</span>
                                    <span>฿{(Number((ex as { parking_thb?: number }).parking_thb) || 0).toLocaleString()}</span>
                                  </li>
                                )}
                                {(Number((ex as { other_thb?: number }).other_thb) || 0) > 0 && (
                                  <li className="flex justify-between gap-2">
                                    <span>{t("detail.completion_other")}</span>
                                    <span>฿{(Number((ex as { other_thb?: number }).other_thb) || 0).toLocaleString()}</span>
                                  </li>
                                )}
                                {total > 0 && (
                                  <li className="flex justify-between gap-2 pt-2 border-t border-emerald-200 font-semibold">
                                    <span>{t("detail.completion_extras_total")}</span>
                                    <span>฿{total.toLocaleString()}</span>
                                  </li>
                                )}
                              </ul>
                              {(ex as { note?: string }).note ? (
                                <p className="mt-2 text-xs text-emerald-900/95 whitespace-pre-wrap border-t border-emerald-200 pt-2">
                                  {(ex as { note?: string }).note}
                                </p>
                              ) : null}
                            </div>
                          );
                        })()}

                        <div className="bg-purple-50 p-4 rounded-lg border border-purple-100 text-sm text-purple-800">
                          <strong>{t("detail.owner_action_req")}</strong>
                          <strong>กรุณาตรวจสอบผลงานก่อนอนุมัติ</strong>
                          <p className="mt-1">1. {t("detail.verify_work")}</p>
                          <p className="mt-1">1. ตรวจสอบรูปผลงานในแชท</p>
                          <p>2. {t("detail.click_approve")}</p>
                          <p>2. คลิกปุ่มอนุมัติเมื่องานถูกต้องตามที่ตกลง</p>
                          <p>3. หลังอนุมัติ ระบบกันเงินไว้ตามกลาง 5 นาที แล้วจึงปล่อยให้ผู้รับงาน</p>
                        </div>
                        {proofPhotosRequired && !hasReviewedProof && (
                          <div className="text-center py-2">
                            <p className="text-xs text-red-500 font-bold animate-pulse">
                              {t("detail.must_view_proof")}
                            </p>
                          </div>
                        )}
                        {/* Premium Protect — งานส่งแล้ว: ซื้อไม่ได้อีก; ถ้าซื้อแล้ว แสดงใบการันตี ไม่มี checkbox */}
                        {(job.status === JobStatus.WAITING_FOR_APPROVAL || job.status === JobStatus.WAITING_FOR_PAYMENT) && job.has_insurance && (
                          <div className="mb-4 overflow-hidden rounded-2xl border border-amber-400/80 bg-white/95 backdrop-blur-xl shadow-xl shadow-amber-300/25 ring-2 ring-amber-400/30">
                            <div className="border-b border-amber-200/60 bg-gradient-to-r from-amber-50 via-amber-50/80 to-amber-100/60 px-5 py-4">
                              <div className="flex items-center gap-2.5">
                                <span className="rounded-full bg-amber-500/25 px-2.5 py-1 text-xs font-bold uppercase tracking-widest text-amber-800">Premium Protect</span>
                                <Shield size={20} className="text-amber-700" strokeWidth={2} />
                              </div>
                              <h4 className="mt-2 text-base font-bold text-slate-900 tracking-tight">{t("detail.insurance_title")}</h4>
                              <p className="text-sm text-emerald-700 font-medium mt-1">✓ มีใบการันตีประกันงานไว้แล้ว</p>
                            </div>
                            <div className="border-t border-slate-200/80 px-5 pb-5 pt-4 space-y-2.5 text-sm bg-slate-50/50">
                            <div className="flex justify-between items-center gap-4 text-slate-600">
                              <span>{t("detail.job_fee")}</span>
                              <span className="font-semibold text-slate-800 tabular-nums text-right min-w-[72px]">{jobFeeRounded.toLocaleString()} {t("detail.thb")}</span>
                            </div>
                            <div className="flex justify-between items-center gap-4 text-amber-800 font-medium">
                              <span>{t("detail.insurance_fee")} ({insuranceRatePercent}%)</span>
                              <span className="font-semibold tabular-nums text-right min-w-[72px]">+{insuranceAmount.toLocaleString()} {t("detail.thb")}</span>
                            </div>
                            <div className="flex justify-between items-center gap-4 text-slate-600">
                              <span>{t("detail.service_fee")} ({paymentMarkupPercent}%)</span>
                              <span className="font-semibold text-slate-800 tabular-nums text-right min-w-[72px]">+{round2((jobFeeRounded + insuranceAmount) * markupRate).toLocaleString()} {t("detail.thb")}</span>
                            </div>
                            <div className="flex justify-between items-center gap-4 border-t border-slate-200 pt-3 font-bold text-slate-900 text-base">
                              <span>{t("detail.total_pay")}</span>
                              <span className="tabular-nums text-right min-w-[72px]">{totalPrice.toLocaleString()} {t("detail.thb")}</span>
                            </div>
                              <VipDiscountDisplay vip_tier={user?.vip_tier} vip_quota_balance={user?.vip_quota_balance} vip_expiry={user?.vip_expiry} commissionAmount={jobFeeRounded} className="mt-3" />
                              <VipQuotaInfo vip_tier={user?.vip_tier} vip_quota_balance={user?.vip_quota_balance} vip_expiry={user?.vip_expiry} className="mt-1" />
                            </div>
                          </div>
                        )}
                        {canAutoPay ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between bg-emerald-50 p-3 rounded-lg text-emerald-800 text-sm">
                              <span className="flex items-center">
                                <Wallet size={16} className="mr-2" />{" "}
                                {t("detail.wallet_balance_label")}:
                              </span>
                              <span className="font-bold">
                                {user?.wallet_balance} THB
                              </span>
                            </div>
                            <button
                              onClick={handleApproveWork}
                              disabled={processingPay || (proofPhotosRequired && !hasReviewedProof)}
                              className={`w-full py-3 font-bold rounded-lg transition-colors flex items-center justify-center shadow-lg shadow-emerald-200 ${
                                proofPhotosRequired && !hasReviewedProof
                                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                                  : "bg-emerald-600 hover:bg-emerald-700 text-white animate-pulse"
                              }`}
                            >
                              {processingPay ? (
                                t("detail.approving")
                              ) : (
                                <>
                                  <CheckCircle className="mr-2" />{" "}
                                  {t("detail.approve_and_release")}
                                </>
                              )}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setShowDisputeModal(true)}
                            disabled={proofPhotosRequired && !hasReviewedProof}
                            className={`w-full py-3 font-bold rounded-lg transition-colors flex items-center justify-center shadow-lg shadow-emerald-200 ${
                              proofPhotosRequired && !hasReviewedProof
                                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                                : "bg-emerald-600 hover:bg-emerald-700 text-white animate-pulse"
                            }`}
                          >
                            <CreditCard className="mr-2" />{" "}
                            {t("detail.pay_btn")}
                          </button>
                        )}
                        {/* 💰 Phase 5: Dispute Button (เปิดใช้งานเฉพาะภายใน dispute window) */}
                        <button
                          onClick={() => setShowDisputeModal(true)}
                          disabled={!disputeWindowRemaining || ((job.dispute_status || 'none') !== 'none')}
                          className={`w-full py-3 font-bold rounded-lg transition-colors flex items-center justify-center ${
                            !disputeWindowRemaining || ((job.dispute_status || 'none') !== 'none')
                              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                              : 'bg-white border-2 border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400'
                          }`}
                        >
                          <AlertTriangle size={18} className="mr-2" />{" "}
                          {t("รายงานปัญหา")}
                        </button>
                        <button
                          type="button"
                          onClick={handleContactSupportFromDispute}
                          className="w-full py-2.5 font-semibold rounded-lg transition-colors flex items-center justify-center bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                        >
                          {t("ติดต่อฝ่ายสนับสนุน")}
                        </button>
                      </div>
                    )}

                    {/* OPEN / ACCEPTED / IN_PROGRESS: Premium Protect — แสดงช่องติ๊กเมื่อ OPEN (ก่อน provider รับ) เพื่อให้ hold หักค่าประกัน; ถ้าซื้อแล้ว แสดงใบการันตี */}
                    {isOwner &&
                      (job.status === JobStatus.OPEN || job.status === JobStatus.ACCEPTED || job.status === JobStatus.IN_PROGRESS) && (
                      job.has_insurance ? (
                        <div className="mb-4 overflow-hidden rounded-2xl border border-amber-400/80 bg-white/90 backdrop-blur-sm shadow-xl shadow-amber-200/30 ring-2 ring-amber-400/30">
                          <div className="border-b border-amber-200/60 bg-gradient-to-r from-amber-50 via-amber-50/80 to-amber-100/60 px-5 py-4">
                            <div className="flex items-center gap-2.5">
                              <span className="rounded-full bg-amber-500/25 px-2.5 py-1 text-xs font-bold uppercase tracking-widest text-amber-800">Premium Protect</span>
                              <Shield size={20} className="text-amber-700" strokeWidth={2} />
                            </div>
                            <h4 className="mt-2 text-base font-bold text-slate-900 tracking-tight">{t("detail.insurance_title")}</h4>
                            <p className="text-sm text-emerald-700 font-medium mt-1">✓ มีใบการันตีประกันงานไว้แล้ว</p>
                          </div>
                          <div className="border-t border-slate-200/80 px-5 pb-5 pt-4 space-y-2.5 text-sm bg-slate-50/50">
                            <div className="flex justify-between items-center gap-4 text-slate-600">
                              <span>{t("detail.job_fee")}</span>
                              <span className="font-semibold text-slate-800 tabular-nums text-right min-w-[72px]">{jobFeeRounded.toLocaleString()} {t("detail.thb")}</span>
                            </div>
                            <div className="flex justify-between items-center gap-4 text-amber-800 font-medium">
                              <span>{t("detail.insurance_fee")} ({insuranceRatePercent}%)</span>
                              <span className="font-semibold tabular-nums text-right min-w-[72px]">+{insuranceAmount.toLocaleString()} {t("detail.thb")}</span>
                            </div>
                            <div className="flex justify-between items-center gap-4 text-slate-600">
                              <span>{t("detail.service_fee")} ({paymentMarkupPercent}%)</span>
                              <span className="font-semibold text-slate-800 tabular-nums text-right min-w-[72px]">+{round2((jobFeeRounded + insuranceAmount) * markupRate).toLocaleString()} {t("detail.thb")}</span>
                            </div>
                            <div className="flex justify-between items-center gap-4 border-t border-slate-200 pt-3 font-bold text-slate-900 text-base">
                              <span>{t("detail.total_on_approve")}</span>
                              <span className="tabular-nums text-right min-w-[72px]">{totalPrice.toLocaleString()} {t("detail.thb")}</span>
                            </div>
                            <VipDiscountDisplay vip_tier={user?.vip_tier} vip_quota_balance={user?.vip_quota_balance} vip_expiry={user?.vip_expiry} commissionAmount={jobFeeRounded} className="mt-3" />
                            <VipQuotaInfo vip_tier={user?.vip_tier} vip_quota_balance={user?.vip_quota_balance} vip_expiry={user?.vip_expiry} className="mt-1" />
                          </div>
                        </div>
                      ) : (
                        <div className="mb-4 overflow-hidden rounded-2xl border border-amber-300/70 bg-white/90 backdrop-blur-sm shadow-xl shadow-amber-200/30 ring-1 ring-amber-200/50">
                          <div className="border-b border-amber-200/60 bg-gradient-to-r from-amber-50 via-amber-50/80 to-amber-100/60 px-5 py-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <span className="rounded-full bg-amber-500/25 px-2.5 py-1 text-xs font-bold uppercase tracking-widest text-amber-800">Premium Protect</span>
                                <Shield size={20} className="text-amber-700" strokeWidth={2} />
                              </div>
                              <button type="button" onClick={() => fetchInsuranceRate()} className="p-2 rounded-xl hover:bg-amber-200/50 text-amber-700 transition-colors" title={t("detail.insurance_rate")}>
                                <RefreshCw size={16} />
                              </button>
                            </div>
                            <h4 className="mt-2 text-base font-bold text-slate-900 tracking-tight">{t("detail.insurance_title")}</h4>
                            <p className="text-sm text-slate-600 mt-1 leading-relaxed">{t("detail.insurance_subtitle")}</p>
                          </div>
                          <label className="flex cursor-pointer select-none items-start gap-4 p-5 hover:bg-amber-50/30 transition-colors">
                            <input
                              type="checkbox"
                              checked={hasInsurance}
                              onChange={(e) => setHasInsurance(e.target.checked)}
                              className="mt-0.5 h-5 w-5 rounded-md border-2 border-amber-400 text-amber-600 focus:ring-2 focus:ring-amber-400 focus:ring-offset-2"
                            />
                            <span className="text-sm font-semibold text-slate-800">{t("detail.insurance_add")}</span>
                          </label>
                          <div className="border-t border-slate-200/80 px-5 pb-5 pt-4 space-y-2.5 text-sm bg-slate-50/50">
                            <div className="flex justify-between items-center gap-4 text-slate-600">
                              <span>{t("detail.job_fee")}</span>
                              <span className="font-semibold text-slate-800 tabular-nums text-right min-w-[72px]">{jobFeeRounded.toLocaleString()} {t("detail.thb")}</span>
                            </div>
                            {hasInsurance && (
                              <div className="flex justify-between items-center gap-4 text-amber-800 font-medium">
                                <span>{t("detail.insurance_fee")} ({insuranceRatePercent}%)</span>
                                <span className="font-semibold tabular-nums text-right min-w-[72px]">+{insuranceAmount.toLocaleString()} {t("detail.thb")}</span>
                              </div>
                            )}
                            <div className="flex justify-between items-center gap-4 text-slate-600">
                              <span>{t("detail.service_fee")} ({paymentMarkupPercent}%)</span>
                              <span className="font-semibold text-slate-800 tabular-nums text-right min-w-[72px]">+{round2((jobFeeRounded + insuranceAmount) * markupRate).toLocaleString()} {t("detail.thb")}</span>
                            </div>
                            <div className="flex justify-between items-center gap-4 border-t border-slate-200 pt-3 font-bold text-slate-900 text-base">
                              <span>{t("detail.total_on_approve")}</span>
                              <span className="tabular-nums text-right min-w-[72px]">{totalPrice.toLocaleString()} {t("detail.thb")}</span>
                            </div>
                            <VipDiscountDisplay vip_tier={user?.vip_tier} vip_quota_balance={user?.vip_quota_balance} vip_expiry={user?.vip_expiry} commissionAmount={jobFeeRounded} className="mt-3" />
                            <VipQuotaInfo vip_tier={user?.vip_tier} vip_quota_balance={user?.vip_quota_balance} vip_expiry={user?.vip_expiry} className="mt-1" />
                          </div>
                        </div>
                      )
                    )}

                    {/* ALL OTHER STATUS: Cancel Button */}
                    {![
                      JobStatus.COMPLETED,
                      JobStatus.CANCELLED,
                      JobStatus.DISPUTE,
                    ].includes(job.status) &&
                      isOwner && (
                        <button
                          onClick={handleCancelClick}
                          className="w-full py-3 bg-white border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 font-medium rounded-lg transition-colors flex items-center justify-center mt-2"
                        >
                          <XCircle className="mr-2" size={18} />{" "}
                          {t("detail.cancel")}
                        </button>
                      )}
                    {/* ==================== 🗺️ REAL-TIME DRIVER TRACKING (สำหรับเจ้าของงานเท่านั้น) ==================== */}
                    {isOwner &&
                      job.accepted_by &&
                      (job.status === "in_progress" ||
                        job.status === "accepted") && (
                        <div
                          id="job-flow-employer-live"
                          className={`lg:col-span-3 mt-8 ${flowRing(
                            !!jobFlow &&
                              jobFlow.role === "employer" &&
                              (jobFlow.stepKey === "track" ||
                                jobFlow.stepKey === "work" ||
                                (jobFlow.stepKey === "review" &&
                                  job.status !== JobStatus.WAITING_FOR_APPROVAL))
                          )}`}
                        >
                          <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-200/40">
                            <div className="border-b border-slate-100 bg-slate-50/90 p-6">
                              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div>
                                  <h3 className="flex items-center text-xl font-bold text-slate-900">
                                    <Navigation
                                      className="mr-3 text-emerald-600"
                                      size={24}
                                    />
                                    ติดตามผู้รับงานแบบเรียลไทม์
                                  </h3>
                                  <p className="mt-1 flex flex-wrap items-center gap-2 text-slate-600">
                                    <span>
                                      ตำแหน่งปัจจุบันของ{" "}
                                      {job.accepted_by_name || "ผู้รับงาน"}{" "}
                                      ที่กำลังมาทำงานให้คุณ
                                    </span>
                                    {showJobBaBadge(providerBa) && (
                                      <BrandAdviserBadge
                                        isBrandAdviser
                                        adviserStatus={providerBa?.adviser_status}
                                        tone="light"
                                      />
                                    )}
                                  </p>
                                  {/* ข้อมูลผู้รับงานจาก Thai ID + รูปโปรไฟล์ */}
                                  {(job as any).provider_profile && ((job as any).provider_profile.avatar_url || (job as any).provider_profile.kyc_full_name || (job as any).provider_profile.vehicle_type || (job as any).provider_profile.vehicle_reg) && (
                                    <div className="mt-3 rounded-lg border border-slate-200 bg-white/90 p-3 text-sm">
                                      <div className="flex items-start gap-3">
                                        {(job as any).provider_profile.avatar_url ? (
                                          <img
                                            src={(job as any).provider_profile.avatar_url}
                                            alt="ผู้รับงาน"
                                            className="w-14 h-14 rounded-full object-cover border-2 border-blue-200 shrink-0"
                                          />
                                        ) : (
                                          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-100">
                                            <User size={28} className="text-slate-600" />
                                          </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                          <div className="mb-1 font-medium text-slate-800">ข้อมูลผู้รับงาน (จาก Thai ID)</div>
                                          <div className="flex flex-wrap gap-x-4 gap-y-0 text-slate-700">
                                        {(job as any).provider_profile.kyc_full_name && (
                                          <span>ชื่อ-นามสกุลจริง: <strong>{(job as any).provider_profile.kyc_full_name}</strong></span>
                                        )}
                                        {(job as any).provider_profile.vehicle_type && (
                                          <span>ประเภทรถ: {getVehicleTypeLabel((job as any).provider_profile.vehicle_type)}</span>
                                        )}
                                        {(job as any).provider_profile.vehicle_reg && (
                                          <span>ทะเบียนรถ: <strong>{(job as any).provider_profile.vehicle_reg}</strong></span>
                                        )}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center space-x-2">
                                  {/* ✅ Arrival Status Badge */}
                                  {job.status === 'in_progress' && job.arrived_at ? (
                                    <div className="flex items-center bg-green-500 text-white px-4 py-2 rounded-lg">
                                      <CheckCircle size={16} className="mr-2" />
                                      <span className="font-bold">✅ มาถึงแล้ว!</span>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse"></div>
                                      <span className="text-sm font-medium text-blue-700">
                                        🚗 กำลังเดินทาง...
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* 📍 Arrival Notification for Employer */}
                            {job.status === 'in_progress' && job.arrived_at && (
                              <div className="p-4 bg-gradient-to-r from-green-100 to-emerald-100 border-b border-green-200">
                                <div className="flex items-center justify-center">
                                  <CheckCircle className="text-green-600 mr-2" size={24} />
                                  <div>
                                    <p className="font-bold text-green-900">
                                      ผู้รับงานมาถึงแล้ว!
                                    </p>
                                    <p className="text-sm text-green-700">
                                      เวลา: {new Date(job.arrived_at).toLocaleString('th-TH', {
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })} น.
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}
                            <div className="p-6">
                              {/* 🚗 Real-time Driver Tracking Component */}
                              <DriverTracking
                                driverId={job.accepted_by}
                                jobId={job.id}
                                height="500px"
                                showControls={true}
                              />

                              {/* 📸 Phase 4: Before/After Photos Display for Employer */}
                              {(job.before_photo_url || job.after_photo_url) && (
                                <div className="mt-6 p-6 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border-2 border-purple-200">
                                  <h4 className="font-bold text-lg text-purple-900 mb-4 flex items-center">
                                    <Camera size={24} className="mr-2" />
                                    📸 รูปถ่ายก่อน/หลังทำงาน
                                  </h4>
                                  
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Before Photo */}
                                    {job.before_photo_url && (
                                      <div className="bg-white p-4 rounded-xl shadow-md">
                                        <h5 className="font-bold text-orange-700 mb-3 flex items-center">
                                          <Camera size={18} className="mr-2" />
                                          📷 ก่อนทำงาน (Before)
                                        </h5>
                                        <img
                                          src={job.before_photo_url}
                                          alt="Before"
                                          className="w-full h-64 object-cover rounded-lg border-2 border-orange-300 cursor-pointer hover:scale-105 transition-transform"
                                          onClick={() => window.open(job.before_photo_url, '_blank')}
                                        />
                                      </div>
                                    )}

                                    {/* After Photo */}
                                    {job.after_photo_url && (
                                      <div className="bg-white p-4 rounded-xl shadow-md">
                                        <h5 className="font-bold text-green-700 mb-3 flex items-center">
                                          <Camera size={18} className="mr-2" />
                                          📷 หลังทำงาน (After)
                                        </h5>
                                        <img
                                          src={job.after_photo_url}
                                          alt="After"
                                          className="w-full h-64 object-cover rounded-lg border-2 border-green-300 cursor-pointer hover:scale-105 transition-transform"
                                          onClick={() => window.open(job.after_photo_url, '_blank')}
                                        />
                                      </div>
                                    )}
                                  </div>

                                  {job.photos_uploaded_at && (
                                    <p className="text-center text-purple-600 text-sm mt-4">
                                      อัปโหลดเมื่อ: {new Date(job.photos_uploaded_at).toLocaleString('th-TH', {
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })}
                                    </p>
                                  )}
                                </div>
                              )}

                              {/* ข้อมูลเพิ่มเติมสำหรับเจ้าของงาน */}
                              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-blue-50 p-4 rounded-lg">
                                  <div className="text-sm text-blue-500 font-medium">
                                    สถานะผู้รับงาน
                                  </div>
                                  <div className="text-lg font-bold text-blue-700">
                                    {job.status === "in_progress"
                                      ? "กำลังดำเนินงาน"
                                      : "รับงานแล้ว"}
                                  </div>
                                </div>
                                <div className="bg-emerald-50 p-4 rounded-lg">
                                  <div className="text-sm text-emerald-500 font-medium">
                                    เวลาเริ่มงาน
                                  </div>
                                  <div className="text-lg font-bold text-emerald-700">
                                    {job.started_at
                                      ? new Date(
                                          job.started_at
                                        ).toLocaleTimeString("th-TH", {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })
                                      : "รอเริ่มงาน"}
                                  </div>
                                </div>
                                <div className="bg-purple-50 p-4 rounded-lg">
                                  <div className="text-sm text-purple-500 font-medium">
                                    สามารถติดต่อได้ที่
                                  </div>
                                  <div className="text-lg font-bold text-purple-700">
                                    <a
                                      href={`tel:${
                                        (job.accepted_by_phone ||
                                          (job as any)?.provider_profile?.phone ||
                                          (job as any)?.provider_profile?.phone_number ||
                                          "#")
                                      }`}
                                      className="hover:text-purple-800"
                                    >
                                      {job.accepted_by_phone ||
                                        (job as any)?.provider_profile?.phone ||
                                        (job as any)?.provider_profile?.phone_number ||
                                        "ไม่ระบุ"}
                                    </a>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                  </>
                )}
              </div>
            </div>
            </div>
            </div>
          </div>
      </div>
      {/* ==================== 🗺️ PROVIDER WORK MAP (สำหรับผู้รับงานเท่านั้น) ==================== */}
      {isAssignedProvider &&
        job?.location &&
        (job.status === "accepted" || job.status === "in_progress") && (
          <div
            id="job-flow-provider-map"
            className={`job-detail-provider-panel job-detail-provider-card lg:col-span-3 mt-6 sm:mt-8 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-200/40 scroll-mt-24 ${flowRing(
              !!jobFlow &&
                jobFlow.role === "provider" &&
                jobFlow.stepKey === "go"
            )}`}
          >
              {/* Header — แนว Lineman: กระชับ ไม่ใช่แถบเขียวเต็มความสูง */}
              <div className="border-b border-slate-100 bg-white px-4 py-3 sm:px-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                        <MapPin size={16} strokeWidth={2.25} />
                      </span>
                      <span className="leading-tight">แผนที่ · นำทางไปจุดงาน</span>
                    </h3>
                    <p className="mt-1 line-clamp-2 pl-10 text-xs text-slate-500">{job.title}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pl-10 sm:pl-0 sm:justify-end">
                    {isLocationTracking && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800 ring-1 ring-emerald-100">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                        ส่งตำแหน่งอยู่
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowMap(!showMap)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
                    >
                      {showMap ? "ซ่อนแผนที่" : "แสดงแผนที่"}
                    </button>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${job.location.lat},${job.location.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
                    >
                      <Navigation size={14} />
                      Google Maps
                    </a>
                  </div>
                </div>
              </div>

              {/* 📍 Phase 3: Arrival Confirmation Button */}
              {job.status === 'accepted' && isAssignedProvider && (
                <div
                  id="job-flow-provider-arrival"
                  className={`border-b border-slate-100 bg-slate-50/90 p-6 ${flowRing(
                    !!jobFlow &&
                      jobFlow.role === "provider" &&
                      jobFlow.stepKey === "arrive"
                  )}`}
                >
                  <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex-1">
                      <h4 className="mb-2 text-lg font-semibold text-slate-900">
                        ยืนยันการมาถึง
                      </h4>
                      {distanceToDestination !== null ? (
                        <div className="space-y-1">
                          <p className="text-slate-700">
                            ระยะห่างจากจุดหมาย: <span className="font-bold">{distanceToDestination.toFixed(2)} km</span>
                          </p>
                          {distanceToDestination <= 0.5 ? (
                            <p className="text-green-600 font-medium flex items-center">
                              <CheckCircle size={16} className="mr-1" />
                              ✅ คุณอยู่ใกล้พอที่จะยืนยันการมาถึงแล้ว!
                            </p>
                          ) : (
                            <p className="text-orange-600 font-medium flex items-center">
                              <AlertTriangle size={16} className="mr-1" />
                              ⚠️ กรุณาเดินทางให้ใกล้กว่า 500 เมตรก่อนยืนยัน
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-gray-600">กำลังตรวจสอบตำแหน่งของคุณ...</p>
                      )}
                    </div>
                    
                    <button
                      onClick={handleConfirmArrival}
                      disabled={
                        confirmingArrival ||
                        distanceToDestination === null ||
                        distanceToDestination > 0.5 ||
                        !!job.arrived_at ||
                        job.status !== JobStatus.ACCEPTED
                      }
                      className={`px-8 py-4 rounded-xl font-bold text-lg shadow-lg transition-all ${
                        confirmingArrival ||
                        distanceToDestination === null ||
                        (distanceToDestination != null && distanceToDestination > 0.5) ||
                        !!job.arrived_at ||
                        job.status !== JobStatus.ACCEPTED
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600 hover:shadow-xl'
                      }`}
                    >
                      {confirmingArrival ? (
                        <div className="flex items-center">
                          <Loader2 className="animate-spin mr-2" size={20} />
                          กำลังยืนยัน...
                        </div>
                      ) : (
                        <div className="flex items-center">
                          <MapPin className="mr-2" size={20} />
                          ยืนยันการมาถึง
                        </div>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* ✅ Arrival Confirmed Status */}
              {job.status === 'in_progress' && isAssignedProvider && job.arrived_at && (
                <div className="p-6 border-b border-emerald-100 bg-gradient-to-r from-green-50 to-emerald-50">
                  <div className="flex items-center justify-center">
                    <CheckCircle className="text-green-600 mr-3" size={32} />
                    <div>
                      <h4 className="font-bold text-lg text-green-900">
                        ✅ ยืนยันการมาถึงแล้ว!
                      </h4>
                      <p className="text-green-700">
                        เวลามาถึง: {new Date(job.arrived_at).toLocaleString('th-TH', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* 💰 Phase 5: Payment Hold Status (Provider) */}
              {isAssignedProvider && job.escrow_status === 'held' && (
                <div className="p-6 border-b border-amber-100 bg-gradient-to-r from-amber-50 to-yellow-50">
                  <div className="flex items-center mb-3">
                    <DollarSign className="text-amber-600 mr-2" size={24} />
                    <h4 className="font-bold text-lg text-amber-900">
                      💰 เงินถูกกันไว้แล้ว
                    </h4>
                  </div>
                  <p className="text-amber-700 mb-2">
                    จำนวน: <span className="font-bold text-xl">{job.escrow_amount?.toLocaleString()} บาท</span>
                  </p>
                  <p className="text-amber-600 text-sm">
                    ✅ เงินจะถูกปล่อยให้คุณหลังจากผู้จ้างอนุมัติงาน หรืออัตโนมัติภายใน 5 นาทีหลังส่งงาน
                  </p>
                </div>
              )}

              {/* 💰 Phase 5: Provider Withdrawal UI */}
              {isAssignedProvider && job.payment_released && !job.withdrawal_completed && (
                <div className="p-6 border-b border-green-100 bg-gradient-to-r from-green-50 to-emerald-50">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="font-bold text-lg text-green-900 flex items-center">
                        <DollarSign size={24} className="mr-2" />
                        💵 เงินพร้อมถอนแล้ว
                      </h4>
                      <p className="text-green-700 mt-1">
                        จำนวน: <span className="font-bold text-2xl">{jobFeeRounded.toLocaleString()} บาท</span>
                      </p>
                    </div>
                    {!job.withdrawal_requested && (
                      <button
                        onClick={handleRequestWithdrawal}
                        className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold rounded-xl shadow-lg hover:from-green-700 hover:to-emerald-700 transition-all flex items-center"
                      >
                        <DollarSign size={20} className="mr-2" />
                        ขอถอนเงิน
                      </button>
                    )}
                  </div>
                  {job.withdrawal_requested && (
                    <div className="mt-4 p-4 bg-blue-100 border-2 border-blue-300 rounded-lg">
                      <p className="text-blue-900 font-bold">⏳ รอการโอนเงิน</p>
                      <p className="text-blue-700 text-sm mt-1">
                        ระบบจะโอนเงินเข้าบัญชีของคุณภายใน 24 ชั่วโมง
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ลูกค้า + รายละเอียดค่าจ้างครบ (เดียวกับรายได้โดยประมาณ) + ทางลัด */}
              <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-4 sm:px-6">
                <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm ring-1 ring-slate-100/80">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                      ลูกค้า
                    </p>
                    <p className="mt-1 text-lg font-bold leading-tight text-slate-900">
                      {job.created_by_name || "ไม่ระบุชื่อ"}
                    </p>
                    {job.created_by_phone ? (
                      <a
                        href={`tel:${job.created_by_phone}`}
                        className="mt-1 inline-block text-sm font-medium text-emerald-700 hover:underline"
                      >
                        {job.created_by_phone}
                      </a>
                    ) : (
                      <p className="mt-1 text-xs text-slate-400">ไม่มีเบอร์ในระบบ</p>
                    )}
                  </div>

                  <div className="mt-4 overflow-hidden rounded-xl border border-emerald-100 bg-gradient-to-b from-emerald-50/90 to-white p-3 ring-1 ring-emerald-100/60">
                    <div className="mb-2 flex items-center gap-2">
                      <DollarSign size={16} className="shrink-0 text-emerald-700" />
                      <span className="text-xs font-bold text-slate-900">
                        {t("detail.provider_earnings_preview_title")}
                      </span>
                    </div>
                    <div className="rounded-lg bg-emerald-600 px-3 py-2.5 text-white shadow-inner">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-100/95">
                        {t("detail.provider_earnings_net_highlight")}
                      </p>
                      <p className="text-xl font-bold tabular-nums">
                        ฿{talentPreviewBreakdown.talentNet.toLocaleString()}
                      </p>
                    </div>
                    <div className="mt-3 space-y-1.5 text-xs text-slate-800">
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-600">{t("detail.provider_earnings_gross")}</span>
                        <span className="font-semibold tabular-nums">฿{jobFeeRounded.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between gap-3 text-slate-600">
                        <span>{t("detail.provider_earnings_sourcing")}</span>
                        <span className="tabular-nums text-red-700">
                          −฿{talentPreviewBreakdown.sourcingFee.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3 text-slate-600">
                        <span>{t("detail.provider_earnings_commission")}</span>
                        <span className="tabular-nums text-red-700">
                          −฿{talentPreviewBreakdown.commission.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3 text-slate-600">
                        <span>{t("detail.provider_earnings_tax")}</span>
                        <span className="tabular-nums text-red-700">
                          −฿{talentPreviewBreakdown.taxService.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3 border-t border-emerald-100 pt-2 font-bold text-emerald-900">
                        <span>{t("detail.provider_earnings_net")}</span>
                        <span className="tabular-nums">฿{talentPreviewBreakdown.talentNet.toLocaleString()}</span>
                      </div>
                    </div>
                    {job.has_insurance && insuranceAmount > 0 ? (
                      <p className="mt-2 rounded-lg bg-amber-50/90 px-2 py-1.5 text-[10px] leading-snug text-amber-950 ring-1 ring-amber-100">
                        {t("detail.insurance_title")}: +{insuranceAmount.toLocaleString()} {t("detail.thb")}{" "}
                        <span className="text-amber-800/90">({t("detail.insurance_fee")} — ชำระโดยผู้จ้าง)</span>
                      </p>
                    ) : null}
                    <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                      {t("detail.provider_earnings_preview_note")}
                    </p>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                    <button
                      type="button"
                      disabled={!job.created_by_phone}
                      onClick={() =>
                        job.created_by_phone && window.open(`tel:${job.created_by_phone}`)
                      }
                      className="inline-flex flex-1 min-w-[4.5rem] items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-initial"
                    >
                      <Phone size={15} />
                      โทร
                    </button>
                    <button
                      type="button"
                      onClick={() => setChatOverlayOpen(true)}
                      className="inline-flex flex-1 min-w-[4.5rem] items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 sm:flex-initial"
                    >
                      <MessageCircle size={15} />
                      แชท
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
                          job.title
                        )}&dates=${new Date(job.datetime)
                          .toISOString()
                          .replace(/-|:|\.\d+/g, "")}/${new Date(
                          new Date(job.datetime).getTime() +
                            (job.duration_hours || 2) * 60 * 60 * 1000
                        )
                          .toISOString()
                          .replace(/-|:|\.\d+/g, "")}&details=${encodeURIComponent(
                          `งาน: ${job.title}\nที่อยู่: ${
                            job.location.fullAddress || "ไม่ระบุ"
                          }\nราคา: ${jobFeeRounded} บาท`
                        )}`;
                        window.open(calendarUrl, "_blank");
                      }}
                      className="inline-flex flex-1 min-w-[4.5rem] items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 sm:flex-initial"
                    >
                      <Calendar size={15} />
                      ปฏิทิน
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const addr = job.location?.fullAddress || "";
                        if (!addr) return;
                        void navigator.clipboard.writeText(addr).then(() =>
                          notify("คัดลอกที่อยู่แล้ว", "success")
                        );
                      }}
                      className="inline-flex flex-1 min-w-[4.5rem] items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 sm:flex-initial"
                    >
                      <Copy size={15} />
                      ที่อยู่
                    </button>
                  </div>
                  <div className="mt-4 space-y-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                    <div className="flex gap-2">
                      <Clock size={16} className="mt-0.5 shrink-0 text-slate-400" />
                      <div>
                        <span className="text-xs text-slate-500">เวลานัด</span>
                        <p className="font-medium text-slate-900">
                          {new Date(job.datetime).toLocaleString("th-TH", {
                            weekday: "short",
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 border-t border-slate-200/80 pt-2">
                      <MapPin size={16} className="mt-0.5 shrink-0 text-slate-400" />
                      <p className="min-w-0 flex-1 text-sm leading-snug text-slate-800">
                        {job.location.fullAddress || "ไม่ได้ระบุที่อยู่"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Map Section */}
              {showMap && (
                <div className="border-b border-slate-100 px-4 py-4 sm:px-6">
                  <div
                    className="overflow-hidden rounded-2xl border border-slate-200/90 shadow-sm"
                    style={{ height: "min(42vh, 260px)" }}
                  >
                      <MapContainer
                        center={[job.location.lat, job.location.lng]}
                        zoom={14}
                        style={{ height: "100%", width: "100%" }}
                        scrollWheelZoom={true}
                      >
                        <TileLayer
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        />

                        {/* 📍 Marker ตำแหน่งงาน */}
                        <Marker
                          position={[job.location.lat, job.location.lng]}
                          icon={L.divIcon({
                            html: `<div style="
                      background-color: #10B981;
                      width: 35px;
                      height: 35px;
                      border-radius: 50%;
                      border: 3px solid white;
                      box-shadow: 0 3px 10px rgba(0,0,0,0.3);
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      color: white;
                      font-size: 20px;
                      font-weight: bold;
                    ">📍</div>`,
                            className: "custom-marker",
                            iconSize: [35, 35],
                            iconAnchor: [17, 17],
                          })}
                        >
                          <Popup className="custom-popup">
                            <div className="font-bold text-emerald-700 text-lg">
                              📍 ตำแหน่งงาน
                            </div>
                            <div className="text-sm mt-1 font-medium">
                              {job.title}
                            </div>
                            <div className="text-xs text-gray-500 mt-2">
                              {job.location.fullAddress}
                            </div>
                            <div className="mt-2 text-sm">
                              <span className="font-bold text-emerald-600">
                                💰 {jobFeeRounded} บาท
                              </span>
                            </div>
                          </Popup>
                        </Marker>

                        {/* 👤 Marker ตำแหน่งปัจจุบันของผู้รับงาน (ถ้ามี) */}
                        {currentLocation && (
                          <Marker
                            position={[
                              currentLocation.lat,
                              currentLocation.lng,
                            ]}
                            icon={L.divIcon({
                              html: `<div style="
                        background-color: #3B82F6;
                        width: 30px;
                        height: 30px;
                        border-radius: 50%;
                        border: 3px solid white;
                        box-shadow: 0 3px 10px rgba(0,0,0,0.3);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: white;
                        font-weight: bold;
                        font-size: 16px;
                      ">👤</div>`,
                              className: "custom-marker",
                              iconSize: [30, 30],
                              iconAnchor: [15, 15],
                            })}
                          >
                            <Popup>
                              <div className="font-bold text-blue-700">
                                📍 ตำแหน่งปัจจุบันของคุณ
                              </div>
                              <div className="text-sm mt-1">
                                ระยะทางถึงงาน:{" "}
                                {calculateDistance(
                                  {
                                    lat: currentLocation.lat,
                                    lng: currentLocation.lng,
                                  },
                                  job.location
                                ).toFixed(1)}{" "}
                                กม.
                              </div>
                            </Popup>
                          </Marker>
                        )}
                      </MapContainer>
                  </div>
                  {currentLocation && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-700 sm:text-sm">
                      <span>
                        ระยะทาง ~{" "}
                        <strong className="tabular-nums text-slate-900">
                          {calculateDistance(
                            { lat: currentLocation.lat, lng: currentLocation.lng },
                            job.location
                          ).toFixed(1)}{" "}
                          กม.
                        </strong>
                      </span>
                      <span className="text-slate-500">
                        ประมาณ{" "}
                        <strong className="tabular-nums text-slate-800">
                          {Math.round(
                            calculateDistance(
                              { lat: currentLocation.lat, lng: currentLocation.lng },
                              job.location
                            ) * 10
                          )}{" "}
                          นาที
                        </strong>
                      </span>
                    </div>
                  )}
                </div>
              )}

          </div>
        )}
        </div>
      </div>
    </div>
    </VipThemeWrapper>
    {job &&
      chatOverlayOpen &&
      createPortal(
        <>
        <div
          className="job-detail-chat fixed inset-0 z-[10050] flex min-h-0 flex-col bg-white"
          style={{ minHeight: "100dvh" }}
          role="dialog"
          aria-modal="true"
          aria-label={t("detail.chat_fullscreen_title")}
        >
          <header className="shrink-0 border-b border-slate-200 bg-white pt-[max(0.5rem,env(safe-area-inset-top))]">
            <div className="flex items-center justify-between px-2 sm:px-3">
              <button
                type="button"
                onClick={
                  staffSupportPhase
                    ? handleStaffSupportHeaderLeft
                    : chatOverlayTab === "help" && helpSelectedTopicKey
                      ? handleHelpTopicBack
                      : closeChatOverlay
                }
                className="shrink-0 rounded-full p-2 text-slate-700 hover:bg-slate-100 active:scale-95"
                aria-label={
                  staffSupportPhase
                    ? staffSupportPhase === "csat_staff" ||
                      staffSupportPhase === "csat_app"
                      ? t("detail.chat_back")
                      : t("detail.chat_close")
                    : chatOverlayTab === "help" && helpSelectedTopicKey
                      ? t("detail.chat_back")
                      : t("detail.chat_close")
                }
              >
                {staffSupportPhase === "csat_staff" ||
                staffSupportPhase === "csat_app" ? (
                  <ChevronLeft size={22} strokeWidth={2.25} />
                ) : staffSupportPhase ? (
                  <X size={22} strokeWidth={2.25} />
                ) : chatOverlayTab === "help" && helpSelectedTopicKey ? (
                  <ChevronLeft size={22} strokeWidth={2.25} />
                ) : (
                  <X size={22} strokeWidth={2.25} />
                )}
              </button>
              <p className="min-w-0 flex-1 text-center text-sm font-semibold text-slate-900">
                {staffSupportPhase === "connecting"
                  ? t("detail.help_staff_connecting_title")
                  : staffSupportPhase === "queueing"
                    ? t("detail.help_staff_queue_header")
                    : staffSupportPhase === "chat"
                      ? t("detail.help_staff_chat_title")
                      : staffSupportPhase === "csat_staff" ||
                          staffSupportPhase === "csat_app"
                        ? t("detail.help_staff_csat_center")
                        : chatOverlayTab === "help" && helpSelectedTopicKey
                          ? t("detail.help_livechat_title")
                          : chatOverlayTab === "help"
                            ? t("detail.help_screen_title")
                            : isOwner
                              ? t("detail.chat_screen_title_employer")
                              : t("detail.chat_screen_title_provider")}
              </p>
              {staffSupportPhase === "queueing" || staffSupportPhase === "chat" ? (
                <button
                  type="button"
                  onClick={() =>
                    notify(
                      language === "th"
                        ? "ย่อหน้าต่าง — ฟีเจอร์นี้จะมาในเวอร์ชันถัดไป"
                        : "Minimize — coming in a future update",
                      "info"
                    )
                  }
                  className="shrink-0 rounded-full p-2 text-sky-600 hover:bg-sky-50 active:scale-95"
                  aria-label="Minimize"
                >
                  <Minimize2 size={22} strokeWidth={2.25} />
                </button>
              ) : staffSupportPhase === "csat_staff" ||
                staffSupportPhase === "csat_app" ? (
                <button
                  type="button"
                  onClick={handleStaffSupportDismiss}
                  className="shrink-0 rounded-full p-2 text-sky-600 hover:bg-sky-50 active:scale-95"
                  aria-label={t("detail.chat_close")}
                >
                  <X size={22} strokeWidth={2.25} />
                </button>
              ) : (
                <div className="w-10 shrink-0" aria-hidden />
              )}
            </div>
            {!(chatOverlayTab === "help" && helpSelectedTopicKey) &&
              !staffSupportPhase && (
              <div className="flex gap-2 px-3 pb-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    if (staffSupportPhase) resetStaffSupportFlow();
                    setChatOverlayTab("chat");
                    setHelpSelectedTopicKey(null);
                    setHelpSelectedSubKey(null);
                  }}
                  className={`min-h-[40px] flex-1 rounded-full py-2 text-center text-sm font-semibold transition-colors ${
                    chatOverlayTab === "chat"
                      ? "bg-pink-500 text-white shadow-md shadow-pink-200"
                      : "border border-slate-200 bg-slate-50 text-slate-700 hover:border-pink-200 hover:bg-pink-50/50"
                  }`}
                >
                  {t("detail.help_tab_chat")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (staffSupportPhase) resetStaffSupportFlow();
                    setChatOverlayTab("help");
                    setHelpSelectedTopicKey(null);
                    setHelpSelectedSubKey(null);
                  }}
                  className={`min-h-[40px] flex-1 rounded-full py-2 text-center text-sm font-semibold transition-colors ${
                    chatOverlayTab === "help"
                      ? "bg-pink-500 text-white shadow-md shadow-pink-200"
                      : "border border-slate-200 bg-slate-50 text-slate-700 hover:border-pink-200 hover:bg-pink-50/50"
                  }`}
                >
                  {t("detail.help_tab_help")}
                </button>
              </div>
            )}
            {chatOverlayTab === "help" &&
              !helpSelectedTopicKey &&
              !staffSupportPhase && (
              <p className="border-b border-slate-100 bg-slate-50/90 px-3 py-1.5 text-center text-[11px] font-medium text-slate-500">
                {t("detail.help_context_subtitle")}
              </p>
            )}
            {chatOverlayTab === "chat" && (
            <div className="flex items-start gap-3 px-3 pb-3 pt-2">
              {(() => {
                const headerAvatarUrl = isOwner
                  ? (job as any).provider_profile?.avatar_url
                  : (job as any).created_by_avatar;
                return headerAvatarUrl ? (
                  <img
                    src={headerAvatarUrl}
                    alt=""
                    className="h-11 w-11 shrink-0 rounded-full border border-slate-200 object-cover shadow-sm"
                  />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100">
                    <User size={22} className="text-slate-500" />
                  </div>
                );
              })()}
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-500">
                  <span>{t("detail.order_ref_label")}</span>{" "}
                  <span className="font-mono font-medium text-slate-700">
                    {jobReferenceCode || "—"}
                  </span>
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="min-w-0 truncate text-base font-semibold text-slate-900">
                    {isOwner
                      ? job.accepted_by_name || "Provider"
                      : job.created_by_name || "Owner"}
                  </span>
                  <VIPBadge
                    tier={
                      isOwner
                        ? (job as any).accepted_by_vip_tier
                        : (job as any).created_by_vip_tier
                    }
                    size="sm"
                    showLabel
                  />
                  {showJobBaBadge(isOwner ? providerBa : employerBa) && (
                    <BrandAdviserBadge
                      isBrandAdviser
                      adviserStatus={
                        (isOwner ? providerBa : employerBa)?.adviser_status
                      }
                      tone="light"
                    />
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={callChatCounterpart}
                disabled={!chatCounterpartPhone || chatCallWindowClosed}
                className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-emerald-700 shadow-sm transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={t("detail.chat_call")}
                title={
                  chatCallWindowClosed
                    ? t("detail.chat_call_expired")
                    : chatCounterpartPhone
                      ? chatCounterpartPhone
                      : t("detail.chat_call_no_phone")
                }
              >
                <Phone size={22} strokeWidth={2} />
              </button>
            </div>
            )}
          </header>

          {(job.status === JobStatus.COMPLETED ||
            job.status === JobStatus.CANCELLED) && (
            <div className="shrink-0 border-b border-slate-100 bg-slate-50 px-3 py-2.5 text-center text-xs leading-relaxed text-slate-600">
              {job.status === JobStatus.COMPLETED && chatCallUntilTime ? (
                chatCallWindowClosed ? (
                  <p>{t("detail.chat_call_expired")}</p>
                ) : (
                  <p>
                    {t("detail.chat_job_ended_until").replace(
                      "{time}",
                      chatCallUntilTime.toLocaleString(
                        language === "th" ? "th-TH" : "en-US",
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        }
                      )
                    )}
                  </p>
                )
              ) : (
                <p>{t("detail.chat_job_ended_note")}</p>
              )}
            </div>
          )}

          {chatOverlayTab === "chat" &&
            isOwner &&
            job.accepted_by &&
            (job as any).provider_profile && (
              <div className="shrink-0 border-b border-slate-100 bg-slate-50/95 px-3 py-2.5">
                <div className="flex items-start gap-3">
                  {(job as any).provider_profile.avatar_url ? (
                    <img
                      src={(job as any).provider_profile.avatar_url}
                      alt="ผู้รับงาน"
                      className="h-11 w-11 shrink-0 rounded-full border-2 border-slate-200 object-cover"
                    />
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-300">
                      <User size={22} className="text-slate-500" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="mb-1 font-medium text-slate-700">
                      ข้อมูลผู้รับงาน (จาก Thai ID)
                    </div>
                    <div className="space-y-1 text-slate-600">
                      {(job as any).provider_profile.kyc_full_name && (
                        <div>
                          <span className="text-slate-500">ชื่อ-นามสกุลจริง:</span>{" "}
                          {(job as any).provider_profile.kyc_full_name}
                        </div>
                      )}
                      {((job as any).provider_profile.vehicle_type ||
                        (job as any).provider_profile.vehicle_reg) && (
                        <div className="flex flex-wrap gap-x-4 gap-y-0">
                          {(job as any).provider_profile.vehicle_type && (
                            <span>
                              <span className="text-slate-500">ประเภทรถ:</span>{" "}
                              {getVehicleTypeLabel(
                                (job as any).provider_profile.vehicle_type
                              )}
                            </span>
                          )}
                          {(job as any).provider_profile.vehicle_reg && (
                            <span>
                              <span className="text-slate-500">ทะเบียนรถ:</span>{" "}
                              {(job as any).provider_profile.vehicle_reg}
                            </span>
                          )}
                        </div>
                      )}
                      {!(job as any).provider_profile.kyc_full_name &&
                        !(job as any).provider_profile.vehicle_type &&
                        !(job as any).provider_profile.vehicle_reg && (
                          <div className="text-slate-500">
                            ผู้รับงานยังไม่ได้ลงทะเบียน Thai ID
                          </div>
                        )}
                    </div>
                  </div>
                </div>
              </div>
            )}

          {chatOverlayTab === "chat" ? (
          <>
          <div
            ref={chatContainerRef}
            className="min-h-0 flex-1 overflow-y-auto bg-gray-50/50 p-4 space-y-4"
          >
            {messages.length === 0 ? (
              <p className="mt-10 text-center text-sm text-gray-400">
                {t("detail.no_msg")}
              </p>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex items-end gap-2 ${
                    msg.is_me ? "justify-end" : "justify-start"
                  }`}
                >
                  {!msg.is_me && (
                    <img
                      src={otherAvatar}
                      alt="Avatar"
                      className="mb-1 h-8 w-8 rounded-full border border-blue-200 object-cover shadow-sm"
                    />
                  )}
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                      msg.is_me
                        ? "chat-bubble-me rounded-br-none border border-emerald-100 bg-emerald-50 text-gray-800"
                        : "chat-bubble-other rounded-bl-none border border-blue-200 bg-blue-50 text-gray-800"
                    }`}
                  >
                    {msg.type === MessageType.IMAGE ? (
                      <div className="space-y-2">
                        <div
                          className="group relative cursor-pointer"
                          onClick={() =>
                            msg.media_url && handleViewProof(msg.media_url)
                          }
                        >
                          <img
                            src={msg.media_url}
                            alt="Attachment"
                            className="max-h-64 w-full rounded-lg border border-white/20 object-cover"
                          />
                          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
                            <Eye className="text-white" size={24} />
                          </div>
                        </div>
                        <span className="flex items-center text-[10px] opacity-70">
                          <ImageIcon size={10} className="mr-1" /> Image
                          attached
                        </span>
                        {isOwner &&
                          job.status === JobStatus.WAITING_FOR_APPROVAL && (
                            <div className="rounded bg-white/20 p-1 text-center text-[10px] font-bold">
                              Click to verify for approval
                            </div>
                          )}
                      </div>
                    ) : (
                      msg.text
                    )}
                    <span
                      className={`mt-1 block text-right text-[10px] ${
                        msg.is_me ? "text-emerald-600" : "text-blue-600"
                      }`}
                    >
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <form
            onSubmit={handleSendMessage}
            className="shrink-0 border-t border-gray-100 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            <p className="mb-2 px-1 text-xs text-gray-500">
              💬 แนะนำการสื่อสารให้มีมารยาทต่อกัน และใช้คำสุภาพต่อกัน
            </p>
            <div className="flex items-center space-x-2">
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleFileUpload}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                title={t("detail.attach")}
              >
                <Paperclip size={18} />
              </button>
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={t("detail.type")}
                className="flex-1 rounded-full border border-transparent bg-gray-100 py-2 px-4 text-sm text-gray-800 placeholder:text-gray-500 transition-colors focus:border-emerald-500 focus:bg-white focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-full bg-emerald-600 p-2 text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                disabled={!newMessage.trim()}
              >
                <Send size={18} />
              </button>
            </div>
          </form>
          </>
          ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-100">
            {staffSupportPhase === "connecting" ? (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-white px-6">
                <MessagesSquare
                  className="text-emerald-600"
                  size={56}
                  strokeWidth={1.35}
                  aria-hidden
                />
                <p className="mt-6 text-center text-base font-semibold text-slate-800">
                  {t("detail.help_staff_connecting_title")}
                </p>
                <p className="mt-1 text-center text-sm text-slate-500">
                  {t("detail.help_staff_connecting_sub")}
                </p>
                <Loader2
                  className="mt-8 animate-spin text-emerald-500"
                  size={28}
                  aria-hidden
                />
              </div>
            ) : staffSupportPhase === "queueing" ? (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-white px-6">
                <span className="h-3 w-3 rounded-full bg-emerald-500 shadow-sm shadow-emerald-200 animate-pulse" />
                <p className="mt-6 text-sm font-medium text-slate-600">
                  {t("detail.help_staff_queue_ahead")}
                </p>
                <p className="mt-1 text-4xl font-bold tabular-nums text-slate-900">
                  {queueAheadDisplay}
                </p>
                <p className="mt-5 max-w-sm text-center text-sm leading-relaxed text-slate-500">
                  {t("detail.help_staff_queue_wait")}
                </p>
              </div>
            ) : staffSupportPhase === "chat" ? (
              <>
                <div
                  ref={staffChatScrollRef}
                  className="min-h-0 flex-1 overflow-y-auto bg-slate-50/90 px-3 py-4"
                >
                  {staffSupportMessages.map((msg) =>
                    msg.variant === "system" ? (
                      <p
                        key={msg.id}
                        className="mb-3 text-center text-xs text-slate-500"
                      >
                        {msg.text}
                      </p>
                    ) : (
                      <div
                        key={msg.id}
                        className={`mb-3 flex items-end gap-2 ${
                          msg.isMe ? "justify-end" : "justify-start"
                        }`}
                      >
                        {!msg.isMe && (
                          <div className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-800">
                            MK
                          </div>
                        )}
                        <div
                          className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${
                            msg.isMe
                              ? "rounded-br-md bg-emerald-500 text-white"
                              : "rounded-bl-md border border-slate-100 bg-white text-slate-800"
                          }`}
                        >
                          <span className="whitespace-pre-wrap">{msg.text}</span>
                          <span
                            className={`mt-1 block text-right text-[10px] ${
                              msg.isMe ? "text-emerald-100" : "text-slate-400"
                            }`}
                          >
                            {new Date(msg.timestamp).toLocaleString(
                              language === "th" ? "th-TH" : "en-US",
                              {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                              }
                            )}
                          </span>
                        </div>
                      </div>
                    )
                  )}
                </div>
                <form
                  onSubmit={handleStaffSendMessage}
                  className="shrink-0 border-t border-slate-200 bg-white px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        notify(
                          language === "th"
                            ? "แนบไฟล์ — ฟีเจอร์นี้จะมาในเวอร์ชันถัดไป"
                            : "Attachments — coming in a future update",
                          "info"
                        )
                      }
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100"
                      aria-label={t("detail.attach")}
                    >
                      <Paperclip size={20} />
                    </button>
                    <input
                      type="text"
                      value={staffChatInput}
                      onChange={(e) => setStaffChatInput(e.target.value)}
                      placeholder={t("detail.help_staff_input_placeholder")}
                      className="min-h-[44px] flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                    <button
                      type="submit"
                      disabled={!staffChatInput.trim()}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={
                        language === "th" ? "ส่งข้อความ" : "Send message"
                      }
                    >
                      <Send size={20} />
                    </button>
                  </div>
                </form>
              </>
            ) : staffSupportPhase === "csat_staff" ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <p className="pt-2 text-center text-xs font-medium text-slate-500">
                  {t("detail.help_staff_csat_back")}
                </p>
                <div className="flex justify-center py-8">
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-50 text-4xl ring-2 ring-emerald-100">
                    🎧
                  </div>
                </div>
                <p className="text-center text-sm font-medium leading-snug text-slate-800">
                  {t("detail.help_staff_csat_rate_staff")}
                </p>
                <div className="mt-5 flex justify-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setStaffCsatStars(n)}
                      className="rounded-lg p-1 transition hover:bg-amber-50"
                      aria-label={`${n}`}
                    >
                      <Star
                        size={36}
                        strokeWidth={1.25}
                        className={
                          n <= staffCsatStars
                            ? "fill-amber-400 text-amber-400"
                            : "text-slate-200"
                        }
                      />
                    </button>
                  ))}
                </div>
                <div className="mt-10 border-t border-slate-100 pt-6">
                  <button
                    type="button"
                    disabled={staffCsatStars < 1}
                    onClick={() => setStaffSupportPhase("csat_app")}
                    className="w-full rounded-full bg-emerald-600 py-3.5 text-center text-base font-bold text-white shadow-md shadow-emerald-200 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-white/90 disabled:shadow-none"
                  >
                    {t("detail.help_staff_csat_continue")}
                  </button>
                </div>
              </div>
            ) : staffSupportPhase === "csat_app" ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <div className="flex justify-center py-10">
                  <div className="flex h-28 w-28 items-center justify-center rounded-3xl bg-emerald-50 text-5xl ring-2 ring-emerald-100">
                    📱
                  </div>
                </div>
                <p className="text-center text-lg font-semibold text-slate-900">
                  {t("detail.help_staff_csat_app_q")}
                </p>
                <p className="mt-2 text-center text-sm text-slate-500">
                  {t("detail.help_staff_csat_app_sub")}
                </p>
                <div className="mt-10 flex gap-3">
                  <button
                    type="button"
                    onClick={finishStaffSupportAfterCsat}
                    className="min-h-[48px] flex-1 rounded-xl border border-slate-200 bg-white py-3 text-center text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                  >
                    {t("detail.help_staff_csat_good")}
                  </button>
                  <button
                    type="button"
                    onClick={finishStaffSupportAfterCsat}
                    className="min-h-[48px] flex-1 rounded-xl border border-slate-200 bg-white py-3 text-center text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                  >
                    {t("detail.help_staff_csat_bad")}
                  </button>
                </div>
              </div>
            ) : !helpSelectedTopicKey ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <div className="mb-4 flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-pink-100">
                    <HelpCircle className="text-pink-600" size={26} />
                  </div>
                  <p className="text-sm leading-relaxed text-slate-700">
                    {t("detail.help_welcome")}
                  </p>
                </div>
                <p className="mb-2 px-0.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                  {t("detail.help_order_section")}
                </p>
                <div className="mb-4">
                  <HelpOrderSummaryCard
                    job={job}
                    jobReferenceCode={jobReferenceCode || String(job.id)}
                    language={language}
                    t={t}
                  />
                </div>
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  {HELP_TOPIC_TKEYS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setHelpSelectedTopicKey(key);
                        setHelpSelectedSubKey(null);
                      }}
                      className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5 text-left text-sm font-medium text-slate-800 transition hover:bg-pink-50/60 last:border-b-0"
                    >
                      <span className="min-w-0">{t(key)}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 space-y-3">
                  <p className="text-sm font-semibold text-slate-800">
                    {t(helpSelectedTopicKey)}
                  </p>
                  <HelpOrderSummaryCard
                    job={job}
                    jobReferenceCode={jobReferenceCode || String(job.id)}
                    language={language}
                    t={t}
                  />
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                      <span className="text-sm font-semibold text-slate-900">
                        {t(helpSelectedTopicKey)}
                      </span>
                      <ChevronUp className="shrink-0 text-slate-400" size={18} aria-hidden />
                    </div>
                    {(
                      HELP_SUB_BY_TOPIC[
                        helpSelectedTopicKey as (typeof HELP_TOPIC_TKEYS)[number]
                      ] || []
                    ).map((subKey) => (
                      <label
                        key={subKey}
                        className="flex cursor-pointer items-start gap-3 border-b border-slate-100 px-4 py-3.5 last:border-b-0"
                      >
                        <input
                          type="radio"
                          name="help-subtopic"
                          className="mt-1.5 h-4 w-4 shrink-0 border-slate-300 text-pink-500 focus:ring-pink-500"
                          checked={helpSelectedSubKey === subKey}
                          onChange={() => setHelpSelectedSubKey(subKey)}
                        />
                        <span className="text-sm leading-snug text-slate-800">
                          {t(subKey)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                  <button
                    type="button"
                    disabled={!helpSelectedSubKey}
                    onClick={() => {
                      if (!helpSelectedTopicKey || !helpSelectedSubKey) return;
                      const prefill = `[${jobReferenceCode || id}] ${t(helpSelectedTopicKey)} — ${t(helpSelectedSubKey)}`;
                      startStaffSupportFlow(prefill);
                    }}
                    className="w-full rounded-full py-3.5 text-center text-base font-bold text-white transition-colors disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-white/90 enabled:bg-pink-500 enabled:shadow-lg enabled:shadow-pink-200 enabled:hover:bg-pink-600"
                  >
                    {t("detail.help_chat_staff_btn")}
                  </button>
                  <p className="mt-2 text-center text-[11px] leading-relaxed text-slate-500">
                    {t("detail.help_contact_footer")}
                  </p>
                </div>
              </>
            )}
          </div>
          )}
        </div>
        </>,
        document.body
      )}
    {receiptData && createPortal(
      <EarningsReceipt
        data={receiptData}
        onClose={() => setReceiptData(null)}
      />,
      document.body
    )}
  </>
  );
};

export default JobDetails;
