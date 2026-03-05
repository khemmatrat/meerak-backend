// backend/src/jobs/ac-cleaning/ac-cleaning.types.ts
// Types for AC Cleaning category

export type ACType = 'split' | 'window' | 'central' | 'portable';
export type ServiceType = 'regular_clean' | 'deep_clean' | 'refill_gas' | 'repair';

export interface ACUnit {
  btu: number;
  type: ACType;
  service_type: ServiceType;
  floor?: number;
  requires_ladder?: boolean;
}

export interface ACCleaningJobDetails {
  unit_count: number;
  ac_units: ACUnit[];
  floor?: number;
  requires_ladder: boolean;
  special_requirements?: string[];
}

export interface ACCleaningBillingDetails {
  unit_count: number;
  ac_units: ACUnit[];
  rates: {
    regular_clean_per_unit: number;
    deep_clean_per_unit: number;
    refill_gas_per_unit: number;
    repair_per_unit: number;
    btu_multiplier: number; // คูณตาม BTU
  };
  ladder_fee?: number;
  floor_fee?: number; // ค่าบริการตามชั้น
}

export interface ACCleaningBillingCalculation {
  base_amount: number; // ราคาตามจำนวนเครื่อง × ประเภทงาน × BTU
  ladder_fee: number;
  floor_fee: number;
  subtotal: number;
  service_fee_percent: number;
  service_fee_amount: number;
  total_amount: number;
}

// Service type rates
export const SERVICE_RATES: Record<ServiceType, {
  base_price: number;
  btu_multiplier: number;
}> = {
  regular_clean: { base_price: 300, btu_multiplier: 0.01 },
  deep_clean: { base_price: 500, btu_multiplier: 0.015 },
  refill_gas: { base_price: 800, btu_multiplier: 0.02 },
  repair: { base_price: 1000, btu_multiplier: 0.025 }
};
