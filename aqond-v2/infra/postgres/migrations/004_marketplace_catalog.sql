-- P2a marketplace catalog (Bagisto-ready bridge on Postgres)
-- Run against `bagisto` database

CREATE SCHEMA IF NOT EXISTS marketplace;

CREATE TABLE IF NOT EXISTS marketplace.products (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  description TEXT NOT NULL DEFAULT '',
  price_thb NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (price_thb >= 0),
  inventory INT NOT NULL DEFAULT 1 CHECK (inventory >= 0),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  merchant_hint TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT products_external_id_unique UNIQUE (external_id)
);

CREATE TABLE IF NOT EXISTS marketplace.product_images (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES marketplace.products (id) ON DELETE CASCADE,
  object_key TEXT NOT NULL,
  public_url TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_status_created
  ON marketplace.products (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_images_product
  ON marketplace.product_images (product_id, sort_order);

COMMENT ON TABLE marketplace.products IS 'P2a catalog — sync target for CMS/Hermes onboard; migrate to Bagisto MySQL in P2b';
