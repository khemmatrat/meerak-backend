import React from "react";
import {
  HashRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useEffect, useRef } from "react";
import {
  MobileAppConfigProvider,
  useMobileAppConfig,
} from "./context/MobileAppConfigContext";
import { MaintenanceScreen } from "./components/MaintenanceScreen";
import { ForceUpdateScreen } from "./components/ForceUpdateScreen";
import { Capacitor } from "@capacitor/core";
import { isBelowMinVersion } from "./utils/semver";
import {
  SignupAllowed,
  PaymentsAllowed,
  JobPostingAllowed,
  ChatAllowed,
} from "./components/AppFeatureGates";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LanguageProvider } from "./context/LanguageContext";
import { ThemeProvider } from "./context/ThemeContext";
import {
  NotificationProvider,
  useNotification,
} from "./context/NotificationContext";
import { Layout } from "./components/Layout";
import { ComplianceModal } from "./components/ComplianceModal";
import { CookieConsentBanner } from "./components/CookieConsentBanner";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { ForgotPassword } from "./pages/ForgotPassword";
import { Home } from "./pages/Home";
import { MarketplaceEmbed } from "./pages/MarketplaceEmbed";
import { Jobs } from "./pages/Jobs";
import { CreateJob } from "./pages/CreateJob";
import { PartyVibePicker } from "./pages/PartyVibePicker";
import { WalletDashboard } from "./pages/WalletDashboard";
import { TechnicalSpecialistSelector } from "./pages/TechnicalSpecialistSelector";
import { CleaningSpecialistSelector } from "./pages/CleaningSpecialistSelector";
import { TransportHub } from "./pages/TransportHub";
import Booking from "./pages/Booking";
import { MarineHub } from "./pages/MarineHub";
import JobDetails from "./pages/JobDetails";
import { JobBoard } from "./pages/JobBoard";
import { JobDetailAdvance } from "./pages/JobDetailAdvance";
import { CreateJobAdvance } from "./pages/CreateJobAdvance";
import { ManageAdvanceJob } from "./pages/ManageAdvanceJob";
import { AdvanceJobChat } from "./pages/AdvanceJobChat";
import { MyBookings } from "./pages/MyBookings";
import { BookingChat } from "./pages/BookingChat";
import { Profile } from "./pages/Profile";
import { Payment } from "./pages/Payment";
import { MyJobs } from "./pages/MyJobs";
import { Talents } from "./pages/Talents";
import ExpertView from "./pages/ExpertView";
import BeautyBookingFlow from "./pages/BeautyBookingFlow";
import VideoFeed from "./pages/VideoFeed";
import SavedVideoClips from "./pages/SavedVideoClips";
import { StoryViewer } from "./pages/StoryViewer";
import { PostCreate } from "./pages/PostCreate";
import { PostSharingSettings } from "./pages/PostSharingSettings";
import { AdsMarketplace } from "./pages/AdsMarketplace";
import { AdsCampaignCreate } from "./pages/AdsCampaignCreate";
import { AdsCampaignDetail } from "./pages/AdsCampaignDetail";
import { AdsCampaignCompare } from "./pages/AdsCampaignCompare";
import type { TalentVideo } from "./services/videoService";
import { Settings } from "./pages/Settings";
import { WorkRoutingMatrix } from "./pages/WorkRoutingMatrix";
import { Verify } from "./pages/Verify";
import { Legal } from "./pages/Legal";
import { TermsPage } from "./pages/TermsPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { AccountDeletionPage } from "./pages/AccountDeletionPage";
import { PaymentMethodSelect } from "./pages/PaymentMethodSelect";
import { VIPSubscription } from "./pages/VIPSubscription";
import { Welcome } from "./pages/Welcome";
import { RescueNetLanding } from "./pages/RescueNetLanding";
import { DigitalVault } from "./pages/DigitalVault";
import { InternetPackagesPage } from "./pages/InternetPackagesPage";
import { TrainingProvider } from "./context/TrainingContext";
import { TutorialProvider } from "./context/TutorialContext";
import { TalentTutorialProvider } from "./context/TalentTutorialContext";
import KYCWizard from "./pages/KYCWizard"; // Phase 2: KYC Wizard
import OnboardingCompassSurvey from "./pages/OnboardingCompassSurvey";
import CompassMissionControl from "./pages/CompassMissionControl";
import CompassCategoryPack from "./pages/CompassCategoryPack";
import TalentAIResumeStudio from "./pages/TalentAIResumeStudio";
import IncubationDirector from "./pages/IncubationDirector";
import TalentPro799 from "./pages/TalentPro799";
import ClipOverlayEditor from "./pages/ClipOverlayEditor";
import { CompassBootRedirect } from "./components/CompassBootRedirect";
import { GrowthIntentBoot } from "./components/growth/GrowthIntentBoot";
import Reconciliation from "./pages/Reconciliation"; // Phase 3.5: Daily Reconciliation

