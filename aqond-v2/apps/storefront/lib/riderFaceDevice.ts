const FP_KEY = 'aqond_rider_device_fp';

function simpleHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Stable device fingerprint for Level C session binding. */
export function getRiderDeviceFingerprint(): string {
  if (typeof window === 'undefined') return '';
  try {
    const cached = localStorage.getItem(FP_KEY);
    if (cached) return cached;
    const parts = [
      navigator.userAgent,
      navigator.language,
      String(screen.width),
      String(screen.height),
      String(screen.colorDepth),
      Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    ];
    const fp = `rdf_${simpleHash(parts.join('|'))}`;
    localStorage.setItem(FP_KEY, fp);
    return fp;
  } catch {
    return 'rdf_unknown';
  }
}

export const RIDER_FACE_TOKEN_KEY = 'aqond_rider_face_session';

export function loadRiderFaceSessionToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    return sessionStorage.getItem(RIDER_FACE_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function saveRiderFaceSessionToken(token: string) {
  if (typeof window === 'undefined') return;
  try {
    if (token) sessionStorage.setItem(RIDER_FACE_TOKEN_KEY, token);
    else sessionStorage.removeItem(RIDER_FACE_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}
