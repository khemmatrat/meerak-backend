-- 133: Ensure emergency_contact exists (referenced in 032 but may not have been added)
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact VARCHAR(50);
COMMENT ON COLUMN users.emergency_contact IS 'Emergency contact phone for SOS';
