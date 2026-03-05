// backend/src/jobs/detective/detective.types.ts
// Types for Private Detective category

export interface DetectiveJobDetails {
  duration_days: number;
  confidentiality_level: 'standard' | 'high' | 'maximum';
  investigation_type: string;
  locations: string[];
  required_documents?: string[];
  special_instructions?: string;
}

export interface DetectiveBillingDetails {
  duration_days: number;
  base_fee: number; // ค่าจ้าง
  travel_expenses: number; // ค่าเดินทาง
  accommodation: number; // ค่าที่พัก
  other_expenses: number; // ค่าใช้จ่ายอื่นๆ
  expenses_breakdown?: {
    travel: number;
    accommodation: number;
    meals: number;
    equipment: number;
    other: number;
  };
}

export interface DetectiveBillingCalculation {
  base_fee: number;
  travel_expenses: number;
  accommodation: number;
  other_expenses: number;
  subtotal: number; // base + all expenses
  service_fee_percent: number;
  service_fee_amount: number;
  total_amount: number;
}
