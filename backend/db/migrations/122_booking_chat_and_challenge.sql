-- =================================================================================
-- 122: Booking Chat + Slot Challenge (AQOND Premium)
-- =================================================================================
-- 1. Booking Chat: ห้องแชทระหว่าง booker + talent เมื่อ deposit_status = held
-- 2. Slot Challenges: Challenge Bid on occupied slot (20% min, Match/Compensate)
-- =================================================================================

-- 1. booking_chat_messages — ข้อความแชทต่อการจอง (1 chat per booking)
CREATE TABLE IF NOT EXISTS booking_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_booking_chat_messages_booking ON booking_chat_messages(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_chat_messages_created ON booking_chat_messages(created_at);

COMMENT ON TABLE booking_chat_messages IS 'AQOND: Chat between booker and talent when deposit is held';

-- 2. slot_challenges — การท้าชิง slot ที่ถูกจองแล้ว (Challenge Bid)
CREATE TABLE IF NOT EXISTS slot_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  challenger_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_amount NUMERIC(12,2) NOT NULL,
  challenge_amount NUMERIC(12,2) NOT NULL,
  challenge_fee_status VARCHAR(20) DEFAULT 'pending' CHECK (challenge_fee_status IN ('pending', 'paid', 'refunded')),
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'first_matched', 'first_compensated', 'expired', 'cancelled')),
  first_employer_response_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_slot_challenges_booking ON slot_challenges(booking_id);
CREATE INDEX IF NOT EXISTS idx_slot_challenges_challenger ON slot_challenges(challenger_id);
CREATE INDEX IF NOT EXISTS idx_slot_challenges_status ON slot_challenges(status);

COMMENT ON TABLE slot_challenges IS 'AQOND: User B challenges booked slot; User A can Match or Accept Compensation (30% to A)';
