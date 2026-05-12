/**
 * Admin: TOTP (Google Authenticator), IP whitelist helpers, login alerts
 * otplib v13 — ไม่มี named export `authenticator`; ใช้ generateSecret / verifySync / generateURI
 */
import { generateSecret, verifySync, generateURI } from 'otplib';
import QRCode from 'qrcode';
import jwt from 'jsonwebtoken';

/** เทียบเท่า authenticator.options.window = 1 (ช่วงเวลา ±1 step) */
const TOTP_EPOCH_TOLERANCE = [1, 1];

export function generateTotpSecret() {
  return generateSecret();
}

export function verifyTotpToken(secret, token) {
  if (!secret || token == null) return false;
  const cleaned = String(token).replace(/\s/g, '');
  if (!/^\d{6}$/.test(cleaned)) return false;
  try {
    const r = verifySync({
      token: cleaned,
      secret,
      epochTolerance: TOTP_EPOCH_TOLERANCE,
    });
    return r.valid === true;
  } catch {
    return false;
  }
}

export function totpKeyUri(secret, email, issuer = 'AQOND Admin') {
  return generateURI({ secret, label: email, issuer });
}

export async function totpQrDataUrl(secret, email) {
  const uri = totpKeyUri(secret, email);
  return QRCode.toDataURL(uri);
}

/** JWT หลังรหัสผ่านถูก — ยังไม่ได้ยืนยัน TOTP */
export function signAdminMfaPendingJwt(payload, jwtSecret) {
  return jwt.sign(
    {
      typ: 'admin_mfa_pending',
      sub: String(payload.userId),
      email: payload.email,
      stage: payload.stage,
    },
    jwtSecret,
    { expiresIn: '12m' }
  );
}

export function verifyAdminMfaPendingJwt(token, jwtSecret) {
  try {
    const p = jwt.verify(token, jwtSecret);
    if (p.typ !== 'admin_mfa_pending' || !p.sub || !p.stage) return null;
    if (p.stage !== 'enroll' && p.stage !== 'totp') return null;
    return { userId: String(p.sub), email: p.email, stage: p.stage };
  } catch {
    return null;
  }
}

export function signAdminAccessToken(user, jwtSecret, mfaVerified) {
  const permissions = Array.isArray(user.permissions) ? user.permissions.map(String) : [];
  return jwt.sign(
    {
      sub: String(user.id),
      role: user.role,
      email: user.email,
      mfa: !!mfaVerified,
      permissions,
    },
    jwtSecret,
    { expiresIn: '24h' }
  );
}

/**
 * ADMIN_IP_WHITELIST — คั่นด้วยจุลภาค เช่น 203.0.113.10,198.51.100.0
 * ถ้าไม่ตั้ง = อนุญาตทุก IP (development)
 * ADMIN_IP_ALLOW_LOCALHOST=0 — ปิดการยกเว้น localhost
 */
export function checkAdminIpAllowed(req, getClientIp, isLocalhost) {
  const raw = process.env.ADMIN_IP_WHITELIST;
  if (!raw || !String(raw).trim()) return { ok: true };
  const ip = getClientIp(req);
  if (isLocalhost(ip) && process.env.ADMIN_IP_ALLOW_LOCALHOST !== '0') {
    return { ok: true };
  }
  const allowed = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (allowed.includes(ip)) return { ok: true };
  if (ip === '::ffff:127.0.0.1' && allowed.includes('127.0.0.1')) return { ok: true };
  return { ok: false, ip };
}

export async function notifyAdminLoginEvent({ type, email, ip, detail }) {
  const payload = {
    event: type === 'success' ? 'admin_login_success' : 'admin_login_failed',
    email: email || '',
    ip: ip || 'unknown',
    detail: detail || null,
    at: new Date().toISOString(),
  };
  const url = process.env.ADMIN_SECURITY_WEBHOOK_URL;
  if (url && /^https?:\/\//i.test(url)) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (process.env.ADMIN_SECURITY_WEBHOOK_SECRET) {
        headers['X-Webhook-Secret'] = process.env.ADMIN_SECURITY_WEBHOOK_SECRET;
      }
      await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
    } catch (e) {
      console.warn('ADMIN_SECURITY_WEBHOOK_URL failed:', e.message);
    }
  }
  if (process.env.ADMIN_LOGIN_LINE_NOTIFY === '1') {
    try {
      const { sendLineNotify } = await import('./alertNotifier.js');
      const msg = `[Admin ${type}] ${email}\nIP: ${ip}\n${detail || ''}`.slice(0, 980);
      await sendLineNotify(msg);
    } catch (e) {
      console.warn('admin login Line notify:', e.message);
    }
  }
  const emailTo = process.env.ADMIN_LOGIN_ALERT_EMAIL;
  if (emailTo) {
    try {
      const { sendAlertEmail } = await import('./alertNotifier.js');
      await sendAlertEmail({
        to: emailTo,
        subject: `[AQOND Admin] Login ${type}`,
        text: JSON.stringify(payload, null, 2),
      });
    } catch (e) {
      console.warn('admin login email:', e.message);
    }
  }
}
