import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { logSecurity } from '../lib/logger.js';

const RATE_LIMIT_UNLOCK_TTL_SEC = 60 * 60;
const SELF_UNLOCK_DAILY_LIMIT = 3;
const rateLimitUnlocks = new Map();
const selfUnlockDailyUsage = new Map();

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeUserIdForUnlock(userId) {
  const s = String(userId || '').trim();
  return s || null;
}

function pruneUnlock(userId) {
  const uid = normalizeUserIdForUnlock(userId);
  if (!uid) return null;
  const entry = rateLimitUnlocks.get(uid);
  if (!entry) return null;
  if (Date.now() >= Number(entry.expiresAt || 0)) {
    rateLimitUnlocks.delete(uid);
    return null;
  }
  return entry;
}

function userIdFromBearer(req) {
  const auth = req.headers?.authorization || '';
  if (!auth.startsWith('Bearer ') || !process.env.JWT_SECRET) return null;
  try {
    const payload = jwt.verify(auth.slice(7).trim(), process.env.JWT_SECRET);
    return normalizeUserIdForUnlock(payload?.sub);
  } catch (_) {
    return null;
  }
}

function resolveUnlockUserId(req) {
  return (
    normalizeUserIdForUnlock(req.user?.id) ||
    normalizeUserIdForUnlock(req.params?.id) ||
    normalizeUserIdForUnlock(req.params?.userId) ||
    normalizeUserIdForUnlock(req.body?.userId) ||
    userIdFromBearer(req)
  );
}

export function getRateLimitUnlockStatus(userId) {
  const uid = normalizeUserIdForUnlock(userId);
  const entry = uid ? pruneUnlock(uid) : null;
  const usageKey = `${uid || 'unknown'}:${todayKey()}`;
  const usedToday = Number(selfUnlockDailyUsage.get(usageKey)?.count || 0);
  return {
    unlocked: !!entry,
    expires_at: entry ? new Date(entry.expiresAt).toISOString() : null,
    source: entry?.source || null,
    self_unlocks_used_today: usedToday,
    self_unlocks_remaining_today: Math.max(0, SELF_UNLOCK_DAILY_LIMIT - usedToday),
    self_unlock_daily_limit: SELF_UNLOCK_DAILY_LIMIT,
  };
}

export function grantRateLimitUnlock(userId, { source = 'admin', ttlSec = RATE_LIMIT_UNLOCK_TTL_SEC } = {}) {
  const uid = normalizeUserIdForUnlock(userId);
  if (!uid) throw new Error('userId required');
  const expiresAt = Date.now() + Math.max(60, Number(ttlSec) || RATE_LIMIT_UNLOCK_TTL_SEC) * 1000;
  rateLimitUnlocks.set(uid, { source, expiresAt, grantedAt: Date.now() });
  return getRateLimitUnlockStatus(uid);
}

export function consumeSelfRateLimitUnlock(userId) {
  const uid = normalizeUserIdForUnlock(userId);
  if (!uid) {
    const err = new Error('userId required');
    err.status = 400;
    throw err;
  }
  const key = `${uid}:${todayKey()}`;
  const now = Date.now();
  const existing = selfUnlockDailyUsage.get(key);
  const count = Number(existing?.count || 0);
  if (count >= SELF_UNLOCK_DAILY_LIMIT) {
    const err = new Error('ใช้สิทธิ์ปลดล็อก Rate Limit ครบ 3 ครั้งของวันนี้แล้ว กรุณารอวันถัดไปหรือติดต่อแอดมิน');
    err.status = 429;
    err.code = 'SELF_RATE_LIMIT_UNLOCK_DAILY_LIMIT';
    throw err;
  }
  selfUnlockDailyUsage.set(key, { count: count + 1, updatedAt: now });
  return grantRateLimitUnlock(uid, { source: 'self_service' });
}

export function isRateLimitUnlocked(req) {
  const path = req.path || req.originalUrl || '';
  if (path.includes('/rate-limit/self-unlock')) return true;
  const uid = resolveUnlockUserId(req);
  return !!(uid && pruneUnlock(uid));
}

