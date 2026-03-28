/**
 * @fileoverview PCI-DSS oriented masking — safe for logs and API responses.
 * Never log full PAN, track data, CVV, or government IDs.
 */

const SENSITIVE_KEYS = new Set([
  'pan',
  'card_number',
  'cardnumber',
  'cvv',
  'cvc',
  'cvc2',
  'track1',
  'track2',
  'pin',
  'password',
  'national_id',
  'citizen_id',
]);

/**
 * @param {string} pan
 * @returns {string}
 */
export function maskCardLast4(pan) {
  const d = String(pan || '').replace(/\D/g, '');
  if (d.length < 4) return '****';
  return `****${d.slice(-4)}`;
}

/**
 * @param {string} email
 * @returns {string}
 */
export function maskEmail(email) {
  const s = String(email || '').trim();
  const at = s.indexOf('@');
  if (at <= 0) return '***';
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  const vis = local.length <= 1 ? '*' : `${local[0]}***`;
  return `${vis}@${domain}`;
}

/**
 * @param {string} phone
 * @returns {string}
 */
export function maskPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length < 4) return '****';
  return `***${d.slice(-4)}`;
}

/**
 * Strip or mask nested sensitive fields for persistence / API.
 * @param {unknown} meta
 * @param {{ depth?: number }} [opt]
 * @returns {Record<string, unknown>}
 */
export function sanitizeMetadata(meta, opt = {}) {
  const depth = opt.depth ?? 0;
  if (depth > 8) return {};
  if (meta == null || typeof meta !== 'object' || Array.isArray(meta)) return {};
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(meta)) {
    const key = k.toLowerCase();
    if (SENSITIVE_KEYS.has(key)) {
      out[k] = '[redacted]';
      continue;
    }
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = sanitizeMetadata(v, { depth: depth + 1 });
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Mask merchant reference for display (keep length hint only).
 * @param {string} ref
 * @returns {string}
 */
export function maskMerchantReference(ref) {
  const s = String(ref || '').trim();
  if (s.length <= 4) return s ? '****' : '';
  return `${s.slice(0, 2)}…${s.slice(-2)}`;
}

/**
 * @param {string | null | undefined} ip
 * @returns {string | null}
 */
export function maskIpForDisplay(ip) {
  if (ip == null || String(ip).trim() === '') return null;
  const s = String(ip).trim();
  if (s.includes('.')) {
    const p = s.split('.');
    if (p.length === 4) return `***.***.${p[2]}.${p[3]}`;
  }
  return '[redacted]';
}
