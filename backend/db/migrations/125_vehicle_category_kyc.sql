-- 125: Add vehicle_brand and vehicle_category for KYC (Car Classification)
-- SECURITY: vehicle_category is computed server-side only (never trust client-supplied value)

ALTER TABLE users ADD COLUMN IF NOT EXISTS vehicle_brand VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS vehicle_category VARCHAR(20);

COMMENT ON COLUMN users.vehicle_brand IS 'ยี่ห้อรถจากเล่มทะเบียน (OCR)';
COMMENT ON COLUMN users.vehicle_category IS 'standard|premium — computed server-side from vehicle_brand';
