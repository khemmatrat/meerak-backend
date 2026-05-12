import React, { useState, useCallback, useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { DashboardView } from "./components/DashboardView";
import { MobileConfigView } from "./components/MobileConfigView";
import { CommunityChallengeView } from "./components/CommunityChallengeView";
import { UserTableView } from "./components/UserTableView";
import { UserManagementView } from "./components/UserManagementView";
import { PushNotificationView } from "./components/PushNotificationView";
import { EmailBroadcastView } from "./components/EmailBroadcastView";
import { ContentManagerView } from "./components/ContentManagerView";
import { SystemLogsView } from "./components/SystemLogsView";
import { SystemSettingsView } from "./components/SystemSettingsView";
import { JobOperationsView } from "./components/JobOperationsView";
import { ClusterHealthView } from "./components/ClusterHealthView";
import { DisasterRecoveryView } from "./components/DisasterRecoveryView";
import { DatabaseShardingView } from "./components/DatabaseShardingView";
import { FinancialAuditView } from "./components/FinancialAuditView";
import { ApiGatewayView } from "./components/ApiGatewayView";
import { BackgroundWorkerView } from "./components/BackgroundWorkerView";
import { SecurityCenterView } from "./components/SecurityCenterView";
import { SupportTicketView } from "./components/SupportTicketView";
import { ReportCenterView } from "./components/ReportCenterView";
import { ResourceScalingView } from "./components/ResourceScalingView";
import { DocumentationView } from "./components/DocumentationView";
import { IntegrationHelpView } from "./components/IntegrationHelpView";
import { LegalComplianceView } from "./components/LegalComplianceView";
import { UserPayoutView } from "./components/UserPayoutView";
import { PayoutReconciliationView } from "./components/PayoutReconciliationView";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { FinancialStrategyView } from "./components/FinancialStrategyView";
import { StaffManagementView } from "./components/StaffManagementView";
import { KycReviewView } from "./components/KycReviewView";
import { FinancialDashboardView } from "./components/FinancialDashboardView";
import { InsuranceManager } from "./components/InsuranceManager";
import { InsuranceClaimsView } from "./components/InsuranceClaimsView";
import { StabilityFundDashboardView } from "./components/StabilityFundDashboardView";
import { IncidentCommandView } from "./components/IncidentCommandView";
import { ReviewManagementView } from "./components/ReviewManagementView";
import { RevenueDashboard } from "./components/RevenueDashboard";
import { AuditLogsView } from "./components/AuditLogsView";
import { TrainingCenterView } from "./components/TrainingCenterView";
import { ReferralMonitorView } from "./components/ReferralMonitorView";
import { BrandAdviserApplicationsView } from "./components/BrandAdviserApplicationsView";
import { RescueNetView } from "./components/RescueNetView";
import { TestingCenterView } from "./components/TestingCenterView";
import { PaymentProviderGateView } from "./components/PaymentProviderGateView";
import { FarePricingConsoleView } from "./components/FarePricingConsoleView";
import { WalletLiquidityView } from "./components/WalletLiquidityView";
import { ManualDepositsView } from "./components/ManualDepositsView";
import { PersonalSettlementManualView } from "./components/PersonalSettlementManualView";
import { AqondGatewayConsoleView } from "./components/AqondGatewayConsoleView";
import { DirectorWelfareHubView } from "./components/DirectorWelfareHubView";
import { LoginView } from "./components/LoginView";
import { FinanceRuntimeSettingsView } from "./components/FinanceRuntimeSettingsView";
import { FinanceRuntimeProvider } from "./context/FinanceRuntimeContext";
import { CrisisAlertBanner } from "./components/CrisisAlertBanner";
import { Bell, Loader2, LogOut, Menu, Search } from "lucide-react";
import { MobileQuickActionsFab } from "./components/MobileQuickActionsFab";
import { AccessDeniedView } from "./components/AccessDeniedView";
import { AdminUser } from "./types";
import { canAccessAdminView } from "./constants/adminRouteAccess";
import {
  fetchAdminSession,
  getAdminToken,
  mapLoginUserToAdminUser,
  setAdminToken,
} from "./services/adminApi";

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState("dashboard");
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  /** When opening KYC Review from User Details, pre-open this user's KYC detail */
  const [kycReviewPreSelectUserId, setKycReviewPreSelectUserId] = useState<
    string | null
  >(null);
  /** เมื่อโดดจาก Audit Logs มาหน้า User Management ให้เปิด/โฟกัส user นี้ */
  const [userManagementFocusUserId, setUserManagementFocusUserId] = useState<
    string | null
  >(null);
  const clearUserManagementFocusUserId = useCallback(() => setUserManagementFocusUserId(null), []);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const onResize = () => {
      if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) {
        setMobileNavOpen(false);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = getAdminToken();
        if (!token) {
          if (!cancelled) setAuthReady(true);
          return;
        }
        const { user } = await fetchAdminSession();
        if (!cancelled) {
          setCurrentUser(mapLoginUserToAdminUser(user));
        }
      } catch {
        if (!cancelled) {
          setAdminToken(null);
          setCurrentUser(null);
        }
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-600" aria-hidden />
        <span className="sr-only">กำลังโหลดเซสชัน...</span>
      </div>
    );
  }

  // AUTH GUARD: If no user is logged in, show Login View
  if (!currentUser) {
    return <LoginView onLogin={setCurrentUser} />;
  }

  const handleLogout = () => {
    if (confirm("Are you sure you want to logout securely?")) {
      setAdminToken(null);
      setCurrentUser(null);
    }
  };

  const renderView = () => {
    if (!canAccessAdminView(currentView, currentUser.role, currentUser.permissions)) {
      return (
        <AccessDeniedView
          viewId={currentView}
          role={currentUser.role}
          onGoDashboard={() => setCurrentView("dashboard")}
        />
      );
    }
    switch (currentView) {
      case "dashboard":
        return <DashboardView />;
      case "users":
        return (
          <UserManagementView
            currentUserRole={currentUser.role}
            setView={setCurrentView}
            focusUserId={userManagementFocusUserId}
            onFocusUserIdConsumed={clearUserManagementFocusUserId}
            onOpenKycReview={(userId) => {
              setKycReviewPreSelectUserId(userId);
              setCurrentView("kyc-review");
            }}
          />
        );
      case "app-config":
        return <MobileConfigView />;
      case "community-challenge":
        return <CommunityChallengeView />;
      case "push-notifications":
        return <PushNotificationView />;
      case "email-broadcast":
        return <EmailBroadcastView />;
      case "testing-center":
        return <TestingCenterView currentUser={currentUser} />;
      case "content":
        return <ContentManagerView />;
      case "training-center":
        return <TrainingCenterView />;
      case "logs":
        return <SystemLogsView />;
      case "settings":
        return <SystemSettingsView />;
      case "job-ops":
        return <JobOperationsView />;
      case "cluster":
        return <ClusterHealthView />;
      case "resource-scaling":
        return <ResourceScalingView />;
      case "dr-center":
        return <DisasterRecoveryView />;
      case "sharding":
        return <DatabaseShardingView />;
      case "financial-audit":
        // PASS USER ROLE FOR STRICT SECURITY CHECK
        return <FinancialAuditView currentUserRole={currentUser.role} />;
      case "financial-dashboard":
        return <FinancialDashboardView />;
      case "payment-provider-gate":
        return <PaymentProviderGateView />;
      case "finance-runtime-settings":
        return <FinanceRuntimeSettingsView currentUserRole={currentUser.role} />;
      case "fare-pricing":
        return <FarePricingConsoleView />;
      case "wallet-liquidity":
        return <WalletLiquidityView />;
      case "manual-deposits":
        return <ManualDepositsView />;
      case "personal-settlement-manual":
        return (
          <PersonalSettlementManualView
            currentUserRole={currentUser.role}
            currentUserName={currentUser.name}
          />
        );
      case "aqond-gateway-console":
        return <AqondGatewayConsoleView />;
      case "insurance-manager":
        return (
          <div className="p-6 overflow-auto">
            <InsuranceManager />
          </div>
        );
      case "insurance-claims":
        return <InsuranceClaimsView />;
      case "stability-fund":
        return <StabilityFundDashboardView />;
      case "incident-command":
        return <IncidentCommandView />;
      case "review-management":
        return <ReviewManagementView />;
      case "revenue-dashboard":
        return <RevenueDashboard />;
      case "api-gateway":
        return <ApiGatewayView />;
      case "background-workers":
        return <BackgroundWorkerView />;
      case "security-center":
        return <SecurityCenterView />;
      case "support-center":
        return (
          <SupportTicketView
            onOpenUserInAdmin={(userId) => {
              setUserManagementFocusUserId(userId);
              setCurrentView("users");
            }}
          />
        );
      case "reports":
        return <ReportCenterView />;
      case "docs":
        return <DocumentationView />;
      case "integration-help":
        return <IntegrationHelpView />;
      case "legal-compliance":
        return <LegalComplianceView />;
      case "user-payouts":
        return (
          <ErrorBoundary>
            <UserPayoutView currentUserRole={currentUser.role} onNavigate={setCurrentView} />
          </ErrorBoundary>
        );
      case "payout-reconciliation":
        return (
          <ErrorBoundary>
            <PayoutReconciliationView />
          </ErrorBoundary>
        );
      case "referral-monitor":
        return <ReferralMonitorView />;
      case "brand-adviser-applications":
        return <BrandAdviserApplicationsView />;
      case "rescue-net":
        return <RescueNetView />;
      case "financial-strategy":
        return <FinancialStrategyView />;
      case "director-welfare":
        return <DirectorWelfareHubView />;
      case "staff-management":
        return <StaffManagementView />;
      case "kyc-review":
        return (
          <KycReviewView
            preSelectUserId={kycReviewPreSelectUserId}
            onClearPreSelect={() => setKycReviewPreSelectUserId(null)}
          />
        );
      case "audit-logs":
        return (
          <AuditLogsView
            currentUserRole={currentUser.role}
            setView={setCurrentView}
            onNavigateToEntity={(view, entityId) => {
              setCurrentView(view);
              if (view === "users") setUserManagementFocusUserId(entityId);
            }}
          />
        );
      default:
        return (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <h2 className="text-xl font-medium">Coming Soon</h2>
            <p>Module {currentView} is under development.</p>
          </div>
        );
    }
  };

  return (
    <FinanceRuntimeProvider>
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      {mobileNavOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-slate-900/50 md:hidden"
          aria-label="ปิดเมนู"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      {/* Sidebar — drawer on &lt; md */}
      <Sidebar
        currentView={currentView}
        setView={setCurrentView}
        currentUserRole={currentUser.role}
        currentUserPermissions={currentUser.permissions}
        mobileOpen={mobileNavOpen}
        onNavigate={() => setMobileNavOpen(false)}
      />

      {/* Main Content */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="z-20 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 shadow-sm sm:h-16 sm:px-6 md:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
            <button
              type="button"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 md:hidden"
              aria-expanded={mobileNavOpen}
              aria-controls="admin-sidebar"
              onClick={() => setMobileNavOpen((o) => !o)}
            >
              <Menu size={22} />
            </button>
            <div className="relative min-w-0 flex-1 md:max-w-md lg:max-w-xl">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={18}
              />
              <input
                type="search"
                placeholder="Search anything..."
                className="min-h-[44px] w-full rounded-lg border-none bg-slate-100 py-2.5 pl-10 pr-4 text-sm outline-none transition-all focus:bg-white focus:ring-2 focus:ring-indigo-500 sm:min-h-0 sm:py-2"
              />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-4 md:gap-6">
            <button
              type="button"
              className="relative flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-indigo-600"
            >
              <Bell size={20} />
              <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-rose-500"></span>
            </button>
            <div className="flex items-center gap-2 border-l border-slate-200 pl-2 sm:gap-3 sm:pl-6">
              <div className="hidden text-right md:block">
                <p className="text-sm font-semibold text-slate-800">
                  {currentUser.name}
                </p>
                <p className="text-xs text-slate-500">
                  {currentUser.role.replace(/_/g, " ")}
                </p>
              </div>
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                <img
                  src={currentUser.avatar}
                  alt="Profile"
                  className="h-full w-full object-cover"
                />
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                title="Logout"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </header>

        <CrisisAlertBanner />

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-auto p-4 pb-24 md:p-8 md:pb-8">
          <div className="mx-auto flex h-full max-w-7xl flex-col">
            <div className="mb-4 shrink-0 md:mb-6">
              <h1 className="text-xl font-bold capitalize text-slate-800 md:text-2xl">
                {currentView === "docs"
                  ? "System Manual"
                  : currentView === "integration-help"
                  ? "System Integration"
                  : currentView === "staff-management"
                  ? "Staff & Access"
                  : currentView === "kyc-review"
                  ? "KYC Review"
                  : currentView === "financial-dashboard"
                  ? "Financial Dashboard"
                  : currentView === "insurance-claims"
                  ? "Insurance Claims"
                  : currentView === "incident-command"
                  ? "Incident Command"
                  : currentView === "review-management"
                  ? "Review & Rating"
                  : currentView === "revenue-dashboard"
                  ? "Revenue Dashboard"
                  : currentView === "audit-logs"
                  ? "Audit Logs"
                  : currentView === "support-center"
                  ? "Support Admin"
                  : currentView === "rescue-net"
                  ? "Rescue Net (eSIM)"
                  : currentView === "director-welfare"
                  ? "สวัสดิการกรรมการ & เบิกค่าใช้จ่าย"
                  : currentView === "personal-settlement-manual"
                  ? "บัญชีรับชั่วคราว (ก่อน Gateway)"
                  : currentView === "finance-runtime-settings"
                  ? "การเงินเรียลไทม์ & เกตเวย์สำรอง"
                  : currentView.replace(/-/g, " ")}
              </h1>
              <p className="text-slate-500">
                {currentView === "rescue-net"
                  ? "ยอดขายแพ็กเกจ eSIM / digital goods (GigaStore) และรายการล่าสุด"
                  : currentView === "director-welfare"
                  ? "ร่างระเบียบสวัสดิการ ระบบเบิกค่าใช้จ่าย (Reason Tag) และคำอธิบาย Settlement Report"
                  : currentView === "personal-settlement-manual"
                  ? "รับ-จ่ายผ่านบัญชีส่วนบุคคลช่วงรอ Payment Gateway — QR / Mobile banking + บันทึกกระทบยอด"
                  : currentView === "finance-runtime-settings"
                  ? "ปิดบัญชีรับชั่วคราวและตั้งค่าเกตเวย์สำรอง (2C2P / GB Prime Pay) — เก็บใน DB ไม่ต้อง build ใหม่"
                  : `Overview and management for ${currentView}`}
              </p>
            </div>

            <div className="flex-1">{renderView()}</div>
          </div>
        </div>
      </main>

      <MobileQuickActionsFab currentUserRole={currentUser.role} setView={setCurrentView} />
    </div>
    </FinanceRuntimeProvider>
  );
};

export default App;
