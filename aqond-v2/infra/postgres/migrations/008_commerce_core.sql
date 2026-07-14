-- P9-P10: Commerce core — shard-ready schema (commerce database)
-- ULID string PKs, shard_key on every table, transactional outbox

CREATE SCHEMA IF NOT EXISTS commerce;

CREATE TABLE IF NOT EXISTS commerce.merchants (
  id TEXT PRIMARY KEY,
  shard_key TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'TH',
  name TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_merchants_shard ON commerce.merchants (shard_key, region);

CREATE TABLE IF NOT EXISTS commerce.stores (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  shard_key TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'TH',
  slug TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shard_key, slug)
);
CREATE INDEX IF NOT EXISTS idx_stores_merchant ON commerce.stores (merchant_id, shard_key);

CREATE TABLE IF NOT EXISTS commerce.products (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  shard_key TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'TH',
  external_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  seo_tags JSONB NOT NULL DEFAULT '[]',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shard_key, external_id)
);
CREATE INDEX IF NOT EXISTS idx_products_store ON commerce.products (store_id, status);
CREATE INDEX IF NOT EXISTS idx_products_merchant ON commerce.products (merchant_id, shard_key);

CREATE TABLE IF NOT EXISTS commerce.product_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  shard_key TEXT NOT NULL,
  sku TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  price_micro BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'THB',
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shard_key, sku)
);
CREATE INDEX IF NOT EXISTS idx_variants_product ON commerce.product_variants (product_id, shard_key);

CREATE TABLE IF NOT EXISTS commerce.inventory (
  variant_id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  shard_key TEXT NOT NULL,
  available INT NOT NULL DEFAULT 0 CHECK (available >= 0),
  reserved INT NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  version BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inventory_merchant ON commerce.inventory (merchant_id, shard_key);

CREATE TABLE IF NOT EXISTS commerce.inventory_reservations (
  id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  shard_key TEXT NOT NULL,
  qty INT NOT NULL CHECK (qty > 0),
  status TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'committed', 'released', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, variant_id)
);
CREATE INDEX IF NOT EXISTS idx_reservations_expires ON commerce.inventory_reservations (expires_at) WHERE status = 'held';

CREATE TABLE IF NOT EXISTS commerce.orders (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  buyer_id TEXT NOT NULL,
  shard_key TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'TH',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected', 'cancelled', 'refunded')),
  fulfillment_status TEXT NOT NULL DEFAULT 'pending_ship',
  amount_micro BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'THB',
  idempotency_key TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shard_key, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_orders_merchant ON commerce.orders (merchant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS commerce.order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  shard_key TEXT NOT NULL,
  qty INT NOT NULL CHECK (qty > 0),
  unit_price_micro BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON commerce.order_items (order_id, shard_key);

CREATE TABLE IF NOT EXISTS commerce.wallets (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('buyer', 'merchant', 'platform')),
  owner_id TEXT NOT NULL,
  merchant_id TEXT,
  shard_key TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'THB',
  balance_micro BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shard_key, owner_type, owner_id, currency)
);

CREATE TABLE IF NOT EXISTS commerce.wallet_ledger (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL,
  order_id TEXT,
  merchant_id TEXT NOT NULL,
  shard_key TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('HOLD', 'RELEASE', 'REFUND', 'CAPTURE', 'ADJUST')),
  amount_micro BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'posted',
  idempotency_key TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'system',
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shard_key, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_order ON commerce.wallet_ledger (order_id, shard_key);

CREATE TABLE IF NOT EXISTS commerce.outbox (
  id BIGSERIAL PRIMARY KEY,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  shard_key TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_outbox_unpublished ON commerce.outbox (created_at) WHERE published_at IS NULL;

-- Hermes AI memory (P17)
CREATE TABLE IF NOT EXISTS commerce.hermes_episodic_memory (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  shard_key TEXT NOT NULL,
  session_id TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding_json JSONB,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hermes_episodic_merchant ON commerce.hermes_episodic_memory (merchant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS commerce.hermes_procedural_rules (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  shard_key TEXT NOT NULL,
  rule_key TEXT NOT NULL,
  rule_value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id, rule_key)
);

COMMENT ON SCHEMA commerce IS 'P9-P15 Go commerce core — shard-ready, no cross-shard FKs';
