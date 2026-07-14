-- 220: KYC รถสาธารณะ (ป้ายเหลือง) + admin skill toggle

ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS wants_public_transport BOOLEAN DEFAULT FALSE;
ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS yellow_plate_photo_url TEXT;
ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS public_transport_license_front_url TEXT;
ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS public_transport_license_back_url TEXT;
ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS driver_license_number VARCHAR(32);
ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS driver_license_type VARCHAR(32);
ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS driver_license_class JSONB;

ALTER TABLE user_skills ADD COLUMN IF NOT EXISTS admin_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE user_skills ADD COLUMN IF NOT EXISTS admin_disabled_reason TEXT;
ALTER TABLE user_skills ADD COLUMN IF NOT EXISTS admin_disabled_at TIMESTAMP;
ALTER TABLE user_skills ADD COLUMN IF NOT EXISTS admin_disabled_by VARCHAR(64);
