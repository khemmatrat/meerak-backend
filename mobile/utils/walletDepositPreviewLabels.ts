import type { WalletDepositPreviewResponse } from "../types/walletDepositContract";

/** Format THB for display only — no fee math. */
export function formatDepositAmountThb(
  value: number,
  locale = "th-TH",
): string {
  return Number(value).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export type WalletDepositPreviewRow = {
  key: "gross" | "processing_fee" | "net" | "gateway";
  labelTh: string;
  valueDisplay: string;
};

/**
 * Pure: map API preview to label rows for UI. Does not compute fees.
 * Returns null when preview is empty or not meaningful for display.
 */
export function buildWalletDepositPreviewRows(
  data: WalletDepositPreviewResponse | null,
): WalletDepositPreviewRow[] | null {
  if (!data || data.message) return null;
  const gross = Number(data.gross_amount);
  if (!Number.isFinite(gross) || gross < 1) return null;

  const rows: WalletDepositPreviewRow[] = [
    {
      key: "gross",
      labelTh: "ยอดที่ชำระ",
      valueDisplay: formatDepositAmountThb(gross),
    },
    {
      key: "processing_fee",
      labelTh: "ค่าธรรมเนียมรวม",
      valueDisplay: formatDepositAmountThb(Number(data.processing_fee)),
    },
    {
      key: "net",
      labelTh: "เข้าวอลเล็ตโดยประมาณ",
      valueDisplay: formatDepositAmountThb(Number(data.net_to_wallet)),
    },
  ];

  if (data.gateway_fee != null && Number.isFinite(Number(data.gateway_fee))) {
    rows.splice(2, 0, {
      key: "gateway",
      labelTh: "ค่าเกตเวย์ (โดยประมาณ)",
      valueDisplay: formatDepositAmountThb(Number(data.gateway_fee)),
    });
  }

  return rows;
}
