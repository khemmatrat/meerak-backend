// Phase 4A: User Management — backend RBAC. No password/token/firebase_uid. Pagination + Search + Filters.
import React, { useState, useEffect, useCallback } from "react";
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
  FileText,
} from "lucide-react";
import { db } from "../firebaseConfig";
import { DataService } from "../services/realtimeService";
import {
  getAdminUsers,
  getAdminUser,
  updateAdminUserRole,
  getAdminToken,
  getAdminUserLedger,
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
  getAdminUserLoginSessions,
  getAdminUserNotes,
  addAdminUserNote,
  getAdminUserLmsSummary,
  adminWalletAdjust,
  grantBrandAdviserAdminUser,
  revokeBrandAdviserAdminUser,
  getKycDetail,
} from "../services/adminApi";
import type { AdminUserRow, AdminUserLedgerEntry, KycDetailResponse } from "../services/adminApi";
import type { AuditLogRow } from "../services/adminApi";
import { MobileUser } from "../types";
import { LandingLeadsPanel } from "./LandingLeadsPanel";

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
}

export const UserManagementView: React.FC<UserManagementViewProps> = ({
  currentUserRole,
  setView,
  focusUserId,
  onFocusUserIdConsumed,
  onOpenKycReview,
}) => {
  const [users, setUsers] = useState<AdminUserRow[] | MobileUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [kycFilter, setKycFilter] = useState("");
  const [vipFilter, setVipFilter] = useState(false);
  const [betaTesterFilter, setBetaTesterFilter] = useState(false);
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
    "firebase"
  );
  const useFirebaseList = canSwitchSource ? dataSource === "firebase" : !!db;
  const useBackendForUsers = canSwitchSource
    ? dataSource === "backend"
    : useBackend && !db;

  /** แท็บย่อยในโหมด Backend: รายชื่อผู้ใช้แอป vs ลีดจาก Landing */
  const [umPrimaryTab, setUmPrimaryTab] = useState<"users" | "landing">(
    "users"
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
  const [detailAudit, setDetailAudit] = useState<AuditLogRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [newRole, setNewRole] = useState<BackendRole | "USER" | "PROVIDER">(
    "USER"
  );
  const [newBalance, setNewBalance] = useState("");
  const [actionReason, setActionReason] = useState("");
  const [roleChangeReason, setRoleChangeReason] = useState("");
  const [banDays, setBanDays] = useState<string>("0");
  const [showAppRoleModal, setShowAppRoleModal] = useState(false);
  const [appRole, setAppRole] = useState<"user" | "provider">("user");

  const [detailLoginSessions, setDetailLoginSessions] = useState<Array<{ ip_address: string | null; user_agent: string; created_at: string | null }>>([]);
  const [detailDeviceHopping, setDetailDeviceHopping] = useState(false);
  const [detailNotes, setDetailNotes] = useState<Array<{ id: string; admin_name: string; note: string; created_at: string | null }>>([]);
  const [detailLmsSummary, setDetailLmsSummary] = useState<{ avg_grade: number | null; training_status: string } | null>(null);
  const [detailKyc, setDetailKyc] = useState<KycDetailResponse | null>(null);
  const [detailKycLoading, setDetailKycLoading] = useState(false);
  const [kycLightbox, setKycLightbox] = useState<{ url: string; label: string; type: "image" | "video" } | null>(null);
  const [showWalletAdjustModal, setShowWalletAdjustModal] = useState(false);
  const [walletAdjustDirection, setWalletAdjustDirection] = useState<"credit" | "debit">("credit");
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
    []
  );
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
  };

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
    ]
  );

  useEffect(() => {
    fetchUsers(page);
  }, [page, roleFilter, statusFilter, kycFilter, vipFilter, betaTesterFilter, dataSource]);

  /** เปิด User Detail modal จาก userId (ใช้เมื่อโฟกัสจาก Audit Logs) */
  const openUserDetailById = useCallback(
    async (userId: string) => {
      setDetailLoading(true);
      setDetailLedger([]);
      setDetailLedgerTotals({ total_credit: 0, total_debit: 0 });
      setDetailAudit([]);
      setDetailLoginSessions([]);
      setDetailDeviceHopping(false);
      setDetailNotes([]);
      setDetailLmsSummary(null);
      setDetailKyc(null);
      setDetailKycLoading(true);
      try {
        const [res, ledgerRes, auditRes, sessionsRes, notesRes, lmsRes, kycRes] = await Promise.all([
          getAdminUser(userId),
          getAdminUserLedger(userId, 10).catch(() => ({
            entries: [],
            total_credit: 0,
            total_debit: 0,
          })),
          getAuditLogs({
            entity_type: "users",
            entity_id: userId,
            limit: 20,
          }).catch(() => ({ logs: [], count: 0 })),
          getAdminUserLoginSessions(userId, 5).catch(() => ({ sessions: [], device_hopping_24h: false })),
          getAdminUserNotes(userId).catch(() => ({ notes: [] })),
          getAdminUserLmsSummary(userId).catch(() => null),
          getKycDetail(userId).catch(() => null),
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
        setDetailAudit((auditRes as { logs: AuditLogRow[] }).logs || []);
        setDetailLoginSessions((sessionsRes as { sessions: typeof detailLoginSessions }).sessions || []);
        setDetailDeviceHopping((sessionsRes as { device_hopping_24h: boolean }).device_hopping_24h || false);
        setDetailNotes((notesRes as { notes: typeof detailNotes }).notes || []);
        setDetailLmsSummary(lmsRes && typeof lmsRes === "object" && "avg_grade" in lmsRes ? lmsRes : null);
        setDetailKyc(kycRes && typeof kycRes === "object" && "documents" in kycRes ? (kycRes as KycDetailResponse) : null);
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
    [showToast]
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
        `Change role of ${targetName} to ${newRole}? This action will be recorded in the audit log.`
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
          roleChangeReason.trim() || undefined
        );
        alert(`✅ Role updated to ${newRole} (recorded in audit log)`);
      } else if (!useBackendForUsers) {
        await DataService.updateUserRole(
          selectedUser.id,
          newRole as "USER" | "PROVIDER"
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
        parseFloat(newBalance)
      );
      alert(
        `✅ Successfully updated ${selectedUser.username} balance to ฿${newBalance}`
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
    setDetailAudit([]);
    setDetailLoginSessions([]);
    setDetailDeviceHopping(false);
    setDetailNotes([]);
    setDetailLmsSummary(null);
    setDetailKyc(null);
    setDetailKycLoading(true);
    try {
      if (useBackendForUsers) {
        const [res, ledgerRes, auditRes, sessionsRes, notesRes, lmsRes, kycRes] = await Promise.all([
          getAdminUser(user.id),
          getAdminUserLedger(user.id, 10).catch(() => ({
            entries: [],
            total_credit: 0,
            total_debit: 0,
          })),
          getAuditLogs({
            entity_type: "users",
            entity_id: user.id,
            limit: 20,
          }).catch(() => ({ logs: [], count: 0 })),
          getAdminUserLoginSessions(user.id, 5).catch(() => ({ sessions: [], device_hopping_24h: false })),
          getAdminUserNotes(user.id).catch(() => ({ notes: [] })),
          getAdminUserLmsSummary(user.id).catch(() => null),
          getKycDetail(user.id).catch(() => null),
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
        setDetailAudit((auditRes as { logs: AuditLogRow[] }).logs || []);
        setDetailLoginSessions((sessionsRes as { sessions: typeof detailLoginSessions }).sessions || []);
        setDetailDeviceHopping((sessionsRes as { device_hopping_24h: boolean }).device_hopping_24h || false);
        setDetailNotes((notesRes as { notes: typeof detailNotes }).notes || []);
        setDetailLmsSummary(lmsRes && typeof lmsRes === "object" && "avg_grade" in lmsRes ? lmsRes : null);
        setDetailKyc(kycRes && typeof kycRes === "object" && "documents" in kycRes ? (kycRes as KycDetailResponse) : null);
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
    if (!selectedUser || !useBackendForUsers || !canManageAccountActions) return;
    if (!confirm(`⚠️ Emergency Suspend: แบนถาวร + ระงับเงิน + บังคับออกจากระบบ\n\nผู้ใช้: ${selectedUser.name}\n\nดำเนินการต่อ?`)) return;
    setProcessing(true);
    try {
      await emergencySuspendUser(selectedUser.id, actionReason.trim() || "Emergency Suspend by admin");
      setShowDetailsModal(false);
      fetchUsers(page);
      showToast("Emergency Suspend สำเร็จ", "success");
    } catch (e: any) {
      showToast(e?.message || "ดำเนินการไม่สำเร็จ", "error");
    }
    setProcessing(false);
  };

  const handleGrantBrandAdviser = async () => {
    if (!selectedUser || !useBackendForUsers || !canManageAccountActions) return;
    if (!confirm("มอบสิทธิ์ Brand Adviser (ยกเว้นค่าคอมแพลตฟอร์มเมื่อโปรแกรมเปิด) ให้ผู้ใช้นี้?")) return;
    setProcessing(true);
    try {
      await grantBrandAdviserAdminUser(selectedUser.id, actionReason.trim() || undefined);
      showToast("มอบสิทธิ์ Brand Adviser แล้ว", "success");
      await openUserDetailById(selectedUser.id);
      fetchUsers(page);
    } catch (e: any) {
      showToast(e?.message || "ดำเนินการไม่สำเร็จ", "error");
    }
    setProcessing(false);
  };

  const handleRevokeBrandAdviser = async () => {
    if (!selectedUser || !useBackendForUsers || !canManageAccountActions) return;
    if (!confirm("ถอดสิทธิ์ Brand Adviser จากผู้ใช้นี้? (บันทึก audit)")) return;
    setProcessing(true);
    try {
      await revokeBrandAdviserAdminUser(selectedUser.id, actionReason.trim() || undefined);
      showToast("ถอดสิทธิ์ Brand Adviser แล้ว", "success");
      await openUserDetailById(selectedUser.id);
      fetchUsers(page);
    } catch (e: any) {
      showToast(e?.message || "ดำเนินการไม่สำเร็จ", "error");
    }
    setProcessing(false);
  };

  const handleLoginAsUser = async () => {
    if (!selectedUser || !useBackendForUsers || !canManageAccountActions) return;
    setProcessing(true);
    try {
      const { token } = await createImpersonationToken(selectedUser.id, 15);
      const baseUrl = (import.meta as any).env?.VITE_APP_URL || "https://app.aqond.com" || window.location.origin.replace("admin", "app");
      const url = `${baseUrl}/impersonate?token=${encodeURIComponent(token)}`;
      window.open(url, "_blank", "noopener,noreferrer");
      showToast("เปิดหน้าต่างใหม่ — ใช้ Token 15 นาที", "success");
    } catch (e: any) {
      showToast(e?.message || "สร้าง Token ไม่สำเร็จ", "error");
    }
    setProcessing(false);
  };

  const handleAddNote = async () => {
    if (!selectedUser || !useBackendForUsers || !canManageAccountActions || !newNote.trim()) return;
    setProcessing(true);
    try {
      await addAdminUserNote(selectedUser.id, newNote.trim());
      setDetailNotes((prev) => [{ id: "", admin_name: "—", note: newNote.trim(), created_at: new Date().toISOString() }, ...prev]);
      setNewNote("");
      showToast("บันทึกโน้ตแล้ว", "success");
    } catch (e: any) {
      showToast(e?.message || "บันทึกไม่สำเร็จ", "error");
    }
    setProcessing(false);
  };

  const handleWalletAdjust = async () => {
    if (!selectedUser || !useBackendForUsers || !canManageAccountActions) return;
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
        showToast("การหักเงิน (Debit) ต้องระบุ reason_code และ evidence_ref (เลข ledger รายการผิด)", "error");
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
      setSelectedUser((u: any) => (u ? { ...u, wallet_balance: res.balance_after } : u));
      setShowWalletAdjustModal(false);
      setWalletAdjustAmount("");
      setWalletAdjustReason("");
      setWalletAdjustReasonCode("");
      setWalletAdjustEvidenceRef("");
      showToast(`${walletAdjustDirection === "credit" ? "เติม" : "หัก"} ฿${amt.toLocaleString()} สำเร็จ`, "success");
    } catch (e: any) {
      showToast(e?.message || "ดำเนินการไม่สำเร็จ", "error");
    }
    setProcessing(false);
  };

  const handleSuspend = async () => {
    if (!selectedUser || !useBackendForUsers || !canManageAccountActions) return;
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
    if (!selectedUser || !useBackendForUsers || !canManageAccountActions) return;
    const reason = actionReason.trim() || "Banned by admin";
    const days = Math.max(0, parseInt(banDays, 10) || 0);
    const msg = days > 0
      ? `แบนผู้ใช้ ${selectedUser.name} เป็นเวลา ${days} วัน?\nสาเหตุ: ${reason}`
      : `แบนผู้ใช้ ${selectedUser.name} แบบถาวร?\nสาเหตุ: ${reason}`;
    if (!confirm(msg)) return;
    setProcessing(true);
    try {
      await banAdminUser(selectedUser.id, reason, days > 0 ? days : undefined);
      setShowDetailsModal(false);
      fetchUsers(page);
      showToast(days > 0 ? `แบน ${days} วัน สำเร็จ` : "แบนถาวรสำเร็จ", "success");
    } catch (e: any) {
      showToast(e?.message || "Failed to ban", "error");
    }
    setProcessing(false);
  };
  const handleApproveProvider = async () => {
    if (!selectedUser || !useBackendForUsers || !canManageAccountActions) return;
    if (!confirm(`อนุมัติให้ ${selectedUser.name} เป็นผู้รับงาน (Verified Provider) ใช่หรือไม่?`)) return;
    setProcessing(true);
    try {
      await approveUserAsProvider(selectedUser.id);
      setSelectedUser((u: any) => (u ? { ...u, provider_status: "VERIFIED_PROVIDER", provider_verified_at: new Date().toISOString() } : u));
      showToast("ตั้งเป็น Verified Provider แล้ว", "success");
    } catch (e: any) {
      showToast(e?.message || "Failed to approve provider", "error");
    }
    setProcessing(false);
  };
  const handleChangeAppRole = async () => {
    if (!selectedUser || !useBackendForUsers || !canManageAccountActions) return;
    setProcessing(true);
    try {
      await updateAdminUserAppRole(selectedUser.id, appRole);
      setSelectedUser((u: any) => (u ? { ...u, role: appRole } : u));
      setShowAppRoleModal(false);
      showToast(`เปลี่ยนสถานะเป็น ${appRole === "provider" ? "ผู้รับงาน" : "ผู้ใช้"} แล้ว`, "success");
    } catch (e: any) {
      showToast(e?.message || "Failed to change app role", "error");
    }
    setProcessing(false);
  };
  const handleSetVip = async (isVip: boolean) => {
    if (!selectedUser || !useBackendForUsers || !canManageAccountActions) return;
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
    if (!selectedUser || !useBackendForUsers || !canManageAccountActions) return;
    if (!confirm(`Reactivate user ${selectedUser.name}?`)) return;
    setProcessing(true);
    try {
      await reactivateAdminUser(
        selectedUser.id,
        actionReason.trim() || undefined
      );
      setShowDetailsModal(false);
      fetchUsers(page);
    } catch (e: any) {
      showToast(e?.message || "Failed to reactivate", "error");
    }
    setProcessing(false);
  };

  const handleWalletFreeze = async (frozen: boolean) => {
    if (!selectedUser || !useBackendForUsers || !canManageAccountActions) return;
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
    if (!selectedUser || !useBackendForUsers || !canManageAccountActions) return;
    const reason = actionReason.trim() || "Force logout by admin";
    if (!confirm(`Force logout user ${selectedUser.name}?\nReason: ${reason}\n\nผู้ใช้จะถูกบังคับออกจากระบบทันที — โทเค็นเดิมจะใช้ไม่ได้`))
      return;
    setProcessing(true);
    try {
      await forceLogoutAdminUser(selectedUser.id, reason);
      showToast("Force logout สำเร็จ — โทเค็นของผู้ใช้ถูกยกเลิกแล้ว", "success");
    } catch (e: any) {
      showToast(e?.message || "ดำเนินการไม่สำเร็จ", "error");
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
          : "USER") as BackendRole
      );
    } else {
      setNewRole(
        user.role === "PROVIDER" || user.role === "provider"
          ? "USER"
          : "PROVIDER"
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
      : Math.ceil(pagination.total / pagination.limit)
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
            onClick={() => setUmPrimaryTab("users")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              umPrimaryTab === "users"
                ? "bg-indigo-600 text-white shadow"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            ผู้ใช้แอป (Backend)
          </button>
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
                    (u: any) => u.role === "PROVIDER" || u.role === "provider"
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
                      (u as AdminUserRow).account_status === "active"
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
                      (u as AdminUserRow).account_status === "banned"
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
              <h3 className="text-lg font-bold text-slate-800">All Users</h3>
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
                <span className="text-slate-600">ทีมทดสอบ (Beta) เท่านั้น</span>
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
                            <p className="text-xs text-slate-500">{d.email}</p>
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
                                : d.role === "AUDITOR" || d.role === "auditor"
                                ? "bg-amber-100 text-amber-700"
                                : d.role === "PROVIDER" || d.role === "provider"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {d.role}
                          </span>
                          {useBackendForUsers && (user as AdminUserRow).is_vip && (
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                              VIP
                            </span>
                          )}
                          {useBackendForUsers && (user as AdminUserRow).is_beta_tester && (
                            <span
                              className="px-2 py-0.5 rounded text-xs font-medium bg-violet-100 text-violet-800"
                              title={`Beta tester #${(user as AdminUserRow).beta_tester_number ?? "?"}`}
                            >
                              Beta #
                              {(user as AdminUserRow).beta_tester_number ?? "?"}
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
                              {(user as any).wallet_balance?.toLocaleString() || 0}
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
                              isAuditor ? "Auditor: read-only" : "Change Role"
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
                              title={d.status === "banned" ? "Unban" : "Ban"}
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
                String(selectedUser.contact_email).trim() !== String(selectedUser.email || "").trim() && (
                  <p className="text-xs text-indigo-600 mt-1">อีเมลติดต่อ: {selectedUser.contact_email}</p>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl p-6 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900 flex items-center">
                <Eye className="text-blue-600 mr-2" size={24} />
                User Details
              </h3>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={24} />
              </button>
            </div>

            {detailLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 size={32} className="animate-spin text-slate-400" />
              </div>
            ) : (
              <>
                {/* Profile summary */}
                <section className="mb-6">
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
                              selectedUser.last_login_at
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
                      <Award size={16} className="text-amber-600" /> Brand Adviser
                    </h4>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="font-bold text-slate-900">
                          {selectedUser.is_brand_adviser
                            ? `สถานะ: ${selectedUser.adviser_status || "—"}`
                            : "ยังไม่ได้รับสิทธิ์"}
                        </span>
                        {selectedUser.is_brand_adviser && selectedUser.adviser_reputation_score != null && (
                          <span className="text-sm text-slate-600">
                            Reputation: {Number(selectedUser.adviser_reputation_score).toLocaleString()}
                          </span>
                        )}
                      </div>
                      {selectedUser.adviser_granted_at && (
                        <p className="text-xs text-slate-600">
                          มอบสิทธิ์: {new Date(selectedUser.adviser_granted_at).toLocaleString()}
                        </p>
                      )}
                      {selectedUser.adviser_suspended_at && (
                        <p className="text-xs text-amber-800">
                          พัก/ถอดล่าสุด: {new Date(selectedUser.adviser_suspended_at).toLocaleString()}
                          {selectedUser.adviser_suspended_reason
                            ? ` — ${selectedUser.adviser_suspended_reason}`
                            : ""}
                        </p>
                      )}
                      {canManageAccountActions && (
                        <div className="flex flex-wrap gap-2 pt-2">
                          <button
                            type="button"
                            disabled={processing || !!selectedUser.is_brand_adviser}
                            onClick={handleGrantBrandAdviser}
                            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            มอบสิทธิ์ BA
                          </button>
                          <button
                            type="button"
                            disabled={processing || !selectedUser.is_brand_adviser}
                            onClick={handleRevokeBrandAdviser}
                            className="px-3 py-1.5 rounded-lg text-sm font-medium border border-amber-800 text-amber-900 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            ถอดสิทธิ์ BA
                          </button>
                        </div>
                      )}
                      <p className="text-xs text-slate-500 pt-1">
                        ใช้ช่อง Reason (Account actions) ด้านล่างเป็นเหตุผล audit ได้
                      </p>
                    </div>
                  </section>
                )}

                {/* Wallet summary (read-only) + Wallet Freeze */}
                <section className="mb-6">
                  <h4 className="text-sm font-bold text-slate-600 uppercase mb-3 flex items-center gap-2">
                    <Wallet size={16} /> Wallet
                  </h4>
                  <div className="bg-emerald-50 p-4 rounded-lg mb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs text-emerald-700">Balance</p>
                        <p className="font-bold text-2xl text-emerald-900">
                          ฿{selectedUser.wallet_balance?.toLocaleString() ?? 0}{" "}
                          <span className="text-sm font-normal text-slate-600">
                            {selectedUser.currency || "THB"}
                          </span>
                        </p>
                      </div>
                      {useBackendForUsers && (
                        <div className="flex flex-col items-end gap-1">
                          {selectedUser.wallet_frozen ? (
                            <span className="px-2 py-1 rounded text-xs font-bold bg-red-100 text-red-700">
                              ระงับเงิน
                            </span>
                          ) : null}
                          {selectedUser.account_status === "banned" || selectedUser.account_status === "suspended" ? (
                            <span className="px-2 py-1 rounded text-xs text-slate-500">
                              (วอลเล็ตถูกระงับอัตโนมัติเมื่อแบน/ระงับบัญชี)
                            </span>
                          ) : canManageAccountActions && (
                            <button
                              onClick={() => handleWalletFreeze(!selectedUser.wallet_frozen)}
                              disabled={processing}
                              className={`px-3 py-1 rounded-full text-xs font-medium ${
                                selectedUser.wallet_frozen
                                  ? "bg-green-100 text-green-800 hover:bg-green-200"
                                  : "bg-amber-100 text-amber-800 hover:bg-amber-200"
                              } disabled:opacity-50`}
                            >
                              {selectedUser.wallet_frozen ? "ปลดระงับเงิน" : "ระงับเงิน"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {useBackend &&
                    (detailLedgerTotals.total_credit > 0 ||
                      detailLedgerTotals.total_debit > 0) && (
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-slate-50 p-3 rounded-lg">
                          <p className="text-xs text-slate-500">Total credit</p>
                          <p className="font-bold text-emerald-700">
                            + ฿
                            {detailLedgerTotals.total_credit.toLocaleString()}
                          </p>
                        </div>
                        <div className="bg-slate-50 p-3 rounded-lg">
                          <p className="text-xs text-slate-500">Total debit</p>
                          <p className="font-bold text-red-700">
                            − ฿{detailLedgerTotals.total_debit.toLocaleString()}
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
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    {selectedUser.bank_accounts && Array.isArray(selectedUser.bank_accounts) && selectedUser.bank_accounts.length > 0 ? (
                      <ul className="divide-y divide-slate-100">
                        {selectedUser.bank_accounts.map((acc: any, idx: number) => (
                          <li key={acc.id || idx} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-slate-50/50">
                            <div>
                              <p className="font-medium text-slate-900">
                                {acc.provider_name || acc.bank_name || "—"} {acc.type && acc.type !== "bank" ? `(${acc.type})` : ""}
                              </p>
                              <p className="text-sm font-mono text-slate-600">{acc.account_number || "—"}</p>
                              <p className="text-xs text-slate-500">{acc.account_name || "—"}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="px-4 py-4 text-slate-500 text-sm">ยังไม่มีช่องทางรับเงิน</p>
                    )}
                  </div>
                </section>

                {/* KYC summary + link to KYC Review + rejection reason placeholder */}
                <section className="mb-6">
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
                    </div>
                    {(setView || onOpenKycReview) && (
                      <button
                        onClick={() => {
                          if (onOpenKycReview) onOpenKycReview(selectedUser.id);
                          setShowDetailsModal(false);
                          if (setView) setView("kyc-review");
                        }}
                        className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                      >
                        <FileCheck size={16} /> KYC Review
                      </button>
                    )}
                  </div>
                  {useBackendForUsers && (
                    <div className="border border-slate-200 rounded-lg p-4 bg-white">
                      <p className="text-xs font-bold text-slate-500 mb-3 flex items-center gap-2">
                        <Eye size={14} /> เอกสาร KYC (ล่าสุด) — คลิกเพื่อดูขนาดเต็ม
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
                            const vehicles = parseKycVehiclesJson(latest.vehicles_json);
                            const hasAddr = typeof addr === "string" && addr.trim();
                            if (!hasAddr && vehicles.length === 0) return null;
                            return (
                              <div className="mb-4 space-y-3">
                                {hasAddr && (
                                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-sm">
                                    <p className="text-xs font-bold text-slate-500 mb-1">ที่อยู่ (จากใบสมัครล่าสุด)</p>
                                    <p className="text-slate-800 whitespace-pre-wrap">{String(addr).trim()}</p>
                                  </div>
                                )}
                                {vehicles.length > 0 && (
                                  <div className="p-3 rounded-lg bg-amber-50/90 border border-amber-100 text-sm">
                                    <p className="text-xs font-bold text-amber-900 mb-2">ทะเบียนรถ / ข้อมูลเล่ม</p>
                                    <ul className="space-y-2 text-slate-800">
                                      {vehicles.map((v: any, idx: number) => (
                                        <li key={idx}>
                                          <span className="font-medium">คันที่ {idx + 1}:</span>{" "}
                                          {[v.license_plate, v.vehicle_province].filter(Boolean).join(" ")}
                                          {v.vehicle_brand
                                            ? ` — ${v.vehicle_brand}${v.vehicle_model ? ` ${v.vehicle_model}` : ""}`
                                            : ""}
                                          {v.owner_name ? ` · เจ้าของ: ${v.owner_name}` : ""}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {(detailKyc!.documents as any[]).flatMap((d: any) => {
                            const keys = [
                              "id_card_front_url",
                              "id_card_back_url",
                              "selfie_photo_url",
                              "driving_license_front_url",
                              "driving_license_back_url",
                              "selfie_video_url",
                            ];
                            const items: Array<{ url: string; label: string; type: "image" | "video" }> = [];
                            keys.forEach((key) => {
                              const url = d?.[key];
                              if (url && typeof url === "string") {
                                items.push({
                                  url,
                                  label: KYC_DOC_LABELS[key] || key,
                                  type: key.includes("video") ? "video" : "image",
                                });
                              }
                            });
                            parseKycVehiclesJson(d?.vehicles_json).forEach((v: any, idx: number) => {
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
                                      <FileText size={28} className="text-indigo-500 mb-1" />
                                      <span className="text-xs text-slate-600 truncate w-full text-center">
                                        วิดีโอ
                                      </span>
                                      <a
                                        href={item.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
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
                                        (e.target as HTMLImageElement).src =
                                          "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect fill='%23e2e8f0' width='100' height='100'/%3E%3Ctext x='50' y='50' fill='%2394a3b8' text-anchor='middle' dy='.3em' font-size='12'%3Eโหลดไม่สำเร็จ%3C/text%3E%3C/svg%3E";
                                      }}
                                    />
                                  )}
                                </div>
                                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/25 transition-colors">
                                  <Expand size={22} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                                <div className="p-2 bg-white/85 text-xs font-medium text-slate-700 truncate">
                                  {item.label}
                                </div>
                              </div>
                            ));
                          })}
                        </div>
                        </>
                      ) : (
                        <p className="text-sm text-slate-500">ยังไม่มีเอกสาร KYC สำหรับผู้ใช้นี้</p>
                      )}
                    </div>
                  )}
                </section>

                {/* Security Tracking — Last 5 IP + User-Agent + Device Hopping */}
                {useBackendForUsers && (detailLoginSessions.length > 0 || detailDeviceHopping) && (
                  <section className="mb-6">
                    <h4 className="text-sm font-bold text-slate-600 uppercase mb-3 flex items-center gap-2">
                      <Monitor size={16} /> Security Tracking
                    </h4>
                    {detailDeviceHopping && (
                      <div className="mb-3 px-4 py-2 rounded-lg bg-red-100 text-red-800 text-sm font-bold flex items-center gap-2">
                        <AlertTriangle size={18} /> High Risk: Device Hopping — มากกว่า 3 IP ใน 24 ชม.
                      </div>
                    )}
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <p className="text-xs font-bold text-slate-500 px-3 py-2 bg-slate-50">Last 5 logins (IP + User-Agent)</p>
                      <ul className="divide-y divide-slate-100 max-h-40 overflow-y-auto">
                        {detailLoginSessions.map((s, i) => (
                          <li key={i} className="px-3 py-2 text-sm">
                            <span className="font-mono text-slate-600">{s.ip_address || "—"}</span>
                            <span className="text-slate-400 ml-2 truncate block" title={s.user_agent}>{s.user_agent || "—"}</span>
                            {s.created_at && <span className="text-xs text-slate-400">{new Date(s.created_at).toLocaleString()}</span>}
                          </li>
                        ))}
                        {detailLoginSessions.length === 0 && <li className="px-3 py-2 text-slate-400 text-sm">No login sessions recorded</li>}
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
                          <p className="text-xs text-slate-400">{n.admin_name} — {n.created_at ? new Date(n.created_at).toLocaleString() : ""}</p>
                        </li>
                      ))}
                      {detailNotes.length === 0 && <li className="px-3 py-2 text-slate-400 text-sm">No notes yet</li>}
                    </ul>
                  </section>
                )}

                {/* LMS & Quality Sync */}
                {useBackendForUsers && detailLmsSummary && (
                  <section className="mb-6">
                    <h4 className="text-sm font-bold text-slate-600 uppercase mb-3 flex items-center gap-2">
                      <BookOpen size={16} /> LMS & Competency
                    </h4>
                    <div className="flex flex-wrap gap-4">
                      <div className="bg-blue-50 px-4 py-2 rounded-lg">
                        <p className="text-xs text-blue-700">Avg Grade</p>
                        <p className="font-bold text-blue-900">{detailLmsSummary.avg_grade != null ? detailLmsSummary.avg_grade.toFixed(1) : "—"}</p>
                      </div>
                      <div className="bg-emerald-50 px-4 py-2 rounded-lg">
                        <p className="text-xs text-emerald-700">Training Status</p>
                        <p className="font-bold text-emerald-900">{detailLmsSummary.training_status || "—"}</p>
                      </div>
                    </div>
                  </section>
                )}

                {/* Financial Actions — Credit/Debit with audit */}
                {useBackendForUsers && canManageAccountActions && (
                  <section className="mb-6">
                    <h4 className="text-sm font-bold text-slate-600 uppercase mb-3 flex items-center gap-2">
                      <Wallet size={16} /> Financial Actions
                    </h4>
                    <p className="text-xs text-slate-500 mb-2">เติม/หักเงินด้วยเหตุผล (บันทึกใน payment_ledger_audit)</p>
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
                            <li className="text-slate-600">สาเหตุ: {selectedUser.ban_reason}</li>
                          )}
                          {selectedUser.banned_until && (
                            <li className="text-slate-600">
                              แบนถึง: {new Date(selectedUser.banned_until).toLocaleString()}
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
                        <li className="text-amber-600">วอลเล็ตถูกระงับ (Platform Safety)</li>
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
                {useBackendForUsers && selectedUser && (selectedUser.role === "provider" || selectedUser.role === "PROVIDER") && (
                  <section className="mb-6">
                    <h4 className="text-sm font-bold text-slate-600 uppercase mb-3">สถานะผู้รับงาน (Provider)</h4>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="px-3 py-1 rounded-full text-sm font-medium bg-slate-100 text-slate-700">
                        {selectedUser.provider_status === "VERIFIED_PROVIDER"
                          ? "Verified Provider — รับงานได้"
                          : selectedUser.provider_status === "PENDING_TEST"
                          ? "รอทำแบบทดสอบ"
                          : selectedUser.provider_status || "UNVERIFIED"}
                      </span>
                      {selectedUser.provider_status !== "VERIFIED_PROVIDER" &&
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
                      {selectedUser.provider_status !== "VERIFIED_PROVIDER" &&
                        !canManageAccountActions && (
                        <span className="text-sm text-slate-500">
                          อนุมัติผู้รับงานได้เฉพาะบัญชี Admin หรือ Super Admin
                        </span>
                      )}
                    </div>
                  </section>
                )}

                {/* App role (เปลี่ยนจากผู้รับงานเป็น user หรือกลับกัน) */}
                {useBackendForUsers && canManageAccountActions && selectedUser && (
                  <section className="mb-6">
                    <h4 className="text-sm font-bold text-slate-600 uppercase mb-3">สถานะในแอป (User / ผู้รับงาน)</h4>
                    <p className="text-sm text-slate-600 mb-2">ปัจจุบัน: {selectedUser.role === "provider" || selectedUser.role === "PROVIDER" ? "ผู้รับงาน (Provider)" : "ผู้ใช้ (User)"}</p>
                    <button
                      onClick={() => {
                        setAppRole(selectedUser.role === "provider" || selectedUser.role === "PROVIDER" ? "user" : "provider");
                        setShowAppRoleModal(true);
                      }}
                      disabled={processing}
                      className="px-4 py-2 bg-indigo-100 text-indigo-800 rounded-lg text-sm font-medium hover:bg-indigo-200"
                    >
                      เปลี่ยนเป็น {selectedUser.role === "provider" || selectedUser.role === "PROVIDER" ? "User" : "ผู้รับงาน (Provider)"}
                    </button>
                  </section>
                )}

                {/* VIP */}
                {useBackendForUsers && canManageAccountActions && selectedUser && (
                  <section className="mb-6">
                    <h4 className="text-sm font-bold text-slate-600 uppercase mb-3">VIP</h4>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!selectedUser.is_vip}
                        onChange={(e) => handleSetVip(e.target.checked)}
                        disabled={processing}
                        className="rounded border-slate-300"
                      />
                      <span className="text-sm font-medium">ผู้ใช้ VIP (สมัครเข้าระบบแบบ VIP)</span>
                    </label>
                  </section>
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
      )}

      {/* Modal ยืนยันเปลี่ยน App role (User / ผู้รับงาน) */}
      {showAppRoleModal && selectedUser && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h4 className="text-lg font-bold text-slate-900 mb-2">เปลี่ยนสถานะในแอป</h4>
            <p className="text-sm text-slate-600 mb-4">
              เปลี่ยน <strong>{selectedUser.name}</strong> เป็น{" "}
              {appRole === "provider" ? "ผู้รับงาน (Provider)" : "ผู้ใช้ (User)"} ใช่หรือไม่?
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
              <Wallet size={20} /> {walletAdjustDirection === "credit" ? "Credit" : "Debit"} Funds
            </h4>
            <p className="text-sm text-slate-600 mb-4">
              ผู้ใช้: <strong>{selectedUser.name}</strong> — ยอดปัจจุบัน: ฿{selectedUser.wallet_balance?.toLocaleString() ?? 0}
            </p>
            <div className="mb-4">
              <label className="block text-xs text-slate-500 mb-1">จำนวน (THB) *</label>
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
              <label className="block text-xs text-slate-500 mb-1">สาเหตุ (บังคับสำหรับ audit) *</label>
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
                  <label className="block text-xs text-slate-500 mb-1">reason_code * (เช่น DUPLICATE_CREDIT, WRONG_AMOUNT)</label>
                  <input
                    type="text"
                    value={walletAdjustReasonCode}
                    onChange={(e) => setWalletAdjustReasonCode(e.target.value)}
                    placeholder="รหัสสาเหตุมาตรฐาน"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono"
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-xs text-slate-500 mb-1">evidence_ref * (payment_ledger_audit.id ของรายการผิด)</label>
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
                    (!walletAdjustReasonCode.trim() || !walletAdjustEvidenceRef.trim()))
                }
                className={`flex-1 py-2 font-medium rounded-lg disabled:opacity-50 ${
                  walletAdjustDirection === "credit"
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : "bg-red-600 text-white hover:bg-red-700"
                }`}
              >
                {processing ? <Loader2 className="animate-spin mx-auto" size={18} /> : (walletAdjustDirection === "credit" ? "Credit" : "Debit")}
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
                <p className="text-white font-medium mb-2">{kycLightbox.label}</p>
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
    </div>
  );
};
