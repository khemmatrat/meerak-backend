import React, { useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { startIntentDwellFlushLoop } from "../../hooks/useIntentDwell";

/** Starts intent batch flush + growth app-open on authenticated session */
export const GrowthIntentBoot: React.FC = () => {
  const { user } = useAuth();

  useEffect(() => {
    startIntentDwellFlushLoop();
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    import("../../services/growthEngineService").then(({ recordGrowthAppOpen }) => {
      void recordGrowthAppOpen();
    });
  }, [user?.id]);

  return null;
};

export default GrowthIntentBoot;
