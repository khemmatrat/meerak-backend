import { useState, useEffect } from "react";
import { getRemainingMs, getCountdownParts, isGrandOpeningLive } from "./grandOpeningCountdown";

export type GrandOpeningCountdownState = ReturnType<typeof getCountdownParts> & {
  isLive: boolean;
  totalMsRemaining: number;
};

export function useGrandOpeningCountdown(): GrandOpeningCountdownState {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  const totalMsRemaining = getRemainingMs();
  const live = isGrandOpeningLive();
  return {
    ...getCountdownParts(totalMsRemaining),
    isLive: live,
    totalMsRemaining,
  };
}
