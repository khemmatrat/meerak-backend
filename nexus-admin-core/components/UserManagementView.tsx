// Phase 4A: User Management — backend RBAC. No password/token/firebase_uid. Pagination + Search + Filters.
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  UserCog,
  Ban,
  Unlock,
  Wallet,
  Eye,
  X,
  Check,
  Loader2,
  Shield,
  Phone,
  Mail,
  DollarSign,
  CreditCard,
  Activity,
  ChevronLeft,
  ChevronRight,
  FileCheck,
  ScrollText,
  AlertTriangle,
  Zap,
  LogIn,
  Monitor,
  StickyNote,
  BookOpen,
  Plus,
  Minus,
  Award,
  Expand,
  ExternalLink,
  FileText,
  Copy,
  Download,
  BarChart3,
  Clock,
  GraduationCap,
} from "lucide-react";
import { db } from "../firebaseConfig";
import { DataService } from "../services/realtimeService";
import {
  getAdminUsers,
  getAdminUser,
  updateAdminUserRole,
  getAdminToken,
  getAdminUserLedger,
  getAdminUserFinancialMovements,
  getAuditLogs,
  suspendAdminUser,
  banAdminUser,
  reactivateAdminUser,
  walletFreezeAdminUser,
  forceLogoutAdminUser,
  updateAdminUserAppRole,
  approveUserAsProvider,
  setUserVip,
  emergencySuspendUser,
  createImpersonationToken,
  unlockAdminUserRateLimit,
  getAdminUserLoginSessions,
  getAdminUserNotes,
  addAdminUserNote,
  getAdminUserLmsSummary,
  adminWalletAdjust,
  grantBrandAdviserAdminUser,
  revokeBrandAdviserAdminUser,
  getKycDetail,
  requestKycResubmit,
  approveKyc,
  rejectKyc,
  requestKycSupplement,
  downloadAdminUser360Json,
  downloadAdminUser360Csv,
  postAdminReconcilePaysoCharge,
  getAdminUserFinancialAudit,
  downloadAdminUserFinancialCsv,
  downloadAdminUserSupportPackJson,
  downloadAdminUserSupportPackCsv,
  getAdminUserCommerceInsights,
  getAdminUserUnifiedTimeline,
  downloadAdminUserAnonymizedBundle,
  patchAdminUserConsent,
  getAdminUserEscrowTimeline,
  getAdminUserJobGraph,
  getAdminUserKycLifecycle,
  getAdminUserRiskProfile,
  getAdminUserCourseMarketplace,
  downloadAdminOpsQueueCsv,
} from "../services/adminApi";
import type {
  AdminUserRow,
  AdminUserLedgerEntry,
  AdminUserFinancialMovement,
  AdminUserFinancialMovementCategory,
  AdminUserFinancialMovementsResponse,
  AdminUserFinancialRiskSignal,
  AdminUserWalletSnapshot,
  AdminUserBalanceReconcile,
  AdminUserPendingDepositItem,
  AdminUserPendingWithdrawalItem,
  AdminUserBankDuplicateWarning,
  AdminUserSecurityRiskBadge,
  AdminReconcileTrend,
  AdminUserCompositeRisk,
  AdminUserSupportCase,
  AdminUserFinancialAuditItem,
  AdminUserCommerceProfile,
  AdminUnifiedTimelineItem,
  AdminEscrowTimelineJob,
  AdminJobGraph,
  AdminKycLifecycle,
  AdminKycSupplementRequest,
  AdminUserWhtSummary,
  AdminUserCourseMarketplaceProfile,
  KycDetailResponse,
} from "../services/adminApi";
import { JobGraphViz } from "./JobGraphViz";
import type { AuditLogRow } from "../services/adminApi";
import { MobileUser } from "../types";
import { LandingLeadsPanel } from "./LandingLeadsPanel";
import { UserCompetencyPanel } from "./UserCompetencyPanel";
import { UserVipPanel } from "./UserVipPanel";

type BackendRole = "USER" | "ADMIN" | "AUDITOR";
const PAGE_SIZE = 20;

function parseKycVehiclesJson(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

interface UserManagementViewProps {
  currentUserRole?: string;
  setView?: (view: string) => void;
  /** เมื่อโดดจาก Audit Logs มาหน้านี้ ให้โฟกัส/เปิด User Detail modal ของ user นี้ */
  focusUserId?: string | null;
  /** เรียกหลังเปิด modal จาก focusUserId แล้ว (ให้ App เคลียร์ state) */
  onFocusUserIdConsumed?: () => void;
  /** When provided, opening KYC Review will pre-select this user's KYC in KycReviewView */
  onOpenKycReview?: (userId: string) => void;
  /** เปิดหน้า Gateway Deposits กรอง pending ของ user นี้ */
  onOpenPendingDeposits?: (userId: string) => void;
  /** เปิดหน้า User Payout Requests กรอง pending ของ user นี้ */
  onOpenPendingWithdrawals?: (userId: string) => void;
  /** Deep-link Job Operations ไปยัง job ที่เลือกจาก job graph */
  onOpenJobOps?: (jobId: string) => void;
}

type UserDetailTab =
  | "profile"
  | "insights"
  | "wallet"
  | "timeline"
  | "kyc"
  | "security"
  | "actions";

const DETAIL_TABS: { id: UserDetailTab; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "insights", label: "Insights" },
  { id: "wallet", label: "Wallet" },
  { id: "timeline", label: "Timeline" },
  { id: "kyc", label: "KYC" },
  { id: "security", label: "Security" },
  { id: "actions", label: "Actions" },
];

