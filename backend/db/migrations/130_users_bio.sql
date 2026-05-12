-- 130: Add bio column for user profile (Settings Edit)
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
COMMENT ON COLUMN users.bio IS 'User bio/description from Profile Edit';
