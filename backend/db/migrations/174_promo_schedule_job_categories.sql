-- =================================================================================
-- 174: Promo code validity window (timestamptz) + allowed job categories
-- =================================================================================
-- แบนเนอร์: start_date/end_date = ช่วงแสดงบน Home (เดิม)
-- promo_valid_from / promo_valid_until = ช่วงรับโค้ดและใช้ส่วนลด (เวลาไทยผ่าน ISO)
-- ถ้า promo_valid_* เป็น NULL ใช้ start_date 00:00 / end_date 23:59:59.999 ของเขต +07 (คำนวณฝั่งแอป)
-- allowed_job_categories: NULL หรือ {} = ทุกหมวด; ระบุเช่น {Driver,Cleaning}

ALTER TABLE home_banners
  ADD COLUMN IF NOT EXISTS promo_valid_from TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS promo_valid_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS allowed_job_categories TEXT[];

COMMENT ON COLUMN home_banners.promo_valid_from IS 'เริ่มใช้โค้ดได้ (ถ้า NULL ใช้ start_date 00:00+07)';
COMMENT ON COLUMN home_banners.promo_valid_until IS 'หมดอายุโค้ด (ถ้า NULL ใช้ end_date 23:59:59.999+07)';
COMMENT ON COLUMN home_banners.allowed_job_categories IS 'หมวดงานที่ใช้โค้ดได้ — ว่าง/NULL = ทุกหมวด (ตรงกับ jobs.category)';

ALTER TABLE user_promo_vouchers
  ADD COLUMN IF NOT EXISTS allowed_job_categories TEXT[];

COMMENT ON COLUMN user_promo_vouchers.allowed_job_categories IS 'snapshot จากแบนเนอร์ตอนรับโค้ด';
