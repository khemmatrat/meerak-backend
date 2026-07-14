-- Phase 11: Course gateway purchase (PromptPay / card) — pending charges until PaySo confirms

CREATE TABLE IF NOT EXISTS course_purchase_gateway_charges (
  charge_id VARCHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id VARCHAR(100) NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  amount NUMERIC(18,2) NOT NULL,
  gross_amount NUMERIC(18,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'THB',
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  source_type VARCHAR(32) NOT NULL DEFAULT 'payso',
  payment_method VARCHAR(32),
  order_id UUID REFERENCES course_purchase_orders(id) ON DELETE SET NULL,
  ledger_id VARCHAR(100),
  quote_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  purchase_ctx JSONB NOT NULL DEFAULT '{}'::jsonb,
  gateway_external_ref VARCHAR(128),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_gateway_charges_user_created
  ON course_purchase_gateway_charges(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_course_gateway_charges_course_status
  ON course_purchase_gateway_charges(course_id, status);

CREATE INDEX IF NOT EXISTS idx_course_gateway_charges_pending
  ON course_purchase_gateway_charges(status, created_at DESC)
  WHERE status = 'pending';
