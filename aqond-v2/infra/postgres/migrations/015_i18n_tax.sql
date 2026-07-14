-- P111-P116: i18n / localization / price books / tax / invoicing.

-- P111: locale + market registry
CREATE TABLE IF NOT EXISTS commerce.locales (
  locale TEXT PRIMARY KEY,          -- e.g. th-TH, en-US
  language TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'TH',
  currency TEXT NOT NULL DEFAULT 'THB',
  rtl BOOLEAN NOT NULL DEFAULT FALSE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  fallback_locale TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO commerce.locales (locale, language, region, currency, fallback_locale) VALUES
  ('th-TH','th','TH','THB',NULL),
  ('en-US','en','US','USD','th-TH'),
  ('en-SG','en','SEA','SGD','en-US')
ON CONFLICT (locale) DO NOTHING;

-- P112: keyed message catalog (ICU strings) per locale
CREATE TABLE IF NOT EXISTS commerce.i18n_messages (
  message_key TEXT NOT NULL,
  locale TEXT NOT NULL,
  value TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'human' CHECK (source IN ('human','machine')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_key, locale)
);

-- P113: catalog/content localization (per shard_key)
CREATE TABLE IF NOT EXISTS commerce.product_i18n (
  product_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  shard_key TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  slug TEXT,
  source TEXT NOT NULL DEFAULT 'machine',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, locale)
);

-- P114: per-market price books
CREATE TABLE IF NOT EXISTS commerce.price_books (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  variant_id TEXT,
  market TEXT NOT NULL,            -- region/market code
  currency TEXT NOT NULL,
  price_micro BIGINT NOT NULL,
  tax_inclusive BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_price_books ON commerce.price_books (product_id, COALESCE(variant_id,''), market, currency);
CREATE INDEX IF NOT EXISTS idx_price_books_market ON commerce.price_books (market, product_id);

-- P115: tax rules per market + category
CREATE TABLE IF NOT EXISTS commerce.tax_rules (
  id TEXT PRIMARY KEY,
  market TEXT NOT NULL,
  tax_category TEXT NOT NULL DEFAULT 'standard',
  rate_bps INT NOT NULL DEFAULT 700,      -- 7.00% default (TH VAT)
  kind TEXT NOT NULL DEFAULT 'vat' CHECK (kind IN ('vat','gst','sales_tax')),
  marketplace_facilitator BOOLEAN NOT NULL DEFAULT TRUE,
  inclusive BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (market, tax_category)
);

INSERT INTO commerce.tax_rules (id, market, tax_category, rate_bps, kind, inclusive) VALUES
  ('tax-th-std','TH','standard',700,'vat',TRUE),
  ('tax-us-std','US','standard',0,'sales_tax',FALSE),
  ('tax-sea-std','SEA','standard',900,'gst',TRUE)
ON CONFLICT (market, tax_category) DO NOTHING;

-- P116: invoices / receipts (localized, numbered, retained)
CREATE TABLE IF NOT EXISTS commerce.invoices (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  shard_key TEXT NOT NULL,
  market TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'th-TH',
  invoice_no TEXT NOT NULL,
  currency TEXT NOT NULL,
  subtotal_micro BIGINT NOT NULL DEFAULT 0,
  tax_micro BIGINT NOT NULL DEFAULT 0,
  total_micro BIGINT NOT NULL DEFAULT 0,
  tax_lines JSONB NOT NULL DEFAULT '[]',
  format TEXT NOT NULL DEFAULT 'standard',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (market, invoice_no)
);
CREATE INDEX IF NOT EXISTS idx_invoices_order ON commerce.invoices (order_id);

-- invoice numbering sequence per market
CREATE TABLE IF NOT EXISTS commerce.invoice_counters (
  market TEXT PRIMARY KEY,
  next_no BIGINT NOT NULL DEFAULT 1
);

COMMENT ON TABLE commerce.locales IS 'P111 locale/market registry';
