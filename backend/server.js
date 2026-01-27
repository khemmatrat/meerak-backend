// ES Module imports
import { createClient } from 'redis';
import { createRequire } from 'module';
import pg from 'pg';
const { Pool } = pg;
import express from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import stream from 'stream';
import cors from 'cors';
import dotenv from 'dotenv';
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
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// แล้วตามด้วย CORS ปกติ
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://meerak-backend.onrender.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));



// ============ CLOUDINARY CONFIG ============
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "your_cloud_name",
  api_key: process.env.CLOUDINARY_API_KEY || "your_api_key",
  api_secret: process.env.CLOUDINARY_API_SECRET || "your_api_secret",
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

// ✅ 2. Upload รูปภาพ (Optimized สำหรับรูป)
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
    const imageBuffer = Buffer.from(base64Data, "base64");

    const result = await uploadToCloudinary(imageBuffer, {
      folder: "images",
      resource_type: "image",
      transformation: [
        { quality: "auto:good" }, // Optimize quality
        { fetch_format: "auto" }  // Auto WebP/AVIF
      ]
    });

    res.json({
      success: true,
      url: result.secure_url,
      optimized_url: result.secure_url.replace("/upload/", "/upload/q_auto,f_auto/"),
      public_id: result.public_id,
      width: result.width,
      height: result.height,
      size: `${(result.bytes / 1024).toFixed(2)}KB`
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
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_DATABASE || 'meera_db',
  user: process.env.DB_USER || 'meera',
  password: process.env.DB_PASSWORD || 'meera123',
});


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
//  redisClient.connect().then(() => console.log('✅ Redis connected'));
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

