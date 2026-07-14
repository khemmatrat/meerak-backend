-- Tier 2: production wiring — search food, coupon stack, batch dispatch, tracking events, seller tiers

-- Extend search entity types for food restaurants
ALTER TABLE commerce.search_documents DROP CONSTRAINT IF EXISTS search_documents_entity_type_check;
ALTER TABLE commerce.search_documents ADD CONSTRAINT search_documents_entity_type_check
  CHECK (entity_type IN ('product', 'shop', 'food', 'user', 'video', 'sound', 'live'));

-- Coupon stacking metadata
ALTER TABLE commerce.coupons ADD COLUMN IF NOT EXISTS stackable BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE commerce.coupons ADD COLUMN IF NOT EXISTS exclusive_group TEXT NOT NULL DEFAULT '';
ALTER TABLE commerce.coupons ADD COLUMN IF NOT EXISTS stack_priority INT NOT NULL DEFAULT 100;

UPDATE commerce.coupons SET stackable = FALSE, exclusive_group = 'welcome' WHERE code = 'WELCOME10';
UPDATE commerce.coupons SET stack_priority = 10 WHERE kind = 'percent';
UPDATE commerce.coupons SET stack_priority = 20 WHERE kind = 'fixed';

CREATE TABLE IF NOT EXISTS commerce.order_coupon_stack (
  order_id TEXT NOT NULL,
  code TEXT NOT NULL,
  discount_micro BIGINT NOT NULL DEFAULT 0,
  apply_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (order_id, code)
);

-- Dispatch batch delivery (multi-stop routes)
CREATE TABLE IF NOT EXISTS commerce.dispatch_batches (
  id TEXT PRIMARY KEY,
  rider_id TEXT,
  zone_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'assigned', 'in_progress', 'completed', 'cancelled')),
  stop_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dispatch_batches_rider ON commerce.dispatch_batches (rider_id, status);

ALTER TABLE commerce.dispatch_jobs ADD COLUMN IF NOT EXISTS batch_id TEXT;
ALTER TABLE commerce.dispatch_jobs ADD COLUMN IF NOT EXISTS stop_seq INT NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_dispatch_jobs_batch ON commerce.dispatch_jobs (batch_id, stop_seq);

-- Carrier tracking milestones
CREATE TABLE IF NOT EXISTS commerce.shipment_tracking_events (
  id TEXT PRIMARY KEY,
  tracking_no TEXT NOT NULL,
  carrier_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shipment_events_track ON commerce.shipment_tracking_events (tracking_no, occurred_at);

-- Seller tier program (beyond rent-fee tiers)
CREATE TABLE IF NOT EXISTS commerce.seller_tier_rules (
  tier TEXT PRIMARY KEY,
  label_th TEXT NOT NULL,
  min_orders INT NOT NULL DEFAULT 0,
  min_revenue_micro BIGINT NOT NULL DEFAULT 0,
  commission_bps INT NOT NULL DEFAULT 500,
  benefits JSONB NOT NULL DEFAULT '[]'
);
INSERT INTO commerce.seller_tier_rules (tier, label_th, min_orders, min_revenue_micro, commission_bps, benefits) VALUES
  ('bronze', 'บรอนซ์', 0, 0, 600, '["ค่าธรรมเนียมมาตรฐาน"]'),
  ('silver', 'ซิลเวอร์', 50, 500000000, 500, '["ลดค่าธรรมเนียม 0.5%","ป้ายร้าน Silver"]'),
  ('gold', 'โกลด์', 200, 2000000000, 400, '["ลดค่าธรรมเนียม 1%","โฆษณา in-app","ป้าย Gold"]'),
  ('platinum', 'แพลตินัม', 500, 5000000000, 300, '["ค่าธรรมเนียมต่ำสุด","support พิเศษ","batch delivery ลำดับแรก"]')
ON CONFLICT (tier) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_returns_buyer ON commerce.returns_rma (buyer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS commerce.food_menu_bulk_ops (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  action TEXT NOT NULL,
  item_ids JSONB NOT NULL DEFAULT '[]',
  meta JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE commerce.dispatch_batches IS 'Tier 2: rider multi-stop batch delivery';
COMMENT ON TABLE commerce.shipment_tracking_events IS 'Tier 2: carrier webhook / milestone timeline';
COMMENT ON TABLE commerce.seller_tier_rules IS 'Tier 2: merchant seller tier benefits';
