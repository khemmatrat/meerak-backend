-- 059: Employer Advance Features
-- - vehicle_reg, vehicle_type สำหรับ Provider (ลดความกังวลผู้จ้างงาน)
-- - employer_saved_talents (บันทึก Talent ไว้จ้างภายหลัง)
-- - employer_blocked_providers (บล็อก Provider ที่ไม่ถูกใจ)

-- 1. เพิ่มคอลัมน์รถใน users (สำหรับ Provider ที่มีรถ)
ALTER TABLE users ADD COLUMN IF NOT EXISTS vehicle_reg VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS vehicle_type VARCHAR(100);
COMMENT ON COLUMN users.vehicle_reg IS 'เลขทะเบียนรถ ตามบัตรประชาชน/ใบขับขี่';
COMMENT ON COLUMN users.vehicle_type IS 'ชนิดของรถ เช่น รถกระบะ, รถมอเตอร์ไซค์';

-- 2. ตาราง employer บันทึก Talent ที่ชอบ (Like/Heart/Save)
CREATE TABLE IF NOT EXISTS employer_saved_talents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  talent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  liked BOOLEAN DEFAULT true,
  saved_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(employer_id, talent_id)
);
CREATE INDEX IF NOT EXISTS idx_employer_saved_employer ON employer_saved_talents(employer_id);
CREATE INDEX IF NOT EXISTS idx_employer_saved_talent ON employer_saved_talents(talent_id);

-- 3. ตาราง employer บล็อก Provider
CREATE TABLE IF NOT EXISTS employer_blocked_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_at TIMESTAMP DEFAULT NOW(),
  reason TEXT,
  UNIQUE(employer_id, provider_id)
);
CREATE INDEX IF NOT EXISTS idx_employer_blocked_employer ON employer_blocked_providers(employer_id);
CREATE INDEX IF NOT EXISTS idx_employer_blocked_provider ON employer_blocked_providers(provider_id);
