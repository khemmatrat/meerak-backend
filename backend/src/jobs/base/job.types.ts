// backend/src/jobs/base/job.types.ts
// Base types for all job categories

export type JobCategoryType = 'maid' | 'detective' | 'logistics' | 'ac_cleaning';

export interface BaseJob {
  id: string;
  title: string;
  description: string;
  category: string;
  category_type: JobCategoryType;
  category_details: Record<string, any>;
  price: number;
  status: 'open' | 'accepted' | 'in_progress' | 'completed' | 'cancelled' | 'waiting_for_payment';
  payment_status: 'unpaid' | 'paid' | 'refunded';
  created_by: string;
  created_by_name: string;
  created_by_avatar: string;
  client_id: string | null;
  location: {
    lat: number;
    lng: number;
    address?: string;
  };
  datetime: string;
  created_at: string;
  updated_at: string;
}

export interface BaseJobCreateRequest {
  title: string;
  description: string;
  category_type: JobCategoryType;
  category_details: Record<string, any>;
  location: {
    lat: number;
    lng: number;
    address?: string;
  };
  datetime?: string;
}

export interface BaseBilling {
  base_amount: number;
  service_fee_percent: number; // 5-10%
  service_fee_amount: number;
  insurance_amount: number;
  insurance_coverage?: number;
  additional_charges: Record<string, number>;
  subtotal: number;
  total_amount: number;
  billing_details: Record<string, any>;
}

export interface BillingCalculationResult {
  billing: BaseBilling;
  breakdown: {
    base: number;
    additional: Record<string, number>;
    subtotal: number;
    service_fee: number;
    insurance: number;
    total: number;
  };
}
