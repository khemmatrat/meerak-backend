-- KYC: admin "สั่งกรอกใหม่" — เก็บคำแนะนำ / กำหนดส่ง / รายการขั้นตอน
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_admin_instruction TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_resubmission_deadline TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_required_steps JSONB DEFAULT '[]'::jsonb;

-- รองรับสถานะยาว เช่น resubmission_required
ALTER TABLE users ALTER COLUMN kyc_status TYPE VARCHAR(50);
