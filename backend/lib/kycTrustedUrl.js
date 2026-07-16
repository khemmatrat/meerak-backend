/** Trusted KYC image URLs — from /upload/document (kyc_uploads) or multipart kyc paths. */
export function isTrustedKycImageUrl(candidate) {
  const s = typeof candidate === 'string' ? candidate.trim() : '';
  if (!s.startsWith('https://') || s.length > 6000) return false;
  if (s.includes('kyc_uploads')) return true;
  if (/\/kyc\/[0-9a-fA-F-]{36}\//i.test(s)) return true;
  const extraRaw = process.env.KYC_EXTRA_TRUST_IMAGE_URL_REGEX;
  if (extraRaw != null && String(extraRaw).trim()) {
    try {
      const re = new RegExp(extraRaw.trim().slice(0, 200), 'i');
      if (re.test(s)) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}