// Admin: ใช้ nexus-admin-core (แยก app) — ไม่ใช้ pages/admin แล้ว
import TrainingDashboard from "./pages/TrainingDashboard";
import TrainingCoursePage from "./pages/TrainingCourse";
import TrainingQuizPage from "./pages/TrainingQuizPage";
import CourseMarketplace from "./pages/CourseMarketplace";
import CourseDetailMarketplace from "./pages/CourseDetailMarketplace";
import CourseLearn from "./pages/CourseLearn";
import CourseCertificateVerify from "./pages/CourseCertificateVerify";
import CourseStudio from "./pages/CourseStudio";
import CourseOrderReceipt from "./pages/CourseOrderReceipt";
import InstructorCourseSales from "./pages/InstructorCourseSales";
import AdminCoursePayouts from "./pages/AdminCoursePayouts";
import AdminCourseReview from "./pages/AdminCourseReview";
import AdminCourseAnalytics from "./pages/AdminCourseAnalytics";
import NexusExamModule2Select from "./pages/NexusExamModule2Select";
import NexusExamModule2Quiz from "./pages/NexusExamModule2Quiz";
import NexusExamModule3Page from "./pages/NexusExamModule3Page";
import CertificateOfReadiness from "./pages/CertificateOfReadiness";
import EmployerDashboard from "./components/EmployerDashboard";
import ProviderDashboard from "./components/ProviderDashboard";
import { Referral } from "./pages/Referral";
import { PrbFlow } from "./pages/PrbFlow";
import { GoldLottoHub } from "./pages/GoldLottoHub";
import { PrbOrderTrack } from "./pages/PrbOrderTrack";
import { PrbTrackHub } from "./pages/PrbTrackHub";
import { TutorialHub } from "./pages/TutorialHub";
import { UserRole } from "./types";
import { MockApi } from "./services/mockApi";
import { PushTokenRegistration } from "./components/PushTokenRegistration";
import { KycDeepLinkBridge } from "./components/KycDeepLinkBridge";
import { PrbDeepLinkBridge } from "./components/PrbDeepLinkBridge";
import { ReferralDeepLinkBridge } from "./components/ReferralDeepLinkBridge";
import { ProviderRerouteDeepLinkBridge } from "./components/ProviderRerouteDeepLinkBridge";
import { ReferralLinkGate } from "./pages/ReferralLinkGate.tsx";
import { listConnections } from "./services/connectionService";

const VideoFeedWrapper: React.FC = () => {
  const location = useLocation();
  const navState = location.state as {
    initialVideo?: TalentVideo;
    fromStoryUpload?: boolean;
  } | null;
  const initialVideo = navState?.initialVideo ?? null;
  const fromStoryUpload = navState?.fromStoryUpload === true;
  return (
    <VideoFeed initialVideo={initialVideo} fromStoryUpload={fromStoryUpload} />
  );
};

// ThemeProvider needs user from Auth — wrap inside AuthProvider
const ThemeProviderWrapper: React.FC<{ children?: React.ReactNode }> = ({
  children,
}) => {
  const { user } = useAuth();
  const [isCoach, setIsCoach] = React.useState(false);
  React.useEffect(() => {
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
  return (
    <ThemeProvider vipTier={user?.vip_tier} isCoach={isCoach}>
      {children}
    </ThemeProvider>
  );
};

// Protected Route Component
const ProtectedRoute = ({ children }: { children?: React.ReactNode }) => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const hasStoredSession =
    typeof window !== "undefined" &&
    !!localStorage.getItem("meerak_token") &&
    !!localStorage.getItem("meerak_user_id");

  if (!isAuthenticated && !hasStoredSession) {
    return <Navigate to="/welcome" state={{ from: location }} replace />;
  }

  return <Layout>{children}</Layout>;
};

// Public Route - redirects to home if already logged in
const PublicRoute = ({ children }: { children?: React.ReactNode }) => {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};
const RoleBasedDashboard = () => {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/welcome" replace />;
  }

  // ตรวจสอบ role และ redirect
  if (user.role === UserRole.PROVIDER) {
    return <ProviderDashboard />;
  } else {
    // สำหรับ USER, ADMIN หรือ role อื่นๆ
    return <EmployerDashboard />;
  }
};

