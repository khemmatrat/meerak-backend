import { useEffect, useState } from "react";
import type { SlotBookingFeeConfig } from "../constants/bookingFeeStructure";
import { fetchSlotBookingFeeConfig } from "../services/slotBookingFeeService";

/** Loads Profile A (slot booking) fee rates from GET /api/payments/fee-config. */
export function useSlotBookingFees(): SlotBookingFeeConfig | null {
  const [config, setConfig] = useState<SlotBookingFeeConfig | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchSlotBookingFeeConfig().then((c) => {
      if (alive) setConfig(c);
    });
    return () => {
      alive = false;
    };
  }, []);
  return config;
}
