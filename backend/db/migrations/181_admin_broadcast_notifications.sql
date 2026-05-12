-- ประวัติการ broadcast จากแอดมิน (เดิมเก็บใน memory เท่านั้น — รีสตาร์ทแล้วหาย)
CREATE TABLE IF NOT EXISTS admin_broadcast_notifications (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  target VARCHAR(20) NOT NULL DEFAULT 'All',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fcm_success INT NOT NULL DEFAULT 0,
  fcm_failed INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_admin_broadcast_sent_at ON admin_broadcast_notifications (sent_at DESC);

COMMENT ON TABLE admin_broadcast_notifications IS 'Admin Push Notifications tab — เก็บประวัติส่งข่าว (ไม่ใช่ in-memory)';
