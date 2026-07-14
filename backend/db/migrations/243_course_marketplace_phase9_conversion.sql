-- 243: Course Marketplace Phase 9 — conversion (coupons, bundles, promo voucher uses)

CREATE TABLE IF NOT EXISTS course_instructor_coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(40) NOT NULL,
  instructor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id VARCHAR(100) REFERENCES courses(id) ON DELETE CASCADE,
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 10,
  max_uses INT NOT NULL DEFAULT 100,
  use_count INT NOT NULL DEFAULT 0,
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (instructor_user_id, code)
);

CREATE INDEX IF NOT EXISTS idx_course_instructor_coupons_code
  ON course_instructor_coupons (UPPER(code), is_active);

CREATE TABLE IF NOT EXISTS course_coupon_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID NOT NULL REFERENCES course_instructor_coupons(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id VARCHAR(100) NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  order_id UUID REFERENCES course_purchase_orders(id) ON DELETE SET NULL,
  discount_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (coupon_id, user_id, course_id)
);

CREATE TABLE IF NOT EXISTS course_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(80) NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT,
  instructor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  bundle_price_thb NUMERIC(18,2) NOT NULL DEFAULT 0,
  original_price_thb NUMERIC(18,2),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS course_bundle_items (
  bundle_id UUID NOT NULL REFERENCES course_bundles(id) ON DELETE CASCADE,
  course_id VARCHAR(100) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (bundle_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_course_bundle_items_course
  ON course_bundle_items (course_id);

CREATE TABLE IF NOT EXISTS course_promo_voucher_uses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id TEXT NOT NULL REFERENCES user_promo_vouchers(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id VARCHAR(100) NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  order_id UUID REFERENCES course_purchase_orders(id) ON DELETE SET NULL,
  discount_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_promo_voucher_uses_voucher
  ON course_promo_voucher_uses (voucher_id, created_at DESC);

INSERT INTO payout_config (key, value_json, updated_at)
VALUES (
  'course_revenue_policy',
  COALESCE(
    (SELECT value_json FROM payout_config WHERE key = 'course_revenue_policy' LIMIT 1),
    '{}'::jsonb
  ) || '{
    "firstPurchaseDiscountRate": 0.05,
    "firstPurchaseBonusPoints": 50,
    "limitedSeatsBase": 50
  }'::jsonb,
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value_json = payout_config.value_json || EXCLUDED.value_json,
  updated_at = NOW();
