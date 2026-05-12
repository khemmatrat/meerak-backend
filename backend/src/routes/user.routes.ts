// backend/src/routes/user.routes.ts
import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { getPool, getRedis } from '../store';

const router = Router();

// GET /api/users/profile
router.get('/profile', authenticate, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    
    const redisClient = getRedis();
    if (redisClient && 'get' in redisClient) {
      const cachedProfile = await (redisClient as { get: (k: string) => Promise<string | null> }).get(`user:profile:${userId}`);
    if (cachedProfile) {
      return res.json(JSON.parse(cachedProfile));
    }
    }
    
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database unavailable' });
    const profile = await pool.query(`
      SELECT 
        u.*,
        json_agg(DISTINCT s.*) as skills,
        json_agg(DISTINCT k.*) FILTER (WHERE k.verification_status = 'verified') as kyc_docs
      FROM users u
      LEFT JOIN user_skills s ON s.user_id = u.id
      LEFT JOIN kyc_documents k ON k.user_id = u.id
      WHERE u.id = $1
      GROUP BY u.id
    `, [userId]);
    
    // Cache 5 นาที
    const redisCache = getRedis();
    if (redisCache && 'setEx' in redisCache) {
      await (redisCache as { setEx: (k: string, t: number, v: string) => Promise<void> }).setEx(
        `user:profile:${userId}`, 
        300, 
        JSON.stringify(profile)
      );
    }
    
    return res.json(profile.rows[0] || {});
  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
// ✅ เพิ่ม route นี้สำหรับรับ profile โดยใช้ ID (ที่ frontend เรียก)
router.get('/profile/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    
    console.log(`Fetching profile for user: ${userId}`);
    
    // ตัวอย่าง response ชั่วคราว (mock data)
    const mockProfile = {
      id: userId,
      full_name: "ทดสอบ ผู้ใช้งาน",
      email: "test@example.com",
      phone: "0812345678",
      avatar_url: "https://example.com/avatar.jpg",
      kyc_status: "verified",
      skills: [],
      kyc_docs: [],
      created_at: new Date().toISOString()
    };
    
    res.json(mockProfile);
  } catch (error) {
    console.error('Get profile by ID error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ✅ เพิ่ม health check endpoint (ที่ payment scheduler เรียก)
router.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'MEERAK Backend'
  });
});

// ✅ เพิ่ม route สำหรับ user jobs
router.get('/jobs/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    
    console.log(`Fetching jobs for user: ${userId}`);
    
    // ตัวอย่าง mock jobs
    const mockJobs = [
      {
        id: 1,
        title: "งานขับรถส่งของ",
        description: "ส่งพัสดุในเขตกรุงเทพ",
        status: "completed",
        amount: 500,
        created_at: "2024-01-15T10:00:00Z"
      },
      {
        id: 2,
        title: "งานขนย้ายเฟอร์นิเจอร์",
        description: "ขนย้ายจากบางนาไปรังสิต",
        status: "in_progress",
        amount: 1500,
        created_at: "2024-01-16T14:30:00Z"
      }
    ];
    
    return res.json(mockJobs);
  } catch (error) {
    console.error('Get user jobs error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
router.post('/jobs', authenticate, async (req: Request, res: Response) => {
  try {
    console.log('Creating job:', req.body);
    
    // Validate input
    const { title, description, category, price, location } = req.body;
    
    if (!title || !description || !category || !price || !location) {
      return res.status(400).json({ 
        error: 'Missing required fields' 
      });
    }
    
    // ใช้ database จริงจากไฟล์ backend/db/schema_fixed.sql
    const query = `
      INSERT INTO jobs 
      (title, description, category, price, location_lat, location_lng, created_by, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;
    
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database unavailable' });
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const result = await pool.query(query, [
      title,
      description,
      category,
      price,
      location.lat,
      location.lng,
      userId,
      'open'
    ]);
    
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Job creation error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/users/kyc/submit
router.post('/kyc/submit', 
  authenticate,
  [
    body('fullName').notEmpty().trim(),
    body('birthDate').isISO8601(),
    body('idCardNumber').isLength({ min: 13, max: 13 }),
    body('idCardFront').notEmpty(),
    body('selfiePhoto').notEmpty(),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const {
        fullName,
        birthDate,
        idCardNumber,
        idCardFront,
        idCardBack,
        selfiePhoto,
        drivingLicenseFront,
        drivingLicenseBack
      } = req.body;
      
      // Upload images to storage (TODO: implement uploadToStorage)
      const uploadedUrls: string[] = [];
      if (idCardFront) uploadedUrls.push(String(idCardFront));
      if (selfiePhoto) uploadedUrls.push(String(selfiePhoto));
      
      const pool = getPool();
      if (!pool) return res.status(503).json({ error: 'Database unavailable' });
      await pool.query('BEGIN');
      
      // Update user basic info
      await pool.query(`
        UPDATE users 
        SET 
          full_name = $1,
          date_of_birth = $2,
          id_card_number = $3,
          kyc_status = 'pending_review',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
      `, [fullName, birthDate, idCardNumber, userId]);
      
      // Insert KYC documents
      const docQueries = uploadedUrls.map((url: string, index: number) => 
        pool.query(`
          INSERT INTO kyc_documents 
          (user_id, document_type, document_url, verification_status)
          VALUES ($1, $2, $3, 'pending')
        `, [userId, ['id_front', 'selfie'][index], url])
      );
      
      await Promise.all(docQueries);
      await pool.query('COMMIT');
      
      // TODO: Trigger background verification via queue
      const redisDel = getRedis();
      if (redisDel && 'del' in redisDel) {
        await (redisDel as { del: (k: string) => Promise<void> }).del(`user:profile:${userId}`);
      }
      
      return res.json({ 
        success: true, 
        message: 'KYC submitted successfully. Under review.' 
      });
    } catch (error) {
      const p = getPool();
      if (p) await p.query('ROLLBACK');
      console.error('KYC submission error:', error);
      return res.status(500).json({ error: 'Failed to submit KYC' });
    }
  }
);

// GET /api/users/skills
router.get('/skills', authenticate, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database unavailable' });
  const skills = await pool.query(`
    SELECT * FROM user_skills 
    WHERE user_id = $1 
    ORDER BY created_at DESC
  `, [userId]);
  
  return res.json(skills.rows);
});

// POST /api/users/skills
router.post('/skills', 
  authenticate,
  [
    body('skillName').notEmpty().trim(),
    body('category').notEmpty().trim(),
  ],
  async (req: Request, res: Response) => {
    const { skillName, category, certificationId } = req.body;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database unavailable' });
    const skill = await pool.query(`
      INSERT INTO user_skills 
      (user_id, skill_name, skill_category, certification_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [userId, skillName, category, certificationId || null]);
    
    // Clear cache
    const redisCache = getRedis();
    if (redisCache && 'del' in redisCache) {
      const r = redisCache as { del: (k: string) => Promise<void> };
      await r.del(`user:profile:${userId}`);
      await r.del(`user:skills:${userId}`);
    }
    
    return res.json(skill.rows[0]);
  }
);

export default router;