// Job Model
const JobModel = {
  async findById(id) {
    const result = await pool.query(
      `SELECT j.*, 
         u1.name as client_name,
         u2.name as provider_name
       FROM jobs j
       LEFT JOIN users u1 ON j.created_by = u1.id
       LEFT JOIN users u2 ON j.accepted_by = u2.id
       WHERE j.id = $1`,
      [id]
    );
    return result.rows[0];
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

// ✅ 1. Process Payment
// ✅ 1. Process Payment
app.post('/api/payments/process', async (req, res) => {
  try {
    const { jobId, paymentMethod, discountAmount = 0, userId } = req.body;
    
    console.log('🔒 Processing payment:', { jobId, paymentMethod, discountAmount });

    // ดึงข้อมูล job
    const job = await JobModel.findById(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // ตรวจสอบสถานะ
    if (job.status !== 'waiting_for_payment') {
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

    // คำนวณยอดเงิน
    const finalPrice = Math.max(0, job.price - discountAmount);
    
    // คำนวณค่าคอมมิชชั่น
    const commissionRate = calculateCommission(provider.completed_jobs_count || 0);
    const feeAmount = finalPrice * commissionRate;
    const providerReceive = Math.max(0, finalPrice - feeAmount);

    // เริ่ม transaction - ใช้ชื่อตัวแปรใหม่
    const dbClient = await pool.connect();
    
    try {
      await dbClient.query('BEGIN');

      // 1. อัพเดท job status
      await dbClient.query(
        `UPDATE jobs SET 
          status = 'completed',
          payment_status = 'paid',
          paid_at = NOW(),
          payment_details = $1
         WHERE id = $2`,
        [JSON.stringify({
          amount: finalPrice,
          provider_receive: providerReceive,
          fee_amount: feeAmount,
          fee_percent: commissionRate,
          released_status: 'pending',
          release_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000)
        }), jobId]
      );

      // 2. หักเงิน client (ถ้าใช้ wallet)
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

      // ส่ง response
      res.json({
        success: true,
        message: 'Payment processed successfully',
        data: {
          jobId,
          amount: finalPrice,
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

// ✅ 3. Release Pending Payment
// ✅ 3. Release Pending Payment
app.post('/api/payments/release', async (req, res) => {
  try {
    const { jobId } = req.body;
    
    const job = await JobModel.findById(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const paymentDetails = job.payment_details;
    if (!paymentDetails || paymentDetails.released_status === 'released') {
      return res.status(400).json({ error: 'Payment already released or not ready' });
    }

    const providerReceive = paymentDetails.provider_receive;
    const providerId = job.accepted_by;

    // เริ่ม transaction - ใช้ชื่อตัวแปรใหม่
    const dbClient = await pool.connect();
    
    try {
      await dbClient.query('BEGIN');

      // 1. โอนเงินจาก pending ไป balance
      await dbClient.query(
        `UPDATE users SET 
          wallet_pending = wallet_pending - $1,
          wallet_balance = wallet_balance + $1
         WHERE id = $2`,
        [providerReceive, providerId]
      );

      // 2. อัพเดท job payment details
      await dbClient.query(
        `UPDATE jobs SET 
          payment_details = jsonb_set(
            COALESCE(payment_details, '{}'::jsonb),
            '{released_status}',
            '"released"'
          )
         WHERE id = $1`,
        [jobId]
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
      datetime,
      createdBy
    } = req.body;
    
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

    res.json({
      kycStatus: user.kyc_status || 'not_submitted',
      kycLevel: user.kyc_level || 'level_1',
      submittedAt: user.kyc_submitted_at,
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

// ✅ 3. Update KYC Status (สำหรับ admin)
app.post('/api/kyc/update-status', async (req, res) => {
  try {
    const { submissionId, status, kycLevel, adminNotes } = req.body;

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
      
      // อัพเดท user
      await pool.query(
        `UPDATE users SET 
          kyc_status = $1,
          kyc_level = $2,
          kyc_verified_at = CASE WHEN $1 = 'verified' THEN NOW() ELSE NULL END
         WHERE id = $3`,
        [status, kycLevel, submission.user_id]
      );

      // TODO: Send notification to user

      res.json({
        success: true,
        message: 'KYC status updated',
        submission: result.rows[0]
      });
    } else {
      res.status(404).json({ error: 'Submission not found' });
    }
  } catch (error) {
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
// ✅ 2. GET /api/users/jobs/:userId (ที่ frontend เรียก)
app.get('/api/users/jobs/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log(`📋 Fetching jobs for user: ${userId}`);
    
    // 1. หา user ID จาก firebase_uid ก่อน
    const userResult = await pool.query(
      'SELECT id FROM users WHERE firebase_uid = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      console.log('User not found, returning empty array');
      return res.json([]);
    }
    
    const actualUserId = userResult.rows[0].id;
    console.log(`Found user ID: ${actualUserId}`);
    
    // 2. Query jobs ด้วย user ID (UUID)
    const jobsResult = await pool.query(
      `SELECT j.*, 
         u1.full_name as client_name,
         u2.full_name as provider_name
       FROM jobs j
       LEFT JOIN users u1 ON j.client_id = u1.id
       LEFT JOIN users u2 ON j.provider_id = u2.id
       WHERE j.client_id = $1 OR j.provider_id = $1
       ORDER BY j.created_at DESC`,
      [actualUserId]  // ⬅️ ใช้ UUID ไม่ใช่ firebase_uid
    );
    
    console.log(`Found ${jobsResult.rows.length} jobs`);
    res.json(jobsResult.rows);
    
  } catch (error) {
    console.error('❌ Get user jobs error:', error.message);
    console.error('Error details:', error);
    
    // ส่ง mock data ชั่วคราวถ้า error
    const mockJobs = [
      {
        id: 'mock-001',
        title: "งานทดสอบ",
        description: "รายละเอียดงานทดสอบ",
        status: "completed",
        budget_amount: 500.00,
        created_at: new Date().toISOString()
      }
    ];
    
    res.json(mockJobs);
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

// ✅ Get job details by ID (ต้องมาหลัง /api/jobs/recommended)
app.get('/api/jobs/:jobId', async (req, res) => {
  try {
    const jobId = req.params.jobId;
    console.log(`📋 Fetching job details: ${jobId}`);
    
    const jobResult = await pool.query(
      `SELECT j.*, 
         u1.full_name as client_name,
         u2.full_name as provider_name,
         u1.email as client_email,
         u2.email as provider_email
       FROM jobs j
       LEFT JOIN users u1 ON j.client_id = u1.id
       LEFT JOIN users u2 ON j.provider_id = u2.id
       WHERE j.id = $1`,
      [jobId]
    );
    
    if (jobResult.rows.length === 0) {
      console.log(`Job ${jobId} not found`);
      
      // ส่ง mock data ถ้าไม่พบ
      const mockJob = {
        id: jobId,
        title: `Job ${jobId.substring(0, 8)}`,
        description: "รายละเอียดงาน",
        status: "completed",
        budget_amount: 500.00,
        created_at: new Date().toISOString(),
        error: "Job not found in DB, using mock data"
      };
      
      return res.json(mockJob);
    }
    
    console.log(`✅ Found job: ${jobResult.rows[0].title}`);
    res.json(jobResult.rows[0]);
    
  } catch (error) {
    console.error('❌ Get job error:', error.message);
    
    // Error fallback
    res.status(500).json({
      error: 'Failed to fetch job',
      jobId: req.params.jobId,
      message: error.message
    });
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
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
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

// ✅ 3. Get User's Jobs
app.get('/api/users/jobs/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    
    const result = await pool.query(
      `SELECT * FROM jobs 
       WHERE created_by = $1 OR accepted_by = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    );
    
    res.json(result.rows);
    
  } catch (error) {
    console.error('Jobs fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

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

// ✅ 1. Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    
    if (!phone || !password) {
      return res.status(400).json({ 
        error: 'Phone and password required' 
      });
    }
    
    console.log(`🔐 Login attempt: ${phone}`);
    
    // ใน production ควรใช้ proper authentication
    // ตัวอย่างนี้ใช้วิธีง่ายๆ สำหรับ development
    
    // 1. ตรวจสอบใน PostgreSQL
    const userResult = await pool.query(
      `SELECT * FROM users 
       WHERE phone = $1 AND password = $2`,
      [phone, password]
    );
    
    if (userResult.rows.length === 0) {
      // ถ้าไม่มีใน PostgreSQL ให้ check Firebase หรือ create new
      console.log('User not found in PostgreSQL, checking Firebase...');
      
      // Fallback: สร้าง mock user สำหรับ development
      const mockUser = {
        id: `user_${Date.now()}`,
        phone: phone,
        name: phone === '0800000001' ? 'Anna Employer' : 'Bob Provider',
        role: phone === '0800000001' ? 'user' : 'provider',
        email: `${phone}@meerak.app`,
        kyc_level: 'level_2',
        wallet_balance: phone === '0800000001' ? 50000 : 100,
        avatar_url: phone === '0800000001' 
          ? 'https://i.pravatar.cc/150?u=anna' 
          : 'https://i.pravatar.cc/150?u=bob',
        created_at: new Date().toISOString()
      };
      
      // บันทึกลง PostgreSQL
      await pool.query(
        `INSERT INTO users (id, phone, name, role, email, kyc_level, wallet_balance, avatar_url, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          mockUser.id, mockUser.phone, mockUser.name, mockUser.role,
          mockUser.email, mockUser.kyc_level, mockUser.wallet_balance,
          mockUser.avatar_url, mockUser.created_at
        ]
      );
      
      const token = `jwt_${mockUser.id}_${Date.now()}`;
      
      res.json({
        success: true,
        token: token,
        user: mockUser,
        source: 'created_new'
      });
      
      return;
    }
    
    const user = userResult.rows[0];
    
    // 2. Generate JWT token (simplified)
    const token = `jwt_${user.id}_${Date.now()}`;
    
    // 3. อัพเดท last login
    await pool.query(
      `UPDATE users SET last_login = NOW() WHERE id = $1`,
      [user.id]
    );
    
    res.json({
      success: true,
      token: token,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        name: user.name,
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
app.get('/api/jobs', async (req, res) => {
  try {
    const { category, search, limit = 50 } = req.query;
    
    let query = `SELECT * FROM jobs WHERE status = 'open'`;
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
    
    // Add mock data if no results (for development)
    if (result.rows.length === 0) {
      const mockJobs = [
        {
          id: 'job1',
          title: 'Delivery Service',
          description: 'Need to deliver documents',
          category: 'Delivery',
          price: 500,
          status: 'open',
          created_by: 'client1',
          created_at: new Date().toISOString()
        },
        {
          id: 'job2',
          title: 'Home Cleaning',
          description: 'Deep cleaning for apartment',
          category: 'Cleaning',
          price: 1200,
          status: 'open',
          created_by: 'client2',
          created_at: new Date().toISOString()
        }
      ];
      
      return res.json(mockJobs);
    }
    
    res.json(result.rows);
    
  } catch (error) {
    console.error('Jobs fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// ✅ 2. Get Job by ID
app.get('/api/jobs/:id', async (req, res) => {
  try {
    const jobId = req.params.id;
    
    const result = await pool.query(
      `SELECT j.*, 
         u1.name as client_name,
         u2.name as provider_name
       FROM jobs j
       LEFT JOIN users u1 ON j.created_by = u1.id
       LEFT JOIN users u2 ON j.accepted_by = u2.id
       WHERE j.id = $1`,
      [jobId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error('Job fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch job' });
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
    
    // ดึงข้อมูล job และ user
    const [jobResult, userResult] = await Promise.all([
      pool.query('SELECT * FROM jobs WHERE id = $1', [jobId]),
      pool.query('SELECT * FROM users WHERE id = $1', [userId])
    ]);
    
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const job = jobResult.rows[0];
    const user = userResult.rows[0];
    
    if (job.status !== 'open') {
      return res.status(400).json({ error: 'Job is not available' });
    }
    
    // อัพเดท job
    const updateResult = await pool.query(
      `UPDATE jobs SET 
        status = 'accepted',
        accepted_by = $1,
        accepted_at = NOW(),
        updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [userId, jobId]
    );
    
    res.json({
      success: true,
      job: updateResult.rows[0],
      provider: {
        id: user.id,
        name: user.name,
        phone: user.phone
      },
      message: 'Job accepted successfully'
    });
    
  } catch (error) {
    console.error('Job accept error:', error);
    res.status(500).json({ error: 'Failed to accept job' });
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
        kyc_level VARCHAR(50) DEFAULT 'level_1',
        kyc_status VARCHAR(50) DEFAULT 'not_submitted',
        wallet_balance DECIMAL(10,2) DEFAULT 0,
        wallet_pending DECIMAL(10,2) DEFAULT 0,
        avatar_url TEXT,
        skills TEXT,
        location TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      
      // 2. Add demo user (ถ้ายังไม่มี)
      `INSERT INTO users (firebase_uid, email, phone, full_name, role, kyc_level, wallet_balance) 
       VALUES ('demo-anna-id', 'anna@meerak.app', '0800000001', 'Anna Employer', 'user', 'level_2', 50000)
       ON CONFLICT DO NOTHING`,
       
      // 3. Jobs table (แบบง่ายๆ ก่อน)
      `CREATE TABLE IF NOT EXISTS jobs (
        id VARCHAR(100) PRIMARY KEY,
        title VARCHAR(255),
        description TEXT,
        category VARCHAR(100),
        price DECIMAL(10,2),
        status VARCHAR(50) DEFAULT 'open',
        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      
      // 4. Add sample job
      `INSERT INTO jobs (id, title, description, category, price, created_by)
       VALUES ('job-001', 'Delivery Service', 'Need to deliver documents', 'Delivery', 500, 'demo-anna-id')
       ON CONFLICT DO NOTHING`
    ];
    
    // Execute queries
    for (const query of setupQueries) {
      await pool.query(query);
      console.log(`✅ Executed: ${query.substring(0, 60)}...`);
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
  console.log("=".repeat(70));
  
  // Test database connection
  try {
    await pool.query('SELECT 1');
    console.log("✅ PostgreSQL: Connected");
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