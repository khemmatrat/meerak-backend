// backend/src/jobs/logistics/logistics.types.ts
// Types for Logistics category

export type VehicleType = 
  | 'motorcycle'
  | 'sedan'
  | 'pickup'
  | 'truck_6wheeler'
  | 'truck_10wheeler'
  | 'truck_18wheeler';

export interface LogisticsJobDetails {
  vehicle_type: VehicleType;
  distance_km: number;
  weight_kg: number;
  pickup_location: {
    lat: number;
    lng: number;
    address: string;
  };
  delivery_locations: Array<{
    lat: number;
    lng: number;
    address: string;
    delivery_proof_image_url?: string;
    delivered_at?: string;
  }>;
  multi_drop: boolean;
  fragile: boolean;
  requires_insurance: boolean;
  insurance_coverage?: number; // มูลค่าสินค้าที่ต้องการประกัน
  special_requirements?: string[];
}

export interface LogisticsBillingDetails {
  vehicle_type: VehicleType;
  distance_km: number;
  weight_kg: number;
  base_rate_per_km: number; // ราคาต่อกิโลเมตรตามประเภทรถ
  weight_multiplier: number; // คูณตามน้ำหนัก
  multi_drop_count: number;
  multi_drop_fee_per_stop: number;
  fragile_fee: number;
  insurance_coverage: number;
  insurance_rate_percent: number; // อัตราประกันสินค้า
}

export interface LogisticsBillingCalculation {
  base_amount: number; // distance × rate × weight_multiplier
  multi_drop_fee: number;
  fragile_fee: number;
  subtotal: number;
  insurance_amount: number; // คิดจาก insurance_coverage
  service_fee_percent: number; // 5-10% (อาจสูงกว่าหมวดอื่น)
  service_fee_amount: number;
  total_amount: number;
}

// Vehicle type definitions with base rates
export const VEHICLE_RATES: Record<VehicleType, {
  rate_per_km: number;
  max_weight_kg: number;
  base_fee: number;
}> = {
  motorcycle: { rate_per_km: 5, max_weight_kg: 50, base_fee: 50 },
  sedan: { rate_per_km: 8, max_weight_kg: 500, base_fee: 100 },
  pickup: { rate_per_km: 12, max_weight_kg: 1500, base_fee: 150 },
  truck_6wheeler: { rate_per_km: 20, max_weight_kg: 10000, base_fee: 500 },
  truck_10wheeler: { rate_per_km: 35, max_weight_kg: 25000, base_fee: 1000 },
  truck_18wheeler: { rate_per_km: 50, max_weight_kg: 40000, base_fee: 2000 }
};
