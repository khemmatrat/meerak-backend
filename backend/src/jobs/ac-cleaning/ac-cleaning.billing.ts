// backend/src/jobs/ac-cleaning/ac-cleaning.billing.ts
// Billing calculation for AC Cleaning

import { ACCleaningJobDetails, ACCleaningBillingCalculation, SERVICE_RATES } from './ac-cleaning.types';
import { BillingCalculationResult } from '../base/job.types';

export class ACCleaningBillingService {
  private readonly LADDER_FEE = 200; // ค่าบริการใช้บันได
  private readonly FLOOR_FEE_PER_FLOOR = 50; // ค่าบริการต่อชั้น
  private readonly SERVICE_FEE_PERCENT = 6; // 6%

  calculate(
    details: ACCleaningJobDetails,
    basePrice?: number
  ): BillingCalculationResult {
    // Calculate base amount from AC units
    let baseAmount = 0;

    if (basePrice) {
      baseAmount = basePrice;
    } else {
      for (const unit of details.ac_units) {
        const serviceRate = SERVICE_RATES[unit.service_type];
        const unitPrice = serviceRate.base_price + (unit.btu * serviceRate.btu_multiplier);
        baseAmount += unitPrice;
      }
    }

    // Ladder fee
    const ladderFee = details.requires_ladder ? this.LADDER_FEE : 0;

    // Floor fee
    const floorFee = details.floor && details.floor > 1
      ? (details.floor - 1) * this.FLOOR_FEE_PER_FLOOR
      : 0;

    // Calculate subtotal
    const subtotal = baseAmount + ladderFee + floorFee;

    // Calculate service fee (6%)
    const serviceFeeAmount = subtotal * (this.SERVICE_FEE_PERCENT / 100);

    // Total amount
    const totalAmount = subtotal + serviceFeeAmount;

    const billing: ACCleaningBillingCalculation = {
      base_amount: baseAmount,
      ladder_fee: ladderFee,
      floor_fee: floorFee,
      subtotal: subtotal,
      service_fee_percent: this.SERVICE_FEE_PERCENT,
      service_fee_amount: serviceFeeAmount,
      total_amount: totalAmount
    };

    return {
      billing: {
        base_amount: baseAmount,
        service_fee_percent: this.SERVICE_FEE_PERCENT,
        service_fee_amount: serviceFeeAmount,
        insurance_amount: 0,
        additional_charges: {
          ladder: ladderFee,
          floor: floorFee
        },
        subtotal: subtotal,
        total_amount: totalAmount,
        billing_details: {
          unit_count: details.unit_count,
          ac_units: details.ac_units,
          requires_ladder: details.requires_ladder,
          floor: details.floor
        }
      },
      breakdown: {
        base: baseAmount,
        additional: {
          ladder: ladderFee,
          floor: floorFee
        },
        subtotal: subtotal,
        service_fee: serviceFeeAmount,
        insurance: 0,
        total: totalAmount
      }
    };
  }
}
