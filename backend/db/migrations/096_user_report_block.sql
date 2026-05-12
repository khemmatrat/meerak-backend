-- 096: Trust & Safety — Report / Block ผู้ใช้ (Job Board, Chat ฯลฯ)
-- user_reports: แจ้งรายงานผู้ใช้ (spam, พฤติกรรมไม่เหมาะสม ฯลฯ)
-- user_blocked_users: บล็อกผู้ใช้ (ไม่เห็นข้อความ/ไม่สามารถติดต่อได้)

CREATE TABLE IF NOT EXISTS user_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  context VARCHAR(50),  -- 'advance_job_chat', 'job_board', 'video', 'general'
  context_id UUID,      -- job_id, video_id ฯลฯ (ถ้ามี)
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_blocked_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, blocked_user_id),
  CHECK (user_id != blocked_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_reports_reporter ON user_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_reported ON user_reports(reported_user_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_context ON user_reports(context) WHERE context IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_blocked_users_user ON user_blocked_users(user_id);
CREATE INDEX IF NOT EXISTS idx_user_blocked_users_blocked ON user_blocked_users(blocked_user_id);

COMMENT ON TABLE user_reports IS 'แจ้งรายงานผู้ใช้ — ใช้ได้ทั้ง Job Board, Chat, Video ฯลฯ';
COMMENT ON TABLE user_blocked_users IS 'บล็อกผู้ใช้ — ไม่เห็นข้อความ/ไม่สามารถติดต่อได้';
