/**
 * Lightweight Bearer identity for routes that aren't using authenticateToken.
 * Mirrors mock-jwt-token / mock_ / JWT.sub resolution (no force-logout check).
 */

import jwt from 'jsonwebtoken';

/**
 * @param {string | undefined} authHeader Authorization header value
 * @returns {string | null} logical user id (sub string)
 */
export function resolveUserIdFromBearerAuthHeader(authHeader) {
  const auth = typeof authHeader === 'string' ? authHeader.trim() : '';
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  let userId = null;

  if (token.startsWith('mock-jwt-token-')) {
    const rest = token.slice('mock-jwt-token-'.length);
    const lastDash = rest.lastIndexOf('-');
    userId = lastDash > 0 ? rest.slice(0, lastDash) : rest;
  }
  if (!userId && token.startsWith('mock_')) {
    try {
      const payload = JSON.parse(Buffer.from(token.slice(5), 'base64').toString('utf8'));
      userId = payload.user_id ? String(payload.user_id) : null;
    } catch (_) {
      /* ignore */
    }
  }
  if (!userId) {
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) return null;
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      userId = String(payload.sub);
    } catch (_) {
      return null;
    }
  }
  return userId || null;
}
