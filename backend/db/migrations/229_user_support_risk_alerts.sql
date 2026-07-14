-- 229: Support cases, reconcile alert dedupe log

CREATE TABLE IF NOT EXISTS user_support_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'pending', 'resolved', 'closed')),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  subject TEXT,
  opened_by TEXT,
  assigned_to TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_support_cases_user
  ON user_support_cases (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_support_cases_case_id
  ON user_support_cases (case_id);

COMMENT ON TABLE user_support_cases IS 'Formal support/ticket IDs tied to users for ops handoff';

CREATE TABLE IF NOT EXISTS reconcile_alert_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alert_key TEXT NOT NULL,
  variance NUMERIC(18, 2),
  webhook_url_kind TEXT,
  http_status INTEGER,
  response_snippet TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_reconcile_alert_dedupe
  ON reconcile_alert_log (user_id, alert_key);

COMMENT ON TABLE reconcile_alert_log IS 'Dedupe log for reconcile-fail Slack/Discord alerts';
