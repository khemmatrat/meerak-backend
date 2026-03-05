// backend/src/jobs/maid/maid.types.ts
// Types for Maid Service category

export interface MaidJobDetails {
  frequency: 'hourly' | 'daily';
  hours?: number; // Required if frequency is 'hourly'
  days?: number; // Required if frequency is 'daily'
  rooms: {
    bedroom: number;
    bathroom: number;
    living_room: number;
    kitchen: boolean;
    other?: string[];
  };
  area_sqm?: number;
  equipment_provided: boolean;
  equipment_list?: string[];
  special_requirements?: string[];
}

export interface MaidBillingDetails {
  frequency: 'hourly' | 'daily';
  hours?: number;
  days?: number;
  rooms: {
    bedroom: number;
    bathroom: number;
    living_room: number;
    kitchen: boolean;
  };
  rate_per_hour?: number;
  rate_per_day?: number;
  equipment_fee?: number;
}

export interface MaidBillingCalculation {
  base_amount: number;
  room_count: number;
  equipment_fee: number;
  subtotal: number;
  service_fee_percent: number;
  service_fee_amount: number;
  total_amount: number;
}
