-- 219: Beauty booking disputes — customer opens, admin resolves, escrow held

CREATE TABLE IF NOT EXISTS booking_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  opened_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'rejected')),
  resolution VARCHAR(40),
  resolution_note TEXT,
  refund_amount NUMERIC(12, 2),
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_booking_disputes_booking ON booking_disputes(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_disputes_status ON booking_disputes(status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_disputes_one_open
  ON booking_disputes(booking_id) WHERE status = 'open';

COMMENT ON TABLE booking_disputes IS 'Beauty booking disputes — blocks payout until admin resolves';