export const UserManagementView: React.FC<UserManagementViewProps> = ({
  currentUserRole,
  setView,
  focusUserId,
  onFocusUserIdConsumed,
  onOpenKycReview,
  onOpenPendingDeposits,
  onOpenPendingWithdrawals,
  onOpenJobOps,
}) => {
  const [users, setUsers] = useState<AdminUserRow[] | MobileUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [kycFilter, setKycFilter] = useState("");
  const [vipFilter, setVipFilter] = useState(false);
  const [betaTesterFilter, setBetaTesterFilter] = useState(false);
  const [reconcileRepeatFilter, setReconcileRepeatFilter] = useState(false);
  const [opsAttentionFilter, setOpsAttentionFilter] = useState(false);
  const [sortReconcileFails, setSortReconcileFails] = useState(false);
  const [opsQueueExporting, setOpsQueueExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    limit: PAGE_SIZE,
    offset: 0,
    total: 0,
  });
  const [useBackend] = useState(!!getAdminToken());
  /** สลับโหมดได้เมื่อมีทั้ง Firestore และ Backend login */
  const canSwitchSource = !!db && useBackend;
  const [dataSource, setDataSource] = useState<"firebase" | "backend">(
    "firebase",
  );
  const useFirebaseList = canSwitchSource ? dataSource === "firebase" : !!db;
  const useBackendForUsers = canSwitchSource
    ? dataSource === "backend"
    : useBackend && !db;

  /** แท็บย่อยในโหมด Backend: รายชื่อผู้ใช้แอป vs ลีดจาก Landing */
  const [umPrimaryTab, setUmPrimaryTab] = useState<"users" | "landing">(
    "users",
  );

  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [detailLedger, setDetailLedger] = useState<AdminUserLedgerEntry[]>([]);
  const [detailLedgerTotals, setDetailLedgerTotals] = useState<{
    total_credit: number;
    total_debit: number;
  }>({ total_credit: 0, total_debit: 0 });
  const [financialMovements, setFinancialMovements] = useState<
    AdminUserFinancialMovement[]
  >([]);
  const [financialSummary, setFinancialSummary] = useState<
    AdminUserFinancialMovementsResponse["summary"] | null
  >(null);
  const [financialRiskSignals, setFinancialRiskSignals] = useState<
    AdminUserFinancialRiskSignal[]
  >([]);
  const [walletSnapshot, setWalletSnapshot] =
    useState<AdminUserWalletSnapshot | null>(null);
  const [balanceReconcile, setBalanceReconcile] =
    useState<AdminUserBalanceReconcile | null>(null);
  const [pendingDepositPreview, setPendingDepositPreview] = useState<
    AdminUserPendingDepositItem[]
  >([]);
  const [pendingWithdrawalPreview, setPendingWithdrawalPreview] = useState<
    AdminUserPendingWithdrawalItem[]
  >([]);
  const [bankDuplicateWarnings, setBankDuplicateWarnings] = useState<
    AdminUserBankDuplicateWarning[]
  >([]);
  const [securityRiskBadges, setSecurityRiskBadges] = useState<
    AdminUserSecurityRiskBadge[]
  >([]);
  const [reconcileTrend, setReconcileTrend] =
    useState<AdminReconcileTrend | null>(null);
  const [compositeRisk, setCompositeRisk] =
    useState<AdminUserCompositeRisk | null>(null);
  const [supportCase, setSupportCase] = useState<AdminUserSupportCase | null>(
    null,
  );
  const [exportingSupportPack, setExportingSupportPack] = useState(false);
  const [exportingUser360, setExportingUser360] = useState(false);
  const [kycActing, setKycActing] = useState(false);
  const [kycDocPickerOpen, setKycDocPickerOpen] = useState(false);
  const [kycDocPickerSelected, setKycDocPickerSelected] = useState<string[]>([
    "yellow_plate",
    "public_transport_license_front",
  ]);
  const [kycDocPickerInstruction, setKycDocPickerInstruction] = useState(
    "กรุณาอัปโหลดเอกสารเพิ่มเติมในแอป (Settings → Thai ID & Documents)",
  );
  const [reconcileChargeId, setReconcileChargeId] = useState<string | null>(
    null,
  );
  const [detailTab, setDetailTab] = useState<UserDetailTab>("profile");
  const detailScrollRef = useRef<HTMLDivElement>(null);
  const [financialAuditItems, setFinancialAuditItems] = useState<
    AdminUserFinancialAuditItem[]
  >([]);
  const [caseSummaryText, setCaseSummaryText] = useState("");
  const [financialAuditLoading, setFinancialAuditLoading] = useState(false);
  const [exportingFinancial, setExportingFinancial] = useState(false);
  const [commerceProfile, setCommerceProfile] =
    useState<AdminUserCommerceProfile | null>(null);
  const [courseMarketplaceProfile, setCourseMarketplaceProfile] =
    useState<AdminUserCourseMarketplaceProfile | null>(null);
  const [unifiedTimeline, setUnifiedTimeline] = useState<
    AdminUnifiedTimelineItem[]
  >([]);
  const [exportingBundle, setExportingBundle] = useState(false);
  const [consentUpdating, setConsentUpdating] = useState(false);
  const [escrowTimeline, setEscrowTimeline] = useState<
    AdminEscrowTimelineJob[]
  >([]);
  const [jobGraphs, setJobGraphs] = useState<AdminJobGraph[]>([]);
  const [kycLifecycle, setKycLifecycle] = useState<AdminKycLifecycle | null>(
    null,
  );
  const [kycSupplements, setKycSupplements] = useState<
    AdminKycSupplementRequest[]
  >([]);
  const [whtSummary, setWhtSummary] = useState<AdminUserWhtSummary | null>(
    null,
  );
  const [financialCategory, setFinancialCategory] =
    useState<AdminUserFinancialMovementCategory>("all");
  const [financialJobFilter, setFinancialJobFilter] = useState<string | null>(
    null,
  );
  const [financialCursor, setFinancialCursor] = useState<string | null>(null);
  const [financialHasMore, setFinancialHasMore] = useState(false);
  const [financialLoading, setFinancialLoading] = useState(false);
  const [detailAudit, setDetailAudit] = useState<AuditLogRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [newRole, setNewRole] = useState<BackendRole | "USER" | "PROVIDER">(
    "USER",
  );
  const [newBalance, setNewBalance] = useState("");
  const [actionReason, setActionReason] = useState("");
  const [roleChangeReason, setRoleChangeReason] = useState("");
  const [banDays, setBanDays] = useState<string>("0");
  const [showAppRoleModal, setShowAppRoleModal] = useState(false);
  const [appRole, setAppRole] = useState<"user" | "provider">("user");

  const [detailLoginSessions, setDetailLoginSessions] = useState<
    Array<{
      ip_address: string | null;
      user_agent: string;
      created_at: string | null;
    }>
  >([]);
  const [detailDeviceHopping, setDetailDeviceHopping] = useState(false);
  const [detailNotes, setDetailNotes] = useState<
    Array<{
      id: string;
      admin_name: string;
      note: string;
      created_at: string | null;
    }>
  >([]);
  const [detailLmsSummary, setDetailLmsSummary] = useState<{
    avg_grade: number | null;
    training_status: string;
  } | null>(null);
  const [detailKyc, setDetailKyc] = useState<KycDetailResponse | null>(null);
  const [detailKycLoading, setDetailKycLoading] = useState(false);
  const [kycLightbox, setKycLightbox] = useState<{
    url: string;
    label: string;
    type: "image" | "video";
  } | null>(null);
  const [showWalletAdjustModal, setShowWalletAdjustModal] = useState(false);
  const [walletAdjustDirection, setWalletAdjustDirection] = useState<
    "credit" | "debit"
  >("credit");
  const [walletAdjustAmount, setWalletAdjustAmount] = useState("");
  const [walletAdjustReason, setWalletAdjustReason] = useState("");
  const [walletAdjustReasonCode, setWalletAdjustReasonCode] = useState("");
  const [walletAdjustEvidenceRef, setWalletAdjustEvidenceRef] = useState("");
  const [newNote, setNewNote] = useState("");

  const [processing, setProcessing] = useState(false);
  const [toast, setToast] = useState<{
    type: "error" | "success" | "info";
    message: string;
  } | null>(null);
  const showToast = useCallback(
    (message: string, type: "error" | "success" | "info" = "info") => {
      setToast({ message, type });
      window.setTimeout(() => setToast(null), 3500);
    },
    [],
  );

  const applyFinancialExtras = useCallback(
    (res: AdminUserFinancialMovementsResponse | null) => {
      if (!res) {
        setWalletSnapshot(null);
        setBalanceReconcile(null);
        setPendingDepositPreview([]);
        setPendingWithdrawalPreview([]);
        setBankDuplicateWarnings([]);
        setSecurityRiskBadges([]);
        setCompositeRisk(null);
        setReconcileTrend(null);
        setSupportCase(null);
        return;
      }
      setWalletSnapshot(res.wallet_snapshot ?? null);
      setBalanceReconcile(res.reconcile ?? null);
      setPendingDepositPreview(res.pending_deposit_items ?? []);
      setPendingWithdrawalPreview(res.pending_withdrawal_items ?? []);
      setBankDuplicateWarnings(res.bank_duplicate_warnings ?? []);
      setSecurityRiskBadges(res.security_risk_badges ?? []);
      setCompositeRisk(res.composite_risk ?? null);
      setReconcileTrend(res.reconcile_trend ?? null);
      setSupportCase(res.support_case ?? null);
    },
    [],
  );

  const applyRiskProfileFallback = useCallback(
    (
      financialRes: AdminUserFinancialMovementsResponse | null,
      riskRes: { profile?: AdminUserCompositeRisk } | null,
    ) => {
      if (financialRes?.composite_risk) return;
      const p = riskRes?.profile;
      if (!p) return;
      setCompositeRisk({
        composite_score: Number(p.composite_score ?? 0),
        composite_tier: String(p.composite_tier ?? "none"),
        anomaly_score: Number(p.anomaly_score ?? 0),
        linked_account_count: Number(p.linked_account_count ?? 0),
        device_hopping_24h: !!p.device_hopping_24h,
        score_components: p.score_components ?? [],
        linked_accounts: p.linked_accounts ?? [],
      });
    },
    [],
  );

  const resetFinancialMovementsState = useCallback(() => {
    setFinancialMovements([]);
    setFinancialSummary(null);
    setFinancialRiskSignals([]);
    setWalletSnapshot(null);
    setBalanceReconcile(null);
    setPendingDepositPreview([]);
    setPendingWithdrawalPreview([]);
    setBankDuplicateWarnings([]);
    setSecurityRiskBadges([]);
    setCompositeRisk(null);
    setReconcileTrend(null);
    setSupportCase(null);
    setFinancialAuditItems([]);
    setCaseSummaryText("");
    setCommerceProfile(null);
    setUnifiedTimeline([]);
    setEscrowTimeline([]);
    setJobGraphs([]);
    setKycLifecycle(null);
    setKycSupplements([]);
    setWhtSummary(null);
    setFinancialCategory("all");
    setFinancialJobFilter(null);
    setFinancialCursor(null);
    setFinancialHasMore(false);
  }, []);

  const fetchFinancialMovements = useCallback(
    async (
      userId: string,
      opts?: {
        cursor?: string | null;
        category?: AdminUserFinancialMovementCategory;
        job_id?: string | null;
        append?: boolean;
      },
    ) => {
      setFinancialLoading(true);
      try {
        const jobId =
          opts?.job_id !== undefined ? opts.job_id : financialJobFilter;
        const res = await getAdminUserFinancialMovements(userId, {
          limit: 25,
          cursor: opts?.cursor || undefined,
          category: opts?.category ?? financialCategory,
          job_id: jobId || undefined,
        });
        setFinancialMovements((prev) =>
          opts?.append ? [...prev, ...(res.items || [])] : res.items || [],
        );
        setFinancialSummary(res.summary);
        setFinancialRiskSignals(res.risk_signals || []);
        applyFinancialExtras(res);
        setFinancialCursor(res.next_cursor);
        setFinancialHasMore(!!res.has_more);
        if (opts?.category) setFinancialCategory(opts.category);
        if (opts?.job_id !== undefined) setFinancialJobFilter(opts.job_id);
      } catch (err: unknown) {
        console.error("financial movements load failed:", err);
        if (!opts?.append) {
          setFinancialMovements([]);
          setFinancialSummary(null);
          setFinancialRiskSignals([]);
          applyFinancialExtras(null);
        }
      } finally {
        setFinancialLoading(false);
      }
    },
    [applyFinancialExtras, financialCategory, financialJobFilter],
  );

  const financialRiskLabel = (code: string) => {
    switch (code) {
      case "PENDING_DEPOSITS":
        return "มีรายการเติมเงินค้าง (pending)";
      case "PENDING_WITHDRAWALS":
        return "มีคำขอถอนค้าง";
      case "DEPOSIT_VELOCITY_24H":
        return "เติมเงินถี่ใน 24 ชม.";
      case "WITHDRAW_VELOCITY_24H":
        return "ถอนเงินถี่ใน 24 ชม.";
      case "KYC_UNVERIFIED_WITHDRAWAL":
        return "KYC ไม่ผ่าน แต่มีประวัติถอน";
      case "DUPLICATE_BANK_ACCOUNT":
        return "เลขบัญชีซ้ำกับ user อื่น";
      case "DEVICE_HOPPING":
        return "Device hopping (หลาย IP)";
      default:
        return code;
    }
  };

  const handleReconcilePaysoCharge = async (chargeId: string) => {
    if (!selectedUser?.id || !chargeId) return;
    setReconcileChargeId(chargeId);
    try {
      await postAdminReconcilePaysoCharge(chargeId);
      showToast("Reconcile PaySo สำเร็จ", "success");
      await fetchFinancialMovements(String(selectedUser.id));
      await loadFinancialAudit(String(selectedUser.id));
    } catch (err: unknown) {
      showToast((err as Error).message || "Reconcile PaySo ล้มเหลว", "error");
    } finally {
      setReconcileChargeId(null);
    }
  };

  const scrollToDetailSection = (tab: UserDetailTab) => {
    setDetailTab(tab);
    const el = document.getElementById(`ud-${tab}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleFilterMovementsByJob = useCallback(
    (jobId: string) => {
      if (!selectedUser?.id) return;
      scrollToDetailSection("wallet");
      fetchFinancialMovements(String(selectedUser.id), {
        category: "all",
        job_id: jobId,
      });
      showToast(`กรอง movements ตาม job ${jobId.slice(0, 8)}…`, "info");
    },
    [selectedUser?.id, fetchFinancialMovements, showToast],
  );

  const refreshJobGraphs = useCallback(async () => {
    if (!selectedUser?.id || !useBackendForUsers) return;
    try {
      const res = await getAdminUserJobGraph(String(selectedUser.id), {
        limit: 20,
      });
      setJobGraphs(res?.graphs ?? []);
    } catch {
      /* ignore */
    }
  }, [selectedUser?.id, useBackendForUsers]);

  const handleExportFinancialCsv = async () => {
    if (!selectedUser?.id) return;
    setExportingFinancial(true);
    try {
      await downloadAdminUserFinancialCsv(String(selectedUser.id));
      showToast("Export CSV สำเร็จ", "success");
    } catch (err: unknown) {
      showToast((err as Error).message || "Export ล้มเหลว", "error");
    } finally {
      setExportingFinancial(false);
    }
  };

  const handleExportAnonymizedBundle = async () => {
    if (!selectedUser?.id) return;
    setExportingBundle(true);
    try {
      await downloadAdminUserAnonymizedBundle(String(selectedUser.id));
      showToast("Export anonymized bundle สำเร็จ", "success");
    } catch (err: unknown) {
      showToast((err as Error).message || "Export bundle ล้มเหลว", "error");
    } finally {
      setExportingBundle(false);
    }
  };

  const handleToggleConsent = async () => {
    if (!selectedUser?.id || !commerceProfile) return;
    setConsentUpdating(true);
    try {
      const next = !commerceProfile.data_sharing_consent;
      await patchAdminUserConsent(String(selectedUser.id), next);
      setCommerceProfile({ ...commerceProfile, data_sharing_consent: next });
      showToast(
        next ? "เปิด data sharing consent แล้ว" : "ปิด consent แล้ว",
        "success",
      );
    } catch (err: unknown) {
      showToast((err as Error).message || "อัปเดต consent ล้มเหลว", "error");
    } finally {
      setConsentUpdating(false);
    }
  };

  const handleExportSupportPack = async (format: "json" | "csv") => {
    if (!selectedUser?.id) return;
    setExportingSupportPack(true);
    try {
      if (format === "json") {
        await downloadAdminUserSupportPackJson(
          String(selectedUser.id),
          supportCase?.case_id,
        );
      } else {
        await downloadAdminUserSupportPackCsv(
          String(selectedUser.id),
          supportCase?.case_id,
        );
      }
      showToast(`Export support pack (${format}) สำเร็จ`, "success");
    } catch (err: unknown) {
      showToast(
        (err as Error).message || "Export support pack ล้มเหลว",
        "error",
      );
    } finally {
      setExportingSupportPack(false);
    }
  };

  const handleExportUser360 = async (format: "json" | "csv") => {
    if (!selectedUser?.id) return;
    setExportingUser360(true);
    try {
      if (format === "json") {
        await downloadAdminUser360Json(
          String(selectedUser.id),
          supportCase?.case_id,
        );
      } else {
        await downloadAdminUser360Csv(
          String(selectedUser.id),
          supportCase?.case_id,
        );
      }
      showToast(`Export User 360 (${format}) สำเร็จ`, "success");
    } catch (err: unknown) {
      showToast((err as Error).message || "Export User 360 ล้มเหลว", "error");
    } finally {
      setExportingUser360(false);
    }
  };

  const refreshKycLifecycle = async () => {
    if (!selectedUser?.id || !useBackendForUsers) return;
    try {
      const kycLifecycleRes = await getAdminUserKycLifecycle(
        String(selectedUser.id),
      );
      setKycLifecycle(kycLifecycleRes?.lifecycle ?? null);
      setKycSupplements(kycLifecycleRes?.supplement_requests ?? []);
      setWhtSummary(kycLifecycleRes?.wht ?? null);
    } catch {
      /* ignore */
    }
  };

  const handleKycApprove = async () => {
    if (!selectedUser?.id) return;
    if (!window.confirm("อนุมัติ KYC ของ user นี้?")) return;
    setKycActing(true);
    try {
      await approveKyc(String(selectedUser.id));
      showToast("อนุมัติ KYC แล้ว", "success");
      await refreshKycLifecycle();
      if (selectedUser) {
        setSelectedUser({ ...selectedUser, kyc_status: "approved" });
      }
    } catch (err: unknown) {
      showToast((err as Error).message || "อนุมัติ KYC ล้มเหลว", "error");
    } finally {
      setKycActing(false);
    }
  };

  const handleKycReject = async () => {
    if (!selectedUser?.id) return;
    const reason = window.prompt("เหตุผลปฏิเสธ KYC:") || "Rejected by admin";
    if (reason === null) return;
    if (!window.confirm("ยืนยันปฏิเสธ KYC?")) return;
    setKycActing(true);
    try {
      await rejectKyc(String(selectedUser.id), reason);
      showToast("ปฏิเสธ KYC แล้ว", "success");
      await refreshKycLifecycle();
      if (selectedUser) {
        setSelectedUser({
          ...selectedUser,
          kyc_status: "rejected",
          kyc_rejection_reason: reason,
        });
      }
    } catch (err: unknown) {
      showToast((err as Error).message || "ปฏิเสธ KYC ล้มเหลว", "error");
    } finally {
      setKycActing(false);
    }
  };

  const handleKycRequestDocs = () => {
    if (!selectedUser?.id) return;
    setKycDocPickerOpen(true);
  };

  const submitKycDocPicker = async () => {
    if (!selectedUser?.id) return;
    if (kycDocPickerSelected.length === 0) {
      showToast("เลือกเอกสารอย่างน้อย 1 รายการ", "error");
      return;
    }
    setKycActing(true);
    try {
      const selected = KYC_REQUEST_DOC_OPTIONS.filter((o) =>
        kycDocPickerSelected.includes(o.id),
      );
      const supplementDocs = selected
        .filter((o) => o.kind === "supplement")
        .map((o) => o.id);
      const resubmitSteps = selected
        .filter((o) => o.kind === "resubmit")
        .map((o) => o.label);

      if (supplementDocs.length > 0) {
        await requestKycSupplement(String(selectedUser.id), {
          instruction: kycDocPickerInstruction.trim(),
          requested_docs: supplementDocs,
        });
      }
      if (resubmitSteps.length > 0) {
        await requestKycResubmit(String(selectedUser.id), {
          instruction: kycDocPickerInstruction.trim(),
          required_steps: resubmitSteps,
          trigger: "admin_manual",
        });
      }
      showToast("ส่งคำขอเอกสารแล้ว", "success");
      setKycDocPickerOpen(false);
      await refreshKycLifecycle();
    } catch (err: unknown) {
      showToast((err as Error).message || "ขอเอกสารล้มเหลว", "error");
    } finally {
      setKycActing(false);
    }
  };

  const handleCopyCaseSummary = async () => {
    if (!selectedUser?.id) return;
    const text =
      caseSummaryText ||
      [
        supportCase?.case_id ? `Case ID: ${supportCase.case_id}` : null,
        `User ID: ${selectedUser.id}`,
        `Name: ${selectedUser.name || selectedUser.email || "—"}`,
        `Balance: ฿${(walletSnapshot?.wallet_balance ?? selectedUser.wallet_balance ?? 0).toLocaleString()}`,
      ]
        .filter(Boolean)
        .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      showToast("คัดลอก case summary แล้ว", "success");
    } catch {
      showToast("คัดลอกไม่สำเร็จ", "error");
    }
  };

  const loadFinancialAudit = useCallback(async (userId: string) => {
    setFinancialAuditLoading(true);
    try {
      const res = await getAdminUserFinancialAudit(userId, { limit: 80 });
      setFinancialAuditItems(res.items || []);
      setCaseSummaryText(res.case_summary || "");
      if (res.support_case) setSupportCase(res.support_case);
    } catch {
      setFinancialAuditItems([]);
      setCaseSummaryText("");
    } finally {
      setFinancialAuditLoading(false);
    }
  }, []);

  /** ตรงกับ adminAccountAction ฝั่ง API — ADMIN + SUPER_ADMIN (ไม่ใช้แค่ ADMIN เพื่อกันกดปุ่มแล้วไม่เกิดอะไร) */
  const canManageAccountActions =
    currentUserRole === "ADMIN" || currentUserRole === "SUPER_ADMIN";
  const isAuditor = currentUserRole === "AUDITOR";

  const KYC_DOC_LABELS: Record<string, string> = {
    id_card_front_url: "บัตรประชาชน (หน้า)",
    id_card_back_url: "บัตรประชาชน (หลัง)",
    selfie_photo_url: "รูปถ่ายใบหน้า",
    driving_license_front_url: "ใบขับขี่ (หน้า)",
    driving_license_back_url: "ใบขับขี่ (หลัง)",
    selfie_video_url: "วิดีโอ Selfie",
    yellow_plate_photo_url: "ป้ายเหลือง (รถสาธารณะ)",
    public_transport_license_front_url: "ใบขับขี่สาธารณะ (หน้า)",
    public_transport_license_back_url: "ใบขับขี่สาธารณะ (หลัง)",
  };

  /** ตัวเลือก Request docs — supplement (API keys) + resubmit (ขั้นตอน KYC ทั่วไป) */
  const KYC_REQUEST_DOC_OPTIONS: {
    id: string;
    label: string;
    kind: "supplement" | "resubmit";
  }[] = [
    { id: "yellow_plate", label: "ป้ายเหลือง (รถสาธารณะ)", kind: "supplement" },
    {
      id: "public_transport_license_front",
      label: "ใบขับขี่สาธารณะ (หน้า)",
      kind: "supplement",
    },
    {
      id: "public_transport_license_back",
      label: "ใบขับขี่สาธารณะ (หลัง)",
      kind: "supplement",
    },
    { id: "id_card_front", label: "บัตรประชาชน (หน้า)", kind: "resubmit" },
    { id: "id_card_back", label: "บัตรประชาชน (หลัง)", kind: "resubmit" },
    { id: "selfie_photo", label: "รูปถ่ายใบหน้า", kind: "resubmit" },
    { id: "selfie_video", label: "วิดีโอ Selfie", kind: "resubmit" },
    { id: "driving_license_front", label: "ใบขับขี่ (หน้า)", kind: "resubmit" },
    { id: "driving_license_back", label: "ใบขับขี่ (หลัง)", kind: "resubmit" },
  ];

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setKycLightbox(null);
    };
    if (kycLightbox) {
      window.addEventListener("keydown", onEsc);
      return () => window.removeEventListener("keydown", onEsc);
    }
  }, [kycLightbox]);

  const fetchUsers = useCallback(
    async (pageNum = page, searchOverride?: string) => {
      setLoading(true);
      try {
        if (useFirebaseList) {
          const data = await DataService.getUsers();
          setUsers(data);
          setPagination({ limit: data.length, offset: 0, total: data.length });
        } else if (useBackendForUsers) {
          const offset = (pageNum - 1) * PAGE_SIZE;
          const res = await getAdminUsers({
            search: (searchOverride ?? searchTerm).trim() || undefined,
            limit: PAGE_SIZE,
            offset,
            role: roleFilter || undefined,
            status: statusFilter || undefined,
            kyc_status: kycFilter || undefined,
            vip: vipFilter || undefined,
            beta_tester: betaTesterFilter || undefined,
            reconcile_repeat: reconcileRepeatFilter || undefined,
            ops_attention: opsAttentionFilter || undefined,
            sort: sortReconcileFails ? "reconcile_fails" : undefined,
          });
          setUsers(res.users);
          setPagination(res.pagination);
        } else {
          const data = await DataService.getUsers();
          setUsers(data);
          setPagination({ limit: data.length, offset: 0, total: data.length });
        }
      } catch (error: any) {
        if (useBackendForUsers) setUsers([]);
        else {
          try {
            const data = await DataService.getUsers();
            setUsers(data);
            setPagination({
              limit: data.length,
              offset: 0,
              total: data.length,
            });
          } catch (_) {}
        }
        console.error("Failed to fetch users:", error);
      }
      setLoading(false);
    },
    [
      useFirebaseList,
      useBackendForUsers,
      searchTerm,
      roleFilter,
      statusFilter,
      kycFilter,
      vipFilter,
      betaTesterFilter,
      reconcileRepeatFilter,
      opsAttentionFilter,
      sortReconcileFails,
    ],
  );

  useEffect(() => {
    fetchUsers(page);
  }, [
    page,
    roleFilter,
    statusFilter,
    kycFilter,
    vipFilter,
    betaTesterFilter,
    reconcileRepeatFilter,
    opsAttentionFilter,
    sortReconcileFails,
    dataSource,
  ]);

  /** เปิด User Detail modal จาก userId (ใช้เมื่อโฟกัสจาก Audit Logs) */
  const openUserDetailById = useCallback(
    async (userId: string) => {
      setDetailLoading(true);
      setDetailLedger([]);
      setDetailLedgerTotals({ total_credit: 0, total_debit: 0 });
      resetFinancialMovementsState();
      setDetailTab("profile");
      setDetailAudit([]);
      setDetailLoginSessions([]);
      setDetailDeviceHopping(false);
      setDetailNotes([]);
      setDetailLmsSummary(null);
      setDetailKyc(null);
      setCourseMarketplaceProfile(null);
      setDetailKycLoading(true);
      try {
        const [
          res,
          ledgerRes,
          financialRes,
          auditRes,
          sessionsRes,
          notesRes,
          lmsRes,
          kycRes,
          financialAuditRes,
          commerceRes,
          timelineRes,
          escrowRes,
          jobGraphRes,
          kycLifecycleRes,
          riskProfileRes,
          courseMarketplaceRes,
        ] = await Promise.all([
          getAdminUser(userId),
          getAdminUserLedger(userId, 10).catch(() => ({
            entries: [],
            total_credit: 0,
            total_debit: 0,
          })),
          getAdminUserFinancialMovements(userId, {
            limit: 25,
            category: "all",
          }).catch(() => null),
          getAuditLogs({
            entity_type: "users",
            entity_id: userId,
            limit: 20,
          }).catch(() => ({ logs: [], count: 0 })),
          getAdminUserLoginSessions(userId, 5).catch(() => ({
            sessions: [],
            device_hopping_24h: false,
          })),
          getAdminUserNotes(userId).catch(() => ({ notes: [] })),
          getAdminUserLmsSummary(userId).catch(() => null),
          getKycDetail(userId).catch(() => null),
          getAdminUserFinancialAudit(userId, { limit: 80 }).catch(() => ({
            items: [],
            total_fetched: 0,
            case_summary: "",
          })),
          getAdminUserCommerceInsights(userId, { days: 90 }).catch(() => null),
          getAdminUserUnifiedTimeline(userId, { limit: 100 }).catch(() => ({
            items: [],
            total: 0,
          })),
          getAdminUserEscrowTimeline(userId, { limit: 15 }).catch(() => ({
            jobs: [],
            total: 0,
          })),
          getAdminUserJobGraph(userId, { limit: 20 }).catch(() => ({
            graphs: [],
            total: 0,
          })),
          getAdminUserKycLifecycle(userId).catch(() => null),
          getAdminUserRiskProfile(userId).catch(() => null),
          getAdminUserCourseMarketplace(userId).catch(() => null),
        ]);
        const u = (res.user as any) || {};
        setSelectedUser({
          id: u.id,
          name: u.full_name || u.email,
          email: u.email,
          phone: u.phone,
          role: u.role,
          backend_role: u.backend_role,
          wallet_balance: u.wallet_balance,
          wallet_frozen: u.wallet_frozen,
          currency: u.currency || "THB",
          kyc_level: u.kyc_level,
          kyc_status: u.kyc_status,
          kyc_rejection_reason: u.kyc_rejection_reason,
          account_status: u.account_status || "active",
          created_at: u.created_at,
          last_login_at: u.last_login_at,
          updated_at: u.updated_at,
          provider_status: u.provider_status,
          provider_verified_at: u.provider_verified_at,
          is_vip: u.is_vip,
          banned_until: u.banned_until,
          ban_reason: u.ban_reason,
          bank_accounts: u.bank_accounts || [],
          is_brand_adviser: u.is_brand_adviser,
          adviser_status: u.adviser_status,
          adviser_reputation_score: u.adviser_reputation_score,
          adviser_public_slug: u.adviser_public_slug,
          adviser_public_profile_enabled: u.adviser_public_profile_enabled,
          adviser_granted_at: u.adviser_granted_at,
          adviser_suspended_at: u.adviser_suspended_at,
          adviser_suspended_reason: u.adviser_suspended_reason,
        });
        setDetailLedger(ledgerRes.entries || []);
        setDetailLedgerTotals({
          total_credit: ledgerRes.total_credit ?? 0,
          total_debit: ledgerRes.total_debit ?? 0,
        });
        if (financialRes) {
          setFinancialMovements(financialRes.items || []);
          setFinancialSummary(financialRes.summary);
          setFinancialRiskSignals(financialRes.risk_signals || []);
          applyFinancialExtras(financialRes);
          applyRiskProfileFallback(financialRes, riskProfileRes);
          setFinancialCursor(financialRes.next_cursor);
          setFinancialHasMore(!!financialRes.has_more);
          setFinancialCategory("all");
        }
        if (financialAuditRes) {
          setFinancialAuditItems(financialAuditRes.items || []);
          setCaseSummaryText(financialAuditRes.case_summary || "");
        }
        setCommerceProfile(commerceRes?.profile ?? null);
        setCourseMarketplaceProfile(courseMarketplaceRes ?? null);
        setUnifiedTimeline(timelineRes?.items ?? []);
        setEscrowTimeline(escrowRes?.jobs ?? []);
        setJobGraphs(jobGraphRes?.graphs ?? []);
        setKycLifecycle(kycLifecycleRes?.lifecycle ?? null);
        setKycSupplements(kycLifecycleRes?.supplement_requests ?? []);
        setWhtSummary(kycLifecycleRes?.wht ?? null);
        setDetailAudit((auditRes as { logs: AuditLogRow[] }).logs || []);
        setDetailLoginSessions(
          (sessionsRes as { sessions: typeof detailLoginSessions }).sessions ||
            [],
        );
        setDetailDeviceHopping(
          (sessionsRes as { device_hopping_24h: boolean }).device_hopping_24h ||
            false,
        );
        setDetailNotes((notesRes as { notes: typeof detailNotes }).notes || []);
        setDetailLmsSummary(
          lmsRes && typeof lmsRes === "object" && "avg_grade" in lmsRes
            ? lmsRes
            : null,
        );
        setDetailKyc(
          kycRes && typeof kycRes === "object" && "documents" in kycRes
            ? (kycRes as KycDetailResponse)
            : null,
        );
        setShowDetailsModal(true);
      } catch (err: any) {
        console.error("Failed to load user for focus:", err);
        const msg = String(err?.message || err || "");
        if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
          showToast("ไม่พบข้อมูลผู้ใช้รายนี้", "error");
        } else {
          showToast(msg || "โหลดข้อมูลผู้ใช้ไม่สำเร็จ", "error");
        }
      } finally {
        setDetailLoading(false);
        setDetailKycLoading(false);
      }
    },
    [showToast],
  );

  useEffect(() => {
    if (!focusUserId || !focusUserId.trim()) return;
    const id = focusUserId.trim();
    // Highlight Search: พิมพ์ id ลงช่อง Search เพื่อให้ปิด modal แล้วเห็น user เดิมค้างอยู่
    setSearchTerm(id);
    setPage(1);
    if (canSwitchSource) setDataSource("backend");
    // ให้ backend list รีเฟรชทันที (แม้ state update จะ async)
    if (useBackendForUsers) fetchUsers(1, id);
    openUserDetailById(id).then(() => {
      onFocusUserIdConsumed?.();
    });
  }, [
    focusUserId,
    openUserDetailById,
    onFocusUserIdConsumed,
    canSwitchSource,
    useBackendForUsers,
    fetchUsers,
  ]);

  const handleChangeRole = async () => {
    if (!selectedUser) return;
    const targetName =
      selectedUser.name ||
      selectedUser.full_name ||
      selectedUser.username ||
      selectedUser.email;
    if (
      !confirm(
        `Change role of ${targetName} to ${newRole}? This action will be recorded in the audit log.`,
      )
    )
      return;

    setProcessing(true);
    try {
      if (
        useBackendForUsers &&
        ["USER", "ADMIN", "AUDITOR"].includes(String(newRole))
      ) {
        await updateAdminUserRole(
          selectedUser.id,
          newRole as BackendRole,
          roleChangeReason.trim() || undefined,
        );
        alert(`✅ Role updated to ${newRole} (recorded in audit log)`);
      } else if (!useBackendForUsers) {
        await DataService.updateUserRole(
          selectedUser.id,
          newRole as "USER" | "PROVIDER",
        );
        alert(`✅ Successfully updated ${selectedUser.username} to ${newRole}`);
      }
      setShowRoleModal(false);
      fetchUsers();
    } catch (error: any) {
      alert(`❌ Failed to update role: ${error?.message || error}`);
    }
    setProcessing(false);
  };

  const handleUpdateBalance = async () => {
    if (!selectedUser || !newBalance || useBackendForUsers) return;
    setProcessing(true);
    try {
      await DataService.updateUserBalance(
        selectedUser.id,
        parseFloat(newBalance),
      );
      alert(
        `✅ Successfully updated ${selectedUser.username} balance to ฿${newBalance}`,
      );
      setShowBalanceModal(false);
      fetchUsers();
    } catch (error: any) {
      alert(`❌ Failed to update balance: ${error?.message || error}`);
    }
    setProcessing(false);
  };

  const handleBanUser = async (user: any) => {
    if (useBackendForUsers) return;
    const isBanned = user.status === "banned" || user.status === "offline";
    const action = isBanned ? "Unban" : "Ban";
    if (!confirm(`Are you sure you want to ${action} ${user.username}?`))
      return;
    try {
      await DataService.banUser(user.id, !isBanned);
      alert(`✅ Successfully ${action}ned ${user.username}`);
      fetchUsers();
    } catch (error: any) {
      alert(`❌ Failed to ${action}: ${error?.message}`);
    }
  };

  const handleViewDetails = async (user: any) => {
    setDetailLoading(true);
    setDetailLedger([]);
    setDetailLedgerTotals({ total_credit: 0, total_debit: 0 });
    resetFinancialMovementsState();
    setDetailTab("profile");
    setDetailAudit([]);
    setDetailLoginSessions([]);
    setDetailDeviceHopping(false);
    setDetailNotes([]);
    setDetailLmsSummary(null);
    setDetailKyc(null);
    setCourseMarketplaceProfile(null);
    setDetailKycLoading(true);
    try {
      if (useBackendForUsers) {
        const [
          res,
          ledgerRes,
          financialRes,
          auditRes,
          sessionsRes,
          notesRes,
          lmsRes,
          kycRes,
          financialAuditRes,
          commerceRes,
          timelineRes,
          escrowRes,
          jobGraphRes,
          kycLifecycleRes,
          riskProfileRes,
          courseMarketplaceRes,
        ] = await Promise.all([
          getAdminUser(user.id),
          getAdminUserLedger(user.id, 10).catch(() => ({
            entries: [],
            total_credit: 0,
            total_debit: 0,
          })),
          getAdminUserFinancialMovements(user.id, {
            limit: 25,
            category: "all",
          }).catch(() => null),
          getAuditLogs({
            entity_type: "users",
            entity_id: user.id,
            limit: 20,
          }).catch(() => ({ logs: [], count: 0 })),
          getAdminUserLoginSessions(user.id, 5).catch(() => ({
            sessions: [],
            device_hopping_24h: false,
          })),
          getAdminUserNotes(user.id).catch(() => ({ notes: [] })),
          getAdminUserLmsSummary(user.id).catch(() => null),
          getKycDetail(user.id).catch(() => null),
          getAdminUserFinancialAudit(user.id, { limit: 80 }).catch(() => ({
            items: [],
            total_fetched: 0,
            case_summary: "",
          })),
          getAdminUserCommerceInsights(user.id, { days: 90 }).catch(() => null),
          getAdminUserUnifiedTimeline(user.id, { limit: 100 }).catch(() => ({
            items: [],
            total: 0,
          })),
          getAdminUserEscrowTimeline(user.id, { limit: 15 }).catch(() => ({
            jobs: [],
            total: 0,
          })),
          getAdminUserJobGraph(user.id, { limit: 20 }).catch(() => ({
            graphs: [],
            total: 0,
          })),
          getAdminUserKycLifecycle(user.id).catch(() => null),
          getAdminUserRiskProfile(user.id).catch(() => null),
          getAdminUserCourseMarketplace(user.id).catch(() => null),
        ]);
        const u = res.user as any;
        setSelectedUser({
          id: u.id,
          name: u.full_name || u.email,
          email: u.email,
          phone: u.phone,
          role: u.role,
          backend_role: u.backend_role,
          wallet_balance: u.wallet_balance,
          wallet_frozen: u.wallet_frozen,
          currency: u.currency || "THB",
          kyc_level: u.kyc_level,
          kyc_status: u.kyc_status,
          kyc_rejection_reason: u.kyc_rejection_reason,
          account_status: u.account_status || "active",
          created_at: u.created_at,
          last_login_at: u.last_login_at,
          updated_at: u.updated_at,
          provider_status: u.provider_status,
          provider_verified_at: u.provider_verified_at,
          is_vip: u.is_vip,
          banned_until: u.banned_until,
          ban_reason: u.ban_reason,
          bank_accounts: u.bank_accounts || [],
          is_brand_adviser: u.is_brand_adviser,
          adviser_status: u.adviser_status,
          adviser_reputation_score: u.adviser_reputation_score,
          adviser_public_slug: u.adviser_public_slug,
          adviser_public_profile_enabled: u.adviser_public_profile_enabled,
          adviser_granted_at: u.adviser_granted_at,
          adviser_suspended_at: u.adviser_suspended_at,
          adviser_suspended_reason: u.adviser_suspended_reason,
        });
        setDetailLedger(ledgerRes.entries || []);
        setDetailLedgerTotals({
          total_credit: ledgerRes.total_credit ?? 0,
          total_debit: ledgerRes.total_debit ?? 0,
        });
        if (financialRes) {
          setFinancialMovements(financialRes.items || []);
          setFinancialSummary(financialRes.summary);
          setFinancialRiskSignals(financialRes.risk_signals || []);
          applyFinancialExtras(financialRes);
          applyRiskProfileFallback(financialRes, riskProfileRes);
          setFinancialCursor(financialRes.next_cursor);
          setFinancialHasMore(!!financialRes.has_more);
          setFinancialCategory("all");
        }
        if (financialAuditRes) {
          setFinancialAuditItems(financialAuditRes.items || []);
          setCaseSummaryText(financialAuditRes.case_summary || "");
        }
        setCommerceProfile(commerceRes?.profile ?? null);
        setCourseMarketplaceProfile(courseMarketplaceRes ?? null);
        setUnifiedTimeline(timelineRes?.items ?? []);
        setEscrowTimeline(escrowRes?.jobs ?? []);
        setJobGraphs(jobGraphRes?.graphs ?? []);
        setKycLifecycle(kycLifecycleRes?.lifecycle ?? null);
        setKycSupplements(kycLifecycleRes?.supplement_requests ?? []);
        setWhtSummary(kycLifecycleRes?.wht ?? null);
        setDetailAudit((auditRes as { logs: AuditLogRow[] }).logs || []);
        setDetailLoginSessions(
          (sessionsRes as { sessions: typeof detailLoginSessions }).sessions ||
            [],
        );
        setDetailDeviceHopping(
          (sessionsRes as { device_hopping_24h: boolean }).device_hopping_24h ||
            false,
        );
        setDetailNotes((notesRes as { notes: typeof detailNotes }).notes || []);
        setDetailLmsSummary(
          lmsRes && typeof lmsRes === "object" && "avg_grade" in lmsRes
            ? lmsRes
            : null,
        );
        setDetailKyc(
          kycRes && typeof kycRes === "object" && "documents" in kycRes
            ? (kycRes as KycDetailResponse)
            : null,
        );
      } else {
        const details = await DataService.getUserDetails(user.id);
        setSelectedUser(details);
      }
      setShowDetailsModal(true);
    } catch (error: any) {
      showToast(`โหลดรายละเอียดไม่สำเร็จ: ${error?.message || error}`, "error");
    }
    setDetailLoading(false);
    setDetailKycLoading(false);
  };

  const handleEmergencySuspend = async () => {
    if (!selectedUser || !useBackendForUsers || !canManageAccountActions)
      return;
    if (
      !confirm(
        `⚠️ Emergency Suspend: แบนถาวร + ระงับเงิน + บังคับออกจากระบบ\n\nผู้ใช้: ${selectedUser.name}\n\nดำเนินการต่อ?`,
      )
    )
      return;
    setProcessing(true);
    try {
      await emergencySuspendUser(
        selectedUser.id,
        actionReason.trim() || "Emergency Suspend by admin",
      );
      setShowDetailsModal(false);
      fetchUsers(page);
      showToast("Emergency Suspend สำเร็จ", "success");
    } catch (e: any) {
      showToast(e?.message || "ดำเนินการไม่สำเร็จ", "error");
    }
    setProcessing(false);
  };

  const handleGrantBrandAdviser = async () => {
    if (!selectedUser || !useBackendForUsers || !canManageAccountActions)
      return;
    if (
      !confirm(
        "มอบสิทธิ์ Brand Adviser (ยกเว้นค่าคอมแพลตฟอร์มเมื่อโปรแกรมเปิด) ให้ผู้ใช้นี้?",
      )
    )
      return;
    setProcessing(true);
    try {
      await grantBrandAdviserAdminUser(
        selectedUser.id,
        actionReason.trim() || undefined,
      );
      showToast("มอบสิทธิ์ Brand Adviser แล้ว", "success");
      await openUserDetailById(selectedUser.id);
      fetchUsers(page);
    } catch (e: any) {
      showToast(e?.message || "ดำเนินการไม่สำเร็จ", "error");
    }
    setProcessing(false);
  };

  const handleRevokeBrandAdviser = async () => {
    if (!selectedUser || !useBackendForUsers || !canManageAccountActions)
      return;
    if (!confirm("ถอดสิทธิ์ Brand Adviser จากผู้ใช้นี้? (บันทึก audit)"))
      return;
    setProcessing(true);
    try {
      await revokeBrandAdviserAdminUser(
        selectedUser.id,
        actionReason.trim() || undefined,
      );
      showToast("ถอดสิทธิ์ Brand Adviser แล้ว", "success");
      await openUserDetailById(selectedUser.id);
      fetchUsers(page);
    } catch (e: any) {
      showToast(e?.message || "ดำเนินการไม่สำเร็จ", "error");
    }
    setProcessing(false);
  };

  const handleLoginAsUser = async () => {
    if (!selectedUser || !useBackendForUsers || !canManageAccountActions)
      return;
    setProcessing(true);
    try {
      const { token } = await createImpersonationToken(selectedUser.id, 15);
      const baseUrl =
        (import.meta as any).env?.VITE_APP_URL ||
        "https://app.aqond.com" ||
        window.location.origin.replace("admin", "app");
      const url = `${baseUrl}/impersonate?token=${encodeURIComponent(token)}`;
      window.open(url, "_blank", "noopener,noreferrer");
      showToast("เปิดหน้าต่างใหม่ — ใช้ Token 15 นาที", "success");
    } catch (e: any) {
      showToast(e?.message || "สร้าง Token ไม่สำเร็จ", "error");
    }
    setProcessing(false);
  };

  const handleAddNote = async () => {
    if (
      !selectedUser ||
      !useBackendForUsers ||
      !canManageAccountActions ||
      !newNote.trim()
    )
      return;
    setProcessing(true);
    try {
      await addAdminUserNote(selectedUser.id, newNote.trim());
      setDetailNotes((prev) => [
        {
          id: "",
          admin_name: "—",
          note: newNote.trim(),
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      setNewNote("");
      showToast("บันทึกโน้ตแล้ว", "success");
    } catch (e: any) {
      showToast(e?.message || "บันทึกไม่สำเร็จ", "error");
    }
    setProcessing(false);
  };

  const handleWalletAdjust = async () => {
    if (!selectedUser || !useBackendForUsers || !canManageAccountActions)
      return;
    const amt = parseFloat(walletAdjustAmount);
    const reason = walletAdjustReason.trim();
    if (!Number.isFinite(amt) || amt <= 0 || !reason) {
      showToast("กรุณาระบุจำนวนและสาเหตุ", "error");
      return;
    }
    if (walletAdjustDirection === "debit") {
      const rc = walletAdjustReasonCode.trim();
      const ev = walletAdjustEvidenceRef.trim();
      if (!rc || !ev) {
        showToast(
          "การหักเงิน (Debit) ต้องระบุ reason_code และ evidence_ref (เลข ledger รายการผิด)",
          "error",
        );
        return;
      }
    }
    setProcessing(true);
    try {
      const res = await adminWalletAdjust(
        selectedUser.id,
        walletAdjustDirection,
        amt,
        reason,
        walletAdjustDirection === "debit"
          ? {
              reason_code: walletAdjustReasonCode.trim(),
              evidence_ref: walletAdjustEvidenceRef.trim(),
            }
          : undefined,
      );
      setSelectedUser((u: any) =>
        u ? { ...u, wallet_balance: res.balance_after } : u,
      );
      setShowWalletAdjustModal(false);
      setWalletAdjustAmount("");
      setWalletAdjustReason("");
      setWalletAdjustReasonCode("");
      setWalletAdjustEvidenceRef("");
      showToast(
        `${walletAdjustDirection === "credit" ? "เติม" : "หัก"} ฿${amt.toLocaleString()} สำเร็จ`,
        "success",
      );
    } catch (e: any) {
      showToast(e?.message || "ดำเนินการไม่สำเร็จ", "error");
    }
    setProcessing(false);
  };

  const handleSuspend = async () => {
    if (!selectedUser || !useBackendForUsers || !canManageAccountActions)
      return;
    const reason = actionReason.trim() || "Suspended by admin";
    if (!confirm(`Suspend user ${selectedUser.name}?\nReason: ${reason}`))
      return;
    setProcessing(true);
    try {
      await suspendAdminUser(selectedUser.id, reason);
      setShowDetailsModal(false);
      fetchUsers(page);
    } catch (e: any) {
      showToast(e?.message || "Failed to suspend", "error");
    }
    setProcessing(false);
  };
  const handleBan = async () => {
    if (!selectedUser || !useBackendForUsers || !canManageAccountActions)
      return;
    const reason = actionReason.trim() || "Banned by admin";
    const days = Math.max(0, parseInt(banDays, 10) || 0);
    const msg =
      days > 0
        ? `แบนผู้ใช้ ${selectedUser.name} เป็นเวลา ${days} วัน?\nสาเหตุ: ${reason}`
        : `แบนผู้ใช้ ${selectedUser.name} แบบถาวร?\nสาเหตุ: ${reason}`;
    if (!confirm(msg)) return;
    setProcessing(true);
    try {
      await banAdminUser(selectedUser.id, reason, days > 0 ? days : undefined);
      setShowDetailsModal(false);
      fetchUsers(page);
      showToast(
        days > 0 ? `แบน ${days} วัน สำเร็จ` : "แบนถาวรสำเร็จ",
        "success",
      );
    } catch (e: any) {
      showToast(e?.message || "Failed to ban", "error");
    }
    setProcessing(false);
  };
  const handleApproveProvider = async () => {
    if (!selectedUser || !useBackendForUsers || !canManageAccountActions)
      return;
    if (
      !confirm(
        `อนุมัติให้ ${selectedUser.name} เป็นผู้รับงาน (Verified Provider) ใช่หรือไม่?`,
      )
    )
      return;
    setProcessing(true);
    try {
      await approveUserAsProvider(selectedUser.id);
      setSelectedUser((u: any) =>
        u
          ? {
              ...u,
              provider_status: "VERIFIED_PROVIDER",
              provider_verified_at: new Date().toISOString(),
            }
          : u,
      );
      showToast("ตั้งเป็น Verified Provider แล้ว", "success");
    } catch (e: any) {
      showToast(e?.message || "Failed to approve provider", "error");
    }
    setProcessing(false);
  };
  const handleChangeAppRole = async () => {
    if (!selectedUser || !useBackendForUsers || !canManageAccountActions)
      return;
    setProcessing(true);
    try {
      await updateAdminUserAppRole(selectedUser.id, appRole);
      setSelectedUser((u: any) => (u ? { ...u, role: appRole } : u));
      setShowAppRoleModal(false);
      showToast(
        `เปลี่ยนสถานะเป็น ${appRole === "provider" ? "ผู้รับงาน" : "ผู้ใช้"} แล้ว`,
        "success",
      );
    } catch (e: any) {
      showToast(e?.message || "Failed to change app role", "error");
    }
    setProcessing(false);
  };
  const handleSetVip = async (isVip: boolean) => {
    if (!selectedUser || !useBackendForUsers || !canManageAccountActions)
      return;
    setProcessing(true);
    try {
      await setUserVip(selectedUser.id, isVip);
      setSelectedUser((u: any) => (u ? { ...u, is_vip: isVip } : u));
      showToast(isVip ? "ตั้งเป็น VIP แล้ว" : "ยกเลิก VIP แล้ว", "success");
    } catch (e: any) {
      showToast(e?.message || "Failed to update VIP", "error");
    }
    setProcessing(false);
  };
  const handleReactivate = async () => {
    if (!selectedUser || !useBackendForUsers || !canManageAccountActions)
      return;
    if (!confirm(`Reactivate user ${selectedUser.name}?`)) return;
    setProcessing(true);
    try {
      await reactivateAdminUser(
        selectedUser.id,
        actionReason.trim() || undefined,
      );
      setShowDetailsModal(false);
      fetchUsers(page);
    } catch (e: any) {
      showToast(e?.message || "Failed to reactivate", "error");
    }
    setProcessing(false);
  };

  const handleWalletFreeze = async (frozen: boolean) => {
    if (!selectedUser || !useBackendForUsers || !canManageAccountActions)
      return;
    const action = frozen ? "ระงับเงิน" : "ปลดระงับเงิน";
    if (!confirm(`${action} ของ ${selectedUser.name}?`)) return;
    setProcessing(true);
    try {
      await walletFreezeAdminUser(selectedUser.id, frozen);
      setSelectedUser((u: any) => (u ? { ...u, wallet_frozen: frozen } : u));
      showToast(frozen ? "ระงับเงินแล้ว" : "ปลดระงับเงินแล้ว", "success");
    } catch (e: any) {
      showToast(e?.message || "ดำเนินการไม่สำเร็จ", "error");
    }
    setProcessing(false);
  };
  const handleForceLogout = async () => {
    if (!selectedUser || !useBackendForUsers || !canManageAccountActions)
      return;
    const reason = actionReason.trim() || "Force logout by admin";
    if (
      !confirm(
        `Force logout user ${selectedUser.name}?\nReason: ${reason}\n\nผู้ใช้จะถูกบังคับออกจากระบบทันที — โทเค็นเดิมจะใช้ไม่ได้`,
      )
    )
      return;
    setProcessing(true);
    try {
      await forceLogoutAdminUser(selectedUser.id, reason);
      showToast(
        "Force logout สำเร็จ — โทเค็นของผู้ใช้ถูกยกเลิกแล้ว",
        "success",
      );
    } catch (e: any) {
      showToast(e?.message || "ดำเนินการไม่สำเร็จ", "error");
    }
    setProcessing(false);
  };

  const handleUnlockRateLimit = async () => {
    if (!selectedUser || !useBackendForUsers || !canManageAccountActions)
      return;
    if (
      !confirm(
        `ปลดล็อก Rate Limit ให้ ${selectedUser.name || selectedUser.email || selectedUser.id} ชั่วคราว?\n\nระบบจะล้าง bucket ที่ผูกกับ user และเปิด bypass ประมาณ 1 ชั่วโมง`,
      )
    )
      return;
    setProcessing(true);
    try {
      const res = await unlockAdminUserRateLimit(
        selectedUser.id,
        actionReason.trim() || "Admin unlocked rate limit",
      );
      showToast(
        `ปลดล็อก Rate Limit แล้ว (ล้าง ${res.cleared?.cleared ?? 0} bucket)`,
        "success",
      );
    } catch (e: any) {
      showToast(e?.message || "ปลดล็อก Rate Limit ไม่สำเร็จ", "error");
    }
    setProcessing(false);
  };

  const openRoleModal = (user: any) => {
    setSelectedUser(user);
    setRoleChangeReason("");
    if (useBackendForUsers) {
      setNewRole(
        (user.role === "ADMIN" || user.role === "AUDITOR"
          ? user.role
          : "USER") as BackendRole,
      );
    } else {
      setNewRole(
        user.role === "PROVIDER" || user.role === "provider"
          ? "USER"
          : "PROVIDER",
      );
    }
    setShowRoleModal(true);
  };

  const openBalanceModal = (user: any) => {
    if (useBackendForUsers) return;
    setSelectedUser(user);
    setNewBalance(user.wallet_balance?.toString() || "0");
    setShowBalanceModal(true);
  };

  const onSearch = () => {
    setPage(1);
    if (useBackendForUsers) fetchUsers(1);
    else setPage(1); // Firebase mode: client-side filter, just reset page
  };

  // โหมด Firebase: กรองและแบ่งหน้าบน client
  const filteredBySearch =
    useFirebaseList && searchTerm.trim()
      ? users.filter((u: any) => {
          const term = searchTerm.toLowerCase();
          const id = String(u.id || "").toLowerCase();
          const email = String(u.email || "").toLowerCase();
          const name = String(u.username || u.name || "").toLowerCase();
          const phone = String(u.phone || "").toLowerCase();
          return (
            id.includes(term) ||
            email.includes(term) ||
            name.includes(term) ||
            phone.includes(term)
          );
        })
      : users;
  const displayUsers = useFirebaseList
    ? filteredBySearch.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : users;
  const totalPages = Math.max(
    1,
    useFirebaseList
      ? Math.ceil(filteredBySearch.length / PAGE_SIZE)
      : Math.ceil(pagination.total / pagination.limit),
  );
  const displayTotal = useBackendForUsers
    ? pagination.total
    : useFirebaseList
      ? filteredBySearch.length
      : users.length;
  const isBackendRow = (u: any): u is AdminUserRow =>
    useBackendForUsers && u && "account_status" in u;
  const rowDisplay = (u: any) => ({
    id: u.id,
    username: isBackendRow(u) ? u.full_name || u.email : u.username,
    email: u.email,
    role: u.role,
    status: isBackendRow(u)
      ? u.account_status === "banned"
        ? "banned"
        : u.account_status === "suspended"
          ? "offline"
          : "online"
      : u.status,
    lastActive: isBackendRow(u)
      ? u.last_login_at || u.created_at
      : u.lastActive,
    kyc_status: isBackendRow(u) ? u.kyc_status : undefined,
    created_at: isBackendRow(u) ? u.created_at : undefined,
    last_login_at: isBackendRow(u) ? u.last_login_at : undefined,
    phone: isBackendRow(u) ? u.phone : undefined,
  });

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50">
          <div
            className={
              "min-w-[260px] max-w-[420px] rounded-xl border px-4 py-3 shadow-lg backdrop-blur " +
              (toast.type === "error"
                ? "bg-red-50/90 border-red-200 text-red-900"
                : toast.type === "success"
                  ? "bg-emerald-50/90 border-emerald-200 text-emerald-900"
                  : "bg-slate-50/90 border-slate-200 text-slate-900")
            }
          >
            <div className="text-sm font-semibold">
              {toast.type === "error"
                ? "Error"
                : toast.type === "success"
                  ? "Success"
                  : "Info"}
            </div>
            <div className="text-sm mt-0.5">{toast.message}</div>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">👥 User Management</h2>
        <p className="text-indigo-100">
          {canSwitchSource
            ? dataSource === "firebase"
              ? "ดึงรายชื่อผู้สมัครจากแอป (Firebase) — เปลี่ยน role เป็น Provider ได้"
              : "ดึงรายชื่อจาก Backend (PostgreSQL) — KYC, Audit, Account control"
            : useFirebaseList
              ? "ดึงรายชื่อผู้สมัครจากแอป (Firebase) — เปลี่ยน role เป็น Provider ได้"
              : "จัดการผู้ใช้งาน Meerak ทั้งหมด"}
        </p>
      </div>

      {useBackendForUsers && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setUmPrimaryTab("users");
              setOpsAttentionFilter(false);
              setReconcileRepeatFilter(false);
              setPage(1);
            }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              umPrimaryTab === "users" && !opsAttentionFilter
                ? "bg-indigo-600 text-white shadow"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            ผู้ใช้แอป (Backend)
          </button>
          <button
            type="button"
            onClick={() => {
              setUmPrimaryTab("users");
              setOpsAttentionFilter(true);
              setReconcileRepeatFilter(false);
              setSortReconcileFails(true);
              setPage(1);
            }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              opsAttentionFilter
                ? "bg-red-600 text-white shadow"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            Ops queue
          </button>
          {useBackendForUsers && opsAttentionFilter && (
            <button
              type="button"
              disabled={opsQueueExporting}
              onClick={async () => {
                setOpsQueueExporting(true);
                try {
                  await downloadAdminOpsQueueCsv(500);
                } catch (e) {
                  alert(
                    e instanceof Error ? e.message : "Export ops queue failed",
                  );
                } finally {
                  setOpsQueueExporting(false);
                }
              }}
              className="px-3 py-2 rounded-lg text-sm font-semibold bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1.5"
              title="ดาวน์โหลด Ops queue เป็น CSV"
            >
              {opsQueueExporting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Download size={14} />
              )}
              Export CSV
            </button>
          )}
          <button
            type="button"
            onClick={() => setUmPrimaryTab("landing")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              umPrimaryTab === "landing"
                ? "bg-indigo-600 text-white shadow"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            ลงทะเบียน Landing
          </button>
        </div>
      )}

      {useBackendForUsers && umPrimaryTab === "landing" ? (
        <LandingLeadsPanel />
      ) : (
        <>
          {/* Profile summary — ห้ามลบ: Total user, Providers, Online, Banned */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-lg border border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Total Users</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {displayTotal}
                  </p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Activity className="text-blue-600" size={24} />
                </div>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Providers</p>
                  <p className="text-2xl font-bold text-emerald-600">
                    {
                      users.filter(
                        (u: any) =>
                          u.role === "PROVIDER" || u.role === "provider",
                      ).length
                    }
                  </p>
                </div>
                <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center">
                  <Shield className="text-emerald-600" size={24} />
                </div>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Online</p>
                  <p className="text-2xl font-bold text-green-600">
                    {
                      users.filter(
                        (u: any) =>
                          (u.status || (u as AdminUserRow).account_status) ===
                            "online" ||
                          (u as AdminUserRow).account_status === "active",
                      ).length
                    }
                  </p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <Activity className="text-green-600" size={24} />
                </div>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Banned</p>
                  <p className="text-2xl font-bold text-red-600">
                    {
                      users.filter(
                        (u: any) =>
                          u.status === "banned" ||
                          (u as AdminUserRow).account_status === "banned",
                      ).length
                    }
                  </p>
                </div>
                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                  <Ban className="text-red-600" size={24} />
                </div>
              </div>
            </div>
          </div>

          {/* Search (email / user_id) + Filter (role, status, kyc_status) + Table + Pagination */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-100 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-lg font-bold text-slate-800">
                    All Users
                  </h3>
                  {canSwitchSource && (
                    <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                      <button
                        type="button"
                        onClick={() => {
                          setDataSource("firebase");
                          setPage(1);
                        }}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                          dataSource === "firebase"
                            ? "bg-white text-indigo-600 shadow-sm"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        ดูจาก Firebase
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDataSource("backend");
                          setPage(1);
                        }}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                          dataSource === "backend"
                            ? "bg-white text-indigo-600 shadow-sm"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        ดูจาก Backend
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[180px]">
                    <Search
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      size={18}
                    />
                    <input
                      type="text"
                      placeholder="Search by email or user ID..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && onSearch()}
                      className="pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <button
                    onClick={onSearch}
                    className="py-2 px-4 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
                  >
                    Search
                  </button>
                </div>
              </div>
              {useBackendForUsers && (
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-xs text-slate-500 font-medium">
                    Filters:
                  </span>
                  <select
                    value={roleFilter}
                    onChange={(e) => {
                      setRoleFilter(e.target.value);
                      setPage(1);
                    }}
                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm"
                  >
                    <option value="">All roles</option>
                    <option value="USER">USER</option>
                    <option value="ADMIN">ADMIN</option>
                    <option value="AUDITOR">AUDITOR</option>
                    <option value="provider">Provider</option>
                    <option value="user">User</option>
                  </select>
                  <select
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value);
                      setPage(1);
                    }}
                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm"
                  >
                    <option value="">All status</option>
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                    <option value="banned">Banned</option>
                  </select>
                  <select
                    value={kycFilter}
                    onChange={(e) => {
                      setKycFilter(e.target.value);
                      setPage(1);
                    }}
                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm"
                  >
                    <option value="">All KYC</option>
                    <option value="not_submitted">Not submitted</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={vipFilter}
                      onChange={(e) => {
                        setVipFilter(e.target.checked);
                        setPage(1);
                      }}
                      className="rounded border-slate-300"
                    />
                    <span className="text-slate-600">VIP เท่านั้น</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={betaTesterFilter}
                      onChange={(e) => {
                        setBetaTesterFilter(e.target.checked);
                        setPage(1);
                      }}
                      className="rounded border-slate-300"
                    />
                    <span className="text-slate-600">
                      ทีมทดสอบ (Beta) เท่านั้น
                    </span>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={reconcileRepeatFilter}
                      onChange={(e) => {
                        setReconcileRepeatFilter(e.target.checked);
                        if (e.target.checked) setOpsAttentionFilter(false);
                        setPage(1);
                      }}
                      className="rounded border-slate-300"
                    />
                    <span className="text-slate-600">Reconcile repeat</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={sortReconcileFails}
                      onChange={(e) => {
                        setSortReconcileFails(e.target.checked);
                        setPage(1);
                      }}
                      className="rounded border-slate-300"
                    />
                    <span className="text-slate-600">
                      เรียงตาม reconcile fail
                    </span>
                  </label>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                  <Loader2 size={32} className="animate-spin mb-2" />
                  <p>
                    {useFirebaseList
                      ? "Loading from Firebase..."
                      : useBackendForUsers
                        ? "Loading from backend..."
                        : "Loading..."}
                  </p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase">
                        User ID / Email / Phone
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase">
                        Role
                      </th>
                      {useBackendForUsers && (
                        <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase">
                          KYC
                        </th>
                      )}
                      {!useBackendForUsers && (
                        <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase">
                          Wallet
                        </th>
                      )}
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase">
                        Status
                      </th>
                      {useBackendForUsers && (
                        <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase">
                          Created / Last login
                        </th>
                      )}
                      <th className="px-6 py-4 text-right text-xs font-bold text-slate-600 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayUsers.map((user) => {
                      const d = rowDisplay(user);
                      return (
                        <tr
                          key={user.id}
                          className="hover:bg-slate-50 transition-colors"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-white flex items-center justify-center font-bold">
                                {(d.username || d.email || "?")
                                  .charAt(0)
                                  .toUpperCase()}
                              </div>
                              <div>
                                <p className="text-xs font-mono text-slate-500">
                                  {user.id}
                                </p>
                                <p className="font-bold text-slate-900">
                                  {d.username}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {d.email}
                                </p>
                                {(d.phone || (user as AdminUserRow).phone) && (
                                  <p className="text-xs text-slate-400 flex items-center gap-1">
                                    <Phone size={10} />{" "}
                                    {d.phone || (user as AdminUserRow).phone}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                                  d.role === "ADMIN" || d.role === "admin"
                                    ? "bg-rose-100 text-rose-700"
                                    : d.role === "AUDITOR" ||
                                        d.role === "auditor"
                                      ? "bg-amber-100 text-amber-700"
                                      : d.role === "PROVIDER" ||
                                          d.role === "provider"
                                        ? "bg-emerald-100 text-emerald-700"
                                        : "bg-blue-100 text-blue-700"
                                }`}
                              >
                                {d.role}
                              </span>
                              {useBackendForUsers &&
                                (user as AdminUserRow).is_vip && (
                                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                                    VIP
                                  </span>
                                )}
                              {useBackendForUsers &&
                                (user as AdminUserRow).is_beta_tester && (
                                  <span
                                    className="px-2 py-0.5 rounded text-xs font-medium bg-violet-100 text-violet-800"
                                    title={`Beta tester #${(user as AdminUserRow).beta_tester_number ?? "?"}`}
                                  >
                                    Beta #
                                    {(user as AdminUserRow)
                                      .beta_tester_number ?? "?"}
                                  </span>
                                )}
                              {useBackendForUsers &&
                                (user as AdminUserRow).reconcile_status &&
                                (user as AdminUserRow).reconcile_status !==
                                  "skip" && (
                                  <span
                                    className={`px-2 py-0.5 rounded text-xs font-bold ${
                                      (user as AdminUserRow)
                                        .reconcile_status === "pass"
                                        ? "bg-emerald-100 text-emerald-800"
                                        : "bg-orange-100 text-orange-900"
                                    }`}
                                    title={
                                      (user as AdminUserRow)
                                        .reconcile_verdict_th ||
                                      (user as AdminUserRow)
                                        .reconcile_verdict ||
                                      "Reconcile snapshot"
                                    }
                                  >
                                    RC{" "}
                                    {(user as AdminUserRow).reconcile_status ===
                                    "pass"
                                      ? "✓"
                                      : "!"}
                                  </span>
                                )}
                              {useBackendForUsers &&
                                (user as AdminUserRow).is_reconcile_repeat && (
                                  <span
                                    className="px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-800"
                                    title="Reconcile fail ซ้ำ"
                                  >
                                    R×
                                    {(user as AdminUserRow)
                                      .reconcile_fail_count_30d ?? "?"}
                                  </span>
                                )}
                              {useBackendForUsers &&
                                (user as AdminUserRow).open_support_case_id && (
                                  <span
                                    className="px-2 py-0.5 rounded text-xs font-medium bg-sky-100 text-sky-800"
                                    title={
                                      (user as AdminUserRow)
                                        .open_support_case_id || ""
                                    }
                                  >
                                    MRK
                                    {(user as AdminUserRow)
                                      .open_support_case_priority
                                      ? ` ${(user as AdminUserRow).open_support_case_priority}`
                                      : ""}
                                  </span>
                                )}
                              {useBackendForUsers &&
                                (user as AdminUserRow).needs_ops_attention &&
                                !(user as AdminUserRow).is_reconcile_repeat &&
                                !(user as AdminUserRow)
                                  .open_support_case_id && (
                                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-900">
                                    Ops
                                  </span>
                                )}
                            </div>
                          </td>
                          {useBackendForUsers && (
                            <td className="px-6 py-4">
                              <span className="text-xs text-slate-600">
                                {(d as any).kyc_status || "—"}
                              </span>
                            </td>
                          )}
                          {!useBackendForUsers && (
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <DollarSign
                                  size={16}
                                  className="text-emerald-600"
                                />
                                <span className="font-bold text-emerald-600">
                                  ฿
                                  {(
                                    user as any
                                  ).wallet_balance?.toLocaleString() || 0}
                                </span>
                              </div>
                            </td>
                          )}
                          <td className="px-6 py-4">
                            <span
                              className={`px-2 py-1 rounded text-xs font-bold ${
                                d.status === "online"
                                  ? "bg-green-100 text-green-700"
                                  : d.status === "banned"
                                    ? "bg-red-100 text-red-700"
                                    : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {d.status}
                            </span>
                          </td>
                          {useBackendForUsers && (
                            <td className="px-6 py-4 text-xs text-slate-500">
                              {d.created_at
                                ? new Date(d.created_at).toLocaleDateString()
                                : "—"}{" "}
                              /{" "}
                              {d.last_login_at
                                ? new Date(d.last_login_at).toLocaleDateString()
                                : "—"}
                            </td>
                          )}
                          <td className="px-6 py-4">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => openRoleModal(user)}
                                disabled={isAuditor}
                                className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title={
                                  isAuditor
                                    ? "Auditor: read-only"
                                    : "Change Role"
                                }
                              >
                                <UserCog size={18} />
                              </button>
                              {!useBackendForUsers && (
                                <button
                                  onClick={() => openBalanceModal(user)}
                                  className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                  title="Edit Wallet"
                                >
                                  <Wallet size={18} />
                                </button>
                              )}
                              <button
                                onClick={() => handleViewDetails(user)}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="View Details"
                              >
                                <Eye size={18} />
                              </button>
                              {!useBackendForUsers && (
                                <button
                                  onClick={() => handleBanUser(user)}
                                  className={`p-2 rounded-lg transition-colors ${
                                    d.status === "banned"
                                      ? "text-green-600 hover:bg-green-50"
                                      : "text-red-600 hover:bg-red-50"
                                  }`}
                                  title={
                                    d.status === "banned" ? "Unban" : "Ban"
                                  }
                                >
                                  {d.status === "banned" ? (
                                    <Unlock size={18} />
                                  ) : (
                                    <Ban size={18} />
                                  )}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {displayUsers.length === 0 && (
                      <tr>
                        <td
                          colSpan={useBackendForUsers ? 6 : 5}
                          className="px-6 py-12 text-center text-slate-400"
                        >
                          No users found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
            {(useBackendForUsers
              ? pagination.total > PAGE_SIZE
              : filteredBySearch.length > PAGE_SIZE) && (
              <div className="p-4 border-t border-slate-100 flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  Showing {(page - 1) * PAGE_SIZE + 1}–
                  {Math.min(page * PAGE_SIZE, displayTotal)} of {displayTotal}
                </p>
                <div className="flex gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="p-2 border border-slate-200 rounded-lg disabled:opacity-50 hover:bg-slate-50"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className="py-2 px-3 text-sm font-medium text-slate-700">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="p-2 border border-slate-200 rounded-lg disabled:opacity-50 hover:bg-slate-50"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Role Change Modal */}
      {showRoleModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900 flex items-center">
                <UserCog className="text-purple-600 mr-2" size={24} />
                Change User Role
              </h3>
              <button
                onClick={() => setShowRoleModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={24} />
              </button>
            </div>

            <div className="bg-slate-50 p-4 rounded-lg mb-6">
              <p className="text-sm text-slate-500">User:</p>
              <p className="font-bold text-slate-900">
                {selectedUser.name ||
                  selectedUser.full_name ||
                  selectedUser.username ||
                  selectedUser.email}
              </p>
              <p className="text-xs text-slate-500">{selectedUser.email}</p>
              {selectedUser.contact_email &&
                String(selectedUser.contact_email).trim() !==
                  String(selectedUser.email || "").trim() && (
                  <p className="text-xs text-indigo-600 mt-1">
                    อีเมลติดต่อ: {selectedUser.contact_email}
                  </p>
                )}
            </div>

            <div className="space-y-3 mb-6">
              {useBackendForUsers ? (
                <>
                  <label className="flex items-center p-4 border-2 border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition">
                    <input
                      type="radio"
                      name="role"
                      value="USER"
                      checked={newRole === "USER"}
                      onChange={() => setNewRole("USER")}
                      className="mr-3"
                    />
                    <div>
                      <div className="font-bold text-slate-900">USER</div>
                      <div className="text-xs text-slate-500">
                        Wallet only (app user)
                      </div>
                    </div>
                  </label>
                  <label className="flex items-center p-4 border-2 border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition">
                    <input
                      type="radio"
                      name="role"
                      value="ADMIN"
                      checked={newRole === "ADMIN"}
                      onChange={() => setNewRole("ADMIN")}
                      className="mr-3"
                    />
                    <div>
                      <div className="font-bold text-slate-900">ADMIN</div>
                      <div className="text-xs text-slate-500">
                        Full admin + reconciliation
                      </div>
                    </div>
                  </label>
                  <label className="flex items-center p-4 border-2 border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition">
                    <input
                      type="radio"
                      name="role"
                      value="AUDITOR"
                      checked={newRole === "AUDITOR"}
                      onChange={() => setNewRole("AUDITOR")}
                      className="mr-3"
                    />
                    <div>
                      <div className="font-bold text-slate-900">AUDITOR</div>
                      <div className="text-xs text-slate-500">
                        Read-only audit access
                      </div>
                    </div>
                  </label>
                </>
              ) : (
                <>
                  <label className="flex items-center p-4 border-2 border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition">
                    <input
                      type="radio"
                      name="role"
                      value="USER"
                      checked={newRole === "USER"}
                      onChange={() => setNewRole("USER")}
                      className="mr-3"
                    />
                    <div>
                      <div className="font-bold text-slate-900">
                        👤 USER (ผู้จ้าง)
                      </div>
                      <div className="text-xs text-slate-500">
                        Can create and post jobs
                      </div>
                    </div>
                  </label>
                  <label className="flex items-center p-4 border-2 border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition">
                    <input
                      type="radio"
                      name="role"
                      value="PROVIDER"
                      checked={newRole === "PROVIDER"}
                      onChange={() => setNewRole("PROVIDER")}
                      className="mr-3"
                    />
                    <div>
                      <div className="font-bold text-slate-900">
                        ⚡ PROVIDER (ผู้รับงาน)
                      </div>
                      <div className="text-xs text-slate-500">
                        Can accept and complete jobs
                      </div>
                    </div>
                  </label>
                </>
              )}
            </div>

            {useBackendForUsers && (
              <div className="mb-6">
                <label className="block text-xs text-slate-500 mb-1">
                  Reason (for audit)
                </label>
                <input
                  type="text"
                  value={roleChangeReason}
                  onChange={(e) => setRoleChangeReason(e.target.value)}
                  placeholder="Optional reason for role change"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowRoleModal(false)}
                className="flex-1 py-3 border-2 border-slate-300 text-slate-700 font-bold rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleChangeRole}
                disabled={processing}
                className="flex-1 py-3 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 flex items-center justify-center disabled:opacity-50"
              >
                {processing ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <>
                    <Check className="mr-2" size={18} /> Update
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Balance Modal */}
      {showBalanceModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900 flex items-center">
                <Wallet className="text-emerald-600 mr-2" size={24} />
                Edit Wallet Balance
              </h3>
              <button
                onClick={() => setShowBalanceModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={24} />
              </button>
            </div>

            <div className="bg-emerald-50 p-4 rounded-lg mb-6">
              <p className="text-sm text-emerald-700">User:</p>
              <p className="font-bold text-emerald-900">
                {selectedUser.username}
              </p>
              <p className="text-xs text-emerald-600">
                Current Balance: ฿
                {selectedUser.wallet_balance?.toLocaleString() || 0}
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-bold text-slate-700 mb-2">
                New Balance (THB)
              </label>
              <input
                type="number"
                value={newBalance}
                onChange={(e) => setNewBalance(e.target.value)}
                className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg text-lg font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="0.00"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowBalanceModal(false)}
                className="flex-1 py-3 border-2 border-slate-300 text-slate-700 font-bold rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateBalance}
                disabled={processing || !newBalance}
                className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 flex items-center justify-center disabled:opacity-50"
              >
                {processing ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <>
                    <Check className="mr-2" size={18} /> Update
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Details Modal — Profile, Wallet (read-only), KYC, Last activities, Risk flags, Account control */}
      {showDetailsModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="sticky top-0 z-10 shrink-0 bg-white border-b border-slate-200 px-6 pt-4 pb-3">
              <div className="flex justify-between items-start gap-3 mb-2">
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center truncate">
                    <Eye className="text-blue-600 mr-2 shrink-0" size={20} />
                    {selectedUser.name || selectedUser.email}
                  </h3>
                  <p className="text-xs font-mono text-slate-500 truncate">
                    {selectedUser.id}
                  </p>
                  {supportCase?.case_id && (
                    <p className="text-[11px] font-mono text-indigo-700 mt-0.5">
                      Case: {supportCase.case_id}
                      {supportCase.priority === "urgent" ||
                      supportCase.priority === "high" ? (
                        <span className="ml-1 text-red-700 uppercase">
                          ({supportCase.priority})
                        </span>
                      ) : null}
                    </p>
                  )}
                  {useBackendForUsers &&
                    balanceReconcile?.status === "warn" && (
                      <div className="mt-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2">
                        <p className="text-xs font-bold text-red-900 flex items-center gap-1">
                          <AlertTriangle size={14} /> Reconcile FAIL
                        </p>
                        <p className="text-[11px] text-red-800 mt-0.5">
                          คาด ฿
                          {balanceReconcile.expected_balance.toLocaleString()} →
                          จริง ฿
                          {balanceReconcile.actual_balance.toLocaleString()}{" "}
                          (ต่าง {balanceReconcile.variance >= 0 ? "+" : ""}฿
                          {balanceReconcile.variance.toLocaleString()})
                        </p>
                        {balanceReconcile.explain && (
                          <div className="mt-1.5 rounded border border-red-200 bg-white/80 px-2 py-1.5 text-[10px] text-red-900">
                            <p className="font-bold">
                              {balanceReconcile.explain.verdict_th}
                            </p>
                            {balanceReconcile.explain.use_explained_formula && (
                              <p className="mt-0.5">
                                สูตรขยาย: คาด ฿
                                {balanceReconcile.explain.explained.expected_balance.toLocaleString()}{" "}
                                → ต่าง{" "}
                                {balanceReconcile.explain.explained.variance >=
                                0
                                  ? "+"
                                  : ""}
                                ฿
                                {balanceReconcile.explain.explained.variance.toLocaleString()}
                              </p>
                            )}
                            <ul className="mt-1 space-y-0.5">
                              {balanceReconcile.explain.breakdown
                                .filter((b) => Math.abs(b.amount) >= 0.01)
                                .map((b) => (
                                  <li
                                    key={b.key}
                                    className="flex justify-between gap-2"
                                  >
                                    <span>{b.label}</span>
                                    <span className="font-mono shrink-0">
                                      {b.effect === "debit" ? "−" : "+"}฿
                                      {b.amount.toLocaleString()}
                                    </span>
                                  </li>
                                ))}
                            </ul>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          <button
                            type="button"
                            onClick={() => scrollToDetailSection("wallet")}
                            className="px-2 py-0.5 rounded text-[10px] font-bold bg-white border border-red-200 text-red-800 hover:bg-red-100"
                          >
                            ดู Wallet
                          </button>
                          <button
                            type="button"
                            disabled={exportingSupportPack}
                            onClick={() => handleExportSupportPack("json")}
                            className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            Export JSON
                          </button>
                          <button
                            type="button"
                            disabled={exportingSupportPack}
                            onClick={() => handleExportSupportPack("csv")}
                            className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-700 text-white hover:bg-red-800 disabled:opacity-50"
                          >
                            Export CSV
                          </button>
                          <button
                            type="button"
                            disabled={exportingUser360}
                            onClick={() => handleExportUser360("json")}
                            className="px-2 py-0.5 rounded text-[10px] font-bold bg-violet-700 text-white hover:bg-violet-800 disabled:opacity-50"
                          >
                            User 360 JSON
                          </button>
                          <button
                            type="button"
                            disabled={exportingUser360}
                            onClick={() => handleExportUser360("csv")}
                            className="px-2 py-0.5 rounded text-[10px] font-bold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
                          >
                            User 360 CSV
                          </button>
                          {setView && (
                            <button
                              type="button"
                              onClick={() => {
                                setShowDetailsModal(false);
                                setView("support-cases");
                              }}
                              className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-600 text-white hover:bg-indigo-700"
                            >
                              Support Cases
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  <p className="text-sm font-bold text-emerald-700 mt-0.5">
                    ฿
                    {(
                      walletSnapshot?.wallet_balance ??
                      selectedUser.wallet_balance ??
                      0
                    ).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => setShowDetailsModal(false)}
                  className="text-slate-400 hover:text-slate-600 shrink-0"
                >
                  <X size={24} />
                </button>
              </div>
              {useBackendForUsers &&
                compositeRisk &&
                compositeRisk.composite_tier !== "none" && (
                  <div className="mb-2">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        compositeRisk.composite_tier === "critical"
                          ? "bg-red-200 text-red-900"
                          : compositeRisk.composite_tier === "high"
                            ? "bg-red-100 text-red-800"
                            : compositeRisk.composite_tier === "medium"
                              ? "bg-amber-100 text-amber-900"
                              : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      Risk {compositeRisk.composite_tier} (
                      {compositeRisk.composite_score})
                      {compositeRisk.linked_account_count > 0
                        ? ` · ${compositeRisk.linked_account_count} linked`
                        : ""}
                    </span>
                  </div>
                )}
              {useBackendForUsers && securityRiskBadges.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {securityRiskBadges.slice(0, 4).map((badge) => (
                    <span
                      key={badge.code}
                      className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        badge.severity === "high"
                          ? "bg-red-100 text-red-800"
                          : "bg-amber-100 text-amber-900"
                      }`}
                    >
                      {badge.label}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-1">
                {DETAIL_TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => scrollToDetailSection(t.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                      detailTab === t.id
                        ? "bg-indigo-100 text-indigo-800"
                        : "text-slate-500 hover:bg-slate-100"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div
              ref={detailScrollRef}
              className="flex-1 overflow-y-auto px-6 py-4"
            >
              {detailLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 size={32} className="animate-spin text-slate-400" />
                </div>
              ) : (
                <>
                  {/* Profile summary */}
                  <section id="ud-profile" className="mb-6 scroll-mt-4">
                    <h4 className="text-sm font-bold text-slate-600 uppercase mb-3">
                      Profile
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="bg-slate-50 p-3 rounded-lg">
                        <p className="text-xs text-slate-500">Name / User ID</p>
                        <p className="font-bold text-slate-900">
                          {selectedUser.name}
                        </p>
                        <p className="text-xs font-mono text-slate-500">
                          {selectedUser.id}
                        </p>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-lg">
                        <p className="text-xs text-slate-500">Email / Phone</p>
                        <p className="font-bold text-slate-900">
                          {selectedUser.email}
                        </p>
                        <p className="text-sm text-slate-600">
                          {selectedUser.phone || "—"}
                        </p>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-lg">
                        <p className="text-xs text-slate-500">Role</p>
                        <p className="font-bold text-slate-900">
                          {selectedUser.role}
                          {selectedUser.backend_role
                            ? ` (${selectedUser.backend_role})`
                            : ""}
                        </p>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-lg">
                        <p className="text-xs text-slate-500">
                          Created / Last login
                        </p>
                        <p className="text-sm text-slate-900">
                          {selectedUser.created_at
                            ? new Date(selectedUser.created_at).toLocaleString()
                            : "—"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {selectedUser.last_login_at
                            ? new Date(
                                selectedUser.last_login_at,
                              ).toLocaleString()
                            : "—"}
                        </p>
                      </div>
                    </div>
                  </section>

                  {/* Brand Adviser */}
                  {useBackendForUsers && (
                    <section className="mb-6">
                      <h4 className="text-sm font-bold text-slate-600 uppercase mb-3 flex items-center gap-2">
                        <Award size={16} className="text-amber-600" /> Brand
                        Adviser
                      </h4>
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
                        <div className="flex flex-wrap gap-2 items-center">
                          <span className="font-bold text-slate-900">
                            {selectedUser.is_brand_adviser
                              ? `สถานะ: ${selectedUser.adviser_status || "—"}`
                              : "ยังไม่ได้รับสิทธิ์"}
                          </span>
                          {selectedUser.is_brand_adviser &&
                            selectedUser.adviser_reputation_score != null && (
                              <span className="text-sm text-slate-600">
                                Reputation:{" "}
                                {Number(
                                  selectedUser.adviser_reputation_score,
                                ).toLocaleString()}
                              </span>
                            )}
                        </div>
                        {selectedUser.adviser_granted_at && (
                          <p className="text-xs text-slate-600">
                            มอบสิทธิ์:{" "}
                            {new Date(
                              selectedUser.adviser_granted_at,
                            ).toLocaleString()}
                          </p>
                        )}
                        {selectedUser.adviser_suspended_at && (
                          <p className="text-xs text-amber-800">
                            พัก/ถอดล่าสุด:{" "}
                            {new Date(
                              selectedUser.adviser_suspended_at,
                            ).toLocaleString()}
                            {selectedUser.adviser_suspended_reason
                              ? ` — ${selectedUser.adviser_suspended_reason}`
                              : ""}
                          </p>
                        )}
                        {canManageAccountActions && (
                          <div className="flex flex-wrap gap-2 pt-2">
                            <button
                              type="button"
                              disabled={
                                processing || !!selectedUser.is_brand_adviser
                              }
                              onClick={handleGrantBrandAdviser}
                              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              มอบสิทธิ์ BA
                            </button>
                            <button
                              type="button"
                              disabled={
                                processing || !selectedUser.is_brand_adviser
                              }
                              onClick={handleRevokeBrandAdviser}
                              className="px-3 py-1.5 rounded-lg text-sm font-medium border border-amber-800 text-amber-900 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              ถอดสิทธิ์ BA
                            </button>
                          </div>
                        )}
                        <p className="text-xs text-slate-500 pt-1">
                          ใช้ช่อง Reason (Account actions) ด้านล่างเป็นเหตุผล
                          audit ได้
                        </p>
                      </div>
                    </section>
                  )}

                  {/* Commerce Insights — BD / partner pitch */}
                  {useBackendForUsers && (
                    <section id="ud-insights" className="mb-6 scroll-mt-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <h4 className="text-sm font-bold text-slate-600 uppercase flex items-center gap-2">
                          <BarChart3 size={16} /> Insights
                        </h4>
                        {selectedUser?.id && (
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              disabled={exportingBundle}
                              onClick={handleExportAnonymizedBundle}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                            >
                              {exportingBundle ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Download size={12} />
                              )}
                              Export anonymized bundle
                            </button>
                          </div>
                        )}
                      </div>
                      {!commerceProfile ? (
                        <p className="text-sm text-slate-500">
                          ยังไม่มี commerce profile (รอ sync cron หรือ migration
                          228)
                        </p>
                      ) : (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-2">
                              <p className="text-[10px] text-emerald-700">
                                Spend in (90d)
                              </p>
                              <p className="font-bold text-emerald-900">
                                ฿
                                {commerceProfile.metrics.spend_in.toLocaleString()}
                              </p>
                            </div>
                            <div className="bg-rose-50 border border-rose-100 rounded-lg p-2">
                              <p className="text-[10px] text-rose-700">
                                Spend out (90d)
                              </p>
                              <p className="font-bold text-rose-900">
                                ฿
                                {commerceProfile.metrics.spend_out.toLocaleString()}
                              </p>
                            </div>
                            <div className="bg-sky-50 border border-sky-100 rounded-lg p-2">
                              <p className="text-[10px] text-sky-700">
                                Jobs posted
                              </p>
                              <p className="font-bold text-sky-900">
                                {commerceProfile.metrics.jobs_posted}
                              </p>
                            </div>
                            <div className="bg-violet-50 border border-violet-100 rounded-lg p-2">
                              <p className="text-[10px] text-violet-700">
                                Jobs completed
                              </p>
                              <p className="font-bold text-violet-900">
                                {commerceProfile.metrics.jobs_completed}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                            <span>
                              Risk:{" "}
                              <strong className="text-slate-900">
                                {commerceProfile.risk_tier} (
                                {commerceProfile.risk_score})
                              </strong>
                            </span>
                            <span>
                              Events:{" "}
                              <strong>{commerceProfile.event_count}</strong>
                            </span>
                            <span className="font-mono text-[10px] text-slate-400">
                              hash: {commerceProfile.user_hash.slice(0, 12)}…
                            </span>
                          </div>
                          {Object.keys(commerceProfile.category_mix || {})
                            .length > 0 && (
                            <div className="border border-slate-200 rounded-lg p-3">
                              <p className="text-xs font-bold text-slate-500 mb-2">
                                Category spend
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {Object.entries(
                                  commerceProfile.category_mix,
                                ).map(([cat, amt]) => (
                                  <span
                                    key={cat}
                                    className="px-2 py-0.5 rounded bg-slate-100 text-[11px] font-medium"
                                  >
                                    {cat}: ฿{Number(amt).toLocaleString()}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                              <input
                                type="checkbox"
                                checked={commerceProfile.data_sharing_consent}
                                disabled={consentUpdating}
                                onChange={handleToggleConsent}
                                className="rounded border-slate-300"
                              />
                              Data sharing consent (partner API)
                            </label>
                            {commerceProfile.consent_at && (
                              <span className="text-[10px] text-slate-500">
                                since{" "}
                                {new Date(
                                  commerceProfile.consent_at,
                                ).toLocaleString()}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400">
                            Funnel 90d: เปิดงาน{" "}
                            {commerceProfile.funnel.jobs_opened ?? 0} → จ่าย{" "}
                            {commerceProfile.funnel.jobs_paid ?? 0} → เสร็จ{" "}
                            {commerceProfile.funnel.jobs_done ?? 0} → รีวิว{" "}
                            {commerceProfile.funnel.reviews ?? 0} · เติมเงิน{" "}
                            {commerceProfile.funnel.deposits ?? 0} ครั้ง
                          </p>
                          {jobGraphs.length > 0 && (
                            <div className="border border-slate-200 rounded-lg p-3">
                              <p className="text-xs font-bold text-slate-500 mb-2">
                                Job graph (visual)
                              </p>
                              <JobGraphViz
                                graphs={jobGraphs}
                                maxJobs={6}
                                userId={String(selectedUser.id)}
                                onNavigate={setView}
                                onOpenJobOps={
                                  onOpenJobOps
                                    ? (jobId) => {
                                        setShowDetailsModal(false);
                                        onOpenJobOps(jobId);
                                      }
                                    : undefined
                                }
                                onOpenUserPayouts={
                                  onOpenPendingWithdrawals
                                    ? () => {
                                        setShowDetailsModal(false);
                                        onOpenPendingWithdrawals(
                                          String(selectedUser.id),
                                        );
                                      }
                                    : undefined
                                }
                                onScrollToSection={(section) =>
                                  scrollToDetailSection(
                                    section as UserDetailTab,
                                  )
                                }
                                onFilterMovementsByJob={
                                  handleFilterMovementsByJob
                                }
                                onRefresh={refreshJobGraphs}
                                onNotice={(msg, type) =>
                                  showToast(msg, type || "info")
                                }
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </section>
                  )}

                  {/* Course Marketplace — instructor / buyer stats */}
                  {useBackendForUsers && (
                    <section id="ud-course-marketplace" className="mb-6 scroll-mt-4">
                      <h4 className="text-sm font-bold text-slate-600 uppercase flex items-center gap-2 mb-3">
                        <GraduationCap size={16} /> Course Marketplace
                      </h4>
                      {!courseMarketplaceProfile ? (
                        <p className="text-sm text-slate-500">
                          ยังไม่มีข้อมูลคอร์ส (หรือโหลดไม่สำเร็จ)
                        </p>
                      ) : (
                        <div className="space-y-4">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span
                              className={`px-2 py-1 rounded-full font-bold ${
                                courseMarketplaceProfile.sellEligibility.canSell
                                  ? "bg-emerald-50 text-emerald-800"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {courseMarketplaceProfile.sellEligibility.canSell
                                ? "ขายคอร์สได้"
                                : "ยังขายคอร์สไม่ได้"}
                            </span>
                            {courseMarketplaceProfile.sellEligibility.reason ? (
                              <span className="text-slate-500">
                                {courseMarketplaceProfile.sellEligibility.reason}
                              </span>
                            ) : null}
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3">
                              <p className="text-[10px] text-indigo-700 uppercase">คอร์สที่สร้าง</p>
                              <p className="font-black text-indigo-900 text-xl">
                                {courseMarketplaceProfile.instructor.coursesTotal}
                              </p>
                              <p className="text-[10px] text-indigo-600">
                                published {courseMarketplaceProfile.instructor.coursesPublished}
                              </p>
                            </div>
                            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                              <p className="text-[10px] text-emerald-700 uppercase">Orders ขายได้</p>
                              <p className="font-black text-emerald-900 text-xl">
                                {courseMarketplaceProfile.instructor.orders}
                              </p>
                              <p className="text-[10px] text-emerald-600">
                                refund {courseMarketplaceProfile.instructor.refundedOrders}
                              </p>
                            </div>
                            <div className="bg-teal-50 border border-teal-100 rounded-lg p-3">
                              <p className="text-[10px] text-teal-700 uppercase">รายได้สุทธิผู้สอน</p>
                              <p className="font-black text-teal-900 text-lg">
                                ฿{courseMarketplaceProfile.instructor.instructorNet.toLocaleString()}
                              </p>
                              <p className="text-[10px] text-teal-600">
                                gross ฿{courseMarketplaceProfile.instructor.gross.toLocaleString()}
                              </p>
                            </div>
                            <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                              <p className="text-[10px] text-amber-800 uppercase">Platform fee (เข้าแพลตฟอร์ม)</p>
                              <p className="font-black text-amber-900 text-lg">
                                ฿{courseMarketplaceProfile.instructor.platformFee.toLocaleString()}
                              </p>
                              <p className="text-[10px] text-amber-700">
                                payout ค้าง ฿{courseMarketplaceProfile.instructor.pendingNet.toLocaleString()} (
                                {courseMarketplaceProfile.instructor.payoutsPending})
                              </p>
                            </div>
                          </div>

                          <div className="grid md:grid-cols-2 gap-3">
                            <div className="border border-slate-200 rounded-lg p-3">
                              <p className="text-xs font-bold text-slate-500 mb-2">คอร์สของผู้ใช้ (course id)</p>
                              {courseMarketplaceProfile.instructor.courses.length === 0 ? (
                                <p className="text-sm text-slate-500">ยังไม่มีคอร์สใน Course Studio</p>
                              ) : (
                                <ul className="space-y-2 max-h-48 overflow-y-auto text-sm">
                                  {courseMarketplaceProfile.instructor.courses.map((c) => (
                                    <li key={c.id} className="border-b border-slate-100 pb-2 last:border-0">
                                      <p className="font-semibold text-slate-900">{c.title}</p>
                                      <p className="text-[11px] font-mono text-indigo-700">{c.id}</p>
                                      <p className="text-[11px] text-slate-500">
                                        {c.status} · ฿{c.priceThb.toLocaleString()} · enroll {c.totalEnrolled}
                                      </p>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <div className="border border-slate-200 rounded-lg p-3">
                              <p className="text-xs font-bold text-slate-500 mb-2">ยอดขายตามคอร์ส</p>
                              {courseMarketplaceProfile.instructor.topSellingCourses.length === 0 ? (
                                <p className="text-sm text-slate-500">ยังไม่มียอดขาย</p>
                              ) : (
                                <ul className="space-y-2 max-h-48 overflow-y-auto text-sm">
                                  {courseMarketplaceProfile.instructor.topSellingCourses.map((c) => (
                                    <li key={c.courseId} className="flex justify-between gap-2 border-b border-slate-100 pb-2">
                                      <div className="min-w-0">
                                        <p className="font-medium truncate">{c.courseTitle}</p>
                                        <p className="text-[10px] font-mono text-slate-400 truncate">{c.courseId}</p>
                                      </div>
                                      <div className="text-right shrink-0 text-xs">
                                        <p className="font-bold text-emerald-700">{c.orders} orders</p>
                                        <p className="text-slate-500">fee ฿{c.platformFee.toLocaleString()}</p>
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>

                          {courseMarketplaceProfile.instructor.recentOrders.length > 0 ? (
                            <div className="border border-slate-200 rounded-lg p-3 overflow-x-auto">
                              <p className="text-xs font-bold text-slate-500 mb-2">Recent sales (order id)</p>
                              <table className="w-full text-xs min-w-[640px]">
                                <thead>
                                  <tr className="text-left text-slate-500 border-b">
                                    <th className="py-1 pr-2">Receipt</th>
                                    <th className="py-1 pr-2">Course</th>
                                    <th className="py-1 pr-2">Buyer</th>
                                    <th className="py-1 pr-2 text-right">Gross</th>
                                    <th className="py-1 pr-2 text-right">Fee</th>
                                    <th className="py-1 text-right">Net</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {courseMarketplaceProfile.instructor.recentOrders.map((o) => (
                                    <tr key={o.orderId} className="border-b border-slate-50">
                                      <td className="py-1.5 pr-2 font-mono">{o.receiptNo}</td>
                                      <td className="py-1.5 pr-2 max-w-[140px] truncate">{o.course.title}</td>
                                      <td className="py-1.5 pr-2">{o.buyer.name}</td>
                                      <td className="py-1.5 pr-2 text-right">฿{o.grossAmount.toLocaleString()}</td>
                                      <td className="py-1.5 pr-2 text-right text-emerald-700">
                                        ฿{o.platformFee.toLocaleString()}
                                      </td>
                                      <td className="py-1.5 text-right">฿{o.instructorNet.toLocaleString()}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : null}

                          <div className="border border-sky-200 bg-sky-50 rounded-lg p-3">
                            <p className="text-xs font-bold text-sky-800 mb-1">ฝั่งผู้ซื้อ (เรียนคอร์ส)</p>
                            <p className="text-sm text-sky-900">
                              ซื้อแล้ว <strong>{courseMarketplaceProfile.buyer.purchases}</strong> คอร์ส · ใช้จ่าย{" "}
                              <strong>฿{courseMarketplaceProfile.buyer.spent.toLocaleString()}</strong>
                              {courseMarketplaceProfile.buyer.refundedPurchases > 0
                                ? ` · คืนเงิน ${courseMarketplaceProfile.buyer.refundedPurchases}`
                                : ""}
                            </p>
                          </div>
                        </div>
                      )}
                    </section>
                  )}

                  {/* Wallet summary (read-only) + Wallet Freeze */}
                  <section id="ud-wallet" className="mb-6 scroll-mt-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <h4 className="text-sm font-bold text-slate-600 uppercase flex items-center gap-2">
                        <Wallet size={16} /> Wallet
                      </h4>
                      {useBackendForUsers && selectedUser?.id && (
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={handleExportFinancialCsv}
                            disabled={exportingFinancial}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                          >
                            <Download size={12} />
                            {exportingFinancial ? "…" : "Export CSV"}
                          </button>
                          <button
                            type="button"
                            onClick={handleCopyCaseSummary}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-indigo-100 text-indigo-800 hover:bg-indigo-200"
                          >
                            <Copy size={12} /> Copy case
                          </button>
                          <button
                            type="button"
                            disabled={exportingSupportPack}
                            onClick={() => handleExportSupportPack("json")}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-teal-100 text-teal-900 hover:bg-teal-200 disabled:opacity-50"
                          >
                            <Download size={12} /> Support JSON
                          </button>
                          <button
                            type="button"
                            disabled={exportingSupportPack}
                            onClick={() => handleExportSupportPack("csv")}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-teal-50 text-teal-800 hover:bg-teal-100 disabled:opacity-50"
                          >
                            <Download size={12} /> Support CSV
                          </button>
                          <button
                            type="button"
                            disabled={exportingUser360}
                            onClick={() => handleExportUser360("json")}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-violet-100 text-violet-900 hover:bg-violet-200 disabled:opacity-50"
                          >
                            <Download size={12} /> User 360 JSON
                          </button>
                          <button
                            type="button"
                            disabled={exportingUser360}
                            onClick={() => handleExportUser360("csv")}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-violet-50 text-violet-800 hover:bg-violet-100 disabled:opacity-50"
                          >
                            <Download size={12} /> User 360 CSV
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="bg-emerald-50 p-4 rounded-lg mb-3">
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-emerald-700">
                            Balance รวม
                          </p>
                          <p className="font-bold text-2xl text-emerald-900">
                            ฿
                            {(
                              walletSnapshot?.wallet_balance ??
                              selectedUser.wallet_balance ??
                              0
                            ).toLocaleString()}{" "}
                            <span className="text-sm font-normal text-slate-600">
                              {selectedUser.currency || "THB"}
                            </span>
                          </p>
                          {useBackendForUsers && walletSnapshot && (
                            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                              <div className="bg-white/80 rounded-lg px-3 py-2 border border-emerald-100">
                                <p className="text-[10px] text-slate-500 uppercase">
                                  ถอนได้
                                </p>
                                <p className="font-bold text-emerald-800 text-sm">
                                  ฿
                                  {walletSnapshot.wallet_balance_withdrawable.toLocaleString()}
                                </p>
                              </div>
                              <div className="bg-white/80 rounded-lg px-3 py-2 border border-violet-100">
                                <p className="text-[10px] text-slate-500 uppercase">
                                  wallet_pending
                                </p>
                                <p className="font-bold text-violet-800 text-sm">
                                  ฿
                                  {(
                                    walletSnapshot.wallet_pending ?? 0
                                  ).toLocaleString()}
                                </p>
                                <p className="text-[10px] text-slate-400">
                                  รายได้งานรอ release
                                </p>
                              </div>
                              <div className="bg-white/80 rounded-lg px-3 py-2 border border-amber-100">
                                <p className="text-[10px] text-slate-500 uppercase">
                                  รอ settlement PaySo
                                </p>
                                <p className="font-bold text-amber-800 text-sm">
                                  ฿
                                  {walletSnapshot.pending_settlement_thb.toLocaleString()}
                                </p>
                                <p className="text-[10px] text-slate-400">
                                  เติมแล้ว ยังถอนไม่ได้
                                </p>
                              </div>
                              <div className="bg-white/80 rounded-lg px-3 py-2 border border-slate-200">
                                <p className="text-[10px] text-slate-500 uppercase">
                                  lock อื่นๆ
                                </p>
                                <p className="font-bold text-slate-700 text-sm">
                                  ฿
                                  {walletSnapshot.other_locked_thb.toLocaleString()}
                                </p>
                              </div>
                            </div>
                          )}
                          {useBackendForUsers && balanceReconcile && (
                            <div
                              className={`mt-3 rounded-lg px-3 py-2 text-xs border ${
                                balanceReconcile.status === "pass"
                                  ? "bg-emerald-100/80 border-emerald-300 text-emerald-950"
                                  : "bg-amber-50 border-amber-300 text-amber-950"
                              }`}
                            >
                              <p className="font-bold flex items-center gap-1">
                                {balanceReconcile.status === "pass" ? (
                                  <>
                                    <Check size={14} /> Reconcile ตรง
                                  </>
                                ) : (
                                  <>
                                    <AlertTriangle size={14} /> Reconcile ไม่ตรง
                                  </>
                                )}
                              </p>
                              <p className="mt-0.5">
                                คาดหวัง ฿
                                {balanceReconcile.expected_balance.toLocaleString()}{" "}
                                ({balanceReconcile.formula}) → จริง ฿
                                {balanceReconcile.actual_balance.toLocaleString()}
                                {balanceReconcile.status === "warn" && (
                                  <>
                                    {" "}
                                    · ต่าง{" "}
                                    {balanceReconcile.variance >= 0 ? "+" : ""}฿
                                    {balanceReconcile.variance.toLocaleString()}
                                  </>
                                )}
                              </p>
                              {balanceReconcile.note ? (
                                <p className="mt-1 text-[10px] opacity-90">
                                  {balanceReconcile.note}
                                </p>
                              ) : null}
                              {balanceReconcile.explain?.breakdown?.length ? (
                                <div className="mt-2 pt-2 border-t border-amber-200/80">
                                  <p className="font-semibold text-[10px] mb-1">
                                    Explain variance
                                  </p>
                                  <ul className="space-y-0.5 text-[10px]">
                                    {balanceReconcile.explain.breakdown.map(
                                      (b) => (
                                        <li
                                          key={b.key}
                                          className="flex justify-between gap-2"
                                        >
                                          <span>{b.label}</span>
                                          <span className="font-mono">
                                            {b.effect === "debit" ? "−" : "+"}฿
                                            {b.amount.toLocaleString()}
                                          </span>
                                        </li>
                                      ),
                                    )}
                                  </ul>
                                  {balanceReconcile.explain.wallet_state
                                    ?.length ? (
                                    <ul className="mt-1.5 space-y-0.5 text-[10px] text-slate-600">
                                      {balanceReconcile.explain.wallet_state.map(
                                        (w) => (
                                          <li
                                            key={w.key}
                                            className="flex justify-between"
                                          >
                                            <span>{w.label}</span>
                                            <span>
                                              ฿{w.amount.toLocaleString()}
                                            </span>
                                          </li>
                                        ),
                                      )}
                                    </ul>
                                  ) : null}
                                  {balanceReconcile.explain
                                    .use_explained_formula && (
                                    <p className="mt-1 font-medium">
                                      สูตรขยาย → คาด ฿
                                      {balanceReconcile.explain.explained.expected_balance.toLocaleString()}{" "}
                                      (ต่าง{" "}
                                      {balanceReconcile.explain.explained
                                        .variance >= 0
                                        ? "+"
                                        : ""}
                                      ฿
                                      {balanceReconcile.explain.explained.variance.toLocaleString()}
                                      )
                                    </p>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          )}
                        </div>
                        {useBackendForUsers && (
                          <div className="flex flex-col items-end gap-1">
                            {selectedUser.wallet_frozen ? (
                              <span className="px-2 py-1 rounded text-xs font-bold bg-red-100 text-red-700">
                                ระงับเงิน
                              </span>
                            ) : null}
                            {selectedUser.account_status === "banned" ||
                            selectedUser.account_status === "suspended" ? (
                              <span className="px-2 py-1 rounded text-xs text-slate-500">
                                (วอลเล็ตถูกระงับอัตโนมัติเมื่อแบน/ระงับบัญชี)
                              </span>
                            ) : (
                              canManageAccountActions && (
                                <button
                                  onClick={() =>
                                    handleWalletFreeze(
                                      !selectedUser.wallet_frozen,
                                    )
                                  }
                                  disabled={processing}
                                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                                    selectedUser.wallet_frozen
                                      ? "bg-green-100 text-green-800 hover:bg-green-200"
                                      : "bg-amber-100 text-amber-800 hover:bg-amber-200"
                                  } disabled:opacity-50`}
                                >
                                  {selectedUser.wallet_frozen
                                    ? "ปลดระงับเงิน"
                                    : "ระงับเงิน"}
                                </button>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {useBackendForUsers && financialSummary && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-3">
                        <div className="bg-white border border-emerald-100 p-3 rounded-lg">
                          <p className="text-[10px] text-slate-500 uppercase">
                            เติมสำเร็จ
                          </p>
                          <p className="font-bold text-emerald-700 text-sm">
                            ฿
                            {financialSummary.deposits.total_net.toLocaleString()}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {financialSummary.deposits.count} รายการ
                          </p>
                        </div>
                        <div className="bg-white border border-red-100 p-3 rounded-lg">
                          <p className="text-[10px] text-slate-500 uppercase">
                            ถอนออก
                          </p>
                          <p className="font-bold text-red-700 text-sm">
                            ฿
                            {financialSummary.withdrawals.total_gross.toLocaleString()}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {financialSummary.withdrawals.count} รายการ
                          </p>
                        </div>
                        <div className="bg-white border border-amber-100 p-3 rounded-lg">
                          <p className="text-[10px] text-slate-500 uppercase">
                            เติมค้าง
                          </p>
                          <p className="font-bold text-amber-700 text-sm">
                            {financialSummary.pending_deposits.count}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            ฿
                            {financialSummary.pending_deposits.total_thb.toLocaleString()}
                          </p>
                          {financialSummary.pending_deposits.count > 0 &&
                            onOpenPendingDeposits &&
                            selectedUser?.id && (
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenPendingDeposits(String(selectedUser.id))
                                }
                                className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 hover:underline"
                              >
                                ดูรายการค้าง
                                <ExternalLink size={10} />
                              </button>
                            )}
                        </div>
                        <div className="bg-white border border-violet-100 p-3 rounded-lg">
                          <p className="text-[10px] text-slate-500 uppercase">
                            ถอนค้าง
                          </p>
                          <p className="font-bold text-violet-700 text-sm">
                            {financialSummary.pending_withdrawals.count}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            ฿
                            {financialSummary.pending_withdrawals.total_thb.toLocaleString()}
                          </p>
                          {financialSummary.pending_withdrawals.count > 0 &&
                            onOpenPendingWithdrawals &&
                            selectedUser?.id && (
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenPendingWithdrawals(
                                    String(selectedUser.id),
                                  )
                                }
                                className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-violet-800 hover:underline"
                              >
                                ดูรายการค้าง
                                <ExternalLink size={10} />
                              </button>
                            )}
                        </div>
                        <div className="bg-white border border-blue-100 p-3 rounded-lg">
                          <p className="text-[10px] text-slate-500 uppercase">
                            รายได้งาน
                          </p>
                          <p className="font-bold text-blue-700 text-sm">
                            ฿
                            {(
                              financialSummary.job_earnings?.total_thb ?? 0
                            ).toLocaleString()}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {financialSummary.job_earnings?.count ?? 0} รายการ
                          </p>
                        </div>
                        <div className="bg-white border border-orange-100 p-3 rounded-lg">
                          <p className="text-[10px] text-slate-500 uppercase">
                            รายจ่ายงาน
                          </p>
                          <p className="font-bold text-orange-700 text-sm">
                            ฿
                            {(
                              financialSummary.job_expenses?.total_thb ?? 0
                            ).toLocaleString()}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {financialSummary.job_expenses?.count ?? 0} รายการ
                          </p>
                        </div>
                      </div>
                    )}
                    {useBackendForUsers && pendingDepositPreview.length > 0 && (
                      <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <p className="text-[10px] font-bold text-amber-900 uppercase">
                            เติมค้าง PaySo / Gateway (
                            {pendingDepositPreview.length})
                          </p>
                          {onOpenPendingDeposits && selectedUser?.id ? (
                            <button
                              type="button"
                              onClick={() =>
                                onOpenPendingDeposits(String(selectedUser.id))
                              }
                              className="text-[10px] font-semibold text-amber-800 hover:underline inline-flex items-center gap-1"
                            >
                              หน้า Gateway
                              <ExternalLink size={10} />
                            </button>
                          ) : null}
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-[11px] text-amber-950">
                            <thead>
                              <tr className="text-left text-[10px] text-amber-800/80">
                                <th className="pb-1 pr-2">ช่องทาง</th>
                                <th className="pb-1 pr-2">ยอด</th>
                                <th className="pb-1 pr-2">สร้าง</th>
                                <th className="pb-1 pr-2">Webhook</th>
                                <th className="pb-1">Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pendingDepositPreview.map((d) => (
                                <tr
                                  key={d.charge_id}
                                  className="border-t border-amber-100/80"
                                >
                                  <td className="py-1 pr-2">
                                    {d.source_type || "gateway"}
                                    <div className="text-[9px] text-slate-500 font-mono">
                                      {d.charge_id.slice(0, 10)}…
                                    </div>
                                  </td>
                                  <td className="py-1 pr-2 font-medium">
                                    ฿{d.amount.toLocaleString()}
                                  </td>
                                  <td className="py-1 pr-2 text-slate-600">
                                    {d.created_at
                                      ? new Date(d.created_at).toLocaleString(
                                          "th-TH",
                                          {
                                            dateStyle: "short",
                                            timeStyle: "short",
                                          },
                                        )
                                      : "—"}
                                  </td>
                                  <td className="py-1 pr-2">
                                    {d.webhook_received ? (
                                      <span className="text-emerald-700">
                                        ✓ {d.last_webhook_status || "received"}
                                      </span>
                                    ) : (
                                      <span className="text-amber-800">
                                        ยังไม่มา
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-1">
                                    {d.can_reconcile !== false ? (
                                      <button
                                        type="button"
                                        disabled={
                                          reconcileChargeId === d.charge_id
                                        }
                                        onClick={() =>
                                          handleReconcilePaysoCharge(
                                            d.charge_id,
                                          )
                                        }
                                        className="px-2 py-0.5 rounded bg-amber-800 text-white text-[10px] font-semibold hover:bg-amber-900 disabled:opacity-50"
                                      >
                                        {reconcileChargeId === d.charge_id
                                          ? "…"
                                          : "Reconcile"}
                                      </button>
                                    ) : (
                                      <span className="text-slate-400">
                                        manual
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    {useBackendForUsers &&
                      pendingWithdrawalPreview.length > 0 && (
                        <div className="mb-3 rounded-lg border border-violet-100 bg-violet-50/50 px-3 py-2">
                          <p className="text-[10px] font-bold text-violet-900 uppercase mb-1">
                            ถอนค้าง (ล่าสุด)
                          </p>
                          <ul className="text-[11px] text-violet-950 space-y-0.5">
                            {pendingWithdrawalPreview.map((w) => (
                              <li
                                key={w.id}
                                className="flex justify-between gap-2"
                              >
                                <span className="truncate text-slate-500">
                                  {w.id.slice(0, 8)}…
                                </span>
                                <span className="font-medium shrink-0">
                                  ฿{w.amount.toLocaleString()}
                                </span>
                              </li>
                            ))}
                          </ul>
                          {onOpenPendingWithdrawals && selectedUser?.id ? (
                            <button
                              type="button"
                              onClick={() =>
                                onOpenPendingWithdrawals(
                                  String(selectedUser.id),
                                )
                              }
                              className="mt-1 text-[10px] font-semibold text-violet-800 hover:underline inline-flex items-center gap-1"
                            >
                              ดูทั้งหมด
                              <ExternalLink size={10} />
                            </button>
                          ) : null}
                        </div>
                      )}
                    {useBackendForUsers && financialRiskSignals.length > 0 && (
                      <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                        <p className="text-xs font-bold text-amber-900 flex items-center gap-1 mb-1">
                          <AlertTriangle size={14} /> สัญญาณตรวจสอบ
                        </p>
                        <ul className="text-xs text-amber-950 space-y-0.5">
                          {financialRiskSignals.map((sig) => (
                            <li key={sig.code}>
                              {sig.code === "PENDING_DEPOSITS" &&
                              onOpenPendingDeposits &&
                              selectedUser?.id ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onOpenPendingDeposits(
                                      String(selectedUser.id),
                                    )
                                  }
                                  className="inline-flex items-center gap-1 hover:underline text-left"
                                >
                                  • {financialRiskLabel(sig.code)}
                                  {sig.count != null ? ` (${sig.count})` : ""}
                                  {sig.total_thb != null
                                    ? ` · ฿${sig.total_thb.toLocaleString()}`
                                    : ""}
                                  <ExternalLink size={10} />
                                </button>
                              ) : sig.code === "PENDING_WITHDRAWALS" &&
                                onOpenPendingWithdrawals &&
                                selectedUser?.id ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onOpenPendingWithdrawals(
                                      String(selectedUser.id),
                                    )
                                  }
                                  className="inline-flex items-center gap-1 hover:underline text-left"
                                >
                                  • {financialRiskLabel(sig.code)}
                                  {sig.count != null ? ` (${sig.count})` : ""}
                                  {sig.total_thb != null
                                    ? ` · ฿${sig.total_thb.toLocaleString()}`
                                    : ""}
                                  <ExternalLink size={10} />
                                </button>
                              ) : (
                                <>
                                  • {financialRiskLabel(sig.code)}
                                  {sig.count != null ? ` (${sig.count})` : ""}
                                  {sig.total_thb != null
                                    ? ` · ฿${sig.total_thb.toLocaleString()}`
                                    : ""}
                                </>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {useBackendForUsers && escrowTimeline.length > 0 && (
                      <div className="border border-teal-200 rounded-lg overflow-hidden mb-3">
                        <div className="px-3 py-2 bg-teal-50 border-b border-teal-100">
                          <p className="text-xs font-bold text-teal-900">
                            Escrow timeline ต่อ job
                          </p>
                          <p className="text-[10px] text-teal-700/80">
                            pay → hold → release / dispute
                          </p>
                        </div>
                        <ul className="divide-y divide-teal-50 max-h-56 overflow-y-auto">
                          {escrowTimeline.map((job) => (
                            <li key={job.job_id} className="px-3 py-2 text-xs">
                              <div className="flex justify-between gap-2">
                                <span className="font-medium text-slate-800 truncate">
                                  {job.title || job.job_id.slice(0, 8)}
                                  {job.category ? ` · ${job.category}` : ""}
                                </span>
                                <span
                                  className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                                    job.current_stage === "dispute"
                                      ? "bg-red-100 text-red-800"
                                      : job.current_stage === "released"
                                        ? "bg-emerald-100 text-emerald-800"
                                        : job.current_stage === "held"
                                          ? "bg-amber-100 text-amber-900"
                                          : "bg-slate-100 text-slate-700"
                                  }`}
                                >
                                  {job.current_stage}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {job.steps.map((s, i) => (
                                  <span
                                    key={`${job.job_id}-${i}`}
                                    className="text-[10px] px-1 py-0.5 rounded bg-white border border-slate-200 text-slate-600"
                                    title={
                                      s.ts
                                        ? new Date(s.ts).toLocaleString()
                                        : ""
                                    }
                                  >
                                    {s.stage}
                                    {s.amount
                                      ? ` ฿${Number(s.amount).toLocaleString()}`
                                      : ""}
                                  </span>
                                ))}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {useBackendForUsers && (
                      <div className="border border-violet-200 rounded-lg overflow-hidden mb-3">
                        <div className="px-3 py-2 bg-violet-50 border-b border-violet-100">
                          <p className="text-xs font-bold text-violet-900 flex items-center gap-1">
                            <ScrollText size={14} /> Financial audit (user)
                          </p>
                          <p className="text-[10px] text-violet-700/80">
                            webhook · reconcile · admin adjust · payout recon
                            R1–R5
                          </p>
                        </div>
                        {financialAuditLoading ? (
                          <p className="text-xs text-slate-500 px-3 py-4">
                            กำลังโหลด…
                          </p>
                        ) : financialAuditItems.length === 0 ? (
                          <p className="text-xs text-slate-500 px-3 py-4">
                            ยังไม่มี financial audit events
                          </p>
                        ) : (
                          <ul className="divide-y divide-violet-50 max-h-48 overflow-y-auto">
                            {financialAuditItems.map((ev) => (
                              <li key={ev.id} className="px-3 py-2 text-xs">
                                <div className="flex justify-between gap-2">
                                  <span className="font-medium text-slate-800">
                                    {ev.title}
                                  </span>
                                  <span className="text-[10px] text-slate-400 shrink-0">
                                    {ev.created_at
                                      ? new Date(ev.created_at).toLocaleString(
                                          "th-TH",
                                          {
                                            dateStyle: "short",
                                            timeStyle: "short",
                                          },
                                        )
                                      : ""}
                                  </span>
                                </div>
                                <p className="text-[10px] text-slate-500">
                                  {ev.category} · {ev.source}
                                  {ev.entity_id
                                    ? ` · ${String(ev.entity_id).slice(0, 10)}…`
                                    : ""}
                                </p>
                                {ev.detail ? (
                                  <p className="text-[10px] text-slate-600 mt-0.5">
                                    {ev.detail}
                                  </p>
                                ) : null}
                                {ev.reconciliation_rules &&
                                ev.reconciliation_rules.length > 0 ? (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {ev.reconciliation_rules.map((r) => (
                                      <span
                                        key={r.rule}
                                        className={`px-1 py-0.5 rounded text-[9px] font-bold ${
                                          r.ok
                                            ? "bg-emerald-100 text-emerald-800"
                                            : "bg-red-100 text-red-800"
                                        }`}
                                      >
                                        {r.rule}:{r.ok ? "PASS" : "FAIL"}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                    {useBackendForUsers && (
                      <div className="border border-slate-200 rounded-lg overflow-hidden mb-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
                          <div>
                            <p className="text-xs font-bold text-slate-600">
                              ประวัติเติม/ถอน/งาน (ledger หลัก)
                            </p>
                            {financialJobFilter ? (
                              <div className="flex flex-wrap items-center gap-1 mt-1">
                                <span className="text-[10px] text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded font-mono">
                                  job {financialJobFilter.slice(0, 8)}…
                                </span>
                                <button
                                  type="button"
                                  disabled={
                                    financialLoading || !selectedUser?.id
                                  }
                                  onClick={() => {
                                    if (!selectedUser?.id) return;
                                    fetchFinancialMovements(
                                      String(selectedUser.id),
                                      {
                                        job_id: null,
                                        category: financialCategory,
                                      },
                                    );
                                  }}
                                  className="text-[10px] text-slate-600 hover:underline"
                                >
                                  ล้าง filter
                                </button>
                              </div>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {(
                              [
                                ["all", "ทั้งหมด"],
                                ["deposit", "เติม"],
                                ["withdraw", "ถอน"],
                                ["job", "รายได้/จ่ายงาน"],
                                ["admin", "Admin"],
                              ] as const
                            ).map(([cat, label]) => (
                              <button
                                key={cat}
                                type="button"
                                disabled={financialLoading || !selectedUser?.id}
                                onClick={() => {
                                  if (!selectedUser?.id) return;
                                  fetchFinancialMovements(selectedUser.id, {
                                    category: cat,
                                    job_id: financialJobFilter,
                                  });
                                }}
                                className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                                  financialCategory === cat
                                    ? "bg-indigo-600 text-white"
                                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                                } disabled:opacity-50`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                        {financialLoading && financialMovements.length === 0 ? (
                          <p className="text-xs text-slate-500 px-3 py-4 flex items-center gap-2">
                            <Loader2 size={14} className="animate-spin" />{" "}
                            โหลด...
                          </p>
                        ) : financialMovements.length === 0 ? (
                          <p className="text-xs text-slate-500 px-3 py-4">
                            ยังไม่มีรายการเติม/ถอนใน ledger หลัก
                          </p>
                        ) : (
                          <ul className="divide-y divide-slate-100 max-h-52 overflow-y-auto">
                            {financialMovements.map((m) => (
                              <li
                                key={m.id}
                                className="px-3 py-2 text-xs hover:bg-slate-50"
                              >
                                <div className="flex justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="font-medium text-slate-800 truncate">
                                      {m.label}
                                    </p>
                                    <p className="text-[10px] text-slate-500 truncate">
                                      {m.payment_id
                                        ? `ref ${m.payment_id}`
                                        : m.bill_no || m.id}
                                      {m.source_type
                                        ? ` · ${m.source_type}`
                                        : ""}
                                      {m.job_id
                                        ? ` · job ${m.job_id.slice(0, 8)}…`
                                        : ""}
                                      {m.status ? ` · ${m.status}` : ""}
                                    </p>
                                    {(m.anomaly_flags?.length ?? 0) > 0 && (
                                      <p className="text-[10px] text-amber-700">
                                        ⚠ {m.anomaly_flags?.join(", ")}
                                      </p>
                                    )}
                                  </div>
                                  <div className="text-right shrink-0">
                                    <p
                                      className={
                                        m.direction === "in"
                                          ? "text-emerald-600 font-bold"
                                          : "text-red-600 font-bold"
                                      }
                                    >
                                      {m.direction === "in" ? "+" : "−"}฿
                                      {(
                                        m.net_amount ?? m.gross_amount
                                      ).toLocaleString()}
                                    </p>
                                    <p className="text-[10px] text-slate-400">
                                      {m.created_at
                                        ? new Date(m.created_at).toLocaleString(
                                            "th-TH",
                                          )
                                        : ""}
                                    </p>
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                        {financialHasMore && selectedUser?.id && (
                          <div className="px-3 py-2 border-t border-slate-100 bg-slate-50">
                            <button
                              type="button"
                              disabled={financialLoading}
                              onClick={() =>
                                fetchFinancialMovements(selectedUser.id, {
                                  cursor: financialCursor,
                                  category: financialCategory,
                                  job_id: financialJobFilter,
                                  append: true,
                                })
                              }
                              className="text-xs text-indigo-600 hover:underline disabled:opacity-50"
                            >
                              {financialLoading ? "กำลังโหลด..." : "โหลดเพิ่ม"}
                            </button>
                          </div>
                        )}
                        <p className="text-[10px] text-slate-400 px-3 py-1.5 border-t border-slate-100">
                          ข้อมูลจาก payment_ledger_audit · ดูรายละเอียด PaySo
                          ที่เมนู เติมเงินสลิป → แท็บ Gateway
                        </p>
                      </div>
                    )}
                    {useBackend &&
                      (detailLedgerTotals.total_credit > 0 ||
                        detailLedgerTotals.total_debit > 0) && (
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          <div className="bg-slate-50 p-3 rounded-lg">
                            <p className="text-xs text-slate-500">
                              Total credit
                            </p>
                            <p className="font-bold text-emerald-700">
                              + ฿
                              {detailLedgerTotals.total_credit.toLocaleString()}
                            </p>
                          </div>
                          <div className="bg-slate-50 p-3 rounded-lg">
                            <p className="text-xs text-slate-500">
                              Total debit
                            </p>
                            <p className="font-bold text-red-700">
                              − ฿
                              {detailLedgerTotals.total_debit.toLocaleString()}
                            </p>
                          </div>
                        </div>
                      )}
                    {useBackendForUsers && detailLedger.length > 0 && (
                      <div className="border border-slate-200 rounded-lg overflow-hidden">
                        <p className="text-xs font-bold text-slate-500 px-3 py-2 bg-slate-50">
                          Last 10 ledger entries (read-only)
                        </p>
                        <ul className="divide-y divide-slate-100 max-h-40 overflow-y-auto">
                          {detailLedger.map((e) => (
                            <li
                              key={e.id}
                              className="px-3 py-2 flex justify-between text-sm"
                            >
                              <span>{e.description}</span>
                              <span
                                className={
                                  e.direction === "credit"
                                    ? "text-emerald-600"
                                    : "text-red-600"
                                }
                              >
                                {e.direction === "credit" ? "+" : "-"} ฿
                                {e.amount?.toLocaleString()} (
                                {e.created_at
                                  ? new Date(e.created_at).toLocaleDateString()
                                  : ""}
                                )
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </section>

                  {/* ช่องทางรับเงิน (Bank Accounts / Payment Channels) */}
                  <section className="mb-6">
                    <h4 className="text-sm font-bold text-slate-600 uppercase mb-3 flex items-center gap-2">
                      <DollarSign size={16} /> ช่องทางรับเงิน
                    </h4>
                    {useBackendForUsers && bankDuplicateWarnings.length > 0 && (
                      <div className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2">
                        <p className="text-xs font-bold text-red-900 flex items-center gap-1 mb-1">
                          <AlertTriangle size={14} /> บัญชีซ้ำกับ user อื่น (
                          {bankDuplicateWarnings.length})
                        </p>
                        <ul className="text-[11px] text-red-950 space-y-1">
                          {bankDuplicateWarnings.map((w, i) => (
                            <li
                              key={`${w.other_user_id}-${w.account_number}-${i}`}
                            >
                              <span className="font-mono">
                                {w.account_number}
                              </span>
                              {w.bank_name ? ` (${w.bank_name})` : ""} →{" "}
                              <span className="font-medium">
                                {w.other_user_name ||
                                  w.other_user_email ||
                                  w.other_user_id.slice(0, 8)}
                              </span>
                              <span className="text-red-700/80">
                                {" "}
                                ·{" "}
                                {w.match_source === "payout_request"
                                  ? "จากคำขอถอน"
                                  : "จาก bank_accounts"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      {selectedUser.bank_accounts &&
                      Array.isArray(selectedUser.bank_accounts) &&
                      selectedUser.bank_accounts.length > 0 ? (
                        <ul className="divide-y divide-slate-100">
                          {selectedUser.bank_accounts.map(
                            (acc: any, idx: number) => (
                              <li
                                key={acc.id || idx}
                                className={`px-4 py-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 ${
                                  String(acc.account_number || "").replace(
                                    /\D/g,
                                    "",
                                  ).length >= 6 &&
                                  bankDuplicateWarnings.some(
                                    (w) =>
                                      String(w.account_number || "").replace(
                                        /\D/g,
                                        "",
                                      ) ===
                                      String(acc.account_number || "").replace(
                                        /\D/g,
                                        "",
                                      ),
                                  )
                                    ? "bg-red-50/80 border-l-4 border-red-400"
                                    : "bg-slate-50/50"
                                }`}
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-slate-900">
                                    {acc.provider_name || acc.bank_name || "—"}{" "}
                                    {acc.type && acc.type !== "bank"
                                      ? `(${acc.type})`
                                      : ""}
                                  </p>
                                  <p className="text-sm font-mono text-slate-600">
                                    {acc.account_number || "—"}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    {acc.account_name || "—"}
                                  </p>
                                  {acc.type === "card" && acc.card_last4 && (
                                    <p className="text-xs text-slate-500 mt-0.5">
                                      {acc.card_brand || "Card"} · ****
                                      {acc.card_last4}
                                      {acc.card_expiry
                                        ? ` · ${acc.card_expiry}`
                                        : ""}
                                    </p>
                                  )}
                                </div>
                                {acc.bank_book_url &&
                                  typeof acc.bank_book_url === "string" && (
                                    <a
                                      href={acc.bank_book_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="shrink-0 block"
                                    >
                                      <img
                                        src={acc.bank_book_url}
                                        alt="สมุดบัญชี"
                                        className="h-20 w-28 object-cover rounded-lg border border-slate-200 hover:ring-2 ring-indigo-400"
                                      />
                                      <span className="text-[10px] text-indigo-600 block text-center mt-1">
                                        สมุดบัญชี
                                      </span>
                                    </a>
                                  )}
                              </li>
                            ),
                          )}
                        </ul>
                      ) : (
                        <p className="px-4 py-4 text-slate-500 text-sm">
                          ยังไม่มีช่องทางรับเงิน
                        </p>
                      )}
                    </div>
                  </section>

                  {/* KYC summary + link to KYC Review + rejection reason placeholder */}
                  <section id="ud-kyc" className="mb-6 scroll-mt-4">
                    <h4 className="text-sm font-bold text-slate-600 uppercase mb-3 flex items-center gap-2">
                      <Shield size={16} /> KYC
                    </h4>
                    <div className="flex items-center justify-between bg-blue-50 p-4 rounded-lg mb-2">
                      <div>
                        <p className="text-xs text-blue-700">Status</p>
                        <p className="font-bold text-blue-900">
                          {selectedUser.kyc_status ||
                            selectedUser.kyc_level ||
                            "Not submitted"}
                        </p>
                        {(selectedUser.kyc_status || selectedUser.kyc_level) ===
                          "rejected" && (
                          <p className="text-xs text-slate-600 mt-1">
                            Rejection reason:{" "}
                            {selectedUser.kyc_rejection_reason || "—"}
                          </p>
                        )}
                        {(selectedUser as any).kyc_resubmit_trigger ===
                          "id_expired" && (
                          <p className="text-xs text-amber-800 mt-1 font-medium">
                            ⚠ สั่งกรอกใหม่ (บัตรหมดอายุ — อัตโนมัติหรือแอดมิน)
                          </p>
                        )}
                        {selectedUser.kyc_status ===
                          "resubmission_required" && (
                          <p className="text-xs text-amber-700 mt-1">
                            รอ user ส่งเอกสารใหม่ — ดูใน KYC Review
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col gap-2 shrink-0">
                        {(setView || onOpenKycReview) && (
                          <button
                            onClick={() => {
                              if (onOpenKycReview)
                                onOpenKycReview(selectedUser.id);
                              setShowDetailsModal(false);
                              if (setView) setView("kyc-review");
                            }}
                            className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                          >
                            <FileCheck size={16} /> KYC Review
                          </button>
                        )}
                        {useBackendForUsers && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (
                                !window.confirm(
                                  "สั่งให้ user ส่งบัตร/เอกสารใหม่ (เช่น บัตรหมดอายุ)?",
                                )
                              )
                                return;
                              try {
                                await requestKycResubmit(selectedUser.id, {
                                  instruction:
                                    "บัตรประชาชนหรือเอกสารหมดอายุ — กรุณาอัปโหลดใหม่ในแอป (Settings → Thai ID & Documents)",
                                  required_steps: [
                                    "บัตรประชาชน (หน้า/หลัง)",
                                    "รูปเซลฟี่",
                                  ],
                                  trigger: "id_expired",
                                });
                                alert(
                                  "สั่งกรอกใหม่แล้ว — user จะปลดล็อกแท็บเอกสารในแอป",
                                );
                              } catch (e: any) {
                                alert(e?.message || "ล้มเหลว");
                              }
                            }}
                            className="flex items-center gap-2 px-3 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
                          >
                            <AlertTriangle size={16} /> ขอส่งบัตรใหม่
                          </button>
                        )}
                      </div>
                    </div>
                    {useBackendForUsers && (
                      <div className="border border-slate-200 rounded-lg p-4 bg-white mb-3 space-y-4">
                        <p className="text-xs font-bold text-slate-500 uppercase">
                          KYC Lifecycle & Compliance
                        </p>
                        {kycLifecycle ? (
                          <>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                              <div className="bg-slate-50 rounded p-2">
                                <p className="text-slate-500">Submitted</p>
                                <p className="font-medium">
                                  {kycLifecycle.submitted_at
                                    ? new Date(
                                        kycLifecycle.submitted_at,
                                      ).toLocaleDateString()
                                    : "—"}
                                </p>
                              </div>
                              <div className="bg-slate-50 rounded p-2">
                                <p className="text-slate-500">Verified</p>
                                <p className="font-medium">
                                  {kycLifecycle.verified_at
                                    ? new Date(
                                        kycLifecycle.verified_at,
                                      ).toLocaleDateString()
                                    : "—"}
                                </p>
                              </div>
                              <div className="bg-slate-50 rounded p-2">
                                <p className="text-slate-500">Next re-verify</p>
                                <p
                                  className={`font-medium ${
                                    kycLifecycle.needs_reverify
                                      ? "text-amber-700"
                                      : ""
                                  }`}
                                >
                                  {kycLifecycle.next_reverify_at
                                    ? new Date(
                                        kycLifecycle.next_reverify_at,
                                      ).toLocaleDateString()
                                    : "—"}
                                  {kycLifecycle.needs_reverify && " ⚠"}
                                </p>
                              </div>
                              <div className="bg-slate-50 rounded p-2">
                                <p className="text-slate-500">Deadline</p>
                                <p className="font-medium">
                                  {kycLifecycle.resubmission_deadline
                                    ? new Date(
                                        kycLifecycle.resubmission_deadline,
                                      ).toLocaleDateString()
                                    : "—"}
                                </p>
                              </div>
                            </div>
                            {kycLifecycle.admin_instruction && (
                              <p className="text-xs text-amber-800 bg-amber-50 rounded px-2 py-1.5">
                                Admin: {kycLifecycle.admin_instruction}
                              </p>
                            )}
                            {kycLifecycle.required_steps.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {kycLifecycle.required_steps.map((s) => (
                                  <span
                                    key={s}
                                    className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 text-[10px]"
                                  >
                                    {s}
                                  </span>
                                ))}
                              </div>
                            )}
                            {kycSupplements.length > 0 && (
                              <div>
                                <p className="text-[10px] font-bold text-slate-500 mb-1">
                                  Supplement requests
                                </p>
                                <ul className="space-y-1 max-h-24 overflow-y-auto">
                                  {kycSupplements.map((sr) => (
                                    <li
                                      key={sr.id}
                                      className="text-[10px] border rounded px-2 py-1"
                                    >
                                      <span
                                        className={`font-bold uppercase ${
                                          sr.status === "pending"
                                            ? "text-amber-700"
                                            : "text-slate-500"
                                        }`}
                                      >
                                        {sr.status}
                                      </span>
                                      {" · "}
                                      {sr.instruction ||
                                        sr.requested_docs.join(", ")}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                              <button
                                type="button"
                                disabled={kycActing}
                                onClick={handleKycApprove}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                              >
                                {kycActing ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <Check size={12} />
                                )}
                                Approve KYC
                              </button>
                              <button
                                type="button"
                                disabled={kycActing}
                                onClick={handleKycReject}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                              >
                                <X size={12} /> Reject KYC
                              </button>
                              <button
                                type="button"
                                disabled={kycActing}
                                onClick={handleKycRequestDocs}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                              >
                                <FileText size={12} /> Request docs
                              </button>
                            </div>
                            {whtSummary && (
                              <div className="border-t border-slate-100 pt-3">
                                <p className="text-[10px] font-bold text-slate-500 mb-2">
                                  WHT (Provider withholding)
                                </p>
                                <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                                  <div>
                                    <p className="text-slate-500">Gross</p>
                                    <p className="font-bold">
                                      ฿{whtSummary.gross_total.toLocaleString()}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-slate-500">Withheld</p>
                                    <p className="font-bold text-amber-700">
                                      ฿
                                      {whtSummary.withheld_total.toLocaleString()}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-slate-500">Net</p>
                                    <p className="font-bold">
                                      ฿{whtSummary.net_total.toLocaleString()}
                                    </p>
                                  </div>
                                </div>
                                {whtSummary.recent.length > 0 && (
                                  <ul className="space-y-1 max-h-28 overflow-y-auto">
                                    {whtSummary.recent.map((w) => (
                                      <li
                                        key={w.id}
                                        className="text-[10px] flex justify-between gap-2 bg-slate-50 rounded px-2 py-1"
                                      >
                                        <span>
                                          {w.source_event_type}
                                          {w.source_job_id
                                            ? ` · ${w.source_job_id.slice(0, 8)}…`
                                            : ""}
                                        </span>
                                        <span className="text-amber-700 shrink-0">
                                          ฿{w.withheld_amount.toLocaleString()}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                                {whtSummary.posting_count === 0 && (
                                  <p className="text-[10px] text-slate-400">
                                    ยังไม่มี WHT posting
                                  </p>
                                )}
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="text-xs text-slate-400">
                            ยังไม่มีข้อมูล lifecycle — user ใหม่หรือ API
                            ยังไม่พร้อม (ลอง restart backend)
                          </p>
                        )}
                      </div>
                    )}
                    {useBackendForUsers && (
                      <div className="border border-slate-200 rounded-lg p-4 bg-white">
                        <p className="text-xs font-bold text-slate-500 mb-3 flex items-center gap-2">
                          <Eye size={14} /> เอกสาร KYC (ล่าสุด) —
                          คลิกเพื่อดูขนาดเต็ม
                        </p>
                        {detailKycLoading ? (
                          <div className="flex items-center justify-center py-6 text-slate-400">
                            <Loader2 size={18} className="animate-spin" />
                          </div>
                        ) : (detailKyc?.documents?.length || 0) > 0 ? (
                          <>
                            {(() => {
                              const latest = (detailKyc!.documents as any[])[0];
                              if (!latest) return null;
                              const addr = latest.address;
                              const vehicles = parseKycVehiclesJson(
                                latest.vehicles_json,
                              );
                              const hasAddr =
                                typeof addr === "string" && addr.trim();
                              if (!hasAddr && vehicles.length === 0)
                                return null;
                              return (
                                <div className="mb-4 space-y-3">
                                  {hasAddr && (
                                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-sm">
                                      <p className="text-xs font-bold text-slate-500 mb-1">
                                        ที่อยู่ (จากใบสมัครล่าสุด)
                                      </p>
                                      <p className="text-slate-800 whitespace-pre-wrap">
                                        {String(addr).trim()}
                                      </p>
                                    </div>
                                  )}
                                  {vehicles.length > 0 && (
                                    <div className="p-3 rounded-lg bg-amber-50/90 border border-amber-100 text-sm">
                                      <p className="text-xs font-bold text-amber-900 mb-2">
                                        ทะเบียนรถ / ข้อมูลเล่ม
                                      </p>
                                      <ul className="space-y-2 text-slate-800">
                                        {vehicles.map((v: any, idx: number) => (
                                          <li key={idx}>
                                            <span className="font-medium">
                                              คันที่ {idx + 1}:
                                            </span>{" "}
                                            {[
                                              v.license_plate,
                                              v.vehicle_province,
                                            ]
                                              .filter(Boolean)
                                              .join(" ")}
                                            {v.vehicle_brand
                                              ? ` — ${v.vehicle_brand}${v.vehicle_model ? ` ${v.vehicle_model}` : ""}`
                                              : ""}
                                            {v.owner_name
                                              ? ` · เจ้าของ: ${v.owner_name}`
                                              : ""}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              {(detailKyc!.documents as any[]).flatMap(
                                (d: any) => {
                                  const keys = [
                                    "id_card_front_url",
                                    "id_card_back_url",
                                    "selfie_photo_url",
                                    "driving_license_front_url",
                                    "driving_license_back_url",
                                    "selfie_video_url",
                                    "yellow_plate_photo_url",
                                    "public_transport_license_front_url",
                                    "public_transport_license_back_url",
                                  ];
                                  const items: Array<{
                                    url: string;
                                    label: string;
                                    type: "image" | "video";
                                  }> = [];
                                  keys.forEach((key) => {
                                    const url = d?.[key];
                                    if (url && typeof url === "string") {
                                      items.push({
                                        url,
                                        label: KYC_DOC_LABELS[key] || key,
                                        type: key.includes("video")
                                          ? "video"
                                          : "image",
                                      });
                                    }
                                  });
                                  parseKycVehiclesJson(
                                    d?.vehicles_json,
                                  ).forEach((v: any, idx: number) => {
                                    const url = v?.registration_book_photo_url;
                                    if (url && typeof url === "string") {
                                      items.push({
                                        url,
                                        label: `เล่มทะเบียน (คันที่ ${idx + 1})`,
                                        type: "image",
                                      });
                                    }
                                  });
                                  return items.map((item) => (
                                    <div
                                      key={`${d?.id || "doc"}-${item.url}`}
                                      className="group relative rounded-lg border border-slate-200 overflow-hidden bg-slate-50 cursor-pointer hover:border-indigo-400 hover:shadow transition-all"
                                      onClick={() => setKycLightbox(item)}
                                      title="คลิกเพื่อดูขนาดเต็ม"
                                    >
                                      <div className="aspect-[3/4] flex items-center justify-center">
                                        {item.type === "video" ? (
                                          <div className="w-full h-full flex flex-col items-center justify-center p-2 bg-slate-100">
                                            <FileText
                                              size={28}
                                              className="text-indigo-500 mb-1"
                                            />
                                            <span className="text-xs text-slate-600 truncate w-full text-center">
                                              วิดีโอ
                                            </span>
                                            <a
                                              href={item.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              onClick={(e) =>
                                                e.stopPropagation()
                                              }
                                              className="text-xs text-indigo-600 mt-1 hover:underline"
                                            >
                                              เปิดในแท็บใหม่
                                            </a>
                                          </div>
                                        ) : (
                                          <img
                                            src={item.url}
                                            alt={item.label}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                            onError={(e) => {
                                              (
                                                e.target as HTMLImageElement
                                              ).src =
                                                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect fill='%23e2e8f0' width='100' height='100'/%3E%3Ctext x='50' y='50' fill='%2394a3b8' text-anchor='middle' dy='.3em' font-size='12'%3Eโหลดไม่สำเร็จ%3C/text%3E%3C/svg%3E";
                                            }}
                                          />
                                        )}
                                      </div>
                                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/25 transition-colors">
                                        <Expand
                                          size={22}
                                          className="text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                        />
                                      </div>
                                      <div className="p-2 bg-white/85 text-xs font-medium text-slate-700 truncate">
                                        {item.label}
                                      </div>
                                    </div>
                                  ));
                                },
                              )}
                            </div>
                          </>
                        ) : (
                          <p className="text-sm text-slate-500">
                            ยังไม่มีเอกสาร KYC สำหรับผู้ใช้นี้
                          </p>
                        )}
                      </div>
                    )}
                  </section>

                  {/* Unified Timeline — money + jobs + security + audit */}
                  {useBackendForUsers && (
                    <section id="ud-timeline" className="mb-6 scroll-mt-4">
                      <h4 className="text-sm font-bold text-slate-600 uppercase mb-3 flex items-center gap-2">
                        <Clock size={16} /> Timeline รวม
                      </h4>
                      {unifiedTimeline.length === 0 ? (
                        <p className="text-sm text-slate-500">
                          ยังไม่มี events ใน timeline
                        </p>
                      ) : (
                        <ul className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-80 overflow-y-auto">
                          {unifiedTimeline.map((ev) => (
                            <li
                              key={ev.id}
                              className="px-3 py-2 text-xs flex gap-2"
                            >
                              <span
                                className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                                  ev.lane === "financial"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : ev.lane === "commerce"
                                      ? "bg-indigo-100 text-indigo-800"
                                      : ev.lane === "security"
                                        ? "bg-red-100 text-red-800"
                                        : "bg-slate-100 text-slate-700"
                                }`}
                              >
                                {ev.lane}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex justify-between gap-2">
                                  <span className="font-medium text-slate-800 truncate">
                                    {ev.title}
                                    {ev.category ? ` · ${ev.category}` : ""}
                                  </span>
                                  <span className="text-[10px] text-slate-400 shrink-0">
                                    {ev.ts
                                      ? new Date(ev.ts).toLocaleString(
                                          "th-TH",
                                          {
                                            dateStyle: "short",
                                            timeStyle: "short",
                                          },
                                        )
                                      : ""}
                                  </span>
                                </div>
                                {(ev.amount != null || ev.job_id) && (
                                  <p className="text-[10px] text-slate-500">
                                    {ev.amount != null
                                      ? `฿${Number(ev.amount).toLocaleString()}`
                                      : ""}
                                    {ev.job_id
                                      ? `${ev.amount != null ? " · " : ""}job ${String(ev.job_id).slice(0, 8)}…`
                                      : ""}
                                  </p>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  )}

                  {/* Security Tracking — always show anchor for Security tab */}
                  {useBackendForUsers && (
                    <section id="ud-security" className="mb-6 scroll-mt-4">
                      <h4 className="text-sm font-bold text-slate-600 uppercase mb-3 flex items-center gap-2">
                        <Monitor size={16} /> Security & Risk
                      </h4>
                      {reconcileTrend && reconcileTrend.fail_count > 0 && (
                        <div
                          className={`mb-3 rounded-lg border px-3 py-2 text-xs ${
                            reconcileTrend.is_repeat_offender
                              ? "border-red-300 bg-red-50 text-red-950"
                              : "border-amber-200 bg-amber-50 text-amber-950"
                          }`}
                        >
                          <p className="font-bold flex items-center gap-1">
                            <AlertTriangle size={14} />
                            Reconcile trend ({reconcileTrend.window_days} วัน)
                          </p>
                          <p className="mt-1">
                            Fail {reconcileTrend.fail_count} ครั้ง ·{" "}
                            {reconcileTrend.distinct_days} วันที่มี alert
                            {reconcileTrend.max_variance
                              ? ` · สูงสุด ฿${reconcileTrend.max_variance.toLocaleString()}`
                              : ""}
                          </p>
                          {reconcileTrend.is_repeat_offender ? (
                            <p className="mt-1 font-semibold text-red-800">
                              Repeat offender — case ถูก escalate เป็น urgent
                              อัตโนมัติ
                            </p>
                          ) : (
                            <p className="mt-1 text-slate-600">
                              จะ flag เมื่อ ≥{" "}
                              {reconcileTrend.min_fails_threshold} ครั้ง
                            </p>
                          )}
                          {reconcileTrend.last_fail_at ? (
                            <p className="text-[10px] text-slate-500 mt-1">
                              ล่าสุด:{" "}
                              {new Date(
                                reconcileTrend.last_fail_at,
                              ).toLocaleString()}
                            </p>
                          ) : null}
                        </div>
                      )}
                      {securityRiskBadges.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {securityRiskBadges.map((badge) => (
                            <span
                              key={badge.code}
                              className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                                badge.severity === "high"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-amber-100 text-amber-900"
                              }`}
                            >
                              {badge.label}
                            </span>
                          ))}
                        </div>
                      )}
                      {compositeRisk ? (
                        <div className="mb-3 border border-slate-200 rounded-lg p-3 bg-slate-50">
                          <p className="text-xs font-bold text-slate-600 mb-2">
                            Composite risk: {compositeRisk.composite_tier} (
                            {compositeRisk.composite_score}/100)
                          </p>
                          {compositeRisk.score_components.length > 0 ? (
                            <ul className="flex flex-wrap gap-1">
                              {compositeRisk.score_components.map((c) => (
                                <li
                                  key={c.code}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-slate-200"
                                >
                                  {c.code}: +{c.points}
                                  {c.detail ? ` (${c.detail})` : ""}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-[10px] text-slate-500">
                              ไม่มี risk factor ที่นับคะแนน
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 mb-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                          ยังไม่มี composite risk profile
                        </p>
                      )}
                      {(compositeRisk?.linked_accounts?.length ?? 0) > 0 && (
                        <div className="mb-3 border border-red-200 rounded-lg overflow-hidden">
                          <p className="text-xs font-bold text-red-900 px-3 py-2 bg-red-50">
                            Linked accounts (
                            {compositeRisk!.linked_account_count})
                          </p>
                          <ul className="divide-y divide-red-50 max-h-32 overflow-y-auto">
                            {compositeRisk!.linked_accounts.map((l) => (
                              <li
                                key={`${l.linked_user_id}-${l.link_type}`}
                                className="px-3 py-2 text-xs"
                              >
                                <span className="font-mono text-slate-600">
                                  {l.linked_user_id.slice(0, 8)}…
                                </span>
                                {" · "}
                                {l.linked_name || l.linked_email || "—"}
                                {" · "}
                                <span className="text-red-700">
                                  {l.link_type}
                                </span>
                                {l.shared_ip ? ` · IP ${l.shared_ip}` : ""}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {detailDeviceHopping && (
                        <div className="mb-3 px-4 py-2 rounded-lg bg-red-100 text-red-800 text-sm font-bold flex items-center gap-2">
                          <AlertTriangle size={18} /> High Risk: Device Hopping
                          — มากกว่า 3 IP ใน 24 ชม.
                        </div>
                      )}
                      <div className="border border-slate-200 rounded-lg overflow-hidden">
                        <p className="text-xs font-bold text-slate-500 px-3 py-2 bg-slate-50">
                          Last 5 logins (IP + User-Agent)
                        </p>
                        <ul className="divide-y divide-slate-100 max-h-40 overflow-y-auto">
                          {detailLoginSessions.map((s, i) => (
                            <li key={i} className="px-3 py-2 text-sm">
                              <span className="font-mono text-slate-600">
                                {s.ip_address || "—"}
                              </span>
                              <span
                                className="text-slate-400 ml-2 truncate block"
                                title={s.user_agent}
                              >
                                {s.user_agent || "—"}
                              </span>
                              {s.created_at && (
                                <span className="text-xs text-slate-400">
                                  {new Date(s.created_at).toLocaleString()}
                                </span>
                              )}
                            </li>
                          ))}
                          {detailLoginSessions.length === 0 && (
                            <li className="px-3 py-2 text-slate-400 text-sm">
                              ยังไม่มีประวัติ login — user ใหม่หรือยังไม่เคย
                              login
                            </li>
                          )}
                        </ul>
                      </div>
                    </section>
                  )}

                  {/* Internal CRM Notes */}
                  {useBackendForUsers && canManageAccountActions && (
                    <section className="mb-6">
                      <h4 className="text-sm font-bold text-slate-600 uppercase mb-3 flex items-center gap-2">
                        <StickyNote size={16} /> Internal CRM Notes
                      </h4>
                      <div className="space-y-2 mb-3">
                        <textarea
                          value={newNote}
                          onChange={(e) => setNewNote(e.target.value)}
                          placeholder="เพิ่มโน้ตส่วนตัว..."
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                          rows={2}
                        />
                        <button
                          onClick={handleAddNote}
                          disabled={processing || !newNote.trim()}
                          className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 disabled:opacity-50"
                        >
                          <Plus size={16} /> Add Note
                        </button>
                      </div>
                      <ul className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-32 overflow-y-auto">
                        {detailNotes.map((n) => (
                          <li key={n.id} className="px-3 py-2 text-sm">
                            <p className="text-slate-700">{n.note}</p>
                            <p className="text-xs text-slate-400">
                              {n.admin_name} —{" "}
                              {n.created_at
                                ? new Date(n.created_at).toLocaleString()
                                : ""}
                            </p>
                          </li>
                        ))}
                        {detailNotes.length === 0 && (
                          <li className="px-3 py-2 text-slate-400 text-sm">
                            No notes yet
                          </li>
                        )}
                      </ul>
                    </section>
                  )}

                  {useBackendForUsers && selectedUser?.id && (
                    <UserCompetencyPanel
                      userId={String(selectedUser.id)}
                      canManage={canManageAccountActions}
                      onNotice={(msg, type) => showToast(msg, type || "info")}
                    />
                  )}

                  {/* Financial Actions — Credit/Debit with audit */}
                  <div id="ud-actions" className="scroll-mt-4" />
                  {useBackendForUsers && canManageAccountActions && (
                    <section className="mb-6">
                      <h4 className="text-sm font-bold text-slate-600 uppercase mb-3 flex items-center gap-2">
                        <Wallet size={16} /> Financial Actions
                      </h4>
                      <p className="text-xs text-slate-500 mb-2">
                        เติม/หักเงินด้วยเหตุผล (บันทึกใน payment_ledger_audit)
                      </p>
                      <button
                        onClick={() => {
                          setWalletAdjustDirection("credit");
                          setWalletAdjustAmount("");
                          setWalletAdjustReason("");
                          setShowWalletAdjustModal(true);
                        }}
                        disabled={processing}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-800 rounded-lg text-sm font-medium hover:bg-emerald-200 disabled:opacity-50"
                      >
                        <Plus size={16} /> Credit
                      </button>
                      <button
                        onClick={() => {
                          setWalletAdjustDirection("debit");
                          setWalletAdjustAmount("");
                          setWalletAdjustReason("");
                          setShowWalletAdjustModal(true);
                        }}
                        disabled={processing}
                        className="ml-2 flex items-center gap-2 px-4 py-2 bg-red-100 text-red-800 rounded-lg text-sm font-medium hover:bg-red-200 disabled:opacity-50"
                      >
                        <Minus size={16} /> Debit
                      </button>
                    </section>
                  )}

                  {/* Risk flags */}
                  {(selectedUser.account_status === "banned" ||
                    selectedUser.account_status === "suspended" ||
                    selectedUser.wallet_frozen ||
                    (selectedUser.kyc_status || selectedUser.kyc_level) ===
                      "rejected") && (
                    <section className="mb-6">
                      <h4 className="text-sm font-bold text-slate-600 uppercase mb-3 flex items-center gap-2">
                        <AlertTriangle size={16} className="text-amber-500" />{" "}
                        Risk flags
                      </h4>
                      <ul className="space-y-1 text-sm">
                        {selectedUser.account_status === "banned" && (
                          <>
                            <li className="text-red-600">Account banned</li>
                            {selectedUser.ban_reason && (
                              <li className="text-slate-600">
                                สาเหตุ: {selectedUser.ban_reason}
                              </li>
                            )}
                            {selectedUser.banned_until && (
                              <li className="text-slate-600">
                                แบนถึง:{" "}
                                {new Date(
                                  selectedUser.banned_until,
                                ).toLocaleString()}
                              </li>
                            )}
                          </>
                        )}
                        {selectedUser.account_status === "suspended" && (
                          <li className="text-amber-600">Account suspended</li>
                        )}
                        {selectedUser.wallet_frozen &&
                          selectedUser.account_status !== "banned" &&
                          selectedUser.account_status !== "suspended" && (
                            <li className="text-amber-600">
                              วอลเล็ตถูกระงับ (Platform Safety)
                            </li>
                          )}
                        {(selectedUser.kyc_status || selectedUser.kyc_level) ===
                          "rejected" && (
                          <li className="text-amber-600">KYC rejected</li>
                        )}
                      </ul>
                    </section>
                  )}

                  {/* Last activities (Audit trail) */}
                  {useBackendForUsers && detailAudit.length > 0 && (
                    <section className="mb-6">
                      <h4 className="text-sm font-bold text-slate-600 uppercase mb-3 flex items-center gap-2">
                        <ScrollText size={16} /> Audit trail
                      </h4>
                      <ul className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-48 overflow-y-auto">
                        {detailAudit.map((log) => (
                          <li key={log.id} className="px-3 py-2 text-sm">
                            <span className="font-medium">{log.action}</span> —{" "}
                            {log.actor_id || "system"}{" "}
                            {log.reason ? `(${log.reason})` : ""} —{" "}
                            {log.created_at
                              ? new Date(log.created_at).toLocaleString()
                              : ""}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {/* Provider status — บันทึกสถานะ Verified เมื่อผู้ใช้ผ่านเกณฑ์แล้วแต่ DB ยังไม่อัปเดต */}
                  {useBackendForUsers &&
                    selectedUser &&
                    (selectedUser.role === "provider" ||
                      selectedUser.role === "PROVIDER") && (
                      <section className="mb-6">
                        <h4 className="text-sm font-bold text-slate-600 uppercase mb-3">
                          สถานะผู้รับงาน (Provider)
                        </h4>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="px-3 py-1 rounded-full text-sm font-medium bg-slate-100 text-slate-700">
                            {selectedUser.provider_status ===
                            "VERIFIED_PROVIDER"
                              ? "Verified Provider — รับงานได้"
                              : selectedUser.provider_status === "PENDING_TEST"
                                ? "รอทำแบบทดสอบ"
                                : selectedUser.provider_status || "UNVERIFIED"}
                          </span>
                          {selectedUser.provider_status !==
                            "VERIFIED_PROVIDER" &&
                            canManageAccountActions && (
                              <button
                                type="button"
                                onClick={handleApproveProvider}
                                disabled={processing}
                                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                              >
                                บันทึกสถานะ Verified Provider
                              </button>
                            )}
                          {selectedUser.provider_status !==
                            "VERIFIED_PROVIDER" &&
                            !canManageAccountActions && (
                              <span className="text-sm text-slate-500">
                                อนุมัติผู้รับงานได้เฉพาะบัญชี Admin หรือ Super
                                Admin
                              </span>
                            )}
                        </div>
                      </section>
                    )}

                  {/* App role (เปลี่ยนจากผู้รับงานเป็น user หรือกลับกัน) */}
                  {useBackendForUsers &&
                    canManageAccountActions &&
                    selectedUser && (
                      <section className="mb-6">
                        <h4 className="text-sm font-bold text-slate-600 uppercase mb-3">
                          สถานะในแอป (User / ผู้รับงาน)
                        </h4>
                        <p className="text-sm text-slate-600 mb-2">
                          ปัจจุบัน:{" "}
                          {selectedUser.role === "provider" ||
                          selectedUser.role === "PROVIDER"
                            ? "ผู้รับงาน (Provider)"
                            : "ผู้ใช้ (User)"}
                        </p>
                        <button
                          onClick={() => {
                            setAppRole(
                              selectedUser.role === "provider" ||
                                selectedUser.role === "PROVIDER"
                                ? "user"
                                : "provider",
                            );
                            setShowAppRoleModal(true);
                          }}
                          disabled={processing}
                          className="px-4 py-2 bg-indigo-100 text-indigo-800 rounded-lg text-sm font-medium hover:bg-indigo-200"
                        >
                          เปลี่ยนเป็น{" "}
                          {selectedUser.role === "provider" ||
                          selectedUser.role === "PROVIDER"
                            ? "User"
                            : "ผู้รับงาน (Provider)"}
                        </button>
                      </section>
                    )}

                  {/* VIP */}
                  {useBackendForUsers &&
                    canManageAccountActions &&
                    selectedUser && (
                      <UserVipPanel
                        userId={selectedUser.id}
                        canManage={canManageAccountActions}
                        manualVip={!!selectedUser.is_vip}
                        onManualVipChange={(isVip) =>
                          setSelectedUser((u: any) =>
                            u ? { ...u, is_vip: isVip } : u,
                          )
                        }
                        onNotice={showToast}
                      />
                    )}

                  {/* Account Control (ADMIN only; confirm dialogs) */}
                  {useBackendForUsers && canManageAccountActions && (
                    <section className="mb-6">
                      <h4 className="text-sm font-bold text-slate-600 uppercase mb-3">
                        Account control
                      </h4>
                      <div className="mb-3 flex flex-wrap gap-2">
                        <button
                          onClick={handleEmergencySuspend}
                          disabled={processing}
                          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                          title="Ban + Wallet Freeze + Force Logout"
                        >
                          <Zap size={16} /> Emergency Suspend
                        </button>
                        <button
                          onClick={handleLoginAsUser}
                          disabled={processing}
                          className="flex items-center gap-2 px-4 py-2 bg-indigo-100 text-indigo-800 rounded-lg text-sm font-medium hover:bg-indigo-200 disabled:opacity-50"
                          title="Login as User (Shadow Mode)"
                        >
                          <LogIn size={16} /> Login as User
                        </button>
                        <button
                          onClick={handleUnlockRateLimit}
                          disabled={processing}
                          className="flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-800 rounded-lg text-sm font-medium hover:bg-emerald-200 disabled:opacity-50"
                          title="Clear user rate-limit buckets and allow a temporary bypass"
                        >
                          <Clock size={16} /> ปลดล็อก Rate Limit
                        </button>
                      </div>
                      <div className="mb-3">
                        <label className="block text-xs text-slate-500 mb-1">
                          สาเหตุ (สำหรับแบน/ระงับ)
                        </label>
                        <input
                          type="text"
                          value={actionReason}
                          onChange={(e) => setActionReason(e.target.value)}
                          placeholder="ระบุสาเหตุการกระทำความผิด"
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                        />
                      </div>
                      <div className="mb-3">
                        <label className="block text-xs text-slate-500 mb-1">
                          แบนกี่วัน (0 = แบนถาวร)
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={banDays}
                          onChange={(e) => setBanDays(e.target.value)}
                          placeholder="0"
                          className="w-24 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                        />
                        <span className="ml-2 text-xs text-slate-500">วัน</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedUser.account_status !== "suspended" && (
                          <button
                            onClick={handleSuspend}
                            disabled={processing}
                            className="px-4 py-2 bg-amber-100 text-amber-800 rounded-lg text-sm font-medium hover:bg-amber-200 disabled:opacity-50"
                          >
                            Suspend
                          </button>
                        )}
                        {selectedUser.account_status !== "banned" && (
                          <button
                            onClick={handleBan}
                            disabled={processing}
                            className="px-4 py-2 bg-red-100 text-red-800 rounded-lg text-sm font-medium hover:bg-red-200 disabled:opacity-50"
                          >
                            Ban
                          </button>
                        )}
                        {(selectedUser.account_status === "suspended" ||
                          selectedUser.account_status === "banned") && (
                          <button
                            onClick={handleReactivate}
                            disabled={processing}
                            className="px-4 py-2 bg-green-100 text-green-800 rounded-lg text-sm font-medium hover:bg-green-200 disabled:opacity-50"
                          >
                            Reactivate
                          </button>
                        )}
                        <button
                          onClick={handleForceLogout}
                          disabled={processing}
                          className="px-4 py-2 bg-slate-100 text-slate-800 rounded-lg text-sm font-medium hover:bg-slate-200 disabled:opacity-50"
                        >
                          Force logout
                        </button>
                      </div>
                    </section>
                  )}

                  <div className="flex gap-3">
                    {useBackendForUsers && canManageAccountActions && (
                      <button
                        onClick={() => {
                          setSelectedUser(selectedUser);
                          openRoleModal(selectedUser);
                          setShowDetailsModal(false);
                        }}
                        className="flex-1 py-3 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 flex items-center justify-center gap-2"
                      >
                        <UserCog size={18} /> Change role
                      </button>
                    )}
                    <button
                      onClick={() => setShowDetailsModal(false)}
                      className="flex-1 py-3 bg-slate-600 text-white font-bold rounded-lg hover:bg-slate-700"
                    >
                      Close
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal ยืนยันเปลี่ยน App role (User / ผู้รับงาน) */}
      {showAppRoleModal && selectedUser && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h4 className="text-lg font-bold text-slate-900 mb-2">
              เปลี่ยนสถานะในแอป
            </h4>
            <p className="text-sm text-slate-600 mb-4">
              เปลี่ยน <strong>{selectedUser.name}</strong> เป็น{" "}
              {appRole === "provider"
                ? "ผู้รับงาน (Provider)"
                : "ผู้ใช้ (User)"}{" "}
              ใช่หรือไม่?
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleChangeAppRole}
                disabled={processing}
                className="flex-1 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                ยืนยัน
              </button>
              <button
                onClick={() => setShowAppRoleModal(false)}
                disabled={processing}
                className="flex-1 py-2 bg-slate-200 text-slate-800 font-medium rounded-lg hover:bg-slate-300"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Wallet Adjust (Credit/Debit) */}
      {showWalletAdjustModal && selectedUser && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h4 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
              <Wallet size={20} />{" "}
              {walletAdjustDirection === "credit" ? "Credit" : "Debit"} Funds
            </h4>
            <p className="text-sm text-slate-600 mb-4">
              ผู้ใช้: <strong>{selectedUser.name}</strong> — ยอดปัจจุบัน: ฿
              {selectedUser.wallet_balance?.toLocaleString() ?? 0}
            </p>
            <div className="mb-4">
              <label className="block text-xs text-slate-500 mb-1">
                จำนวน (THB) *
              </label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={walletAdjustAmount}
                onChange={(e) => setWalletAdjustAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <div className="mb-4">
              <label className="block text-xs text-slate-500 mb-1">
                สาเหตุ (บังคับสำหรับ audit) *
              </label>
              <input
                type="text"
                value={walletAdjustReason}
                onChange={(e) => setWalletAdjustReason(e.target.value)}
                placeholder="e.g. Refund, Adjustment, Correction"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            {walletAdjustDirection === "debit" && (
              <>
                <div className="mb-4">
                  <label className="block text-xs text-slate-500 mb-1">
                    reason_code * (เช่น DUPLICATE_CREDIT, WRONG_AMOUNT)
                  </label>
                  <input
                    type="text"
                    value={walletAdjustReasonCode}
                    onChange={(e) => setWalletAdjustReasonCode(e.target.value)}
                    placeholder="รหัสสาเหตุมาตรฐาน"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono"
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-xs text-slate-500 mb-1">
                    evidence_ref * (payment_ledger_audit.id ของรายการผิด)
                  </label>
                  <input
                    type="text"
                    value={walletAdjustEvidenceRef}
                    onChange={(e) => setWalletAdjustEvidenceRef(e.target.value)}
                    placeholder="L-deposit-manual-… หรือ id จาก Financial Audit"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono"
                  />
                </div>
              </>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleWalletAdjust}
                disabled={
                  processing ||
                  !walletAdjustAmount ||
                  !walletAdjustReason.trim() ||
                  (walletAdjustDirection === "debit" &&
                    (!walletAdjustReasonCode.trim() ||
                      !walletAdjustEvidenceRef.trim()))
                }
                className={`flex-1 py-2 font-medium rounded-lg disabled:opacity-50 ${
                  walletAdjustDirection === "credit"
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : "bg-red-600 text-white hover:bg-red-700"
                }`}
              >
                {processing ? (
                  <Loader2 className="animate-spin mx-auto" size={18} />
                ) : walletAdjustDirection === "credit" ? (
                  "Credit"
                ) : (
                  "Debit"
                )}
              </button>
              <button
                onClick={() => setShowWalletAdjustModal(false)}
                disabled={processing}
                className="flex-1 py-2 bg-slate-200 text-slate-800 font-medium rounded-lg hover:bg-slate-300"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KYC Lightbox — ดูเอกสารขนาดเต็มจาก User Details */}
      {kycLightbox && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setKycLightbox(null)}
        >
          <button
            onClick={() => setKycLightbox(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2 z-10"
          >
            <X size={32} />
          </button>
          <div
            className="relative max-w-[95vw] max-h-[95vh] flex flex-col items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {kycLightbox.type === "video" ? (
              <div className="bg-slate-900 rounded-xl p-4 max-w-2xl w-full">
                <p className="text-white font-medium mb-2">
                  {kycLightbox.label}
                </p>
                <video
                  src={kycLightbox.url}
                  controls
                  autoPlay
                  className="w-full rounded-lg"
                />
                <a
                  href={kycLightbox.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-400 text-sm mt-2 inline-block hover:underline"
                >
                  เปิดในแท็บใหม่ →
                </a>
              </div>
            ) : (
              <img
                src={kycLightbox.url}
                alt={kycLightbox.label}
                className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
              />
            )}
            <p className="mt-3 text-center text-white/90 text-sm">
              {kycLightbox.label}
            </p>
          </div>
        </div>
      )}

      {kycDocPickerOpen && selectedUser && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-bold text-slate-900 flex items-center gap-2">
                <FileText size={18} className="text-amber-600" />
                Request KYC documents
              </h4>
              <button
                type="button"
                onClick={() => setKycDocPickerOpen(false)}
                className="p-1 rounded hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              เลือกเอกสารที่ต้องการให้{" "}
              <strong>{selectedUser.name || selectedUser.email}</strong> ส่งใหม่
            </p>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              คำสั่งถึง user
            </label>
            <textarea
              value={kycDocPickerInstruction}
              onChange={(e) => setKycDocPickerInstruction(e.target.value)}
              rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm mb-3"
            />
            <div className="space-y-1.5 mb-4 max-h-48 overflow-y-auto border rounded-lg p-2">
              {KYC_REQUEST_DOC_OPTIONS.map((opt) => (
                <label
                  key={opt.id}
                  className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 rounded px-1 py-0.5"
                >
                  <input
                    type="checkbox"
                    checked={kycDocPickerSelected.includes(opt.id)}
                    onChange={(e) => {
                      setKycDocPickerSelected((prev) =>
                        e.target.checked
                          ? [...prev, opt.id]
                          : prev.filter((x) => x !== opt.id),
                      );
                    }}
                    className="rounded border-slate-300"
                  />
                  <span>{opt.label}</span>
                  <span className="text-[10px] text-slate-400 ml-auto">
                    {opt.kind === "supplement" ? "supplement" : "resubmit"}
                  </span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setKycDocPickerOpen(false)}
                className="flex-1 py-2 rounded-lg border text-sm font-medium"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={kycActing}
                onClick={() => void submitKycDocPicker()}
                className="flex-1 py-2 rounded-lg bg-amber-600 text-white text-sm font-bold hover:bg-amber-700 disabled:opacity-50"
              >
                {kycActing ? "กำลังส่ง…" : "ส่งคำขอ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
