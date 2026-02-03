import React from "react";
import {
  HashRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { useEffect, useRef } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LanguageProvider } from "./context/LanguageContext";
import { NotificationProvider } from "./context/NotificationContext";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Home } from "./pages/Home";
import { Jobs } from "./pages/Jobs";
import { CreateJob } from "./pages/CreateJob";
import { JobDetails } from "./pages/JobDetails";
import { Profile } from "./pages/Profile";
import { Payment } from "./pages/Payment";
import { MyJobs } from "./pages/MyJobs";
import { Talents } from "./pages/Talents";
import { Settings } from "./pages/Settings";
import { Legal } from "./pages/Legal";
import { Welcome } from "./pages/Welcome";
import { TrainingProvider } from "./context/TrainingContext";
import KYCWizard from "./pages/KYCWizard"; // Phase 2: KYC Wizard
import Reconciliation from "./pages/Reconciliation"; // Phase 3.5: Daily Reconciliation

// Admin Pages
import { AdminLogin } from "./pages/admin/AdminLogin";
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import { NexusAdminDashboard } from "./pages/admin/NexusAdminDashboard";
import TrainingDashboard from "./pages/TrainingDashboard";
import TrainingCoursePage from "./pages/TrainingCourse";
import TrainingQuizPage from "./pages/TrainingQuizPage";
import EmployerDashboard from "./components/EmployerDashboard";
import ProviderDashboard from "./components/ProviderDashboard";
import { UserRole } from "./types";
import { MockApi } from "./services/mockApi";
// Protected Route Component
const ProtectedRoute = ({ children }: { children?: React.ReactNode }) => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
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

const App: React.FC = () => {
  const schedulerRef = useRef<number | null>(null);

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

  return (
    <NotificationProvider>
      <AuthProvider>
        <LanguageProvider>
          <TrainingProvider>
            <Router>
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
                      <Register />
                    </PublicRoute>
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
                  path="/talents"
                  element={
                    <ProtectedRoute>
                      <Talents />
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
                  path="/create-job"
                  element={
                    <ProtectedRoute>
                      <CreateJob />
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
                      <Payment />
                    </ProtectedRoute>
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

                {/* Phase 3.5: Daily Reconciliation (protected) */}
                <Route
                  path="/reconciliation"
                  element={
                    <ProtectedRoute>
                      <Reconciliation />
                    </ProtectedRoute>
                  }
                />

                {/* --- ADMIN PORTAL ROUTES (Separated in Production) --- */}
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route path="/admin/dashboard" element={<AdminDashboard />} />
                <Route path="/admin/nexus" element={<NexusAdminDashboard />} />

                <Route path="*" element={<Navigate to="/welcome" replace />} />
              </Routes>
            </Router>
          </TrainingProvider>
        </LanguageProvider>
      </AuthProvider>
    </NotificationProvider>
  );
};

export default App;
