-- Phase 5 Tier 1: production merchant ops, auth identities, rider onboarding, ops views

CREATE TABLE IF NOT EXISTS commerce.merchant_shop_ops (
  merchant_id TEXT PRIMARY KEY,
  auto_schedule BOOLEAN NOT NULL DEFAULT TRUE,
  open_time TEXT NOT NULL DEFAULT '09:00',
  close_time TEXT NOT NULL DEFAULT '21:00',
  manual_closed BOOLEAN NOT NULL DEFAULT FALSE,
  closed_note TEXT NOT NULL DEFAULT '',
  sold_out_item_ids JSONB NOT NULL DEFAULT '[]',
  busy_mode BOOLEAN NOT NULL DEFAULT FALSE,
  busy_extra_minutes INT NOT NULL DEFAULT 0,
  busy_until TIMESTAMPTZ,
  auto_accept_orders BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS commerce.merchant_food_promotions (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('menu_discount','free_delivery','temp_min_order')),
  label TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  item_ids JSONB NOT NULL DEFAULT '[]',
  discount_percent INT,
  window_start TEXT,
  window_end TEXT,
  min_order_micro BIGINT,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_merchant_food_promos ON commerce.merchant_food_promotions (merchant_id, active);

CREATE TABLE IF NOT EXISTS commerce.merchant_staff (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('owner','staff')),
  shop_ids JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_merchant_staff_user ON commerce.merchant_staff (user_id);

-- Auth identities (phone OTP + LINE)
CREATE TABLE IF NOT EXISTS commerce.auth_identities (
  user_id TEXT PRIMARY KEY,
  phone TEXT UNIQUE,
  phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
  line_user_id TEXT UNIQUE,
  line_display_name TEXT NOT NULL DEFAULT '',
  email TEXT,
  display_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS commerce.auth_otp_codes (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_otp_phone ON commerce.auth_otp_codes (phone, created_at DESC);

ALTER TABLE commerce.user_sessions
  ADD COLUMN IF NOT EXISTS token_hash TEXT,
  ADD COLUMN IF NOT EXISTS auth_method TEXT NOT NULL DEFAULT 'email';

-- Rider onboarding / fleet
ALTER TABLE commerce.dispatch_riders
  ADD COLUMN IF NOT EXISTS user_id TEXT,
  ADD COLUMN IF NOT EXISTS kyc_status TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS bank_account TEXT,
  ADD COLUMN IF NOT EXISTS suspended BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS penalty_points INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS earnings_micro BIGINT NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS idx_dispatch_riders_user ON commerce.dispatch_riders (user_id) WHERE user_id IS NOT NULL;

-- LINE channel for notifications
ALTER TABLE commerce.notification_prefs DROP CONSTRAINT IF EXISTS notification_prefs_channel_check;
ALTER TABLE commerce.notification_prefs ADD CONSTRAINT notification_prefs_channel_check
  CHECK (channel IN ('push','email','sms','inapp','line'));

ALTER TABLE commerce.notification_templates DROP CONSTRAINT IF EXISTS notification_templates_channel_check;
ALTER TABLE commerce.notification_templates ADD CONSTRAINT notification_templates_channel_check
  CHECK (channel IN ('push','email','sms','inapp','line'));

INSERT INTO commerce.notification_templates (id, template_key, locale, channel, subject, body) VALUES
  ('nt-accept-th','order_accepted','th-TH','push','','ร้านรับออเดอร์ #{order_id} แล้ว — กำลังเตรียม'),
  ('nt-rider-th','rider_en_route','th-TH','push','','ไรเดอร์กำลังนำออเดอร์ #{order_id} ไปส่ง'),
  ('nt-arrive-th','rider_arrived','th-TH','push','','ไรเดอร์ถึงหน้าบ้านแล้ว — ออเดอร์ #{order_id}'),
  ('nt-accept-line','order_accepted','th-TH','line','','ร้านรับออเดอร์ #{order_id} แล้ว'),
  ('nt-rider-line','rider_en_route','th-TH','line','','ไรเดอร์กำลังนำออเดอร์ #{order_id} ไปส่ง')
ON CONFLICT (template_key, locale, channel) DO NOTHING;

-- LINE user id linkage for push
CREATE TABLE IF NOT EXISTS commerce.line_subscriptions (
  user_id TEXT PRIMARY KEY,
  line_user_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ops: stuck dispatch jobs (>30 min in open/finding)
CREATE OR REPLACE VIEW commerce.ops_stuck_dispatch AS
SELECT j.id, j.order_id, j.merchant_id, j.status, j.phase, j.rider_id,
       j.created_at, EXTRACT(EPOCH FROM (NOW() - j.updated_at))/60 AS idle_minutes
FROM commerce.dispatch_jobs j
WHERE j.status IN ('open','assigned')
  AND j.phase IN ('finding_rider','food_ready','rider_assigned')
  AND j.updated_at < NOW() - INTERVAL '30 minutes';

COMMENT ON TABLE commerce.merchant_shop_ops IS 'Phase5: merchant hours, busy, sold-out (replaces local JSON)';
