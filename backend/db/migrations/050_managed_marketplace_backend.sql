-- =================================================================================
-- 050: Backend support สำหรับ Managed Marketplace
-- Job moderation, Category disable, Wallet freeze (logic ใน server.js)
-- =================================================================================

-- 1. เพิ่ม moderation_status ใน jobs
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(30) DEFAULT 'approved';

-- 2. เพิ่ม moderation_status ใน advance_jobs
ALTER TABLE advance_jobs ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(30) DEFAULT 'approved';
COMMENT ON COLUMN advance_jobs.moderation_status IS 'approved|rejected|suspended|pending — Platform Moderation';

-- 3. เพิ่ม is_disabled ใน insurance_rate_by_category (ปิดหมวดบริการ)
ALTER TABLE insurance_rate_by_category ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN DEFAULT FALSE;
COMMENT ON COLUMN insurance_rate_by_category.is_disabled IS 'ปิดหมวดบริการชั่วคราว — Platform Safety Authority';

-- 4. เพิ่ม wallet_frozen ใน users (ระงับเงิน)
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_frozen BOOLEAN DEFAULT FALSE;
COMMENT ON COLUMN users.wallet_frozen IS 'ระงับการถอน/ใช้เงิน — Platform Safety Authority';
