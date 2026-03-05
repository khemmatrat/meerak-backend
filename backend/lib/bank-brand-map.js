/**
 * Map Thai bank names (from user input) to Omise Recipient API brand codes.
 * @see https://docs.omise.co/supported-banks
 */
const BANK_BRAND_MAP = {
  // Bangkok Bank
  bbl: ['bbl', 'bangkok', 'กรุงเทพ', 'bb', 'bangkok bank', 'bualuang'],
  // Kasikorn
  kbank: ['kbank', 'kasikorn', 'กสิกร', 'kbank', 'k-plus'],
  // Siam Commercial
  scb: ['scb', 'siam commercial', 'ไทยพาณิชย์', 'scb easy'],
  // Krung Thai
  ktb: ['ktb', 'krungthai', 'krung thai', 'กรุงไทย'],
  // Bank of Ayudhya / Krungsri
  bay: ['bay', 'krungsri', 'ayudhya', 'กรุงศรี', 'krung sri'],
  // TMBThanachart
  ttb: ['ttb', 'tmb', 'ทหารไทย', 'thanachart', 'tmbb'],
  // Government Savings Bank
  gsb: ['gsb', 'ออมสิน', 'government savings'],
  // BAAC
  baac: ['baac', 'ธกส', 'เพื่อการเกษตร', 'agriculture'],
  // Islamic Bank
  ibank: ['ibank', 'islamic', 'อิสลาม'],
  // CIMB
  cimb: ['cimb', 'cimb thai'],
  // UOB
  uob: ['uob', 'united overseas'],
  // GHB
  ghb: ['ghb', 'government housing', 'ธนาคารอาคารสงเคราะห์'],
  // Tisco
  tisco: ['tisco', 'ทิสโก้'],
  // Land and Houses
  lhb: ['lhb', 'land and houses', 'แลนด์ แอนด์ เฮ้าส์'],
  // Kiatnakin
  kk: ['kk', 'kiatnakin', 'เกียรตินาคิน'],
  // Standard Chartered
  sc: ['sc', 'standard chartered', 'สแตนดาร์ดชาร์เตอร์ด'],
};

function normalizeBankName(name) {
  if (!name || typeof name !== 'string') return '';
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Resolve user bank name to Omise brand code.
 * @param {string} bankName - e.g. "ธนาคารกรุงเทพ", "SCB", "กสิกรไทย"
 * @returns {string|null} Omise brand code (bbl, kbank, scb, etc.) or null if not found
 */
export function resolveBankBrand(bankName) {
  const normalized = normalizeBankName(bankName);
  if (!normalized) return null;
  for (const [code, aliases] of Object.entries(BANK_BRAND_MAP)) {
    for (const alias of aliases) {
      if (normalized.includes(alias) || alias.includes(normalized)) {
        return code;
      }
    }
  }
  return null;
}
