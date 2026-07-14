-- 204: kyc_submissions — เติมคอลัมน์หลัก + URL เอกสารให้ตรงกับ INSERT /api/kyc/submit
-- แก้ PostgreSQL 42703 เมื่อ DB เดิมมีตารางย่อย (ไม่มี id_card_front_url ฯลฯ)
-- ใช้ IF NOT EXISTS เพื่อไม่กระทบ DB ที่สร้างครบจาก schema_fixed แล้ว

ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);
ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS id_card_number VARCHAR(13);

ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS id_card_front_url TEXT;
ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS id_card_back_url TEXT;
ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS selfie_photo_url TEXT;
ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS driving_license_front_url TEXT;
ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS driving_license_back_url TEXT;
ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS selfie_video_url TEXT;

ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending_review';
ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;
