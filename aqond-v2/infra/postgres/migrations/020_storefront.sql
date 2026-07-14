-- P151-P162: storefront backend — carts, settings, notification prefs,
-- activity center, sessions, push registrations.

-- P151: persisted carts + items
CREATE TABLE IF NOT EXISTS commerce.carts (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  shard_key TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT 'TH',
  currency TEXT NOT NULL DEFAULT 'THB',
  coupon_code TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','ordered','abandoned')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, status)
);
CREATE INDEX IF NOT EXISTS idx_carts_owner ON commerce.carts (owner_id);

CREATE TABLE IF NOT EXISTS commerce.cart_items (
  id TEXT PRIMARY KEY,
  cart_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  variant_id TEXT,
  merchant_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  qty INT NOT NULL DEFAULT 1 CHECK (qty > 0),
  unit_price_micro BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'THB',
  image_url TEXT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cart_items ON commerce.cart_items (cart_id, product_id, COALESCE(variant_id,''));

-- a small coupon table for cart apply (EXP-COUPON; storefront-scoped)
CREATE TABLE IF NOT EXISTS commerce.coupons (
  code TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'percent' CHECK (kind IN ('percent','fixed')),
  value_bps INT NOT NULL DEFAULT 0,        -- percent: bps; fixed: micro amount in value_micro
  value_micro BIGINT NOT NULL DEFAULT 0,
  region TEXT NOT NULL DEFAULT '*',
  min_subtotal_micro BIGINT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ
);
INSERT INTO commerce.coupons (code, kind, value_bps, region, min_subtotal_micro) VALUES
  ('WELCOME10','percent',1000,'*',0),
  ('SAVE50','fixed',0,'*',50000000)
ON CONFLICT (code) DO NOTHING;
UPDATE commerce.coupons SET value_micro=50000000 WHERE code='SAVE50';

-- P161 + P155: per-user settings (privacy, content prefs, security)
CREATE TABLE IF NOT EXISTS commerce.user_settings (
  user_id TEXT PRIMARY KEY,
  region TEXT NOT NULL DEFAULT 'TH',
  locale TEXT NOT NULL DEFAULT 'th-TH',
  currency TEXT NOT NULL DEFAULT 'THB',
  theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('system','light','dark')),
  private_account BOOLEAN NOT NULL DEFAULT FALSE,
  personalization BOOLEAN NOT NULL DEFAULT TRUE,
  biometric_lock BOOLEAN NOT NULL DEFAULT FALSE,
  interests JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- P162 + P135: notification preference center (per channel/category)
CREATE TABLE IF NOT EXISTS commerce.notification_prefs (
  user_id TEXT NOT NULL,
  category TEXT NOT NULL,                    -- orders | promos | social | live | security
  channel TEXT NOT NULL CHECK (channel IN ('push','email','sms','inapp')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, category, channel)
);

-- P162 / EXP-ACTIVITY: activity center (watch/comment/search/mention history)
CREATE TABLE IF NOT EXISTS commerce.activity_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,                        -- watch | comment | search | mention | like | follow
  ref_id TEXT,
  summary TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_user ON commerce.activity_events (user_id, created_at DESC);

-- P164/P166: push registrations + sessions
CREATE TABLE IF NOT EXISTS commerce.push_registrations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'web' CHECK (platform IN ('web','ios','android')),
  endpoint TEXT NOT NULL,
  token TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, endpoint)
);

-- P144/P166: storefront sessions (device binding for biometric re-auth)
CREATE TABLE IF NOT EXISTS commerce.user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  biometric_bound BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON commerce.user_sessions (user_id, revoked);

-- P147: front-end RUM / web-vitals samples
CREATE TABLE IF NOT EXISTS commerce.rum_samples (
  id BIGSERIAL PRIMARY KEY,
  region TEXT NOT NULL DEFAULT 'TH',
  route TEXT NOT NULL DEFAULT '',
  metric TEXT NOT NULL,                      -- LCP | CLS | INP | TTFB | FCP
  value DOUBLE PRECISION NOT NULL,
  rating TEXT NOT NULL DEFAULT 'good',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rum_metric ON commerce.rum_samples (metric, captured_at DESC);

COMMENT ON TABLE commerce.carts IS 'P151 persisted storefront carts';
