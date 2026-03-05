// backend/src/jobs/maid/maid.billing.ts
// Billing calculation for Maid Service

import { MaidJobDetails, MaidBillingCalculation } from './maid.types';
import { BillingCalculationResult } from '../base/job.types';

export class MaidBillingService {
  // Base rates
  private readonly HOURLY_RATE = 200; // บาท/ชั่วโมง
  private readonly DAILY_RATE = 1200; // บาท/วัน
  private readonly ROOM_RATE = {
    bedroom: 50,
    bathroom: 30,
    living_room: 40,
    kitchen: 25
  };
  private readonly EQUIPMENT_FEE = 100; // ถ้าไม่มีอุปกรณ์มาเอง
  private readonly SERVICE_FEE_PERCENT = 5; // 5%

  calculate(
    details: MaidJobDetails,
    basePrice?: number
  ): BillingCalculationResult {
    // Calculate base amount
    let baseAmount = 0;

    if (details.frequency === 'hourly') {
      const hours = details.hours || 1;
      baseAmount = this.HOURLY_RATE * hours;
    } else {
      const days = details.days || 1;
      baseAmount = this.DAILY_RATE * days;
    }

    // Add room charges
    const roomCharges = 
      (details.rooms.bedroom * this.ROOM_RATE.bedroom) +
      (details.rooms.bathroom * this.ROOM_RATE.bathroom) +
      (details.rooms.living_room * this.ROOM_RATE.living_room) +
      (details.rooms.kitchen ? this.ROOM_RATE.kitchen : 0);

    baseAmount += roomCharges;

    // Equipment fee
    const equipmentFee = details.equipment_provided ? 0 : this.EQUIPMENT_FEE;

    // Use provided base price if available
    if (basePrice) {
      baseAmount = basePrice;
    }

    // Calculate subtotal
    const subtotal = baseAmount + equipmentFee;

    // Calculate service fee (5%)
    const serviceFeeAmount = subtotal * (this.SERVICE_FEE_PERCENT / 100);

    // Total amount
    const totalAmount = subtotal + serviceFeeAmount;

    const billing: MaidBillingCalculation = {
      base_amount: baseAmount,
      room_count: details.rooms.bedroom + details.rooms.bathroom + details.rooms.living_room + (details.rooms.kitchen ? 1 : 0),
      equipment_fee: equipmentFee,
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
          equipment: equipmentFee,
          rooms: roomCharges
        },
        subtotal: subtotal,
        total_amount: totalAmount,
        billing_details: {
          frequency: details.frequency,
          hours: details.hours,
          days: details.days,
          rooms: details.rooms,
          equipment_provided: details.equipment_provided
        }
      },
      breakdown: {
        base: baseAmount,
        additional: {
          equipment: equipmentFee,
          rooms: roomCharges
        },
        subtotal: subtotal,
        service_fee: serviceFeeAmount,
        insurance: 0,
        total: totalAmount
      }
    };
  }
}
