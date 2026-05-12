-- 091: Video Feed — Report และ Block
-- video_reports: แจ้งรายงานคลิป (spam, ไม่เหมาะสม ฯลฯ)
-- user_blocked_video_creators: บล็อก Talent ไม่ให้เห็นคลิปของเขาใน feed
CREATE TABLE IF NOT EXISTS video_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES talent_videos(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_blocked_video_creators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  talent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, talent_id)
);

CREATE INDEX IF NOT EXISTS idx_video_reports_video ON video_reports(video_id);
CREATE INDEX IF NOT EXISTS idx_video_reports_reporter ON video_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_user_blocked_video_user ON user_blocked_video_creators(user_id);
CREATE INDEX IF NOT EXISTS idx_user_blocked_video_talent ON user_blocked_video_creators(talent_id);

COMMENT ON TABLE video_reports IS 'แจ้งรายงานคลิปใน Video Feed';
COMMENT ON TABLE user_blocked_video_creators IS 'บล็อก Talent ไม่ให้เห็นคลิปของเขาใน feed';
