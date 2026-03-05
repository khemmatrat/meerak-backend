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
  Activity,
  ChevronLeft,
  ChevronRight,
  FileCheck,
  ScrollText,
  AlertTriangle,
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
  forceLogoutAdminUser,
  updateAdminUserAppRole,
  approveUserAsProvider,
  setUserVip,
} from "../services/adminApi";
import type { AdminUserRow, AdminUserLedgerEntry } from "../services/adminApi";
import type { AuditLogRow } from "../services/adminApi";
import { MobileUser } from "../types";

type BackendRole = "USER" | "ADMIN" | "AUDITOR";
const PAGE_SIZE = 20;

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
  const isAdmin = currentUserRole === "ADMIN";
  const isAuditor = currentUserRole === "AUDITOR";

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
    ]
  );

  useEffect(() => {
    fetchUsers(page);
  }, [page, roleFilter, statusFilter, kycFilter, vipFilter, dataSource]);

  /** เปิด User Detail modal จาก userId (ใช้เมื่อโฟกัสจาก Audit Logs) */
  const openUserDetailById = useCallback(
    async (userId: string) => {
      setDetailLoading(true);
      setDetailLedger([]);
      setDetailLedgerTotals({ total_credit: 0, total_debit: 0 });
      setDetailAudit([]);
      try {
        const [res, ledgerRes, auditRes] = await Promise.all([
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
        });
        setDetailLedger(ledgerRes.entries || []);
        setDetailLedgerTotals({
          total_credit: ledgerRes.total_credit ?? 0,
          total_debit: ledgerRes.total_debit ?? 0,
        });
        setDetailAudit((auditRes as { logs: AuditLogRow[] }).logs || []);
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
    try {
      if (useBackendForUsers) {
        const [res, ledgerRes, auditRes] = await Promise.all([
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
        });
        setDetailLedger(ledgerRes.entries || []);
        setDetailLedgerTotals({
          total_credit: ledgerRes.total_credit ?? 0,
          total_debit: ledgerRes.total_debit ?? 0,
        });
        setDetailAudit((auditRes as { logs: AuditLogRow[] }).logs || []);
      } else {
        const details = await DataService.getUserDetails(user.id);
        setSelectedUser(details);
      }
      setShowDetailsModal(true);
    } catch (error: any) {
      alert(`❌ Failed to load user details: ${error?.message || error}`);
    }
    setDetailLoading(false);
  };

  const handleSuspend = async () => {
    if (!selectedUser || !useBackendForUsers || !isAdmin) return;
    const reason = actionReason.trim() || "Suspended by admin";
    if (!confirm(`Suspend user ${selectedUser.name}?\nReason: ${reason}`))
      return;
    setProcessing(true);
    try {
      await suspendAdminUser(selectedUser.id, reason);
      setShowDetailsModal(false);
      fetchUsers(page);
    } catch (e: any) {
      alert(e?.message || "Failed to suspend");
    }
    setProcessing(false);
  };
  const handleBan = async () => {
    if (!selectedUser || !useBackendForUsers || !isAdmin) return;
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
      alert(e?.message || "Failed to ban");
    }
    setProcessing(false);
  };
  const handleApproveProvider = async () => {
    if (!selectedUser || !useBackendForUsers || !isAdmin) return;
    if (!confirm(`อนุญาติให้ ${selectedUser.name} เป็นผู้รับงาน (Verified Provider) ใช่หรือไม่?`)) return;
    setProcessing(true);
    try {
      await approveUserAsProvider(selectedUser.id);
      setSelectedUser((u: any) => (u ? { ...u, provider_status: "VERIFIED_PROVIDER", provider_verified_at: new Date().toISOString() } : u));
      showToast("ตั้งเป็น Verified Provider แล้ว", "success");
    } catch (e: any) {
      alert(e?.message || "Failed to approve provider");
    }
    setProcessing(false);
  };
  const handleChangeAppRole = async () => {
    if (!selectedUser || !useBackendForUsers || !isAdmin) return;
    setProcessing(true);
    try {
      await updateAdminUserAppRole(selectedUser.id, appRole);
      setSelectedUser((u: any) => (u ? { ...u, role: appRole } : u));
      setShowAppRoleModal(false);
      showToast(`เปลี่ยนสถานะเป็น ${appRole === "provider" ? "ผู้รับงาน" : "ผู้ใช้"} แล้ว`, "success");
    } catch (e: any) {
      alert(e?.message || "Failed to change app role");
    }
    setProcessing(false);
  };
  const handleSetVip = async (isVip: boolean) => {
    if (!selectedUser || !useBackendForUsers || !isAdmin) return;
    setProcessing(true);
    try {
      await setUserVip(selectedUser.id, isVip);
      setSelectedUser((u: any) => (u ? { ...u, is_vip: isVip } : u));
      showToast(isVip ? "ตั้งเป็น VIP แล้ว" : "ยกเลิก VIP แล้ว", "success");
    } catch (e: any) {
      alert(e?.message || "Failed to update VIP");
    }
    setProcessing(false);
  };
  const handleReactivate = async () => {
    if (!selectedUser || !useBackendForUsers || !isAdmin) return;
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
      alert(e?.message || "Failed to reactivate");
    }
    setProcessing(false);
  };
  const handleForceLogout = async () => {
    if (!selectedUser || !useBackendForUsers || !isAdmin) return;
    const reason = actionReason.trim() || "Force logout by admin";
    if (!confirm(`Force logout user ${selectedUser.name}?\nReason: ${reason}`))
      return;
    setProcessing(true);
    try {
      await forceLogoutAdminUser(selectedUser.id, reason);
      alert(
        "Audit logged. Invalidate tokens in your auth layer if applicable."
      );
    } catch (e: any) {
      alert(e?.message || "Failed");
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
                                user as MobileUser
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

                {/* Wallet summary (read-only) */}
                <section className="mb-6">
                  <h4 className="text-sm font-bold text-slate-600 uppercase mb-3 flex items-center gap-2">
                    <Wallet size={16} /> Wallet
                  </h4>
                  <div className="bg-emerald-50 p-4 rounded-lg mb-3">
                    <p className="text-xs text-emerald-700">Balance</p>
                    <p className="font-bold text-2xl text-emerald-900">
                      ฿{selectedUser.wallet_balance?.toLocaleString() ?? 0}{" "}
                      <span className="text-sm font-normal text-slate-600">
                        {selectedUser.currency || "THB"}
                      </span>
                    </p>
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
                </section>

                {/* Risk flags */}
                {(selectedUser.account_status === "banned" ||
                  selectedUser.account_status === "suspended" ||
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

                {/* Provider status + Approve as Provider (แก้บั๊กที่ทำแบบทดสอบผ่านแต่สถานะไม่ขึ้น) */}
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
                      {selectedUser.provider_status !== "VERIFIED_PROVIDER" && (
                        <button
                          onClick={handleApproveProvider}
                          disabled={processing}
                          className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                        >
                          อนุญาติให้เป็นผู้รับงาน (ผ่านแบบทดสอบแล้วแต่ติดบั๊ก)
                        </button>
                      )}
                    </div>
                  </section>
                )}

                {/* App role (เปลี่ยนจากผู้รับงานเป็น user หรือกลับกัน) */}
                {useBackendForUsers && isAdmin && selectedUser && (
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
                {useBackendForUsers && isAdmin && selectedUser && (
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
                {useBackendForUsers && isAdmin && (
                  <section className="mb-6">
                    <h4 className="text-sm font-bold text-slate-600 uppercase mb-3">
                      Account control
                    </h4>
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
                  {useBackendForUsers && isAdmin && (
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
    </div>
  );
};
