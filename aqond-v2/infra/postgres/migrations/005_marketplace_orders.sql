-- P2b marketplace orders + checkout → escrow HOLD
-- Run against `bagisto` database (Postgres catalog)

ALTER TABLE marketplace.products
  ADD COLUMN IF NOT EXISTS bagisto_product_id BIGINT,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS marketplace.orders (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE,
  product_id BIGINT NOT NULL REFERENCES marketplace.products (id),
  external_id TEXT NOT NULL,
  buyer_id TEXT NOT NULL DEFAULT 'guest',
  qty INT NOT NULL DEFAULT 1 CHECK (qty > 0),
  amount_micro BIGINT NOT NULL CHECK (amount_micro >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'THB',
  status TEXT NOT NULL DEFAULT 'held'
    CHECK (status IN ('pending_hold', 'held', 'released', 'refunded', 'cancelled')),
  escrow_idempotency_key TEXT NOT NULL UNIQUE,
  merchant_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_product ON marketplace.orders (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON marketplace.orders (buyer_id, created_at DESC);

COMMENT ON COLUMN marketplace.products.bagisto_product_id IS 'P2b: linked Bagisto MySQL product id when mirror succeeds';
COMMENT ON TABLE marketplace.orders IS 'Checkout orders — escrow HOLD via sync-service /checkout';
