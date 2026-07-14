-- =================================================================================
-- 218: Beauty / Salon booking — service menu, shop settings, transport, work photos
-- =================================================================================

CREATE TABLE IF NOT EXISTS provider_service_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type VARCHAR(10) NOT NULL DEFAULT 'main' CHECK (item_type IN ('main', 'addon')),
  title VARCHAR(200) NOT NULL,
  description TEXT,
  price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (duration_minutes > 0),
  category VARCHAR(30) NOT NULL DEFAULT 'other',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_provider_service_items_provider
  ON provider_service_items(provider_user_id, is_active, sort_order);

CREATE TABLE IF NOT EXISTS provider_booking_settings (
  provider_user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  shop_name VARCHAR(200),
  shop_address TEXT,
  shop_lat DOUBLE PRECISION,
  shop_lng DOUBLE PRECISION,
  offers_at_shop BOOLEAN NOT NULL DEFAULT true,
  offers_at_home BOOLEAN NOT NULL DEFAULT false,
  vehicle_type VARCHAR(80),
  vehicle_plate VARCHAR(20),
  transport_rate_per_km NUMERIC(6, 2) CHECK (
    transport_rate_per_km IS NULL
    OR (transport_rate_per_km >= 8 AND transport_rate_per_km <= 15)
  ),
  payment_mode VARCHAR(20) NOT NULL DEFAULT 'both'
    CHECK (payment_mode IN ('deposit', 'full_upfront', 'both')),
  deposit_type VARCHAR(10) NOT NULL DEFAULT 'percent'
    CHECK (deposit_type IN ('percent', 'fixed')),
  deposit_value NUMERIC(12, 2) NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS booking_work_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  phase VARCHAR(10) NOT NULL CHECK (phase IN ('before', 'after')),
  photo_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  submitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (booking_id, phase)
);

CREATE INDEX IF NOT EXISTS idx_booking_work_photos_booking ON booking_work_photos(booking_id);

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_type VARCHAR(20) NOT NULL DEFAULT 'general';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS location_mode VARCHAR(20);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS service_address_json JSONB;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS service_subtotal NUMERIC(12, 2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS transport_base_fare NUMERIC(12, 2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS transport_distance_km NUMERIC(10, 3);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS transport_rate_per_km NUMERIC(6, 2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS transport_total NUMERIC(12, 2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS quoted_price NUMERIC(12, 2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS employer_service_fee NUMERIC(12, 2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS employer_total NUMERIC(12, 2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS selected_items_json JSONB;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS remaining_balance NUMERIC(12, 2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(20);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS vehicle_type_snapshot VARCHAR(80);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS vehicle_plate_snapshot VARCHAR(20);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancel_notice_hours NUMERIC(8, 2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payout_released_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS withdrawable_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS beauty_withdrawable_unlocked BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_session_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_session_status_check
  CHECK (session_status IN (
    'awaiting_checkin', 'in_progress', 'awaiting_acceptance', 'completed', 'no_show', 'disputed'
  ));

ALTER TABLE availability_slots ADD COLUMN IF NOT EXISTS allowed_location_modes TEXT[];

INSERT INTO payout_config (key, value_json, updated_at)
VALUES (
  'beauty_booking_policy',
  '{
    "cancel_notice_hours": 3,
    "no_show_fee_percent": 20,
    "no_show_fee_platform_share": 30,
    "no_show_fee_provider_share": 70,
    "payout_withdraw_hold_hours": 24,
    "min_completion_photos": 4,
    "transport_base_fare_thb": 45,
    "transport_rate_min_km": 8,
    "transport_rate_max_km": 15,
    "employer_service_fee_percent": 5,
    "service_sourcing_percent": 8,
    "service_commission_percent": 28,
    "transport_platform_fee_percent": 3
  }'::jsonb,
  NOW()
)
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE provider_service_items IS 'Beauty/salon service menu — provider sets own prices';
COMMENT ON TABLE provider_booking_settings IS 'Shop location, vehicle, transport rate, payment mode';
