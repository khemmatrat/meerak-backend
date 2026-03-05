// backend/src/billing/billing.service.ts
// Main billing service that orchestrates category-specific billing

import { Pool } from 'pg';
import { JobCategoryType, BaseBilling, BillingCalculationResult } from '../jobs/base/job.types';
import { MaidBillingService } from '../jobs/maid/maid.billing';
import { DetectiveBillingService } from '../jobs/detective/detective.billing';
import { LogisticsBillingService } from '../jobs/logistics/logistics.billing';
import { ACCleaningBillingService } from '../jobs/ac-cleaning/ac-cleaning.billing';

export class BillingService {
  private pool: Pool;
  private maidBilling: MaidBillingService;
  private detectiveBilling: DetectiveBillingService;
  private logisticsBilling: LogisticsBillingService;
  private acCleaningBilling: ACCleaningBillingService;

  constructor(pool: Pool) {
    this.pool = pool;
    this.maidBilling = new MaidBillingService();
    this.detectiveBilling = new DetectiveBillingService();
    this.logisticsBilling = new LogisticsBillingService();
    this.acCleaningBilling = new ACCleaningBillingService();
  }

  /**
   * Calculate billing for a job based on its category
   */
  async calculateBilling(
    categoryType: JobCategoryType,
    categoryDetails: Record<string, any>,
    basePrice?: number
  ): Promise<BillingCalculationResult> {
    let result: BillingCalculationResult;

    switch (categoryType) {
      case 'maid':
        result = this.maidBilling.calculate(categoryDetails, basePrice);
        break;
      case 'detective':
        result = this.detectiveBilling.calculate(categoryDetails, basePrice);
        break;
      case 'logistics':
        result = this.logisticsBilling.calculate(categoryDetails, basePrice);
        break;
      case 'ac_cleaning':
        result = this.acCleaningBilling.calculate(categoryDetails, basePrice);
        break;
      default:
        throw new Error(`Unsupported category type: ${categoryType}`);
    }

    return result;
  }

  /**
   * Create or update billing record in database
   */
  async createBilling(
    jobId: string,
    billing: BaseBilling
  ): Promise<any> {
    const result = await this.pool.query(
      `INSERT INTO job_billings (
        job_id, base_amount, service_fee_percent, service_fee_amount,
        insurance_amount, insurance_coverage, additional_charges,
        subtotal, total_amount, billing_details
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (job_id) 
      DO UPDATE SET
        base_amount = EXCLUDED.base_amount,
        service_fee_percent = EXCLUDED.service_fee_percent,
        service_fee_amount = EXCLUDED.service_fee_amount,
        insurance_amount = EXCLUDED.insurance_amount,
        insurance_coverage = EXCLUDED.insurance_coverage,
        additional_charges = EXCLUDED.additional_charges,
        subtotal = EXCLUDED.subtotal,
        total_amount = EXCLUDED.total_amount,
        billing_details = EXCLUDED.billing_details,
        updated_at = NOW()
      RETURNING *`,
      [
        jobId,
        billing.base_amount,
        billing.service_fee_percent,
        billing.service_fee_amount,
        billing.insurance_amount || 0,
        billing.insurance_coverage || 0,
        JSON.stringify(billing.additional_charges),
        billing.subtotal,
        billing.total_amount,
        JSON.stringify(billing.billing_details)
      ]
    );

    return result.rows[0];
  }

  /**
   * Get billing for a job
   */
  async getBilling(jobId: string): Promise<any> {
    const result = await this.pool.query(
      `SELECT * FROM job_billings WHERE job_id = $1`,
      [jobId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const billing = result.rows[0];
    return {
      ...billing,
      additional_charges: typeof billing.additional_charges === 'string' 
        ? JSON.parse(billing.additional_charges) 
        : billing.additional_charges,
      billing_details: typeof billing.billing_details === 'string'
        ? JSON.parse(billing.billing_details)
        : billing.billing_details
    };
  }
}
