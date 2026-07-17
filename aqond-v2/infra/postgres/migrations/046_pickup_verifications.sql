-- Sprint S3: rider pickup verification (QR + photo evidence)

CREATE TABLE IF NOT EXISTS commerce.pickup_verifications (
  order_id TEXT PRIMARY KEY REFERENCES commerce.orders(id) ON DELETE CASCADE,
  merchant_id TEXT NOT NULL,
  rider_id TEXT,
  qr_verified_at TIMESTAMPTZ,
  pickup_photo_url TEXT,
  pickup_photo_at TIMESTAMPTZ,
  pickup_completed_at TIMESTAMPTZ,
  verification_method TEXT NOT NULL DEFAULT 'qr_scan',
  verification_result TEXT,
  qr_signature TEXT,
  photo_hash TEXT,
  device_id TEXT,
  gps_lat DOUBLE PRECISION,
  gps_lng DOUBLE PRECISION,
  accuracy DOUBLE PRECISION,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS commerce.pickup_qr_nonces (
  nonce_key TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pickup_verifications_merchant
  ON commerce.pickup_verifications (merchant_id, pickup_completed_at DESC);
