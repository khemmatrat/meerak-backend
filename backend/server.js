// ES Module imports
import { createClient } from 'redis';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import pg from 'pg';
const { Pool } = pg;
import express from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import stream from 'stream';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createAuditService } from './auditService.js';
dotenv.config();
// ============ DEBUG ENV ============
console.log("🔍 Environment Check:");
console.log("  Cloud Name:", process.env.CLOUDINARY_CLOUD_NAME ? "✅ Loaded" : "❌ Missing");
console.log("  API Key:", process.env.CLOUDINARY_API_KEY ? "✅ Loaded" : "❌ Missing");
console.log("  API Secret:", process.env.CLOUDINARY_API_SECRET ? "✅ Loaded" : "❌ Missing");

let redisClient = null;
const app = express();
const PORT = process.env.PORT || 3001; // ⬅️ ใช้จาก .env

// ✅ เปิด CORS
app.use(express.json({ limit: "50mb" })); // ⬅️ เพิ่มบรรทัดนี้
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// CORS: รองรับ frontend 3006 และ nexus-admin 3004
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
  : [];
const defaultOrigins = [
  'http://localhost:3000',
  'http://localhost:3002',
  'http://localhost:3004',
  'http://localhost:3006',
  'https://meerak-backend.onrender.com'
];
const origins = corsOrigins.length ? corsOrigins : defaultOrigins;
app.use(cors({
  origin: origins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));



// ============ CLOUDINARY CONFIG ============
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || (process.env.NODE_ENV === 'production' ? '' : 'your_cloud_name'),
  api_key: process.env.CLOUDINARY_API_KEY || (process.env.NODE_ENV === 'production' ? '' : 'your_api_key'),
  api_secret: process.env.CLOUDINARY_API_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'your_api_secret'),
});


// ============ HELPER FUNCTIONS ============
const uploadToCloudinary = (fileBuffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: options.resource_type || "auto",
        folder: options.folder || "uploads",
        ...options
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );

    const bufferStream = new stream.PassThrough();
    bufferStream.end(fileBuffer);
    bufferStream.pipe(uploadStream);
  });
};

