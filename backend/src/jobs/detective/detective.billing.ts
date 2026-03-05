// backend/src/jobs/detective/detective.billing.ts
// Billing calculation for Private Detective

import { DetectiveJobDetails, DetectiveBillingCalculation } from './detective.types';
import { BillingCalculationResult } from '../base/job.types';

export class DetectiveBillingService {
  // Base rates
  private readonly DAILY_RATE = 3000; // ค่าจ้างรายวัน
  private readonly CONFIDENTIALITY_MULTIPLIER = {
    standard: 1.0,
    high: 1.5,
    maximum: 2.0
  };
  private readonly SERVICE_FEE_PERCENT = 7; // 7% (สูงกว่าแม่บ้านเพราะความเสี่ยงสูง)

  calculate(
    details: DetectiveJobDetails,
    basePrice?: number
  ): BillingCalculationResult {
    // Base fee (ค่าจ้าง)
    let baseFee = this.DAILY_RATE * details.duration_days;
    
    // Apply confidentiality multiplier
    const multiplier = this.CONFIDENTIALITY_MULTIPLIER[details.confidentiality_level];
    baseFee *= multiplier;

    // Use provided base price if available
    if (basePrice) {
      baseFee = basePrice;
    }

    // Additional expenses (ค่าใช้จ่ายตามจริง)
    // These should come from the request, but we'll set defaults
    const travelExpenses = (details as any).travel_expenses || 0;
    const accommodation = (details as any).accommodation || 0;
    const otherExpenses = (details as any).other_expenses || 0;

    const additionalCharges = {
      travel: travelExpenses,
      accommodation: accommodation,
      other: otherExpenses
    };

    // Calculate subtotal
    const subtotal = baseFee + travelExpenses + accommodation + otherExpenses;

    // Calculate service fee (7%)
    const serviceFeeAmount = subtotal * (this.SERVICE_FEE_PERCENT / 100);

    // Total amount
    const totalAmount = subtotal + serviceFeeAmount;

    const billing: DetectiveBillingCalculation = {
      base_fee: baseFee,
      travel_expenses: travelExpenses,
      accommodation: accommodation,
      other_expenses: otherExpenses,
      subtotal: subtotal,
      service_fee_percent: this.SERVICE_FEE_PERCENT,
      service_fee_amount: serviceFeeAmount,
      total_amount: totalAmount
    };

    return {
      billing: {
        base_amount: baseFee,
        service_fee_percent: this.SERVICE_FEE_PERCENT,
        service_fee_amount: serviceFeeAmount,
        insurance_amount: 0,
        additional_charges: additionalCharges,
        subtotal: subtotal,
        total_amount: totalAmount,
        billing_details: {
          duration_days: details.duration_days,
          confidentiality_level: details.confidentiality_level,
          base_fee: baseFee,
          expenses_breakdown: additionalCharges
        }
      },
      breakdown: {
        base: baseFee,
        additional: additionalCharges,
        subtotal: subtotal,
        service_fee: serviceFeeAmount,
        insurance: 0,
        total: totalAmount
      }
    };
  }
}
