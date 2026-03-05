-- =================================================================================
-- 043: Talent Offers & Bidding System (AQOND)
-- =================================================================================
-- Talent posts offers with base price; Clients bid; Talent manually accepts one.
-- Bidding window: 18:00-20:00 (configurable via bid_window_start/end).
-- =================================================================================

-- Talent offers (Provider posts availability with base price)
CREATE TABLE IF NOT EXISTS talent_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot_id UUID REFERENCES availability_slots(id) ON DELETE SET NULL,
  title VARCHAR(255),
  base_price NUMERIC(12,2) NOT NULL CHECK (base_price >= 0),
  currency VARCHAR(3) DEFAULT 'THB',
  bid_window_start TIME NOT NULL DEFAULT '18:00',
  bid_window_end TIME NOT NULL DEFAULT '20:00',
  offer_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'accepted', 'cancelled')),
  max_bidders INTEGER DEFAULT 10 CHECK (max_bidders >= 1 AND max_bidders <= 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_talent_offers_talent ON talent_offers(talent_id);
CREATE INDEX IF NOT EXISTS idx_talent_offers_date ON talent_offers(offer_date);
CREATE INDEX IF NOT EXISTS idx_talent_offers_status ON talent_offers(status);

COMMENT ON TABLE talent_offers IS 'AQOND: Talent posts offer with base price; bidding active during bid_window (default 18:00-20:00)';

-- Bids (Clients place bids; amount must be >= base_price)
CREATE TABLE IF NOT EXISTS bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID NOT NULL REFERENCES talent_offers(id) ON DELETE CASCADE,
  bidder_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  message TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(offer_id, bidder_id)
);

CREATE INDEX IF NOT EXISTS idx_bids_offer ON bids(offer_id);
CREATE INDEX IF NOT EXISTS idx_bids_bidder ON bids(bidder_id);
CREATE INDEX IF NOT EXISTS idx_bids_status ON bids(status);

COMMENT ON TABLE bids IS 'AQOND: Client bids on talent offer; Provider accepts one manually';

-- Add accepted_bid_id and booking_id to talent_offers (after bids exists)
ALTER TABLE talent_offers ADD COLUMN IF NOT EXISTS accepted_bid_id UUID REFERENCES bids(id) ON DELETE SET NULL;
ALTER TABLE talent_offers ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL;
