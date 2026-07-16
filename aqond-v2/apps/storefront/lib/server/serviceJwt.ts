import crypto from 'crypto';

function jwtSecret(): string {
  return (
    process.env.JWT_SECRET ||
    process.env.MEERAK_JWT_SECRET ||
    process.env.KONG_JWT_SECRET ||
    ''
  ).trim();
}

/** Mint backend-compatible HS256 JWT ({ sub }) for meerak server.js authenticateToken. */
export function mintBackendJwt(userId: string, role = 'USER'): string {
  const secret = jwtSecret();
  if (!secret || !userId) return '';
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      sub: String(userId),
      role,
      iat: now,
      exp: now + 3600,
    }),
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

/** Mint Kong-compatible HS256 JWT (iss: aqond-jwt-issuer) for server → Kong calls. */
export function mintServiceJwt(userId: string, sessionId = 'server'): string {
  const secret = (process.env.KONG_JWT_SECRET || process.env.MEERAK_JWT_SECRET || '').trim();
  if (!secret || !userId) return '';
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      iss: 'aqond-jwt-issuer',
      sub: userId,
      sid: sessionId,
      amr: 'server',
      exp: now + 3600,
      iat: now,
    }),
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}
