-- =================================================================================
-- 078: Security Anomalies — 5 ธงแดงมหาประลัย (High-Risk Triggers)
-- =================================================================================
-- Stores flagged events for anomalous behavior detection.
-- Risk Score > 80 → auto-suspend + log to system_event_log.
-- =================================================================================

CREATE TABLE IF NOT EXISTS security_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  anomaly_type VARCHAR(50) NOT NULL
    CHECK (anomaly_type IN (
      'identity_swap',      -- Password/phone change + withdrawal to new bank
      'first_timer_burst',  -- New account + high tx or 10 jobs in 1h
      'teleportation',      -- Login from 2 IPs far apart in <30 min
      'rapid_ledger',       -- 5+ wallet in/out in 1 min
      'night_owl'           -- Sensitive data edit 02:00-04:00
    )),
  risk_level VARCHAR(20) NOT NULL DEFAULT 'medium'
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  risk_score INT NOT NULL DEFAULT 0
    CHECK (risk_score >= 0 AND risk_score <= 100),
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  action_taken TEXT
);

CREATE INDEX IF NOT EXISTS idx_security_anomalies_user ON security_anomalies(user_id);
CREATE INDEX IF NOT EXISTS idx_security_anomalies_type ON security_anomalies(anomaly_type);
CREATE INDEX IF NOT EXISTS idx_security_anomalies_created ON security_anomalies(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_anomalies_unresolved ON security_anomalies(user_id) WHERE resolved_at IS NULL;

COMMENT ON TABLE security_anomalies IS '5 ธงแดง: identity_swap, first_timer_burst, teleportation, rapid_ledger, night_owl';

-- Track password/phone changes for Identity Swap detection (within 15 min of withdrawal)
CREATE TABLE IF NOT EXISTS security_identity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(30) NOT NULL CHECK (event_type IN ('password_change', 'phone_change')),
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_identity_events_user ON security_identity_events(user_id);
CREATE INDEX IF NOT EXISTS idx_security_identity_events_created ON security_identity_events(user_id, created_at DESC);

COMMENT ON TABLE security_identity_events IS 'Tracks password/phone changes for Identity Swap anomaly detection';

-- Add security_hold_until to payout_requests for 24h pending on Identity Swap
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS security_hold_until TIMESTAMPTZ;
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS anomaly_hold_reason TEXT;
COMMENT ON COLUMN payout_requests.security_hold_until IS 'Hold withdrawal 24h when Identity Swap detected';
