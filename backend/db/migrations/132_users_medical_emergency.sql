-- 132: User medical/emergency fields for SOS Digital Identity payload
ALTER TABLE users ADD COLUMN IF NOT EXISTS blood_type VARCHAR(10);
ALTER TABLE users ADD COLUMN IF NOT EXISTS allergies TEXT;
-- emergency_contact already exists (032)
COMMENT ON COLUMN users.blood_type IS 'Blood type for emergency SOS payload';
COMMENT ON COLUMN users.allergies IS 'Known allergies for emergency SOS payload';
