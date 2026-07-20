/**
 * SRP-W1-01 — Mount server-side phone OTP routes (from isolated identity WIP libs).
 * No change to login/register handlers; wires existing phoneOtpAuth.js.
 */
import { sendAuthPhoneOtp, verifyAuthPhoneOtp } from './phoneOtpAuth.js';

/**
 * @param {import('express').Express} app
 * @param {object} deps
 */
export function registerAuthPhoneOtpRoutes(app, deps) {
  const {
    authLimiter,
    normalizePhoneForStorage,
    getClientIp,
    isLocalhost,
    isRateLimitUnlocked,
    checkRateLimit,
    sendRateLimitResponse,
    RATE_LIMIT_OTP_PHONE,
    RATE_LIMIT_OTP_REQUEST_IP,
    getRedisClient,
    getPool,
  } = deps;

  app.post('/api/auth/phone-otp/send', authLimiter, async (req, res) => {
    try {
      const phoneRaw = req.body?.phone;
      const purpose = String(req.body?.purpose || 'register').trim();
      if (!phoneRaw || !String(phoneRaw).trim()) {
        return res.status(400).json({ error: 'Phone number required' });
      }
      const phoneNorm = normalizePhoneForStorage(String(phoneRaw).trim());
      const ip = getClientIp(req);
      if (!isLocalhost(ip) && !isRateLimitUnlocked(req)) {
        const [byPhone, byIp] = await Promise.all([
          checkRateLimit('auth_otp_phone', phoneNorm, RATE_LIMIT_OTP_PHONE),
          checkRateLimit('auth_otp_ip', ip, RATE_LIMIT_OTP_REQUEST_IP),
        ]);
        if (!byPhone.allowed) {
          return sendRateLimitResponse(
            res,
            byPhone.retryAfter,
            `ขอรหัส OTP บ่อยเกินไป ลองใหม่ใน ${byPhone.retryAfter || 60} วินาที`,
          );
        }
        if (!byIp.allowed) {
          return sendRateLimitResponse(res, byIp.retryAfter, 'Too many OTP requests from this network.');
        }
      }
      const result = await sendAuthPhoneOtp({
        redisClient: getRedisClient(),
        pool: getPool(),
        phoneNorm,
        purpose,
        ip,
      });
      return res.json(result);
    } catch (e) {
      const code = e?.code;
      if (code === 'USER_NOT_FOUND') {
        return res.status(404).json({ error: e.message || 'ไม่พบบัญชีที่ผูกกับเบอร์นี้' });
      }
      if (code === 'PHONE_ALREADY_REGISTERED') {
        return res.status(409).json({ error: e.message });
      }
      if (code === 'SMS_CONFIG') {
        console.error('[phone-otp/send] SMS not configured:', e.message);
        return res.status(503).json({
          error: 'ระบบส่ง SMS ยังไม่พร้อม — ตั้งค่า THAIBULKSMS หรือ AQOND_SMS_PROVIDER บนเซิร์ฟเวอร์',
          code: 'sms_not_configured',
        });
      }
      if (code === 'SMS_SEND_FAILED') {
        console.error('[phone-otp/send] SMS failed:', e.message);
        return res.status(502).json({ error: 'ส่ง SMS ไม่สำเร็จ กรุณาลองใหม่' });
      }
      console.error('[phone-otp/send]', e?.message || e);
      return res.status(500).json({ error: 'Request failed' });
    }
  });

  app.post('/api/auth/phone-otp/verify', authLimiter, async (req, res) => {
    try {
      const phoneRaw = req.body?.phone;
      const purpose = String(req.body?.purpose || 'register').trim();
      const code = req.body?.code ?? req.body?.otp;
      if (!phoneRaw || !String(phoneRaw).trim()) {
        return res.status(400).json({ error: 'Phone number required' });
      }
      const phoneNorm = normalizePhoneForStorage(String(phoneRaw).trim());
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        return res.status(500).json({ error: 'Server misconfiguration: JWT_SECRET required' });
      }
      const result = await verifyAuthPhoneOtp({
        redisClient: getRedisClient(),
        jwtSecret,
        phoneNorm,
        purpose,
        code,
      });
      return res.json(result);
    } catch (e) {
      const code = e?.code;
      if (code === 'OTP_EXPIRED') {
        return res.status(410).json({ error: 'รหัส OTP หมดอายุแล้ว กดส่งรหัสใหม่ได้เลย' });
      }
      if (code === 'INVALID_OTP' || code === 'OTP_LOCKED') {
        return res.status(401).json({
          error:
            code === 'OTP_LOCKED'
              ? 'ลองผิดเกินจำนวนที่กำหนด กรุณาขอ OTP ใหม่'
              : 'รหัส OTP ไม่ถูกต้อง',
        });
      }
      console.error('[phone-otp/verify]', e?.message || e);
      return res.status(500).json({ error: 'Verification failed' });
    }
  });
}
