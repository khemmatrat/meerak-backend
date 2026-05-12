-- 195: Persistent webhook logs for wallet deposit traceability (PaySo/gateway)

CREATE TABLE IF NOT EXISTS wallet_deposit_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'payso',
  charge_id TEXT,
  reference_id TEXT,
  transaction_id TEXT,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  source_type TEXT,
  amount NUMERIC(18, 2),
  event_status TEXT,
  http_status INTEGER,
  signature_valid BOOLEAN,
  bypass_unsigned BOOLEAN NOT NULL DEFAULT FALSE,
  headers_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_body TEXT,
  processing_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_deposit_webhook_logs_charge
  ON wallet_deposit_webhook_logs (charge_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_deposit_webhook_logs_provider_created
  ON wallet_deposit_webhook_logs (provider, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_deposit_webhook_logs_status
  ON wallet_deposit_webhook_logs (event_status);

COMMENT ON TABLE wallet_deposit_webhook_logs IS
  'Persistent incoming webhook logs for wallet deposit channels (finance/fraud forensics).';