/**
 * express-rate-limit เซ็ต req.rateLimit.resetTime (Date) เมื่อกดครบโควตา
 * ต้องส่งค่ากลับจากตรงนี้ ไม่ใช้ retryAfter เลขตายตัว เพื่อไม่ให้ user หลอกว่ายังมีเวลา / ครบแล้วก็ไม่เข้ารอบใหม่ในมุมเขา
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
function respond429LimiterWithAccurateExpiry(
  req,
  res,
  fallbackRetrySec,
  logKind,
  logData,
  body,
) {
  const resetEpochMs =
    req.rateLimit?.resetTime instanceof Date &&
      !Number.isNaN(req.rateLimit.resetTime.getTime())
      ? req.rateLimit.resetTime.getTime()
      : null;
  const retryAfterSec =
    resetEpochMs != null
      ? Math.min(
        86400 * 14,
        Math.max(1, Math.ceil((resetEpochMs - Date.now()) / 1000)),
      )
      : Math.max(1, fallbackRetrySec);
  logSecurity(logKind, logData);
  try {
    res.setHeader('Retry-After', String(retryAfterSec));
  } catch (_) {
    /* ignore */
  }
  res.status(429).json({
    ...body,
    retryAfter: retryAfterSec,
    resetEpochMs: resetEpochMs ?? Date.now() + retryAfterSec * 1000,
  });
}

// Rate Limiter สำหรับ API ทั่วไป
// Development: 10000 requests/15 min (หลวมมาก เพื่อการพัฒนา)
// Production: 500 requests/15 min (หลวมพอสมควร)
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 500 : 10000,
  skip: (req) => {
    if (req.method === 'OPTIONS') return true; // ข้าม preflight
    if (isRateLimitUnlocked(req)) return true;
    if (process.env.NODE_ENV !== 'production') {
      const ip = req.ip || req.connection.remoteAddress;
      if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
        return true;
      }
    }
    return false;
  },
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const o = req.headers.origin || '';
    const allowed = [
      'https://app.aqond.com',
      'https://admin.aqond.com',
      'https://aqond.com',
      'https://www.aqond.com',
      'https://localhost',
      'http://localhost',
      'capacitor://localhost',
    ];
    if (o && allowed.includes(o)) {
      res.setHeader('Access-Control-Allow-Origin', o);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    logSecurity('RATE_LIMIT_EXCEEDED', {
      ip: req.ip,
      path: req.path,
      method: req.method,
    });
    res.status(429).json({
      error: 'Too many requests. Please try again later.',
      retryAfter: 900,
    });
  },
});

// Auth Rate Limiter (Register)
// Development: ไม่จำกัด (เพื่อการพัฒนา)
// Production: 100 requests/15 min (หลวมพอให้ทดสอบได้สะดวก)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 100 : 10000,
  skip: (req) => {
    if (isRateLimitUnlocked(req)) return true;
    // ✅ ปิด rate limit สำหรับ localhost ใน Development
    if (process.env.NODE_ENV !== 'production') {
      const ip = req.ip || req.connection.remoteAddress;
      if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
        return true;
      }
    }
    return false;
  },
  skipSuccessfulRequests: true,
  message: 'Too many registration attempts, please try again after 15 minutes.',
  handler: (req, res) => {
    logSecurity('AUTH_RATE_LIMIT_EXCEEDED', {
      ip: req.ip,
      email: req.body?.email,
      phone: req.body?.phone,
      path: req.path,
    });
    res.status(429).json({
      error: 'Too many registration attempts. Please try again later.',
      retryAfter: 900,
    });
  },
});

// Payment Limiter (10 payment requests/5 min)
export const paymentLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: 'Too many payment requests.',
  handler: (req, res) => {
    logSecurity('PAYMENT_RATE_LIMIT_EXCEEDED', {
      ip: req.ip,
      userId: req.user?.id,
      path: req.path,
    });
    res.status(429).json({
      error: 'Too many payment requests. Please wait before retrying.',
      retryAfter: 300,
    });
  },
});

