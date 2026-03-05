// backend/src/routes/job-categories.routes.ts
// Routes for category-specific job operations

import { Router } from 'express';
import { authenticate, optionalAuthenticate } from '../middleware/auth';
import { JobService } from '../jobs/base/job.service';
import { BillingService } from '../billing/billing.service';
import { pool } from '../index';
import { JobCategoryType } from '../jobs/base/job.types';
import { MaidValidator } from '../jobs/maid/maid.validator';
import { DetectiveValidator } from '../jobs/detective/detective.validator';
import { LogisticsValidator } from '../jobs/logistics/logistics.validator';
import { ACCleaningValidator } from '../jobs/ac-cleaning/ac-cleaning.validator';

const router = Router();
const jobService = new JobService(pool);
const billingService = new BillingService(pool);

/**
 * GET /api/jobs/forms/:category
 * Get dynamic form schema for a specific category
 */
router.get('/forms/:category', optionalAuthenticate, (req, res) => {
  const category = req.params.category as JobCategoryType;

  const formSchemas = {
    maid: {
      fields: [
        { name: 'frequency', type: 'select', label: 'ความถี่', options: ['hourly', 'daily'], required: true },
        { name: 'hours', type: 'number', label: 'จำนวนชั่วโมง', required: true, condition: { frequency: 'hourly' } },
        { name: 'days', type: 'number', label: 'จำนวนวัน', required: true, condition: { frequency: 'daily' } },
        { name: 'rooms.bedroom', type: 'number', label: 'จำนวนห้องนอน', required: true },
        { name: 'rooms.bathroom', type: 'number', label: 'จำนวนห้องน้ำ', required: true },
        { name: 'rooms.living_room', type: 'number', label: 'จำนวนห้องนั่งเล่น', required: true },
        { name: 'rooms.kitchen', type: 'boolean', label: 'มีห้องครัว', required: true },
        { name: 'area_sqm', type: 'number', label: 'พื้นที่ (ตร.ม.)', required: false },
        { name: 'equipment_provided', type: 'boolean', label: 'มีอุปกรณ์มาเอง', required: true },
        { name: 'equipment_list', type: 'text', label: 'รายการอุปกรณ์', required: false, condition: { equipment_provided: false } },
        { name: 'special_requirements', type: 'textarea', label: 'ความต้องการพิเศษ', required: false }
      ]
    },
    detective: {
      fields: [
        { name: 'duration_days', type: 'number', label: 'ระยะเวลาติดตาม (วัน)', required: true },
        { name: 'confidentiality_level', type: 'select', label: 'ระดับความลับ', options: ['standard', 'high', 'maximum'], required: true },
        { name: 'investigation_type', type: 'text', label: 'ประเภทการสืบสวน', required: true },
        { name: 'locations', type: 'text[]', label: 'สถานที่', required: true },
        { name: 'travel_expenses', type: 'number', label: 'ค่าเดินทาง (บาท)', required: false },
        { name: 'accommodation', type: 'number', label: 'ค่าที่พัก (บาท)', required: false },
        { name: 'other_expenses', type: 'number', label: 'ค่าใช้จ่ายอื่นๆ (บาท)', required: false },
        { name: 'required_documents', type: 'text[]', label: 'เอกสารที่ต้องการ', required: false },
        { name: 'special_instructions', type: 'textarea', label: 'คำแนะนำพิเศษ', required: false }
      ]
    },
    logistics: {
      fields: [
        { name: 'vehicle_type', type: 'select', label: 'ประเภทรถ', options: ['motorcycle', 'sedan', 'pickup', 'truck_6wheeler', 'truck_10wheeler', 'truck_18wheeler'], required: true },
        { name: 'distance_km', type: 'number', label: 'ระยะทาง (กม.)', required: true },
        { name: 'weight_kg', type: 'number', label: 'น้ำหนักสินค้า (กก.)', required: true },
        { name: 'pickup_location', type: 'location', label: 'จุดรับสินค้า', required: true },
        { name: 'delivery_locations', type: 'location[]', label: 'จุดส่งสินค้า', required: true },
        { name: 'multi_drop', type: 'boolean', label: 'ส่งหลายจุด', required: true },
        { name: 'fragile', type: 'boolean', label: 'สินค้าเปราะบาง', required: true },
        { name: 'requires_insurance', type: 'boolean', label: 'ต้องการประกันสินค้า', required: true },
        { name: 'insurance_coverage', type: 'number', label: 'มูลค่าสินค้าที่ต้องการประกัน (บาท)', required: false, condition: { requires_insurance: true } },
        { name: 'special_requirements', type: 'textarea', label: 'ความต้องการพิเศษ', required: false }
      ]
    },
    ac_cleaning: {
      fields: [
        { name: 'unit_count', type: 'number', label: 'จำนวนเครื่อง', required: true },
        { name: 'ac_units', type: 'array', label: 'รายละเอียดเครื่อง', required: true, fields: [
          { name: 'btu', type: 'number', label: 'BTU', required: true },
          { name: 'type', type: 'select', label: 'ประเภทแอร์', options: ['split', 'window', 'central', 'portable'], required: true },
          { name: 'service_type', type: 'select', label: 'ประเภทงาน', options: ['regular_clean', 'deep_clean', 'refill_gas', 'repair'], required: true },
          { name: 'floor', type: 'number', label: 'ชั้น', required: false },
          { name: 'requires_ladder', type: 'boolean', label: 'ต้องใช้บันได', required: false }
        ]},
        { name: 'requires_ladder', type: 'boolean', label: 'ต้องใช้บันได', required: true },
        { name: 'special_requirements', type: 'textarea', label: 'ความต้องการพิเศษ', required: false }
      ]
    }
  };

  const schema = formSchemas[category];
  if (!schema) {
    return res.status(400).json({ error: `Invalid category: ${category}` });
  }

  res.json(schema);
});

