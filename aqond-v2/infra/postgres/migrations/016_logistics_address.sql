-- P117-P121: cross-border logistics + customs + addresses + returns.

-- P120: carriers + rate cards
CREATE TABLE IF NOT EXISTS commerce.carriers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cross_border BOOLEAN NOT NULL DEFAULT FALSE,
  regions TEXT[] NOT NULL DEFAULT '{}',
  base_micro BIGINT NOT NULL DEFAULT 0,
  per_kg_micro BIGINT NOT NULL DEFAULT 0,
  cod_supported BOOLEAN NOT NULL DEFAULT FALSE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO commerce.carriers (id, name, cross_border, regions, base_micro, per_kg_micro, cod_supported) VALUES
  ('kerry-th','Kerry TH',FALSE,'{TH}',35000000,10000000,TRUE),
  ('thaipost','Thailand Post',TRUE,'{TH,SEA}',45000000,15000000,TRUE),
  ('dhl-xb','DHL Cross-border',TRUE,'{TH,SEA,US,EU}',250000000,60000000,FALSE)
ON CONFLICT (id) DO NOTHING;

-- P119: HS codes + restricted-item rules per destination
CREATE TABLE IF NOT EXISTS commerce.product_customs (
  product_id TEXT PRIMARY KEY,
  hs_code TEXT NOT NULL DEFAULT '',
  origin_country TEXT NOT NULL DEFAULT 'TH',
  declared_value_micro BIGINT NOT NULL DEFAULT 0,
  restricted_destinations TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- P118/P120: shipments + tracking
CREATE TABLE IF NOT EXISTS commerce.shipments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  shard_key TEXT NOT NULL,
  carrier_id TEXT NOT NULL,
  ship_from_region TEXT NOT NULL,
  ship_to_region TEXT NOT NULL,
  cross_border BOOLEAN NOT NULL DEFAULT FALSE,
  weight_grams INT NOT NULL DEFAULT 0,
  shipping_micro BIGINT NOT NULL DEFAULT 0,
  duty_micro BIGINT NOT NULL DEFAULT 0,
  tax_micro BIGINT NOT NULL DEFAULT 0,
  landed_total_micro BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'THB',
  tracking_no TEXT,
  status TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created','label_generated','in_transit','delivered','returned','exception')),
  customs JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shipments_order ON commerce.shipments (order_id);
CREATE INDEX IF NOT EXISTS idx_shipments_tracking ON commerce.shipments (tracking_no);

-- P121: international addresses (per-country format, residency-aware)
CREATE TABLE IF NOT EXISTS commerce.addresses (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  shard_key TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT 'TH',
  country TEXT NOT NULL DEFAULT 'TH',
  recipient TEXT NOT NULL DEFAULT '',
  line1 TEXT NOT NULL DEFAULT '',
  line2 TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  postal_code TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  normalized BOOLEAN NOT NULL DEFAULT FALSE,
  geo JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_addresses_owner ON commerce.addresses (owner_id, is_default DESC);

-- P131: returns / RMA (regional consumer protection)
CREATE TABLE IF NOT EXISTS commerce.returns_rma (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  buyer_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  shard_key TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'TH',
  reason TEXT NOT NULL DEFAULT '',
  amount_micro BIGINT NOT NULL DEFAULT 0,
  within_window BOOLEAN NOT NULL DEFAULT TRUE,
  cross_border BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','approved','rejected','refunded','received')),
  intent_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_returns_order ON commerce.returns_rma (order_id);

-- statutory return windows per market (P131)
CREATE TABLE IF NOT EXISTS commerce.return_policies (
  market TEXT PRIMARY KEY,
  window_days INT NOT NULL DEFAULT 7,
  cooling_off BOOLEAN NOT NULL DEFAULT FALSE
);
INSERT INTO commerce.return_policies (market, window_days, cooling_off) VALUES
  ('TH',7,FALSE),('US',30,FALSE),('SEA',15,FALSE),('EU',14,TRUE)
ON CONFLICT (market) DO NOTHING;

COMMENT ON TABLE commerce.shipments IS 'P118-P120 cross-border shipments with landed cost + customs';
