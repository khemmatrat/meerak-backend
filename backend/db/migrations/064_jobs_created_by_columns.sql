-- =================================================================================
-- 064: เพิ่มคอลัมน์ created_by, created_by_name, created_by_avatar, accepted_by
-- แก้ปัญหา "column j.created_by does not exist" ใน Recommended Jobs API
-- =================================================================================

-- เพิ่มคอลัมน์ที่ server.js ใช้ (Recommended Jobs, JobModel, etc.)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS created_by_name VARCHAR(255);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS created_by_avatar TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS accepted_by UUID;

-- คอลัมน์ location, price, datetime (บาง endpoint ใช้)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS location JSONB;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS location_lat DECIMAL(10,8);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS location_lng DECIMAL(11,8);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS price DECIMAL(12,2);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS datetime TIMESTAMPTZ;

-- Backfill: ถ้า client_id มีค่าแต่ created_by ว่าง ให้ copy ไป
UPDATE jobs SET created_by = client_id WHERE created_by IS NULL AND client_id IS NOT NULL;

-- Backfill: ถ้า provider_id มีค่าแต่ accepted_by ว่าง ให้ copy ไป
UPDATE jobs SET accepted_by = provider_id WHERE accepted_by IS NULL AND provider_id IS NOT NULL;

-- Backfill: location จาก latitude/longitude
UPDATE jobs SET 
  location_lat = latitude, 
  location_lng = longitude,
  location = jsonb_build_object('lat', latitude::float, 'lng', longitude::float)
WHERE (location_lat IS NULL OR location_lng IS NULL) AND latitude IS NOT NULL AND longitude IS NOT NULL;

-- Backfill: price จาก budget_amount
UPDATE jobs SET price = budget_amount WHERE price IS NULL AND budget_amount IS NOT NULL;

-- Backfill: datetime จาก posted_at
UPDATE jobs SET datetime = posted_at WHERE datetime IS NULL AND posted_at IS NOT NULL;
