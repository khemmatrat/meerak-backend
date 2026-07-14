-- Epoch: Live commerce CF + AI commerce extensions (Jun 2026)

-- Product physical attributes + per-user purchase limits
ALTER TABLE commerce.products
  ADD COLUMN IF NOT EXISTS weight_grams INT NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS width_cm NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS length_cm NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS height_cm NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS purchase_limit_per_user INT NOT NULL DEFAULT 0;

ALTER TABLE commerce.product_variants
  ADD COLUMN IF NOT EXISTS weight_grams INT,
  ADD COLUMN IF NOT EXISTS width_cm NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS length_cm NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS height_cm NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS option_label TEXT,
  ADD COLUMN IF NOT EXISTS option_value TEXT;

-- Order shipping + live source
ALTER TABLE commerce.orders
  ADD COLUMN IF NOT EXISTS shipping_address_id TEXT,
  ADD COLUMN IF NOT EXISTS live_room_id TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'web';

-- Shipment label metadata
ALTER TABLE commerce.shipments
  ADD COLUMN IF NOT EXISTS label_template TEXT NOT NULL DEFAULT 'aqond',
  ADD COLUMN IF NOT EXISTS show_carrier_header BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS label_html_key TEXT,
  ADD COLUMN IF NOT EXISTS recipient_snapshot JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sender_snapshot JSONB NOT NULL DEFAULT '{}';

-- Live pinned products (multi F-code per room)
CREATE TABLE IF NOT EXISTS commerce.live_pinned_products (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  slot INT NOT NULL DEFAULT 1,
  f_code TEXT NOT NULL,
  product_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  price_micro BIGINT NOT NULL DEFAULT 0,
  image_url TEXT NOT NULL DEFAULT '',
  inventory INT NOT NULL DEFAULT 0,
  purchase_limit_per_user INT NOT NULL DEFAULT 0,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (room_id, slot),
  UNIQUE (room_id, f_code)
);
CREATE INDEX IF NOT EXISTS idx_live_pinned_room ON commerce.live_pinned_products(room_id);

-- Live chat messages
CREATE TABLE IF NOT EXISTS commerce.live_chat_messages (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'text',
  body TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_live_chat_room ON commerce.live_chat_messages(room_id, created_at DESC);

-- Per-user live purchase counters (limit enforcement)
CREATE TABLE IF NOT EXISTS commerce.live_purchase_counters (
  room_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  buyer_id TEXT NOT NULL,
  qty INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_id, product_id, buyer_id)
);

-- Live order drafts / confirmed live orders
CREATE TABLE IF NOT EXISTS commerce.live_orders (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  buyer_id TEXT NOT NULL,
  buyer_name TEXT NOT NULL DEFAULT '',
  product_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  f_code TEXT NOT NULL DEFAULT '',
  qty INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  order_id TEXT,
  shipping_address_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_live_orders_room ON commerce.live_orders(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_orders_merchant ON commerce.live_orders(merchant_id, status);

-- Fulfillment timeline
CREATE TABLE IF NOT EXISTS commerce.fulfillment_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  status TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fulfillment_order ON commerce.fulfillment_events(order_id, created_at);

-- Payment slip OCR records
CREATE TABLE IF NOT EXISTS commerce.payment_slips (
  id TEXT PRIMARY KEY,
  order_id TEXT,
  merchant_id TEXT NOT NULL,
  buyer_id TEXT,
  slip_type TEXT NOT NULL DEFAULT 'shipping',
  image_url TEXT NOT NULL DEFAULT '',
  ocr_json JSONB NOT NULL DEFAULT '{}',
  tracking_no TEXT,
  amount_micro BIGINT,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_slips_order ON commerce.payment_slips(order_id);
