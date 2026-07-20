/**
 * Server-side phone OTP (no reCAPTCHA) — Redis + in-memory fallback
 */
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { deliverAuthOtpSms, stablePhoneFirebaseUid } from './smsOtpDelivery.js';

export { stablePhoneFirebaseUid };

const OTP_TTL_SEC = parseInt(process.env.AUTH_OTP_TTL_SEC || '300', 10);
const OTP_MAX_ATTEMPTS = parseInt(process.env.AUTH_OTP_MAX_ATTEMPTS || '5', 10);
const PHONE_VERIFY_JWT_TTL_SEC = parseInt(process.env.AUTH_PHONE_VERIFY_JWT_TTL_SEC || '3600', 10);

/** @type {Map<string, { hash: string, attempts: number, exp: number }>} */
const memoryOtpStore = new Map();

function otpRedisKey(purpose, phoneNorm) {
  return `auth_otp:${purpose}:${phoneNorm}`;
}

function pruneMemoryStore() {
  const now = Date.now();
  for (const [k, v] of memoryOtpStore.entries()) {
    if (v.exp <= now) memoryOtpStore.delete(k);
  }
}

async function storeOtpCode(redisClient, purpose, phoneNorm, code) {
  const hash = await bcrypt.hash(code, 8);
  const payload = JSON.stringify({ hash, attempts: 0 });
  const key = otpRedisKey(purpose, phoneNorm);
  if (redisClient) {
    await redisClient.setEx(key, OTP_TTL_SEC, payload);
    return;
  }
  pruneMemoryStore();
  memoryOtpStore.set(key, {
    hash,
    attempts: 0,
    exp: Date.now() + OTP_TTL_SEC * 1000,
  });
}

