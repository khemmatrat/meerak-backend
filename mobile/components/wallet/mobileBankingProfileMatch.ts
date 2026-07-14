/**
 * Client-side mirror of backend walletDepositMobileBankingProfile — UX only;
 * server validates again before creating a charge.
 */

export function normalizeMbDigits(s: string): string {
  return String(s || "").replace(/\D/g, "");
}

export function providerNameMatchesMbBankCode(
  bankCode: string,
  providerName: string,
): boolean {
  const bc = String(bankCode || "")
    .trim()
    .toLowerCase();
  const p = String(providerName || "")
    .trim()
    .toLowerCase();
  if (!bc || !p) return false;
  if (p === bc) return true;
  const hints: Record<string, string[]> = {
    scb: ["scb", "siam commercial", "ไทยพาณิชย์", "ธนาคารไทยพาณิชย์"],
    ktb: ["ktb", "krungthai", "กรุงไทย", "ธนาคารกรุงไทย"],
    bbl: ["bbl", "bangkok bank", "กรุงเทพ", "ธนาคารกรุงเทพ"],
    bay: ["bay", "krungsri", "กรุงศรี", "ธนาคารกรุงศรี", "ayudhya"],
    kbank: ["kbank", "kasikorn", "กสิกร", "ธนาคารกสิกรไทย"],
  };
  const list = hints[bc];
  if (!list) return false;
  return list.some((h) => p.includes(h));
}

export function findMatchingBankAccountForMb(
  accounts: unknown[],
  bankCode: string,
  enteredDigits: string,
): { matched: boolean; account_name?: string } {
  const entered = normalizeMbDigits(enteredDigits);
  if (!entered || entered.length < 10) return { matched: false };
  for (const acc of accounts) {
    if (!acc || typeof acc !== "object") continue;
    const o = acc as Record<string, unknown>;
    const type = String(o.type || "").toLowerCase();
    if (type && type !== "bank") continue;
    const providerName = String(o.provider_name || "");
    if (!providerNameMatchesMbBankCode(bankCode, providerName)) continue;
    const acctDigits = normalizeMbDigits(String(o.account_number || ""));
    if (acctDigits && acctDigits === entered) {
      const name = String(o.account_name || "").trim();
      return { matched: true, ...(name ? { account_name: name } : {}) };
    }
  }
  return { matched: false };
}
