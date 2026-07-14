import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useMobileAppConfig } from "../context/MobileAppConfigContext";

/** ปิดสมัครสมาชิก — ใช้ห่อ /register */
export const SignupAllowed: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { config } = useMobileAppConfig();
  const location = useLocation();
  if (!config.featureFlags.enableSignups) {
    return <Navigate to="/welcome" replace state={{ ...location.state, featureDisabled: "signup" as const }} />;
  }
  return <>{children}</>;
};

/** ปิดจ่ายเงิน / เติมถอน / VIP — ใช้ห่อหน้าที่เกี่ยวกับการชำระเงิน */
export const PaymentsAllowed: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { config } = useMobileAppConfig();
  const location = useLocation();
  if (!config.featureFlags.enablePayments) {
    return <Navigate to="/" replace state={{ ...location.state, featureDisabled: "payments" as const }} />;
  }
  return <>{children}</>;
};

/** ปิดโพสต์งาน — CreateJob / CreateJobAdvance */
export const JobPostingAllowed: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { config } = useMobileAppConfig();
  const location = useLocation();
  if (!config.featureFlags.enableJobPosting) {
    return <Navigate to="/" replace state={{ ...location.state, featureDisabled: "job_posting" as const }} />;
  }
  return <>{children}</>;
};

/** ปิดแชท — เส้นทางแชทงาน */
export const ChatAllowed: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { config } = useMobileAppConfig();
  const location = useLocation();
  if (!config.featureFlags.enableChat) {
    return <Navigate to="/" replace state={{ ...location.state, featureDisabled: "chat" as const }} />;
  }
  return <>{children}</>;
};
