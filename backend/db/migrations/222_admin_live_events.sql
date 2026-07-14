-- Admin live events — poll จากแอดมิน (VIP ซื้อใหม่, ฯลฯ) + เล่นเสียงแจ้งเตือน

CREATE TABLE IF NOT EXISTS admin_live_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(64) NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title VARCHAR(200) NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_live_events_created ON admin_live_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_live_events_type ON admin_live_events(event_type, created_at DESC);
