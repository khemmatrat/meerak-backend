/**
 * จับคู่คำขอถอนกับบัญชีบริษัทเดียว (system_settings.company_sole_disbursement_bank_account_id)
 * ใช้ตัดสินว่าต้องอนุมัติด้วย SUPER_ADMIN หรือไม่
 */

/** @param {unknown} s */
export function normalizeAccountNumberForMatch(s) {
  return String(s ?? '')
    .replace(/\s/g, '')
    .replace(/-/g, '');
}

/**
 * @param {Record<string, unknown> | null | undefined} bd
 * @returns {string}
 */
export function payoutBankAccountNumberFromDetails(bd) {
  if (!bd || typeof bd !== 'object') return '';
  const raw = bd.account_number ?? bd.accountNumber ?? bd.account;
  return normalizeAccountNumberForMatch(raw);
}

/**
 * @typedef {{ id: string; accountNumberNormalized: string }} SoleCompanyInfo
 */

let soleInfoCache = /** @type {{ at: number; info: SoleCompanyInfo | null | undefined }} */ ({ at: 0, info: undefined });
const CACHE_MS = 5000;

export function invalidateSoleCompanyDisbursementCache() {
  soleInfoCache = { at: 0, info: undefined };
}

/**
 * @param {import('pg').Pool} pool
 * @returns {Promise<SoleCompanyInfo | null>}
 */
export async function getSoleCompanyDisbursementInfo(pool) {
  const now = Date.now();
  if (now - soleInfoCache.at < CACHE_MS && soleInfoCache.info !== undefined) {
    return soleInfoCache.info;
  }
  soleInfoCache.at = now;
  try {
    const r = await pool.query(`SELECT value FROM system_settings WHERE key = 'company_sole_disbursement_bank_account_id'`);
    const id = String(r.rows?.[0]?.value || '').trim();
    if (!id) {
      soleInfoCache.info = null;
      return null;
    }
    const acc = await pool.query(
      `SELECT id, account_number FROM company_bank_accounts WHERE id::text = $1 AND is_active = true`,
      [id]
    );
    const row = acc.rows?.[0];
    if (!row?.id) {
      soleInfoCache.info = null;
      return null;
    }
    soleInfoCache.info = {
      id: String(row.id),
      accountNumberNormalized: normalizeAccountNumberForMatch(row.account_number),
    };
    return soleInfoCache.info;
  } catch {
    soleInfoCache.info = null;
    return null;
  }
}

/**
 * @param {Record<string, unknown> | null | undefined} bankDetails
 * @param {SoleCompanyInfo | null} soleInfo
 */
export function isPayoutDestinationCompanySoleDisbursementSync(bankDetails, soleInfo) {
  if (!soleInfo) return false;
  const bd = bankDetails && typeof bankDetails === 'object' ? bankDetails : {};
  const cid = String(bd.company_bank_account_id ?? bd.companyBankAccountId ?? '').trim();
  if (cid && cid === soleInfo.id) return true;
  const dest = payoutBankAccountNumberFromDetails(bd);
  if (soleInfo.accountNumberNormalized && dest && dest === soleInfo.accountNumberNormalized) return true;
  return false;
}

/**
 * @param {import('pg').Pool} pool
 * @param {Record<string, unknown> | null | undefined} bankDetails
 */
export async function isPayoutDestinationCompanySoleDisbursement(pool, bankDetails) {
  const soleInfo = await getSoleCompanyDisbursementInfo(pool);
  return isPayoutDestinationCompanySoleDisbursementSync(bankDetails, soleInfo);
}