// Withdrawal Limiter — ใช้กับการ **ส่งคำขอถอนจริง** เท่านั้น (POST /api/payouts/request)
// อย่านำไปครอบ /payouts/quote — quote ควรเรียกได้ถี่กว่ามากในเซสชันเดียว
export const withdrawalLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    if (isRateLimitUnlocked(req)) return true;
    if (process.env.NODE_ENV !== 'production') {
      const ip = req.ip || req.connection?.remoteAddress;
      if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
        return true;
      }
    }
    return false;
  },
  message: 'Too many withdrawal requests.',
  handler: (req, res) => {
    respond429LimiterWithAccurateExpiry(
      req,
      res,
      3600,
      'WITHDRAWAL_RATE_LIMIT_EXCEEDED',
      {
        ip: req.ip,
        userId: req.user?.id,
        path: req.path,
      },
      {
        error:
          'ถึงจำนวนคำขอถอนในช่วงนี้แล้ว กรุณารอจนครบเวลาที่ระบบนับให้ครบถ้วน แล้วลองใหม่',
      },
    );
  },
});

/**
 * Quote ถอน (POST /api/payouts/quote) — read-only / ไม่มี side-effect
 * แยก bucket จาก withdrawalLimiter เพื่อไม่กินโควตา 5 ครั้ง/ชม. และรองรับการคำนวณซ้ำในขั้นตอน UI
 */
export const payoutQuoteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 300 : 10000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    if (req.method === 'OPTIONS') return true;
    if (isRateLimitUnlocked(req)) return true;
    if (process.env.NODE_ENV !== 'production') {
      const ip = req.ip || req.connection?.remoteAddress;
      if (
        ip === '127.0.0.1' ||
        ip === '::1' ||
        ip === '::ffff:127.0.0.1'
      ) {
        return true;
      }
    }
    return false;
  },
  message: 'Too many payout quote requests.',
  handler: (req, res) => {
    respond429LimiterWithAccurateExpiry(
      req,
      res,
      900,
      'PAYOUT_QUOTE_RATE_LIMIT_EXCEEDED',
      {
        ip: req.ip,
        path: req.path,
      },
      {
        error:
          'คำนวณค่าธรรมเนียมถี่เกินไป กรุณารอจนครบเวลาที่ระบบนับ แล้วกด 「ลองอีกครั้ง」',
      },
    );
  },
});

// Profile Limiter
// Development: ไม่จำกัด
// Production: 500 requests/15 min (หลวมมาก เพราะ User ต้องสลับหน้าได้อิสระ)
export const profileLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 500 : 10000,
  skip: (req) => {
    if (isRateLimitUnlocked(req)) return true;
    // ✅ ปิด rate limit สำหรับ localhost ใน Development
    if (process.env.NODE_ENV !== 'production') {
      const ip = req.ip || req.connection.remoteAddress;
      if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
        return true;
      }
    }
    return false;
  },
  message: 'Too many profile requests.',
  handler: (req, res) => {
    logSecurity('PROFILE_RATE_LIMIT_EXCEEDED', {
      ip: req.ip,
      userId: req.params?.id,
      path: req.path,
    });
    res.status(429).json({
      error: 'Too many profile requests. Please try again later.',
      retryAfter: 900,
    });
  },
});

/** จำกัด POST /api/banners/:id/events — ลดการยิง analytics ปลอมต่อ IP */
export const bannerEventsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 120 : 10000,
  skip: (req) => {
    if (req.method === 'OPTIONS') return true;
    if (isRateLimitUnlocked(req)) return true;
    if (process.env.NODE_ENV !== 'production') {
      const ip = req.ip || req.connection.remoteAddress;
      if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
        return true;
      }
    }
    return false;
  },
  message: 'Too many banner event requests.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const o = req.headers.origin || '';
    const allowed = [
      'https://app.aqond.com',
      'https://admin.aqond.com',
      'https://aqond.com',
      'https://www.aqond.com',
      'https://localhost',
      'http://localhost',
      'capacitor://localhost',
    ];
    if (o && allowed.includes(o)) {
      res.setHeader('Access-Control-Allow-Origin', o);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    logSecurity('BANNER_EVENTS_RATE_LIMIT_EXCEEDED', {
      ip: req.ip,
      path: req.path,
      method: req.method,
    });
    res.status(429).json({
      error: 'Too many banner analytics requests. Please try again later.',
      retryAfter: 900,
    });
  },
});
