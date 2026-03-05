// backend/src/jobs/base/job.service.ts
// Base job service with category-specific handling

import { Pool } from 'pg';
import { JobCategoryType, BaseJob, BaseJobCreateRequest } from './job.types';
import { BillingService } from '../../billing/billing.service';

export class JobService {
  private pool: Pool;
  private billingService: BillingService;

  constructor(pool: Pool) {
    this.pool = pool;
    this.billingService = new BillingService(pool);
  }

  /**
   * Create a job with category-specific details and billing
   */
  async createJob(
    request: BaseJobCreateRequest,
    userId: string,
    userInfo: { name: string; avatar: string; id: string }
  ): Promise<{ job: any; billing: any }> {
    // Generate job ID
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Calculate billing
    const billingResult = await this.billingService.calculateBilling(
      request.category_type,
      request.category_details
    );

    // Parse location
    const locationLat = request.location.lat || 13.736717;
    const locationLng = request.location.lng || 100.523186;

    // Insert job
    const jobResult = await this.pool.query(
      `INSERT INTO jobs (
        id, title, description, category, category_type, category_details,
        price, status, location, location_lat, location_lng, datetime,
        created_by, created_by_name, created_by_avatar, client_id,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())
      RETURNING *`,
      [
        jobId,
        request.title,
        request.description,
        request.category_type, // Use category_type as category
        request.category_type,
        JSON.stringify(request.category_details),
        billingResult.billing.total_amount, // Use calculated total as price
        'open',
        JSON.stringify(request.location),
        locationLat,
        locationLng,
        request.datetime || new Date().toISOString(),
        userId,
        userInfo.name,
        userInfo.avatar,
        userInfo.id,
        new Date().toISOString(),
        new Date().toISOString()
      ]
    );

    const createdJob = jobResult.rows[0];

    // Create billing record
    const billing = await this.billingService.createBilling(jobId, billingResult.billing);

    return {
      job: {
        ...createdJob,
        category_details: typeof createdJob.category_details === 'string'
          ? JSON.parse(createdJob.category_details)
          : createdJob.category_details,
        location: typeof createdJob.location === 'string'
          ? JSON.parse(createdJob.location)
          : createdJob.location
      },
      billing
    };
  }

  /**
   * Get job with billing
   */
  async getJobWithBilling(jobId: string): Promise<any> {
    const jobResult = await this.pool.query(
      `SELECT * FROM jobs WHERE id = $1`,
      [jobId]
    );

    if (jobResult.rows.length === 0) {
      return null;
    }

    const job = jobResult.rows[0];
    const billing = await this.billingService.getBilling(jobId);

    return {
      ...job,
      category_details: typeof job.category_details === 'string'
        ? JSON.parse(job.category_details)
        : job.category_details,
      location: typeof job.location === 'string'
        ? JSON.parse(job.location)
        : job.location,
      billing
    };
  }
}
