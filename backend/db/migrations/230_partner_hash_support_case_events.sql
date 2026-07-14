-- 230: Partner hash index + support case event history + reconcile email channel

ALTER TABLE users ADD COLUMN IF NOT EXISTS partner_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_users_partner_hash
  ON users (partner_hash)
  WHERE partner_hash IS NOT NULL;

COMMENT ON COLUMN users.partner_hash IS 'SHA256 partner lookup key (32 hex) when data_sharing_consent=true';

CREATE TABLE IF NOT EXISTS user_support_case_events (
  id BIGSERIAL PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES user_support_cases(case_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('opened', 'assigned', 'status_change', 'closed', 'comment', 'priority_change')),
  actor TEXT,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_case_events_case
  ON user_support_case_events (case_id, created_at DESC);

COMMENT ON TABLE user_support_case_events IS 'Audit trail for support case assign/close/status changes';

ALTER TABLE reconcile_alert_log ADD COLUMN IF NOT EXISTS email_status INTEGER;
ALTER TABLE reconcile_alert_log ADD COLUMN IF NOT EXISTS email_error TEXT;

-- partner_hash backfill runs via partnerHashService.backfillPartnerHashes() on backend startup
