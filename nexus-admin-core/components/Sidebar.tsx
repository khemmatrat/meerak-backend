import React from "react";
import {
  LayoutDashboard,
  Users,
  Settings,
  Activity,
  Smartphone,
  Bell,
  Image,
  Briefcase,
  Network,
  Database,
  ShieldAlert,
  ShieldCheck,
  Router,
  Cpu,
  Lock,
  LifeBuoy,
  Key,
  ListChecks,
  FileText,
  TrendingUp,
  BookOpen,
  Code,
  Scale,
  Banknote,
  Landmark,
  UserCog,
  FileCheck,
  Wallet,
  ScrollText,
  Shield,
  GraduationCap,
  Star,
  AlertTriangle,
  Gift,
  Radio,
  Volume2,
  CreditCard,
  ClipboardList,
  QrCode,
  Route,
  Award,
  Trophy,
  SlidersHorizontal,
  Mail,
  ReceiptText,
  Filter,
  Megaphone,
  ShoppingBag,
  Scissors,
  UtensilsCrossed,
  Compass,
  Sparkles,
} from "lucide-react";
import { useFinanceRuntime } from "../context/FinanceRuntimeContext";
import { canAccessAdminView } from "../constants/adminRouteAccess";

interface SidebarProps {
  currentView: string;
  setView: (view: string) => void;
  /** Audit Logs — ADMIN / SUPER_ADMIN / AUDITOR */
  currentUserRole?: string;
  currentUserPermissions?: string[];
  /** Drawer open state — mobile &lt; md only */
  mobileOpen?: boolean;
  /** หลังเลือกเมนูบนมือถือ */
  onNavigate?: () => void;
}

