-- =================================================================================
-- 068: Insurance Options + Partner No-Show Penalty
-- =================================================================================
-- Phase 3: Operational Logic
-- Insurance: 10-25% of bill or fixed 19-29 THB
-- No-show: Refund 100% to client + Fine partner 20-30% of job value
-- =================================================================================

-- Insurance config: 10-25% of bill or fixed 19-29 THB
CREATE TABLE IF NOT EXISTS insurance_config (
  key VARCHAR(50) PRIMARY KEY,
  value_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO insurance_config (key, value_json) VALUES
  ('percent_min', '10', NOW()),
  ('percent_max', '25', NOW()),
  ('fixed_min_thb', '19', NOW()),
  ('fixed_max_thb', '29', NOW())
ON CONFLICT (key) DO NOTHING;

-- No-show penalty config
CREATE TABLE IF NOT EXISTS no_show_penalty_config (
  key VARCHAR(50) PRIMARY KEY,
  value_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO no_show_penalty_config (key, value_json) VALUES
  ('refund_client_percent', '100', NOW()),
  ('fine_partner_percent_min', '20', NOW()),
  ('fine_partner_percent_max', '30', NOW())
ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW();

-- Track no-show events (for penalty application)
CREATE TABLE IF NOT EXISTS no_show_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id TEXT,
  booking_id UUID,
  provider_id UUID REFERENCES users(id),
  client_id UUID REFERENCES users(id),
  job_value NUMERIC(18,2),
  refund_amount NUMERIC(18,2),
  fine_amount NUMERIC(18,2),
  provider_debt_after NUMERIC(18,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_no_show_events_provider ON no_show_events(provider_id);
COMMENT ON TABLE no_show_events IS 'Partner no-show: 100% refund to client, 20-30% fine on partner (debt if insufficient)';
