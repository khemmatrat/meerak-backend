/**
 * Metadata for gateway mobile banking options (display only — codes match backend contract).
 */

export type MobileBankingBankCode = "scb" | "ktb" | "bbl" | "bay" | "kbank";

export type MobileBankingBankMeta = {
  code: MobileBankingBankCode;
  logoSrc: string;
  nameEn: string;
  nameTh: string;
};

export const MOBILE_BANKING_BANKS: readonly MobileBankingBankMeta[] = [
  {
    code: "scb",
    logoSrc: "/banks/scb.svg",
    nameTh: "ธนาคารไทยพาณิชย์",
    nameEn: "The Siam Commercial Bank",
  },
  {
    code: "ktb",
    logoSrc: "/banks/ktb.svg",
    nameTh: "ธนาคารกรุงไทย",
    nameEn: "Krungthai Bank",
  },
  {
    code: "bbl",
    logoSrc: "/banks/bbl.svg",
    nameTh: "ธนาคารกรุงเทพ",
    nameEn: "Bangkok Bank",
  },
  {
    code: "bay",
    logoSrc: "/banks/bay.svg",
    nameTh: "ธนาคารกรุงศรีอยุธยา",
    nameEn: "Bank of Ayudhya (Krungsri)",
  },
  {
    code: "kbank",
    logoSrc: "/banks/kbank.svg",
    nameTh: "ธนาคารกสิกรไทย",
    nameEn: "Kasikornbank",
  },
] as const;

export function metaForMobileBankCode(
  code: MobileBankingBankCode,
): MobileBankingBankMeta {
  const found = MOBILE_BANKING_BANKS.find((b) => b.code === code);
  return found ?? MOBILE_BANKING_BANKS[0]!;
}
