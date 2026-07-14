-- P201-P230: Production EXP track — promotions, coupons wallet, categories,
-- coins, accounts, creator/LIVE monetization, affiliate, campaigns.

-- EXP-CAT: mall taxonomy + category browse
CREATE TABLE IF NOT EXISTS commerce.categories (
  id TEXT PRIMARY KEY,
  parent_id TEXT,
  slug TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL,
  name_th TEXT NOT NULL DEFAULT '',
  icon_url TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  mall_tab BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE
);
INSERT INTO commerce.categories (id, slug, name_en, name_th, sort_order, mall_tab) VALUES
  ('cat-fashion', 'fashion', 'Fashion', 'แฟชั่น', 1, TRUE),
  ('cat-beauty', 'beauty', 'Beauty', 'ความงาม', 2, TRUE),
  ('cat-electronics', 'electronics', 'Electronics', 'อิเล็กทรอนิกส์', 3, TRUE),
  ('cat-food', 'food', 'Food', 'อาหาร', 4, TRUE),
  ('cat-home', 'home', 'Home & Living', 'ของใช้ในบ้าน', 5, TRUE),
  ('cat-sports', 'sports', 'Sports', 'กีฬา', 6, FALSE)
ON CONFLICT (id) DO NOTHING;

-- EXP-PROMO: promotions engine
CREATE TABLE IF NOT EXISTS commerce.promotions (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'percent' CHECK (kind IN ('percent','fixed','flash','brand_day')),
  value_bps INT NOT NULL DEFAULT 0,
  value_micro BIGINT NOT NULL DEFAULT 0,
  region TEXT NOT NULL DEFAULT '*',
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  banner_url TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_promotions_active ON commerce.promotions (region, active, starts_at);

INSERT INTO commerce.promotions (id, slug, title, kind, value_bps, region, ends_at) VALUES
  ('promo-welcome', 'welcome-deals', 'Deals for new customers', 'percent', 1500, '*', NOW() + INTERVAL '365 days'),
  ('promo-brand-day', 'brand-day', 'Brand Day Flash', 'flash', 2000, 'TH', NOW() + INTERVAL '7 days')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS commerce.promotion_products (
  promotion_id TEXT NOT NULL REFERENCES commerce.promotions(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  PRIMARY KEY (promotion_id, product_id)
);

-- EXP-COUPON: user coupon wallet (extends commerce.coupons from 020)
CREATE TABLE IF NOT EXISTS commerce.user_coupons (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  code TEXT NOT NULL REFERENCES commerce.coupons(code),
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at TIMESTAMPTZ,
  order_id TEXT,
  UNIQUE (user_id, code)
);
CREATE INDEX IF NOT EXISTS idx_user_coupons ON commerce.user_coupons (user_id, used_at);

INSERT INTO commerce.coupons (code, kind, value_bps, region, min_subtotal_micro) VALUES
  ('FLASH20', 'percent', 2000, 'TH', 100000000),
  ('FREESHIP', 'fixed', 0, '*', 0)
ON CONFLICT (code) DO NOTHING;
UPDATE commerce.coupons SET value_micro=50000000 WHERE code='FREESHIP';

-- EXP-ACCT: buyer profiles + social graph
CREATE TABLE IF NOT EXISTS commerce.user_profiles (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  username TEXT UNIQUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS commerce.blocked_users (
  user_id TEXT NOT NULL,
  blocked_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, blocked_id)
);

-- EXP-COINS: virtual coins wallet
CREATE TABLE IF NOT EXISTS commerce.coin_wallets (
  user_id TEXT PRIMARY KEY,
  balance INT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  lifetime_earned INT NOT NULL DEFAULT 0,
  currency_pref TEXT NOT NULL DEFAULT 'THB',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS commerce.coin_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  delta INT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  ref_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coin_ledger_user ON commerce.coin_ledger (user_id, created_at DESC);

-- EXP-AFFIL: creator product linking
CREATE TABLE IF NOT EXISTS commerce.affiliate_links (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  commission_bps INT NOT NULL DEFAULT 500,
  short_code TEXT NOT NULL UNIQUE,
  clicks INT NOT NULL DEFAULT 0,
  conversions INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_affiliate_creator ON commerce.affiliate_links (creator_id);

-- EXP-MONEY: creator revenue dashboard
CREATE TABLE IF NOT EXISTS commerce.creator_revenue (
  creator_id TEXT NOT NULL,
  period TEXT NOT NULL,
  live_gifts_micro BIGINT NOT NULL DEFAULT 0,
  affiliate_micro BIGINT NOT NULL DEFAULT 0,
  ads_micro BIGINT NOT NULL DEFAULT 0,
  subscription_micro BIGINT NOT NULL DEFAULT 0,
  payout_micro BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'THB',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (creator_id, period)
);

-- EXP-GIFT: LIVE virtual gifts
CREATE TABLE IF NOT EXISTS commerce.live_gifts (
  id TEXT PRIMARY KEY,
  live_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  creator_id TEXT NOT NULL,
  gift_kind TEXT NOT NULL DEFAULT 'rose',
  diamonds INT NOT NULL DEFAULT 1,
  amount_micro BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_live_gifts ON commerce.live_gifts (live_id, created_at DESC);

-- EXP-LIVEAN: LIVE session analytics
CREATE TABLE IF NOT EXISTS commerce.live_analytics (
  live_id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL,
  total_views INT NOT NULL DEFAULT 0,
  peak_viewers INT NOT NULL DEFAULT 0,
  new_followers INT NOT NULL DEFAULT 0,
  comments INT NOT NULL DEFAULT 0,
  gifts_total INT NOT NULL DEFAULT 0,
  duration_sec INT NOT NULL DEFAULT 0,
  ended_at TIMESTAMPTZ
);

-- EXP-LIVEREC: recordings + scheduled LIVE
CREATE TABLE IF NOT EXISTS commerce.live_recordings (
  id TEXT PRIMARY KEY,
  live_id TEXT NOT NULL,
  creator_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  replay_url TEXT NOT NULL DEFAULT '',
  duration_sec INT NOT NULL DEFAULT 0,
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('scheduled','live','ready','expired'))
);
CREATE INDEX IF NOT EXISTS idx_live_recordings_creator ON commerce.live_recordings (creator_id, published_at DESC);

-- EXP-FAN: fan clubs
CREATE TABLE IF NOT EXISTS commerce.fan_clubs (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  tier_count INT NOT NULL DEFAULT 3,
  member_count INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS commerce.fan_members (
  club_id TEXT NOT NULL REFERENCES commerce.fan_clubs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  tier INT NOT NULL DEFAULT 1,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (club_id, user_id)
);

-- EXP-SCHED: scheduled posts
CREATE TABLE IF NOT EXISTS commerce.scheduled_posts (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL,
  post_type TEXT NOT NULL DEFAULT 'video' CHECK (post_type IN ('video','live')),
  payload JSONB NOT NULL DEFAULT '{}',
  publish_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts ON commerce.scheduled_posts (creator_id, publish_at);

-- EXP-CMKT: creator marketplace campaigns
CREATE TABLE IF NOT EXISTS commerce.marketplace_campaigns (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL,
  title TEXT NOT NULL,
  budget_micro BIGINT NOT NULL DEFAULT 0,
  commission_bps INT NOT NULL DEFAULT 1000,
  region TEXT NOT NULL DEFAULT 'TH',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  ends_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS commerce.marketplace_applications (
  campaign_id TEXT NOT NULL REFERENCES commerce.marketplace_campaigns(id) ON DELETE CASCADE,
  creator_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, creator_id)
);

-- EXP-CAMP: community campaigns / rewards
CREATE TABLE IF NOT EXISTS commerce.community_campaigns (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'fest' CHECK (kind IN ('fest','jigsaw','challenge')),
  reward_coins INT NOT NULL DEFAULT 0,
  region TEXT NOT NULL DEFAULT '*',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  ends_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS commerce.campaign_enrollments (
  campaign_id TEXT NOT NULL REFERENCES commerce.community_campaigns(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  progress INT NOT NULL DEFAULT 0,
  redeemed BOOLEAN NOT NULL DEFAULT FALSE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, user_id)
);

INSERT INTO commerce.community_campaigns (id, slug, title, kind, reward_coins, region) VALUES
  ('camp-fest', 'community-fest', 'Community FEST', 'fest', 500, '*'),
  ('camp-jigsaw', 'jigsaw-redeem', 'Jigsaw Redeem', 'jigsaw', 200, 'TH')
ON CONFLICT (id) DO NOTHING;

-- EXP-SUB: fan subscriptions
CREATE TABLE IF NOT EXISTS commerce.subscriptions (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  tier INT NOT NULL DEFAULT 1,
  price_micro BIGINT NOT NULL DEFAULT 99000000,
  currency TEXT NOT NULL DEFAULT 'THB',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled','expired')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  UNIQUE (creator_id, subscriber_id)
);

-- EXP-SOUND: sound library (ties to video)
CREATE TABLE IF NOT EXISTS commerce.sounds (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT NOT NULL DEFAULT '',
  duration_sec INT NOT NULL DEFAULT 30,
  preview_url TEXT NOT NULL DEFAULT '',
  usage_count INT NOT NULL DEFAULT 0,
  trending_score INT NOT NULL DEFAULT 0
);

INSERT INTO commerce.sounds (id, title, artist, trending_score) VALUES
  ('snd-1', 'Summer Beat', 'AQOND Studio', 100),
  ('snd-2', 'Night Drive', 'Creator Pack', 85)
ON CONFLICT (id) DO NOTHING;

-- EXP-WELL: wellbeing / screen time
CREATE TABLE IF NOT EXISTS commerce.wellbeing_settings (
  user_id TEXT PRIMARY KEY,
  daily_limit_min INT NOT NULL DEFAULT 0,
  screen_time_today_min INT NOT NULL DEFAULT 0,
  restricted_mode BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_buyer ON commerce.orders (buyer_id, created_at DESC);

COMMENT ON TABLE commerce.promotions IS 'P201 EXP-PROMO promotions engine';
COMMENT ON TABLE commerce.user_coupons IS 'P202 EXP-COUPON coupon wallet';
COMMENT ON TABLE commerce.categories IS 'P203 EXP-CAT mall taxonomy';
COMMENT ON TABLE commerce.coin_wallets IS 'P211 EXP-COINS virtual coins';
COMMENT ON TABLE commerce.user_profiles IS 'P212 EXP-ACCT buyer profiles';