/**
 * POST /api/jobs/categories/:category
 * Create a job for a specific category
 */
router.post('/:category', authenticate, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const category = req.params.category as JobCategoryType;
    const { title, description, category_details, location, datetime } = req.body;

    // Validate category
    const validCategories: JobCategoryType[] = ['maid', 'detective', 'logistics', 'ac_cleaning'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ error: `Invalid category. Must be one of: ${validCategories.join(', ')}` });
    }

    // Validate required fields
    if (!title || !description || !category_details) {
      return res.status(400).json({
        error: 'Missing required fields: title, description, category_details'
      });
    }

    // Validate category_details based on category
    let validation;
    switch (category) {
      case 'maid':
        validation = MaidValidator.validate(category_details);
        break;
      case 'detective':
        validation = DetectiveValidator.validate(category_details);
        break;
      case 'logistics':
        validation = LogisticsValidator.validate(category_details);
        break;
      case 'ac_cleaning':
        validation = ACCleaningValidator.validate(category_details);
        break;
      default:
        return res.status(400).json({ error: 'Invalid category' });
    }

    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        errors: validation.errors
      });
    }

    // Get user info
    const userResult = await pool.query(
      `SELECT id, full_name, avatar_url FROM users WHERE firebase_uid = $1 OR id::text = $1 LIMIT 1`,
      [req.user.firebase_uid || req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Create job
    const result = await jobService.createJob(
      {
        title,
        description,
        category_type: category,
        category_details,
        location: location || { lat: 13.736717, lng: 100.523186 },
        datetime
      },
      req.user.firebase_uid || req.user.id,
      {
        name: user.full_name || 'Client',
        avatar: user.avatar_url || '',
        id: user.id
      }
    );

    res.json({
      success: true,
      message: 'Job created successfully',
      job: result.job,
      billing: result.billing
    });

  } catch (error) {
    console.error('❌ Create category job error:', error);
    res.status(500).json({
      error: 'Failed to create job',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/jobs/categories/:category/calculate-billing
 * Calculate billing for a job (before creating)
 */
router.post('/:category/calculate-billing', optionalAuthenticate, async (req, res) => {
  try {
    const category = req.params.category as JobCategoryType;
    const { category_details, base_price } = req.body;

    if (!category_details) {
      return res.status(400).json({ error: 'Missing category_details' });
    }

    const result = await billingService.calculateBilling(category, category_details, base_price);

    res.json(result);

  } catch (error) {
    console.error('❌ Calculate billing error:', error);
    res.status(500).json({
      error: 'Failed to calculate billing',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/jobs/:jobId/billing
 * Get billing details for a job
 */
router.get('/:jobId/billing', optionalAuthenticate, async (req, res) => {
  try {
    const { jobId } = req.params;
    const billing = await billingService.getBilling(jobId);

    if (!billing) {
      return res.status(404).json({ error: 'Billing not found' });
    }

    res.json(billing);

  } catch (error) {
    console.error('❌ Get billing error:', error);
    res.status(500).json({
      error: 'Failed to fetch billing',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
