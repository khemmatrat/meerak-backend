-- P134, P135: localized + timezone-aware notifications.

CREATE TABLE IF NOT EXISTS commerce.notification_templates (
  id TEXT PRIMARY KEY,
  template_key TEXT NOT NULL,
  locale TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('push','email','sms','inapp')),
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,              -- ICU-style template
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (template_key, locale, channel)
);
INSERT INTO commerce.notification_templates (id, template_key, locale, channel, subject, body) VALUES
  ('nt-order-th','order_shipped','th-TH','push','','คำสั่งซื้อ {orderId} จัดส่งแล้ว ติดตามได้ที่ {tracking}'),
  ('nt-order-en','order_shipped','en-US','push','','Order {orderId} shipped. Track at {tracking}')
ON CONFLICT (template_key, locale, channel) DO NOTHING;

CREATE TABLE IF NOT EXISTS commerce.notifications (
  id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL,
  shard_key TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT 'TH',
  locale TEXT NOT NULL DEFAULT 'th-TH',
  timezone TEXT NOT NULL DEFAULT 'Asia/Bangkok',
  channel TEXT NOT NULL DEFAULT 'push',
  template_key TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  rendered TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','scheduled','sent','suppressed','failed')),
  consent_purpose TEXT NOT NULL DEFAULT 'transactional',
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON commerce.notifications (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_due ON commerce.notifications (status, scheduled_at)
  WHERE status = 'scheduled';

-- quiet-hours config per region (P134)
CREATE TABLE IF NOT EXISTS commerce.quiet_hours (
  region TEXT PRIMARY KEY,
  timezone TEXT NOT NULL DEFAULT 'Asia/Bangkok',
  start_hour INT NOT NULL DEFAULT 22,
  end_hour INT NOT NULL DEFAULT 8
);
INSERT INTO commerce.quiet_hours (region, timezone, start_hour, end_hour) VALUES
  ('TH','Asia/Bangkok',22,8),
  ('SEA','Asia/Singapore',22,8),
  ('US','America/New_York',21,9),
  ('EU','Europe/Berlin',22,8)
ON CONFLICT (region) DO NOTHING;

COMMENT ON TABLE commerce.notifications IS 'P135 localized notifications with quiet-hours + consent gating';
