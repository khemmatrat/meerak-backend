// backend/src/routes/admin.routes.ts
import { Router } from 'express';
import { authenticateAdmin } from '../middleware/auth';

const router = Router();

// ต้องเป็น Admin เท่านั้น
router.use(authenticateAdmin);

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    // ใช้ Materialized View สำหรับ performance
    const [
      userStats,
      revenueStats,
      jobStats,
      kycStats,
      recentActivities,
      alerts,
      kycQueue
    ] = await Promise.all([
      // User Stats
      db.query(`
        SELECT 
          COUNT(*) as total_users,
          COUNT(CASE WHEN created_at >= CURRENT_DATE THEN 1 END) as new_users_today,
          COUNT(CASE WHEN kyc_status = 'verified' THEN 1 END) as verified_users,
          COUNT(CASE WHEN account_status = 'active' THEN 1 END) as active_users
        FROM users
      `),
      
      // Revenue Stats
      db.query(`
        SELECT 
          COALESCE(SUM(amount), 0) as total_revenue,
          COALESCE(SUM(CASE WHEN created_at >= CURRENT_DATE THEN amount END), 0) as revenue_today,
          COUNT(*) as total_transactions
        FROM transactions 
        WHERE status = 'completed' 
        AND type IN ('commission', 'service_fee')
      `),
      
      // Job Stats
      db.query(`
        SELECT 
          COUNT(*) as total_jobs,
          COUNT(CASE WHEN status = 'open' THEN 1 END) as open_jobs,
          COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_jobs,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_jobs
        FROM jobs
      `),
      
      // KYC Stats
      db.query(`
        SELECT 
          COUNT(*) as total_kyc_submissions,
          COUNT(CASE WHEN kyc_status = 'verified' THEN 1 END) as kyc_approved,
          COUNT(CASE WHEN kyc_status = 'pending_review' THEN 1 END) as kyc_pending,
          COUNT(CASE WHEN kyc_status = 'rejected' THEN 1 END) as kyc_rejected,
          ROUND(
            COUNT(CASE WHEN kyc_status = 'verified' THEN 1 END) * 100.0 / 
            NULLIF(COUNT(*), 0), 2
          ) as kyc_approval_rate
        FROM users
      `),
      
      // Recent Activities
      db.query(`
        SELECT 
          id,
          user_id,
          action_type,
          description,
          status,
          created_at,
          metadata
        FROM admin_activity_logs
        ORDER BY created_at DESC
        LIMIT 10
      `),
      
      // Alerts
      db.query(`
        SELECT 
          id,
          alert_type,
          title,
          message,
          severity,
          created_at
        FROM system_alerts
        WHERE resolved_at IS NULL
        ORDER BY created_at DESC
        LIMIT 5
      `),
      
      // KYC Queue
      db.query(`
        SELECT 
          u.id,
          u.full_name,
          u.email,
          u.created_at as submitted_at,
          json_agg(
            json_build_object(
              'type', kd.document_type,
              'status', kd.verification_status
            )
          ) as documents,
          RANDOM() * 100 as ai_score -- Simulate AI score
        FROM users u
        LEFT JOIN kyc_documents kd ON kd.user_id = u.id
        WHERE u.kyc_status = 'pending_review'
        GROUP BY u.id, u.full_name, u.email, u.created_at
        ORDER BY u.created_at DESC
        LIMIT 20
      `)
    ]);
    
    // Growth Chart Data (Last 30 days)
    const growthData = await db.query(`
      WITH date_series AS (
        SELECT generate_series(
          CURRENT_DATE - INTERVAL '30 days',
          CURRENT_DATE,
          '1 day'::interval
        )::date as date
      )
      SELECT 
        ds.date,
        COUNT(u.id) as new_users,
        COUNT(j.id) as new_jobs,
        COALESCE(SUM(t.amount), 0) as daily_revenue
      FROM date_series ds
      LEFT JOIN users u ON DATE(u.created_at) = ds.date
      LEFT JOIN jobs j ON DATE(j.created_at) = ds.date
      LEFT JOIN transactions t ON DATE(t.created_at) = ds.date 
        AND t.status = 'completed'
      GROUP BY ds.date
      ORDER BY ds.date
    `);
    
    res.json({
      totalUsers: parseInt(userStats.rows[0].total_users),
      newUsersToday: parseInt(userStats.rows[0].new_users_today),
      verifiedUsers: parseInt(userStats.rows[0].verified_users),
      activeUsers: parseInt(userStats.rows[0].active_users),
      
      totalRevenue: parseFloat(revenueStats.rows[0].total_revenue),
      revenueToday: parseFloat(revenueStats.rows[0].revenue_today),
      totalTransactions: parseInt(revenueStats.rows[0].total_transactions),
      
      totalJobs: parseInt(jobStats.rows[0].total_jobs),
      openJobs: parseInt(jobStats.rows[0].open_jobs),
      inProgressJobs: parseInt(jobStats.rows[0].in_progress_jobs),
      completedJobs: parseInt(jobStats.rows[0].completed_jobs),
      
      totalKycSubmissions: parseInt(kycStats.rows[0].total_kyc_submissions),
      kycApproved: parseInt(kycStats.rows[0].kyc_approved),
      kycPending: parseInt(kycStats.rows[0].kyc_pending),
      kycRejected: parseInt(kycStats.rows[0].kyc_rejected),
      kycApprovalRate: parseFloat(kycStats.rows[0].kyc_approval_rate),
      
      recentActivities: recentActivities.rows,
      alerts: alerts.rows,
      kycQueue: kycQueue.rows,
      growthChart: growthData.rows
    });
    
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Failed to fetch admin stats' });
  }
});

