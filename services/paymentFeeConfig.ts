/**
 * Thailand Payment Fee Configuration
 * Single source of truth for deposit/withdrawal fees, minimums, and business rules.
 * Platform: internal ledger wallet; inbound → company bank; outbound from company bank.
 * Channels: PromptPay QR, Bank Transfer, TrueMoney Wallet only (no Stripe/PayPal).
 */

export type PaymentChannel = "promptpay" | "bank_transfer" | "truemoney";

// --- INBOUND (Deposit) ---
// Real cost to platform (gateway/network). User sees 0 fee for deposits where possible.
export const INBOUND_COST = {
  promptpay: { rate_pct: 0, fixed_thb: 0 },
  bank_transfer: { rate_pct: 0, fixed_thb: 0 },
  truemoney: { rate_pct: 2, fixed_thb: 0 },
} as const;

// User-facing deposit fee (THB). Keep 0 for PromptPay and Bank Transfer; optional for TrueMoney.
export const DEPOSIT_FEE_USER_THB = {
  promptpay: 0,
  bank_transfer: 0,
  truemoney: 0,
} as const;

// --- OUTBOUND (Withdrawal) ---
// Real cost to platform (gateway/network) — Thailand estimates.
export const OUTBOUND_COST = {
  promptpay: { rate_pct: 0, fixed_thb_min: 5, fixed_thb_max: 10 },
  bank_transfer: { rate_pct: 0, fixed_thb_min: 0, fixed_thb_max: 10 },
  truemoney: { rate_pct: 1.5, fixed_thb_min: 0, fixed_thb_max: 0 },
} as const;

// Platform charge to user (company profit after gateway cost).
export const WITHDRAWAL_FEE_USER = {
  promptpay: { fixed_thb: 25 },
  bank_transfer: { fixed_thb: 25 },
  truemoney: { rate_pct: 3.6, fixed_thb: 0 },
} as const;

// --- MINIMUM WITHDRAWAL & FEE TIERS (prevent micro-withdraw abuse) ---
export const MIN_WITHDRAWAL_THB = 100;
export const MAX_WITHDRAWAL_THB = 500_000;

// Fee tiers: [min_amount, max_amount] -> effective fee (for future use if we add tiers).
export const WITHDRAWAL_FEE_TIERS: Array<{
  min_thb: number;
  max_thb: number;
  channel: PaymentChannel;
  fee_thb: number;
  fee_pct?: number;
}> = [
  { min_thb: 100, max_thb: 999, channel: "promptpay", fee_thb: 25 },
  { min_thb: 100, max_thb: 999, channel: "bank_transfer", fee_thb: 25 },
  {
    min_thb: 100,
    max_thb: 999,
    channel: "truemoney",
    fee_thb: 0,
    fee_pct: 3.6,
  },
  { min_thb: 1000, max_thb: 49999, channel: "promptpay", fee_thb: 25 },
  { min_thb: 1000, max_thb: 49999, channel: "bank_transfer", fee_thb: 25 },
  {
    min_thb: 1000,
    max_thb: 49999,
    channel: "truemoney",
    fee_thb: 0,
    fee_pct: 3.6,
  },
  { min_thb: 50000, max_thb: 500000, channel: "promptpay", fee_thb: 25 },
  { min_thb: 50000, max_thb: 500000, channel: "bank_transfer", fee_thb: 25 },
  {
    min_thb: 50000,
    max_thb: 500000,
    channel: "truemoney",
    fee_thb: 0,
    fee_pct: 3.6,
  },
];

// --- ROUNDING ---
export const ROUNDING_MODE: "half_up" | "down" | "up" = "half_up";
export const CURRENCY_DECIMALS = 2;

