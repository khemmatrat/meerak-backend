/**
 * Wallet deposit — Mobile Banking: match entered account digits vs saved profile bank_accounts (JSON).
 * No external bank inquiry; UX-only verification layer.
 */

/** @param {unknown} raw */
export function parseUserBankAccounts(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return /** @type {unknown[]} */ ([raw]);
  if (typeof raw === 'string') {
    try {
      const j = JSON.parse(raw);
      return Array.isArray(j) ? j : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** @param {string} s */
export function normalizeBankDigits(s) {
  return String(s || '').replace(/\D/g, '');
}

/**
 * @param {string} bankCode internal code e.g. scb, ktb
 * @param {string} providerName from BankAccount.provider_name
 */
export function providerNameMatchesMbBankCode(bankCode, providerName) {
  const bc = String(bankCode || '').trim().toLowerCase();
  const p = String(providerName || '').trim().toLowerCase();
  if (!bc || !p) return false;
  if (p === bc) return true;
  const hints = {
    scb: ['scb', 'siam commercial', 'ไทยพาณิชย์', 'ธนาคารไทยพาณิชย์'],
    ktb: ['ktb', 'krungthai', 'กรุงไทย', 'ธนาคารกรุงไทย'],
    bbl: ['bbl', 'bangkok bank', 'กรุงเทพ', 'ธนาคารกรุงเทพ'],
    bay: ['bay', 'krungsri', 'กรุงศรี', 'ธนาคารกรุงศรี', 'ayudhya'],
    kbank: ['kbank', 'kasikorn', 'กสิกร', 'ธนาคารกสิกรไทย'],
  };
  const list = hints[bc];
  if (!list) return false;
  return list.some((h) => p.includes(h));
}

/**
 * @param {unknown[]} accounts
 * @param {string} bankCode
 * @param {string} enteredDigits normalized digits-only
 * @returns {{ matched: boolean, account_name?: string }}
 */
export function findMatchingBankAccountForMb(accounts, bankCode, enteredDigits) {
  const entered = normalizeBankDigits(enteredDigits);
  if (!entered || entered.length < 10) return { matched: false };
  for (const acc of accounts) {
    if (!acc || typeof acc !== 'object') continue;
    const type = String(/** @type {Record<string, unknown>} */(acc).type || '').toLowerCase();
    if (type && type !== 'bank') continue;
    const providerName = /** @type {Record<string, unknown>} */ (acc).provider_name;
    const accountNumber = /** @type {Record<string, unknown>} */ (acc).account_number;
    const accountName = /** @type {Record<string, unknown>} */ (acc).account_name;
    if (!providerNameMatchesMbBankCode(bankCode, String(providerName || ''))) continue;
    const acctDigits = normalizeBankDigits(String(accountNumber || ''));
    if (acctDigits && acctDigits === entered) {
      return { matched: true, account_name: String(accountName || '').trim() || undefined };
    }
  }
  return { matched: false };
}

/**
 * @param {{ matched: boolean }} matchResult from findMatchingBankAccountForMb
 * @param {boolean} mismatchAck client acknowledges using account not on profile
 */
export function assertMbProfileGate(matchResult, mismatchAck) {
  if (matchResult?.matched) return { ok: true };
  if (mismatchAck === true || mismatchAck === 'true') return { ok: true };
  return {
    ok: false,
    code: 'mobile_banking_confirmation_required',
    error:
      'เลขบัญชีไม่ตรงกับข้อมูลที่บันทึกในระบบ — โปรดตรวจธนาคารและเลขบัญชี หรือติ๊กยืนยันเมื่อใช้บัญชีที่ยังไม่ได้บันทึกในโปรไฟล์',
  };
}