// POST /api/admin/kyc/verify
router.post('/kyc/verify', async (req, res) => {
  const { userId, status, reason } = req.body;
  const adminId = req.user.id;
  
  await db.query('BEGIN');
  
  try {
    // Update user KYC status
    await db.query(`
      UPDATE users 
      SET 
        kyc_status = $1,
        kyc_level = CASE WHEN $1 = 'verified' THEN 'level_2' ELSE NULL END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [status, userId]);
    
    // Update documents status
    await db.query(`
      UPDATE kyc_documents 
      SET 
        verification_status = $1,
        verified_by = $2,
        verified_at = CURRENT_TIMESTAMP,
        rejection_reason = $3
      WHERE user_id = $4
    `, [status, adminId, reason, userId]);
    
    // Log activity
    await db.query(`
      INSERT INTO admin_activity_logs 
      (admin_id, user_id, action_type, description)
      VALUES ($1, $2, 'kyc_verification', $3)
    `, [adminId, userId, `KYC ${status} for user ${userId}`]);
    
    await db.query('COMMIT');
    
    // Send notification to user
    await queue.add('send-notification', {
      userId,
      type: 'kyc_update',
      data: { status, reason }
    });
    
    res.json({ success: true, message: `KYC ${status} successfully` });
    
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('KYC verification error:', error);
    res.status(500).json({ error: 'Failed to verify KYC' });
  }
});

// GET /api/admin/users/search
router.get('/users/search', async (req, res) => {
  const { query, page = 1, limit = 20 } = req.query;
  
  const offset = (parseInt(page) - 1) * parseInt(limit);
  
  const users = await db.query(`
    SELECT 
      id,
      email,
      phone,
      full_name,
      kyc_status,
      account_status,
      wallet_balance,
      created_at,
      last_login_at
    FROM users
    WHERE 
      email ILIKE $1 OR
      phone ILIKE $1 OR
      full_name ILIKE $1 OR
      id_card_number ILIKE $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
  `, [`%${query}%`, limit, offset]);
  
  const total = await db.query(`
    SELECT COUNT(*) FROM users
    WHERE 
      email ILIKE $1 OR
      phone ILIKE $1 OR
      full_name ILIKE $1 OR
      id_card_number ILIKE $1
  `, [`%${query}%`]);
  
  res.json({
    users: users.rows,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: parseInt(total.rows[0].count),
      totalPages: Math.ceil(parseInt(total.rows[0].count) / parseInt(limit))
    }
  });
});