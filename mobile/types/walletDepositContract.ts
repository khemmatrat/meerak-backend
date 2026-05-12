/**
 * Phase M0 — Wallet top-up modal HTTP contract (aligned with backend GET/POST).
 * Fee display: use GET /api/wallet/deposit/preview fields only (no duplicate % math on mobile).
 */

/** GET /api/wallet/deposit/preview — 200 JSON */
export interface WalletDepositPreviewResponse {
  gross_amount: number;
  net_to_wallet: number;
  processing_fee: number;
  platform_margin: number;
  gateway_fee: number;
  payment_method?: string;
  tip?: string | null;
  /** Present when amount < 1 — informational */
  message?: string;
}

/** POST /api/wallet/deposit/manual — 201 JSON */
export interface WalletDepositManualCreateResponse {
  id: string;
  status: string;
  amount?: number;
  created_at?: string;
}

/** Phase M1 — deposit modal steps (Manual slip + PaySo QR only). */
export type WalletDepositM1Step =
  | "choose_method"
  | "enter_amount"
  | "payso_qr"
  | "manual_slip"
  | "manual_done";

/** POST /api/wallet/deposit/payso (and POST /api/wallet/deposit) — 201 JSON */
export interface WalletDepositCreateResponse {
  charge_id?: string;
  payment_id?: string;
  status?: string;
  amount?: number;
  currency?: string;
  qr_code_url?: string | null;
  authorization_uri?: string | null;
  source_type?: string;
  error?: string;
  code?: string;
}
