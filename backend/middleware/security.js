import rateLimit from 'express-rate-limit';
import { logSecurity } from '../lib/logger.js';

// Rate Limiter สำหรับ API ทั่วไป
// Development: 10000 requests/15 min (หลวมมาก เพื่อการพัฒนา)
// Production: 500 requests/15 min (หลวมพอสมควร)
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 500 : 10000,
  skip: (req) => {
    if (req.method === 'OPTIONS') return true; // ข้าม preflight
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
    const allowed = ['https://app.aqond.com', 'https://admin.aqond.com', 'https://aqond.com', 'https://www.aqond.com'];
    if (allowed.includes(o)) res.setHeader('Access-Control-Allow-Origin', o);
    else res.setHeader('Access-Control-Allow-Origin', 'https://app.aqond.com');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
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

// Withdrawal Limiter (5 withdrawals/hour)
export const withdrawalLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many withdrawal requests.',
  handler: (req, res) => {
    logSecurity('WITHDRAWAL_RATE_LIMIT_EXCEEDED', {
      ip: req.ip,
      userId: req.user?.id,
      path: req.path,
    });
    res.status(429).json({
      error: 'Maximum withdrawal limit reached. Please try again later.',
      retryAfter: 3600,
    });
  },
});

// Profile Limiter
// Development: ไม่จำกัด
// Production: 500 requests/15 min (หลวมมาก เพราะ User ต้องสลับหน้าได้อิสระ)
export const profileLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 500 : 10000,
  skip: (req) => {
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
