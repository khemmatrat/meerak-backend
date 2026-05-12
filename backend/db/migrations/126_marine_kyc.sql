-- 126: Marine KYC — Skipper License & Boat Registration
-- SECURITY: boat_category is computed server-side only (never trust client-supplied value)
-- PDPA: No sensitive data in localStorage; images via secure Blob/S3

ALTER TABLE users ADD COLUMN IF NOT EXISTS skipper_license_photo_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS skipper_license_number VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS skipper_license_expiry DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS boat_registration_photo_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS boat_registration_number VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS boat_brand VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS boat_category VARCHAR(20);

COMMENT ON COLUMN users.skipper_license_photo_url IS 'ใบอนุญาตขับขี่เรือ (secure URL)';
COMMENT ON COLUMN users.boat_registration_photo_url IS 'ทะเบียนเรือ/ใบอนุญาตใช้เรือ (secure URL)';
COMMENT ON COLUMN users.boat_category IS 'standard|premium — computed server-side from boat_brand (Yacht, Catamaran, Speedboat, Luxury)';
