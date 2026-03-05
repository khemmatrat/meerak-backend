// backend/src/routes/job.routes.ts
import { Router } from 'express';
import { authenticate, optionalAuthenticate } from '../middleware/auth';
import { pool } from '../index';
import { getSharedDatabaseService } from '../services/shared-db.service';

const router = Router();
const sharedDb = getSharedDatabaseService();

/**
 * GET /api/jobs/recommended
 * ดึง recommended jobs สำหรับ user
 */
router.get('/recommended', optionalAuthenticate, async (req, res) => {
  try {
    const userId = req.query.userId as string || req.user?.firebase_uid;
    console.log(`🎯 [RECOMMENDED JOBS] For user: ${userId}`);
    
    // ดึงข้อมูลผู้ใช้เพื่อแนะนำงานที่เหมาะสม
    let userSkills: string[] = [];
    if (userId && userId !== 'current') {
      try {
        const user = await sharedDb.getUserById(userId);
        if (user) {
          // ดึง skills จาก user_skills table
          const skillsResult = await pool.query(
            `SELECT skill_category FROM user_skills 
             WHERE user_id = $1`,
            [user.id]
          );
          userSkills = skillsResult.rows.map(row => row.skill_category);
        }
      } catch (userError) {
        console.warn('⚠️ Could not fetch user skills:', userError);
      }
    }
    
    // ดึง open jobs
    const result = await pool.query(`
      SELECT 
        j.*,
        u.full_name as client_name,
        u.avatar_url as client_avatar
      FROM jobs j
      LEFT JOIN users u ON j.created_by::text = u.id::text 
         OR j.created_by = u.firebase_uid
      WHERE j.status = 'open'
      ORDER BY j.created_at DESC
      LIMIT 20
    `);
    
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
    
    // ถ้าไม่มี jobs ใน DB ให้ใช้ mock data
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
    res.json(jobs);
    
  } catch (error) {
    console.error('❌ [RECOMMENDED JOBS] Error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch recommended jobs',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/jobs/all
 * ดึง jobs ทั้งหมด
 */
router.get('/all', optionalAuthenticate, async (req, res) => {
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
         OR j.created_by = u.firebase_uid
      WHERE j.status = 'open'
    `;
    
    const params: any[] = [];
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
        clientName: job.client_name || 'Client',
        clientId: job.client_id
      };
    });
    
    // ถ้าไม่มี jobs
    if (jobs.length === 0) {
      jobs.push({
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
      });
    }
    
    console.log(`📋 [ALL JOBS] Returning ${jobs.length} jobs`);
    res.json(jobs);
    
  } catch (error) {
    console.error('❌ [ALL JOBS] Error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch jobs',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/jobs
 * สร้าง job ใหม่
 */
router.post('/', authenticate, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      title,
      description,
      category,
      price,
      location,
      datetime,
    } = req.body;
    
    console.log('📝 [CREATE JOB] Request body:', req.body);
    
    // Validate required fields
    if (!title || !description || !category || !price) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: title, description, category, price'
      });
    }
    
    // ดึงข้อมูลผู้สร้างงาน
    const user = await sharedDb.getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const clientName = user.full_name || 'Client';
    const clientAvatar = user.avatar_url || '';
    
    // Generate job ID
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Parse location
    let locationData = location || { lat: 13.736717, lng: 100.523186 };
    if (typeof locationData === 'string') {
      locationData = JSON.parse(locationData);
    }
    
    // Insert into database
    const result = await pool.query(
      `INSERT INTO jobs (
        id, title, description, category, price, status,
        location, location_lat, location_lng, datetime, 
        created_by, created_by_name, created_by_avatar, 
        client_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
      RETURNING *`,
      [
        jobId,
        title,
        description,
        category,
        parseFloat(price),
        'open',
        JSON.stringify(locationData),
        locationData.lat,
        locationData.lng,
        datetime || new Date().toISOString(),
        req.user.firebase_uid, // ใช้ firebase_uid
        clientName,
        clientAvatar,
        user.id, // client_id เป็น UUID
        new Date().toISOString(),
        new Date().toISOString()
      ]
    );
    
    const createdJob = result.rows[0];
    
    // Parse JSON fields
    if (createdJob.location && typeof createdJob.location === 'string') {
      createdJob.location = JSON.parse(createdJob.location);
    }
    
    console.log('✅ [CREATE JOB] Job created successfully:', jobId);
    
    res.json({
      success: true,
      message: 'Job created successfully',
      job: {
        ...createdJob,
        clientName: createdJob.created_by_name,
        clientId: createdJob.client_id
      }
    });
    
  } catch (error) {
    console.error('❌ [CREATE JOB] Error:', error);
    
    let errorMessage = 'Failed to create job';
    if (error instanceof Error) {
      if (error.message.includes('23505')) {
        errorMessage = 'Job with this ID already exists';
      } else if (error.message.includes('23503')) {
        errorMessage = 'User not found';
      } else {
        errorMessage = error.message;
      }
    }
    
    res.status(500).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : 'Unknown error') : undefined
    });
  }
});

/**
 * GET /api/jobs/:jobId
 * ดึง job details
 */
router.get('/:jobId', optionalAuthenticate, async (req, res) => {
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
       LEFT JOIN users u1 ON j.client_id = u1.id OR j.created_by = u1.firebase_uid
       LEFT JOIN users u2 ON j.provider_id = u2.id OR j.accepted_by = u2.firebase_uid
       WHERE j.id = $1`,
      [jobId]
    );
    
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const job = jobResult.rows[0];
    
    // Parse location
    if (job.location && typeof job.location === 'string') {
      job.location = JSON.parse(job.location);
    } else if (!job.location && job.location_lat && job.location_lng) {
      job.location = { lat: parseFloat(job.location_lat), lng: parseFloat(job.location_lng) };
    }
    
    console.log(`✅ Found job: ${job.title}`);
    res.json(job);
    
  } catch (error) {
    console.error('❌ Get job error:', error);
    res.status(500).json({
      error: 'Failed to fetch job',
      jobId: req.params.jobId,
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
