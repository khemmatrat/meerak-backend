-- =================================================================================
-- 121: force_logout_at — สำหรับ Force Logout จริง (invalidate JWT)
-- =================================================================================
-- เมื่อ Admin กด Force Logout จะ set force_logout_at = NOW()
-- JWT validation จะ reject token ที่ issued ก่อน force_logout_at
-- เมื่อ user login ใหม่ จะ clear force_logout_at
-- =================================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS force_logout_at TIMESTAMPTZ;

COMMENT ON COLUMN users.force_logout_at IS 'Admin force logout: tokens issued before this timestamp are invalid';
