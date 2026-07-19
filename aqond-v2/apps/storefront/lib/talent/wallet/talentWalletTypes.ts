/** Account wallet BFF payload — SSOT read path: GET /api/bff/v1/wallet */
export type AccountWalletBffResponse = {
  balance_micro?: number;
  currency?: string;
  coins?: number;
  coupons?: unknown[];
  transactions?: AccountWalletLedgerEntry[];
};

export type AccountWalletLedgerEntry = {
  entry_type?: string;
  amount_micro?: number;
  order_id?: string;
  reason?: string | null;
  created_at?: string;
};

/** Talent presentation shape — mapped from Account BFF, not legacy /api/wallet summary */
export type TalentWalletSummary = {
  available: number;
  pending: number;
  total: number;
  wallet_frozen?: boolean;
  /** SSOT trace — same micro units as Account wallet page */
  balance_micro?: number;
  currency?: string;
};
