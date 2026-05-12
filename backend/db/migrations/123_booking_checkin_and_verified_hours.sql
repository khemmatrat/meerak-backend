-- =================================================================================
-- 123: Booking Check-in, Session Status, Verified Hours (AQOND)
-- =================================================================================
-- Check-in: 15 min before → QR scan → Start Job (session_status = in_progress)
-- Auto-settlement at end_time; No-show penalty; Verified Hours badge
-- =================================================================================

-- 1. Extend bookings: started_at, session_status
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS session_status VARCHAR(30) DEFAULT 'awaiting_checkin'
  CHECK (session_status IN ('awaiting_checkin', 'in_progress', 'completed', 'no_show'));

-- Relax status constraint to allow in_progress (if exists)
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending', 'confirmed', 'in_progress', 'cancelled', 'completed'));

CREATE INDEX IF NOT EXISTS idx_bookings_started_at ON bookings(started_at) WHERE started_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_session_status ON bookings(session_status);

COMMENT ON COLUMN bookings.started_at IS 'When Employer scanned Talent QR — Job officially started';
COMMENT ON COLUMN bookings.session_status IS 'awaiting_checkin | in_progress | completed | no_show';

-- 2. users.verified_hours — ชั่วโมงงานที่ผ่านระบบ (สำหรับ Working Hours Badge)
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_hours DECIMAL(10,2) DEFAULT 0 CHECK (verified_hours >= 0);
COMMENT ON COLUMN users.verified_hours IS 'AQOND: ชั่วโมงงานที่ผ่านระบบ (Check-in + Release) — สำหรับ Badge พรีเมียม';

-- 3. user_reliability_penalties — No-show penalty log
CREATE TABLE IF NOT EXISTS user_reliability_penalties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  penalty_type VARCHAR(30) NOT NULL DEFAULT 'no_show',
  points_deducted INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reliability_penalties_user ON user_reliability_penalties(user_id);
COMMENT ON TABLE user_reliability_penalties IS 'AQOND: No-show / reliability penalties for search ranking';
