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
import { AntiBypassRulesView } from "./components/AntiBypassRulesView";
import { SupportTicketView } from "./components/SupportTicketView";
import { SupportCasesAdminView } from "./components/SupportCasesAdminView";
import { PartnerApiAdminView } from "./components/PartnerApiAdminView";
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
import CompassQueueView from "./components/CompassQueueView";
import { FinancialDashboardView } from "./components/FinancialDashboardView";
import { InsuranceManager } from "./components/InsuranceManager";
import { InsuranceClaimsView } from "./components/InsuranceClaimsView";
import { StabilityFundDashboardView } from "./components/StabilityFundDashboardView";
import { IncidentCommandView } from "./components/IncidentCommandView";
import { ReviewManagementView } from "./components/ReviewManagementView";
import { RevenueDashboard } from "./components/RevenueDashboard";
import { MarketplaceCommissionView } from "./components/MarketplaceCommissionView";
import { AuditLogsView } from "./components/AuditLogsView";
import { TrainingCenterView } from "./components/TrainingCenterView";
import { CourseMarketplaceAdminView } from "./components/CourseMarketplaceAdminView";
import { ReferralMonitorView } from "./components/ReferralMonitorView";
import { BrandAdviserApplicationsView } from "./components/BrandAdviserApplicationsView";
import { RescueNetView } from "./components/RescueNetView";
import { TestingCenterView } from "./components/TestingCenterView";
import { ProcurementComplianceView } from "./components/ProcurementComplianceView";
import { AdsOpsView } from "./components/AdsOpsView";
import { AdsSummaryDashboardView } from "./components/AdsSummaryDashboardView";
import GrowthConversionFunnelView from "./components/GrowthConversionFunnelView";
import { FtxDashboardView } from "./components/FtxDashboardView";
import { PaymentProviderGateView } from "./components/PaymentProviderGateView";
import { FarePricingConsoleView } from "./components/FarePricingConsoleView";
import { WalletLiquidityView } from "./components/WalletLiquidityView";
import { ManualDepositsView } from "./components/ManualDepositsView";
import { PrbOrdersView } from "./components/PrbOrdersView";
import { GoldLottoView } from "./components/GoldLottoView";
import { BeautyBookingsView } from "./components/BeautyBookingsView";
import { FoodMerchantOsView } from "./components/FoodMerchantOsView";
import { PersonalSettlementManualView } from "./components/PersonalSettlementManualView";
import { AqondGatewayConsoleView } from "./components/AqondGatewayConsoleView";
import { DirectorWelfareHubView } from "./components/DirectorWelfareHubView";
import { LoginView } from "./components/LoginView";
import { FinanceRuntimeSettingsView } from "./components/FinanceRuntimeSettingsView";
import { TaxIdentityView } from "./components/TaxIdentityView";
import { ProviderWhtReviewView } from "./components/ProviderWhtReviewView";
import { TaxMonthlyPackView } from "./components/TaxMonthlyPackView";
import { EtaxReadinessView } from "./components/EtaxReadinessView";
import { FinanceRuntimeProvider } from "./context/FinanceRuntimeContext";
import { CrisisAlertBanner } from "./components/CrisisAlertBanner";
import { AdminLiveAlertBanner } from "./components/AdminLiveAlertBanner";
import { useAdminLiveEvents } from "./hooks/useAdminLiveEvents";
import { Bell, Loader2, LogOut, Menu, Search, VolumeX } from "lucide-react";
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
  const [manualDepositsFocus, setManualDepositsFocus] = useState<{
    userId: string;
    gatewayStatus?: "pending" | "all" | "success" | "failed";
  } | null>(null);
  const [userPayoutsFocus, setUserPayoutsFocus] = useState<{
    userId: string;
    status?: "all" | "pending" | "approved" | "rejected";
  } | null>(null);
  const [jobOpsFocusJobId, setJobOpsFocusJobId] = useState<string | null>(null);
  const [supportCaseFocusId, setSupportCaseFocusId] = useState<string | null>(
    null,
  );
  const clearUserManagementFocusUserId = useCallback(
    () => setUserManagementFocusUserId(null),
    [],
  );
  const clearManualDepositsFocus = useCallback(
    () => setManualDepositsFocus(null),
    [],
  );
  const clearUserPayoutsFocus = useCallback(
    () => setUserPayoutsFocus(null),
    [],
  );
  const clearJobOpsFocus = useCallback(() => setJobOpsFocusJobId(null), []);
  const clearSupportCaseFocus = useCallback(
    () => setSupportCaseFocusId(null),
    [],
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [alertPanelOpen, setAlertPanelOpen] = useState(false);
  const liveAlerts = useAdminLiveEvents(!!currentUser);

  useEffect(() => {
    const onResize = () => {
      if (
        typeof window !== "undefined" &&
        window.matchMedia("(min-width: 768px)").matches
      ) {
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

  useEffect(() => {
    if (!authReady || !currentUser) return;
    const sp = new URLSearchParams(window.location.search);
    const view = sp.get("view");
    const caseId = sp.get("caseId");
    const focusUserId = sp.get("focusUserId");
    if (view && canAccessAdminView(view, currentUser.role, currentUser.permissions)) {
      setCurrentView(view);
    }
    if (focusUserId) setUserManagementFocusUserId(focusUserId);
    if (caseId) setSupportCaseFocusId(caseId);
  }, [authReady, currentUser]);

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2
          className="h-10 w-10 animate-spin text-indigo-600"
          aria-hidden
        />
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
    if (
      !canAccessAdminView(
        currentView,
        currentUser.role,
        currentUser.permissions,
      )
    ) {
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
            onOpenPendingDeposits={(userId) => {
              setManualDepositsFocus({ userId, gatewayStatus: "pending" });
              setCurrentView("manual-deposits");
            }}
            onOpenPendingWithdrawals={(userId) => {
              setUserPayoutsFocus({ userId, status: "pending" });
              setCurrentView("user-payouts");
            }}
            onOpenJobOps={(jobId) => {
              setJobOpsFocusJobId(jobId);
              setCurrentView("job-ops");
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
      case "ads-ops":
        return <AdsOpsView />;
      case "ads-summary":
        return (
          <ErrorBoundary>
            <AdsSummaryDashboardView />
          </ErrorBoundary>
        );
      case "growth-funnel":
        return (
          <ErrorBoundary>
            <GrowthConversionFunnelView />
          </ErrorBoundary>
        );
      case "ftx-dashboard":
        return (
          <ErrorBoundary>
            <FtxDashboardView />
          </ErrorBoundary>
        );
      case "training-center":
        return <TrainingCenterView />;
      case "course-marketplace":
        return <CourseMarketplaceAdminView />;
      case "logs":
        return <SystemLogsView />;
      case "settings":
        return <SystemSettingsView />;
      case "job-ops":
        return (
          <JobOperationsView
            focusJobId={jobOpsFocusJobId}
            onFocusConsumed={clearJobOpsFocus}
          />
        );
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
      case "procurement-compliance":
        return <ProcurementComplianceView />;
      case "financial-dashboard":
        return <FinancialDashboardView />;
      case "payment-provider-gate":
        return <PaymentProviderGateView />;
      case "finance-runtime-settings":
        return (
          <FinanceRuntimeSettingsView currentUserRole={currentUser.role} />
        );
      case "tax-identity":
        return <TaxIdentityView currentUserRole={currentUser.role} />;
      case "provider-wht-review":
        return <ProviderWhtReviewView />;
      case "tax-monthly-pack":
        return <TaxMonthlyPackView />;
      case "etax-readiness":
        return <EtaxReadinessView />;
      case "fare-pricing":
        return <FarePricingConsoleView />;
      case "wallet-liquidity":
        return <WalletLiquidityView />;
      case "manual-deposits":
        return (
          <ManualDepositsView
            initialUserId={manualDepositsFocus?.userId ?? null}
            initialGatewayStatus={
              manualDepositsFocus?.gatewayStatus ?? "pending"
            }
            onInitialFocusConsumed={clearManualDepositsFocus}
          />
        );
      case "prb-orders":
        return <PrbOrdersView />;
      case "gold-lotto":
        return (
          <GoldLottoView
            onOpenKycReview={(userId) => {
              setKycReviewPreSelectUserId(userId);
              setCurrentView("kyc-review");
            }}
            onOpenUser={(userId) => {
              setUserManagementFocusUserId(userId);
              setCurrentView("users");
            }}
          />
        );
      case "beauty-bookings":
        return (
          <BeautyBookingsView
            onOpenUser={(userId) => {
              setUserManagementFocusUserId(userId);
              setCurrentView("users");
            }}
          />
        );
      case "food-merchant-os":
        return (
          <ErrorBoundary>
            <FoodMerchantOsView
              onOpenUser={(userId) => {
                setUserManagementFocusUserId(userId);
                setCurrentView("users");
              }}
            />
          </ErrorBoundary>
        );
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
      case "marketplace-commission":
        return <MarketplaceCommissionView />;
      case "api-gateway":
        return <ApiGatewayView />;
      case "background-workers":
        return <BackgroundWorkerView />;
      case "security-center":
        return <SecurityCenterView />;
      case "anti-bypass":
        return <AntiBypassRulesView currentUserRole={currentUser.role} />;
      case "support-center":
        return (
          <SupportTicketView
            currentUser={currentUser}
            onOpenUserInAdmin={(userId) => {
              setUserManagementFocusUserId(userId);
              setCurrentView("users");
            }}
          />
        );
      case "support-cases":
        return (
          <SupportCasesAdminView
            initialCaseId={supportCaseFocusId}
            onInitialCaseConsumed={clearSupportCaseFocus}
            onOpenUser={(userId) => {
              setUserManagementFocusUserId(userId);
              setCurrentView("users");
            }}
          />
        );
      case "partner-api":
        return <PartnerApiAdminView />;
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
            <UserPayoutView
              currentUserRole={currentUser.role}
              onNavigate={setCurrentView}
              initialUserId={userPayoutsFocus?.userId ?? null}
              initialStatus={userPayoutsFocus?.status ?? "pending"}
              onInitialFocusConsumed={clearUserPayoutsFocus}
            />
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
      case "compass-queue":
        return <CompassQueueView />;
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
                title={
                  liveAlerts.soundReady
                    ? "แจ้งเตือน VIP / KYC / Security"
                    : "คลิกเพื่อเปิดเสียงแจ้งเตือน"
                }
                onClick={() => {
                  liveAlerts.unlockSound();
                  setAlertPanelOpen((o) => !o);
                  liveAlerts.clearUnread();
                }}
                className="relative flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-indigo-600"
              >
                {liveAlerts.soundReady ? (
                  <Bell size={20} />
                ) : (
                  <VolumeX size={20} className="text-amber-600" />
                )}
                {liveAlerts.unreadCount > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                    {liveAlerts.unreadCount > 9 ? "9+" : liveAlerts.unreadCount}
                  </span>
                )}
                {liveAlerts.highRiskUnreadCount > 0 && (
                  <span className="absolute left-1 top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-700 px-1 text-[10px] font-bold text-white">
                    {liveAlerts.highRiskUnreadCount > 9
                      ? "9+"
                      : liveAlerts.highRiskUnreadCount}
                  </span>
                )}
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

          <AdminLiveAlertBanner
            lastAlert={liveAlerts.lastAlert}
            soundReady={liveAlerts.soundReady}
            onUnlockSound={liveAlerts.unlockSound}
            onOpenUser={(uid) => {
              setUserManagementFocusUserId(uid);
              setCurrentView("users");
            }}
            onOpenKyc={() => setCurrentView("kyc-review")}
          />

          {alertPanelOpen && (
            <div className="fixed top-14 right-3 z-40 w-[min(100vw-1.5rem,22rem)] rounded-xl border border-slate-200 bg-white shadow-xl">
              <div className="border-b border-slate-100 px-3 py-2 text-sm font-bold text-slate-800">
                แจ้งเตือนล่าสุด (VIP / KYC / Security)
              </div>
              <ul className="max-h-64 overflow-y-auto text-xs">
                {liveAlerts.recentAlerts.length === 0 ? (
                  <li className="px-3 py-4 text-center text-slate-400">
                    ยังไม่มีเหตุการณ์ใหม่ — ระบบจะมีเสียงเมื่อมี VIP, KYC
                    หรือ Security High-Risk event
                  </li>
                ) : (
                  liveAlerts.recentAlerts.map((a) => (
                    <li
                      key={a.id}
                      className="border-b border-slate-50 px-3 py-2"
                    >
                      <p className="font-semibold text-slate-800">{a.title}</p>
                      <p className="mt-0.5 text-slate-600">{a.message}</p>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}

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
                            : currentView === "procurement-compliance"
                              ? "Procurement Compliance"
                              : currentView === "insurance-claims"
                                ? "Insurance Claims"
                                : currentView === "incident-command"
                                  ? "Incident Command"
                                  : currentView === "review-management"
                                    ? "Review & Rating"
                                    : currentView === "revenue-dashboard"
                                      ? "Revenue Dashboard"
                                      : currentView === "marketplace-commission"
                                        ? "Marketplace Commission"
                                        : currentView === "ads-summary"
                                        ? "Ads Summary"
                                        : currentView === "growth-funnel"
                                        ? "Growth Funnel (799)"
                                        : currentView === "ftx-dashboard"
                                          ? "AQOND FTX Dashboard"
                                          : currentView === "food-merchant-os"
                                          ? "Food Merchant OS"
                                          : currentView === "audit-logs"
                                            ? "Audit Logs"
                                        : currentView === "support-center"
                                          ? "Support Admin"
                                          : currentView === "rescue-net"
                                            ? "Rescue Net (eSIM)"
                                            : currentView === "director-welfare"
                                              ? "สวัสดิการกรรมการ & เบิกค่าใช้จ่าย"
                                              : currentView ===
                                                  "personal-settlement-manual"
                                                ? "บัญชีรับชั่วคราว (ก่อน Gateway)"
                                                : currentView ===
                                                    "finance-runtime-settings"
                                                  ? "การเงินเรียลไทม์ & เกตเวย์สำรอง"
                                                  : currentView ===
                                                      "tax-identity"
                                                    ? "Tax Identity & Invoice Setup"
                                                    : currentView ===
                                                        "provider-wht-review"
                                                      ? "Provider WHT Review"
                                                      : currentView ===
                                                          "tax-monthly-pack"
                                                        ? "Monthly Tax Pack"
                                                        : currentView ===
                                                            "etax-readiness"
                                                          ? "e-Tax Readiness"
                                                          : currentView.replace(
                                                              /-/g,
                                                              " ",
                                                            )}
                </h1>
                <p className="text-slate-500">
                  {currentView === "food-merchant-os"
                    ? "คอนโซลหลัก AQOND Food — ออเดอร์ · dispatch · ร้าน · ไรเดอร์ (break-glass อยู่ที่ /m/admin)"
                    : currentView === "rescue-net"
                      ? "ยอดขายแพ็กเกจ eSIM / digital goods (GigaStore) และรายการล่าสุด"
                    : currentView === "procurement-compliance"
                      ? "TOR/SOW snapshot, quotation revision chain, hash/timestamp, และ export ย้อนหลังสำหรับหน่วยงาน"
                      : currentView === "director-welfare"
                        ? "ร่างระเบียบสวัสดิการ ระบบเบิกค่าใช้จ่าย (Reason Tag) และคำอธิบาย Settlement Report"
                        : currentView === "personal-settlement-manual"
                          ? "รับ-จ่ายผ่านบัญชีส่วนบุคคลช่วงรอ Payment Gateway — QR / Mobile banking + บันทึกกระทบยอด"
                          : currentView === "finance-runtime-settings"
                            ? "ปิดบัญชีรับชั่วคราวและตั้งค่าเกตเวย์สำรอง (2C2P / GB Prime Pay) — เก็บใน DB ไม่ต้อง build ใหม่"
                            : currentView === "tax-identity"
                              ? "ตัวตนภาษีบริษัท, Tax Profile ผู้ใช้, และข้อมูลตั้งต้นสำหรับใบกำกับภาษี"
                              : currentView === "provider-wht-review"
                                ? "ตรวจสอบ WHT 3% provider earnings, earning documents, และ certificate drafts"
                                : currentView === "tax-monthly-pack"
                                  ? "สร้างชุดรายงานภาษีรายเดือนพร้อม CSV และ reconciliation checksum"
                                  : currentView === "etax-readiness"
                                    ? "ตรวจความพร้อม e-Tax/e-Receipt แบบ dry-run และ export payload สำหรับ onboarding"
                                    : `Overview and management for ${currentView}`}
                </p>
              </div>

              <div className="flex-1">{renderView()}</div>
            </div>
          </div>
        </main>

        <MobileQuickActionsFab
          currentUserRole={currentUser.role}
          setView={setCurrentView}
        />
      </div>
    </FinanceRuntimeProvider>
  );
};

export default App;
