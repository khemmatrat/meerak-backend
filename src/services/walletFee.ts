/**
 * Backend copy of withdrawal fee logic (Thailand only).
 * Must match services/paymentFeeConfig.ts for consistency.
 * PromptPay: 25 THB, Bank: 25 THB, TrueMoney: 3.6%.
 */
export type WithdrawChannel = "promptpay" | "bank_transfer" | "truemoney";

export const MIN_WITHDRAWAL_THB = 100;
export const MAX_WITHDRAWAL_THB = 500_000;

const WITHDRAWAL_FEE = {
  promptpay: { fixed_thb: 25 },
  bank_transfer: { fixed_thb: 25 },
  truemoney: { rate_pct: 3.6, fixed_thb: 0 },
} as const;

function round(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function getWithdrawalFeeForNet(
  channel: WithdrawChannel,
  netAmountUserReceives: number,
): number {
  const n = round(netAmountUserReceives);
  const cfg = WITHDRAWAL_FEE[channel];
  if ("fixed_thb" in cfg && cfg.fixed_thb > 0) return cfg.fixed_thb;
  if ("rate_pct" in cfg && cfg.rate_pct > 0)
    return round((n * cfg.rate_pct) / 100);
  return 0;
}

export function getMaxNetWithdrawable(
  balance: number,
  channel: WithdrawChannel,
): number {
  const bal = round(balance);
  const cfg = WITHDRAWAL_FEE[channel];
  if ("fixed_thb" in cfg && cfg.fixed_thb > 0)
    return Math.max(0, round(bal - cfg.fixed_thb));
  if ("rate_pct" in cfg && cfg.rate_pct > 0) {
    const rate = 1 + cfg.rate_pct / 100;
    return Math.max(0, round(bal / rate));
  }
  return Math.max(0, bal);
}
