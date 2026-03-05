// backend/src/jobs/logistics/logistics.billing.ts
// Billing calculation for Logistics (Complex - High GP)

import { LogisticsJobDetails, LogisticsBillingCalculation, VEHICLE_RATES, VehicleType } from './logistics.types';
import { BillingCalculationResult } from '../base/job.types';

export class LogisticsBillingService {
  private readonly MULTI_DROP_FEE_PER_STOP = 200; // ค่าบริการต่อจุดส่ง
  private readonly FRAGILE_FEE = 500; // ค่าบริการสินค้าเปราะบาง
  private readonly INSURANCE_RATE_PERCENT = 0.5; // 0.5% ของมูลค่าสินค้า
  private readonly SERVICE_FEE_PERCENT = 8; // 8-10% (สูงสุดเพราะมูลค่าสูง)

  calculate(
    details: LogisticsJobDetails,
    basePrice?: number
  ): BillingCalculationResult {
    const vehicleRate = VEHICLE_RATES[details.vehicle_type];

    // Calculate base amount
    let baseAmount = 0;

    if (basePrice) {
      baseAmount = basePrice;
    } else {
      // Base calculation: distance × rate × weight_multiplier
      const distanceRate = vehicleRate.rate_per_km * details.distance_km;
      
      // Weight multiplier (น้ำหนักมาก = ราคาสูง)
      const weightMultiplier = details.weight_kg > vehicleRate.max_weight_kg 
        ? 1.5 // ถ้าน้ำหนักเกิน = เพิ่ม 50%
        : 1 + (details.weight_kg / vehicleRate.max_weight_kg) * 0.5; // 0.5-1.5x

      baseAmount = (distanceRate + vehicleRate.base_fee) * weightMultiplier;
    }

    // Multi-drop fee
    const multiDropCount = details.delivery_locations.length - 1; // ลบจุดแรก (pickup)
    const multiDropFee = details.multi_drop && multiDropCount > 0
      ? multiDropCount * this.MULTI_DROP_FEE_PER_STOP
      : 0;

    // Fragile fee
    const fragileFee = details.fragile ? this.FRAGILE_FEE : 0;

    // Insurance (ประกันสินค้า)
    let insuranceAmount = 0;
    let insuranceCoverage = 0;

    if (details.requires_insurance && details.insurance_coverage) {
      insuranceCoverage = details.insurance_coverage;
      insuranceAmount = insuranceCoverage * (this.INSURANCE_RATE_PERCENT / 100);
    }

    // Calculate subtotal
    const subtotal = baseAmount + multiDropFee + fragileFee;

    // Service fee (8-10% - สูงสุดเพราะมูลค่าสูง)
    // ยิ่งมูลค่าสูง = service fee สูงขึ้น
    let serviceFeePercent = this.SERVICE_FEE_PERCENT;
    if (subtotal > 50000) {
      serviceFeePercent = 10; // 10% สำหรับงานมูลค่าสูง
    } else if (subtotal > 20000) {
      serviceFeePercent = 9; // 9% สำหรับงานมูลค่ากลาง
    }

    const serviceFeeAmount = subtotal * (serviceFeePercent / 100);

    // Total amount (รวมประกันสินค้า)
    const totalAmount = subtotal + serviceFeeAmount + insuranceAmount;

    const billing: LogisticsBillingCalculation = {
      base_amount: baseAmount,
      multi_drop_fee: multiDropFee,
      fragile_fee: fragileFee,
      subtotal: subtotal,
      insurance_amount: insuranceAmount,
      service_fee_percent: serviceFeePercent,
      service_fee_amount: serviceFeeAmount,
      total_amount: totalAmount
    };

    return {
      billing: {
        base_amount: baseAmount,
        service_fee_percent: serviceFeePercent,
        service_fee_amount: serviceFeeAmount,
        insurance_amount: insuranceAmount,
        insurance_coverage: insuranceCoverage,
        additional_charges: {
          multi_drop: multiDropFee,
          fragile: fragileFee
        },
        subtotal: subtotal,
        total_amount: totalAmount,
        billing_details: {
          vehicle_type: details.vehicle_type,
          distance_km: details.distance_km,
          weight_kg: details.weight_kg,
          multi_drop_count: multiDropCount,
          fragile: details.fragile,
          insurance_coverage: insuranceCoverage
        }
      },
      breakdown: {
        base: baseAmount,
        additional: {
          multi_drop: multiDropFee,
          fragile: fragileFee
        },
        subtotal: subtotal,
        service_fee: serviceFeeAmount,
        insurance: insuranceAmount,
        total: totalAmount
      }
    };
  }
}