/** แจ้งเตือนเมื่อถูก redirect จากฟีเจอร์ที่แอดมินปิด */
const FeatureDisabledNotifier: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { notify } = useNotification();
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    const fd = (location.state as { featureDisabled?: string })
      ?.featureDisabled;
    if (!fd) return;
    const key = `${location.pathname}:${fd}`;
    if (lastKey.current === key) return;
    lastKey.current = key;
    const messages: Record<string, string> = {
      signup: "การสมัครสมาชิกถูกปิดชั่วคราวโดยผู้ดูแลระบบ",
      payments: "การชำระเงินถูกปิดชั่วคราวโดยผู้ดูแลระบบ",
      job_posting: "การโพสต์งานถูกปิดชั่วคราวโดยผู้ดูแลระบบ",
      chat: "แชทถูกปิดชั่วคราวโดยผู้ดูแลระบบ",
    };
    notify(messages[fd] || "ฟีเจอร์นี้ถูกปิดชั่วคราว", "warning");
    navigate(
      {
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
      },
      { replace: true, state: {} },
    );
  }, [location, navigate, notify]);

  return null;
};

function AppMaintenanceGate({ children }: { children: React.ReactNode }) {
  const { config, loading } = useMobileAppConfig();
  if (!loading && config.featureFlags.maintenanceMode) {
    return <MaintenanceScreen message={config.welcomeMessage} />;
  }
  return <>{children}</>;
}

/** บังคับอัปเดตเมื่อเวอร์ชันแอปต่ำกว่า iosMinVersion / androidMinVersion (เฉพาะ native) */
function AppForceUpdateGate({ children }: { children: React.ReactNode }) {
  const { config, loading } = useMobileAppConfig();
  const appVersion = ((
    import.meta as unknown as { env?: { VITE_APP_VERSION?: string } }
  ).env?.VITE_APP_VERSION || "0.0.0") as string;
  if (loading) return <>{children}</>;
  try {
    const platform = Capacitor.getPlatform();
    if (platform === "web") return <>{children}</>;
    const min =
      platform === "ios" ? config.iosMinVersion : config.androidMinVersion;
    if (!isBelowMinVersion(appVersion, min)) return <>{children}</>;
    return (
      <ForceUpdateScreen
        message={config.forceUpdateMessage}
        iosStoreUrl={config.iosStoreUrl}
        playStoreUrl={config.playStoreUrl}
      />
    );
  } catch {
    return <>{children}</>;
  }
}

