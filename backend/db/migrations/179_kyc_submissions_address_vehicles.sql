-- 179: KYC — ที่อยู่ผู้สมัคร + ข้อมูลรถ/เล่มทะเบียน (JSON) สำหรับรีวิวแอดมิน / อนุมัติ Driver
-- =============================================================================

ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS vehicles_json JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN kyc_submissions.address IS 'ที่อยู่ตามฟอร์ม KYC (ข้อความ)';
COMMENT ON COLUMN kyc_submissions.vehicles_json IS 'รายการรถจาก Wizard: ทะเบียน ยี่ห้อ รูปเล่ม ฯลฯ (array of objects)';
