-- ============= JOB CATEGORIES SCHEMA =============
-- Schema สำหรับรองรับ 4 หมวดงานหลัก

-- 1. เพิ่ม category_type และ category_details ใน jobs table
ALTER TABLE jobs 
  ADD COLUMN IF NOT EXISTS category_type VARCHAR(50) 
    CHECK (category_type IN ('maid', 'detective', 'logistics', 'ac_cleaning'));

ALTER TABLE jobs 
  ADD COLUMN IF NOT EXISTS category_details JSONB;

-- 2. สร้าง job_billings table สำหรับจัดการบิลแยกตามหมวด
CREATE TABLE IF NOT EXISTS job_billings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id VARCHAR(100) REFERENCES jobs(id) ON DELETE CASCADE UNIQUE NOT NULL,
  
  -- Base pricing
  base_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  
  -- Service fee (ค่าประกันผลงาน) 5-10%
  service_fee_percent DECIMAL(5,2) DEFAULT 5.00 CHECK (service_fee_percent >= 0 AND service_fee_percent <= 10),
  service_fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  
  -- Insurance (ประกันสินค้า - สำหรับ Logistics)
  insurance_amount DECIMAL(10,2) DEFAULT 0,
  insurance_coverage DECIMAL(10,2) DEFAULT 0, -- มูลค่าสินค้าที่ประกัน
  
  -- Additional charges (ค่าใช้จ่ายเพิ่มเติม)
  additional_charges JSONB DEFAULT '{}'::jsonb,
  -- Format: {"travel": 500, "accommodation": 1000, "other": 200}
  
  -- Total
  subtotal DECIMAL(10,2) NOT NULL DEFAULT 0, -- base + additional
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0, -- subtotal + service_fee + insurance
  
  -- Billing details (รายละเอียดบิลตามหมวด)
  billing_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Format depends on category:
  -- Maid: {"hours": 4, "rooms": 3, "equipment_provided": true}
  -- Detective: {"duration_days": 7, "travel_expenses": 2000, "accommodation": 1500}
  -- Logistics: {"distance_km": 150, "vehicle_type": "truck_18wheeler", "weight_kg": 5000, "multi_drop_count": 3}
  -- AC Cleaning: {"unit_count": 2, "btu_total": 24000, "service_type": "deep_clean"}
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_job_billings_job_id ON job_billings(job_id);
CREATE INDEX IF NOT EXISTS idx_jobs_category_type ON jobs(category_type);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_job_billings_updated_at ON job_billings;
CREATE TRIGGER update_job_billings_updated_at
BEFORE UPDATE ON job_billings
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============= CATEGORY-SPECIFIC DETAILS STRUCTURE =============

-- Maid Service (category_details JSONB structure)
-- {
--   "frequency": "hourly" | "daily",
--   "hours": number,
--   "rooms": {
--     "bedroom": number,
--     "bathroom": number,
--     "living_room": number,
--     "kitchen": boolean
--   },
--   "area_sqm": number,
--   "equipment_provided": boolean,
--   "special_requirements": string[]
-- }

-- Private Detective (category_details JSONB structure)
-- {
--   "duration_days": number,
--   "confidentiality_level": "standard" | "high" | "maximum",
--   "investigation_type": string,
--   "locations": string[],
--   "required_documents": string[]
-- }

-- Logistics (category_details JSONB structure)
-- {
--   "vehicle_type": "motorcycle" | "sedan" | "pickup" | "truck_6wheeler" | "truck_18wheeler",
--   "distance_km": number,
--   "weight_kg": number,
--   "pickup_location": {lat, lng, address},
--   "delivery_locations": [
--     {lat, lng, address, delivery_proof_image_url}
--   ],
--   "multi_drop": boolean,
--   "fragile": boolean,
--   "requires_insurance": boolean
-- }

-- AC Cleaning (category_details JSONB structure)
-- {
--   "unit_count": number,
--   "ac_units": [
--     {
--       "btu": number,
--       "type": "split" | "window" | "central",
--       "service_type": "regular_clean" | "deep_clean" | "refill_gas" | "repair"
--     }
--   ],
--   "floor": number,
--   "requires_ladder": boolean
-- }
