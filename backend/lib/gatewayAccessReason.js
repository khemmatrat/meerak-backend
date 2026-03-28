/**
 * Strict admin access: require documented reason before returning masked gateway data.
 */

const HEADER = 'x-aqond-access-reason';

/**
 * @param {import('express').Request} req
 * @returns {string|null}
 */
export function getGatewayAccessReason(req) {
  const q = req.query?.reason;
  const h =
    (typeof req.get === 'function' ? req.get('X-AQOND-Access-Reason') : null) ||
    req.headers?.[HEADER] ||
    req.headers?.[HEADER.toLowerCase()];
  const raw = (q != null && String(q).trim() !== '' ? String(q) : h != null ? String(h) : '').trim();
  return raw.length > 0 ? raw.slice(0, 500) : null;
}

/**
 * @param {import('express').Request} req
 * @returns {{ ok: boolean, reason?: string, error?: string }}
 */
export function requireGatewayAccessReason(req) {
  const reason = getGatewayAccessReason(req);
  if (!reason || reason.length < 3) {
    return {
      ok: false,
      error: 'access_reason_required',
      errorDetail:
        'Provide ?reason=... (min 3 chars) or header X-AQOND-Access-Reason — e.g. dispute_investigation, fraud_check',
    };
  }
  return { ok: true, reason };
}
