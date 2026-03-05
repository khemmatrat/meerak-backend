-- =================================================================================
-- 086: Social Links — Instagram, Line (สำหรับ Portfolio/Expert)
-- =================================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS instagram_url VARCHAR(255),
  ADD COLUMN IF NOT EXISTS line_id VARCHAR(100);

COMMENT ON COLUMN users.instagram_url IS 'Instagram profile URL หรือ username (สำหรับ Talents)';
COMMENT ON COLUMN users.line_id IS 'Line ID หรือ @username (สำหรับ Talents)';
