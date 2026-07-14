import { api } from "./api";
import type { SlotBookingFeeConfig } from "../constants/bookingFeeStructure";

const DEFAULT_CONFIG: SlotBookingFeeConfig = {
  platformFee: { none: 8, silver: 7, gold: 6, platinum: 5 },
  commissionBooking: { none: 32, silver: 28, gold: 24, platinum: 20 },
  bookingSourcingPercent: 8,
  biddingFeePercent: 9.3,
};

let cache: SlotBookingFeeConfig | null = null;
let inflight: Promise<SlotBookingFeeConfig> | null = null;

function parseFeeConfig(data: Record<string, unknown>): SlotBookingFeeConfig {
  const platformFee =
    (data.platformFee as Record<string, number> | undefined) ||
    (data.bookingMarkup as Record<string, number> | undefined);
  const commissionBooking =
    (data.bookingFee as Record<string, number> | undefined) ||
    (data.commission_booking as Record<string, number> | undefined);
  return {
    platformFee: platformFee
      ? { ...DEFAULT_CONFIG.platformFee, ...platformFee }
      : DEFAULT_CONFIG.platformFee,
    commissionBooking: commissionBooking
      ? { ...DEFAULT_CONFIG.commissionBooking, ...commissionBooking }
      : DEFAULT_CONFIG.commissionBooking,
    bookingSourcingPercent: Number(
      data.bookingSourcingPercent ?? data.booking_sourcing_percent ?? 8,
    ),
    biddingFeePercent: Number(
      data.biddingFeePercent ?? data.bidding_fee_percent ?? 9.3,
    ),
  };
}

/** Public slot booking rates — GET /api/payments/fee-config (cached). */
export async function fetchSlotBookingFeeConfig(): Promise<SlotBookingFeeConfig> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = api
    .get("/payments/fee-config")
    .then((res) => {
      cache = parseFeeConfig(res.data || {});
      return cache;
    })
    .catch(() => {
      cache = { ...DEFAULT_CONFIG };
      return cache;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function clearSlotBookingFeeCache() {
  cache = null;
}
