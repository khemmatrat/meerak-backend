/**
 * Phase 0 — Traffic tagging primitives (routing prep, no routing yet)
 *
 * Pure helpers: safe to call from handlers in future phases.
 * Phase 0 does NOT import this module from server routes (zero behaviour change).
 */

function headerString(headers, names) {
  if (!headers) return '';
  for (const n of names) {
    const raw = headers[n];
    const v =
      typeof raw === 'string' ? raw : Array.isArray(raw) ? String(raw[0] || '') : '';
    const t = v.trim();
    if (t) return t.slice(0, 200);
  }
  return '';
}

function parseClientAttempt(raw) {
  const n = parseInt(String(raw || '').trim(), 10);
  return Number.isFinite(n) ? n : undefined;
}

/** Heuristic UA match for embedded in-app browsers (same spirit as frontend hints). */
export function uaIndicatesEmbeddedSocialWebView(userAgent) {
  const ua = String(userAgent || '');
  return /FBAN|FBAV|FB_IAB|Instagram|LINE\/|; wv\b|TikTok|Messenger\b|\bwv\b\)/i.test(ua);
}

/**
 * @typedef {Readonly<{ routeVersionHint: string, clientPlatform?: string, embeddedBrowserUaHint: boolean, clientRegistrationAttempt?: number, retrySource?: string, recoveryPathHint?: string, idempotencyKeyPresent: boolean }>} SignupTrafficTags
 */

/**
 * Build traffic tags from an Express/Node request + optional overlays.
 *
 * @param {*} req Typically Express req
 * @param {Partial<{ retrySource?: string, recoveryPathHint?: string, routeVersionHint?: string }>} [extra]
 * @returns {SignupTrafficTags}
 */
export function buildSignupTrafficTags(req, extra = {}) {
  const h = req && req.headers ? req.headers : {};

  const idempotencyKeyPresent = Boolean(headerString(h, ['idempotency-key', 'x-idempotency-key']));

  /** Phase 0: fixed 'v1' until ENABLE_SIGNUP_TRAFFIC_ROUTER exists and gates real routing logic. */
  const routeVersionHint = extra.routeVersionHint || 'v1';

  return Object.freeze({
    routeVersionHint,
    clientPlatform: headerString(h, ['x-client-platform', 'x-aqond-client-platform']) || undefined,
    embeddedBrowserUaHint: uaIndicatesEmbeddedSocialWebView(req && req.headers && req.headers['user-agent']),
    clientRegistrationAttempt: parseClientAttempt(headerString(h, ['x-registration-client-attempt'])),
    retrySource: typeof extra.retrySource === 'string' ? extra.retrySource.slice(0, 128) : undefined,
    recoveryPathHint: typeof extra.recoveryPathHint === 'string' ? extra.recoveryPathHint.slice(0, 128) : undefined,
    idempotencyKeyPresent,
  });
}