/** เมนูบัญชีชั่วคราว: ฝ่ายการเงิน / ผู้บริหารระบบ / ผู้ตรวจสอบ — ไม่แสดงให้ SUPPORT / DEVELOPER */
function canSeePersonalSettlementMenu(role: string | undefined): boolean {
  const r = (role || "").toUpperCase();
  return (
    r === "SUPER_ADMIN" ||
    r === "ACCOUNTANT" ||
    r === "ADMIN" ||
    r === "AUDITOR"
  );
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  setView,
  currentUserRole,
  currentUserPermissions,
  mobileOpen,
  onNavigate,
}) => {
  const { config: financeRuntime } = useFinanceRuntime();
  const personalSettlementMenuOn =
    financeRuntime?.personal_settlement_manual_enabled !== false;
  const r = (currentUserRole || "").toUpperCase();
  const showAuditLogs = r === "ADMIN" || r === "SUPER_ADMIN" || r === "AUDITOR";
  const menuItems = [
    { id: "dashboard", label: "ภาพรวมระบบ", icon: LayoutDashboard },
    { type: "header", label: "Security & Integrity" },
    { id: "security-center", label: "Security Center", icon: Lock },
    { id: "anti-bypass", label: "Anti-Bypass Rules", icon: Filter },
    { id: "financial-audit", label: "Financial & Fraud", icon: ShieldCheck },
    {
      id: "procurement-compliance",
      label: "Procurement Compliance",
      icon: FileCheck,
    },
    { id: "financial-dashboard", label: "Financial Dashboard", icon: Wallet },
    { id: "tax-identity", label: "Tax Identity & Invoice", icon: ReceiptText },
    {
      id: "provider-wht-review",
      label: "Provider WHT Review",
      icon: ReceiptText,
    },
    { id: "tax-monthly-pack", label: "Monthly Tax Pack", icon: FileText },
    { id: "etax-readiness", label: "e-Tax Readiness", icon: FileCheck },
    {
      id: "payment-provider-gate",
      label: "Payment Gateway (Payso/Ksher)",
      icon: CreditCard,
    },
    {
      id: "finance-runtime-settings",
      label: "การเงินเรียลไทม์ & เกตเวย์สำรอง",
      icon: SlidersHorizontal,
    },
    { id: "fare-pricing", label: "Fare / Distance Pricing", icon: Route },
    {
      id: "wallet-liquidity",
      label: "Wallet Liquidity (Cash vs Credit)",
      icon: Landmark,
    },
    { id: "manual-deposits", label: "เติมเงินสลิป (รอตรวจ)", icon: Banknote },
    {
      id: "personal-settlement-manual",
      label: "บัญชีรับชั่วคราว (Manual)",
      icon: QrCode,
    },
    {
      id: "aqond-gateway-console",
      label: "AQOND Gateway Console",
      icon: Network,
    },
    {
      id: "insurance-manager",
      label: "จัดการประกันงาน (Insurance)",
      icon: Shield,
    },
    { id: "insurance-claims", label: "Insurance Claims", icon: ShieldCheck },
    { id: "prb-orders", label: "PRB Orders (FairDee)", icon: Shield },
    { id: "gold-lotto", label: "Gold Lotto / จับฉลากทอง", icon: Trophy },
    {
      id: "beauty-bookings",
      label: "Beauty Bookings / จองช่าง",
      icon: Scissors,
    },
    {
      id: "food-merchant-os",
      label: "Food Merchant OS",
      icon: UtensilsCrossed,
    },
    { id: "stability-fund", label: "Stability Fund Dashboard", icon: Shield },
    { id: "kyc-review", label: "KYC Review", icon: FileCheck },
    { id: "compass-queue", label: "Compass Queue", icon: Compass },
    { id: "audit-logs", label: "Audit Logs", icon: ScrollText },
    { id: "legal-compliance", label: "Legal & Compliance", icon: Scale },
    { id: "api-gateway", label: "API Gateway & WAF", icon: Router },
    { type: "header", label: "Operations" },
    { id: "job-ops", label: "Job Operations", icon: Briefcase },
    { id: "incident-command", label: "Incident Command", icon: AlertTriangle },
    { id: "user-payouts", label: "User Payout Requests", icon: Banknote },
    {
      id: "payout-reconciliation",
      label: "Reconciliation Overview",
      icon: ClipboardList,
    },
    { id: "referral-monitor", label: "Referral Monitor", icon: Gift },
    {
      id: "brand-adviser-applications",
      label: "Brand Adviser (ใบสมัคร)",
      icon: Award,
    },
    { id: "rescue-net", label: "Rescue Net (eSIM)", icon: Radio },
    { id: "background-workers", label: "Worker Queues", icon: Cpu },
    { id: "users", label: "User Management", icon: Users },
    { id: "staff-management", label: "Staff & Access", icon: UserCog }, // NEW
    { type: "header", label: "Strategy & Growth" },
    { id: "revenue-dashboard", label: "Revenue Dashboard", icon: TrendingUp },
    {
      id: "marketplace-commission",
      label: "Marketplace Commission",
      icon: ShoppingBag,
    },
    { id: "ads-summary", label: "Ads Summary", icon: Megaphone },
    { id: "growth-funnel", label: "Growth Funnel (799)", icon: TrendingUp },
    { id: "ftx-dashboard", label: "AQOND FTX", icon: Sparkles },
    { id: "financial-strategy", label: "Financial Strategy", icon: Landmark },
    {
      id: "director-welfare",
      label: "สวัสดิการกรรมการ & เบิกค่าใช้จ่าย",
      icon: ClipboardList,
    },
    { id: "reports", label: "Reports & Export", icon: FileText },
    { id: "partner-api", label: "Partner API", icon: Key },
    { type: "header", label: "Customer Service" },
    { id: "review-management", label: "Review & Rating", icon: Star },
    { id: "support-center", label: "Support Admin", icon: LifeBuoy },
    { id: "support-cases", label: "Support Cases (MRK)", icon: ListChecks },
    { type: "header", label: "Infrastructure" },
    { id: "cluster", label: "Cluster Health", icon: Network },
    { id: "resource-scaling", label: "Resource & Cost", icon: TrendingUp },
    { id: "sharding", label: "Database Shards", icon: Database },
    { id: "dr-center", label: "Disaster Recovery", icon: ShieldAlert },
    { type: "header", label: "Training Center" },
    { id: "training-center", label: "ข้อสอบ & คะแนน", icon: GraduationCap },
    { id: "course-marketplace", label: "Course Marketplace", icon: BookOpen },
    { type: "header", label: "App Management" },
    { id: "testing-center", label: "Testing Center", icon: Volume2 },
    { id: "push-notifications", label: "Push Notifications", icon: Bell },
    { id: "email-broadcast", label: "Email ถึงผู้ใช้", icon: Mail },
    { id: "content", label: "Content Manager", icon: Image },
    { id: "ads-ops", label: "Ads Ops (Video/Story)", icon: Megaphone },
    { id: "app-config", label: "ตั้งค่า Mobile App", icon: Smartphone },
    {
      id: "community-challenge",
      label: "Community Challenge (Home)",
      icon: Trophy,
    },
    { type: "footer", label: "System" },
    { id: "logs", label: "System Logs", icon: Activity },
    { id: "settings", label: "ตั้งค่าระบบ", icon: Settings },
    { id: "docs", label: "คู่มือการใช้งาน", icon: BookOpen },
    { id: "integration-help", label: "System Integration", icon: Code },
  ];

  const handleSelect = (id: string) => {
    setView(id);
    onNavigate?.();
  };

  return (
    <aside
      id="admin-sidebar"
      className={`
        w-64 max-w-[min(100vw-2.5rem,16rem)] bg-slate-900 text-white flex flex-col h-full shadow-xl
        fixed inset-y-0 left-0 z-40 transition-transform duration-200 ease-out
        md:static md:z-auto md:translate-x-0 md:max-w-none
        ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
      `}
    >
      <div className="p-6 border-b border-slate-800 flex items-center gap-3">
        <img src="/logo.png" alt="Aqond" className="w-10 h-10 object-contain" />
        <div>
          <h1 className="text-xl font-bold tracking-tight">Aqond Admin</h1>
          <p className="text-xs text-slate-400">Backend Control V2.4</p>
        </div>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {menuItems.map((item, idx) => {
          if (item.type === "header") {
            return (
              <div
                key={`h-${idx}`}
                className="px-4 pt-4 pb-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider"
              >
                {item.label}
              </div>
            );
          }
          if (item.type === "footer") {
            return (
              <div
                key={`f-${idx}`}
                className="my-2 border-t border-slate-800"
              ></div>
            );
          }

          if (item.id === "audit-logs" && !showAuditLogs) return null;
          if (
            item.id === "personal-settlement-manual" &&
            (!canSeePersonalSettlementMenu(currentUserRole) ||
              !personalSettlementMenuOn)
          )
            return null;
          if (
            item.id &&
            !canAccessAdminView(
              item.id,
              currentUserRole,
              currentUserPermissions,
            )
          )
            return null;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item.id!)}
              className={`w-full flex items-center gap-3 px-4 py-3 md:py-2.5 min-h-[44px] rounded-lg transition-all duration-200 group ${
                isActive
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/20"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              {item.icon && (
                <item.icon
                  size={18}
                  className={
                    isActive
                      ? "text-indigo-200"
                      : "text-slate-500 group-hover:text-white"
                  }
                />
              )}
              <span className="font-medium text-sm">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <div className="bg-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-400 mb-2">สถานะเซิร์ฟเวอร์</p>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-sm font-semibold text-emerald-400">
              Operational
            </span>
          </div>
          <div className="text-xs text-slate-500">Protection: High</div>
        </div>
      </div>
    </aside>
  );
};
