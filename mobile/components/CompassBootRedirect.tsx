import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { fetchCompassStatus } from "../services/compassOnboardingService";

const SKIP_PATHS = new Set([
  "/welcome",
  "/login",
  "/register",
  "/onboarding/compass",
  "/compass",
  "/compass/category-pack",
  "/kyc",
  "/forgot-password",
]);

/**
 * Boot routing — เปิดแอปแล้วชี้ไป Mission Control ถ้ายังไม่จบเส้นทาง Compass
 */
export const CompassBootRedirect: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setChecked(true);
      return;
    }
    const path = location.pathname;
    if (path !== "/" && path !== "/provider/dashboard" && path !== "/employer/dashboard") {
      setChecked(true);
      return;
    }
    if (SKIP_PATHS.has(path)) {
      setChecked(true);
      return;
    }

    let alive = true;
    void fetchCompassStatus()
      .then((s) => {
        if (!alive) return;
        if (!s.surveyDone) {
          navigate("/onboarding/compass", { replace: true });
          return;
        }
        if (s.compassMode && !s.compassCompleted && !s.allDone) {
          navigate("/compass", { replace: true });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setChecked(true);
      });

    return () => {
      alive = false;
    };
  }, [isAuthenticated, user?.id, location.pathname, navigate]);

  return null;
};

export default CompassBootRedirect;