const App: React.FC = () => {
  const schedulerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // เริ่ม scheduler
    schedulerRef.current = MockApi.startPaymentReleaseScheduler();

    // Cleanup เมื่อ component unmount
    return () => {
      if (schedulerRef.current !== null) {
        MockApi.stopPaymentReleaseScheduler(schedulerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    import("./services/brandAdviserPushSync").then((m) => {
      if (!cancelled) m.registerBrandAdviserPushProfileRefresh();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <LanguageProvider>
      <NotificationProvider>
        <MobileAppConfigProvider>
          <AppMaintenanceGate>
            <AppForceUpdateGate>
              <AuthProvider>
                <ThemeProviderWrapper>
                  <TrainingProvider>
                    <TutorialProvider>
                      <TalentTutorialProvider>
                        <Router>
                          <PushTokenRegistration />
                          <KycDeepLinkBridge />
                          <PrbDeepLinkBridge />
                          <ReferralDeepLinkBridge />
                          <ProviderRerouteDeepLinkBridge />
                          <ComplianceModal />
                          <CookieConsentBanner />
                          <FeatureDisabledNotifier />
                          <CompassBootRedirect />
                          <GrowthIntentBoot />
                          <Routes>
                            {/* --- CLIENT APP ROUTES --- */}
                            <Route
                              path="/welcome"
                              element={
                                <PublicRoute>
                                  <Welcome />
                                </PublicRoute>
                              }
                            />
                            <Route
                              path="/login"
                              element={
                                <PublicRoute>
                                  <Login />
                                </PublicRoute>
                              }
                            />
                            <Route
                              path="/register"
                              element={
                                <PublicRoute>
                                  <SignupAllowed>
                                    <Register />
                                  </SignupAllowed>
                                </PublicRoute>
                              }
                            />
                            {/* Public referral entry — store code then forward to register */}
                            <Route
                              path="/ref/:code"
                              element={
                                <PublicRoute>
                                  <ReferralLinkGate />
                                </PublicRoute>
                              }
                            />
                            <Route
                              path="/forgot-password"
                              element={
                                <PublicRoute>
                                  <ForgotPassword />
                                </PublicRoute>
                              }
                            />
                            <Route path="/verify" element={<Verify />} />
                            <Route path="/courses/certificates/verify/:code" element={<CourseCertificateVerify />} />

                            {/* Public legal pages — ไม่บังคับ login (Stripe / ผู้สอบสิทธิ์) */}
                            <Route path="/terms" element={<TermsPage />} />
                            <Route path="/privacy" element={<PrivacyPage />} />
                            <Route
                              path="/account-deletion"
                              element={<AccountDeletionPage />}
                            />
                            <Route
                              path="/payment-methods"
                              element={
                                <PaymentsAllowed>
                                  <PaymentMethodSelect />
                                </PaymentsAllowed>
                              }
                            />

                            <Route
                              path="/storefront"
                              element={
                                <ProtectedRoute>
                                  <MarketplaceEmbed />
                                </ProtectedRoute>
                              }
                            />

                            <Route
                              path="/"
                              element={
                                <ProtectedRoute>
                                  <Home />
                                </ProtectedRoute>
                              }
                            />

                            <Route
                              path="/jobs"
                              element={
                                <ProtectedRoute>
                                  <Jobs />
                                </ProtectedRoute>
                              }
                            />

                            <Route
                              path="/video-feed"
                              element={
                                <Layout>
                                  <VideoFeedWrapper />
                                </Layout>
                              }
                            />
                            <Route
                              path="/video-feed/saved"
                              element={
                                <ProtectedRoute>
                                  <SavedVideoClips />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/post/create"
                              element={
                                <ProtectedRoute>
                                  <PostCreate />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/stories/create"
                              element={
                                <Navigate
                                  to="/post/create?type=story"
                                  replace
                                />
                              }
                            />
                            <Route
                              path="/settings/post-sharing"
                              element={
                                <ProtectedRoute>
                                  <PostSharingSettings />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/settings/ads-marketplace"
                              element={
                                <ProtectedRoute>
                                  <AdsMarketplace />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/settings/ads-marketplace/create"
                              element={
                                <ProtectedRoute>
                                  <AdsCampaignCreate />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/settings/ads-marketplace/compare"
                              element={
                                <ProtectedRoute>
                                  <AdsCampaignCompare />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/settings/ads-marketplace/:id"
                              element={
                                <ProtectedRoute>
                                  <AdsCampaignDetail />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/stories/view/:userId"
                              element={
                                <ProtectedRoute>
                                  <StoryViewer />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/talents"
                              element={
                                <ProtectedRoute>
                                  <Talents />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/talents/:id"
                              element={
                                <ProtectedRoute>
                                  <ExpertView />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/talents/:id/beauty-booking"
                              element={
                                <ProtectedRoute>
                                  <BeautyBookingFlow />
                                </ProtectedRoute>
                              }
                            />

                            <Route
                              path="/my-jobs"
                              element={
                                <ProtectedRoute>
                                  <MyJobs />
                                </ProtectedRoute>
                              }
                            />

                            <Route
                              path="/jobs/:id"
                              element={
                                <ProtectedRoute>
                                  <JobDetails />
                                </ProtectedRoute>
                              }
                            />

                            <Route
                              path="/transport"
                              element={
                                <ProtectedRoute>
                                  <TransportHub />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/booking"
                              element={
                                <ProtectedRoute>
                                  <Booking />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/marine"
                              element={
                                <ProtectedRoute>
                                  <MarineHub />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/party-vibe"
                              element={
                                <ProtectedRoute>
                                  <PartyVibePicker />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/dashboard/wallet"
                              element={
                                <ProtectedRoute>
                                  <WalletDashboard />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/technical-specialist"
                              element={
                                <ProtectedRoute>
                                  <TechnicalSpecialistSelector />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/cleaning-specialist"
                              element={
                                <ProtectedRoute>
                                  <CleaningSpecialistSelector />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/create-job"
                              element={
                                <ProtectedRoute>
                                  <JobPostingAllowed>
                                    <CreateJob />
                                  </JobPostingAllowed>
                                </ProtectedRoute>
                              }
                            />

                            <Route
                              path="/job-board"
                              element={
                                <ProtectedRoute>
                                  <JobBoard />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/job-board/:id/manage"
                              element={
                                <ProtectedRoute>
                                  <ManageAdvanceJob />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/job-board/:id/chat/:talentId"
                              element={
                                <ProtectedRoute>
                                  <ChatAllowed>
                                    <AdvanceJobChat />
                                  </ChatAllowed>
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/job-board/:id"
                              element={
                                <ProtectedRoute>
                                  <JobDetailAdvance />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/my-advance-jobs"
                              element={
                                <Navigate to="/job-board?tab=my-jobs" replace />
                              }
                            />
                            <Route
                              path="/my-applications"
                              element={
                                <Navigate
                                  to="/job-board?tab=my-applications"
                                  replace
                                />
                              }
                            />
                            <Route
                              path="/saved-jobs"
                              element={
                                <Navigate to="/job-board?tab=saved" replace />
                              }
                            />
                            <Route
                              path="/bookings/:id/chat"
                              element={
                                <ProtectedRoute>
                                  <ChatAllowed>
                                    <BookingChat />
                                  </ChatAllowed>
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/my-bookings"
                              element={
                                <ProtectedRoute>
                                  <MyBookings />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/create-job-advance"
                              element={
                                <ProtectedRoute>
                                  <JobPostingAllowed>
                                    <CreateJobAdvance />
                                  </JobPostingAllowed>
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/work-routing-matrix"
                              element={
                                <ProtectedRoute>
                                  <WorkRoutingMatrix />
                                </ProtectedRoute>
                              }
                            />

                            <Route
                              path="/profile"
                              element={
                                <ProtectedRoute>
                                  <Profile />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/wallet/topup"
                              element={
                                <ProtectedRoute>
                                  <Navigate to="/profile?tab=wallet" replace />
                                </ProtectedRoute>
                              }
                            />

                            {/* Compass Onboarding */}
                            <Route
                              path="/onboarding/compass"
                              element={
                                <ProtectedRoute>
                                  <OnboardingCompassSurvey />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/compass"
                              element={
                                <ProtectedRoute>
                                  <CompassMissionControl />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/compass/category-pack"
                              element={
                                <ProtectedRoute>
                                  <CompassCategoryPack />
                                </ProtectedRoute>
                              }
                            />

                            {/* Phase 2: KYC Wizard Route */}
                            <Route
                              path="/kyc"
                              element={
                                <ProtectedRoute>
                                  <KYCWizard />
                                </ProtectedRoute>
                              }
                            />

                            <Route
                              path="/settings"
                              element={
                                <ProtectedRoute>
                                  <Settings />
                                </ProtectedRoute>
                              }
                            />

                            <Route
                              path="/legal"
                              element={
                                <ProtectedRoute>
                                  <Legal />
                                </ProtectedRoute>
                              }
                            />

                            <Route
                              path="/payment/:jobId"
                              element={
                                <ProtectedRoute>
                                  <PaymentsAllowed>
                                    <Payment />
                                  </PaymentsAllowed>
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/vip"
                              element={
                                <ProtectedRoute>
                                  <PaymentsAllowed>
                                    <VIPSubscription />
                                  </PaymentsAllowed>
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/referral"
                              element={
                                <ProtectedRoute>
                                  <Referral />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/talent/ai-resume"
                              element={
                                <ProtectedRoute>
                                  <TalentAIResumeStudio />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/talent/incubation"
                              element={
                                <ProtectedRoute>
                                  <IncubationDirector />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/talent/incubation/compose"
                              element={
                                <ProtectedRoute>
                                  <ClipOverlayEditor />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/talent/pro"
                              element={
                                <ProtectedRoute>
                                  <TalentPro799 />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/gold-lotto"
                              element={
                                <ProtectedRoute>
                                  <GoldLottoHub />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/prb"
                              element={
                                <ProtectedRoute>
                                  <PaymentsAllowed>
                                    <PrbFlow />
                                  </PaymentsAllowed>
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/prb/orders"
                              element={
                                <ProtectedRoute>
                                  <PaymentsAllowed>
                                    <PrbTrackHub />
                                  </PaymentsAllowed>
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/prb/track/:id"
                              element={
                                <ProtectedRoute>
                                  <PaymentsAllowed>
                                    <PrbOrderTrack />
                                  </PaymentsAllowed>
                                </ProtectedRoute>
                              }
                            />

                            <Route
                              path="/digital-vault"
                              element={
                                <ProtectedRoute>
                                  <DigitalVault />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/internet-packages"
                              element={
                                <ProtectedRoute>
                                  <InternetPackagesPage />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/tutorial-hub"
                              element={
                                <ProtectedRoute>
                                  <TutorialHub />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/talent-tutorial"
                              element={
                                <Navigate
                                  to="/tutorial-hub?mode=talent"
                                  replace
                                />
                              }
                            />

                            {/* --- TRAINING ROUTES (Protected) --- */}
                            {/* ✅ wrap ใน ProtectedRoute เพื่อให้แน่ใจว่า user ต้อง login */}
                            <Route
                              path="/training/dashboard"
                              element={
                                <ProtectedRoute>
                                  <TrainingDashboard />
                                </ProtectedRoute>
                              }
                            />

                            <Route
                              path="/training/course/:courseId"
                              element={
                                <ProtectedRoute>
                                  <TrainingCoursePage />
                                </ProtectedRoute>
                              }
                            />

                            <Route
                              path="/training/course/:courseId/quiz"
                              element={
                                <ProtectedRoute>
                                  <TrainingQuizPage />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/courses"
                              element={
                                <ProtectedRoute>
                                  <CourseMarketplace />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/courses/:id"
                              element={
                                <ProtectedRoute>
                                  <CourseDetailMarketplace />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/courses/:id/learn"
                              element={
                                <ProtectedRoute>
                                  <CourseLearn />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/courses/orders/:orderId/receipt"
                              element={
                                <ProtectedRoute>
                                  <CourseOrderReceipt />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/course-studio"
                              element={
                                <ProtectedRoute>
                                  <CourseStudio />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/course-studio/sales"
                              element={
                                <ProtectedRoute>
                                  <InstructorCourseSales />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/training/nexus-module2"
                              element={
                                <ProtectedRoute>
                                  <NexusExamModule2Select />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/training/nexus-module2/quiz/:category"
                              element={
                                <ProtectedRoute>
                                  <NexusExamModule2Quiz />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/training/nexus-module3"
                              element={
                                <ProtectedRoute>
                                  <NexusExamModule3Page />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/training/certificate-readiness"
                              element={
                                <ProtectedRoute>
                                  <CertificateOfReadiness />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/dashboard/employer"
                              element={
                                <ProtectedRoute>
                                  <EmployerDashboard />
                                </ProtectedRoute>
                              }
                            />

                            <Route
                              path="/employer/dashboard"
                              element={
                                <ProtectedRoute>
                                  <EmployerDashboard />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/provider/dashboard"
                              element={
                                <ProtectedRoute>
                                  <ProviderDashboard />
                                </ProtectedRoute>
                              }
                            />

                            <Route
                              path="/dashboard/provider"
                              element={
                                <ProtectedRoute>
                                  <ProviderDashboard />
                                </ProtectedRoute>
                              }
                            />

                            <Route
                              path="/reconciliation/course-payouts"
                              element={
                                <ProtectedRoute>
                                  <AdminCoursePayouts />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/reconciliation/course-review"
                              element={
                                <ProtectedRoute>
                                  <AdminCourseReview />
                                </ProtectedRoute>
                              }
                            />
                            <Route
                              path="/reconciliation/course-analytics"
                              element={
                                <ProtectedRoute>
                                  <AdminCourseAnalytics />
                                </ProtectedRoute>
                              }
                            />

                            {/* Phase 3.5: Daily Reconciliation (protected) */}
                            <Route
                              path="/reconciliation"
                              element={
                                <ProtectedRoute>
                                  <Reconciliation />
                                </ProtectedRoute>
                              }
                            />

                            {/* --- ADMIN PORTAL ROUTES (Separated in Production via nexus-admin-core) --- */}
                            <Route
                              path="*"
                              element={<Navigate to="/welcome" replace />}
                            />
                          </Routes>
                        </Router>
                      </TalentTutorialProvider>
                    </TutorialProvider>
                  </TrainingProvider>
                </ThemeProviderWrapper>
              </AuthProvider>
            </AppForceUpdateGate>
          </AppMaintenanceGate>
        </MobileAppConfigProvider>
      </NotificationProvider>
    </LanguageProvider>
  );
};

export default App;