// ============ GET ENDPOINTS ============
app.get("/", (req, res) => {
  res.json({
    message: "🚀 Production Backend with Cloudinary",
    max_file_size: "50MB",
    endpoints: {
      "GET /health": "Health check",
      "GET /api/profile": "User profile",
      "POST /api/upload": "Upload any file to Cloudinary",
      "POST /api/upload/image": "Upload image (optimized)",
      "POST /api/upload/video": "Upload video (optimized)"
    }
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    max_upload_size: "50MB",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/profile", (req, res) => {
  res.json({
    kyc_level: "level_2",
    skills: ["ขับขี่", "การสอน"],
    wallet_balance: 1500,
    message: "✅ ยืนยันตัวตนเสร็จสิ้นแล้ว",
    storage: "cloudinary"
  });
});

// ============ UPLOAD ENDPOINTS ============

// ✅ 1. Upload ไฟล์ทั่วไป (Auto-detect type)
app.post("/api/upload", async (req, res) => {
  try {
    console.log("📨 Received upload request");
    if (!req.body.file || !req.body.fileName) {
      return res.status(400).json({ error: "Missing file data" });
    }
    // ตรวจสอบขนาด (safety check)
    if (req.body.file.length > 50 * 1024 * 1024) { // 50MB
      return res.status(413).json({
        error: "File too large",
        max_size: "50MB",
        your_size: `${(req.body.file.length / 1024 / 1024).toFixed(2)}MB`
      });
    }

    // แปลง base64 เป็น buffer
    const base64Data = req.body.file.replace(/^data:.+;base64,/, "");
    console.log(`📊 File size: ${(base64Data.length / 1024 / 1024).toFixed(2)}MB`);
    const fileBuffer = Buffer.from(base64Data, "base64");

    // อัปโหลดไป Cloudinary
    const result = await uploadToCloudinary(fileBuffer, {
      public_id: `file_${Date.now()}`,
      resource_type: "auto"
    });
    console.log("✅ Upload successful to Cloudinary");
    res.json({
      success: true,
      message: "✅ อัปโหลดไป Cloudinary สำเร็จ",
      url: result.secure_url,
      public_id: result.public_id,
      format: result.format,
      size: `${(result.bytes / 1024 / 1024).toFixed(2)}MB`,
      bytes: result.bytes,
      created_at: result.created_at,
      resource_type: result.resource_type
    });

  } catch (error) {
    console.error("❌ Cloudinary upload error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Strip EXIF (GPS etc.) for KYC/privacy — uses sharp when forKyc=true
async function stripExifFromImageBuffer(buffer) {
  try {
    const sharp = (await import('sharp')).default;
    return await sharp(buffer).withMetadata({ keep: false }).toBuffer();
  } catch (e) {
    console.warn('EXIF strip failed (install sharp?), using original:', e.message);
    return buffer;
  }
}

// ✅ 2. Upload รูปภาพ (Optimized สำหรับรูป); สำหรับ KYC ให้ลบ EXIF อัตโนมัติ
app.post("/api/upload/image", async (req, res) => {
  try {
    if (!req.body.file) {
      return res.status(400).json({ error: "Missing image data" });
    }

    // Limit 5MB
    if (req.body.file.length > 5 * 1024 * 1024) {
      return res.status(413).json({ error: "File too large for this endpoint" });
    }

    const base64Data = req.body.file.replace(/^data:.+;base64,/, "");
    let imageBuffer = Buffer.from(base64Data, "base64");

    const forKyc = req.body.forKyc === true || req.query.for === 'kyc';
    if (forKyc) {
      imageBuffer = await stripExifFromImageBuffer(imageBuffer);
    }

    const result = await uploadToCloudinary(imageBuffer, {
      folder: forKyc ? "kyc_uploads" : "images",
      resource_type: "image",
      transformation: [
        { quality: "auto:good" },
        { fetch_format: "auto" }
      ]
    });

    res.json({
      success: true,
      url: result.secure_url,
      optimized_url: result.secure_url.replace("/upload/", "/upload/q_auto,f_auto/"),
      public_id: result.public_id,
      width: result.width,
      height: result.height,
      size: `${(result.bytes / 1024).toFixed(2)}KB`,
      exif_stripped: forKyc
    });

  } catch (error) {
    res.status(500).json({ error: "Image upload failed" });
  }
});

// ✅ 3. Upload วิดีโอ (Optimized สำหรับวิดีโอ)
app.post("/api/upload/video", async (req, res) => {
  try {
    if (!req.body.file) {
      return res.status(400).json({ error: "Missing video data" });
    }

    const base64Data = req.body.file.replace(/^data:.+;base64,/, "");
    const videoBuffer = Buffer.from(base64Data, "base64");

    const result = await uploadToCloudinary(videoBuffer, {
      folder: "videos",
      resource_type: "video",
      chunk_size: 6000000, // 6MB chunks
      eager: [
        { format: "mp4", streaming_profile: "hd" }
      ]
    });

    res.json({
      success: true,
      url: result.secure_url,
      duration: result.duration,
      format: result.format,
      bytes: result.bytes,
      eager: result.eager // Optimized versions
    });

  } catch (error) {
    console.error("Video upload error:", error);
    res.status(500).json({ error: "Video upload failed" });
  }
});

// ✅ 4. Upload ผ่าน FormData (เหมาะสำหรับ Frontend)
const multerStorage = multer.memoryStorage();
const uploadMulter = multer({ storage: multerStorage });


// ============ CLOUDINARY MANAGEMENT ============

// ✅ ดูไฟล์ทั้งหมดใน Cloudinary
app.get("/api/cloudinary/files", async (req, res) => {
  try {
    const result = await cloudinary.api.resources({
      type: "upload",
      max_results: 50
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch files" });
  }
});

// ✅ ลบไฟล์จาก Cloudinary
app.delete("/api/cloudinary/files/:public_id", async (req, res) => {
  try {
    const result = await cloudinary.uploader.destroy(req.params.public_id);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete file" });
  }
});
app.post("/api/upload/form", uploadMulter.single("file"), async (req, res) => {
  try {
    console.log("📨 FormData upload received");

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    console.log(`📊 File: ${req.file.originalname}, Size: ${req.file.size} bytes`);

    // ใช้ cloudinary.uploader.upload โดยตรง
    const base64Data = req.file.buffer.toString('base64');
    const dataUri = `data:${req.file.mimetype};base64,${base64Data}`;

    console.log("📤 Uploading to Cloudinary...");

    const result = await cloudinary.uploader.upload(dataUri, {
      folder: "kyc_uploads",
      resource_type: "auto", // ใช้ auto ให้ Cloudinary detect เอง
      public_id: `kyc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    });

    console.log("✅ Cloudinary upload successful!");

    res.json({
      success: true,
      message: "✅ อัปโหลดสำเร็จ",
      url: result.secure_url,
      public_id: result.public_id,
      size: `${(result.bytes / 1024).toFixed(2)}KB`,
      format: result.format,
      resource_type: result.resource_type
    });

  } catch (error) {
    console.error("❌ Upload error:", error.message);
    console.error("Error details:", error);

    res.status(500).json({
      success: false,
      error: error.message,
      code: error.http_code || 500
    });
  }
});


// ============ DATABASE CONFIG ============
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_DATABASE || 'meera_db',
  user: process.env.DB_USER || 'meera',
  password: process.env.DB_PASSWORD, // ต้องตั้งใน .env — ห้ามใส่รหัสผ่านในโค้ด
});

const auditService = createAuditService(pool);

// Redis client สำหรับ cache


if (process.env.REDIS_URL) {
  try {
    redisClient = createClient({
      url: process.env.REDIS_URL,
      socket: {
        tls: true,
        rejectUnauthorized: false,
      },
    });

    redisClient.on('error', (err) => {
      console.error('Redis Error:', err);
    });

    await redisClient.connect();
    console.log('✅ Redis connected');
  } catch (error) {
    console.error('❌ Redis connection failed:', error.message);
    redisClient = null;
  }
} else {
  console.log('⚠️ Redis URL not set, skipping Redis connection');
}

// ============ RATE LIMITING (Redis + in-memory fallback) - Login & OTP ============
const RATE_LIMIT_LOGIN_PHONE = { max: 5, windowSec: 15 * 60 };   // 5 per 15 min per phone
const RATE_LIMIT_LOGIN_IP = { max: 10, windowSec: 15 * 60 };      // 10 per 15 min per IP
const RATE_LIMIT_OTP_PHONE = { max: 3, windowSec: 60 * 60 };      // 3 per hour per phone (for future OTP endpoint)

// In-memory fallback when Redis is down — กันโดนยิงไม่ล่ม (Phase 1 Security Hardening)
const rateLimitMemory = new Map();
function checkRateLimitMemory(prefix, identifier, { max: maxReq, windowSec }) {
  const key = `${prefix}:${String(identifier).slice(0, 128)}`;
  const now = Date.now();
  let entry = rateLimitMemory.get(key);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 1, resetAt: now + windowSec * 1000 };
    rateLimitMemory.set(key, entry);
    return { allowed: true, retryAfter: 0 };
  }
  entry.count += 1;
  const allowed = entry.count <= maxReq;
  const retryAfter = allowed ? 0 : Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
  return { allowed, retryAfter };
}

async function checkRateLimit(prefix, identifier, { max: maxReq, windowSec }) {
  if (!redisClient) {
    return checkRateLimitMemory(prefix, identifier, { max: maxReq, windowSec });
  }
  const key = `ratelimit:${prefix}:${String(identifier).replace(/[^a-zA-Z0-9@._-]/g, '_')}`;
  try {
    const multi = redisClient.multi();
    multi.incr(key);
    multi.ttl(key);
    const results = await multi.exec();
    const count = results[0][1];
    const ttl = results[1][1];
    if (ttl === -1) await redisClient.expire(key, windowSec);
    const allowed = count <= maxReq;
    const retryAfter = allowed ? 0 : (ttl > 0 ? ttl : windowSec);
    return { allowed, retryAfter, remaining: Math.max(0, maxReq - count) };
  } catch (e) {
    console.warn('Rate limit check failed:', e.message);
    return checkRateLimitMemory(prefix, identifier, { max: maxReq, windowSec });
  }
}

function getClientIp(req) {
  return (req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip']))?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
}

// Centralized 429 response (Rate Limit) — same shape across the app
function sendRateLimitResponse(res, retryAfter, message = 'Too many requests') {
  const sec = Math.max(1, Math.ceil(Number(retryAfter) || 60));
  res.setHeader('Retry-After', String(sec));
  return res.status(429).json({
    error: 'rate_limit_exceeded',
    message: message || `Try again in ${sec} seconds.`,
    retry_after: sec
  });
}

async function rateLimitLogin(req, res, next) {
  const phone = (req.body && req.body.phone) ? String(req.body.phone).trim() : null;
  const ip = getClientIp(req);
  const [byPhone, byIp] = await Promise.all([
    phone ? checkRateLimit('login_phone', phone, RATE_LIMIT_LOGIN_PHONE) : { allowed: true },
    checkRateLimit('login_ip', ip, RATE_LIMIT_LOGIN_IP)
  ]);
  if (!byPhone.allowed) {
    return sendRateLimitResponse(res, byPhone.retryAfter, `Too many login attempts. Try again in ${byPhone.retryAfter} seconds.`);
  }
  if (!byIp.allowed) {
    return sendRateLimitResponse(res, byIp.retryAfter, `Too many requests. Try again in ${byIp.retryAfter} seconds.`);
  }
  next();
}

// ============ DATABASE MODELS ============

// User Model
const UserModel = {
  async findById(id) {
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0];
  },

  async updateBalance(userId, amount) {
    const result = await pool.query(
      `UPDATE users 
       SET wallet_balance = wallet_balance + $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [amount, userId]
    );
    return result.rows[0];
  },

  async updatePendingBalance(userId, amount) {
    const result = await pool.query(
      `UPDATE users 
       SET wallet_pending = COALESCE(wallet_pending, 0) + $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [amount, userId]
    );
    return result.rows[0];
  }
};

// ปกติผลจาก DB ให้ frontend ใช้ได้ (location เป็น object, id/created_by เป็น string)
function normalizeJobForApi(job) {
  if (!job) return job;
  try {
    const out = { ...job };
    if (out.location && typeof out.location === 'string') {
      try { out.location = JSON.parse(out.location); } catch (_) { out.location = { lat: 0, lng: 0 }; }
    }
    if (!out.location || typeof out.location !== 'object') out.location = { lat: 0, lng: 0 };
    if (out.id != null) out.id = String(out.id);
    if (out.created_by != null) out.created_by = String(out.created_by);
    if (out.accepted_by != null) out.accepted_by = String(out.accepted_by);
    if (!out.datetime && out.created_at) out.datetime = out.created_at;
    if (!out.status) out.status = 'open';
    out.client_name = out.created_by_name || out.created_by || '';
    out.provider_name = out.provider_name || null;
    return out;
  } catch (e) {
    console.warn('normalizeJobForApi error:', e.message);
    return job;
  }
}

// Job Model — ชั้นเดียวสำหรับ query งาน (route เรียกใช้ตรงนี้ ไม่เขียน query ซ้ำ)
const JobModel = {
  async findById(id) {
    if (!id) return null;
    const sid = String(id).trim();
    let result = await pool.query(`SELECT * FROM jobs WHERE id = $1`, [sid]);
    if (!result.rows?.length) result = await pool.query(`SELECT * FROM jobs WHERE id::text = $1`, [sid]);
    const job = result.rows?.[0];
    if (job) {
      job.client_name = job.created_by_name || job.created_by;
      job.provider_name = job.provider_name || null;
    }
    return job || null;
  },

  /** งานที่ user สร้างหรือรับ (created_by หรือ accepted_by = userId) */
  async findByUserId(userId) {
    if (!userId) return [];
    const uid = String(userId).trim();
    let rows = [];
    try {
      const r = await pool.query(
        `SELECT * FROM jobs WHERE created_by = $1 OR accepted_by = $1 ORDER BY created_at DESC`,
        [uid]
      );
      rows = r.rows || [];
    } catch (e) {
      if (e.code === '42703') {
        const r = await pool.query(
          `SELECT * FROM jobs WHERE created_by = $1 ORDER BY created_at DESC`,
          [uid]
        );
        rows = r.rows || [];
      } else throw e;
    }
    try {
      const userRow = await pool.query('SELECT id FROM users WHERE firebase_uid = $1 OR id::text = $1 LIMIT 1', [uid]);
      if (userRow.rows?.length > 0) {
        const byClient = await pool.query(`SELECT * FROM jobs WHERE client_id = $1 ORDER BY created_at DESC`, [userRow.rows[0].id]);
        const seen = new Set(rows.map((j) => String(j.id)));
        (byClient.rows || []).forEach((j) => { if (!seen.has(String(j.id))) { seen.add(String(j.id)); rows.push(j); } });
      }
    } catch (_) {}
    const byId = new Map(rows.map((j) => [String(j.id), j]));
    return Array.from(byId.values()).sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );
  },

  async updateStatus(jobId, status, updates = {}) {
    const fields = Object.keys(updates);
    const values = Object.values(updates);

    const setClause = fields.map((field, i) => `${field} = $${i + 3}`).join(', ');

    const query = `
      UPDATE jobs 
      SET status = $1, updated_at = NOW()${setClause ? ', ' + setClause : ''}
      WHERE id = $2
      RETURNING *
    `;

    const result = await pool.query(
      query,
      [status, jobId, ...values]
    );
    return result.rows[0];
  }
};

// Transaction Model
const TransactionModel = {
  async create(data) {
    const {
      user_id,
      type,
      amount,
      description,
      status = 'pending',
      related_job_id = null,
      metadata = {}
    } = data;

    const result = await pool.query(
      `INSERT INTO transactions (
        user_id, type, amount, description,
        status, related_job_id, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [user_id, type, amount, description, status, related_job_id, JSON.stringify(metadata)]
    );
    return result.rows[0];
  },

  async findByUserId(userId, limit = 50) {
    const result = await pool.query(
      `SELECT * FROM transactions 
       WHERE user_id = $1 
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
  }
};
// ============ PAYMENT ENDPOINTS ============

// 🔥 Commission Calculation (ใช้จาก mockApi.ts)
const calculateCommission = (completedJobs) => {
  if (completedJobs > 350) return 0.08;
  if (completedJobs > 240) return 0.1;
  if (completedJobs > 150) return 0.12;
  if (completedJobs > 80) return 0.15;
  if (completedJobs > 30) return 0.18;
  return 0.22;
};

// Round to 2 decimal places (avoid floating-point rounding errors e.g. 500.0075)
const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

// ✅ 1. Process Payment
// ✅ 1. Process Payment
app.post('/api/payments/process', async (req, res) => {
  try {
    const { jobId, paymentMethod: pm, discountAmount = 0, userId, has_insurance: hasInsurance = false } = req.body;
    const paymentMethod = pm || req.body.method;

    console.log('🔒 Processing payment:', { jobId, paymentMethod, discountAmount, has_insurance: hasInsurance });

    // ดึงข้อมูล job
    const job = await JobModel.findById(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // ตรวจสอบสถานะ — รับได้ทั้ง waiting_for_payment และ waiting_for_approval (หลังผู้รับงานกดส่งงานเสร็จ)
    const statusOk = (job.status || '').toLowerCase();
    if (statusOk !== 'waiting_for_payment' && statusOk !== 'waiting_for_approval') {
      return res.status(400).json({
        error: 'Invalid job status for payment',
        currentStatus: job.status
      });
    }

    // ดึงข้อมูลผู้ใช้
    const clientUser = await UserModel.findById(job.created_by); // เปลี่ยนชื่อตัวแปร
    const provider = await UserModel.findById(job.accepted_by);

    if (!clientUser || !provider) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Job fee (ฐานคำนวณ commission) และ Insurance (อัตราตามหมวดงาน) — ปัดเศษ 2 ตำแหน่งเสมอ
    const jobFee = round2(Math.max(0, Number(job.price) - discountAmount));
    let insuranceAmount = 0;
    let insuranceRatePercent = 10;
    try {
      const category = (job.category || 'default').toString().trim().toLowerCase();
      const catRow = await pool.query(
        `SELECT rate_percent FROM insurance_rate_by_category WHERE category = $1`,
        [category]
      ).catch(() => ({ rows: [] }));
      if (catRow.rows[0] != null) {
        insuranceRatePercent = parseFloat(catRow.rows[0].rate_percent) || 10;
      } else {
        const defaultRow = await pool.query(
          `SELECT rate_percent FROM insurance_rate_by_category WHERE category = 'default'`
        ).catch(() => ({ rows: [] }));
        if (defaultRow.rows[0] != null) insuranceRatePercent = parseFloat(defaultRow.rows[0].rate_percent) || 10;
        else {
          const globalRow = await pool.query(`SELECT value FROM insurance_settings WHERE key = 'insurance_rate_percent'`).catch(() => ({ rows: [] }));
          insuranceRatePercent = globalRow.rows[0] ? parseFloat(globalRow.rows[0].value) || 10 : 10;
        }
      }
    } catch (_) { insuranceRatePercent = 10; }
    const insuranceRate = insuranceRatePercent / 100;
    if (hasInsurance && jobFee > 0) {
      insuranceAmount = round2(jobFee * insuranceRate);
    }
    const finalPrice = round2(jobFee + insuranceAmount);

    // คำนวณค่าคอมมิชชั่นจาก job fee เท่านั้น (ไม่รวมค่าประกัน) — ปัดเศษแล้วให้ jobFee = provider_net + commission พอดี
    const commissionRate = calculateCommission(provider.completed_jobs_count || 0);
    const feeAmount = round2(jobFee * commissionRate);
    const providerReceive = round2(jobFee - feeAmount);

    // เริ่ม transaction - ใช้ชื่อตัวแปรใหม่
    const dbClient = await pool.connect();

    try {
      await dbClient.query('BEGIN');

      const paymentDetailsPayload = {
        amount: finalPrice,
        job_fee: jobFee,
        has_insurance: !!hasInsurance,
        insurance_amount: insuranceAmount,
        insurance_rate_percent: insuranceRatePercent,
        provider_receive: providerReceive,
        fee_amount: feeAmount,
        fee_percent: commissionRate,
        released_status: 'pending',
        release_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000)
      };

      // 1. อัพเดท job status
      await dbClient.query(
        `UPDATE jobs SET 
          status = 'completed',
          payment_status = 'paid',
          paid_at = NOW(),
          payment_details = $1
         WHERE id = $2`,
        [JSON.stringify(paymentDetailsPayload), jobId]
      );

      // 2. หักเงิน client (ยอดรวมรวมค่าประกันถ้ามี)
      if (paymentMethod === 'wallet') {
        await dbClient.query(
          `UPDATE users SET 
            wallet_balance = wallet_balance - $1
           WHERE id = $2`,
          [finalPrice, job.created_by]
        );
      }

      // 3. เพิ่ม pending ให้ provider
      await dbClient.query(
        `UPDATE users SET 
          wallet_pending = COALESCE(wallet_pending, 0) + $1,
          completed_jobs_count = COALESCE(completed_jobs_count, 0) + 1
         WHERE id = $2`,
        [providerReceive, job.accepted_by]
      );

      // 4. บันทึก transaction สำหรับ client
      await dbClient.query(
        `INSERT INTO transactions (
          user_id, type, amount, description,
          status, related_job_id, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          job.created_by,
          'payment_out',
          -finalPrice,
          `Payment for job: ${job.title}`,
          'completed',
          jobId,
          JSON.stringify({ paymentMethod, discountAmount })
        ]
      );

      // 5. บันทึก transaction สำหรับ provider
      await dbClient.query(
        `INSERT INTO transactions (
          user_id, type, amount, description,
          status, related_job_id, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          job.accepted_by,
          'income',
          providerReceive,
          `Income from job: ${job.title}`,
          'pending_release',
          jobId,
          JSON.stringify({
            commission_rate: commissionRate,
            fee_amount: feeAmount,
            release_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000)
          })
        ]
      );

      await dbClient.query('COMMIT');

      // Ledger 3 ขา + ขา 4 (Insurance Liability) + Metadata ขา 5 (60/40 split สำหรับ Admin)
      const ledgerId = (s) => `L-${jobId}-${s}-${Date.now()}`;
      const gate = paymentMethod === 'wallet' ? 'wallet' : 'bank_transfer';
      try {
        await pool.query(
          `INSERT INTO payment_ledger_audit (id, event_type, payment_id, gateway, job_id, amount, currency, status, bill_no, transaction_no, user_id, metadata)
           VALUES ($1, 'payment_created', $2, $3, $4, $5, 'THB', 'completed', $6, $7, $8, $9)`,
          [ledgerId('debit'), jobId, gate, jobId, finalPrice, jobId, `T-${jobId}-${Date.now()}`, job.created_by, JSON.stringify({ leg: 'user_debit', full_amount: finalPrice, job_fee: jobFee, insurance_amount: insuranceAmount })]
        );
        await pool.query(
          `INSERT INTO payment_ledger_audit (id, event_type, payment_id, gateway, job_id, amount, currency, status, bill_no, transaction_no, provider_id, metadata)
           VALUES ($1, 'escrow_held', $2, 'wallet', $3, $4, 'THB', 'completed', $5, $6, $7, $8)`,
          [ledgerId('provider'), jobId, jobId, providerReceive, jobId, `T-${jobId}-${Date.now()}-p`, job.accepted_by, JSON.stringify({ leg: 'provider_net' })]
        );
        await pool.query(
          `INSERT INTO payment_ledger_audit (id, event_type, payment_id, gateway, job_id, amount, currency, status, bill_no, transaction_no, metadata)
           VALUES ($1, 'escrow_held', $2, 'wallet', $3, $4, 'THB', 'completed', $5, $6, $7)`,
          [ledgerId('commission'), jobId, jobId, feeAmount, jobId, `T-${jobId}-${Date.now()}-f`, JSON.stringify({ leg: 'commission', fee_percent: commissionRate })]
        );
        if (insuranceAmount > 0) {
          await pool.query(
            `INSERT INTO payment_ledger_audit (id, event_type, payment_id, gateway, job_id, amount, currency, status, bill_no, transaction_no, metadata)
             VALUES ($1, 'insurance_liability_credit', $2, 'wallet', $3, $4, 'THB', 'completed', $5, $6, $7)`,
            [ledgerId('insurance'), jobId, jobId, insuranceAmount, `INS-${jobId}`, `T-${jobId}-${Date.now()}-ins`, JSON.stringify({ leg: 'insurance_liability', reserve_60: round2(insuranceAmount * 0.6), manageable_40: round2(insuranceAmount * 0.4) })]
          );
          await pool.query(
            `INSERT INTO insurance_fund_movements (id, type, amount, job_id, reference_id, note, metadata, created_at)
             VALUES ($1, 'liability_credit', $2, $3, $4, $5, $6, NOW())`,
            [ledgerId('ins-mov'), insuranceAmount, jobId, jobId, `Payment job ${jobId}`, JSON.stringify({ job_fee: jobFee, rate_percent: insuranceRatePercent })]
          );
        }
      } catch (ledgerErr) {
        console.warn('Ledger/insurance insert failed:', ledgerErr.message);
      }

      // ส่ง response
      res.json({
        success: true,
        message: 'Payment processed successfully',
        data: {
          jobId,
          amount: finalPrice,
          job_fee: jobFee,
          has_insurance: !!hasInsurance,
          insurance_amount: insuranceAmount,
          providerReceive,
          feeAmount,
          commissionRate,
          paymentMethod
        }
      });

    } catch (error) {
      await dbClient.query('ROLLBACK');
      throw error;
    } finally {
      dbClient.release(); // เปลี่ยนเป็น dbClient
    }

  } catch (error) {
    console.error('❌ Payment processing error:', error);
    res.status(500).json({
      error: 'Payment processing failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ✅ 2. Check Payment Status
app.get('/api/payments/status/:jobId', async (req, res) => {
  try {
    const job = await JobModel.findById(req.params.jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({
      paid: job.payment_status === 'paid',
      paidAt: job.paid_at,
      amount: job.payment_details?.amount,
      status: job.payment_status,
      providerReceive: job.payment_details?.provider_receive,
      releasedStatus: job.payment_details?.released_status
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check payment status' });
  }
});

// ✅ 3. Release Pending Payment — Double Lock (job + job_disputes), Admin-only after dispute, Escrow validation
app.post('/api/payments/release', async (req, res) => {
  try {
    const { jobId } = req.body;

    const job = await JobModel.findById(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Circuit Breaker (1): Lock when dispute on job
    const disputeStatus = job.dispute_status || (job.payment_details && job.payment_details.dispute_status);
    if (disputeStatus === 'pending') {
      return res.status(403).json({
        error: 'payment_locked_by_dispute',
        message: 'Cannot release payment while dispute is open. Wait for admin resolution.'
      });
    }

    // Double Lock (2): เช็กตาราง job_disputes — ถ้ามีแถว open อยู่ Hard-Block ทุกกรณี
    let disputeCheck = { rows: [] };
    try {
      disputeCheck = await pool.query(
        `SELECT id FROM job_disputes WHERE job_id = $1 AND status = 'open' LIMIT 1`,
        [jobId]
      );
    } catch (_) { /* table may not exist before migration 016 */ }
    if (disputeCheck.rows && disputeCheck.rows.length > 0) {
      return res.status(403).json({
        error: 'payment_locked_by_dispute',
        message: 'Cannot release payment: open dispute record exists. Only admin can release after resolving.'
      });
    }

    // Admin Bypass: หลัง resolve แล้ว เฉพาะ Admin เท่านั้นที่ปล่อยเงินได้
    if (disputeStatus === 'resolved') {
      let isAdmin = false;
      const auth = req.headers.authorization;
      if (auth && auth.startsWith('Bearer ')) {
        try {
          const JWT_SECRET = process.env.JWT_SECRET; // ต้องตั้ง JWT_SECRET ใน .env
          if (!JWT_SECRET) return res.status(500).json({ error: 'Server misconfiguration: JWT_SECRET required' });
          const token = auth.slice(7);
          const payload = jwt.verify(token, JWT_SECRET);
          const roleRes = await pool.query('SELECT role FROM user_roles WHERE user_id = $1', [String(payload.sub)]);
          const role = roleRes.rows[0]?.role;
          if (role === 'ADMIN' || role === 'AUDITOR') isAdmin = true;
        } catch (_) {
          return res.status(401).json({ error: 'Invalid or expired token' });
        }
      }
      if (!isAdmin) {
        return res.status(403).json({
          error: 'admin_required_after_dispute',
          message: 'After a dispute, only Admin can release payment. Please use admin panel or provide admin token.'
        });
      }
    }

    const paymentDetails = job.payment_details;
    if (!paymentDetails || paymentDetails.released_status === 'released') {
      return res.status(400).json({ error: 'Payment already released or not ready' });
    }

    const providerReceive = Number(paymentDetails.provider_receive);
    const providerId = job.accepted_by;

    // Escrow Safeguard: ตรวจสอบยอดที่ปล่อยตรงกับที่ job ระบุ
    if (isNaN(providerReceive) || providerReceive <= 0) {
      return res.status(400).json({ error: 'Invalid provider_receive amount' });
    }

    // เริ่ม transaction — ป้องกัน Race Condition: อัปเดต released_status เฉพาะเมื่อยังเป็น 'pending'
    const dbClient = await pool.connect();

    try {
      await dbClient.query('BEGIN');

      // 2. (ทำก่อน) Conditional UPDATE — ถ้า released_status ไม่ใช่ 'pending' จะไม่มีแถวถูกอัปเดต → ป้องกัน Double Release
      const updateJobResult = await dbClient.query(
        `UPDATE jobs SET 
          payment_details = jsonb_set(
            COALESCE(payment_details, '{}'::jsonb),
            '{released_status}',
            '"released"'
          ),
          updated_at = NOW()
         WHERE id = $1 AND (COALESCE(payment_details->>'released_status', '') = 'pending')
         RETURNING id`,
        [jobId]
      );
      if (!updateJobResult.rows || updateJobResult.rows.length === 0) {
        await dbClient.query('ROLLBACK');
        return res.status(409).json({
          error: 'already_released',
          message: 'Payment was already released (possible duplicate request). No double spending.'
        });
      }

      // 1. โอนเงินจาก pending ไป balance
      await dbClient.query(
        `UPDATE users SET 
          wallet_pending = wallet_pending - $1,
          wallet_balance = wallet_balance + $1
         WHERE id = $2`,
        [providerReceive, providerId]
      );

      // 3. อัพเดท transaction status
      await dbClient.query(
        `UPDATE transactions SET 
          status = 'completed',
          released_at = NOW()
         WHERE related_job_id = $1 
           AND user_id = $2 
           AND type = 'income' 
           AND status = 'pending_release'`,
        [jobId, providerId]
      );

      await dbClient.query('COMMIT');

      // Audit: บันทึกการปล่อยเงิน (สำหรับ Refund/Dispute audit trail)
      const releaseActorId = req.adminUser?.id || req.body?.userId || 'system';
      auditService.log(releaseActorId, 'PAYMENT_RELEASED', {
        entityName: 'jobs',
        entityId: jobId,
        new: { amount: providerReceive, providerId, released_at: new Date().toISOString() }
      }, { actorRole: req.adminUser?.role === 'ADMIN' || req.adminUser?.role === 'AUDITOR' ? 'Admin' : 'User', status: 'Success', ipAddress: getClientIp(req) });

      res.json({
        success: true,
        message: 'Payment released successfully',
        amount: providerReceive,
        providerId
      });

    } catch (error) {
      await dbClient.query('ROLLBACK');
      throw error;
    } finally {
      dbClient.release(); // เปลี่ยนเป็น dbClient
    }

  } catch (error) {
    console.error('❌ Release payment error:', error);
    res.status(500).json({ error: 'Failed to release payment' });
  }
});

// ✅ 3b. Admin Refund — คืนเงินให้ Employer + Reverse Ledger 3 ขา (ลดยอด commission ถ้า includeCommission)
app.post('/api/admin/payments/refund', adminAuthMiddleware, async (req, res) => {
  try {
    const { jobId, includeCommission = false } = req.body || {};
    if (!jobId) return res.status(400).json({ error: 'jobId required' });

    const job = await JobModel.findById(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const pd = job.payment_details;
    const releasedStatus = pd?.released_status || '';
    if (!pd) return res.status(400).json({ error: 'Job has no payment details' });
    if (releasedStatus === 'refunded') return res.status(400).json({ error: 'Payment already refunded' });
    if (releasedStatus !== 'pending' && releasedStatus !== 'released') {
      return res.status(400).json({ error: 'Refund only allowed for jobs with payment in escrow (pending) or already released' });
    }

    const fullAmount = round2(Number(pd.amount) || 0);
    const providerReceive = round2(Number(pd.provider_receive) || 0);
    const feeAmount = round2(Number(pd.fee_amount) || 0);
    const refundToEmployer = round2(includeCommission ? fullAmount : (fullAmount - feeAmount));
    const employerId = job.created_by;
    const providerId = job.accepted_by;

    if (refundToEmployer <= 0) return res.status(400).json({ error: 'Invalid refund amount' });

    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');

      if (releasedStatus === 'released') {
        // เงินปล่อยแล้ว: หักจาก wallet_balance ของ Provider
        await dbClient.query(
          `UPDATE users SET wallet_balance = wallet_balance - $1, updated_at = NOW() WHERE id = $2`,
          [providerReceive, providerId]
        );
      } else {
        // เงินยังอยู่ใน escrow: หักจาก wallet_pending ของ Provider
        await dbClient.query(
          `UPDATE users SET wallet_pending = wallet_pending - $1, updated_at = NOW() WHERE id = $2`,
          [providerReceive, providerId]
        );
      }
      // คืนให้ Employer
      await dbClient.query(
        `UPDATE users SET wallet_balance = wallet_balance + $1, updated_at = NOW() WHERE id = $2`,
        [refundToEmployer, employerId]
      );
      // อัปเดต job payment_details เป็น refunded
      await dbClient.query(
        `UPDATE jobs SET 
          payment_details = jsonb_set(
            jsonb_set(COALESCE(payment_details,'{}'), '{released_status}', '"refunded"'),
            '{refunded_at}', to_jsonb(NOW()::text)
          ),
          updated_at = NOW()
         WHERE id = $1`,
        [jobId]
      );

      // Refund Ledger 3 ขา — ภายใน transaction เพื่อความสอดคล้อง (atomic)
      const ledgerId = (s) => `L-REF-${jobId}-${s}-${Date.now()}`;
      await dbClient.query(
        `INSERT INTO payment_ledger_audit (id, event_type, payment_id, gateway, job_id, amount, currency, status, bill_no, transaction_no, user_id, metadata)
         VALUES ($1, 'payment_refunded', $2, 'wallet', $3, $4, 'THB', 'completed', $5, $6, $7, $8)`,
        [ledgerId('user'), jobId, jobId, refundToEmployer, `REF-${jobId}`, `T-REF-${jobId}-${Date.now()}`, employerId, JSON.stringify({ leg: 'user_credit', include_commission: includeCommission, admin_id: req.adminUser?.id })]
      );
      await dbClient.query(
        `INSERT INTO payment_ledger_audit (id, event_type, payment_id, gateway, job_id, amount, currency, status, bill_no, transaction_no, provider_id, metadata)
         VALUES ($1, 'escrow_refunded', $2, 'wallet', $3, $4, 'THB', 'completed', $5, $6, $7, $8)`,
        [ledgerId('provider'), jobId, jobId, providerReceive, `REF-${jobId}-p`, `T-REF-${jobId}-${Date.now()}-p`, providerId, JSON.stringify({ leg: 'provider_debit' })]
      );
      if (includeCommission && feeAmount > 0) {
        await dbClient.query(
          `INSERT INTO payment_ledger_audit (id, event_type, payment_id, gateway, job_id, amount, currency, status, bill_no, transaction_no, metadata)
           VALUES ($1, 'escrow_refunded', $2, 'wallet', $3, $4, 'THB', 'completed', $5, $6, $7)`,
          [ledgerId('commission'), jobId, jobId, feeAmount, `REF-${jobId}-f`, `T-REF-${jobId}-${Date.now()}-f`, JSON.stringify({ leg: 'commission_reversed', admin_id: req.adminUser?.id })]
        );
      }

      await dbClient.query('COMMIT');
    } catch (e) {
      await dbClient.query('ROLLBACK');
      throw e;
    } finally {
      dbClient.release();
    }

    auditService.log(req.adminUser?.id || 'admin', 'PAYMENT_REFUNDED', {
      entityName: 'jobs',
      entityId: jobId,
      new: { refundToEmployer, providerDebit: providerReceive, includeCommission, feeAmount }
    }, { actorRole: 'Admin', status: 'Success', ipAddress: getClientIp(req) });

    res.json({
      success: true,
      message: 'Refund processed. Reverse ledger entries recorded.',
      refundToEmployer,
      providerDebit: providerReceive,
      includeCommission
    });
  } catch (error) {
    console.error('Refund error:', error);
    res.status(500).json({ error: 'Failed to process refund' });
  }
});

// ✅ 4. Get User Wallet Summary
app.get('/api/wallet/:userId/summary', async (req, res) => {
  try {
    const user = await UserModel.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const transactions = await TransactionModel.findByUserId(req.params.userId, 10);

    // คำนวณ pending จาก transactions
    const pendingFromTransactions = transactions
      .filter(tx => tx.status === 'pending_release' && tx.type === 'income')
      .reduce((sum, tx) => sum + parseFloat(tx.amount), 0);

    res.json({
      available: parseFloat(user.wallet_balance) || 0,
      pending: parseFloat(user.wallet_pending) || 0,
      total: (parseFloat(user.wallet_balance) || 0) + (parseFloat(user.wallet_pending) || 0),
      pendingFromTransactions,
      recentTransactions: transactions.slice(0, 5)
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get wallet summary' });
  }
});
// ============ CREATE JOB ENDPOINT ============

// ✅ Create New Job
app.post('/api/jobs', async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      price,
      location,
      datetime
    } = req.body;
    const createdBy = req.body.createdBy || req.body.created_by;

    console.log('📝 [CREATE JOB] Request body:', req.body);

    // Validate required fields
    if (!title || !description || !category || !price || !createdBy) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: title, description, category, price, createdBy'
      });
    }

    // ดึงข้อมูลผู้สร้างงาน
    let clientName = 'Client';
    let clientAvatar = '';

    try {
      const userResult = await pool.query(
        `SELECT full_name, avatar_url FROM users WHERE id::text = $1 OR firebase_uid = $1 OR email = $1 OR phone = $1`,
        [createdBy]
      );

      if (userResult.rows.length > 0) {
        clientName = userResult.rows[0].full_name || 'Client';
        clientAvatar = userResult.rows[0].avatar_url || '';
      }
    } catch (userError) {
      console.warn('⚠️ Could not fetch user info:', userError.message);
    }

    // Generate job ID
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Try to find user ID from createdBy (could be firebase_uid, email, phone, or id)
    let clientIdValue = null;
    try {
      const userCheck = await pool.query(
        `SELECT id FROM users WHERE firebase_uid = $1 OR email = $1 OR phone = $1 OR id::text = $1 LIMIT 1`,
        [createdBy]
      );
      if (userCheck.rows.length > 0) {
        clientIdValue = userCheck.rows[0].id;
      }
    } catch (userError) {
      console.warn('⚠️ Could not find user ID, using NULL for client_id:', userError.message);
    }

    // Prepare job data
    const jobData = {
      id: jobId,
      title: title,
      description: description,
      category: category,
      price: parseFloat(price) || 0,
      status: 'open',
      location: location || { lat: 13.736717, lng: 100.523186 },
      datetime: datetime || new Date().toISOString(),
      created_by: createdBy,
      created_by_name: clientName,
      created_by_avatar: clientAvatar,
      client_id: clientIdValue, // Use UUID if found, otherwise NULL
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    console.log('📝 [CREATE JOB] Inserting job:', jobId);

    // Parse location for lat/lng
    const locationLat = jobData.location?.lat || 13.736717;
    const locationLng = jobData.location?.lng || 100.523186;

    // Insert into database with location_lat and location_lng
    const result = await pool.query(
      `INSERT INTO jobs (
        id, title, description, category, price, status,
        location, location_lat, location_lng, datetime, 
        created_by, created_by_name, created_by_avatar, 
        client_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        jobData.id,
        jobData.title,
        jobData.description,
        jobData.category,
        jobData.price,
        jobData.status,
        JSON.stringify(jobData.location),
        locationLat,
        locationLng,
        jobData.datetime || new Date().toISOString(),
        jobData.created_by,
        jobData.created_by_name || 'Client',
        jobData.created_by_avatar || '',
        jobData.client_id, // Can be NULL if user not found
        jobData.created_at || new Date().toISOString(),
        jobData.updated_at || new Date().toISOString()
      ]
    );

    const createdJob = result.rows[0];

    // Parse JSON fields
    if (createdJob.location && typeof createdJob.location === 'string') {
      createdJob.location = JSON.parse(createdJob.location);
    }

    console.log('✅ [CREATE JOB] Job created successfully:', jobId);
    console.log('✅ [CREATE JOB] Job status:', createdJob.status);
    console.log('✅ [CREATE JOB] Job created_at:', createdJob.created_at);

    // Parse location if needed
    if (createdJob.location && typeof createdJob.location === 'string') {
      try {
        createdJob.location = JSON.parse(createdJob.location);
      } catch (e) {
        // Keep as string if parse fails
      }
    }

    res.json({
      success: true,
      message: 'Job created successfully',
      job: {
        ...createdJob,
        location: createdJob.location && typeof createdJob.location === 'string'
          ? JSON.parse(createdJob.location)
          : createdJob.location,
        clientName: createdJob.created_by_name,
        clientId: createdJob.client_id
      }
    });

  } catch (error) {
    console.error('❌ [CREATE JOB] Error:', error);
    console.error('❌ [CREATE JOB] Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      stack: error.stack?.substring(0, 500)
    });

    // Try to provide helpful error message
    let errorMessage = 'Failed to create job';
    if (error.code === '23505') {
      errorMessage = 'Job with this ID already exists';
    } else if (error.code === '23503') {
      errorMessage = 'User not found';
    } else {
      errorMessage = error.message || 'Unknown error';
    }

    res.status(500).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? {
        message: error.message,
        code: error.code,
        detail: error.detail
      } : undefined
    });
  }
});
// ✅ Get Recommended Jobs (ต้องมาก่อน /api/jobs/:jobId)
app.get('/api/jobs/recommended', async (req, res) => {
  try {
    const userId = req.query.userId;
    console.log(`🎯 [RECOMMENDED JOBS] For user: ${userId}`);

    // ดึงข้อมูลผู้ใช้เพื่อแนะนำงานที่เหมาะสม
    let userSkills = [];
    if (userId && userId !== 'current') {
      try {
        const userResult = await pool.query(
          `SELECT skills FROM users WHERE firebase_uid = $1 OR email = $1 OR phone = $1 OR id::text = $1`,
          [userId]
        );

        if (userResult.rows.length > 0) {
          const skills = userResult.rows[0].skills;
          userSkills = typeof skills === 'string' ? JSON.parse(skills) : skills || [];
        }
      } catch (userError) {
        console.warn('⚠️ Could not fetch user skills:', userError.message);
      }
      // Fallback สำหรับ demo-anna: ให้มี skills เพื่อ match กับหมวดงานที่ Bob โพสต์
      if (userSkills.length === 0 && (userId === 'demo-anna-id' || String(userId).includes('demo'))) {
        userSkills = ['Delivery', 'Cleaning', 'Repair', 'Teaching', 'Driver'];
      }
    }

    // ดึง open jobs - ใช้ ORDER BY created_at DESC เพื่อให้งานใหม่ขึ้นก่อน
    // ใช้ COALESCE เพื่อ handle NULL values
    const result = await pool.query(`
      SELECT 
        j.id,
        j.title,
        j.description,
        j.category,
        j.price,
        j.budget_amount,
        j.status,
        j.location,
        j.location_lat,
        j.location_lng,
        j.datetime,
        j.created_at,
        j.created_by,
        j.created_by_name,
        j.created_by_avatar,
        j.client_id,
        COALESCE(u.full_name, j.created_by_name) as client_name,
        COALESCE(u.avatar_url, j.created_by_avatar) as client_avatar
      FROM jobs j
      LEFT JOIN users u ON (
        j.client_id = u.id 
        OR j.created_by::text = u.id::text 
        OR j.created_by = u.firebase_uid
      )
      WHERE j.status = 'open'
      ORDER BY j.created_at DESC NULLS LAST
      LIMIT 50
    `);

    console.log(`📊 [RECOMMENDED JOBS] Found ${result.rows.length} jobs from database`);
    if (result.rows.length > 0) {
      console.log(`📊 [RECOMMENDED JOBS] First job ID: ${result.rows[0].id}, Created: ${result.rows[0].created_at}`);
    }

    const jobs = result.rows.map(job => {
      // Calculate distance (mock for now)
      const distance = Math.floor(Math.random() * 10) + 1;

      // Check if job matches user skills
      const isRecommended = userSkills.length > 0 &&
        userSkills.some(skill =>
          job.category?.toLowerCase().includes(skill.toLowerCase()) ||
          skill.toLowerCase().includes(job.category?.toLowerCase() || '')
        );

      // Parse location
      let location = { lat: 13.736717, lng: 100.523186 };
      if (job.location) {
        location = typeof job.location === 'string'
          ? JSON.parse(job.location)
          : job.location;
      } else if (job.location_lat && job.location_lng) {
        location = { lat: parseFloat(job.location_lat), lng: parseFloat(job.location_lng) };
      }

      return {
        id: job.id,
        title: job.title,
        description: job.description,
        category: job.category,
        price: parseFloat(job.price || job.budget_amount || 0),
        status: job.status,
        datetime: job.datetime || job.created_at,
        created_at: job.created_at,
        created_by: job.created_by,
        created_by_name: job.client_name || job.created_by_name || 'Client',
        created_by_avatar: job.client_avatar || job.created_by_avatar,
        location: location,
        distance: distance,
        is_recommended: isRecommended,
        clientName: job.client_name || job.created_by_name || 'Client'
      };
    });

    // Sort: recommended jobs first
    if (userSkills.length > 0) {
      jobs.sort((a, b) => {
        if (a.is_recommended && !b.is_recommended) return -1;
        if (!a.is_recommended && b.is_recommended) return 1;
        return 0;
      });
    }

    // ถ้าไม่มี jobs ใน DB
    if (jobs.length === 0) {
      jobs.push(
        {
          id: "job-001",
          title: "Delivery Service",
          description: "Need to deliver documents",
          category: "Delivery",
          price: 500,
          status: "open",
          datetime: new Date().toISOString(),
          created_at: new Date().toISOString(),
          created_by: userId || "550e8400-e29b-41d4-a716-446655440000",
          created_by_name: "Anna Employer",
          created_by_avatar: "https://i.pravatar.cc/150?u=anna",
          location: { lat: 13.736717, lng: 100.523186 },
          distance: 3,
          is_recommended: userSkills.some(s => s.toLowerCase().includes('delivery')),
          clientName: "Anna Employer"
        }
      );
    }

    console.log(`🎯 [RECOMMENDED JOBS] Returning ${jobs.length} jobs`);
    console.log(`🎯 [RECOMMENDED JOBS] Job IDs:`, jobs.map(j => j.id).slice(0, 5));
    res.json(jobs);

  } catch (error) {
    console.error('❌ [RECOMMENDED JOBS] Error:', error);
    res.json([{
      id: "job-001",
      title: "Delivery Service",
      description: "Need to deliver documents",
      category: "Delivery",
      price: 500,
      status: "open",
      datetime: new Date().toISOString(),
      created_at: new Date().toISOString(),
      created_by_name: "Anna Employer",
      created_by_avatar: "https://i.pravatar.cc/150?u=anna",
      location: { lat: 13.736717, lng: 100.523186 },
      distance: 3,
      is_recommended: false,
      isFallback: true
    }]);
  }
});

// ✅ Get All Jobs (สำหรับหน้า Jobs)
app.get('/api/jobs/all', async (req, res) => {
  try {
    const { category, search } = req.query;

    console.log(`📋 [ALL JOBS] Category: ${category}, Search: ${search}`);

    let query = `
      SELECT 
        j.*,
        u.full_name as client_name,
        u.avatar_url as client_avatar
      FROM jobs j
      LEFT JOIN users u ON j.created_by::text = u.id::text
      WHERE j.status = 'open'
    `;

    const params = [];
    let paramCount = 1;

    if (category && category !== 'All') {
      query += ` AND j.category = $${paramCount}`;
      params.push(category);
      paramCount++;
    }

    if (search) {
      query += ` AND (j.title ILIKE $${paramCount} OR j.description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    query += ` ORDER BY j.created_at DESC LIMIT 50`;

    const result = await pool.query(query, params);

    const jobs = result.rows.map(job => {
      // Parse location
      let location = { lat: 13.736717, lng: 100.523186 };
      if (job.location) {
        location = typeof job.location === 'string'
          ? JSON.parse(job.location)
          : job.location;
      }

      return {
        id: job.id,
        title: job.title,
        description: job.description,
        category: job.category,
        price: parseFloat(job.price) || 0,
        status: job.status,
        datetime: job.datetime || job.created_at,
        created_at: job.created_at,
        created_by: job.created_by,
        created_by_name: job.client_name || job.created_by_name || 'Client',
        created_by_avatar: job.client_avatar || job.created_by_avatar,
        location: location,
        clientName: job.client_name || 'Client',
        clientId: job.client_id
      };
    });

    // ถ้าไม่มี jobs
    if (jobs.length === 0) {
      jobs.push(
        {
          id: "job-mock-1",
          title: "Delivery Service",
          description: "Need to deliver documents",
          category: "Delivery",
          price: 500,
          status: "open",
          datetime: new Date().toISOString(),
          created_at: new Date().toISOString(),
          created_by_name: "Anna Employer",
          created_by_avatar: "https://i.pravatar.cc/150?u=anna",
          location: { lat: 13.736717, lng: 100.523186 },
          clientName: "Anna Employer",
          isMock: true
        }
      );
    }

    console.log(`📋 [ALL JOBS] Returning ${jobs.length} jobs`);
    res.json(jobs);

  } catch (error) {
    console.error('❌ [ALL JOBS] Error:', error);
    res.json([]);
  }
});
// ============ KYC ENDPOINTS ============

// ✅ 1. Submit KYC Documents
app.post('/api/kyc/submit', uploadMulter.fields([
  { name: 'idCardFront', maxCount: 1 },
  { name: 'selfiePhoto', maxCount: 1 },
  { name: 'idCardBack', maxCount: 1 },
  { name: 'drivingLicenseFront', maxCount: 1 },
  { name: 'drivingLicenseBack', maxCount: 1 },
  { name: 'selfieVideo', maxCount: 1 }
]), async (req, res) => {
  try {
    const { userId, fullName, birthDate, idCardNumber } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID required' });
    }

    const uploadedFiles = {};
    const uploadPromises = [];

    // Upload ไฟล์ทีละตัว
    for (const [fieldName, fileArray] of Object.entries(req.files)) {
      if (fileArray && fileArray[0]) {
        const file = fileArray[0];
        const base64Data = file.buffer.toString('base64');
        const dataUri = `data:${file.mimetype};base64,${base64Data}`;

        const uploadPromise = cloudinary.uploader.upload(dataUri, {
          folder: `kyc/${userId}`,
          public_id: `${fieldName}_${Date.now()}`,
          resource_type: fieldName.includes('video') ? 'video' : 'image'
        }).then(result => {
          uploadedFiles[fieldName] = result.secure_url;
        });

        uploadPromises.push(uploadPromise);
      }
    }

    await Promise.all(uploadPromises);

    // บันทึกข้อมูล KYC ลง database
    const result = await pool.query(
      `INSERT INTO kyc_submissions (
        user_id, full_name, birth_date, id_card_number,
        id_card_front_url, id_card_back_url, selfie_photo_url,
        driving_license_front_url, driving_license_back_url,
        selfie_video_url, status, submitted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      RETURNING *`,
      [
        userId,
        fullName,
        birthDate,
        idCardNumber,
        uploadedFiles.idCardFront,
        uploadedFiles.idCardBack,
        uploadedFiles.selfiePhoto,
        uploadedFiles.drivingLicenseFront,
        uploadedFiles.drivingLicenseBack,
        uploadedFiles.selfieVideo,
        'pending_review'
      ]
    );

    // อัพเดท user kyc status
    await pool.query(
      `UPDATE users SET 
        kyc_status = 'pending_review',
        kyc_submitted_at = NOW()
       WHERE id = $1`,
      [userId]
    );

    // TODO: Trigger AI verification process

    res.json({
      success: true,
      message: 'KYC documents submitted successfully',
      submissionId: result.rows[0].id,
      status: 'pending_review',
      files: Object.keys(uploadedFiles)
    });

  } catch (error) {
    console.error('KYC submission error:', error);
    res.status(500).json({ error: 'KYC submission failed' });
  }
});

// ✅ 2. Check KYC Status
app.get('/api/kyc/status/:userId', async (req, res) => {
  try {
    const user = await UserModel.findById(req.params.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // ดึง submission ล่าสุด
    const kycResult = await pool.query(
      `SELECT * FROM kyc_submissions 
       WHERE user_id = $1 
       ORDER BY submitted_at DESC 
       LIMIT 1`,
      [req.params.userId]
    );

    const latestSubmission = kycResult.rows[0];
    const verifiedAt = user.kyc_verified_at ? new Date(user.kyc_verified_at) : null;
    const nextReverifyAt = user.kyc_next_reverify_at ? new Date(user.kyc_next_reverify_at) : null;
    const now = new Date();
    const needsReverify = (user.kyc_status === 'verified' || user.kyc_status === 'approved') &&
      (nextReverifyAt && nextReverifyAt <= now);

    res.json({
      kycStatus: user.kyc_status || 'not_submitted',
      kycLevel: user.kyc_level || 'level_1',
      submittedAt: user.kyc_submitted_at,
      kycVerifiedAt: verifiedAt ? verifiedAt.toISOString() : null,
      kycNextReverifyAt: nextReverifyAt ? nextReverifyAt.toISOString() : null,
      needsReverify: !!needsReverify,
      verificationStatus: latestSubmission?.status,
      lastSubmission: latestSubmission ? {
        id: latestSubmission.id,
        submittedAt: latestSubmission.submitted_at,
        status: latestSubmission.status
      } : null
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check KYC status' });
  }
});

// ✅ 2b. KYC Re-Verify (every 1 year or when critical data changes)
app.post('/api/kyc/re-verify', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const userResult = await pool.query('SELECT id, kyc_status, kyc_verified_at, kyc_next_reverify_at FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    await pool.query(
      `UPDATE users SET 
        kyc_verified_at = NOW(),
        kyc_next_reverify_at = NOW() + INTERVAL '1 year',
        updated_at = NOW()
       WHERE id = $1`,
      [userId]
    );

    res.json({
      success: true,
      message: 'KYC re-verification recorded; next due in 1 year.',
      kycVerifiedAt: new Date().toISOString(),
      kycNextReverifyAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    });
  } catch (error) {
    console.error('KYC re-verify error:', error);
    res.status(500).json({ error: 'Failed to re-verify KYC' });
  }
});

// ✅ 3. Update KYC Status (สำหรับ admin) + Audit Log
app.post('/api/kyc/update-status', async (req, res) => {
  try {
    const { submissionId, status, kycLevel, adminNotes } = req.body;
    const actorId = req.user?.id || req.body.adminId || 'system';
    const ipAddress = getClientIp(req);

    const existing = await pool.query(
      'SELECT id, user_id, status FROM kyc_submissions WHERE id = $1',
      [submissionId]
    );
    const oldStatus = existing.rows[0]?.status;

    const result = await pool.query(
      `UPDATE kyc_submissions SET 
        status = $1,
        reviewed_at = NOW(),
        admin_notes = $2
       WHERE id = $3
       RETURNING *`,
      [status, adminNotes, submissionId]
    );

    if (result.rows.length > 0) {
      const submission = result.rows[0];

      // อัพเดท user (และ next re-verify 1 ปี เมื่อ approve)
      await pool.query(
        `UPDATE users SET 
          kyc_status = $1,
          kyc_level = $2,
          kyc_verified_at = CASE WHEN $1 IN ('verified', 'approved') THEN NOW() ELSE kyc_verified_at END,
          kyc_next_reverify_at = CASE WHEN $1 IN ('verified', 'approved') THEN NOW() + INTERVAL '1 year' ELSE kyc_next_reverify_at END,
          updated_at = NOW()
         WHERE id = $3`,
        [status, kycLevel, submission.user_id]
      );

      // Provider Onboarding: เมื่อ KYC ผ่าน → ล็อกเป็น PENDING_TEST (ยังรับงานไม่ได้จนกว่าจะสอบผ่าน)
      if (String(status).toLowerCase() === 'verified' || String(status).toLowerCase() === 'approved') {
        await pool.query(
          `UPDATE users
           SET provider_status = 'PENDING_TEST',
               updated_at = NOW()
           WHERE id = $1
             AND (role ILIKE 'provider' OR role = 'provider')`,
          [submission.user_id]
        );
      }

      // Audit: Safety Flow — KYC status change (for dispute evidence)
      auditService.log(actorId, 'KYC_STATUS_CHANGED', {
        entityName: 'kyc_submissions',
        entityId: String(submissionId),
        old: { status: oldStatus },
        new: { status, kycLevel, user_id: submission.user_id }
      }, { actorRole: 'Admin', status: 'Success', ipAddress });

      res.json({
        success: true,
        message: 'KYC status updated',
        submission: result.rows[0]
      });
    } else {
      res.status(404).json({ error: 'Submission not found' });
    }
  } catch (error) {
    console.error('KYC update-status error:', error);
    res.status(500).json({ error: 'Failed to update KYC status' });
  }
});
// ============ REPORT ENDPOINTS ============

// ✅ 1. Get Earnings Report
app.get('/api/reports/earnings', async (req, res) => {
  try {
    const { userId, startDate, endDate, period = 'monthly' } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'User ID required' });
    }

    let dateRange = '';
    const params = [userId];

    if (startDate && endDate) {
      dateRange = 'AND created_at BETWEEN $2 AND $3';
      params.push(startDate, endDate);
    }

    // ดึงรายงานรายได้
    const earningsResult = await pool.query(
      `SELECT 
        DATE(created_at) as date,
        SUM(CASE WHEN type = 'income' AND status = 'completed' THEN amount ELSE 0 END) as earnings,
        SUM(CASE WHEN type = 'fee' THEN amount ELSE 0 END) as fees,
        COUNT(*) as transaction_count
       FROM transactions
       WHERE user_id = $1 ${dateRange}
       GROUP BY DATE(created_at)
       ORDER BY date DESC`,
      params
    );

    // ดึง transaction ล่าสุด
    const transactionsResult = await pool.query(
      `SELECT * FROM transactions
       WHERE user_id = $1 ${dateRange}
       ORDER BY created_at DESC
       LIMIT 100`,
      params
    );

    const totalEarnings = earningsResult.rows.reduce((sum, row) =>
      sum + parseFloat(row.earnings || 0), 0);
    const totalFees = earningsResult.rows.reduce((sum, row) =>
      sum + parseFloat(row.fees || 0), 0);

    res.json({
      period: startDate && endDate ? `${startDate} to ${endDate}` : period,
      totalEarnings,
      totalFees,
      netEarnings: totalEarnings - totalFees,
      dailyBreakdown: earningsResult.rows,
      recentTransactions: transactionsResult.rows
    });

  } catch (error) {
    console.error('Earnings report error:', error);
    res.status(500).json({ error: 'Failed to generate earnings report' });
  }
});

// ✅ 2. Get Job Statistics
app.get('/api/reports/job-stats', async (req, res) => {
  try {
    const { userId, userRole, timeRange = 'month' } = req.query;

    let whereClause = '';
    const params = [];

    if (userId && userRole) {
      if (userRole === 'client') {
        whereClause = 'WHERE created_by = $1';
        params.push(userId);
      } else if (userRole === 'provider') {
        whereClause = 'WHERE accepted_by = $1';
        params.push(userId);
      }
    }

    // กรองตาม time range
    let dateFilter = '';
    if (timeRange === 'today') {
      dateFilter = `AND DATE(created_at) = CURRENT_DATE`;
    } else if (timeRange === 'week') {
      dateFilter = `AND created_at >= CURRENT_DATE - INTERVAL '7 days'`;
    } else if (timeRange === 'month') {
      dateFilter = `AND created_at >= CURRENT_DATE - INTERVAL '30 days'`;
    }

    // ดึงสถิติ
    const statsResult = await pool.query(
      `SELECT 
        status,
        COUNT(*) as count,
        SUM(price) as total_amount
       FROM jobs
       ${whereClause} ${whereClause ? dateFilter.replace('AND', 'AND') : dateFilter ? 'WHERE ' + dateFilter.substring(4) : ''}
       GROUP BY status`,
      params
    );

    // ดึง job ล่าสุด
    const recentJobsResult = await pool.query(
      `SELECT * FROM jobs
       ${whereClause} ${whereClause ? dateFilter.replace('AND', 'AND') : dateFilter ? 'WHERE ' + dateFilter.substring(4) : ''}
       ORDER BY created_at DESC
       LIMIT 10`,
      params
    );

    const totalJobs = statsResult.rows.reduce((sum, row) => sum + parseInt(row.count), 0);
    const totalValue = statsResult.rows.reduce((sum, row) =>
      sum + parseFloat(row.total_amount || 0), 0);

    res.json({
      statistics: statsResult.rows,
      recentJobs: recentJobsResult.rows,
      summary: {
        totalJobs,
        totalValue,
        averageJobValue: totalJobs > 0 ? totalValue / totalJobs : 0
      }
    });

  } catch (error) {
    console.error('Job stats error:', error);
    res.status(500).json({ error: 'Failed to generate job statistics' });
  }
});

// ============ MISSING USER ENDPOINTS ============

// ✅ 1. GET /api/users/profile/:id (ที่ frontend เรียก)
// แก้ไข endpoint /api/users/profile/:id
app.get('/api/users/profile/:id', async (req, res) => {
  try {
    const userId = req.params.id;

    console.log(`📋 Fetching profile for: ${userId}`);

    // ใช้ query ที่ถูกต้องตาม schema_simple.sql
    const query = `
      SELECT * FROM users 
      WHERE firebase_uid = $1 
         OR email = $1 
         OR phone = $1 
         OR id::text = $1
    `;

    let result;
    try {
      result = await pool.query(query, [userId]);
    } catch (dbError) {
      console.error('❌ Database query error:', dbError);
      // Fallback สำหรับ demo-anna-id หรือเมื่อ database error
      if (userId === 'demo-anna-id' || userId?.includes('demo')) {
        return res.json({
          id: '550e8400-e29b-41d4-a716-446655440000',
          firebase_uid: userId,
          email: 'anna@meerak.app',
          phone: '0800000001',
          name: 'Anna Employer',
          role: 'user',
          kyc_level: 'level_2',
          kyc_status: 'verified',
          wallet_balance: 50000,
          wallet_pending: 0,
          avatar_url: 'https://i.pravatar.cc/150?u=anna',
          skills: [],
          trainings: [],
          completed_jobs_count: 0,
          location: { lat: 13.7462, lng: 100.5347 },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          source: 'fallback'
        });
      }

      return res.status(500).json({
        error: 'Database error',
        message: process.env.NODE_ENV === 'development' ? dbError.message : 'Internal server error'
      });
    }

    if (result.rows.length === 0) {
      // Fallback สำหรับ demo-anna-id
      if (userId === 'demo-anna-id' || userId?.includes('demo')) {
        return res.json({
          id: '550e8400-e29b-41d4-a716-446655440000',
          firebase_uid: userId,
          email: 'anna@meerak.app',
          phone: '0800000001',
          name: 'Anna Employer',
          role: 'user',
          kyc_level: 'level_2',
          kyc_status: 'verified',
          wallet_balance: 50000,
          wallet_pending: 0,
          avatar_url: 'https://i.pravatar.cc/150?u=anna',
          skills: [],
          trainings: [],
          completed_jobs_count: 0,
          location: { lat: 13.7462, lng: 100.5347 },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          source: 'fallback'
        });
      }

      return res.status(404).json({
        error: 'User not found',
        requestedId: userId
      });
    }

    const user = result.rows[0];

    // Map ชื่อ fields ให้ตรงกับที่ frontend ต้องการ
    const response = {
      id: user.id,
      firebase_uid: user.firebase_uid,
      email: user.email,
      phone: user.phone,
      name: user.full_name || user.display_name || user.name,
      role: user.role,
      kyc_level: user.kyc_level || 'level_1',
      kyc_status: user.kyc_status || 'not_submitted',
      wallet_balance: parseFloat(user.wallet_balance || user.balance || 0),
      wallet_pending: parseFloat(user.wallet_pending || 0),
      avatar_url: user.avatar_url,
      skills: typeof user.skills === 'string' ? JSON.parse(user.skills) : (user.skills || []),
      trainings: typeof user.trainings === 'string' ? JSON.parse(user.trainings) : (user.trainings || []),
      location: typeof user.location === 'string'
        ? JSON.parse(user.location)
        : user.location || { lat: 13.736717, lng: 100.523186 },
      created_at: user.created_at,
      updated_at: user.updated_at,
      source: 'postgresql'
    };

    res.json(response);

  } catch (error) {
    console.error('❌ Profile fetch error:', error);
    console.error('❌ Profile fetch error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack?.substring(0, 300)
    });

    // Fallback สำหรับ demo users หรือเมื่อมี error
    if (req.params.id === 'demo-anna-id' || req.params.id?.includes('demo')) {
      console.log('🔄 Using fallback profile for:', req.params.id);
      return res.json({
        id: '550e8400-e29b-41d4-a716-446655440000',
        firebase_uid: req.params.id,
        email: 'anna@meerak.app',
        phone: '0800000001',
        name: 'Anna Employer',
        role: 'user',
        kyc_level: 'level_2',
        kyc_status: 'verified',
        wallet_balance: 50000,
        wallet_pending: 0,
        avatar_url: 'https://i.pravatar.cc/150?u=anna',
        skills: [],
        trainings: [],
        location: { lat: 13.7462, lng: 100.5347 },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        source: 'fallback_error'
      });
    }

    res.status(500).json({
      error: 'Failed to fetch user profile',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Debug endpoint
app.get('/api/debug/db-test', async (req, res) => {
  try {
    // Test 1: Basic connection
    const test1 = await pool.query('SELECT NOW() as time, version() as version');

    // Test 2: Check users table
    const test2 = await pool.query('SELECT COUNT(*) as count FROM users');

    // Test 3: Find specific user
    const test3 = await pool.query(
      `SELECT id, firebase_uid, email FROM users WHERE firebase_uid = $1`,
      ['RwCdeFaFMmtjP16BFuZy']
    );

    res.json({
      status: 'success',
      connection: {
        time: test1.rows[0].time,
        version: test1.rows[0].version
      },
      users: {
        total: test2.rows[0].count,
        target_user: test3.rows[0] || 'not_found'
      },
      endpoints: {
        profile: '/api/users/profile/:id',
        jobs: '/api/users/jobs/:userId',
        health: '/api/health'
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});
// ✅ 2. งานของ user — เรียก JobModel.findByUserId (logic อยู่ที่ model เดียว)
app.get('/api/users/jobs/:userId', async (req, res) => {
  try {
    const uid = String(req.params.userId || '').trim();
    if (!uid) return res.json([]);
    const jobs = await JobModel.findByUserId(uid);
    res.json(jobs.map(normalizeJobForApi));
  } catch (e) {
    console.error('❌ [GET /api/users/jobs]', e.message);
    res.json([]);
  }
});
// ✅ เพิ่ม endpoint สำหรับตรวจสอบ pending payments
// ✅ แก้ไข pending payments endpoint ให้ง่ายๆ
app.get('/api/payments/pending', async (req, res) => {
  try {
    console.log('🔍 Checking for pending payments...');

    // ⭐ ใช้ query แบบง่ายๆ ก่อน
    const result = await pool.query(`
      SELECT COUNT(*) as pending_count 
      FROM transactions 
      WHERE status = 'pending_release'
    `);

    const pendingCount = parseInt(result.rows[0].pending_count || 0);

    console.log(`📊 Found ${pendingCount} pending payments`);

    // ⭐ ส่ง response แบบง่ายก่อน
    res.json({
      success: true,
      pending_count: pendingCount,
      pending_payments: [], // ว่างก่อน
      timestamp: new Date().toISOString(),
      message: pendingCount > 0 ?
        `มี ${pendingCount} การชำระเงินรอการโอน` :
        'ไม่มีรายการรอการโอน'
    });

  } catch (error) {
    console.error('❌ Error in /api/payments/pending:', error.message);

    // ⭐ ส่ง response สำรองแทนที่จะ error
    res.json({
      success: false,
      pending_count: 0,
      pending_payments: [],
      timestamp: new Date().toISOString(),
      error: 'Table transactions might not exist yet',
      mock_data: true
    });
  }
});
// ✅ Get Recommended Jobs (DUPLICATE - REMOVED, ใช้ตัวที่อยู่ก่อนหน้าแทน)

// ✅ รายละเอียดงาน — เรียก JobModel.findById
app.get('/api/jobs/:jobId', async (req, res) => {
  const jobId = (req.params.jobId || req.params.id || '').toString().trim();
  if (!jobId) return res.status(400).json({ error: 'Job ID required' });
  try {
    const job = await JobModel.findById(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found', jobId });
    res.json(normalizeJobForApi(job));
  } catch (e) {
    console.error('❌ [GET /api/jobs/:id]', e.message);
    res.status(500).json({ error: 'Failed to fetch job', jobId, message: e.message });
  }
});
// ✅ Get user transactions
app.get('/api/users/transactions/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log(`💰 Fetching transactions for user: ${userId}`);

    // 1. หา user ID จาก firebase_uid
    const userResult = await pool.query(
      'SELECT id FROM users WHERE firebase_uid = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      console.log('User not found, returning empty transactions');
      return res.json([]);
    }

    const actualUserId = userResult.rows[0].id;
    console.log(`Found user ID for transactions: ${actualUserId}`);

    // 2. Query transactions
    const transactionsResult = await pool.query(
      `SELECT t.*,
         j.title as job_title,
         j.budget_amount as job_amount
       FROM transactions t
       LEFT JOIN jobs j ON t.related_job_id = j.id
       WHERE t.user_id = $1
       ORDER BY t.created_at DESC
       LIMIT 100`,
      [actualUserId]
    );

    console.log(`Found ${transactionsResult.rows.length} transactions`);
    res.json(transactionsResult.rows);

  } catch (error) {
    console.error('❌ Get transactions error:', error.message);

    // Send empty array as fallback
    res.json([]);
  }
});
// ✅ Get financial summary
// ============ REPORT ENDPOINTS ============

// ✅ 1. Get Financial Summary
app.get('/api/reports/financial-summary', async (req, res) => {
  try {
    const userId = req.query.userId || 'current';

    console.log(`📊 Fetching financial summary for user: ${userId}`);

    // ในกรณีนี้เราจะ return mock data ก่อน
    // ใน production จะ query จาก database

    res.json({
      success: true,
      summary: {
        weekly: 15000,
        monthly: 60000,
        yearly: 720000,
        pending: 0,
        available: 50000
      },
      chartData: [
        { name: "Jan", amount: 40000 },
        { name: "Feb", amount: 30000 },
        { name: "Mar", amount: 50000 },
        { name: "Apr", amount: 45000 },
        { name: "May", amount: 60000 },
        { name: "Jun", amount: 55000 },
      ]
    });

  } catch (error) {
    console.error('Financial summary error:', error);
    res.status(500).json({ error: 'Failed to generate financial summary' });
  }
});

// ✅ 2. Get Earnings Report
app.get('/api/reports/earnings', async (req, res) => {
  try {
    const { period = 'monthly' } = req.query;

    res.json({
      period: period,
      totalEarnings: 60000,
      totalFees: 1200,
      netEarnings: 58800,
      dailyBreakdown: [
        { date: '2026-01-20', earnings: 1500, fees: 30 },
        { date: '2026-01-19', earnings: 2000, fees: 40 }
      ]
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to generate earnings report' });
  }
});

// ✅ 3. Get Job Statistics
app.get('/api/reports/job-stats', async (req, res) => {
  try {
    res.json({
      statistics: [
        { status: 'completed', count: 5, total_amount: 25000 },
        { status: 'open', count: 3, total_amount: 12000 },
        { status: 'in_progress', count: 1, total_amount: 5000 }
      ],
      summary: {
        totalJobs: 9,
        totalValue: 42000,
        averageJobValue: 4666.67
      }
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to generate job statistics' });
  }
});
// ============ PROVIDERS ENDPOINTS ============

// ✅ Get All Providers
app.get('/api/providers', async (req, res) => {
  try {
    console.log('👥 [PROVIDERS] Fetching all providers');

    // 1. ตรวจสอบใน PostgreSQL
    const result = await pool.query(`
      SELECT 
        id,
        firebase_uid,
        email,
        phone,
        full_name as name,
        role,
        kyc_level,
        avatar_url,
        skills,
        completed_jobs_count as completedJobs,
        rating,
        location,
        created_at as joinedDate,
        account_status
      FROM users
      WHERE role = 'provider' 
        AND account_status = 'active'
        AND is_deleted = FALSE
      ORDER BY rating DESC, completed_jobs_count DESC
      LIMIT 50
    `);

    let providers = result.rows.map(user => ({
      id: user.id,
      firebase_uid: user.firebase_uid,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      kyc_level: user.kyc_level,
      avatar_url: user.avatar_url,
      skills: typeof user.skills === 'string' ? JSON.parse(user.skills) : user.skills || [],
      completedJobs: user.completedjobs || 0,
      rating: parseFloat(user.rating) || 0,
      location: typeof user.location === 'string' ? JSON.parse(user.location) : user.location || {},
      joinedDate: user.joineddate,
      status: 'available',
      verificationStatus: user.kyc_level === 'level_2' ? 'verified' : 'basic'
    }));

    // 2. ถ้าไม่มี provider ใน database ให้ใช้ mock data
    if (providers.length === 0) {
      console.log('👥 [PROVIDERS] No providers in DB, using mock data');
      providers = [
        {
          id: "550e8400-e29b-41d4-a716-446655440001",
          firebase_uid: "demo-bob-id",
          name: "Bob Provider",
          email: "bob@meerak.app",
          phone: "0800000002",
          role: "provider",
          kyc_level: "level_2",
          avatar_url: "https://i.pravatar.cc/150?u=bob",
          skills: ["Electrician", "Cleaning", "Driver"],
          completedJobs: 10,
          rating: 4.5,
          location: { lat: 13.7465, lng: 100.535 },
          joinedDate: new Date().toISOString(),
          status: "available",
          verificationStatus: "verified",
          hourlyRate: 500
        },
        {
          id: "provider-001",
          name: "John Technician",
          email: "john@meerak.app",
          phone: "0800000003",
          role: "provider",
          kyc_level: "level_2",
          avatar_url: "https://i.pravatar.cc/150?u=john",
          skills: ["Repair", "Installation", "Maintenance"],
          completedJobs: 25,
          rating: 4.8,
          location: { lat: 13.7367, lng: 100.5231 },
          joinedDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
          status: "available",
          verificationStatus: "verified",
          hourlyRate: 600
        },
        {
          id: "provider-002",
          name: "Jane Cleaner",
          email: "jane@meerak.app",
          phone: "0800000004",
          role: "provider",
          kyc_level: "level_2",
          avatar_url: "https://i.pravatar.cc/150?u=jane",
          skills: ["Cleaning", "Laundry", "Cooking"],
          completedJobs: 15,
          rating: 4.7,
          location: { lat: 13.7563, lng: 100.5018 },
          joinedDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
          status: "on_job",
          verificationStatus: "verified",
          hourlyRate: 450
        }
      ];
    }

    console.log(`👥 [PROVIDERS] Returning ${providers.length} providers`);
    res.json(providers);

  } catch (error) {
    console.error('❌ [PROVIDERS] Error:', error);

    // Fallback to mock data
    res.json([
      {
        id: "provider-001",
        name: "John Technician",
        rating: 4.8,
        completedJobs: 25,
        status: "available",
        location: "Bangkok",
        phone: "0800000003",
        email: "john@meerak.app",
        avatarUrl: "https://i.pravatar.cc/150?u=john",
        skills: ["Repair", "Installation", "Maintenance"],
        hourlyRate: 600,
        joinedDate: new Date().toISOString(),
        verificationStatus: "verified",
        isFallback: true
      }
    ]);
  }
});

// ✅ Get Providers by IDs (Batch)
app.post('/api/providers/batch', async (req, res) => {
  try {
    const { providerIds } = req.body;
    console.log(`👥 [PROVIDERS BATCH] Fetching ${providerIds?.length || 0} providers`);

    if (!providerIds || !Array.isArray(providerIds) || providerIds.length === 0) {
      return res.json([]);
    }

    // Convert UUID strings
    const validIds = providerIds.filter(id => id && id.length > 0);

    if (validIds.length === 0) {
      return res.json([]);
    }

    // Query providers
    const placeholders = validIds.map((_, i) => `$${i + 1}`).join(',');
    const query = `
      SELECT 
        id,
        firebase_uid,
        email,
        phone,
        full_name as name,
        role,
        kyc_level,
        avatar_url,
        skills,
        completed_jobs_count as completedJobs,
        rating,
        location,
        created_at as joinedDate
      FROM users
      WHERE id::text IN (${placeholders})
         OR firebase_uid IN (${placeholders})
      LIMIT 100
    `;

    const params = [...validIds, ...validIds];
    const result = await pool.query(query, params);

    const providers = result.rows.map(user => ({
      id: user.id,
      name: user.name,
      rating: parseFloat(user.rating) || 0,
      completedJobs: user.completedjobs || 0,
      status: 'available',
      location: 'Bangkok',
      phone: user.phone,
      email: user.email,
      avatarUrl: user.avatar_url,
      skills: typeof user.skills === 'string' ? JSON.parse(user.skills) : user.skills || [],
      hourlyRate: 500,
      joinedDate: user.joineddate,
      verificationStatus: user.kyc_level === 'level_2' ? 'verified' : 'basic'
    }));

    console.log(`👥 [PROVIDERS BATCH] Found ${providers.length} providers`);
    res.json(providers);

  } catch (error) {
    console.error('❌ [PROVIDERS BATCH] Error:', error);
    res.json([]); // Return empty array on error
  }
});
// ============ ADDITIONAL ENDPOINTS ============
// (Duplicate recommended jobs endpoint removed - using the one at line 897)
// ✅ Get job statistics (ชื่อ endpoint เดิมคือ job-stats แต่ frontend เรียก job-statistics)
app.get('/api/reports/job-statistics', async (req, res) => {
  try {
    const { userId } = req.query; // เปลี่ยนเป็น userId แทน userRole
    console.log(`📈 Fetching job statistics for user: ${userId}`);

    if (!userId) {
      return res.status(400).json({ error: 'User ID required' });
    }

    // 1. หา user ID และ role
    const userResult = await pool.query(
      'SELECT id, role FROM users WHERE firebase_uid = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      console.log('User not found, returning empty statistics');
      return res.json({
        statistics: [],
        recentJobs: [],
        summary: { totalJobs: 0, totalValue: 0, averageJobValue: 0 }
      });
    }

    const actualUserId = userResult.rows[0].id;
    const userRole = userResult.rows[0].role;

    // 2. Query jobs ตาม role
    let whereClause = '';
    if (userRole === 'client') {
      whereClause = 'WHERE client_id = $1';
    } else if (userRole === 'provider') {
      whereClause = 'WHERE provider_id = $1';
    }

    // ดึงสถิติ
    const statsResult = await pool.query(
      `SELECT 
        status,
        COUNT(*) as count,
        SUM(budget_amount) as total_amount
       FROM jobs
       ${whereClause}
       GROUP BY status`,
      whereClause ? [actualUserId] : []
    );

    // ดึง job ล่าสุด
    const recentJobsResult = await pool.query(
      `SELECT * FROM jobs
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT 10`,
      whereClause ? [actualUserId] : []
    );

    const totalJobs = statsResult.rows.reduce((sum, row) => sum + parseInt(row.count), 0);
    const totalValue = statsResult.rows.reduce((sum, row) =>
      sum + parseFloat(row.total_amount || 0), 0);

    const response = {
      statistics: statsResult.rows,
      recentJobs: recentJobsResult.rows,
      summary: {
        totalJobs,
        totalValue,
        averageJobValue: totalJobs > 0 ? totalValue / totalJobs : 0
      }
    };

    console.log(`✅ Job statistics: ${totalJobs} jobs, ${totalValue} total value`);
    res.json(response);

  } catch (error) {
    console.error('❌ Job statistics error:', error.message);

    // Mock fallback
    res.json({
      statistics: [
        { status: 'completed', count: 12, total_amount: 6000 },
        { status: 'in_progress', count: 3, total_amount: 1500 }
      ],
      recentJobs: [],
      summary: { totalJobs: 15, totalValue: 7500, averageJobValue: 500 }
    });
  }
});
// ✅ 3. GET /api/health (เพิ่มข้อมูลให้ละเอียดขึ้น)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'MEERAK Backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    database: 'PostgreSQL',
    endpoints: {
      user: '/api/users/profile/:id',
      jobs: '/api/users/jobs/:userId',
      payments: '/api/payments/*',
      kyc: '/api/kyc/*',
      upload: '/api/upload/*'
    }
  });
});

// ✅ 4. เพิ่ม GET /api/users/ สำหรับ debug
app.get('/api/users', async (req, res) => {
  try {
    const usersResult = await pool.query(
      'SELECT id, email, full_name, kyc_status FROM users LIMIT 10'
    );

    res.json({
      count: usersResult.rows.length,
      users: usersResult.rows
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});
// ============ UTILITY FUNCTIONS ============

// Commission calculation (copy from mockApi.ts)
app.post('/api/utils/calculate-commission', (req, res) => {
  const { completedJobs } = req.body;

  const commission = calculateCommission(completedJobs || 0);

  res.json({
    completedJobs,
    feePercent: commission,
    description: `ค่าคอมมิชชั่น: ${(commission * 100).toFixed(1)}%`
  });
});

// Distance calculation
app.post('/api/utils/calculate-distance', (req, res) => {
  const { lat1, lng1, lat2, lng2 } = req.body;

  if (!lat1 || !lng1 || !lat2 || !lng2) {
    return res.status(400).json({ error: 'Missing coordinates' });
  }

  const deg2rad = (deg) => deg * (Math.PI / 180);
  const R = 6371; // Earth's radius in km

  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in km

  res.json({
    distance: parseFloat(distance.toFixed(2)),
    unit: 'km',
    coordinates: { lat1, lng1, lat2, lng2 }
  });
});
// เพิ่ม delay สำหรับ Docker containers

// Health check with database
app.get('/api/health/detailed', async (req, res) => {
  try {
    // Check database
    const dbCheck = await pool.query('SELECT 1 as status');
    const dbStatus = dbCheck.rows[0]?.status === 1 ? 'healthy' : 'unhealthy';

    // Check Redis
    let redisStatus = 'unhealthy';
    try {
      await redisClient.ping();
      redisStatus = 'healthy';
    } catch (e) {
      redisStatus = 'unhealthy';
    }

    // Check Cloudinary
    let cloudinaryStatus = 'unhealthy';
    try {
      await cloudinary.api.ping();
      cloudinaryStatus = 'healthy';
    } catch (e) {
      cloudinaryStatus = 'unhealthy';
    }

    res.json({
      status: 'detailed_health',
      timestamp: new Date().toISOString(),
      services: {
        postgresql: dbStatus,
        redis: redisStatus,
        cloudinary: cloudinaryStatus
      },
      uptime: process.uptime(),
      memory: process.memoryUsage()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

// ============ USER PROFILE ENDPOINTS ============

// ✅ 1. Get User Profile by ID
// ✅ Duplicate endpoint removed - using the one at line 1426 instead

// ✅ 2. Update User Profile
app.patch('/api/users/profile/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    const updates = req.body;

    console.log(`🔄 Updating profile for user: ${userId}`, updates);

    // ตรวจสอบสิทธิ์ (simplified)
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // สร้าง SQL update dynamically
    const updateFields = [];
    const values = [];
    let paramIndex = 1;

    Object.entries(updates).forEach(([key, value]) => {
      // ไม่อนุญาตให้อัพเดท field บางอย่าง
      const forbiddenFields = ['id', 'created_at', 'firebase_uid'];
      if (forbiddenFields.includes(key)) return;

      updateFields.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    });

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updateFields.push('updated_at = NOW()');
    values.push(userId);

    const query = `
      UPDATE users 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updatedUser = result.rows[0];

    // ลบ cache
    try {
      await redisClient.del(`profile:${userId}`);
    } catch (redisError) {
      console.warn('Failed to clear cache:', redisError.message);
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        phone: updatedUser.phone,
        name: updatedUser.name,
        role: updatedUser.role,
        kyc_level: updatedUser.kyc_level,
        avatar_url: updatedUser.avatar_url,
        wallet_balance: parseFloat(updatedUser.wallet_balance) || 0,
        skills: updatedUser.skills || [],
        trainings: updatedUser.trainings || [],
        location: updatedUser.location,
        updated_at: updatedUser.updated_at
      }
    });

  } catch (error) {
    console.error('❌ Profile update error:', error);
    res.status(500).json({
      error: 'Failed to update profile',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// (GET /api/users/jobs/:userId ใช้ตัวเดียวที่บรรทัด ~2079 ผ่าน JobModel.findByUserId)

// ✅ 4. Get User Transactions
app.get('/api/users/transactions/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;

    const result = await pool.query(
      `SELECT * FROM transactions 
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    );

    res.json(result.rows);

  } catch (error) {
    console.error('Transactions fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});
// ============ AUTHENTICATION ENDPOINTS ============

// Helper: ตรวจสอบรหัสผ่าน (รองรับทั้ง password ธรรมดา และ password_hash / bcrypt)
async function checkPassword(plainPassword, row) {
  if (!row) return false;
  if (row.password_hash) {
    try {
      return await bcrypt.compare(plainPassword, row.password_hash);
    } catch (_) {
      return false;
    }
  }
  if (row.password !== undefined) return row.password === plainPassword;
  return false;
}

// ✅ 1. Login (user: phone + password) — with Redis rate limiting
app.post('/api/auth/login', rateLimitLogin, async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({
        error: 'Phone and password required'
      });
    }

    console.log(`🔐 Login attempt: ${phone}`);

    // 1. หา user จาก phone (รองรับทั้ง column password และ password_hash)
    const userResult = await pool.query(
      `SELECT id, phone, email, name, full_name, role, kyc_level, wallet_balance, avatar_url, created_at, password, password_hash
       FROM users WHERE phone = $1`,
      [phone]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid phone or password' });
    }

    const user = userResult.rows[0];
    const ok = await checkPassword(password, user);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid phone or password' });
    }

    // 2. Generate JWT token (simplified)
    const token = `jwt_${user.id}_${Date.now()}`;

    // 3. อัพเดท last login (ถ้ามี column)
    try {
      await pool.query(
        `UPDATE users SET last_login = NOW() WHERE id = $1`,
        [user.id]
      );
    } catch (_) { /* column may not exist */ }

    const name = user.name || user.full_name || user.phone;
    res.json({
      success: true,
      token: token,
      user: {
        id: user.id,
        email: user.email || `${user.phone}@meerak.app`,
        phone: user.phone,
        name: name,
        role: user.role,
        kyc_level: user.kyc_level,
        avatar_url: user.avatar_url,
        wallet_balance: parseFloat(user.wallet_balance) || 0,
        created_at: user.created_at
      },
      source: 'postgresql'
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ✅ Forgot Password — รับเบอร์โทร ส่งคำขอรีเซ็ตรหัส (ใน production ควรส่ง SMS/link)
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { phone } = req.body || {};
    if (!phone || !String(phone).trim()) {
      return res.status(400).json({ error: 'Phone number required' });
    }
    const userResult = await pool.query(
      'SELECT id, phone FROM users WHERE phone = $1',
      [String(phone).trim()]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบบัญชีที่ผูกกับเบอร์นี้' });
    }
    // TODO: สร้าง reset token + ส่ง SMS/อีเมลลิงก์รีเซ็ตรหัส
    console.log('Forgot password requested for phone:', phone);
    res.json({
      success: true,
      message: 'หากมีบัญชี เราจะส่งวิธีรีเซ็ตรหัสผ่านไปที่เบอร์นี้'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Request failed' });
  }
});

// ✅ Admin Login (email + password) — with Redis rate limiting by IP
app.post('/api/auth/admin-login', async (req, res, next) => {
  const ip = getClientIp(req);
  const { allowed, retryAfter } = await checkRateLimit('admin_login_ip', ip, RATE_LIMIT_LOGIN_IP);
  if (!allowed) {
    return res.status(429).set('Retry-After', String(retryAfter)).json({
      error: 'Too many login attempts',
      message: `Try again in ${retryAfter} seconds.`,
      retry_after: retryAfter
    });
  }
  next();
}, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    const JWT_SECRET = process.env.JWT_SECRET; // ต้องตั้ง JWT_SECRET ใน .env
    if (!JWT_SECRET) {
      return res.status(500).json({ error: 'Server misconfiguration: JWT_SECRET required in production' });
    }

    const userResult = await pool.query(
      `SELECT id, email, full_name, password, password_hash FROM users WHERE email = $1`,
      [email.trim().toLowerCase()]
    );
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const user = userResult.rows[0];
    const ok = await checkPassword(password, user);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    let role = 'USER';
    try {
      const roleResult = await pool.query(
        `SELECT role FROM user_roles WHERE user_id = $1`,
        [String(user.id)]
      );
      if (roleResult.rows.length > 0) {
        const r = roleResult.rows[0].role;
        if (r === 'ADMIN' || r === 'AUDITOR') role = r;
      }
    } catch (e) {
      console.warn('user_roles table missing or error:', e.message);
    }
    if (role !== 'ADMIN' && role !== 'AUDITOR') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const token = jwt.sign(
      { sub: String(user.id), role, email: user.email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({
      access_token: token,
      token_type: 'Bearer',
      expires_in: 86400,
      user: {
        id: String(user.id),
        email: user.email,
        name: user.full_name || user.email,
        role
      }
    });
  } catch (error) {
    console.error('❌ Admin login error:', error);
    res.status(500).json({
      error: 'Login failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ✅ Admin JWT middleware (สำหรับ /api/admin/*)
const JWT_SECRET_ADMIN = process.env.JWT_SECRET; // ต้องตั้ง JWT_SECRET ใน .env
function adminAuthMiddleware(req, res, next) {
  if (!JWT_SECRET_ADMIN) {
    return res.status(500).json({ error: 'Server misconfiguration: JWT_SECRET required in production' });
  }
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization required' });
  }
  const token = auth.replace('Bearer ', '');
  try {
    const payload = jwt.verify(token, JWT_SECRET_ADMIN);
    if (payload.role !== 'ADMIN' && payload.role !== 'AUDITOR') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.adminUser = { id: payload.sub, role: payload.role, email: payload.email };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ✅ GET /api/admin/gateway-status — realtime gateway/services for Admin API Gateway view (Render, Upstash, etc.)
app.get('/api/admin/gateway-status', adminAuthMiddleware, async (req, res) => {
  try {
    let postgresql = 'unhealthy';
    let redis = 'unhealthy';
    let cloudinary = 'unhealthy';
    try {
      const dbCheck = await pool.query('SELECT 1 as status');
      postgresql = dbCheck.rows[0]?.status === 1 ? 'healthy' : 'unhealthy';
    } catch (e) {
      postgresql = 'unhealthy';
    }
    try {
      if (redisClient) {
        await redisClient.ping();
        redis = 'healthy';
      } else {
        redis = 'not_configured';
      }
    } catch (e) {
      redis = 'unhealthy';
    }
    try {
      await cloudinary.api.ping();
      cloudinary = 'healthy';
    } catch (e) {
      cloudinary = 'unhealthy';
    }

    const mem = process.memoryUsage();
    const envHints = {
      node_env: process.env.NODE_ENV || 'development',
      port: process.env.PORT || 3001,
      redis_configured: !!process.env.REDIS_URL,
      redis_provider: process.env.REDIS_URL && (process.env.REDIS_URL.includes('upstash') ? 'Upstash' : process.env.REDIS_URL.includes('render') ? 'Render Redis' : 'Redis'),
      cloudinary_configured: !!process.env.CLOUDINARY_CLOUD_NAME,
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME ? process.env.CLOUDINARY_CLOUD_NAME : null,
      render: !!(process.env.RENDER || process.env.RENDER_SERVICE_NAME),
      render_service: process.env.RENDER_SERVICE_NAME || null,
    };

    // สถานะ endpoint: ขึ้นกับ DB = postgresql, ขึ้นกับ Cloudinary = cloudinary, ไม่ขึ้น = operational
    const dbOk = postgresql === 'healthy';
    const cloudOk = cloudinary === 'healthy';
    const endpointList = [
      { name: 'Health', path: '/api/health', method: 'GET', status: 'operational' },
      { name: 'Health (Detailed)', path: '/api/health/detailed', method: 'GET', status: dbOk && cloudOk ? 'operational' : 'degraded' },
      { name: 'Jobs', path: '/api/jobs', method: 'GET', status: dbOk ? 'operational' : 'degraded' },
      { name: 'Jobs (รายการ)', path: '/api/jobs/all', method: 'GET', status: dbOk ? 'operational' : 'degraded' },
      { name: 'Jobs (แนะนำ)', path: '/api/jobs/recommended', method: 'GET', status: dbOk ? 'operational' : 'degraded' },
      { name: 'Jobs (สร้าง)', path: '/api/jobs', method: 'POST', status: dbOk ? 'operational' : 'degraded' },
      { name: 'Jobs (รับงาน)', path: '/api/jobs/:id/accept', method: 'POST', status: dbOk ? 'operational' : 'degraded' },
      { name: 'Users', path: '/api/users', method: 'GET', status: dbOk ? 'operational' : 'degraded' },
      { name: 'User Profile', path: '/api/users/profile/:id', method: 'GET', status: dbOk ? 'operational' : 'degraded' },
      { name: 'User Jobs', path: '/api/users/jobs/:userId', method: 'GET', status: dbOk ? 'operational' : 'degraded' },
      { name: 'User Transactions', path: '/api/users/transactions/:userId', method: 'GET', status: dbOk ? 'operational' : 'degraded' },
      { name: 'Payments (ชำระ)', path: '/api/payments/process', method: 'POST', status: dbOk ? 'operational' : 'degraded' },
      { name: 'Payments (สถานะ)', path: '/api/payments/status/:jobId', method: 'GET', status: dbOk ? 'operational' : 'degraded' },
      { name: 'Payments (ปล่อย)', path: '/api/payments/release', method: 'POST', status: dbOk ? 'operational' : 'degraded' },
      { name: 'Wallet', path: '/api/wallet/:userId/summary', method: 'GET', status: dbOk ? 'operational' : 'degraded' },
      { name: 'KYC (ส่ง)', path: '/api/kyc/submit', method: 'POST', status: dbOk && cloudOk ? 'operational' : 'degraded' },
      { name: 'KYC (สถานะ)', path: '/api/kyc/status/:userId', method: 'GET', status: dbOk ? 'operational' : 'degraded' },
      { name: 'Reports (รายได้)', path: '/api/reports/earnings', method: 'GET', status: dbOk ? 'operational' : 'degraded' },
      { name: 'Reports (สถิติงาน)', path: '/api/reports/job-stats', method: 'GET', status: dbOk ? 'operational' : 'degraded' },
      { name: 'Reports (การเงิน)', path: '/api/reports/financial-summary', method: 'GET', status: dbOk ? 'operational' : 'degraded' },
      { name: 'Upload', path: '/api/upload', method: 'POST', status: cloudOk ? 'operational' : 'degraded' },
      { name: 'Upload (รูป)', path: '/api/upload/image', method: 'POST', status: cloudOk ? 'operational' : 'degraded' },
      { name: 'Auth (Login)', path: '/api/auth/login', method: 'POST', status: dbOk ? 'operational' : 'degraded' },
      { name: 'Auth (Admin)', path: '/api/auth/admin-login', method: 'POST', status: dbOk ? 'operational' : 'degraded' },
      { name: 'Notifications (ล่าสุด)', path: '/api/notifications/latest', method: 'GET', status: 'operational' },
      { name: 'Admin Users', path: '/api/admin/users', method: 'GET', status: dbOk ? 'operational' : 'degraded' },
      { name: 'Admin Financial', path: '/api/admin/financial/audit', method: 'GET', status: dbOk ? 'operational' : 'degraded' },
      { name: 'Admin Notifications', path: '/api/admin/notifications', method: 'GET', status: 'operational' },
      { name: 'Audit Logs', path: '/api/audit/logs', method: 'GET', status: dbOk ? 'operational' : 'degraded' },
      { name: 'Providers', path: '/api/providers', method: 'GET', status: dbOk ? 'operational' : 'degraded' },
    ];

    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      services: { postgresql, redis, cloudinary },
      uptime_seconds: Math.floor(process.uptime()),
      memory: {
        heapUsed_mb: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotal_mb: Math.round(mem.heapTotal / 1024 / 1024),
        rss_mb: Math.round(mem.rss / 1024 / 1024),
      },
      env: envHints,
      endpoints: endpointList,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// ✅ GET /api/admin/users (list users — no password/token/firebase_uid)
app.get('/api/admin/users', adminAuthMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const offset = parseInt(req.query.offset, 10) || 0;
    const search = (req.query.search || '').trim();
    const roleFilter = (req.query.role || '').trim().toUpperCase();
    const statusFilter = (req.query.status || '').trim().toLowerCase();
    const kycFilter = (req.query.kyc_status || '').trim().toLowerCase();
    const vipFilter = (req.query.vip || '').trim().toLowerCase();

    const conditions = [];
    const params = [];
    let idx = 1;
    if (search) {
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
      conditions.push(`(email ILIKE $${idx} OR full_name ILIKE $${idx + 1} OR phone ILIKE $${idx + 2} OR id::text ILIKE $${idx + 3})`);
      idx += 4;
    }
    if (roleFilter && ['USER', 'ADMIN', 'AUDITOR', 'PROVIDER', 'user', 'provider'].includes(roleFilter)) {
      params.push(roleFilter);
      conditions.push(`(role = $${idx} OR (role IS NULL AND $${idx} = 'USER'))`);
      idx += 1;
    }
    if (statusFilter && ['active', 'suspended', 'banned'].includes(statusFilter)) {
      params.push(statusFilter);
      conditions.push(`(COALESCE(account_status, 'active') = $${idx})`);
      idx += 1;
    }
    if (kycFilter && ['not_submitted', 'pending', 'approved', 'rejected'].includes(kycFilter)) {
      if (kycFilter === 'not_submitted') {
        conditions.push(`(kyc_level IS NULL OR kyc_level = '')`);
      } else {
        params.push(kycFilter);
        conditions.push(`(kyc_level = $${idx})`);
        idx += 1;
      }
    }
    if (vipFilter === '1' || vipFilter === 'true' || vipFilter === 'yes') {
      conditions.push('(is_vip = TRUE)');
    }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM users ${where}`,
      params
    );
    const total = countResult.rows[0]?.total ?? 0;

    params.push(limit, offset);
    const limitOffset = `LIMIT $${idx} OFFSET $${idx + 1}`;
    const order = 'ORDER BY created_at DESC NULLS LAST';
    const result = await pool.query(
      `SELECT id, email, phone, full_name, name, kyc_level, role, created_at, last_login, account_status, is_vip
       FROM users ${where} ${order} ${limitOffset}`,
      params
    );

    const rows = result.rows.map((r) => ({
      id: String(r.id),
      email: r.email || '',
      phone: r.phone || undefined,
      full_name: r.full_name || r.name || undefined,
      kyc_status: mapKycLevelToStatus(r.kyc_level),
      account_status: r.account_status || 'active',
      created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
      last_login_at: r.last_login ? new Date(r.last_login).toISOString() : undefined,
      role: r.role || 'USER',
      is_vip: !!r.is_vip
    }));

    res.json({ users: rows, pagination: { limit, offset, total } });
  } catch (error) {
    console.error('GET /api/admin/users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

function mapKycLevelToStatus(kycLevel) {
  if (!kycLevel || kycLevel === '') return 'not_submitted';
  if (['pending', 'pending_review'].includes(String(kycLevel).toLowerCase())) return 'pending';
  if (['rejected', 'reject'].includes(String(kycLevel).toLowerCase())) return 'rejected';
  return 'approved';
}

// ✅ GET /api/admin/users/:id (detail — no password, no firebase_uid; รวม provider_status, banned_until, is_vip)
app.get('/api/admin/users/:id', adminAuthMiddleware, async (req, res) => {
  try {
    const userId = req.params.id;
    const u = await pool.query(
      `SELECT id, email, phone, full_name, name, kyc_level, kyc_rejection_reason, role, created_at, last_login, account_status, wallet_balance, avatar_url,
        provider_status, provider_verified_at, provider_test_attempts, provider_test_next_retry_at,
        banned_until, ban_reason, is_vip
       FROM users WHERE id = $1 OR id::text = $1`,
      [userId]
    );
    if (u.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const r = u.rows[0];
    let appRole = await pool.query(`SELECT role FROM user_roles WHERE user_id = $1`, [String(r.id)]);
    const backendRole = appRole.rows[0]?.role || null;
    const user = {
      id: String(r.id),
      email: r.email || '',
      phone: r.phone || undefined,
      full_name: r.full_name || r.name || undefined,
      kyc_status: mapKycLevelToStatus(r.kyc_level),
      kyc_level: r.kyc_level || undefined,
      kyc_rejection_reason: r.kyc_rejection_reason || undefined,
      account_status: r.account_status || 'active',
      role: r.role || 'USER',
      backend_role: backendRole,
      created_at: r.created_at ? new Date(r.created_at).toISOString() : undefined,
      last_login_at: r.last_login ? new Date(r.last_login).toISOString() : undefined,
      wallet_balance: parseFloat(r.wallet_balance) || 0,
      currency: 'THB',
      avatar_url: r.avatar_url,
      provider_status: r.provider_status || 'UNVERIFIED',
      provider_verified_at: r.provider_verified_at ? new Date(r.provider_verified_at).toISOString() : null,
      provider_test_attempts: r.provider_test_attempts ?? 0,
      provider_test_next_retry_at: r.provider_test_next_retry_at ? new Date(r.provider_test_next_retry_at).toISOString() : null,
      banned_until: r.banned_until ? new Date(r.banned_until).toISOString() : null,
      ban_reason: r.ban_reason || null,
      is_vip: !!r.is_vip
    };
    res.json({ user });
  } catch (error) {
    console.error('GET /api/admin/users/:id error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// ✅ PATCH /api/admin/users/:id/role (ADMIN only; audit)
app.patch('/api/admin/users/:id/role', adminAuthMiddleware, async (req, res) => {
  if (req.adminUser.role !== 'ADMIN') return res.status(403).json({ error: 'ADMIN only' });
  try {
    const userId = req.params.id;
    const { role } = req.body;
    if (!['USER', 'ADMIN', 'AUDITOR'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    await pool.query(
      `INSERT INTO user_roles (user_id, role, created_at, updated_at) VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE SET role = $2, updated_at = NOW()`,
      [userId, role]
    );
    try {
      await pool.query(
        `INSERT INTO financial_audit_log (actor_type, actor_id, action, entity_type, entity_id, reason, state_after) VALUES ('user', $1, 'role_change', 'user_roles', $2, $3, $4)`,
        [req.adminUser.id, userId, req.body.reason || 'Admin role update', JSON.stringify({ role })]
      );
    } catch (_) { /* table may not exist */ }
    auditService.log(req.adminUser.id, 'role_change', { entityName: 'user_roles', entityId: userId, new: { role } }, { actorRole: req.adminUser.role, ipAddress: req.ip });
    res.json({ success: true, user_id: userId, role });
  } catch (error) {
    console.error('PATCH /api/admin/users/:id/role error:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// ✅ Account Control (ADMIN only; require reason for sensitive; audit)
function adminAccountAction(action, req, res, next) {
  if (req.adminUser.role !== 'ADMIN') return res.status(403).json({ error: 'ADMIN only' });
  next();
}
app.post('/api/admin/users/:id/suspend', adminAuthMiddleware, adminAccountAction, async (req, res) => {
  try {
    const userId = req.params.id;
    const reason = req.body.reason || 'Suspended by admin';
    await pool.query(`UPDATE users SET account_status = 'suspended' WHERE id = $1 OR id::text = $1`, [userId]);
    try {
      await pool.query(
        `INSERT INTO financial_audit_log (actor_type, actor_id, action, entity_type, entity_id, reason, state_after) VALUES ('user', $1, 'user_suspend', 'users', $2, $3, '{"account_status":"suspended"}')`,
        [req.adminUser.id, userId, reason]
      );
    } catch (_) { }
    auditService.log(req.adminUser.id, 'user_suspend', { entityName: 'users', entityId: userId, new: { account_status: 'suspended' } }, { actorRole: req.adminUser.role, ipAddress: req.ip });
    res.json({ success: true, user_id: userId, account_status: 'suspended' });
  } catch (e) {
    console.error('suspend error:', e);
    res.status(500).json({ error: 'Failed to suspend user' });
  }
});
app.post('/api/admin/users/:id/ban', adminAuthMiddleware, adminAccountAction, async (req, res) => {
  try {
    const userId = req.params.id;
    const reason = req.body.reason || 'Banned by admin';
    const banDays = Math.max(0, parseInt(req.body.ban_days, 10));
    const bannedUntil = banDays > 0 ? new Date(Date.now() + banDays * 24 * 60 * 60 * 1000) : null;
    await pool.query(
      `UPDATE users SET account_status = 'banned', banned_until = $2, ban_reason = $3
       WHERE id = $1 OR id::text = $1`,
      [userId, bannedUntil, reason]
    );
    try {
      await pool.query(
        `INSERT INTO financial_audit_log (actor_type, actor_id, action, entity_type, entity_id, reason, state_after) VALUES ('user', $1, 'user_ban', 'users', $2, $3, $4)`,
        [req.adminUser.id, userId, reason, JSON.stringify({ account_status: 'banned', banned_until: bannedUntil?.toISOString(), ban_reason: reason })]
      );
    } catch (_) { }
    auditService.log(req.adminUser.id, 'user_ban', { entityName: 'users', entityId: userId, new: { account_status: 'banned', ban_days: banDays || 'permanent', reason } }, { actorRole: req.adminUser.role, ipAddress: req.ip });
    res.json({ success: true, user_id: userId, account_status: 'banned', banned_until: bannedUntil?.toISOString() || null });
  } catch (e) {
    console.error('ban error:', e);
    res.status(500).json({ error: 'Failed to ban user' });
  }
});
app.post('/api/admin/users/:id/reactivate', adminAuthMiddleware, adminAccountAction, async (req, res) => {
  try {
    const userId = req.params.id;
    await pool.query(`UPDATE users SET account_status = 'active', banned_until = NULL, ban_reason = NULL WHERE id = $1 OR id::text = $1`, [userId]);
    try {
      await pool.query(
        `INSERT INTO financial_audit_log (actor_type, actor_id, action, entity_type, entity_id, reason, state_after) VALUES ('user', $1, 'user_reactivate', 'users', $2, $3, '{"account_status":"active"}')`,
        [req.adminUser.id, userId, req.body.reason || 'Reactivated by admin']
      );
    } catch (_) { }
    auditService.log(req.adminUser.id, 'user_reactivate', { entityName: 'users', entityId: userId, new: { account_status: 'active' } }, { actorRole: req.adminUser.role, ipAddress: req.ip });
    res.json({ success: true, user_id: userId, account_status: 'active' });
  } catch (e) {
    console.error('reactivate error:', e);
    res.status(500).json({ error: 'Failed to reactivate user' });
  }
});

// ✅ PATCH /api/admin/users/:id/app-role — เปลี่ยนสถานะผู้ใช้เป็น user หรือ provider (ผู้รับงาน)
app.patch('/api/admin/users/:id/app-role', adminAuthMiddleware, adminAccountAction, async (req, res) => {
  try {
    const userId = req.params.id;
    const role = (req.body.role || '').toLowerCase();
    if (!['user', 'provider'].includes(role)) return res.status(400).json({ error: 'Invalid app role; use user or provider' });
    await pool.query(
      `UPDATE users SET role = $2, updated_at = NOW() WHERE id = $1 OR id::text = $1`,
      [userId, role]
    );
    auditService.log(req.adminUser.id, 'app_role_change', { entityName: 'users', entityId: userId, new: { role } }, { actorRole: req.adminUser.role, ipAddress: req.ip });
    res.json({ success: true, user_id: userId, role });
  } catch (e) {
    console.error('app-role error:', e);
    res.status(500).json({ error: 'Failed to update app role' });
  }
});

// ✅ POST /api/admin/users/:id/approve-provider — อนุญาติให้เป็นผู้รับงาน (แก้บั๊กที่ทำแบบทดสอบผ่านแต่สถานะไม่ขึ้น)
app.post('/api/admin/users/:id/approve-provider', adminAuthMiddleware, adminAccountAction, async (req, res) => {
  try {
    const userId = req.params.id;
    await pool.query(
      `UPDATE users SET provider_status = 'VERIFIED_PROVIDER', provider_verified_at = NOW(), provider_test_passed_at = NOW(),
       provider_test_next_retry_at = NULL, updated_at = NOW()
       WHERE id = $1 OR id::text = $1`,
      [userId]
    );
    auditService.log(req.adminUser.id, 'approve_provider', { entityName: 'users', entityId: userId, new: { provider_status: 'VERIFIED_PROVIDER' } }, { actorRole: req.adminUser.role, ipAddress: req.ip });
    res.json({ success: true, user_id: userId, provider_status: 'VERIFIED_PROVIDER' });
  } catch (e) {
    console.error('approve-provider error:', e);
    res.status(500).json({ error: 'Failed to approve provider' });
  }
});

// ✅ PATCH /api/admin/users/:id/vip — ตั้ง/ยกเลิก VIP
app.patch('/api/admin/users/:id/vip', adminAuthMiddleware, adminAccountAction, async (req, res) => {
  try {
    const userId = req.params.id;
    const isVip = !!req.body.is_vip;
    await pool.query(
      `UPDATE users SET is_vip = $2, updated_at = NOW() WHERE id = $1 OR id::text = $1`,
      [userId, isVip]
    );
    auditService.log(req.adminUser.id, 'user_vip', { entityName: 'users', entityId: userId, new: { is_vip: isVip } }, { actorRole: req.adminUser.role, ipAddress: req.ip });
    res.json({ success: true, user_id: userId, is_vip: isVip });
  } catch (e) {
    console.error('vip error:', e);
    res.status(500).json({ error: 'Failed to update VIP status' });
  }
});

app.post('/api/admin/users/:id/force-logout', adminAuthMiddleware, adminAccountAction, async (req, res) => {
  try {
    const userId = req.params.id;
    const reason = req.body.reason || 'Force logout by admin';
    try {
      await pool.query(
        `INSERT INTO financial_audit_log (actor_type, actor_id, action, entity_type, entity_id, reason) VALUES ('user', $1, 'force_logout', 'users', $2, $3)`,
        [req.adminUser.id, userId, reason]
      );
    } catch (_) { }
    auditService.log(req.adminUser.id, 'force_logout', { entityName: 'users', entityId: userId }, { actorRole: req.adminUser.role, ipAddress: req.ip });
    res.json({ success: true, user_id: userId, message: 'Audit logged; invalidate tokens in your auth layer if applicable' });
  } catch (e) {
    console.error('force-logout error:', e);
    res.status(500).json({ error: 'Failed to record force logout' });
  }
});

// ✅ GET /api/admin/users/:id/ledger (last N entries + total credit/debit, read-only)
app.get('/api/admin/users/:id/ledger', adminAuthMiddleware, async (req, res) => {
  try {
    const userId = req.params.id;
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const [entriesResult, totalsResult] = await Promise.all([
      pool.query(
        `SELECT id, event_type, direction, amount, currency, description, created_at, balance_after FROM ledger_entries WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
        [userId, limit]
      ).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT
          COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE 0 END), 0) AS total_credit,
          COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount ELSE 0 END), 0) AS total_debit
         FROM ledger_entries WHERE user_id = $1`,
        [userId]
      ).catch(() => ({ rows: [{ total_credit: 0, total_debit: 0 }] }))
    ]);
    const entries = (entriesResult.rows || []).map((r) => ({
      id: r.id,
      event_type: r.event_type,
      direction: r.direction,
      amount: parseFloat(r.amount) || 0,
      currency: r.currency || 'THB',
      description: r.description,
      created_at: r.created_at ? new Date(r.created_at).toISOString() : undefined,
      balance_after: r.balance_after != null ? parseFloat(r.balance_after) : undefined
    }));
    const tot = totalsResult.rows && totalsResult.rows[0] ? totalsResult.rows[0] : { total_credit: 0, total_debit: 0 };
    res.json({
      entries,
      total_credit: parseFloat(tot.total_credit) || 0,
      total_debit: parseFloat(tot.total_debit) || 0
    });
  } catch (error) {
    console.error('GET /api/admin/users/:id/ledger error:', error);
    res.status(500).json({ error: 'Failed to fetch ledger' });
  }
});

// ✅ GET /api/audit/logs — audit_log (014); from_date, to_date, entity_type, action, actor_id, limit, offset, total
app.get('/api/audit/logs', adminAuthMiddleware, async (req, res) => {
  try {
    const fromDate = (req.query.from_date || '').trim() || null;
    const toDate = (req.query.to_date || '').trim() || null;
    const entityType = (req.query.entity_type || '').trim() || null;
    const entityId = (req.query.entity_id || '').trim() || null;
    const actionFilter = (req.query.action || '').trim() || null;
    const actorIdFilter = (req.query.actor_id || '').trim() || null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const conditions = [];
    const params = [];
    let idx = 1;
    if (fromDate) { params.push(fromDate); conditions.push(`created_at >= $${idx}::date`); idx++; }
    if (toDate) { params.push(toDate + 'T23:59:59.999Z'); conditions.push(`created_at <= $${idx}::timestamptz`); idx++; }
    if (entityType) { params.push(entityType); conditions.push(`entity_name = $${idx}`); idx++; }
    if (entityId) { params.push(entityId); conditions.push(`entity_id = $${idx}`); idx++; }
    if (actionFilter) { params.push(actionFilter); conditions.push(`action = $${idx}`); idx++; }
    if (actorIdFilter) { params.push(actorIdFilter); conditions.push(`actor_id = $${idx}`); idx++; }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const countParams = [...params];
    const limitOffsetParams = [...params, limit, offset];
    const limitIdx = countParams.length + 1;
    const offsetIdx = countParams.length + 2;
    let total = 0;
    let result = await pool.query(
      `SELECT COUNT(*)::int AS total FROM audit_log ${where}`,
      countParams
    ).catch(() => null);
    if (result && result.rows && result.rows[0]) total = result.rows[0].total || 0;
    result = await pool.query(
      `SELECT id, actor_id, actor_role, action, entity_name, entity_id, changes, status, ip_address, created_at
       FROM audit_log ${where} ORDER BY created_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      limitOffsetParams
    ).catch(() => null);
    if (result && result.rows && result.rows.length >= 0) {
      const logs = (result.rows || []).map((r) => ({
        id: r.id,
        actor_type: r.actor_role,
        actor_id: r.actor_id,
        actor_role: r.actor_role,
        action: r.action,
        entity_type: r.entity_name,
        entity_id: r.entity_id,
        entity_name: r.entity_name,
        state_before: (r.changes && r.changes.old) || null,
        state_after: (r.changes && r.changes.new) || null,
        changes: r.changes,
        status: r.status,
        ip_address: r.ip_address,
        reason: null,
        created_at: r.created_at ? new Date(r.created_at).toISOString() : undefined
      }));
      return res.json({ logs, count: logs.length, total });
    }
    const legacyWhere = [];
    const legacyParams = [];
    let li = 1;
    if (fromDate) { legacyParams.push(fromDate); legacyWhere.push(`created_at >= $${li}::date`); li++; }
    if (toDate) { legacyParams.push(toDate + 'T23:59:59.999Z'); legacyWhere.push(`created_at <= $${li}::timestamptz`); li++; }
    if (entityType) { legacyParams.push(entityType); legacyWhere.push(`entity_type = $${li}`); li++; }
    if (entityId) { legacyParams.push(entityId); legacyWhere.push(`entity_id = $${li}`); li++; }
    if (actionFilter) { legacyParams.push(actionFilter); legacyWhere.push(`action = $${li}`); li++; }
    if (actorIdFilter) { legacyParams.push(actorIdFilter); legacyWhere.push(`actor_id = $${li}`); li++; }
    const legacyWhereClause = legacyWhere.length ? 'WHERE ' + legacyWhere.join(' AND ') : '';
    legacyParams.push(limit, offset);
    const legacyCount = await pool.query(
      `SELECT COUNT(*)::int AS total FROM financial_audit_log ${legacyWhereClause}`,
      legacyParams.slice(0, -2)
    ).catch(() => ({ rows: [{ total: 0 }] }));
    total = (legacyCount.rows && legacyCount.rows[0] && legacyCount.rows[0].total) || 0;
    const legacyResult = await pool.query(
      `SELECT id, actor_type, actor_id, action, entity_type, entity_id, state_before, state_after, reason, created_at FROM financial_audit_log ${legacyWhereClause} ORDER BY created_at DESC LIMIT $${li} OFFSET $${li + 1}`,
      legacyParams
    ).catch(() => ({ rows: [] }));
    const logs = (legacyResult.rows || []).map((r) => ({
      id: r.id,
      actor_type: r.actor_type,
      actor_id: r.actor_id,
      actor_role: r.actor_type === 'user' ? 'User' : r.actor_type,
      action: r.action,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      entity_name: r.entity_type,
      state_before: r.state_before,
      state_after: r.state_after,
      changes: { old: r.state_before || {}, new: r.state_after || {} },
      status: 'Success',
      ip_address: null,
      reason: r.reason,
      created_at: r.created_at ? new Date(r.created_at).toISOString() : undefined
    }));
    res.json({ logs, count: logs.length, total });
  } catch (error) {
    console.error('GET /api/audit/logs error:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// ✅ GET /api/admin/financial/audit (platform revenue + recent transactions)
// NOTE: Read-only endpoint for admin dashboard charts/tables.
app.get('/api/admin/financial/audit', adminAuthMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);

    const [balanceRes, txRes] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS platform_balance
         FROM transactions
         WHERE type = 'fee' AND status = 'completed'`
      ).catch(() => ({ rows: [{ platform_balance: 0 }] })),
      pool.query(
        `SELECT id, user_id, type, amount, status, description, created_at, metadata
         FROM transactions
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit]
      ).catch(() => ({ rows: [] })),
    ]);

    const platform_balance = parseFloat(balanceRes.rows?.[0]?.platform_balance) || 0;
    const transactions = (txRes.rows || []).map((r) => {
      const amount = parseFloat(r.amount) || 0;
      const rawStatus = String(r.status || '').toLowerCase();
      const status =
        rawStatus === 'waiting_admin' || rawStatus === 'flagged'
          ? 'FLAGGED'
          : rawStatus === 'completed'
            ? 'COMPLETED'
            : rawStatus === 'pending'
              ? 'PENDING'
              : 'FAILED';

      // Heuristic fraud scoring (no dedicated fraud_score column yet)
      const fraudScore =
        status === 'FLAGGED'
          ? 90
          : amount >= 200000
            ? 88
            : amount >= 100000
              ? 75
              : amount >= 50000
                ? 60
                : 10;

      return {
        id: String(r.id),
        userId: r.user_id ? String(r.user_id) : '',
        type: String(r.type || '').toUpperCase(),
        amount,
        status,
        fraudScore,
        timestamp: r.created_at ? new Date(r.created_at).toISOString() : undefined,
        note: r.description || undefined,
        metadata: r.metadata || undefined,
      };
    });

    res.json({
      currency: 'THB',
      platform_balance,
      transactions,
    });
  } catch (error) {
    console.error('GET /api/admin/financial/audit error:', error);
    res.status(500).json({ error: 'Failed to fetch financial audit data' });
  }
});

// ✅ GET /api/admin/financial/job-guarantees
app.get('/api/admin/financial/job-guarantees', adminAuthMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, job_id, job_title, amount, currency, status, employer_id, provider_id, created_at, released_at, due_release_at, note
       FROM job_guarantees ORDER BY created_at DESC LIMIT 500`
    ).catch(() => ({ rows: [] }));
    const entries = (result.rows || []).map((r) => ({
      id: r.id,
      job_id: r.job_id,
      job_title: r.job_title,
      amount: parseFloat(r.amount) || 0,
      currency: r.currency || 'THB',
      status: r.status || 'active',
      employer_id: r.employer_id,
      provider_id: r.provider_id,
      created_at: r.created_at ? new Date(r.created_at).toISOString() : undefined,
      released_at: r.released_at ? new Date(r.released_at).toISOString() : undefined,
      due_release_at: r.due_release_at ? new Date(r.due_release_at).toISOString() : undefined,
      note: r.note,
    }));
    const totalHeld = entries.filter((e) => e.status === 'active' || e.status === 'pending_release').reduce((s, e) => s + e.amount, 0);
    const totalReleased = entries.filter((e) => e.status === 'released').reduce((s, e) => s + e.amount, 0);
    const totalClaimed = entries.filter((e) => e.status === 'claimed').reduce((s, e) => s + e.amount, 0);
    const liabilityToRelease = entries.filter((e) => e.status === 'pending_release').reduce((s, e) => s + e.amount, 0);
    res.json({
      entries,
      total_held: totalHeld,
      total_released: totalReleased,
      total_claimed: totalClaimed,
      liability_to_release: liabilityToRelease,
    });
  } catch (error) {
    console.error('GET /api/admin/financial/job-guarantees error:', error);
    res.status(500).json({ error: 'Failed to fetch job guarantees' });
  }
});

// ✅ GET /api/admin/financial/commission — ดึงจาก payment_ledger_audit (ขา commission) แยกจากประกัน
app.get('/api/admin/financial/commission', adminAuthMiddleware, async (req, res) => {
  try {
    const byCategory = await pool.query(
      `SELECT COALESCE(j.category, 'อื่นๆ') AS category,
              COUNT(DISTINCT CASE WHEN L.event_type = 'escrow_held' AND L.metadata->>'leg' = 'commission' THEN L.job_id END) AS job_count,
              COALESCE(SUM(CASE WHEN L.event_type = 'escrow_held' AND L.metadata->>'leg' = 'commission' THEN L.amount WHEN L.event_type = 'escrow_refunded' AND L.metadata->>'leg' = 'commission_reversed' THEN -L.amount ELSE 0 END), 0) AS total_commission
       FROM payment_ledger_audit L
       LEFT JOIN jobs j ON j.id = L.job_id
       WHERE (L.event_type = 'escrow_held' AND L.metadata->>'leg' = 'commission')
          OR (L.event_type = 'escrow_refunded' AND L.metadata->>'leg' = 'commission_reversed')
       GROUP BY COALESCE(j.category, 'อื่นๆ')`
    ).catch(() => ({ rows: [] }));
    const trend = await pool.query(
      `SELECT DATE_TRUNC('week', L.created_at)::date AS week_start,
              COALESCE(SUM(CASE WHEN L.event_type = 'escrow_held' AND L.metadata->>'leg' = 'commission' THEN L.amount WHEN L.event_type = 'escrow_refunded' AND L.metadata->>'leg' = 'commission_reversed' THEN -L.amount ELSE 0 END), 0) AS amount
       FROM payment_ledger_audit L
       WHERE ((L.event_type = 'escrow_held' AND L.metadata->>'leg' = 'commission') OR (L.event_type = 'escrow_refunded' AND L.metadata->>'leg' = 'commission_reversed'))
         AND L.created_at >= NOW() - INTERVAL '12 weeks'
       GROUP BY DATE_TRUNC('week', L.created_at) ORDER BY week_start`
    ).catch(() => ({ rows: [] }));
    const byCategoryList = (byCategory.rows || []).map((r) => ({
      category: r.category,
      total_commission: parseFloat(r.total_commission) || 0,
      paid: parseFloat(r.total_commission) || 0,
      pending: 0,
      job_count: parseInt(r.job_count, 10) || 0,
    }));
    const total_commission = byCategoryList.reduce((s, c) => s + c.total_commission, 0);
    const total_paid = total_commission;
    const total_pending = 0;
    const trendList = (trend.rows || []).map((r) => ({
      period: `สัปดาห์ ${r.week_start}`,
      amount: parseFloat(r.amount) || 0,
    }));
    if (trendList.length === 0) trendList.push({ period: 'สัปดาห์ 1', amount: 0 });
    res.json({
      by_category: byCategoryList,
      trend: trendList,
      total_commission,
      total_paid,
      total_pending,
    });
  } catch (error) {
    console.error('GET /api/admin/financial/commission error:', error);
    res.status(500).json({ error: 'Failed to fetch commission data' });
  }
});

// ✅ GET /api/admin/financial/expenses
app.get('/api/admin/financial/expenses', adminAuthMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, category, label, amount, budget, cost_type, currency, updated_at
       FROM financial_expenses ORDER BY category`
    ).catch(() => ({ rows: [] }));
    const expenses = (result.rows || []).map((r) => ({
      id: r.id,
      category: r.category,
      label: r.label,
      amount: parseFloat(r.amount) || 0,
      budget: r.budget != null ? parseFloat(r.budget) : undefined,
      cost_type: r.cost_type || 'variable',
      currency: r.currency || 'THB',
      updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
    }));
    res.json({ expenses });
  } catch (error) {
    console.error('GET /api/admin/financial/expenses error:', error);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

// ============ BROADCAST NOTIFICATIONS (Admin ส่ง → Frontend Home แสดง) ============
const broadcastNotificationsStore = [];
const BROADCAST_STORE_MAX = 200;

app.post('/api/admin/notifications/broadcast', adminAuthMiddleware, (req, res) => {
  try {
    const { title, message, target } = req.body || {};
    if (!title || !message) {
      return res.status(400).json({ error: 'title and message required' });
    }
    const id = `bc-${Date.now()}`;
    const sentAt = new Date().toISOString();
    const item = { id, title: String(title), message: String(message), target: target || 'All', sentAt };
    broadcastNotificationsStore.unshift(item);
    if (broadcastNotificationsStore.length > BROADCAST_STORE_MAX) broadcastNotificationsStore.length = BROADCAST_STORE_MAX;
    res.status(201).json({ id, sentAt });
  } catch (e) {
    console.error('POST /api/admin/notifications/broadcast error:', e);
    res.status(500).json({ error: 'Failed to broadcast' });
  }
});

app.get('/api/admin/notifications', adminAuthMiddleware, (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const list = broadcastNotificationsStore.slice(0, limit);
    res.json({ notifications: list });
  } catch (e) {
    console.error('GET /api/admin/notifications error:', e);
    res.status(500).json({ error: 'Failed to fetch' });
  }
});

// ============ BANNERS (จาก Content Manager → แสดงที่ Home) + โค้ดส่วนลด ============
const bannersStore = [];
const userVouchersStore = [];
const BANNERS_MAX = 50;
const USER_VOUCHERS_MAX = 10000;

// GET /api/banners — public, สำหรับหน้า Home (แบนเนอร์ที่ active และอยู่ในช่วงวันแสดง)
app.get('/api/banners', (req, res) => {
  try {
    const now = new Date().toISOString().slice(0, 10);
    const list = bannersStore
      .filter((b) => b.isActive && (!b.startDate || b.startDate <= now) && (!b.endDate || b.endDate >= now))
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    res.json({ banners: list });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch banners' });
  }
});

// GET /api/admin/banners
app.get('/api/admin/banners', adminAuthMiddleware, (req, res) => {
  try {
    const list = [...bannersStore].sort((a, b) => (a.order || 0) - (b.order || 0));
    res.json({ banners: list });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch' });
  }
});

// POST /api/admin/banners
app.post('/api/admin/banners', adminAuthMiddleware, (req, res) => {
  try {
    const { title, imageUrl, actionUrl, order, startDate, endDate, isActive, promoCode, discountMaxBaht, discountDescription } = req.body || {};
    if (!title || !imageUrl) return res.status(400).json({ error: 'title and imageUrl required' });
    const id = `B${Date.now()}`;
    const banner = {
      id,
      title: String(title),
      imageUrl: String(imageUrl),
      actionUrl: actionUrl ? String(actionUrl) : '',
      order: parseInt(order, 10) || 0,
      startDate: startDate || null,
      endDate: endDate || null,
      isActive: isActive !== false,
      clicks: 0,
      promoCode: promoCode ? String(promoCode).trim().toUpperCase() : null,
      discountMaxBaht: discountMaxBaht != null ? Math.max(0, parseInt(discountMaxBaht, 10)) : null,
      discountDescription: discountDescription ? String(discountDescription) : null,
      createdAt: new Date().toISOString(),
    };
    bannersStore.push(banner);
    if (bannersStore.length > BANNERS_MAX) bannersStore.shift();
    res.status(201).json({ banner });
  } catch (e) {
    res.status(500).json({ error: 'Failed to create banner' });
  }
});

// PATCH /api/admin/banners/:id
app.patch('/api/admin/banners/:id', adminAuthMiddleware, (req, res) => {
  try {
    const banner = bannersStore.find((b) => b.id === req.params.id);
    if (!banner) return res.status(404).json({ error: 'Banner not found' });
    const { title, imageUrl, actionUrl, order, startDate, endDate, isActive, promoCode, discountMaxBaht, discountDescription } = req.body || {};
    if (title !== undefined) banner.title = String(title);
    if (imageUrl !== undefined) banner.imageUrl = String(imageUrl);
    if (actionUrl !== undefined) banner.actionUrl = String(actionUrl);
    if (order !== undefined) banner.order = parseInt(order, 10) || 0;
    if (startDate !== undefined) banner.startDate = startDate || null;
    if (endDate !== undefined) banner.endDate = endDate || null;
    if (isActive !== undefined) banner.isActive = isActive !== false;
    if (promoCode !== undefined) banner.promoCode = promoCode ? String(promoCode).trim().toUpperCase() : null;
    if (discountMaxBaht !== undefined) banner.discountMaxBaht = discountMaxBaht != null ? Math.max(0, parseInt(discountMaxBaht, 10)) : null;
    if (discountDescription !== undefined) banner.discountDescription = discountDescription ? String(discountDescription) : null;
    res.json({ banner });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update banner' });
  }
});

// DELETE /api/admin/banners/:id
app.delete('/api/admin/banners/:id', adminAuthMiddleware, (req, res) => {
  try {
    const idx = bannersStore.findIndex((b) => b.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Banner not found' });
    bannersStore.splice(idx, 1);
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete banner' });
  }
});

// POST /api/vouchers/claim — user กดรับโค้ดส่วนลดจากแบนเนอร์ (วงเงินจำกัด)
app.post('/api/vouchers/claim', (req, res) => {
  try {
    const { code, userId } = req.body || {};
    const uid = userId || req.headers['x-user-id'] || null;
    if (!code || !uid) return res.status(400).json({ error: 'code and userId required' });
    const banner = bannersStore.find(
      (b) => b.promoCode && b.promoCode === String(code).trim().toUpperCase() && b.isActive
    );
    if (!banner) return res.status(404).json({ error: 'โค้ดส่วนลดไม่ถูกต้องหรือหมดอายุ' });
    const now = new Date().toISOString().slice(0, 10);
    if (banner.startDate && banner.startDate > now) return res.status(400).json({ error: 'ยังไม่ถึงช่วงเวลาใช้โค้ด' });
    if (banner.endDate && banner.endDate < now) return res.status(400).json({ error: 'โค้ดส่วนลดหมดอายุแล้ว' });
    const maxBaht = banner.discountMaxBaht || 0;
    if (maxBaht <= 0) return res.status(400).json({ error: 'แคมเปญนี้ไม่มีวงเงินส่วนลด' });
    const existing = userVouchersStore.find((v) => v.userId === uid && v.promoCode === banner.promoCode);
    if (existing) return res.status(400).json({ error: 'คุณรับโค้ดนี้ไปแล้ว', voucher: existing });
    const id = `V${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const voucher = {
      id,
      userId: uid,
      bannerId: banner.id,
      promoCode: banner.promoCode,
      maxDiscountBaht: maxBaht,
      remainingBaht: maxBaht,
      claimedAt: new Date().toISOString(),
      expiresAt: banner.endDate ? `${banner.endDate}T23:59:59.000Z` : null,
    };
    userVouchersStore.push(voucher);
    if (userVouchersStore.length > USER_VOUCHERS_MAX) userVouchersStore.shift();
    res.status(201).json({ voucher, message: 'รับโค้ดส่วนลดสำเร็จ ใช้ได้เมื่อจ้างงาน (วงเงินจำกัด)' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to claim voucher' });
  }
});

// GET /api/vouchers/my — รายการโค้ดที่ user รับไว้ (ยังใช้ได้)
app.get('/api/vouchers/my', (req, res) => {
  try {
    const userId = req.query.userId || req.headers['x-user-id'];
    if (!userId) return res.json({ vouchers: [] });
    const now = new Date().toISOString();
    const list = userVouchersStore.filter(
      (v) => v.userId === userId && v.remainingBaht > 0 && (!v.expiresAt || v.expiresAt > now)
    );
    res.json({ vouchers: list });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch vouchers' });
  }
});

// POST /api/vouchers/use — ใช้โค้ดส่วนลดเมื่อชำระเงิน (หัก remainingBaht ตามวงเงินจำกัด)
app.post('/api/vouchers/use', (req, res) => {
  try {
    const { userId, voucherId, amount } = req.body || {};
    if (!userId || !voucherId || amount == null) return res.status(400).json({ error: 'userId, voucherId, amount required' });
    const voucher = userVouchersStore.find((v) => v.id === voucherId && v.userId === userId);
    if (!voucher) return res.status(404).json({ error: 'Voucher not found' });
    const useAmount = Math.min(Math.max(0, parseInt(amount, 10)), voucher.remainingBaht);
    voucher.remainingBaht -= useAmount;
    res.json({ used: useAmount, remainingBaht: voucher.remainingBaht });
  } catch (e) {
    res.status(500).json({ error: 'Failed to use voucher' });
  }
});

// ============ SUPPORT TICKETS (จาก Settings Help & Support + JobDetails Dispute) ============
const supportTicketsStore = [];
const supportMessagesStore = [];
const SUPPORT_TICKETS_MAX = 500;
const SUPPORT_MESSAGES_MAX = 5000;

function addSupportMessage(ticketId, sender, message) {
  const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const item = { id, ticketId, sender, message, timestamp: new Date().toISOString() };
  supportMessagesStore.push(item);
  if (supportMessagesStore.length > SUPPORT_MESSAGES_MAX) supportMessagesStore.splice(0, supportMessagesStore.length - SUPPORT_MESSAGES_MAX);
  return item;
}

// คำตอบอัตโนมัติจากคำหลัก (AI chatbot แบบ rule-based) — รวม 403, 429 สำหรับแก้จนสิ้นสุด
function getAutoReplyForUserMessage(text) {
  const t = (text || '').toLowerCase();
  // 429 Rate Limit — แก้จนสิ้นสุด
  if (/429|rate limit|ถูกล็อก|ลองใหม่อีก|too many request/.test(t)) {
    return `สวัสดีครับ สำหรับข้อความ **429 (Rate Limit)** ระบบจำกัดจำนวนครั้งในการลองเพื่อความปลอดภัย\n\n**วิธีแก้:**\n1. รอเวลาตามที่แอปแจ้ง (มัก 1–15 นาที) แล้วลองเข้าสู่ระบบใหม่\n2. ถ้าลืมรหัสผ่าน: กด "ลืมรหัสผ่าน" ที่หน้า Login เพื่อรีเซ็ตรหัส\n3. ถ้ายังติดอยู่: แจ้งเบอร์โทรหรืออีเมลที่ใช้สมัครมา เราจะตรวจสอบและปลดล็อกให้\n\nหากทำตามแล้วยังไม่ได้ผล แจ้งเพิ่มได้เลยครับ เราจะดำเนินการให้จนแก้ไขสิ้นสุด`;
  }
  // 403 Forbidden — แก้จนสิ้นสุด
  if (/403|forbidden|ไม่มีสิทธิ์|เข้าถึงไม่ได้|payment.*lock|เงินถูกล็อก/.test(t)) {
    return `สวัสดีครับ สำหรับข้อความ **403 (Forbidden / ไม่มีสิทธิ์)**\n\n**กรณีทั่วไป:**\n• ตรวจสอบว่าเข้าสู่ระบบแล้ว และบัญชีไม่ถูกระงับ\n• ลองออกจากระบบแล้วเข้าสู่ระบบใหม่\n\n**กรณี "เงินถูกล็อก" / ปล่อยเงินไม่ได้:**\n• ถ้ามีการยื่น Dispute งานนั้น ระบบจะล็อกเงินไว้จนกว่าแอดมินจะตัดสิน\n• รอทีมงานพิจารณา Dispute (24–48 ชม.) แล้วสถานะจะอัปเดต\n\nถ้าเป็นกรณีอื่น แจ้งรายละเอียด (เช่น หน้าที่เจอ งานที่เกี่ยวข้อง) เราจะตรวจและแก้ให้จนสิ้นสุดครับ`;
  }
  if (/โอน|เงินไม่เข้า|ยอดไม่ขึ้น|สลิป/.test(t)) return 'ขอบคุณที่แจ้งมา ระบบได้รับข้อมูลแล้ว กรุณาส่งสลิปโอนเงินหรือหลักฐานมาด้วยนะครับ ทีมงานจะตรวจสอบให้ภายใน 1-2 วันทำการ';
  if (/รหัสผ่าน|ลืมรหัส|reset password/.test(t)) return 'คุณสามารถกด "ลืมรหัสผ่าน" ที่หน้า Login เพื่อรีเซ็ตรหัสผ่านได้ครับ';
  if (/kyc|ยืนยันตัวตน|ไม่ผ่าน/.test(t)) return 'สำหรับปัญหา KYC กรุณาตรวจสอบว่าได้อัปโหลดรูปบัตรประชาชนครบและชัดเจน หากยังไม่ผ่าน ทีมงานจะติดต่อกลับภายใน 24 ชม. ครับ';
  if (/ถอนเงิน|withdraw/.test(t)) return 'การถอนเงินจะทำได้เมื่องานได้รับการอนุมัติและปล่อยเงินแล้ว คุณสามารถตรวจสอบสถานะได้ที่รายละเอียดงานครับ';
  if (/ dispute|พิพาท|ข้อพิพาท/.test(t)) return 'เราได้รับเรื่องข้อพิพาทของคุณแล้ว ทีมงานจะพิจารณาภายใน 24-48 ชั่วโมง และจะติดต่อกลับทางแอปหรืออีเมลครับ';
  if (/สวัสดี|hello|ครับ|ค่ะ/.test(t) && t.length < 30) return 'สวัสดีครับ มีอะไรให้ช่วยไหมครับ? แจ้งปัญหาหรือคำถามได้เลยนะครับ';
  return null;
}

// POST /api/support/tickets — สร้าง ticket จาก Help & Support (Settings / Mobile App)
app.post('/api/support/tickets', (req, res) => {
  try {
    const { userId, subject, message, category = 'General', email, full_name, phone } = req.body || {};
    if (!subject && !message) return res.status(400).json({ error: 'subject or message required' });
    const id = `TCK-${Date.now()}`;
    const now = new Date().toISOString();
    const ticket = {
      id,
      userId: userId || 'anonymous',
      email: email || null,
      full_name: full_name || null,
      phone: phone || null,
      subject: subject || (message ? message.slice(0, 80) : 'คำถามจาก Help & Support'),
      status: 'OPEN',
      priority: 'MEDIUM',
      category: ['Billing', 'Technical', 'Account', 'General'].includes(category) ? category : 'General',
      source: 'help_support',
      jobId: null,
      lastUpdated: now,
      createdAt: now,
    };
    supportTicketsStore.unshift(ticket);
    if (supportTicketsStore.length > SUPPORT_TICKETS_MAX) supportTicketsStore.pop();
    const userMsg = addSupportMessage(id, 'USER', message || subject);
    let botReply = getAutoReplyForUserMessage(message || subject);
    if (botReply) addSupportMessage(id, 'BOT', botReply);
    res.status(201).json({ ticket, message: userMsg });
  } catch (e) {
    console.error('POST /api/support/tickets error:', e);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});

// POST /api/support/tickets/from-dispute — สร้าง ticket จาก Dispute (JobDetails) + Lock escrow
app.post('/api/support/tickets/from-dispute', async (req, res) => {
  try {
    const { jobId, userId, reason } = req.body || {};
    if (!jobId || !reason) return res.status(400).json({ error: 'jobId and reason required' });

    // Circuit Breaker + Double Lock: อัปเดต job และบันทึกใน job_disputes
    try {
      await pool.query(
        `UPDATE jobs SET
          payment_details = jsonb_set(COALESCE(payment_details, '{}'::jsonb), '{dispute_status}', '"pending"'),
          updated_at = NOW()
         WHERE id = $1`,
        [String(jobId)]
      );
      await pool.query(
        `INSERT INTO job_disputes (job_id, status) VALUES ($1, 'open')`,
        [String(jobId)]
      );
    } catch (dbErr) {
      console.warn('Dispute: could not update job or job_disputes', dbErr.message);
    }

    const id = `TCK-D-${Date.now()}`;
    const now = new Date().toISOString();
    const ticket = {
      id,
      userId: userId || 'anonymous',
      email: null,
      subject: `Dispute: งาน #${jobId}`,
      status: 'OPEN',
      priority: 'HIGH',
      category: 'Billing',
      source: 'dispute',
      jobId: String(jobId),
      lastUpdated: now,
      createdAt: now,
    };
    supportTicketsStore.unshift(ticket);
    if (supportTicketsStore.length > SUPPORT_TICKETS_MAX) supportTicketsStore.pop();
    addSupportMessage(id, 'USER', reason);
    const botReply = 'เราได้รับเรื่องข้อพิพาทของคุณแล้ว ทีมงานจะพิจารณาภายใน 24-48 ชั่วโมง และจะติดต่อกลับทางแอปหรืออีเมลครับ';
    addSupportMessage(id, 'BOT', botReply);
    res.status(201).json({ ticket });
  } catch (e) {
    console.error('POST /api/support/tickets/from-dispute error:', e);
    res.status(500).json({ error: 'Failed to create dispute ticket' });
  }
});

// GET /api/support/tickets — รายการ ticket ของ user (query: userId)
app.get('/api/support/tickets', (req, res) => {
  try {
    const userId = req.query.userId;
    let list = supportTicketsStore;
    if (userId) list = list.filter((t) => t.userId === userId);
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    res.json({ tickets: list.slice(0, limit) });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

// GET /api/support/tickets/:id/messages
app.get('/api/support/tickets/:id/messages', (req, res) => {
  try {
    const list = supportMessagesStore.filter((m) => m.ticketId === req.params.id);
    list.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    res.json({ messages: list });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// POST /api/support/tickets/:id/messages — user ส่งข้อความเพิ่ม
app.post('/api/support/tickets/:id/messages', (req, res) => {
  try {
    const ticket = supportTicketsStore.find((t) => t.id === req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    const { message } = req.body || {};
    if (!message) return res.status(400).json({ error: 'message required' });
    ticket.lastUpdated = new Date().toISOString();
    const userMsg = addSupportMessage(ticket.id, 'USER', message);
    const botReply = getAutoReplyForUserMessage(message);
    if (botReply) addSupportMessage(ticket.id, 'BOT', botReply);
    res.status(201).json({ message: userMsg });
  } catch (e) {
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// GET /api/admin/support/tickets
app.get('/api/admin/support/tickets', adminAuthMiddleware, (req, res) => {
  try {
    const status = req.query.status;
    let list = supportTicketsStore;
    if (status === 'OPEN') list = list.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS');
    else if (status === 'RESOLVED') list = list.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED');
    else if (status) list = list.filter((t) => t.status === status);
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);
    res.json({ tickets: list.slice(0, limit) });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

// GET /api/admin/support/tickets/:id/messages
app.get('/api/admin/support/tickets/:id/messages', adminAuthMiddleware, (req, res) => {
  try {
    const list = supportMessagesStore.filter((m) => m.ticketId === req.params.id);
    list.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    res.json({ messages: list });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// POST /api/admin/support/tickets/:id/messages — admin/bot ตอบ
app.post('/api/admin/support/tickets/:id/messages', adminAuthMiddleware, (req, res) => {
  try {
    const ticket = supportTicketsStore.find((t) => t.id === req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    const { message, asBot } = req.body || {};
    if (!message) return res.status(400).json({ error: 'message required' });
    ticket.lastUpdated = new Date().toISOString();
    const sender = asBot ? 'BOT' : 'ADMIN';
    const msg = addSupportMessage(ticket.id, sender, message);
    res.status(201).json({ message: msg });
  } catch (e) {
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// PATCH /api/admin/support/tickets/:id — อัปเดตสถานะ (ถ้าเป็น dispute + RESOLVED ให้ปลดล็อก job_disputes)
app.patch('/api/admin/support/tickets/:id', adminAuthMiddleware, (req, res) => {
  try {
    const ticket = supportTicketsStore.find((t) => t.id === req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    const { status } = req.body || {};
    if (status && ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(status)) {
      ticket.status = status;
      ticket.lastUpdated = new Date().toISOString();
      // Admin Bypass: เมื่อปิดตั๋ว Dispute ให้อัปเดต job_disputes + job เพื่อให้ Admin ปล่อยเงินได้
      if ((status === 'RESOLVED' || status === 'CLOSED') && ticket.source === 'dispute' && ticket.jobId) {
        pool.query(
          `UPDATE job_disputes SET status = 'resolved', resolved_at = NOW(), resolved_by = $1 WHERE job_id = $2 AND status = 'open'`,
          [req.adminUser?.id || 'admin', String(ticket.jobId)]
        ).catch((e) => console.warn('job_disputes resolve update failed', e.message));
        pool.query(
          `UPDATE jobs SET payment_details = jsonb_set(COALESCE(payment_details, '{}'::jsonb), '{dispute_status}', '"resolved"'), updated_at = NOW() WHERE id = $1`,
          [String(ticket.jobId)]
        ).catch((e) => console.warn('job dispute_status resolve update failed', e.message));
        // Audit: Refund/Dispute — บันทึกยอดและ admin_id สำหรับหลักฐาน
        auditService.log(req.adminUser?.id || 'admin', 'DISPUTE_RESOLVED', {
          entityName: 'job_disputes',
          entityId: String(ticket.jobId),
          new: { jobId: ticket.jobId, status: 'resolved', resolved_by: req.adminUser?.id || 'admin' }
        }, { actorRole: 'Admin', status: 'Success', ipAddress: getClientIp(req) });
      }
    }
    res.json({ ticket });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update ticket' });
  }
});

// POST /api/admin/support/ai-suggest — AI สร้างข้อความตอบแนะนำ (rule-based จากข้อความล่าสุด)
app.post('/api/admin/support/ai-suggest', adminAuthMiddleware, (req, res) => {
  try {
    const { ticketId } = req.body || {};
    if (!ticketId) return res.status(400).json({ error: 'ticketId required' });
    const messages = supportMessagesStore.filter((m) => m.ticketId === ticketId).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const lastUser = messages.find((m) => m.sender === 'USER');
    const suggestion = lastUser ? getAutoReplyForUserMessage(lastUser.message) : null;
    res.json({ suggestion: suggestion || 'สวัสดีครับ ขอบคุณที่ติดต่อเรา ทีมงานจะตรวจสอบและติดต่อกลับโดยเร็วครับ' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to suggest reply' });
  }
});

app.get('/api/notifications/latest', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 5, 20);
    const list = broadcastNotificationsStore.slice(0, limit);
    res.json({ notifications: list });
  } catch (e) {
    console.error('GET /api/notifications/latest error:', e);
    res.status(500).json({ error: 'Failed to fetch' });
  }
});

// ✅ GET /api/admin/financial/market-cap
app.get('/api/admin/financial/market-cap', adminAuthMiddleware, async (req, res) => {
  try {
    const [investorsRes, growthRes, settingRes] = await Promise.all([
      pool.query(
        `SELECT id, name, shares, invested_amount, invested_at, note FROM investors ORDER BY invested_at`
      ).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT snapshot_date AS date, market_cap, total_shares FROM market_cap_snapshots ORDER BY snapshot_date LIMIT 24`
      ).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT key, value FROM system_settings WHERE key IN ('market_cap', 'total_shares')`
      ).catch(() => ({ rows: [] })),
    ]);
    const investors = (investorsRes.rows || []).map((r) => ({
      id: r.id,
      name: r.name,
      shares: parseInt(r.shares, 10) || 0,
      invested_amount: parseFloat(r.invested_amount) || 0,
      invested_at: r.invested_at ? String(r.invested_at).slice(0, 10) : '',
      note: r.note,
    }));
    const total_shares = investors.reduce((s, i) => s + i.shares, 0) || 10000;
    let current_market_cap = 0;
    (settingRes.rows || []).forEach((r) => {
      if (r.key === 'market_cap') current_market_cap = parseFloat(r.value) || 0;
    });
    if (current_market_cap === 0 && growthRes.rows && growthRes.rows.length > 0) {
      const last = growthRes.rows[growthRes.rows.length - 1];
      current_market_cap = parseFloat(last.market_cap) || 0;
    }
    if (current_market_cap === 0) current_market_cap = 1800000;
    const share_value = total_shares > 0 ? current_market_cap / total_shares : 0;
    const growth = (growthRes.rows || []).map((r) => ({
      date: r.date,
      market_cap: parseFloat(r.market_cap) || 0,
      total_shares: parseInt(r.total_shares, 10) || total_shares,
    }));
    res.json({
      current_market_cap,
      total_shares,
      share_value,
      investors,
      growth,
    });
  } catch (error) {
    console.error('GET /api/admin/financial/market-cap error:', error);
    res.status(500).json({ error: 'Failed to fetch market cap data' });
  }
});

// ============ INSURANCE VAULT (Liability 60/40) ============
// Public: อ่าน % เบี้ยประกัน — รองรับ ?category=maid (แยกตามหมวดงาน)
app.get('/api/settings/insurance-rate', async (req, res) => {
  try {
    const category = (req.query.category || '').toString().trim().toLowerCase();
    let percent = 10;
    if (category) {
      const catRow = await pool.query(
        `SELECT rate_percent FROM insurance_rate_by_category WHERE category = $1`,
        [category]
      ).catch(() => ({ rows: [] }));
      if (catRow.rows[0] != null) percent = parseFloat(catRow.rows[0].rate_percent) || 10;
      else {
        const defaultRow = await pool.query(
          `SELECT rate_percent FROM insurance_rate_by_category WHERE category = 'default'`
        ).catch(() => ({ rows: [] }));
        if (defaultRow.rows[0] != null) percent = parseFloat(defaultRow.rows[0].rate_percent) || 10;
        else {
          const globalRow = await pool.query(`SELECT value FROM insurance_settings WHERE key = 'insurance_rate_percent'`).catch(() => ({ rows: [] }));
          percent = globalRow.rows[0] ? parseFloat(globalRow.rows[0].value) || 10 : 10;
        }
      }
    } else {
      const r = await pool.query(`SELECT value FROM insurance_settings WHERE key = 'insurance_rate_percent'`).catch(() => ({ rows: [] }));
      percent = r.rows[0] ? parseFloat(r.rows[0].value) || 10 : 10;
    }
    res.json({ insurance_rate_percent: percent });
  } catch (e) {
    res.json({ insurance_rate_percent: 10 });
  }
});

// รายการหมวดงาน (สำหรับ Admin ตั้งอัตราประกันแยกตามหมวด — รองรับหลายงาน)
const JOB_CATEGORY_KEYS = [
  'maid', 'detective', 'logistics', 'ac_cleaning', 'delivery', 'tutor', 'repair', 'event', 'photography',
  'cleaning', 'moving', 'pet_care', 'beauty', 'health', 'consulting', 'tech_support', 'teaching', 'driving',
  'other', 'default'
];
app.get('/api/jobs/category-list', async (req, res) => {
  try {
    const list = await pool.query(
      `SELECT category, rate_percent, display_name FROM insurance_rate_by_category ORDER BY category`
    ).catch(() => ({ rows: [] }));
    const fromDb = (list.rows || []).map((r) => ({ category: r.category, rate_percent: parseFloat(r.rate_percent) || 10, display_name: r.display_name || r.category }));
    const known = {
      maid: 'แม่บ้าน', detective: 'นักสืบ', logistics: 'ขนส่ง', ac_cleaning: 'ล้างแอร์', delivery: 'จัดส่ง',
      tutor: 'ติวเตอร์', repair: 'ซ่อมบำรุง', event: 'อีเวนต์', photography: 'ถ่ายภาพ', cleaning: 'ทำความสะอาด',
      moving: 'ย้ายของ', pet_care: 'เลี้ยงสัตว์', beauty: 'ความงาม', health: 'สุขภาพ', consulting: 'ที่ปรึกษา',
      tech_support: 'ซ่อมไอที', teaching: 'สอนพิเศษ', driving: 'ขับรถ', other: 'อื่นๆ', default: 'ค่าเริ่มต้น (ทุกงาน)'
    };
    const all = JOB_CATEGORY_KEYS.map((c) => {
      const inDb = fromDb.find((x) => x.category === c);
      return { category: c, display_name: known[c] || c, rate_percent: inDb ? inDb.rate_percent : 10 };
    });
    res.json({ categories: all });
  } catch (e) {
    res.json({ categories: JOB_CATEGORY_KEYS.map((c) => ({ category: c, display_name: c, rate_percent: 10 })) });
  }
});

// Admin: อ่าน/แก้ไข % เบี้ยประกัน (รวมอัตราแยกตามหมวด)
app.get('/api/admin/insurance/settings', adminAuthMiddleware, async (req, res) => {
  try {
    const [globalRow, catRows] = await Promise.all([
      pool.query(`SELECT key, value, updated_at, updated_by FROM insurance_settings WHERE key = 'insurance_rate_percent'`).catch(() => ({ rows: [] })),
      pool.query(`SELECT category, rate_percent, display_name, updated_at FROM insurance_rate_by_category ORDER BY category`).catch(() => ({ rows: [] }))
    ]);
    const row = globalRow.rows[0];
    const category_rates = {};
    (catRows.rows || []).forEach((r) => {
      category_rates[r.category] = parseFloat(r.rate_percent) || 10;
    });
    res.json({
      insurance_rate_percent: row ? parseFloat(row.value) || 10 : 10,
      updated_at: row?.updated_at,
      updated_by: row?.updated_by,
      category_rates
    });
  } catch (e) {
    console.error('GET /api/admin/insurance/settings error:', e);
    res.status(500).json({ error: 'Failed to fetch insurance settings', details: e?.message });
  }
});

app.patch('/api/admin/insurance/settings', adminAuthMiddleware, async (req, res) => {
  try {
    const { insurance_rate_percent, category_rates } = req.body || {};
    const percent = Math.min(100, Math.max(0, parseFloat(insurance_rate_percent) || 10));
    try {
      await pool.query(
        `INSERT INTO insurance_settings (key, value, updated_at, updated_by) VALUES ('insurance_rate_percent', $1, NOW(), $2)
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW(), updated_by = $2`,
        [String(percent), req.adminUser?.id || null]
      );
    } catch (err) {
      console.error('insurance_settings upsert failed:', err.message);
      const hint = err.message && err.message.includes('does not exist') ? ' Run migration 017_insurance_vault.sql to create insurance_settings table.' : '';
      return res.status(500).json({
        error: 'Failed to save global insurance rate.',
        details: err.message + hint
      });
    }
    if (category_rates && typeof category_rates === 'object') {
      for (const [cat, rate] of Object.entries(category_rates)) {
        const key = String(cat).trim().toLowerCase();
        if (!key) continue;
        const r = Math.min(100, Math.max(0, Number(rate) || 10));
        try {
          await pool.query(
            `INSERT INTO insurance_rate_by_category (category, rate_percent, updated_at, updated_by)
             VALUES ($1, $2, NOW(), $3)
             ON CONFLICT (category) DO UPDATE SET rate_percent = $2, updated_at = NOW(), updated_by = $3`,
            [key, r, req.adminUser?.id || null]
          );
        } catch (err) {
          console.error('insurance_rate_by_category upsert failed:', err.message);
          return res.status(500).json({
            error: 'Failed to save category rates. Run migration 018_insurance_rate_by_category.sql to create the table.',
            details: err.message
          });
        }
      }
    }
    try {
      auditService.log(req.adminUser?.id || 'admin', 'INSURANCE_SETTINGS_UPDATED', { entityName: 'insurance_settings', new: { insurance_rate_percent: percent, category_rates } }, { actorRole: 'Admin', ipAddress: getClientIp(req) });
    } catch (auditErr) {
      console.warn('Audit log failed:', auditErr.message);
    }
    res.json({ success: true, insurance_rate_percent: percent });
  } catch (e) {
    console.error('PATCH /api/admin/insurance/settings error:', e);
    res.status(500).json({ error: 'Failed to update insurance settings', details: e.message });
  }
});

// Admin: สรุปยอดประกัน — Phase 2 ใช้ payment_ledger_audit (vault) เป็นแหล่ง 60/40
app.get('/api/admin/insurance/summary', adminAuthMiddleware, async (req, res) => {
  try {
    const [vaultRow, ticRow, tipoRow, withdrawnRow] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM payment_ledger_audit
         WHERE event_type = 'insurance_liability_credit' AND (metadata->>'leg') = 'insurance_liability'`
      ).catch(() => ({ rows: [{ total: 0 }] })),
      pool.query(`SELECT COALESCE(SUM(amount), 0) AS total FROM insurance_fund_movements WHERE type = 'liability_credit'`).catch(() => ({ rows: [{ total: 0 }] })),
      pool.query(`SELECT COALESCE(SUM(amount), 0) AS total FROM insurance_fund_movements WHERE type = 'liability_debit'`).catch(() => ({ rows: [{ total: 0 }] })),
      pool.query(`SELECT COALESCE(SUM(amount), 0) AS total FROM insurance_fund_movements WHERE type = 'withdrawal_investment'`).catch(() => ({ rows: [{ total: 0 }] }))
    ]);
    const totalLiability = parseFloat(vaultRow.rows[0]?.total) || 0;
    const locked_60 = round2(totalLiability * 0.6);
    const manageable_40 = round2(totalLiability * 0.4);
    const alreadyWithdrawn = parseFloat(withdrawnRow.rows[0]?.total) || 0;
    const allowedToWithdraw = Math.max(0, manageable_40 - alreadyWithdrawn);
    const TIC = parseFloat(ticRow.rows[0]?.total) || 0;
    const TIPO = parseFloat(tipoRow.rows[0]?.total) || 0;
    res.json({
      total_insurance_collected: TIC,
      total_insurance_paid_out: TIPO,
      current_insurance_balance: round2(totalLiability),
      reserve_60: locked_60,
      manageable_40,
      already_withdrawn_for_investment: alreadyWithdrawn,
      allowed_to_withdraw: allowedToWithdraw,
      source: 'payment_ledger_audit'
    });
  } catch (e) {
    console.error('Insurance summary error:', e);
    res.status(500).json({ error: 'Failed to fetch insurance summary', details: e?.message });
  }
});

// Phase 2: Insurance Vault — คำนวณ 60% (Locked) และ 40% (Manageable) จาก payment_ledger_audit ขา insurance_liability
app.get('/api/admin/insurance/vault', adminAuthMiddleware, async (req, res) => {
  try {
    const row = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM payment_ledger_audit
       WHERE event_type = 'insurance_liability_credit' AND (metadata->>'leg') = 'insurance_liability'`
    ).catch(() => ({ rows: [{ total: 0 }] }));
    const totalLiability = parseFloat(row.rows[0]?.total) || 0;
    const locked_60 = round2(totalLiability * 0.6);
    const manageable_40 = round2(totalLiability * 0.4);
    res.json({
      source: 'payment_ledger_audit',
      total_liability: round2(totalLiability),
      locked_60,
      manageable_40,
    });
  } catch (e) {
    console.error('GET /api/admin/insurance/vault error:', e);
    res.status(500).json({ error: 'Failed to fetch insurance vault', details: e?.message });
  }
});

// Admin: ถอนส่วน 40% ไปบริหาร/ลงทุน — Phase 2 ใช้ขีดจำกัดจาก vault (payment_ledger_audit)
app.post('/api/admin/insurance/withdraw', adminAuthMiddleware, async (req, res) => {
  try {
    const { amount: requestAmount, reason } = req.body || {};
    const amt = parseFloat(requestAmount);
    if (!(amt > 0)) return res.status(400).json({ error: 'Invalid amount' });

    const [vaultRow, withdrawnRow] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM payment_ledger_audit
         WHERE event_type = 'insurance_liability_credit' AND (metadata->>'leg') = 'insurance_liability'`
      ).catch(() => ({ rows: [{ total: 0 }] })),
      pool.query(`SELECT COALESCE(SUM(amount), 0) AS total FROM insurance_fund_movements WHERE type = 'withdrawal_investment'`).catch(() => ({ rows: [{ total: 0 }] }))
    ]);
    const totalLiability = parseFloat(vaultRow.rows[0]?.total) || 0;
    const manageable_40 = round2(totalLiability * 0.4);
    const alreadyWithdrawn = parseFloat(withdrawnRow.rows[0]?.total) || 0;
    const allowedToWithdraw = Math.max(0, manageable_40 - alreadyWithdrawn);

    if (amt > allowedToWithdraw) {
      return res.status(400).json({
        error: 'over_withdrawal_limit',
        message: 'ยอดถอนเกินขีดจำกัด 40% ของเงินสำรองประกัน',
        allowed_to_withdraw: allowedToWithdraw
      });
    }

    const id = `INS-WD-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    await pool.query(
      `INSERT INTO insurance_fund_movements (id, type, amount, job_id, reference_id, note, metadata, created_at, created_by)
       VALUES ($1, 'withdrawal_investment', $2, NULL, $3, $4, $5, NOW(), $6)`,
      [id, amt, id, reason || 'Withdrawal for investment/operating', JSON.stringify({ admin_id: req.adminUser?.id }), req.adminUser?.id]
    );
    auditService.log(req.adminUser?.id || 'admin', 'INSURANCE_WITHDRAWAL', {
      entityName: 'insurance_fund_movements',
      entityId: id,
      new: { amount: amt, reason: reason || '', allowed_to_withdraw: allowedToWithdraw }
    }, { actorRole: 'Admin', status: 'Success', ipAddress: getClientIp(req) });
    res.json({ success: true, id, amount: amt, message: 'Withdrawal recorded. Liability unchanged; cash moved to investment/operating.' });
  } catch (e) {
    console.error('Insurance withdraw error:', e);
    res.status(500).json({ error: 'Failed to process withdrawal' });
  }
});

// Phase 2: Admin ดู Ledger 4-5 ขา (ตรวจสอบการบันทึกบัญชี)
app.get('/api/admin/payment-ledger', adminAuthMiddleware, async (req, res) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);
    const jobId = (req.query.job_id || '').trim();
    const q = jobId
      ? await pool.query(
          `SELECT id, event_type, payment_id, job_id, amount, currency, status, metadata, created_at
           FROM payment_ledger_audit WHERE job_id = $1 ORDER BY id LIMIT $2`,
          [jobId, limit]
        )
      : await pool.query(
          `SELECT id, event_type, payment_id, job_id, amount, currency, status, metadata, created_at
           FROM payment_ledger_audit ORDER BY created_at DESC NULLS LAST, id DESC LIMIT $1`,
          [limit]
        );
    const rows = (q.rows || []).map((r) => ({
      id: r.id,
      event_type: r.event_type,
      payment_id: r.payment_id,
      job_id: r.job_id,
      amount: r.amount != null ? parseFloat(r.amount) : null,
      currency: r.currency,
      status: r.status,
      leg: r.metadata?.leg || null,
      created_at: r.created_at ? new Date(r.created_at).toISOString() : null,
    }));
    res.json({ source: 'payment_ledger_audit', count: rows.length, entries: rows });
  } catch (e) {
    console.error('GET /api/admin/payment-ledger error:', e);
    res.status(500).json({ error: 'Failed to fetch payment ledger', details: e?.message });
  }
});

// ✅ 2. Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { phone, password, name, role = 'user' } = req.body;

    if (!phone || !password || !name) {
      return res.status(400).json({
        error: 'Phone, password, and name required'
      });
    }

    console.log(`📝 Registration: ${phone} (${name})`);

    // ตรวจสอบว่ามีผู้ใช้แล้วหรือไม่
    const existingUser = await pool.query(
      `SELECT id FROM users WHERE phone = $1`,
      [phone]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        error: 'Phone number already registered'
      });
    }

    // สร้าง user ID
    const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // สร้างข้อมูลผู้ใช้ใหม่
    const newUser = {
      id: userId,
      phone: phone,
      email: `${phone}@meerak.app`,
      name: name,
      role: role,
      kyc_level: 'level_1',
      wallet_balance: 0,
      avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`,
      created_at: new Date().toISOString()
    };

    // บันทึกลง PostgreSQL
    await pool.query(
      `INSERT INTO users (id, phone, email, name, role, kyc_level, wallet_balance, avatar_url, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        newUser.id, newUser.phone, newUser.email, newUser.name, newUser.role,
        newUser.kyc_level, newUser.wallet_balance, newUser.avatar_url, newUser.created_at
      ]
    );

    // Generate token
    const token = `jwt_${newUser.id}_${Date.now()}`;

    res.json({
      success: true,
      token: token,
      user: newUser,
      message: 'Registration successful'
    });

  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({
      error: 'Registration failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});
// ============ JOB ENDPOINTS ============

// ✅ 1. Get All Jobs
// รองรับการพิมพ์ผิด: /api/job -> /api/jobs
app.get('/api/job', (req, res) => res.redirect(302, '/api/jobs'));

app.get('/api/jobs', async (req, res) => {
  try {
    const { category, search, limit = 50 } = req.query;

    // รองรับ status ที่อาจมีตัวพิมพ์ต่าง (open, Open, OPEN)
    let query = `SELECT * FROM jobs WHERE LOWER(TRIM(COALESCE(status, ''))) = 'open'`;
    const params = [];
    let paramIndex = 1;

    if (category && category !== 'All') {
      query += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (search) {
      query += ` AND (title ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);
    const rows = result.rows || [];
    console.log('[GET /api/jobs] Returning', rows.length, 'open job(s). Ids:', rows.map((r) => r.id).slice(0, 5));
    res.json(rows.map(normalizeJobForApi));
  } catch (error) {
    console.error('[GET /api/jobs] Error:', error.message, error.code);
    res.json([]);
  }
});

// ใช้ตรวจว่า backend มีงานเปิดอยู่กี่รายการ (สำหรับ debug Demo Anna ไม่เห็นงาน)
app.get('/api/debug/open-jobs', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, created_by, status, title, created_at FROM jobs WHERE LOWER(TRIM(COALESCE(status, ''))) = 'open' ORDER BY created_at DESC LIMIT 20`
    );
    const rows = result.rows || [];
    res.json({
      count: rows.length,
      ids: rows.map((r) => r.id),
      sample: rows.slice(0, 5).map((r) => ({ id: r.id, created_by: r.created_by, title: r.title })),
      hint: 'If count is 0, Bob\'s job may not be in this DB or status is not "open".'
    });
  } catch (e) {
    res.status(500).json({ error: e.message, hint: 'DB or jobs table may be missing.' });
  }
});

// ✅ POST /api/jobs/match — คืนรายการ provider ที่ match กับหมวดงาน (สำหรับ CreateJob findSmartMatches)
app.post('/api/jobs/match', async (req, res) => {
  try {
    const { category, location } = req.body || {};
    let providers = [];
    try {
      const result = await pool.query(
        `SELECT u.id, u.firebase_uid, u.full_name, u.email, u.phone, u.avatar_url
         FROM users u
         LEFT JOIN user_roles r ON r.user_id = u.id::text OR r.user_id = u.firebase_uid
         WHERE r.role IN ('PROVIDER', 'provider')
           AND COALESCE(u.provider_status, 'UNVERIFIED') = 'VERIFIED_PROVIDER'
         LIMIT 20`
      );
      providers = (result.rows || []).map((row) => {
        return {
          user: {
            id: row.id,
            firebase_uid: row.firebase_uid,
            name: row.full_name || row.phone || row.email || 'Provider',
            email: row.email,
            phone: row.phone,
            role: 'provider',
            avatar_url: row.avatar_url,
            rating: 0,
            location: {},
            completed_jobs_count: 0,
            hourly_rate: 500
          },
          score: 70,
          distance: null
        };
      });
    } catch (dbErr) {
      console.warn('jobs/match query failed, returning empty:', dbErr.message);
    }
    res.json(providers);
  } catch (error) {
    console.error('Jobs match error:', error);
    res.status(500).json({ error: 'Failed to match', message: error.message });
  }
});

// ✅ 2. Get Job by ID (ซ้ำกับ :jobId — ใช้ logic เดียวกันเพื่อกัน 500)
app.get('/api/jobs/:id', async (req, res) => {
  try {
    const jobId = req.params.id;
    const jobResult = await pool.query(`SELECT * FROM jobs WHERE id::text = $1`, [jobId]);
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    const job = jobResult.rows[0];
    res.json(normalizeJobForApi(job));
  } catch (error) {
    console.error('Job fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch job', message: error.message });
  }
});

// ✅ 3. Create Job
// ✅ Duplicate POST /api/jobs endpoint removed - using the one at line 751 instead

// ✅ 4. Accept Job
app.post('/api/jobs/:id/accept', async (req, res) => {
  try {
    const jobId = req.params.id;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID required' });
    }

    // ดึงข้อมูล job และ user (user อาจส่ง firebase_uid เช่น demo-anna-id)
    const [jobResult, userResult] = await Promise.all([
      pool.query('SELECT * FROM jobs WHERE id::text = $1', [jobId]),
      pool.query(
        'SELECT * FROM users WHERE id::text = $1 OR firebase_uid = $1 OR email = $1 OR phone = $1 LIMIT 1',
        [userId]
      )
    ]);

    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    let user = userResult.rows[0];
    if (!user) {
      const displayName = (userId || '').toString().slice(0, 12);
      try {
        await pool.query(
          `INSERT INTO users (firebase_uid, full_name, role, kyc_level, wallet_balance)
           VALUES ($1, $2, 'user', 'level_1', 0)`,
          [userId, displayName ? `User ${displayName}` : 'User']
        );
      } catch (insertErr) {
        if (insertErr.code !== '23505') console.warn('Accept: auto-create user:', insertErr.message);
      }
      const retry = await pool.query(
        'SELECT * FROM users WHERE firebase_uid = $1 OR id::text = $1 LIMIT 1',
        [userId]
      );
      user = retry.rows[0];
    }
    // ถ้ายังไม่มี user (INSERT ไม่ได้หรือ DB คนละตัว) ให้รับงานได้โดยใช้ userId เป็น provider
    if (!user) {
      user = {
        id: userId,
        firebase_uid: userId,
        full_name: `User ${(userId || '').toString().slice(0, 8)}`,
        name: null,
        phone: null,
        phone_number: null,
        role: 'provider',
        provider_status: 'UNVERIFIED'
      };
    }

    const job = jobResult.rows[0];

    // Provider Onboarding lock: ต้อง VERIFIED_PROVIDER ถึงจะรับงานได้
    const providerStatus = String(user.provider_status || 'UNVERIFIED').toUpperCase();
    if (providerStatus !== 'VERIFIED_PROVIDER') {
      return res.status(403).json({
        error: 'PROVIDER_NOT_VERIFIED',
        message: 'Provider must pass professional test before accepting jobs.',
        provider_status: providerStatus
      });
    }

    if (job.status !== 'open') {
      return res.status(400).json({ error: 'Job is not available' });
    }

    // อัพเดท job (รองรับ id เป็น number หรือ string)
    const updateResult = await pool.query(
      `UPDATE jobs SET 
        status = 'accepted',
        accepted_by = $1,
        accepted_at = NOW(),
        updated_at = NOW()
       WHERE id::text = $2
       RETURNING *`,
      [userId, String(jobId)]
    );

    res.json({
      success: true,
      job: updateResult.rows[0],
      provider: {
        id: user.id,
        name: user.name || user.full_name || user.phone,
        phone: user.phone || user.phone_number
      },
      message: 'Job accepted successfully'
    });

  } catch (error) {
    console.error('Job accept error:', error);
    res.status(500).json({ error: 'Failed to accept job' });
  }
});

// ✅ ยกเลิกงาน (เจ้าของงานเท่านั้น, สถานะ open หรือ accepted)
app.post('/api/jobs/:id/cancel', async (req, res) => {
  try {
    const jobId = (req.params.id || '').toString().trim();
    const { userId, reason } = req.body || {};
    if (!jobId || !userId) {
      return res.status(400).json({ error: 'Job ID and userId required' });
    }
    const jobResult = await pool.query('SELECT * FROM jobs WHERE id = $1', [jobId]);
    if (!jobResult.rows?.length) {
      return res.status(404).json({ error: 'Job not found', jobId });
    }
    const job = jobResult.rows[0];
    const createdBy = String(job.created_by || '');
    if (createdBy !== String(userId).trim()) {
      return res.status(403).json({ error: 'Only job owner can cancel' });
    }
    const status = (job.status || '').toLowerCase();
    if (status !== 'open' && status !== 'accepted') {
      return res.status(400).json({ error: 'Cannot cancel job in current status', currentStatus: job.status });
    }
    await pool.query(
      `UPDATE jobs SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [jobId]
    );
    res.json({ success: true, message: 'Job cancelled', jobId });
  } catch (e) {
    console.error('Job cancel error:', e.message);
    res.status(500).json({ error: 'Failed to cancel job', message: e.message });
  }
});

// Physical job categories (require OTP or GPS check before mark done)
const PHYSICAL_JOB_CATEGORIES = ['maid', 'plumbing', 'electrician', 'ac_cleaning', 'logistics', 'cleaning', 'repair', 'delivery', 'handyman'];
const GPS_DISTANCE_METERS = 500;
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// ✅ 5. Mark Job Complete (Safety: OTP or GPS for physical jobs) + Audit
app.post('/api/jobs/:id/complete', async (req, res) => {
  try {
    const jobId = req.params.id;
    const { providerLocation, otpCode, userId } = req.body;
    const ipAddress = getClientIp(req);

    const jobResult = await pool.query('SELECT * FROM jobs WHERE id::text = $1', [jobId]);
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    const job = jobResult.rows[0];

    // Strict State Machine: ห้ามข้ามขั้น — เฉพาะ accepted / in_progress -> waiting_for_approval
    const currentStatus = (job.status || '').toLowerCase();
    const allowedStatuses = ['accepted', 'in_progress', 'in progress'];
    if (!allowedStatuses.includes(currentStatus)) {
      return res.status(400).json({
        error: 'invalid_status_transition',
        message: `Cannot mark job complete from status "${job.status}". Allowed: accepted, in_progress only.`,
        currentStatus: job.status
      });
    }

    const providerId = (userId || job.accepted_by || '').toString();
    const category = (job.category || '').toLowerCase();
    const isPhysical = PHYSICAL_JOB_CATEGORIES.some(c => category.includes(c));

    if (isPhysical) {
      let verified = false;
      let auditAction = null;
      let auditMeta = { job_id: jobId, provider_id: providerId };

      if (otpCode && redisClient) {
        const stored = await redisClient.get(`job_otp:${jobId}`);
        if (stored && String(stored) === String(otpCode).trim()) {
          verified = true;
          auditAction = 'JOB_COMPLETE_OTP_VERIFIED';
          auditMeta.otp_used = '[verified]';
          auditMeta.verified_at = new Date().toISOString();
          await redisClient.del(`job_otp:${jobId}`);
        }
      }
      // Verification: ระยะทางคำนวณบน Server เท่านั้น (ห้ามเชื่อ distance จาก Frontend)
      // GPS Timeout: พิกัดต้องมี timestamp และอายุไม่เกิน 5 นาที (ป้องกันการส่งพิกัดเก่าที่แคปไว้)
      const GPS_MAX_AGE_MS = 5 * 60 * 1000; // 5 นาที
      if (!verified && providerLocation && (providerLocation.lat != null && providerLocation.lng != null)) {
        const locTime = providerLocation.timestamp ? new Date(providerLocation.timestamp).getTime() : 0;
        const now = Date.now();
        if (locTime <= 0 || (now - locTime) > GPS_MAX_AGE_MS) {
          return res.status(400).json({
            error: 'gps_timestamp_invalid',
            message: 'Location timestamp is required and must be within the last 5 minutes. Please refresh GPS and try again.'
          });
        }
        const jobLat = job.location_lat ?? job.lat ?? job.job_lat;
        const jobLng = job.location_lng ?? job.lng ?? job.job_lng;
        if (jobLat != null && jobLng != null) {
          const dist = haversineMeters(
            providerLocation.lat, providerLocation.lng,
            Number(jobLat), Number(jobLng)
          );
          if (dist <= GPS_DISTANCE_METERS) {
            verified = true;
            auditAction = 'JOB_COMPLETE_GPS_VERIFIED';
            auditMeta.lat = providerLocation.lat;
            auditMeta.lng = providerLocation.lng;
            auditMeta.job_lat = Number(jobLat);
            auditMeta.job_lng = Number(jobLng);
            auditMeta.distance_m = Math.round(dist);
            auditMeta.location_timestamp = providerLocation.timestamp;
          }
        } else {
          verified = true;
        }
      }
      if (!verified) {
        return res.status(400).json({
          error: 'Safety verification required',
          message: 'For this job type, provide a valid OTP from the employer or ensure you are at the job location (GPS).'
        });
      }
      auditService.log(providerId, auditAction, {
        entityName: 'jobs',
        entityId: jobId,
        new: auditMeta
      }, { actorRole: 'User', status: 'Success', ipAddress });
    }

    await pool.query(
      `UPDATE jobs SET 
        status = 'waiting_for_approval',
        submitted_at = NOW(),
        updated_at = NOW()
       WHERE id = $1`,
      [jobId]
    );

    res.json({
      success: true,
      message: 'Job marked as complete; waiting for employer approval.',
      jobId
    });
  } catch (error) {
    console.error('Job complete error:', error);
    res.status(500).json({ error: 'Failed to complete job' });
  }
});

// Rate limit: OTP request per job + per IP (Phase 1 Security)
const RATE_LIMIT_OTP_REQUEST_JOB = { max: 5, windowSec: 15 * 60 };  // 5 per 15 min per job
const RATE_LIMIT_OTP_REQUEST_IP = { max: 20, windowSec: 15 * 60 };  // 20 per 15 min per IP

// Request OTP for job completion (employer or system calls — stores in Redis for provider to use)
app.post('/api/jobs/:id/request-completion-otp', async (req, res) => {
  try {
    const jobId = req.params.id;
    const ip = getClientIp(req);
    const [byJob, byIp] = await Promise.all([
      checkRateLimit('otp_request_job', jobId, RATE_LIMIT_OTP_REQUEST_JOB),
      checkRateLimit('otp_request_ip', ip, RATE_LIMIT_OTP_REQUEST_IP)
    ]);
    if (!byJob.allowed) {
      return sendRateLimitResponse(res, byJob.retryAfter, 'Too many OTP requests for this job.');
    }
    if (!byIp.allowed) {
      return sendRateLimitResponse(res, byIp.retryAfter, 'Too many OTP requests.');
    }
    if (!redisClient) {
      return res.status(503).json({ error: 'OTP service unavailable' });
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await redisClient.setEx(`job_otp:${jobId}`, 600, code);
    res.json({ success: true, message: 'OTP generated; share with provider.' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to request OTP' });
  }
});

// ============ PROVIDER ONBOARDING (แบบทดสอบ 50–60 ข้อ, ผ่าน ≥85%, ไม่ผ่านรอ 24 ชม.) ============
const PROVIDER_EXAM_PASS_PERCENT = 85;
const PROVIDER_EXAM_TOTAL_QUESTIONS = 55;
const PROVIDER_EXAM_TIME_LIMIT_SEC = 45 * 60; // 45 นาที
// คำตอบที่ถูกต้องของแบบทดสอบมาตรฐานการบริการและความปลอดภัย (ต้องตรงกับ frontend)
const PROVIDER_EXAM_CORRECT = {};
for (let i = 1; i <= PROVIDER_EXAM_TOTAL_QUESTIONS; i++) {
  const opts = ['a', 'b', 'c', 'd'];
  PROVIDER_EXAM_CORRECT[`nexus-q${i}`] = opts[i % 4];
}

app.get('/api/provider-onboarding/status', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const r = await pool.query(
      `SELECT id, provider_status, provider_verified_at, provider_test_attempts, provider_test_last_failed_at, provider_test_next_retry_at, onboarding_status
       FROM users WHERE firebase_uid = $1 OR id::text = $1 LIMIT 1`,
      [userId]
    );
    if (r.rows.length === 0) {
      return res.json({
        provider_status: 'UNVERIFIED',
        provider_verified_at: null,
        provider_test_next_retry_at: null,
        provider_test_attempts: 0,
        onboarding_status: 'NOT_STARTED',
        exam_results: [],
      });
    }
    const u = r.rows[0];
    let exam_results = [];
    try {
      const examRes = await pool.query(
        `SELECT module, category, attempt, score, passed, submitted_at, time_spent_seconds FROM user_exam_results WHERE user_id = $1 ORDER BY module, attempt DESC`,
        [u.id]
      );
      exam_results = (examRes.rows || []).map((row) => ({
        module: row.module,
        category: row.category || null,
        attempt: row.attempt,
        score: row.score,
        passed: row.passed,
        submitted_at: row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
        time_spent_seconds: row.time_spent_seconds,
      }));
    } catch (_) {
      // table may not exist yet
    }
    res.json({
      provider_status: u.provider_status || 'UNVERIFIED',
      provider_verified_at: u.provider_verified_at,
      provider_test_attempts: u.provider_test_attempts || 0,
      provider_test_next_retry_at: u.provider_test_next_retry_at,
      onboarding_status: u.onboarding_status || 'NOT_STARTED',
      exam_results,
    });
  } catch (e) {
    console.error('Provider onboarding status error:', e);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

app.post('/api/provider-onboarding/submit-exam', async (req, res) => {
  try {
    const { userId, answers } = req.body || {};
    if (!userId || typeof answers !== 'object') {
      return res.status(400).json({ error: 'userId and answers required' });
    }
    const r = await pool.query(
      `SELECT id, provider_status, provider_test_next_retry_at FROM users WHERE firebase_uid = $1 OR id::text = $1 LIMIT 1`,
      [userId]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = r.rows[0];
    const status = (user.provider_status || 'UNVERIFIED').toUpperCase();
    if (status === 'VERIFIED_PROVIDER') {
      return res.json({ passed: true, score: 100, message: 'Already verified' });
    }
    const nextRetry = user.provider_test_next_retry_at ? new Date(user.provider_test_next_retry_at) : null;
    if (nextRetry && new Date() < nextRetry) {
      return res.status(403).json({
        error: 'COOLDOWN',
        message: 'กรุณารอ 24 ชั่วโมงก่อนทำแบบทดสอบใหม่',
        nextRetryAt: nextRetry.toISOString(),
      });
    }
    // Phase 2: คะแนนจากตาราง questions (module=1) ถ้ามี; ไม่มีถึงใช้ fallback nexus-q*
    let correct = 0;
    let total = 0;
    const questionsRows = await pool.query(
      `SELECT id, correct_option_id FROM questions WHERE module = 1 ORDER BY sort_order, id`
    ).catch(() => ({ rows: [] }));
    if (questionsRows.rows.length > 0) {
      total = questionsRows.rows.length;
      for (const row of questionsRows.rows) {
        const ans = String(answers[row.id] || '').trim().toLowerCase();
        if (ans && row.correct_option_id && ans === String(row.correct_option_id).toLowerCase()) correct++;
      }
    } else {
      total = PROVIDER_EXAM_TOTAL_QUESTIONS;
      for (let i = 1; i <= total; i++) {
        const qId = `nexus-q${i}`;
        const correctOpt = PROVIDER_EXAM_CORRECT[qId];
        if (correctOpt && String(answers[qId] || '').trim().toLowerCase() === correctOpt) correct++;
      }
    }
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    let passThreshold = PROVIDER_EXAM_PASS_PERCENT;
    try {
      const cfg = await pool.query('SELECT pass_percent FROM exam_module_config WHERE module = 1 LIMIT 1');
      if (cfg.rows[0]?.pass_percent != null) passThreshold = Number(cfg.rows[0].pass_percent);
    } catch (_) {}
    const passed = score >= passThreshold;
    const timeSpent = parseInt(req.body.time_spent_seconds, 10) || null;
    const startedAt = req.body.started_at ? new Date(req.body.started_at) : null;
    if (PROVIDER_EXAM_TIME_LIMIT_SEC && timeSpent != null && timeSpent > PROVIDER_EXAM_TIME_LIMIT_SEC) {
      return res.status(400).json({ error: 'TIME_LIMIT_EXCEEDED', message: 'เกินเวลาในการทำข้อสอบ (Module 1)' });
    }

    if (passed) {
      // บันทึกผลลง user_exam_results (Module 1); ตั้ง onboarding_status = MODULE1_PASSED เท่านั้น (ยังไม่ VERIFIED — รอ M2 + Admin)
      const attemptRes = await pool.query(
        `SELECT COALESCE(MAX(attempt), 0) + 1 AS next_attempt FROM user_exam_results WHERE user_id = $1 AND module = 1`,
        [user.id]
      );
      const attempt = attemptRes.rows[0]?.next_attempt || 1;
      await pool.query(
        `INSERT INTO user_exam_results (user_id, module, attempt, score, passed, started_at, time_spent_seconds) VALUES ($1, 1, $2, $3, TRUE, $4, $5)`,
        [user.id, attempt, score, startedAt || new Date(), timeSpent]
      );
      await pool.query(
        `UPDATE users SET provider_test_passed_at = NOW(), provider_test_next_retry_at = NULL, onboarding_status = 'MODULE1_PASSED', updated_at = NOW() WHERE id = $1`,
        [user.id]
      );
      return res.json({ passed: true, score, module: 1, onboarding_status: 'MODULE1_PASSED' });
    }

    // ไม่ผ่าน: บันทึกผล (passed=false) และล็อก 24 ชม.
    const attemptRes = await pool.query(
      `SELECT COALESCE(MAX(attempt), 0) + 1 AS next_attempt FROM user_exam_results WHERE user_id = $1 AND module = 1`,
      [user.id]
    );
    const attempt = attemptRes.rows[0]?.next_attempt || 1;
    await pool.query(
      `INSERT INTO user_exam_results (user_id, module, attempt, score, passed, started_at, time_spent_seconds) VALUES ($1, 1, $2, $3, FALSE, $4, $5)`,
      [user.id, attempt, score, startedAt || new Date(), timeSpent]
    );
    await pool.query(
      `UPDATE users SET provider_test_attempts = COALESCE(provider_test_attempts, 0) + 1,
       provider_test_last_failed_at = NOW(), provider_test_next_retry_at = NOW() + INTERVAL '24 hours', updated_at = NOW()
       WHERE id = $1`,
      [user.id]
    );
    const nextRetryResult = await pool.query(
      `SELECT provider_test_next_retry_at FROM users WHERE id = $1`,
      [user.id]
    );
    const nextRetryAt = nextRetryResult.rows[0]?.provider_test_next_retry_at;
    return res.json({
      passed: false,
      score,
      message: 'ไม่ผ่าน ต้องได้ไม่ต่ำกว่า ' + passThreshold + '%',
      nextRetryAt: nextRetryAt ? new Date(nextRetryAt).toISOString() : null,
    });
  } catch (e) {
    console.error('Provider submit-exam error:', e);
    res.status(500).json({ error: 'Failed to submit exam' });
  }
});

// ============ NEXUS EXAM ENGINE — Module 2 (Technical per category), Module 3 (Scenario) ============
const NEXUS_MODULE2_PASS_PERCENT = 80;
const NEXUS_MODULE2_TOTAL = 36;
const NEXUS_MODULE2_CATEGORIES = [
  'Cleaning', 'Delivery', 'Tutoring', 'Repair', 'Beauty', 'Moving', 'Pet Care', 'Gardening',
  'Photography', 'Event', 'Catering', 'Driving', 'Security', 'IT Support', 'Accounting',
  'Legal', 'Medical', 'Construction', 'Design', 'Other'
];
const NEXUS_MODULE2_CORRECT = {};
for (let i = 1; i <= NEXUS_MODULE2_TOTAL; i++) {
  const opts = ['a', 'b', 'c', 'd'];
  NEXUS_MODULE2_CORRECT[`m2-q${i}`] = opts[i % 4];
}

// Time limit (seconds) per module — Backend ปฏิเสธถ้าส่งเกินเวลา
const NEXUS_MODULE_TIME_LIMIT = { 1: 45 * 60, 2: 40 * 60, 3: 30 * 60 };

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// GET ข้อสอบ Module 1 (จาก DB), Module 2, Module 3
app.get('/api/nexus-exam/questions', async (req, res) => {
  try {
    const moduleNum = parseInt(req.query.module, 10);
    const category = (req.query.category || '').trim() || 'General';
    if (moduleNum === 1) {
      const rows = await pool.query(
        `SELECT id, question_text, options, correct_option_id FROM questions WHERE module = 1 ORDER BY sort_order, id`
      ).catch(() => ({ rows: [] }));
      if (rows.rows.length === 0) {
        return res.status(404).json({ error: 'Module 1 questions not seeded. Run POST /api/admin/setup-database.' });
      }
      const questions = rows.rows.map((r) => ({
        id: r.id,
        text: r.question_text,
        options: shuffleArray(r.options || []),
      }));
      return res.json({ module: 1, questions: shuffleArray(questions) });
    }
    if (moduleNum === 2) {
      const questions = [];
      for (let i = 1; i <= NEXUS_MODULE2_TOTAL; i++) {
        const qId = `m2-q${i}`;
        const opts = [
          { id: 'a', text: `ตัวเลือก A — ข้อ ${i} (ทักษะทางเทคนิค)` },
          { id: 'b', text: `ตัวเลือก B — ข้อ ${i}` },
          { id: 'c', text: `ตัวเลือก C — ข้อ ${i}` },
          { id: 'd', text: `ตัวเลือก D — ข้อ ${i}` },
        ];
        questions.push({
          id: qId,
          text: `ข้อ ${i}. [${category}] ทักษะทางเทคนิคและมาตรฐานการทำงานที่ถูกต้อง?`,
          options: shuffleArray(opts),
        });
      }
      const shuffled = shuffleArray(questions);
      return res.json({ module: 2, category, questions: shuffled });
    }
    if (moduleNum === 3) {
      // Module 3: Scenario — ตัวอย่าง 5 ข้อ (เพิ่มได้ภายหลัง)
      const scenarios = [
        { id: 'm3-q1', text: 'ลูกค้าโทรมาบอกว่ามาสาย 15 นาที คุณควรทำอย่างไร?', options: shuffleArray([{ id: 'a', text: 'ขอโทษและเร่งเดินทาง' }, { id: 'b', text: 'แจ้งเวลาที่คาดว่าจะถึง' }, { id: 'c', text: 'ทั้ง a และ b' }, { id: 'd', text: 'ไม่ต้องทำอะไร' }]), recommended_action: 'ขอโทษอย่างจริงใจ แจ้งเวลาที่คาดว่าจะถึง และดำเนินงานด้วยความรับผิดชอบ' },
        { id: 'm3-q2', text: 'ระหว่างทำงานพบของมีค่าของลูกค้า คุณควรทำอย่างไร?', options: shuffleArray([{ id: 'a', text: 'เก็บไว้แล้วคืนหลังจบงาน' }, { id: 'b', text: 'แจ้งลูกค้าทันทีและเก็บในที่ปลอดภัย' }, { id: 'c', text: 'ไม่สนใจ' }, { id: 'd', text: 'นำกลับไป' }]), recommended_action: 'แจ้งลูกค้าทันที และเก็บในที่ปลอดภัยจนกว่าจะส่งมอบ' },
        { id: 'm3-q3', text: 'ลูกค้าไม่พอใจผลงานและพูดจาไม่ดี คุณควรทำอย่างไร?', options: shuffleArray([{ id: 'a', text: 'โต้กลับ' }, { id: 'b', text: 'ฟังและเสนอแก้ไขอย่างสงบ' }, { id: 'c', text: 'หยุดทำงานทันที' }, { id: 'd', text: 'ไม่สนใจ' }]), recommended_action: 'รักษาความสงบ ฟังปัญหา และเสนอทางแก้ไขหรือปรับปรุงอย่างมืออาชีพ' },
        { id: 'm3-q4', text: 'คุณมีอาการไม่สบายเล็กน้อยในวันที่มีงาน คุณควรทำอย่างไร?', options: shuffleArray([{ id: 'a', text: 'ไปทำงานตามปกติแต่ล้างมือบ่อย' }, { id: 'b', text: 'แจ้งลูกค้าและนัดเลื่อนถ้าจำเป็น' }, { id: 'c', text: 'ไม่ไปโดยไม่แจ้ง' }, { id: 'd', text: 'ส่งเพื่อนไปแทน' }]), recommended_action: 'ถ้าส่งผลต่อคุณภาพงานหรือความปลอดภัย ควรแจ้งลูกค้าและนัดเลื่อน หรือหาคนแทนอย่างเหมาะสม' },
        { id: 'm3-q5', text: 'หลังจบงานลูกค้าถามเบอร์โทรส่วนตัวเพื่อติดต่อนอกแพลตฟอร์ม คุณควรทำอย่างไร?', options: shuffleArray([{ id: 'a', text: 'ให้เบอร์ได้' }, { id: 'b', text: 'ปฏิเสธอย่างสุภาพและแนะนำให้ใช้แอป' }, { id: 'c', text: 'ไม่ตอบ' }, { id: 'd', text: 'ให้เบอร์คนอื่น' }]), recommended_action: 'ปฏิเสธอย่างสุภาพ และอธิบายว่าการติดต่อผ่านแพลตฟอร์มช่วยให้ทั้งสองฝ่ายได้รับความคุ้มครอง' },
      ];
      return res.json({ module: 3, questions: shuffleArray(scenarios) });
    }
    return res.status(400).json({ error: 'module must be 1, 2, or 3' });
  } catch (e) {
    console.error('Nexus exam questions error:', e);
    res.status(500).json({ error: 'Failed to get questions' });
  }
});

// POST ส่งคำตอบ Module 2 (และ Module 3 — บันทึกผลเพื่อเรียนรู้)
app.post('/api/nexus-exam/submit', async (req, res) => {
  try {
    const { userId, module: moduleNum, category, answers, time_spent_seconds, started_at } = req.body || {};
    if (!userId || !moduleNum || typeof answers !== 'object') {
      return res.status(400).json({ error: 'userId, module, and answers required' });
    }
    const r = await pool.query(
      `SELECT id FROM users WHERE firebase_uid = $1 OR id::text = $1 LIMIT 1`,
      [userId]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = r.rows[0];
    const timeSpent = parseInt(time_spent_seconds, 10) || null;
    const startedAt = started_at ? new Date(started_at) : new Date();

    const timeLimit = NEXUS_MODULE_TIME_LIMIT[moduleNum];
    if (timeLimit && timeSpent != null && timeSpent > timeLimit) {
      return res.status(400).json({ error: 'TIME_LIMIT_EXCEEDED', message: 'เกินเวลาในการทำข้อสอบของ module นี้' });
    }

    if (moduleNum === 2) {
      const cat = (category || 'General').trim();
      let correct = 0;
      for (let i = 1; i <= NEXUS_MODULE2_TOTAL; i++) {
        const qId = `m2-q${i}`;
        const correctOpt = NEXUS_MODULE2_CORRECT[qId];
        if (correctOpt && String(answers[qId] || '').trim().toLowerCase() === correctOpt) correct++;
      }
      const score = NEXUS_MODULE2_TOTAL > 0 ? Math.round((correct / NEXUS_MODULE2_TOTAL) * 100) : 0;
      let m2PassThreshold = NEXUS_MODULE2_PASS_PERCENT;
      try {
        const cfg = await pool.query('SELECT pass_percent FROM exam_module_config WHERE module = 2 LIMIT 1');
        if (cfg.rows[0]?.pass_percent != null) m2PassThreshold = Number(cfg.rows[0].pass_percent);
      } catch (_) {}
      const passed = score >= m2PassThreshold;

      const attemptRes = await pool.query(
        `SELECT COALESCE(MAX(attempt), 0) + 1 AS next_attempt FROM user_exam_results WHERE user_id = $1 AND module = 2 AND category = $2`,
        [user.id, cat]
      );
      const attempt = attemptRes.rows[0]?.next_attempt || 1;
      await pool.query(
        `INSERT INTO user_exam_results (user_id, module, category, attempt, score, passed, started_at, time_spent_seconds) VALUES ($1, 2, $2, $3, $4, $5, $6, $7)`,
        [user.id, cat, attempt, score, passed, startedAt, timeSpent]
      );

      if (passed) {
        const m1Passed = await pool.query(
          `SELECT 1 FROM user_exam_results WHERE user_id = $1 AND module = 1 AND passed = TRUE LIMIT 1`,
          [user.id]
        );
        if (m1Passed.rows.length > 0) {
          await pool.query(
            `UPDATE users SET onboarding_status = 'QUALIFIED', updated_at = NOW() WHERE id = $1`,
            [user.id]
          );
          return res.json({ passed: true, score, module: 2, onboarding_status: 'QUALIFIED' });
        }
        return res.json({ passed: true, score, module: 2, onboarding_status: 'MODULE2_PASSED' });
      }
      return res.json({ passed: false, score, module: 2 });
    }

    if (moduleNum === 3) {
      // Module 3: บันทึกผล (ผ่านอัตโนมัติเพื่อเรียนรู้) — ไม่มีคะแนนตัดผ่าน
      const score = 100;
      await pool.query(
        `INSERT INTO user_exam_results (user_id, module, category, attempt, score, passed, started_at, time_spent_seconds) VALUES ($1, 3, $2, 1, $3, TRUE, $4, $5)`,
        [user.id, 'scenario', score, startedAt, timeSpent]
      );
      return res.json({ passed: true, score, module: 3, message: 'บันทึกผลแล้ว — แนะนำให้อ่าน Recommended Action แต่ละข้อ' });
    }

    return res.status(400).json({ error: 'module must be 2 or 3' });
  } catch (e) {
    console.error('Nexus exam submit error:', e);
    res.status(500).json({ error: 'Failed to submit exam' });
  }
});

// ============ ADMIN: Training Center — อ่าน/อัปเดต config ข้อสอบและเกณฑ์คะแนน ============
app.get('/api/admin/training/exam-config', adminAuthMiddleware, async (req, res) => {
  try {
    let rows = [];
    try {
      const r = await pool.query(
        `SELECT module, pass_percent, time_limit_min, total_questions, updated_at FROM exam_module_config ORDER BY module`
      );
      rows = r.rows || [];
    } catch (_) { /* table may not exist */ }
    const defaults = {
      1: { passPercent: PROVIDER_EXAM_PASS_PERCENT, timeLimitMin: 45, totalQuestions: PROVIDER_EXAM_TOTAL_QUESTIONS },
      2: { passPercent: NEXUS_MODULE2_PASS_PERCENT, timeLimitMin: 40, totalQuestions: NEXUS_MODULE2_TOTAL, categories: NEXUS_MODULE2_CATEGORIES },
      3: { passPercent: 100, timeLimitMin: 30, totalQuestions: 5 },
    };
    const config = { module1: {}, module2: {}, module3: {} };
    [1, 2, 3].forEach((mod) => {
      const row = rows.find((r) => r.module === mod);
      const d = defaults[mod];
      config[`module${mod}`] = {
        passPercent: row ? row.pass_percent : d.passPercent,
        timeLimitMin: row ? row.time_limit_min : d.timeLimitMin,
        totalQuestions: row ? row.total_questions : d.totalQuestions,
        categories: d.categories || null,
        updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
      };
    });
    res.json(config);
  } catch (e) {
    console.error('GET admin training exam-config error:', e);
    res.status(500).json({ error: 'Failed to fetch exam config' });
  }
});

app.patch('/api/admin/training/exam-config', adminAuthMiddleware, async (req, res) => {
  try {
    const { module: moduleNum, passPercent, timeLimitMin, totalQuestions } = req.body || {};
    if (!moduleNum || ![1, 2, 3].includes(Number(moduleNum))) {
      return res.status(400).json({ error: 'module must be 1, 2, or 3' });
    }
    const mod = Number(moduleNum);
    const pass = passPercent != null ? Math.min(100, Math.max(0, parseInt(passPercent, 10))) : null;
    const timeMin = timeLimitMin != null ? Math.max(1, parseInt(timeLimitMin, 10)) : null;
    const total = totalQuestions != null ? Math.max(1, parseInt(totalQuestions, 10)) : null;
    await pool.query(
      `INSERT INTO exam_module_config (module, pass_percent, time_limit_min, total_questions, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (module) DO UPDATE SET
         pass_percent = COALESCE($2, exam_module_config.pass_percent),
         time_limit_min = COALESCE($3, exam_module_config.time_limit_min),
         total_questions = COALESCE($4, exam_module_config.total_questions),
         updated_at = NOW()`,
      [mod, pass, timeMin, total]
    );
    const r = await pool.query(
      `SELECT module, pass_percent, time_limit_min, total_questions, updated_at FROM exam_module_config WHERE module = $1`,
      [mod]
    );
    const row = r.rows[0];
    res.json({
      module: row.module,
      passPercent: row.pass_percent,
      timeLimitMin: row.time_limit_min,
      totalQuestions: row.total_questions,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    });
  } catch (e) {
    console.error('PATCH admin training exam-config error:', e);
    res.status(500).json({ error: 'Failed to update exam config' });
  }
});

// ============ DATABASE SETUP ENDPOINT ============
app.post('/api/admin/setup-database', async (req, res) => {
  try {
    console.log('🚀 Starting database setup...');

    const setupQueries = [
      // 1. Users table
      `CREATE TABLE IF NOT EXISTS users (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        firebase_uid VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(20),
        full_name VARCHAR(255),
        role VARCHAR(50) DEFAULT 'user',
        provider_status VARCHAR(50) DEFAULT 'UNVERIFIED',
        provider_verified_at TIMESTAMP,
        provider_test_attempts INT DEFAULT 0,
        provider_test_last_failed_at TIMESTAMP,
        provider_test_next_retry_at TIMESTAMP,
        provider_test_passed_at TIMESTAMP,
        kyc_level VARCHAR(50) DEFAULT 'level_1',
        kyc_status VARCHAR(50) DEFAULT 'not_submitted',
        kyc_verified_at TIMESTAMP,
        kyc_next_reverify_at TIMESTAMP,
        wallet_balance DECIMAL(10,2) DEFAULT 0,
        wallet_pending DECIMAL(10,2) DEFAULT 0,
        avatar_url TEXT,
        skills TEXT,
        location TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,

      // 1.1 Add provider onboarding / KYC columns (for existing DBs)
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_status VARCHAR(50) DEFAULT 'UNVERIFIED'`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_verified_at TIMESTAMP`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_test_attempts INT DEFAULT 0`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_test_last_failed_at TIMESTAMP`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_test_next_retry_at TIMESTAMP`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_test_passed_at TIMESTAMP`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_verified_at TIMESTAMP`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_next_reverify_at TIMESTAMP`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_until TIMESTAMP`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_vip BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_status VARCHAR(50) DEFAULT 'NOT_STARTED'`,

      // 1.2 Nexus Exam Engine: ผลสอบแต่ละ module
      `CREATE TABLE IF NOT EXISTS user_exam_results (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        module SMALLINT NOT NULL,
        category VARCHAR(100),
        attempt SMALLINT DEFAULT 1,
        score SMALLINT NOT NULL,
        passed BOOLEAN NOT NULL,
        started_at TIMESTAMP,
        submitted_at TIMESTAMP DEFAULT NOW(),
        time_spent_seconds INT,
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_user_exam_results_user_id ON user_exam_results(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_user_exam_results_module ON user_exam_results(user_id, module)`,

      // 1.3 Admin Training Center: config ต่อ module (เกณฑ์ผ่าน, เวลา, จำนวนข้อ)
      `CREATE TABLE IF NOT EXISTS exam_module_config (
        module SMALLINT PRIMARY KEY,
        pass_percent SMALLINT NOT NULL,
        time_limit_min SMALLINT NOT NULL,
        total_questions SMALLINT NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      )`,

      // 1.4 Phase 2 Exam: ตารางคำถาม (รองรับ Module 1 จริยธรรม/ความปลอดภัย และ module อื่น)
      `CREATE TABLE IF NOT EXISTS questions (
        id VARCHAR(50) PRIMARY KEY,
        module SMALLINT NOT NULL,
        question_text TEXT NOT NULL,
        options JSONB NOT NULL,
        correct_option_id VARCHAR(10) NOT NULL,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_questions_module ON questions(module)`,

      // 2. Add demo user (ถ้ายังไม่มี)
      `INSERT INTO users (firebase_uid, email, phone, full_name, role, kyc_level, wallet_balance) 
       VALUES ('demo-anna-id', 'anna@meerak.app', '0800000001', 'Anna Employer', 'user', 'level_2', 50000)
       ON CONFLICT DO NOTHING`,

      // 3. Jobs table (schema ครบตามที่ API ใช้: สร้างงาน, รับงาน, สถานะ, payment)
      `CREATE TABLE IF NOT EXISTS jobs (
        id VARCHAR(100) PRIMARY KEY,
        title VARCHAR(255),
        description TEXT,
        category VARCHAR(100),
        price DECIMAL(10,2),
        status VARCHAR(50) DEFAULT 'open',
        location TEXT,
        location_lat DECIMAL(10,6),
        location_lng DECIMAL(10,6),
        datetime TIMESTAMP,
        created_by VARCHAR(255),
        created_by_name VARCHAR(255),
        created_by_avatar TEXT,
        client_id UUID,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        accepted_by VARCHAR(255),
        accepted_at TIMESTAMP,
        submitted_at TIMESTAMP,
        payment_details JSONB,
        payment_status VARCHAR(50),
        paid_at TIMESTAMP
      )`,

      // 4. Add sample job
      `INSERT INTO jobs (id, title, description, category, price, created_by)
       VALUES ('job-001', 'Delivery Service', 'Need to deliver documents', 'Delivery', 500, 'demo-anna-id')
       ON CONFLICT DO NOTHING`,

      // 5. audit_log (append-only: GPS/OTP evidence — Phase 1 Audit)
      `CREATE TABLE IF NOT EXISTS audit_log (
        id BIGSERIAL PRIMARY KEY,
        actor_id VARCHAR(255),
        actor_role VARCHAR(50),
        action VARCHAR(255),
        entity_name VARCHAR(255),
        entity_id VARCHAR(255),
        changes JSONB,
        status VARCHAR(50),
        ip_address VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_name, entity_id)`,
      // Append-only trigger: forbid UPDATE/DELETE (evidence integrity)
      `CREATE OR REPLACE FUNCTION prevent_audit_log_modify() RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'audit_log is append-only: UPDATE and DELETE are not allowed';
      END; $$ LANGUAGE plpgsql`,
      `DROP TRIGGER IF EXISTS audit_log_append_only ON audit_log`,
      `CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE PROCEDURE prevent_audit_log_modify()`,

      // payment_ledger_audit (append-only for compliance — Phase 1)
      `CREATE TABLE IF NOT EXISTS payment_ledger_audit (
        id VARCHAR(255) PRIMARY KEY,
        event_type VARCHAR(100),
        payment_id VARCHAR(255),
        gateway VARCHAR(50),
        job_id VARCHAR(255),
        amount DECIMAL(12,2),
        currency VARCHAR(10),
        status VARCHAR(50),
        bill_no VARCHAR(255),
        transaction_no VARCHAR(255),
        user_id UUID,
        provider_id UUID,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE OR REPLACE FUNCTION prevent_ledger_audit_modify() RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'payment_ledger_audit is append-only: UPDATE and DELETE are not allowed';
      END; $$ LANGUAGE plpgsql`,
      `DROP TRIGGER IF EXISTS payment_ledger_audit_append_only ON payment_ledger_audit`,
      `CREATE TRIGGER payment_ledger_audit_append_only BEFORE UPDATE OR DELETE ON payment_ledger_audit FOR EACH ROW EXECUTE PROCEDURE prevent_ledger_audit_modify()`
    ];

    // Execute queries
    for (const query of setupQueries) {
      await pool.query(query);
      console.log(`✅ Executed: ${query.substring(0, 60)}...`);
    }

    // Phase 2: Seed Module 1 questions (จริยธรรมและความปลอดภัย) 55 ข้อ (ESM: dynamic import)
    try {
      const { default: MODULE1_QUESTIONS } = await import('./seedModule1Questions.js');
      for (const q of MODULE1_QUESTIONS) {
        await pool.query(
          `INSERT INTO questions (id, module, question_text, options, correct_option_id, sort_order)
           VALUES ($1, 1, $2, $3::jsonb, $4, $5) ON CONFLICT (id) DO NOTHING`,
          [q.id, q.question_text, JSON.stringify(q.options), q.correct_option_id, q.sort_order || 0]
        );
      }
      console.log(`✅ Seeded Module 1 questions: ${MODULE1_QUESTIONS.length}`);
    } catch (seedErr) {
      console.warn('⚠️ Seed Module 1 questions skipped:', seedErr.message);
    }

    res.json({
      success: true,
      message: 'Database setup completed!',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Setup error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      hint: 'Check database connection settings'
    });
  }
});

// Test database connection
app.get('/api/admin/test-db', async (req, res) => {
  try {
    // Test 1: Basic connection
    const test1 = await pool.query('SELECT NOW() as time');

    // Test 2: Check tables
    const test2 = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);

    // Test 3: Count users
    const test3 = await pool.query('SELECT COUNT(*) as user_count FROM users');

    res.json({
      status: 'connected',
      time: test1.rows[0].time,
      tables: test2.rows.map(r => r.table_name),
      user_count: parseInt(test3.rows[0].user_count || 0),
      connection: {
        host: process.env.DB_HOST,
        database: process.env.DB_DATABASE,
        user: process.env.DB_USER
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});
// ============ JOB CATEGORIES ROUTES (4 หมวด) ============
// Dynamic Form Schemas
app.get('/api/jobs/forms/:category', (req, res) => {
  const category = req.params.category;

  const formSchemas = {
    maid: {
      category: 'maid',
      name: 'แม่บ้าน',
      fields: [
        { name: 'frequency', type: 'select', label: 'ความถี่', options: ['hourly', 'daily'], required: true },
        { name: 'hours', type: 'number', label: 'จำนวนชั่วโมง', required: true },
        { name: 'rooms', type: 'object', label: 'จำนวนห้อง', required: true }
      ]
    },
    detective: {
      category: 'detective',
      name: 'นักสืบ',
      fields: [
        { name: 'duration_days', type: 'number', label: 'ระยะเวลา (วัน)', required: true },
        { name: 'confidentiality_level', type: 'select', label: 'ระดับความลับ', options: ['standard', 'high', 'maximum'], required: true }
      ]
    },
    logistics: {
      category: 'logistics',
      name: 'ขนส่ง',
      fields: [
        { name: 'vehicle_type', type: 'select', label: 'ประเภทรถ', options: ['motorcycle', 'sedan', 'pickup', 'truck_6wheeler', 'truck_10wheeler', 'truck_18wheeler'], required: true },
        { name: 'distance_km', type: 'number', label: 'ระยะทาง (กม.)', required: true },
        { name: 'weight_kg', type: 'number', label: 'น้ำหนัก (กก.)', required: true }
      ]
    },
    ac_cleaning: {
      category: 'ac_cleaning',
      name: 'ล้างแอร์',
      fields: [
        { name: 'unit_count', type: 'number', label: 'จำนวนเครื่อง', required: true },
        { name: 'service_type', type: 'select', label: 'ประเภทงาน', options: ['regular_clean', 'deep_clean', 'refill_gas', 'repair'], required: true }
      ]
    }
  };

  const schema = formSchemas[category];
  if (!schema) {
    return res.status(400).json({ error: `Invalid category: ${category}` });
  }

  res.json(schema);
});

// Calculate Billing
app.post('/api/jobs/categories/:category/calculate-billing', async (req, res) => {
  try {
    const category = req.params.category;
    const { category_details } = req.body;

    if (!category_details) {
      return res.status(400).json({ error: 'Missing category_details' });
    }

    // Simple billing calculation (ใช้ logic เบื้องต้น)
    let billing = {
      base_amount: 0,
      service_fee_percent: 5,
      service_fee_amount: 0,
      total_amount: 0
    };

    // Calculate based on category
    if (category === 'maid') {
      const hours = category_details.hours || 4;
      billing.base_amount = hours * 200; // 200 บาท/ชม.
      billing.service_fee_percent = 5;
    } else if (category === 'detective') {
      const days = category_details.duration_days || 1;
      billing.base_amount = days * 3000; // 3000 บาท/วัน
      billing.service_fee_percent = 7;
    } else if (category === 'logistics') {
      const distance = category_details.distance_km || 100;
      const rates = {
        motorcycle: 5,
        sedan: 8,
        pickup: 12,
        truck_6wheeler: 20,
        truck_10wheeler: 35,
        truck_18wheeler: 50
      };
      const rate = rates[category_details.vehicle_type] || 10;
      billing.base_amount = distance * rate;
      billing.service_fee_percent = billing.base_amount > 50000 ? 10 : 8;
    } else if (category === 'ac_cleaning') {
      const units = category_details.unit_count || 1;
      billing.base_amount = units * 500;
      billing.service_fee_percent = 6;
    }

    billing.base_amount = round2(billing.base_amount);
    billing.service_fee_amount = round2(billing.base_amount * (billing.service_fee_percent / 100));
    billing.total_amount = round2(billing.base_amount + billing.service_fee_amount);
    const providerNet = round2(billing.total_amount - billing.service_fee_amount);
    // Commission = total - provider_net เพื่อไม่ให้เงินหาย 0.01 บาท (Data Consistency)
    const commission = billing.total_amount - providerNet;

    res.json({
      billing: {
        ...billing,
        base_amount: billing.base_amount,
        service_fee_amount: billing.service_fee_amount,
        total_amount: billing.total_amount
      },
      breakdown: {
        base: billing.base_amount,
        service_fee: billing.service_fee_amount,
        total: billing.total_amount,
        provider_net: providerNet,
        commission
      }
    });
  } catch (error) {
    console.error('Calculate billing error:', error);
    res.status(500).json({ error: 'Failed to calculate billing' });
  }
});

// ตรวจสอบตาราง jobs (สำหรับ debug query/ข้อมูล)
app.get('/api/debug/jobs', async (req, res) => {
  try {
    const countResult = await pool.query('SELECT COUNT(*) AS n FROM jobs');
    const rowCount = parseInt(countResult?.rows?.[0]?.n || 0, 10);
    const sample = await pool.query(
      'SELECT id, created_by, accepted_by, status, created_at FROM jobs ORDER BY created_at DESC LIMIT 5'
    );
    res.json({
      tableExists: true,
      rowCount,
      sample: sample?.rows || [],
      hint: 'GET /api/users/jobs/:userId ใช้ created_by::text = $1 และ accepted_by::text = $1',
    });
  } catch (e) {
    res.status(500).json({ tableExists: false, error: e.message });
  }
});

// ============ START SERVER ============
app.listen(PORT, async () => {
  console.log("=".repeat(70));
  console.log("🚀 MEERAK PRODUCTION BACKEND");
  console.log("=".repeat(70));
  console.log(`📍 Server: http://localhost:${PORT}`);
  console.log(`📁 Storage: Cloudinary (${process.env.CLOUDINARY_CLOUD_NAME})`);
  console.log(`🗄️  Database: PostgreSQL (${process.env.DB_HOST}:${process.env.DB_PORT})`);
  console.log("=".repeat(70));
  console.log("📊 Business Endpoints:");
  console.log("  POST /api/payments/process     - Process payment");
  console.log("  GET  /api/payments/status/:id  - Check payment status");
  console.log("  POST /api/payments/release     - Release payment");
  console.log("  POST /api/kyc/submit           - Submit KYC documents");
  console.log("  GET  /api/kyc/status/:userId   - Check KYC status");
  console.log("  GET  /api/reports/earnings     - Earnings report");
  console.log("  GET  /api/reports/job-stats    - Job statistics");
  console.log("  GET  /api/jobs/forms/:category - Get form schema (NEW)");
  console.log("  POST /api/jobs/categories/:category/calculate-billing - Calculate (NEW)");
  console.log("=".repeat(70));

  // Test database connection
  try {
    await pool.query('SELECT 1');
    console.log("✅ PostgreSQL: Connected");
    // สร้างตาราง jobs ถ้ายังไม่มี (แล้วค่อย ADD COLUMN ด้านล่าง)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id VARCHAR(100) PRIMARY KEY,
        title VARCHAR(255),
        description TEXT,
        category VARCHAR(100),
        price DECIMAL(10,2),
        status VARCHAR(50) DEFAULT 'open',
        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `).catch((e) => console.warn("Jobs table create:", e.message));
    // Migration: ให้ตาราง jobs มี column ครบตามที่ backend ใช้ (รับงาน, สถานะ, payment ฯลฯ)
    const jobsColumns = [
      ['location', 'TEXT'],
      ['location_lat', 'DECIMAL(10,6)'],
      ['location_lng', 'DECIMAL(10,6)'],
      ['datetime', 'TIMESTAMP'],
      ['created_by_name', 'VARCHAR(255)'],
      ['created_by_avatar', 'TEXT'],
      ['client_id', 'UUID'],
      ['updated_at', 'TIMESTAMP DEFAULT NOW()'],
      ['accepted_by', 'VARCHAR(255)'],
      ['accepted_at', 'TIMESTAMP'],
      ['submitted_at', 'TIMESTAMP'],
      ['payment_details', 'JSONB'],
      ['payment_status', 'VARCHAR(50)'],
      ['paid_at', 'TIMESTAMP'],
    ];
    for (const [col, type] of jobsColumns) {
      try {
        await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ${col} ${type}`);
      } catch (e) {
        console.warn(`  jobs.${col}:`, e.message);
      }
    }
    console.log("✅ Jobs table migration: columns ensured");
  } catch (error) {
    console.log("❌ PostgreSQL: Connection failed -", error.message);
  }

  // Test Redis connection
  try {
    await redisClient.ping();
    console.log("✅ Redis: Connected");
  } catch (error) {
    console.log("❌ Redis: Connection failed -", error.message);
  }

  console.log("=".repeat(70));
});