function roundAmount(
  amount: number,
  decimals: number = CURRENCY_DECIMALS,
): number {
  if (ROUNDING_MODE === "down") {
    return Math.floor(amount * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }
  if (ROUNDING_MODE === "up") {
    return Math.ceil(amount * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }
  return Math.round(amount * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

// --- FEE CALCULATION ---

export interface WithdrawalFeeResult {
  channel: PaymentChannel;
  amount_requested_thb: number;
  fee_user_thb: number;
  net_to_user_thb: number;
  gateway_cost_estimate_thb: number;
  platform_gross_profit_thb: number;
  valid: boolean;
  error?: string;
}

/**
 * Compute withdrawal fee and net amount for a given channel and amount.
 * Business rules: min withdrawal, max withdrawal, fee = fixed or % per channel.
 */
export function calculateWithdrawalFee(
  channel: PaymentChannel,
  amount_thb: number,
): WithdrawalFeeResult {
  const amount = roundAmount(amount_thb);
  if (amount < MIN_WITHDRAWAL_THB) {
    return {
      channel,
      amount_requested_thb: amount,
      fee_user_thb: 0,
      net_to_user_thb: 0,
      gateway_cost_estimate_thb: 0,
      platform_gross_profit_thb: 0,
      valid: false,
      error: `Minimum withdrawal is ${MIN_WITHDRAWAL_THB} THB`,
    };
  }
  if (amount > MAX_WITHDRAWAL_THB) {
    return {
      channel,
      amount_requested_thb: amount,
      fee_user_thb: 0,
      net_to_user_thb: 0,
      gateway_cost_estimate_thb: 0,
      platform_gross_profit_thb: 0,
      valid: false,
      error: `Maximum withdrawal is ${MAX_WITHDRAWAL_THB.toLocaleString()} THB`,
    };
  }

  const userFeeConfig = WITHDRAWAL_FEE_USER[channel];
  let fee_user_thb: number;
  if ("fixed_thb" in userFeeConfig && userFeeConfig.fixed_thb > 0) {
    fee_user_thb = userFeeConfig.fixed_thb;
  } else if ("rate_pct" in userFeeConfig && userFeeConfig.rate_pct > 0) {
    fee_user_thb = roundAmount((amount * userFeeConfig.rate_pct) / 100);
  } else {
    fee_user_thb = 0;
  }

  const net_to_user_thb = roundAmount(Math.max(0, amount - fee_user_thb));

  const cost = OUTBOUND_COST[channel];
  let gateway_cost_estimate_thb: number;
  if (cost.rate_pct > 0) {
    gateway_cost_estimate_thb = roundAmount((amount * cost.rate_pct) / 100);
  } else {
    const mid = (cost.fixed_thb_min + cost.fixed_thb_max) / 2;
    gateway_cost_estimate_thb = roundAmount(mid);
  }

  const platform_gross_profit_thb = roundAmount(
    Math.max(0, fee_user_thb - gateway_cost_estimate_thb),
  );

  return {
    channel,
    amount_requested_thb: amount,
    fee_user_thb,
    net_to_user_thb,
    gateway_cost_estimate_thb,
    platform_gross_profit_thb,
    valid: true,
  };
}

export interface DepositFeeResult {
  channel: PaymentChannel;
  amount_thb: number;
  fee_user_thb: number;
  credit_to_ledger_thb: number;
  gateway_cost_estimate_thb: number;
  valid: boolean;
  error?: string;
}

/**
 * Compute deposit (inbound) fee and amount to credit to user ledger.
 * User pays 0 for PromptPay and Bank Transfer; TrueMoney cost absorbed or passed later.
 */
export function calculateDepositFee(
  channel: PaymentChannel,
  amount_thb: number,
): DepositFeeResult {
  const amount = roundAmount(amount_thb);
  if (amount <= 0) {
    return {
      channel,
      amount_thb: 0,
      fee_user_thb: 0,
      credit_to_ledger_thb: 0,
      gateway_cost_estimate_thb: 0,
      valid: false,
      error: "Amount must be positive",
    };
  }

  const fee_user = DEPOSIT_FEE_USER_THB[channel];
  const credit_to_ledger_thb = roundAmount(Math.max(0, amount - fee_user));

  const cost = INBOUND_COST[channel];
  const gateway_cost_estimate_thb =
    cost.rate_pct > 0
      ? roundAmount((amount * cost.rate_pct) / 100)
      : cost.fixed_thb || 0;

  return {
    channel,
    amount_thb: amount,
    fee_user_thb: fee_user,
    credit_to_ledger_thb,
    gateway_cost_estimate_thb,
    valid: true,
  };
}

/**
 * Get withdrawal fee in THB when user receives net_amount (จำนวนที่รับได้).
 * PromptPay/Bank: 25 THB fixed. TrueMoney: 3.6% of net.
 */
export function getWithdrawalFeeForNet(
  channel: PaymentChannel,
  net_amount_user_receives: number,
): number {
  const n = roundAmount(net_amount_user_receives);
  const cfg = WITHDRAWAL_FEE_USER[channel];
  if ("fixed_thb" in cfg && cfg.fixed_thb > 0) return cfg.fixed_thb;
  if ("rate_pct" in cfg && cfg.rate_pct > 0)
    return roundAmount((n * cfg.rate_pct) / 100);
  return 0;
}

/**
 * Max net amount user can withdraw (จำนวนที่รับได้สูงสุด) given balance and channel.
 */
export function getMaxNetWithdrawable(
  balance_thb: number,
  channel: PaymentChannel,
): number {
  const bal = roundAmount(balance_thb);
  const cfg = WITHDRAWAL_FEE_USER[channel];
  if ("fixed_thb" in cfg && cfg.fixed_thb > 0)
    return Math.max(0, roundAmount(bal - cfg.fixed_thb));
  if ("rate_pct" in cfg && cfg.rate_pct > 0) {
    // balance >= net + net*rate/100 = net*(1+rate/100), net = balance/(1+rate/100)
    const rate = 1 + cfg.rate_pct / 100;
    return Math.max(0, roundAmount(bal / rate));
  }
  return Math.max(0, bal);
}

// --- LEGACY EXPORTS (for existing code that uses WITHDRAWAL_FEE_THB, PAYMENT_FEE) ---
export const WITHDRAWAL_FEE_THB = WITHDRAWAL_FEE_USER.promptpay.fixed_thb;
export const PAYMENT_FEE = {
  PROMPTPAY_THB: DEPOSIT_FEE_USER_THB.promptpay,
  CARD_THB: 19,
} as const;
