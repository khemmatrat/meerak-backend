-- VIP subscription purchase history + lifecycle (Silver / Gold / Platinum)

CREATE TABLE IF NOT EXISTS vip_subscription_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier VARCHAR(20) NOT NULL CHECK (tier IN ('silver', 'gold', 'platinum')),
  status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'active', 'expired', 'cancelled', 'failed')),
  amount_baht NUMERIC(12, 2) NOT NULL DEFAULT 0,
  billing_month VARCHAR(7),
  started_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  payment_method VARCHAR(40),
  payment_ref VARCHAR(200),
  renewal_notified_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vip_sub_orders_user ON vip_subscription_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vip_sub_orders_status ON vip_subscription_orders(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_vip_sub_orders_billing ON vip_subscription_orders(billing_month);

ALTER TABLE users ADD COLUMN IF NOT EXISTS vip_started_at TIMESTAMPTZ;