async function loadOtpRecord(redisClient, purpose, phoneNorm) {
  const key = otpRedisKey(purpose, phoneNorm);
  if (redisClient) {
    const raw = await redisClient.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  pruneMemoryStore();
  const row = memoryOtpStore.get(key);
  if (!row || row.exp <= Date.now()) {
    memoryOtpStore.delete(key);
    return null;
  }
  return { hash: row.hash, attempts: row.attempts };
}

async function saveOtpRecord(redisClient, purpose, phoneNorm, record) {
  const key = otpRedisKey(purpose, phoneNorm);
  const payload = JSON.stringify({ hash: record.hash, attempts: record.attempts });
  if (redisClient) {
    const ttl = await redisClient.ttl(key);
    const sec = ttl > 0 ? ttl : OTP_TTL_SEC;
    await redisClient.setEx(key, sec, payload);
    return;
  }
  const existing = memoryOtpStore.get(key);
  memoryOtpStore.set(key, {
    hash: record.hash,
    attempts: record.attempts,
    exp: existing?.exp || Date.now() + OTP_TTL_SEC * 1000,
  });
}

async function deleteOtpRecord(redisClient, purpose, phoneNorm) {
  const key = otpRedisKey(purpose, phoneNorm);
  if (redisClient) {
    await redisClient.del(key);
    return;
  }
  memoryOtpStore.delete(key);
}

function generateOtpCode() {
  return String(crypto.randomInt(100000, 1000000));
}

export function signPhoneVerificationToken(phoneNorm, purpose, jwtSecret) {
  return jwt.sign(
    {
      typ: 'phone_otp_verified',
      purpose,
      phone: phoneNorm,
    },
    jwtSecret,
    { expiresIn: PHONE_VERIFY_JWT_TTL_SEC },
  );
}

export function verifyPhoneVerificationToken(tokenRaw, phoneNorm, purpose, jwtSecret) {
  const token = String(tokenRaw || '').trim();
  if (!token) {
    const e = new Error('missing_phone_verification_token');
    e.code = 'MISSING_TOKEN';
    throw e;
  }
  const decoded = jwt.verify(token, jwtSecret);
  if (decoded.typ !== 'phone_otp_verified' || decoded.purpose !== purpose) {
    const e = new Error('invalid_phone_verification_token');
    e.code = 'INVALID_TOKEN';
    throw e;
  }
  if (String(decoded.phone) !== String(phoneNorm)) {
    const e = new Error('phone_mismatch');
    e.code = 'PHONE_MISMATCH';
    throw e;
  }
  return decoded;
}

const VALID_PURPOSES = new Set(['register', 'reset_password', 'login']);

/**
 * @param {{ redisClient: any, pool: any, phoneNorm: string, purpose: string, ip: string, normalizePhoneForStorage: (p: string) => string }}
 */
export async function sendAuthPhoneOtp(ctx) {
  const { redisClient, pool, phoneNorm, purpose, ip } = ctx;
  if (!VALID_PURPOSES.has(purpose)) {
    const e = new Error('invalid_purpose');
    e.code = 'INVALID_PURPOSE';
    throw e;
  }

  if (purpose === 'reset_password' || purpose === 'login') {
    const phoneAlt = phoneNorm.startsWith('0') ? '66' + phoneNorm.slice(1) : phoneNorm.startsWith('66') ? '0' + phoneNorm.slice(2) : null;
    const phoneE164 = phoneNorm.startsWith('0') ? '+66' + phoneNorm.slice(1) : phoneNorm.startsWith('66') ? '+' + phoneNorm : null;
    const userResult = await pool.query(
      'SELECT id FROM users WHERE phone = $1 OR (phone = $2 AND $2 IS NOT NULL) OR (phone = $3 AND $3 IS NOT NULL) LIMIT 1',
      [phoneNorm, phoneAlt, phoneE164],
    );
    if (!userResult.rows.length) {
      const e = new Error('ไม่พบบัญชีที่ผูกกับเบอร์นี้');
      e.code = 'USER_NOT_FOUND';
      e.httpStatus = 404;
      throw e;
    }
  }

  if (purpose === 'register') {
    const phoneAlt = phoneNorm.startsWith('0') ? '66' + phoneNorm.slice(1) : phoneNorm.startsWith('66') ? '0' + phoneNorm.slice(2) : null;
    const existing = await pool.query(
      'SELECT id FROM users WHERE phone = $1 OR (phone = $2 AND $2 IS NOT NULL) LIMIT 1',
      [phoneNorm, phoneAlt],
    );
    if (existing.rows.length) {
      const e = new Error('เบอร์โทรนี้มีบัญชีแล้ว — โปรดเข้าสู่ระบบ');
      e.code = 'PHONE_ALREADY_REGISTERED';
      e.httpStatus = 409;
      throw e;
    }
  }

  const code = generateOtpCode();
  await storeOtpCode(redisClient, purpose, phoneNorm, code);

  let delivery;
  try {
    delivery = await deliverAuthOtpSms(phoneNorm, code);
  } catch (smsErr) {
    await deleteOtpRecord(redisClient, purpose, phoneNorm);
    throw smsErr;
  }

  console.log(`📱 auth-otp sent purpose=${purpose} phone=${phoneNorm.slice(0, 3)}*** ip=${ip} provider=${delivery.provider}`);

  const out = {
    success: true,
    message: 'ส่งรหัส OTP แล้ว กรุณาตรวจ SMS',
    expires_in: OTP_TTL_SEC,
    provider: delivery.provider,
  };
  if (delivery.devCode && process.env.AQOND_OTP_DEV_EXPOSE !== '0') {
    out.dev_code = delivery.devCode;
  }
  return out;
}

export async function verifyAuthPhoneOtp(ctx) {
  const { redisClient, jwtSecret, phoneNorm, purpose, code } = ctx;
  if (!VALID_PURPOSES.has(purpose)) {
    const e = new Error('invalid_purpose');
    e.code = 'INVALID_PURPOSE';
    throw e;
  }
  const trimmed = String(code || '').trim();
  if (!/^\d{6}$/.test(trimmed)) {
    const e = new Error('invalid_otp_format');
    e.code = 'INVALID_OTP';
    throw e;
  }

  const record = await loadOtpRecord(redisClient, purpose, phoneNorm);
  if (!record) {
    const e = new Error('otp_expired');
    e.code = 'OTP_EXPIRED';
    throw e;
  }
  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    await deleteOtpRecord(redisClient, purpose, phoneNorm);
    const e = new Error('too_many_attempts');
    e.code = 'OTP_LOCKED';
    throw e;
  }

  const ok = await bcrypt.compare(trimmed, record.hash);
  if (!ok) {
    record.attempts += 1;
    await saveOtpRecord(redisClient, purpose, phoneNorm, record);
    const e = new Error('invalid_otp');
    e.code = 'INVALID_OTP';
    throw e;
  }

  await deleteOtpRecord(redisClient, purpose, phoneNorm);

  if (!jwtSecret) {
    const e = new Error('JWT_SECRET missing');
    e.code = 'SERVER_CONFIG';
    throw e;
  }

  const phone_verification_token = signPhoneVerificationToken(phoneNorm, purpose, jwtSecret);
  const phone_verified_uid = stablePhoneFirebaseUid(phoneNorm);

  return {
    success: true,
    message: 'ยืนยันเบอร์โทรสำเร็จ',
    phone: phoneNorm,
    phone_verification_token,
    phone_verified_uid,
    /** legacy field names for existing clients */
    firebase_token: phone_verification_token,
    firebase_uid: phone_verified_uid,
  };
}
