-- =================================================================================
-- 025: Advance Booking — availability_slots + bookings
-- =================================================================================
-- Talent ตั้งเวลาว่าง → นายจ้างจองและวางมัดจำ (Escrow) ล็อคคิว
-- =================================================================================

-- ช่วงเวลาว่างที่ Talent เปิดให้จอง
CREATE TABLE IF NOT EXISTS availability_slots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT availability_slots_end_after_start CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_availability_slots_user ON availability_slots(user_id);
CREATE INDEX IF NOT EXISTS idx_availability_slots_start ON availability_slots(start_time);

COMMENT ON TABLE availability_slots IS 'ช่วงเวลาว่างที่ Talent เปิดให้จอง (เชฟรับเฉพาะศุกร์-อาทิตย์ ฯลฯ)';

-- การจองคิว (นายจ้างจอง slot ของ Talent)
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slot_id UUID NOT NULL REFERENCES availability_slots(id) ON DELETE CASCADE,
  booker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  talent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  job_id UUID REFERENCES advance_jobs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bookings_slot ON bookings(slot_id);
CREATE INDEX IF NOT EXISTS idx_bookings_booker ON bookings(booker_id);
CREATE INDEX IF NOT EXISTS idx_bookings_talent ON bookings(talent_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);

COMMENT ON TABLE bookings IS 'การจองคิว — booker = นายจ้าง, talent_id = Expert; ต่อยอด Escrow ได้';
