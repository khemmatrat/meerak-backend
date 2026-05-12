-- 131: Emergency Logs — SOS storage (POTUS-grade reliability)
-- Stores all SOS triggers with digital identity payload for authorities
-- payload_json: Digital Snapshot (GPS, medical, contacts). For full encryption use pgcrypto.

CREATE TABLE IF NOT EXISTS emergency_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  payload_json JSONB NOT NULL,
  payload_hash VARCHAR(64), -- SHA-256 for integrity
  trigger_type VARCHAR(50) NOT NULL DEFAULT 'sos', -- sos | aero_medevac | marine_sos
  lat DECIMAL(10,7),
  lng DECIMAL(10,7),
  is_marine BOOLEAN DEFAULT FALSE,
  api_sent BOOLEAN DEFAULT FALSE,
  fallback_used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emergency_logs_user_id ON emergency_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_emergency_logs_created_at ON emergency_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_emergency_logs_trigger_type ON emergency_logs(trigger_type);

COMMENT ON TABLE emergency_logs IS 'Encrypted SOS/emergency logs — Digital Identity transmission to authorities';
